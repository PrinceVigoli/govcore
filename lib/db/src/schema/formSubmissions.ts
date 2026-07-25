import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Submission lifecycle (Book 07 §13 Offline Forms): draft -> submitted ->
// synced. A form completed while offline is saved locally as "draft", then
// POSTed as "submitted" once connectivity returns; `syncedAt` records the
// cloud's acknowledgement of that sync. `workflowInstanceId` is populated
// when the owning form has a workflowDefinitionId and this submission
// reached "submitted" (§11 Workflow Integration).
export const formSubmissionsTable = pgTable("form_submissions", {
  id: serial("id").primaryKey(),
  formVersionId: integer("form_version_id").notNull(),
  tenantId: integer("tenant_id").notNull(),
  submittedByUserId: integer("submitted_by_user_id"),
  workflowInstanceId: integer("workflow_instance_id"),
  status: text("status").notNull().default("draft"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  syncedAt: timestamp("synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertFormSubmissionSchema = createInsertSchema(formSubmissionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFormSubmission = z.infer<typeof insertFormSubmissionSchema>;
export type FormSubmission = typeof formSubmissionsTable.$inferSelect;
