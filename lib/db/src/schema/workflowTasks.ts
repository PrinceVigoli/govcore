import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const workflowTasksTable = pgTable("workflow_tasks", {
  id: serial("id").primaryKey(),
  workflowInstanceId: integer("workflow_instance_id").notNull(),
  stateId: integer("state_id").notNull(),
  assigneeUserId: integer("assignee_user_id"),
  assigneeRoleId: integer("assignee_role_id"),
  status: text("status").notNull().default("pending"),
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedBy: integer("resolved_by"),
});

export const insertWorkflowTaskSchema = createInsertSchema(workflowTasksTable).omit({ id: true, createdAt: true, resolvedAt: true, resolvedBy: true });
export type InsertWorkflowTask = z.infer<typeof insertWorkflowTaskSchema>;
export type WorkflowTask = typeof workflowTasksTable.$inferSelect;
