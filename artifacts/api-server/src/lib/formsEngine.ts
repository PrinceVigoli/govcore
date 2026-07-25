import { eq, asc, and, inArray } from "drizzle-orm";
import {
  db,
  formSectionsTable,
  formFieldsTable,
  fieldValidationsTable,
  workflowDefinitionsTable,
  workflowStatesTable,
  workflowInstancesTable,
  workflowTasksTable,
  workflowHistoryTable,
  type Form,
  type FormVersion,
  type FormSection,
  type FormField,
  type FieldValidation,
  type FormSubmission,
} from "@workspace/db";
import { evaluateRules, type RuleDecision } from "./rulesEngine";
import { getLatestPublishedVersion as getLatestPublishedWorkflowVersion } from "./workflowEngine";

// ── Serialization ──────────────────────────────────────────────────────────
// Every date column is serialized to an ISO string so the wire shape matches
// the OpenAPI spec (`format: date-time`).

export function serializeForm(f: Form) {
  return { ...f, createdAt: f.createdAt.toISOString(), updatedAt: f.updatedAt.toISOString() };
}

export function serializeFormVersion(v: FormVersion) {
  return { ...v, publishedAt: v.publishedAt ? v.publishedAt.toISOString() : null, createdAt: v.createdAt.toISOString() };
}

export function serializeFormSubmission(s: FormSubmission) {
  return {
    ...s,
    submittedAt: s.submittedAt ? s.submittedAt.toISOString() : null,
    syncedAt: s.syncedAt ? s.syncedAt.toISOString() : null,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

// ── Metadata tree (Book 07 §6 Rendering Pipeline: Metadata -> Renderer) ────
// The frontend renderer never hardcodes layout; it walks this tree. Sections
// are grouped by `tab` (null tab = ungrouped) and each section carries its
// fields, each field carries its validations, in sortOrder throughout.

export interface FormFieldWithValidations extends FormField {
  validations: FieldValidation[];
}
export interface FormSectionWithFields extends FormSection {
  fields: FormFieldWithValidations[];
}

export async function getVersionTree(formVersionId: number): Promise<{
  sections: FormSectionWithFields[];
  fields: FormFieldWithValidations[]; // flat, for validation/lookup convenience
}> {
  const [sections, fields] = await Promise.all([
    db.select().from(formSectionsTable).where(eq(formSectionsTable.formVersionId, formVersionId)).orderBy(asc(formSectionsTable.sortOrder)),
    db.select().from(formFieldsTable).where(eq(formFieldsTable.formVersionId, formVersionId)).orderBy(asc(formFieldsTable.sortOrder)),
  ]);
  const fieldIds = fields.map((f) => f.id);
  const validations = fieldIds.length > 0
    ? await db.select().from(fieldValidationsTable).where(inArray(fieldValidationsTable.formFieldId, fieldIds))
    : [];

  const validationsByField = new Map<number, FieldValidation[]>();
  for (const row of validations) {
    const list = validationsByField.get(row.formFieldId) ?? [];
    list.push(row);
    validationsByField.set(row.formFieldId, list);
  }

  const fieldsWithValidations: FormFieldWithValidations[] = fields.map((f) => ({
    ...f,
    validations: (validationsByField.get(f.id) ?? []).sort((a, b) => a.sortOrder - b.sortOrder),
  }));

  const fieldsBySection = new Map<number, FormFieldWithValidations[]>();
  for (const f of fieldsWithValidations) {
    const list = fieldsBySection.get(f.sectionId) ?? [];
    list.push(f);
    fieldsBySection.set(f.sectionId, list);
  }

  return {
    sections: sections.map((s) => ({ ...s, fields: fieldsBySection.get(s.id) ?? [] })),
    fields: fieldsWithValidations,
  };
}

// ── Rules Integration (Book 07 §12) ────────────────────────────────────────
// Conditional visibility and calculated values are delegated to the Rules
// Engine (Book 06) rather than reimplemented here: one evaluateRules() call
// per submission covers every field's visibilityRuleCode/calculationRuleCode
// for that resourceType, keyed by rule `code`.

async function evaluateFieldRules(opts: {
  tenantId: number;
  module: string;
  resourceType: string;
  context: Record<string, unknown>;
}): Promise<Map<string, RuleDecision>> {
  const { decisions } = await evaluateRules(opts);
  return new Map(decisions.map((d) => [d.ruleCode, d]));
}

/**
 * Resolves which fields are currently visible given a values context. A field
 * with no visibilityRuleCode is always visible (unless statically `hidden`);
 * a field whose rule can't be found (e.g. not yet published) defaults to
 * visible, so a missing rule never silently locks a citizen out of a field.
 */
export async function resolveVisibleFields(
  fields: FormField[],
  opts: { tenantId: number; module: string; resourceType: string; context: Record<string, unknown> },
): Promise<Set<number>> {
  const codes = fields.map((f) => f.visibilityRuleCode).filter((c): c is string => !!c);
  const decisionByCode = codes.length > 0 ? await evaluateFieldRules(opts) : new Map<string, RuleDecision>();

  const visible = new Set<number>();
  for (const f of fields) {
    if (f.hidden) continue;
    if (!f.visibilityRuleCode) {
      visible.add(f.id);
      continue;
    }
    const decision = decisionByCode.get(f.visibilityRuleCode);
    if (!decision || decision.matched) visible.add(f.id);
  }
  return visible;
}

/**
 * Applies each field's calculationRuleCode: if the referenced rule matches,
 * the value from its first "calculate" or "set_field" action targeting this
 * field's key overwrites whatever the client submitted (§12 "Calculated
 * values").
 */
export async function applyCalculatedValues(
  fields: FormField[],
  values: Record<string, unknown>,
  opts: { tenantId: number; module: string; resourceType: string },
): Promise<Record<string, unknown>> {
  const codes = fields.map((f) => f.calculationRuleCode).filter((c): c is string => !!c);
  if (codes.length === 0) return values;

  const decisionByCode = await evaluateFieldRules({ ...opts, context: values });
  const result = { ...values };
  for (const f of fields) {
    if (!f.calculationRuleCode) continue;
    const decision = decisionByCode.get(f.calculationRuleCode);
    if (!decision?.matched) continue;
    const action = decision.actions.find((a) => (a.actionType === "calculate" || a.actionType === "set_field") && a.target === f.fieldKey);
    if (action && action.value != null) result[f.fieldKey] = action.value;
  }
  return result;
}

// ── Validation (Book 07 §7) ─────────────────────────────────────────────────

export interface ValidationError {
  fieldKey: string;
  validationType: string;
  message: string;
}

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
}

function parseConfig(config: string | null): Record<string, unknown> {
  if (!config) return {};
  try {
    return JSON.parse(config);
  } catch {
    return {};
  }
}

function compare(actual: unknown, operator: string, expected: unknown): boolean {
  switch (operator) {
    case "equals":
      return actual === expected;
    case "not_equals":
      return actual !== expected;
    case "greater_than":
      return typeof actual === "number" && typeof expected === "number" && actual > expected;
    case "greater_than_or_equal":
      return typeof actual === "number" && typeof expected === "number" && actual >= expected;
    case "less_than":
      return typeof actual === "number" && typeof expected === "number" && actual < expected;
    case "less_than_or_equal":
      return typeof actual === "number" && typeof expected === "number" && actual <= expected;
    default:
      return false;
  }
}

/**
 * Validates a submission's values against each visible field's validations.
 * Fields that resolved as not-currently-visible are skipped entirely (a
 * hidden field can't be required). `custom_rule` validations delegate to the
 * same rule-decision map used for visibility/calculation, so the whole
 * validation pass makes exactly one evaluateRules() call.
 */
export async function validateSubmission(
  fields: FormFieldWithValidations[],
  values: Record<string, unknown>,
  opts: { tenantId: number; module: string; resourceType: string },
): Promise<ValidationError[]> {
  const visibleIds = await resolveVisibleFields(fields, { ...opts, context: values });

  const customRuleCodes = fields
    .flatMap((f) => f.validations)
    .filter((v) => v.validationType === "custom_rule")
    .map((v) => parseConfig(v.config).ruleCode)
    .filter((c): c is string => typeof c === "string");
  const decisionByCode = customRuleCodes.length > 0 ? await evaluateFieldRules({ ...opts, context: values }) : new Map<string, RuleDecision>();

  const errors: ValidationError[] = [];

  for (const field of fields) {
    if (!visibleIds.has(field.id)) continue;
    const value = values[field.fieldKey];

    if (field.required && isEmpty(value)) {
      errors.push({ fieldKey: field.fieldKey, validationType: "required", message: `${field.label} is required` });
    }

    for (const validation of field.validations) {
      if (isEmpty(value) && validation.validationType !== "required") continue; // don't cascade errors onto an already-empty optional field
      const config = parseConfig(validation.config);

      switch (validation.validationType) {
        case "required":
          if (isEmpty(value)) errors.push({ fieldKey: field.fieldKey, validationType: "required", message: validation.errorMessage ?? `${field.label} is required` });
          break;
        case "min":
          if (typeof value === "number" && typeof config.value === "number" && value < config.value) {
            errors.push({ fieldKey: field.fieldKey, validationType: "min", message: validation.errorMessage ?? `${field.label} must be at least ${config.value}` });
          }
          break;
        case "max":
          if (typeof value === "number" && typeof config.value === "number" && value > config.value) {
            errors.push({ fieldKey: field.fieldKey, validationType: "max", message: validation.errorMessage ?? `${field.label} must be at most ${config.value}` });
          }
          break;
        case "range":
          if (typeof value === "number" && typeof config.min === "number" && typeof config.max === "number" && (value < config.min || value > config.max)) {
            errors.push({ fieldKey: field.fieldKey, validationType: "range", message: validation.errorMessage ?? `${field.label} must be between ${config.min} and ${config.max}` });
          }
          break;
        case "regex":
          if (typeof value === "string" && typeof config.pattern === "string") {
            const re = new RegExp(config.pattern, typeof config.flags === "string" ? config.flags : undefined);
            if (!re.test(value)) errors.push({ fieldKey: field.fieldKey, validationType: "regex", message: validation.errorMessage ?? `${field.label} is not in a valid format` });
          }
          break;
        case "cross_field": {
          const compareField = typeof config.compareField === "string" ? config.compareField : undefined;
          const operator = typeof config.operator === "string" ? config.operator : undefined;
          if (compareField && operator && !compare(value, operator, values[compareField])) {
            errors.push({ fieldKey: field.fieldKey, validationType: "cross_field", message: validation.errorMessage ?? `${field.label} is inconsistent with ${compareField}` });
          }
          break;
        }
        case "custom_rule": {
          const ruleCode = typeof config.ruleCode === "string" ? config.ruleCode : undefined;
          if (!ruleCode) break;
          const decision = decisionByCode.get(ruleCode);
          const denied = decision?.matched && decision.actions.some((a) => a.actionType === "deny");
          if (denied) errors.push({ fieldKey: field.fieldKey, validationType: "custom_rule", message: validation.errorMessage ?? `${field.label} failed rule "${ruleCode}"` });
          break;
        }
      }
    }
  }

  return errors;
}

// ── Workflow Integration (Book 07 §11) ─────────────────────────────────────
// "Citizen submits application -> Workflow Instance Created -> Approval
// Process Begins." Mirrors the instance-start logic in routes/workflowInstances.ts
// so a submitted form kicks off a workflow the same way a manually-started
// instance would.

export async function initiateWorkflowForSubmission(opts: {
  form: Form;
  submissionId: number;
  actorUserId?: number;
}): Promise<number | null> {
  if (!opts.form.workflowDefinitionId) return null;
  const [def] = await db.select().from(workflowDefinitionsTable).where(eq(workflowDefinitionsTable.id, opts.form.workflowDefinitionId));
  if (!def) return null;
  const version = await getLatestPublishedWorkflowVersion(def.id);
  if (!version) return null;
  const [initialState] = await db
    .select()
    .from(workflowStatesTable)
    .where(and(eq(workflowStatesTable.workflowVersionId, version.id), eq(workflowStatesTable.isInitial, true)));
  if (!initialState) return null;

  const instance = await db.transaction(async (tx) => {
    const [inst] = await tx
      .insert(workflowInstancesTable)
      .values({
        workflowVersionId: version.id,
        tenantId: def.tenantId,
        resourceType: def.resourceType,
        resourceId: String(opts.submissionId),
        currentStateId: initialState.id,
        status: "in_progress",
        initiatedBy: opts.actorUserId ?? null,
      })
      .returning();

    if (!initialState.isFinal) {
      await tx.insert(workflowTasksTable).values({
        workflowInstanceId: inst.id,
        stateId: initialState.id,
        assigneeUserId: null,
        assigneeRoleId: null,
        status: "pending",
      });
    }

    await tx.insert(workflowHistoryTable).values({
      workflowInstanceId: inst.id,
      transitionId: null,
      fromStateId: null,
      toStateId: initialState.id,
      actorUserId: opts.actorUserId ?? null,
      action: "started",
      comment: `Started by form submission #${opts.submissionId}`,
    });

    return inst;
  });

  return instance.id;
}
