import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Book 10 — a recurring schedule that produces report_runs (§Components:
// scheduled reports). The schedule MODEL and the "run due schedules" path are
// implemented; the actual timer that fires them is a documented hook, not a
// running cron — same honest boundary as the notification/webhook workers,
// which model the queue but leave the real dispatcher unwired in this
// deployment. `runDueSchedules()` is exposed so a cron or worker can call it.
//
// `cron` is a standard 5-field expression; `nextRunAt` is the precomputed next
// fire time so "what's due" is an indexed timestamp comparison rather than a
// cron parse across every row. `deliverTo` is a JSON-encoded list of channels
// (e.g. notification recipients) the finished export is sent to — wiring the
// actual delivery reuses the Notification Engine.
export const scheduledReportsTable = pgTable("scheduled_reports", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  reportDefinitionId: integer("report_definition_id").notNull(),
  name: text("name").notNull(),
  cron: text("cron").notNull(), // 5-field cron expression
  parameters: text("parameters"), // JSON-encoded parameter values passed to each run
  format: text("format").notNull().default("csv"), // json | csv
  deliverTo: text("deliver_to"), // JSON-encoded delivery targets
  enabled: boolean("enabled").notNull().default(true),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  createdByUserId: integer("created_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertScheduledReportSchema = createInsertSchema(scheduledReportsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertScheduledReport = z.infer<typeof insertScheduledReportSchema>;
export type ScheduledReport = typeof scheduledReportsTable.$inferSelect;
