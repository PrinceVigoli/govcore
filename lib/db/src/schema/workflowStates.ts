import { pgTable, serial, text, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const workflowStatesTable = pgTable("workflow_states", {
  id: serial("id").primaryKey(),
  workflowVersionId: integer("workflow_version_id").notNull(),
  name: text("name").notNull(),
  code: text("code").notNull(),
  type: text("type").notNull().default("review"),
  isInitial: boolean("is_initial").notNull().default(false),
  isFinal: boolean("is_final").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const insertWorkflowStateSchema = createInsertSchema(workflowStatesTable).omit({ id: true });
export type InsertWorkflowState = z.infer<typeof insertWorkflowStateSchema>;
export type WorkflowState = typeof workflowStatesTable.$inferSelect;
