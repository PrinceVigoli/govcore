// Book 10 — the service layer: the DB-touching orchestration that sits on top
// of the pure compiler/csv/schedule cores. Serializers, template resolution,
// running a report against the pool, and the schedule-run entry point.

import { eq, and, desc } from "drizzle-orm";
import {
  db,
  pool,
  reportDefinitionsTable,
  reportVersionsTable,
  reportRunsTable,
  scheduledReportsTable,
  type ReportDefinition,
  type ReportVersion,
  type ReportRun,
  type ScheduledReport,
} from "@workspace/db";
import { compileQuery, validateSpec, type ReportSpec } from "./compiler";
import { rowsToCsv } from "./csv";
import { nextRunAfter } from "./schedule";

// ── Serializers ──────────────────────────────────────────────────────────

export function serializeDefinition(d: ReportDefinition) {
  return { ...d, createdAt: d.createdAt.toISOString(), updatedAt: d.updatedAt.toISOString() };
}
export function serializeVersion(v: ReportVersion) {
  return { ...v, createdAt: v.createdAt.toISOString() };
}
export function serializeRun(r: ReportRun) {
  return {
    ...r,
    startedAt: r.startedAt.toISOString(),
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
  };
}
export function serializeSchedule(s: ScheduledReport) {
  return {
    ...s,
    nextRunAt: s.nextRunAt ? s.nextRunAt.toISOString() : null,
    lastRunAt: s.lastRunAt ? s.lastRunAt.toISOString() : null,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

// ── Running a report ───────────────────────────────────────────────────────

export interface RunResult {
  rows: Record<string, unknown>[];
  rowCount: number;
}

/**
 * Compiles and executes a report spec for a tenant, returning the rows. The
 * compiler guarantees the SQL is parameterized and tenant-scoped; this runs it
 * through the node-postgres pool with the bound params — user-supplied filter
 * values never touch the SQL string.
 */
export async function runReport(sourceCode: string, spec: ReportSpec, tenantId: number): Promise<RunResult> {
  const { sql, params } = compileQuery(sourceCode, spec, tenantId);
  const result = await pool.query(sql, params);
  return { rows: result.rows as Record<string, unknown>[], rowCount: result.rowCount ?? result.rows.length };
}

/** Runs a report and serializes to CSV. */
export async function runReportCsv(sourceCode: string, spec: ReportSpec, tenantId: number): Promise<string> {
  const { rows } = await runReport(sourceCode, spec, tenantId);
  return rowsToCsv(rows);
}

// ── Definitions & versioning ───────────────────────────────────────────────

export async function resolveActiveDefinition(tenantId: number, code: string): Promise<ReportDefinition | null> {
  const [row] = await db
    .select()
    .from(reportDefinitionsTable)
    .where(
      and(
        eq(reportDefinitionsTable.tenantId, tenantId),
        eq(reportDefinitionsTable.code, code),
        eq(reportDefinitionsTable.status, "active"),
      ),
    )
    .orderBy(desc(reportDefinitionsTable.version))
    .limit(1);
  return row ?? null;
}

/**
 * Publishes a draft: validates its spec against its source one last time,
 * snapshots it into report_versions, activates it, and demotes the previously
 * active version for the same code — all in one transaction, matching how
 * document/notification templates publish.
 */
export async function publishDefinition(definition: ReportDefinition, userId: number | null): Promise<ReportDefinition> {
  const spec = JSON.parse(definition.spec) as ReportSpec;
  const validation = validateSpec(definition.sourceCode, spec);
  if (!validation.ok) {
    throw new Error(`Cannot publish a report with an invalid spec: ${validation.errors.join("; ")}`);
  }

  return db.transaction(async (tx) => {
    await tx
      .update(reportDefinitionsTable)
      .set({ status: "deprecated" })
      .where(
        and(
          eq(reportDefinitionsTable.tenantId, definition.tenantId),
          eq(reportDefinitionsTable.code, definition.code),
          eq(reportDefinitionsTable.status, "active"),
        ),
      );

    await tx.insert(reportVersionsTable).values({
      reportDefinitionId: definition.id,
      version: definition.version,
      sourceCode: definition.sourceCode,
      spec: definition.spec,
      publishedByUserId: userId,
    });

    const [activated] = await tx
      .update(reportDefinitionsTable)
      .set({ status: "active" })
      .where(eq(reportDefinitionsTable.id, definition.id))
      .returning();
    return activated;
  });
}

// ── Scheduling ───────────────────────────────────────────────────────────

/**
 * Runs every due schedule for a tenant (or all tenants when tenantId is
 * omitted) and advances each one's nextRunAt. This is the entry point a cron or
 * background worker calls — the timer itself is not part of this deployment
 * (see schedule.ts header). Returns a per-schedule summary.
 *
 * Each schedule's run is recorded in report_runs with triggeredBy="schedule",
 * so the history distinguishes automated from manual executions.
 */
export async function runDueSchedules(now: Date, tenantId?: number): Promise<{ scheduleId: number; runId: number | null; ok: boolean; error?: string }[]> {
  const conditions = [eq(scheduledReportsTable.enabled, true)];
  if (tenantId !== undefined) conditions.push(eq(scheduledReportsTable.tenantId, tenantId));

  const schedules = await db.select().from(scheduledReportsTable).where(and(...conditions));
  const due = schedules.filter((s) => s.nextRunAt !== null && s.nextRunAt.getTime() <= now.getTime());

  const results: { scheduleId: number; runId: number | null; ok: boolean; error?: string }[] = [];

  for (const schedule of due) {
    const definition = await db
      .select()
      .from(reportDefinitionsTable)
      .where(eq(reportDefinitionsTable.id, schedule.reportDefinitionId))
      .limit(1)
      .then((r) => r[0]);

    let runId: number | null = null;
    try {
      if (!definition) throw new Error("Report definition no longer exists");
      const spec = JSON.parse(definition.spec) as ReportSpec;
      const params = schedule.parameters ? (JSON.parse(schedule.parameters) as Record<string, unknown>) : {};

      const [run] = await db
        .insert(reportRunsTable)
        .values({
          tenantId: schedule.tenantId,
          reportDefinitionId: definition.id,
          scheduledReportId: schedule.id,
          parameters: JSON.stringify(params),
          status: "running",
          format: schedule.format,
          triggeredBy: "schedule",
        })
        .returning();
      runId = run.id;

      const { rowCount } = await runReport(definition.sourceCode, spec, schedule.tenantId);

      await db
        .update(reportRunsTable)
        .set({ status: "succeeded", rowCount, completedAt: new Date() })
        .where(eq(reportRunsTable.id, run.id));

      results.push({ scheduleId: schedule.id, runId, ok: true });
    } catch (err) {
      if (runId !== null) {
        await db
          .update(reportRunsTable)
          .set({ status: "failed", error: err instanceof Error ? err.message : "Unknown error", completedAt: new Date() })
          .where(eq(reportRunsTable.id, runId));
      }
      results.push({ scheduleId: schedule.id, runId, ok: false, error: err instanceof Error ? err.message : "Unknown error" });
    }

    // Advance the schedule regardless of run outcome — a failing report
    // shouldn't wedge the schedule on the same due time forever.
    const next = nextRunAfter(schedule.cron, now);
    await db
      .update(scheduledReportsTable)
      .set({ lastRunAt: now, nextRunAt: next })
      .where(eq(scheduledReportsTable.id, schedule.id));
  }

  return results;
}
