import { pgTable, serial, text, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Supported field types (Book 07 §5), stored as free text rather than a
// Postgres enum so new types can ship without a migration (§2 "Configurable"):
// text | textarea | number | currency | date | time | select | multi_select |
// radio | checkbox | switch | file_upload | image | signature | qr_scanner |
// gps_location | rich_text
//
// `visibilityRuleCode` / `calculationRuleCode` are Rules Engine (Book 06)
// rule `code`s evaluated against the in-progress submission values as
// context (§12 Rules Integration: "Conditional visibility", "Calculated
// values"). A rule referenced here must have the owning form's resourceType,
// so it evaluates in the same evaluateRules() call the engine already makes
// for that resourceType.
export const formFieldsTable = pgTable("form_fields", {
  id: serial("id").primaryKey(),
  formVersionId: integer("form_version_id").notNull(),
  sectionId: integer("section_id").notNull(),
  fieldKey: text("field_key").notNull(), // Stable key used in submission_values and as the Rules Engine context field name
  label: text("label").notNull(),
  fieldType: text("field_type").notNull(),
  helpText: text("help_text"),
  placeholder: text("placeholder"),
  defaultValue: text("default_value"), // JSON-encoded, same convention as rule_conditions.value
  options: text("options"), // JSON-encoded array of {label, value}, for select/multi_select/radio
  required: boolean("required").notNull().default(false),
  readOnly: boolean("read_only").notNull().default(false),
  hidden: boolean("hidden").notNull().default(false),
  visibilityRuleCode: text("visibility_rule_code"), // Rules Engine rule code; field is shown only if that rule matches
  calculationRuleCode: text("calculation_rule_code"), // Rules Engine rule code; a matching 'calculate'/'set_field' action targeting this fieldKey overwrites its value
  sortOrder: integer("sort_order").notNull().default(0),
});

export const insertFormFieldSchema = createInsertSchema(formFieldsTable).omit({ id: true });
export type InsertFormField = z.infer<typeof insertFormFieldSchema>;
export type FormField = typeof formFieldsTable.$inferSelect;
