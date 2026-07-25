import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Immutable audit trail: rows are only ever inserted, never updated or deleted,
// so every workflow transition remains fully auditable (see Book 05, ADR-0008).
export const workflowHistoryTable = pgTable("workflow_history", {
  id: serial("id").primaryKey(),
  workflowInstanceId: integer("workflow_instance_id").notNull(),
  transitionId: integer("transition_id"),
  fromStateId: integer("from_state_id"),
  toStateId: integer("to_state_id").notNull(),
  actorUserId: integer("actor_user_id"),
  action: text("action").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWorkflowHistorySchema = createInsertSchema(workflowHistoryTable).omit({ id: true, createdAt: true });
export type InsertWorkflowHistory = z.infer<typeof insertWorkflowHistorySchema>;
export type WorkflowHistory = typeof workflowHistoryTable.$inferSelect;
