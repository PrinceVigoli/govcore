import { Router } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { db, formsTable, formVersionsTable, formSubmissionsTable, submissionValuesTable, formFieldsTable } from "@workspace/db";
import {
  CreateFormSubmissionBody,
  GetFormSubmissionParams,
  ListFormSubmissionsQueryParams,
  SyncFormSubmissionParams,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { logAudit } from "../lib/audit";
import type { JwtPayload } from "../lib/auth";
import { serializeFormSubmission, getVersionTree, applyCalculatedValues, validateSubmission, initiateWorkflowForSubmission } from "../lib/formsEngine";

const router = Router();

router.get("/form-submissions", requireAuth, async (req, res): Promise<void> => {
  const q = ListFormSubmissionsQueryParams.safeParse(req.query);
  const conditions = [];
  if (q.success && q.data.tenantId) conditions.push(eq(formSubmissionsTable.tenantId, q.data.tenantId));
  if (q.success && q.data.formVersionId) conditions.push(eq(formSubmissionsTable.formVersionId, q.data.formVersionId));
  if (q.success && q.data.status) conditions.push(eq(formSubmissionsTable.status, q.data.status));
  const submissions = conditions.length > 0
    ? await db.select().from(formSubmissionsTable).where(and(...conditions)).orderBy(formSubmissionsTable.createdAt)
    : await db.select().from(formSubmissionsTable).orderBy(formSubmissionsTable.createdAt);
  res.json(submissions.map(serializeFormSubmission));
});

// Intake for both online submissions and the "push after reconnecting" step
// of an offline flow (Book 07 §13). status: "draft" skips validation/
// calculation/workflow entirely (a citizen's in-progress answers, saved for
// later); status: "submitted" (the default) runs the full pipeline —
// calculated fields, then validation, then, if the form has a
// workflowDefinitionId, a workflow instance (§11).
router.post("/form-submissions", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const parsed = CreateFormSubmissionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [version] = await db.select().from(formVersionsTable).where(eq(formVersionsTable.id, parsed.data.formVersionId));
  if (!version) {
    res.status(404).json({ error: "Form version not found" });
    return;
  }
  const [form] = await db.select().from(formsTable).where(eq(formsTable.id, version.formId));
  if (!form) {
    res.status(404).json({ error: "Form not found" });
    return;
  }

  const status = parsed.data.status ?? "submitted";
  let values = parsed.data.values;
  const { fields } = await getVersionTree(version.id);

  if (status === "submitted") {
    values = await applyCalculatedValues(fields, values, { tenantId: form.tenantId, module: form.module, resourceType: form.resourceType });
    const errors = await validateSubmission(fields, values, { tenantId: form.tenantId, module: form.module, resourceType: form.resourceType });
    if (errors.length > 0) {
      res.status(400).json({ error: "Validation failed", errors });
      return;
    }
  }

  const fieldKeyToId = new Map(fields.map((f) => [f.fieldKey, f.id]));

  const submission = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(formSubmissionsTable)
      .values({
        formVersionId: version.id,
        tenantId: form.tenantId,
        submittedByUserId: actor?.userId ?? null,
        status,
        submittedAt: status === "submitted" ? new Date() : null,
      })
      .returning();

    for (const [fieldKey, value] of Object.entries(values)) {
      const formFieldId = fieldKeyToId.get(fieldKey);
      if (!formFieldId) continue; // ignore values for keys not on this version
      await tx.insert(submissionValuesTable).values({
        formSubmissionId: row.id,
        formFieldId,
        value: JSON.stringify(value),
      });
    }

    return row;
  });

  let workflowInstanceId: number | null = null;
  if (status === "submitted" && form.workflowDefinitionId) {
    workflowInstanceId = await initiateWorkflowForSubmission({ form, submissionId: submission.id, actorUserId: actor?.userId });
    if (workflowInstanceId) {
      await db.update(formSubmissionsTable).set({ workflowInstanceId }).where(eq(formSubmissionsTable.id, submission.id));
    }
  }

  await logAudit({ actor, action: status === "draft" ? "save_draft" : "submit", resource: "form_submission", resourceId: submission.id });
  res.status(201).json({ ...serializeFormSubmission(submission), workflowInstanceId, values });
});

router.get("/form-submissions/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetFormSubmissionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [submission] = await db.select().from(formSubmissionsTable).where(eq(formSubmissionsTable.id, params.data.id));
  if (!submission) {
    res.status(404).json({ error: "Form submission not found" });
    return;
  }

  const valueRows = await db.select().from(submissionValuesTable).where(eq(submissionValuesTable.formSubmissionId, submission.id));
  const fieldIds = valueRows.map((v) => v.formFieldId);
  const fieldRows = fieldIds.length > 0 ? await db.select().from(formFieldsTable).where(inArray(formFieldsTable.id, fieldIds)) : [];
  const fieldKeyById = new Map(fieldRows.map((f) => [f.id, f.fieldKey]));

  const values: Record<string, unknown> = {};
  for (const v of valueRows) {
    const key = fieldKeyById.get(v.formFieldId);
    if (!key) continue;
    try {
      values[key] = JSON.parse(v.value);
    } catch {
      values[key] = v.value;
    }
  }

  res.json({ ...serializeFormSubmission(submission), values });
});

// Acknowledges that a draft saved while offline has now been durably
// received by the server (Book 07 §13 sequence diagram: "Cloud-->>Node:
// Acknowledged"). Left deliberately lightweight — no re-validation — since a
// draft is allowed to be incomplete by definition.
router.post("/form-submissions/:id/sync", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const params = SyncFormSubmissionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [submission] = await db.select().from(formSubmissionsTable).where(eq(formSubmissionsTable.id, params.data.id));
  if (!submission) {
    res.status(404).json({ error: "Form submission not found" });
    return;
  }
  const [updated] = await db
    .update(formSubmissionsTable)
    .set({ status: "synced", syncedAt: new Date() })
    .where(eq(formSubmissionsTable.id, submission.id))
    .returning();

  await logAudit({ actor, action: "sync", resource: "form_submission", resourceId: submission.id });
  res.json(serializeFormSubmission(updated));
});

export default router;
