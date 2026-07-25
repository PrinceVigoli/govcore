import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Immutable audit trail: rows are only ever inserted, never updated or
// deleted (mirrors workflow_history, see Book 05 ADR-0008). Covers the
// events listed in Book 06 §12: RulePublished, RuleEvaluated, RuleFailed,
// RuleExpired, RuleArchived. `context`/`result` hold JSON snapshots so a
// past decision can be replayed exactly, without depending on rule rows
// that may since have changed.
export const ruleHistoryTable = pgTable("rule_history", {
  id: serial("id").primaryKey(),
  ruleId: integer("rule_id").notNull(),
  ruleVersionId: integer("rule_version_id"),
  eventType: text("event_type").notNull(),
  context: text("context"),
  result: text("result"),
  actorUserId: integer("actor_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRuleHistorySchema = createInsertSchema(ruleHistoryTable).omit({ id: true, createdAt: true });
export type InsertRuleHistory = z.infer<typeof insertRuleHistorySchema>;
export type RuleHistory = typeof ruleHistoryTable.$inferSelect;
