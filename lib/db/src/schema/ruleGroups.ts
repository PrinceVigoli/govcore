import { pgTable, serial, text, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// A rule_version's conditions are organized into a tree of groups so rules can
// express nested boolean logic, e.g. (A AND B) OR (C AND D). Every version has
// exactly one root group (parentGroupId = null); nested groups reference their
// parent, and rule_conditions attach to whichever group they belong to.
export const ruleGroupsTable = pgTable("rule_groups", {
  id: serial("id").primaryKey(),
  ruleVersionId: integer("rule_version_id").notNull(),
  parentGroupId: integer("parent_group_id"),
  logicalOperator: text("logical_operator").notNull().default("AND"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const insertRuleGroupSchema = createInsertSchema(ruleGroupsTable).omit({ id: true });
export type InsertRuleGroup = z.infer<typeof insertRuleGroupSchema>;
export type RuleGroup = typeof ruleGroupsTable.$inferSelect;
