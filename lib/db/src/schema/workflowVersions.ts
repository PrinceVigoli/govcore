import { pgTable, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const workflowVersionsTable = pgTable("workflow_versions", {
  id: serial("id").primaryKey(),
  workflowDefinitionId: integer("workflow_definition_id").notNull(),
  version: integer("version").notNull(),
  isPublished: boolean("is_published").notNull().default(false),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWorkflowVersionSchema = createInsertSchema(workflowVersionsTable).omit({ id: true, createdAt: true });
export type InsertWorkflowVersion = z.infer<typeof insertWorkflowVersionSchema>;
export type WorkflowVersion = typeof workflowVersionsTable.$inferSelect;
