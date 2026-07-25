import { pgTable, serial, text, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Leaf predicate: `context[field] <operator> value`. `value` is stored as a
// JSON string so a single column can hold numbers, strings, booleans, or
// arrays (needed for "in" / "not_in"); the engine JSON.parses it at eval time.
export const ruleConditionsTable = pgTable("rule_conditions", {
  id: serial("id").primaryKey(),
  ruleVersionId: integer("rule_version_id").notNull(),
  groupId: integer("group_id").notNull(),
  field: text("field").notNull(),
  operator: text("operator").notNull(),
  value: text("value").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const insertRuleConditionSchema = createInsertSchema(ruleConditionsTable).omit({ id: true });
export type InsertRuleCondition = z.infer<typeof insertRuleConditionSchema>;
export type RuleCondition = typeof ruleConditionsTable.$inferSelect;
