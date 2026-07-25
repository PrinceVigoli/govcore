import { pgTable, serial, integer, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// One row per answered field. `value` is JSON-encoded (same convention as
// rule_conditions.value) so a single column holds any field type's answer,
// including structured ones like GPS coordinates ({lat, lng}), a signature
// (data URI), or an uploaded file reference (storage key/URL).
export const submissionValuesTable = pgTable("submission_values", {
  id: serial("id").primaryKey(),
  formSubmissionId: integer("form_submission_id").notNull(),
  formFieldId: integer("form_field_id").notNull(),
  value: text("value").notNull(),
});

export const insertSubmissionValueSchema = createInsertSchema(submissionValuesTable).omit({ id: true });
export type InsertSubmissionValue = z.infer<typeof insertSubmissionValueSchema>;
export type SubmissionValue = typeof submissionValuesTable.$inferSelect;
