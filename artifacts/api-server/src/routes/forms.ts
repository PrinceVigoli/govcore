import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, formsTable, formVersionsTable, formSectionsTable, formFieldsTable, fieldValidationsTable } from "@workspace/db";
import {
  CreateFormBody,
  UpdateFormBody,
  GetFormParams,
  UpdateFormParams,
  DeleteFormParams,
  CreateFormVersionParams,
  CreateFormVersionBody,
  ListFormsQueryParams,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { logAudit } from "../lib/audit";
import type { JwtPayload } from "../lib/auth";
import { serializeForm, serializeFormVersion } from "../lib/formsEngine";

const router = Router();

router.get("/forms", requireAuth, async (req, res): Promise<void> => {
  const q = ListFormsQueryParams.safeParse(req.query);
  const conditions = [];
  if (q.success && q.data.tenantId) conditions.push(eq(formsTable.tenantId, q.data.tenantId));
  if (q.success && q.data.module) conditions.push(eq(formsTable.module, q.data.module));
  if (q.success && q.data.resourceType) conditions.push(eq(formsTable.resourceType, q.data.resourceType));
  const forms = conditions.length > 0
    ? await db.select().from(formsTable).where(and(...conditions)).orderBy(formsTable.name)
    : await db.select().from(formsTable).orderBy(formsTable.name);
  res.json(forms.map(serializeForm));
});

router.post("/forms", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const parsed = CreateFormBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [form] = await db.insert(formsTable).values(parsed.data).returning();
  await logAudit({ actor, action: "create", resource: "form", resourceId: form.id });
  res.status(201).json(serializeForm(form));
});

router.get("/forms/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetFormParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [form] = await db.select().from(formsTable).where(eq(formsTable.id, params.data.id));
  if (!form) {
    res.status(404).json({ error: "Form not found" });
    return;
  }
  const versions = await db.select().from(formVersionsTable).where(eq(formVersionsTable.formId, form.id)).orderBy(formVersionsTable.version);
  res.json({ ...serializeForm(form), versions: versions.map(serializeFormVersion) });
});

router.patch("/forms/:id", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const params = UpdateFormParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateFormBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [form] = await db.update(formsTable).set(parsed.data).where(eq(formsTable.id, params.data.id)).returning();
  if (!form) {
    res.status(404).json({ error: "Form not found" });
    return;
  }
  await logAudit({ actor, action: "update", resource: "form", resourceId: form.id });
  res.json(serializeForm(form));
});

router.delete("/forms/:id", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const params = DeleteFormParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [form] = await db.delete(formsTable).where(eq(formsTable.id, params.data.id)).returning();
  if (!form) {
    res.status(404).json({ error: "Form not found" });
    return;
  }
  await logAudit({ actor, action: "delete", resource: "form", resourceId: params.data.id });
  res.sendStatus(204);
});

// Create a new draft version: a client-authored tree of sections -> fields ->
// validations. Sections/fields carry a temporary `key` used only within this
// request so fields/validations can reference their parent section/field
// before real row ids exist (same pattern as rule version creation).
router.post("/forms/:id/versions", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const params = CreateFormVersionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = CreateFormVersionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [form] = await db.select().from(formsTable).where(eq(formsTable.id, params.data.id));
  if (!form) {
    res.status(404).json({ error: "Form not found" });
    return;
  }

  const sectionKeys = parsed.data.sections.map((s) => s.key);
  if (new Set(sectionKeys).size !== sectionKeys.length) {
    res.status(400).json({ error: "Section keys must be unique within a version" });
    return;
  }
  const fieldKeysInRequest = parsed.data.fields.map((f) => f.fieldKey);
  if (new Set(fieldKeysInRequest).size !== fieldKeysInRequest.length) {
    res.status(400).json({ error: "Field keys must be unique within a version" });
    return;
  }
  for (const f of parsed.data.fields) {
    if (!sectionKeys.includes(f.sectionKey)) {
      res.status(400).json({ error: `Field "${f.fieldKey}" references an unknown sectionKey` });
      return;
    }
  }
  for (const v of parsed.data.validations) {
    if (!fieldKeysInRequest.includes(v.fieldKey)) {
      res.status(400).json({ error: `Validation of type "${v.validationType}" references an unknown fieldKey` });
      return;
    }
  }

  const result = await db.transaction(async (tx) => {
    const allVersions = await tx.select().from(formVersionsTable).where(eq(formVersionsTable.formId, form.id));
    const nextVersion = allVersions.length > 0 ? Math.max(...allVersions.map((v) => v.version)) + 1 : 1;

    const [version] = await tx
      .insert(formVersionsTable)
      .values({
        formId: form.id,
        version: nextVersion,
        status: "draft",
        locale: parsed.data.locale ?? "en",
      })
      .returning();

    const sectionKeyToId = new Map<string, number>();
    const insertedSections = [];
    for (const s of parsed.data.sections) {
      const [row] = await tx
        .insert(formSectionsTable)
        .values({
          formVersionId: version.id,
          tab: s.tab ?? null,
          title: s.title,
          description: s.description ?? null,
          sortOrder: s.sortOrder ?? 0,
        })
        .returning();
      sectionKeyToId.set(s.key, row.id);
      insertedSections.push(row);
    }

    const fieldKeyToId = new Map<string, number>();
    const insertedFields = [];
    for (const f of parsed.data.fields) {
      const [row] = await tx
        .insert(formFieldsTable)
        .values({
          formVersionId: version.id,
          sectionId: sectionKeyToId.get(f.sectionKey)!,
          fieldKey: f.fieldKey,
          label: f.label,
          fieldType: f.fieldType,
          helpText: f.helpText ?? null,
          placeholder: f.placeholder ?? null,
          defaultValue: f.defaultValue !== undefined ? JSON.stringify(f.defaultValue) : null,
          options: f.options ? JSON.stringify(f.options) : null,
          required: f.required ?? false,
          readOnly: f.readOnly ?? false,
          hidden: f.hidden ?? false,
          visibilityRuleCode: f.visibilityRuleCode ?? null,
          calculationRuleCode: f.calculationRuleCode ?? null,
          sortOrder: f.sortOrder ?? 0,
        })
        .returning();
      fieldKeyToId.set(f.fieldKey, row.id);
      insertedFields.push(row);
    }

    const insertedValidations = [];
    for (const v of parsed.data.validations) {
      const [row] = await tx
        .insert(fieldValidationsTable)
        .values({
          formFieldId: fieldKeyToId.get(v.fieldKey)!,
          validationType: v.validationType,
          config: v.config !== undefined ? JSON.stringify(v.config) : null,
          errorMessage: v.errorMessage ?? null,
          sortOrder: v.sortOrder ?? 0,
        })
        .returning();
      insertedValidations.push(row);
    }

    return { version, sections: insertedSections, fields: insertedFields, validations: insertedValidations };
  });

  await logAudit({ actor, action: "create_version", resource: "form", resourceId: form.id });
  res.status(201).json({
    ...serializeFormVersion(result.version),
    sections: result.sections,
    fields: result.fields,
    validations: result.validations,
  });
});

export default router;
