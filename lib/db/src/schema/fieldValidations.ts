import { pgTable, serial, text, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Validation types (Book 07 §7): required | min | max | regex | range |
// cross_field | custom_rule. `config` is JSON, shape depends on the type:
//   required    -> {} (no params)
//   min / max   -> { "value": number }
//   range       -> { "min": number, "max": number }
//   regex       -> { "pattern": string, "flags"?: string }
//   cross_field -> { "compareField": fieldKey, "operator": RuleOperator }
//   custom_rule -> { "ruleCode": string } — delegates to the Rules Engine
//                  (Book 06); the submission is invalid if that rule matches
//                  and returns a "deny" action (§12 Rules Integration).
export const fieldValidationsTable = pgTable("field_validations", {
  id: serial("id").primaryKey(),
  formFieldId: integer("form_field_id").notNull(),
  validationType: text("validation_type").notNull(),
  config: text("config"),
  errorMessage: text("error_message"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const insertFieldValidationSchema = createInsertSchema(fieldValidationsTable).omit({ id: true });
export type InsertFieldValidation = z.infer<typeof insertFieldValidationSchema>;
export type FieldValidation = typeof fieldValidationsTable.$inferSelect;
