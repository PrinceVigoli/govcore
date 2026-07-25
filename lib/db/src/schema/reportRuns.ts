import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Book 10 — one execution of a report. The auditable record the spec's
// "Auditable" design goal calls for: who ran what, with which parameters,
// against which version, how many rows it returned, and whether it succeeded.
//
// Results themselves are NOT stored here — a report over 4,000 farmer records
// would bloat the row and duplicate data that can be regenerated. The run
// records the parameters and outcome; the rows are streamed to the caller (or
// an export) at run time. `rowCount` is kept for the audit trail and for
// showing history without re-running.
//
// `triggeredBy` distinguishes a person clicking "Run" from a schedule firing
// (Book 10 §Components: scheduled reports), so the history reads correctly.
export const reportRunsTable = pgTable("report_runs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  reportDefinitionId: integer("report_definition_id").notNull(),
  reportVersionId: integer("report_version_id"), // Null for ad-hoc runs of an unpublished draft
  scheduledReportId: integer("scheduled_report_id"), // Set when a schedule produced this run
  parameters: text("parameters"), // JSON-encoded runtime parameter values
  status: text("status").notNull().default("pending"), // pending | running | succeeded | failed
  rowCount: integer("row_count"),
  format: text("format").notNull().default("json"), // json | csv
  error: text("error"),
  triggeredBy: text("triggered_by").notNull().default("manual"), // manual | schedule
  runByUserId: integer("run_by_user_id"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const insertReportRunSchema = createInsertSchema(reportRunsTable).omit({ id: true, startedAt: true });
export type InsertReportRun = z.infer<typeof insertReportRunSchema>;
export type ReportRun = typeof reportRunsTable.$inferSelect;
