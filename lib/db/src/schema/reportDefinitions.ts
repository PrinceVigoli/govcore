import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Book 10 — Report Engine: a report defined as data, not code (ADR "metadata
// over hardcoding", "configuration over customization"). Versioned with the
// same definition/version split used by document and notification templates —
// a code family holds many rows, one per version, only one active at a time,
// and a run records the exact version it executed so an old export can be
// explained by the config that produced it.
//
// `sourceCode` names an entry in the report engine's whitelisted data-source
// catalog (see lib/report-engine/sources.ts). Reports never reference tables
// or columns directly (ADR "whitelisted sources"): a definition can only pick
// a curated source and the columns that source exposes, which is what keeps
// tenant isolation enforceable and the query surface injection-free.
//
// `spec` is the JSON-encoded ReportSpec — selected columns, filters, sort,
// grouping — validated against the chosen source at save time and again at run
// time. Kept as JSON-in-text, the same convention as rule_conditions.value and
// submission_values.value, so one column holds an arbitrarily-shaped config.
export const reportDefinitionsTable = pgTable("report_definitions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  name: text("name").notNull(),
  code: text("code").notNull(), // Stable identifier modules/schedules reference, e.g. "FARMERS_BY_MUNICIPALITY"
  description: text("description"),
  module: text("module").notNull(),
  sourceCode: text("source_code").notNull(), // Whitelisted data source, e.g. "farmers"
  version: integer("version").notNull().default(1),
  spec: text("spec").notNull(), // JSON-encoded ReportSpec
  status: text("status").notNull().default("draft"), // draft | active | deprecated | archived
  createdByUserId: integer("created_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertReportDefinitionSchema = createInsertSchema(reportDefinitionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertReportDefinition = z.infer<typeof insertReportDefinitionSchema>;
export type ReportDefinition = typeof reportDefinitionsTable.$inferSelect;
