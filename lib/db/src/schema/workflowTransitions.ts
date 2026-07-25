import { pgTable, serial, text, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const workflowTransitionsTable = pgTable("workflow_transitions", {
  id: serial("id").primaryKey(),
  workflowVersionId: integer("workflow_version_id").notNull(),
  name: text("name").notNull(),
  fromStateId: integer("from_state_id").notNull(),
  toStateId: integer("to_state_id").notNull(),
  requiredPermission: text("required_permission"),
});

export const insertWorkflowTransitionSchema = createInsertSchema(workflowTransitionsTable).omit({ id: true });
export type InsertWorkflowTransition = z.infer<typeof insertWorkflowTransitionSchema>;
export type WorkflowTransition = typeof workflowTransitionsTable.$inferSelect;
