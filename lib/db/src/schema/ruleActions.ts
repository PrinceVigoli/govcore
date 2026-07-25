import { pgTable, serial, text, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Executed, in sortOrder, when a rule_version's root group evaluates true.
// `target` and `value` are interpreted by actionType: e.g. require_approval
// uses `target` as a role code; set_field / calculate use `target` as the
// output field name and `value` as a literal or expression.
export const ruleActionsTable = pgTable("rule_actions", {
  id: serial("id").primaryKey(),
  ruleVersionId: integer("rule_version_id").notNull(),
  actionType: text("action_type").notNull(),
  target: text("target"),
  value: text("value"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const insertRuleActionSchema = createInsertSchema(ruleActionsTable).omit({ id: true });
export type InsertRuleAction = z.infer<typeof insertRuleActionSchema>;
export type RuleAction = typeof ruleActionsTable.$inferSelect;
