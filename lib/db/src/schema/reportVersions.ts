import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Book 10 — an immutable snapshot of a report definition's spec at publish
// time (same pattern as document_versions / rule_versions). Publishing a draft
// appends a version and demotes the previously-active one in the same
// transaction; a report_run references the version it executed, so re-running
// or auditing a past export reproduces exactly the columns and filters that
// were in effect then, even after the definition is later revised.
export const reportVersionsTable = pgTable("report_versions", {
  id: serial("id").primaryKey(),
  reportDefinitionId: integer("report_definition_id").notNull(),
  version: integer("version").notNull(),
  sourceCode: text("source_code").notNull(), // Copied from the definition so the snapshot is self-contained
  spec: text("spec").notNull(), // JSON-encoded ReportSpec, frozen
  publishedByUserId: integer("published_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertReportVersionSchema = createInsertSchema(reportVersionsTable).omit({ id: true, createdAt: true });
export type InsertReportVersion = z.infer<typeof insertReportVersionSchema>;
export type ReportVersion = typeof reportVersionsTable.$inferSelect;
