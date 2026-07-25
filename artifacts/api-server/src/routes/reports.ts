import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import {
  db,
  reportDefinitionsTable,
  reportRunsTable,
  scheduledReportsTable,
} from "@workspace/db";
import {
  listSources,
  getSource,
  validateSpec,
  runReport,
  runReportCsv,
  publishDefinition,
  serializeDefinition,
  serializeRun,
  serializeSchedule,
  isValidCron,
  nextRunAfter,
  type ReportSpec,
} from "@workspace/report-engine";
import {
  ListReportDefinitionsQueryParams,
  CreateReportDefinitionBody,
  GetReportDefinitionParams,
  UpdateReportDefinitionParams,
  UpdateReportDefinitionBody,
  PublishReportDefinitionParams,
  RunReportDefinitionParams,
  RunReportDefinitionBody,
  ListReportRunsParams,
  PreviewReportBody,
  CreateScheduledReportBody,
  UpdateScheduledReportParams,
  UpdateScheduledReportBody,
  DeleteScheduledReportParams,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { logAudit } from "../lib/audit";
import type { JwtPayload } from "../lib/auth";

// Book 10 — Report Engine API. Reports are defined as data over a whitelisted
// data source; tenant scoping is enforced by the engine's compiler from the
// authenticated actor, never from anything in the request body.

const router = Router();

// ── Data sources ───────────────────────────────────────────────────────────

router.get("/report-sources", requireAuth, async (_req, res): Promise<void> => {
  // Surface only what a report builder needs: codes, labels, and column
  // metadata. Table/tenant-column internals stay in the engine.
  res.json(
    listSources().map((s) => ({
      code: s.code,
      label: s.label,
      columns: s.columns.map((c) => ({
        key: c.key,
        type: c.type,
        label: c.label,
        enumValues: c.enumValues ? [...c.enumValues] : undefined,
        filterable: c.filterable !== false,
        groupable: c.groupable === true,
      })),
    })),
  );
});

// ── Definitions ────────────────────────────────────────────────────────────

router.get("/report-definitions", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const q = ListReportDefinitionsQueryParams.safeParse(req.query);
  const conditions = [eq(reportDefinitionsTable.tenantId, actor.tenantId)];
  if (q.success && q.data.module) conditions.push(eq(reportDefinitionsTable.module, q.data.module));
  if (q.success && q.data.status) conditions.push(eq(reportDefinitionsTable.status, q.data.status));

  const rows = await db
    .select()
    .from(reportDefinitionsTable)
    .where(and(...conditions))
    .orderBy(reportDefinitionsTable.code, desc(reportDefinitionsTable.version));
  res.json(rows.map(serializeDefinition));
});

// Creates a new draft, auto-incrementing version within a code family (same
// versioning pattern as document/notification templates). The spec is
// validated against its source before anything is written — an unknown source
// or a column that isn't on it is a 400, not a saved-but-broken report.
router.post("/report-definitions", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const parsed = CreateReportDefinitionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (!getSource(parsed.data.sourceCode)) {
    res.status(400).json({ error: `Unknown data source "${parsed.data.sourceCode}"` });
    return;
  }
  const spec = parsed.data.spec as ReportSpec;
  const validation = validateSpec(parsed.data.sourceCode, spec);
  if (!validation.ok) {
    res.status(400).json({ error: "Invalid report spec", details: validation.errors });
    return;
  }

  const siblings = await db
    .select()
    .from(reportDefinitionsTable)
    .where(and(eq(reportDefinitionsTable.tenantId, actor.tenantId), eq(reportDefinitionsTable.code, parsed.data.code)));
  const nextVersion = siblings.length > 0 ? Math.max(...siblings.map((s) => s.version)) + 1 : 1;

  const [definition] = await db
    .insert(reportDefinitionsTable)
    .values({
      tenantId: actor.tenantId,
      name: parsed.data.name,
      code: parsed.data.code,
      description: parsed.data.description ?? null,
      module: parsed.data.module,
      sourceCode: parsed.data.sourceCode,
      version: nextVersion,
      spec: JSON.stringify(spec),
      status: "draft",
      createdByUserId: actor.userId,
    })
    .returning();

  await logAudit({ actor, action: "create", resource: "report_definition", resourceId: definition.id });
  res.status(201).json(serializeDefinition(definition));
});

router.get("/report-definitions/:id", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const params = GetReportDefinitionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [definition] = await db
    .select()
    .from(reportDefinitionsTable)
    .where(and(eq(reportDefinitionsTable.id, params.data.id), eq(reportDefinitionsTable.tenantId, actor.tenantId)));
  if (!definition) {
    res.status(404).json({ error: "Report definition not found" });
    return;
  }
  res.json(serializeDefinition(definition));
});

// Only drafts are editable — once active, a definition may have produced runs
// whose results were exported and acted on, so it's frozen and a new version
// is created instead (same rule as document/notification templates).
router.patch("/report-definitions/:id", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const params = UpdateReportDefinitionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateReportDefinitionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(reportDefinitionsTable)
    .where(and(eq(reportDefinitionsTable.id, params.data.id), eq(reportDefinitionsTable.tenantId, actor.tenantId)));
  if (!existing) {
    res.status(404).json({ error: "Report definition not found" });
    return;
  }
  if (existing.status !== "draft") {
    res.status(409).json({ error: "Only draft report definitions can be edited. Create a new version instead." });
    return;
  }

  // If the spec is being changed, re-validate against the (immutable) source.
  let specJson = existing.spec;
  if (parsed.data.spec !== undefined) {
    const validation = validateSpec(existing.sourceCode, parsed.data.spec as ReportSpec);
    if (!validation.ok) {
      res.status(400).json({ error: "Invalid report spec", details: validation.errors });
      return;
    }
    specJson = JSON.stringify(parsed.data.spec);
  }

  const [updated] = await db
    .update(reportDefinitionsTable)
    .set({
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
      ...(parsed.data.spec !== undefined ? { spec: specJson } : {}),
      ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
    })
    .where(eq(reportDefinitionsTable.id, params.data.id))
    .returning();

  await logAudit({ actor, action: "update", resource: "report_definition", resourceId: updated.id });
  res.json(serializeDefinition(updated));
});

router.post("/report-definitions/:id/publish", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const params = PublishReportDefinitionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [definition] = await db
    .select()
    .from(reportDefinitionsTable)
    .where(and(eq(reportDefinitionsTable.id, params.data.id), eq(reportDefinitionsTable.tenantId, actor.tenantId)));
  if (!definition) {
    res.status(404).json({ error: "Report definition not found" });
    return;
  }

  try {
    const activated = await publishDefinition(definition, actor.userId);
    await logAudit({ actor, action: "publish", resource: "report_definition", resourceId: activated.id });
    res.json(serializeDefinition(activated));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Could not publish" });
  }
});

// Runs the report. Records a report_runs row for the audit trail, then streams
// the rows back — as JSON, or as a CSV download when format=csv.
router.post("/report-definitions/:id/run", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const params = RunReportDefinitionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = RunReportDefinitionBody.safeParse(req.body ?? {});
  const format = body.success && body.data?.format === "csv" ? "csv" : "json";

  const [definition] = await db
    .select()
    .from(reportDefinitionsTable)
    .where(and(eq(reportDefinitionsTable.id, params.data.id), eq(reportDefinitionsTable.tenantId, actor.tenantId)));
  if (!definition) {
    res.status(404).json({ error: "Report definition not found" });
    return;
  }

  const spec = JSON.parse(definition.spec) as ReportSpec;
  const [run] = await db
    .insert(reportRunsTable)
    .values({
      tenantId: actor.tenantId,
      reportDefinitionId: definition.id,
      parameters: body.success && body.data?.parameters ? JSON.stringify(body.data.parameters) : null,
      status: "running",
      format,
      triggeredBy: "manual",
      runByUserId: actor.userId,
    })
    .returning();

  try {
    if (format === "csv") {
      const csv = await runReportCsv(definition.sourceCode, spec, actor.tenantId);
      const rowCount = csv ? csv.split("\r\n").length - 1 : 0;
      await db
        .update(reportRunsTable)
        .set({ status: "succeeded", rowCount, completedAt: new Date() })
        .where(eq(reportRunsTable.id, run.id));
      await logAudit({ actor, action: "run", resource: "report_definition", resourceId: definition.id, details: `csv, ${rowCount} rows` });
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${definition.code}.csv"`);
      res.send(csv);
      return;
    }

    const { rows, rowCount } = await runReport(definition.sourceCode, spec, actor.tenantId);
    await db
      .update(reportRunsTable)
      .set({ status: "succeeded", rowCount, completedAt: new Date() })
      .where(eq(reportRunsTable.id, run.id));
    await logAudit({ actor, action: "run", resource: "report_definition", resourceId: definition.id, details: `json, ${rowCount} rows` });

    const columns = spec.columns && spec.columns.length > 0 ? spec.columns : rows[0] ? Object.keys(rows[0]) : [];
    res.json({ runId: run.id, rowCount, columns, rows });
  } catch (err) {
    await db
      .update(reportRunsTable)
      .set({ status: "failed", error: err instanceof Error ? err.message : "Unknown error", completedAt: new Date() })
      .where(eq(reportRunsTable.id, run.id));
    res.status(400).json({ error: err instanceof Error ? err.message : "Report run failed" });
  }
});

router.get("/report-definitions/:id/runs", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const params = ListReportRunsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const runs = await db
    .select()
    .from(reportRunsTable)
    .where(and(eq(reportRunsTable.reportDefinitionId, params.data.id), eq(reportRunsTable.tenantId, actor.tenantId)))
    .orderBy(desc(reportRunsTable.startedAt))
    .limit(100);
  res.json(runs.map(serializeRun));
});

// ── Live preview (report builder) ────────────────────────────────────────

// Validates an unsaved spec and, if valid, returns a bounded row sample so the
// builder UI can show results as the user edits. No run is recorded — this is a
// dry run, capped small regardless of the spec's own limit.
router.post("/report-preview", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const parsed = PreviewReportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const validation = validateSpec(parsed.data.sourceCode, parsed.data.spec as ReportSpec);
  if (!validation.ok) {
    res.json({ valid: false, errors: validation.errors });
    return;
  }

  const previewSpec: ReportSpec = { ...(parsed.data.spec as ReportSpec), limit: 25 };
  try {
    const { rows } = await runReport(parsed.data.sourceCode, previewSpec, actor.tenantId);
    const columns = previewSpec.columns && previewSpec.columns.length > 0 ? previewSpec.columns : rows[0] ? Object.keys(rows[0]) : [];
    res.json({ valid: true, errors: [], columns, rows });
  } catch (err) {
    res.json({ valid: false, errors: [err instanceof Error ? err.message : "Preview failed"] });
  }
});

// ── Scheduled reports ──────────────────────────────────────────────────────

router.get("/scheduled-reports", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const rows = await db
    .select()
    .from(scheduledReportsTable)
    .where(eq(scheduledReportsTable.tenantId, actor.tenantId))
    .orderBy(desc(scheduledReportsTable.createdAt));
  res.json(rows.map(serializeSchedule));
});

router.post("/scheduled-reports", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const parsed = CreateScheduledReportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!isValidCron(parsed.data.cron)) {
    res.status(400).json({ error: `Invalid cron expression "${parsed.data.cron}"` });
    return;
  }

  // The definition must exist and belong to the caller's tenant.
  const [definition] = await db
    .select()
    .from(reportDefinitionsTable)
    .where(and(eq(reportDefinitionsTable.id, parsed.data.reportDefinitionId), eq(reportDefinitionsTable.tenantId, actor.tenantId)));
  if (!definition) {
    res.status(400).json({ error: "Report definition not found for this tenant" });
    return;
  }

  const [schedule] = await db
    .insert(scheduledReportsTable)
    .values({
      tenantId: actor.tenantId,
      reportDefinitionId: parsed.data.reportDefinitionId,
      name: parsed.data.name,
      cron: parsed.data.cron,
      parameters: parsed.data.parameters ? JSON.stringify(parsed.data.parameters) : null,
      format: parsed.data.format ?? "csv",
      deliverTo: parsed.data.deliverTo ? JSON.stringify(parsed.data.deliverTo) : null,
      enabled: true,
      nextRunAt: nextRunAfter(parsed.data.cron, new Date()),
      createdByUserId: actor.userId,
    })
    .returning();

  await logAudit({ actor, action: "create", resource: "scheduled_report", resourceId: schedule.id });
  res.status(201).json(serializeSchedule(schedule));
});

router.patch("/scheduled-reports/:id", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const params = UpdateScheduledReportParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateScheduledReportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (parsed.data.cron !== undefined && !isValidCron(parsed.data.cron)) {
    res.status(400).json({ error: `Invalid cron expression "${parsed.data.cron}"` });
    return;
  }

  const [existing] = await db
    .select()
    .from(scheduledReportsTable)
    .where(and(eq(scheduledReportsTable.id, params.data.id), eq(scheduledReportsTable.tenantId, actor.tenantId)));
  if (!existing) {
    res.status(404).json({ error: "Scheduled report not found" });
    return;
  }

  // Changing the cron recomputes the next fire time; re-enabling a schedule
  // also needs a fresh nextRunAt so it doesn't sit dormant.
  const cronChanged = parsed.data.cron !== undefined && parsed.data.cron !== existing.cron;
  const reEnabled = parsed.data.enabled === true && !existing.enabled;
  const nextRunAt =
    cronChanged || reEnabled ? nextRunAfter(parsed.data.cron ?? existing.cron, new Date()) : existing.nextRunAt;

  const [updated] = await db
    .update(scheduledReportsTable)
    .set({
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.cron !== undefined ? { cron: parsed.data.cron } : {}),
      ...(parsed.data.enabled !== undefined ? { enabled: parsed.data.enabled } : {}),
      ...(parsed.data.format !== undefined ? { format: parsed.data.format } : {}),
      nextRunAt,
    })
    .where(eq(scheduledReportsTable.id, params.data.id))
    .returning();

  await logAudit({ actor, action: "update", resource: "scheduled_report", resourceId: updated.id });
  res.json(serializeSchedule(updated));
});

router.delete("/scheduled-reports/:id", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const params = DeleteScheduledReportParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [deleted] = await db
    .delete(scheduledReportsTable)
    .where(and(eq(scheduledReportsTable.id, params.data.id), eq(scheduledReportsTable.tenantId, actor.tenantId)))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Scheduled report not found" });
    return;
  }
  await logAudit({ actor, action: "delete", resource: "scheduled_report", resourceId: params.data.id });
  res.status(204).send();
});

export default router;
