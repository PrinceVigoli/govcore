import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const workflowInstancesTable = pgTable("workflow_instances", {
  id: serial("id").primaryKey(),
  workflowVersionId: integer("workflow_version_id").notNull(),
  tenantId: integer("tenant_id").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id").notNull(),
  currentStateId: integer("current_state_id").notNull(),
  status: text("status").notNull().default("in_progress"),
  initiatedBy: integer("initiated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertWorkflowInstanceSchema = createInsertSchema(workflowInstancesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertWorkflowInstance = z.infer<typeof insertWorkflowInstanceSchema>;
export type WorkflowInstance = typeof workflowInstancesTable.$inferSelect;
