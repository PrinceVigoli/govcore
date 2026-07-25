import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Book 06 — Rules Engine: the definition-level record. Actual condition/action
// logic lives on versioned rows (see ruleVersions.ts) so a rule can move
// through Draft → Testing → Published → Active → Deprecated → Archived
// without ever mutating logic that's already live (ADR-0011).
export const rulesTable = pgTable("rules", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  name: text("name").notNull(),
  code: text("code").notNull(),
  description: text("description"),
  module: text("module").notNull(), // Owning module, e.g. "agriculture", "permits"
  ruleType: text("rule_type").notNull(), // validation | eligibility | approval | calculation | notification | routing | security | compliance
  resourceType: text("resource_type").notNull(), // The kind of business record this rule evaluates (e.g. "permit_application")
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertRuleSchema = createInsertSchema(rulesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRule = z.infer<typeof insertRuleSchema>;
export type Rule = typeof rulesTable.$inferSelect;
