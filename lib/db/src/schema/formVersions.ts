import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Form Lifecycle (Book 07 §8, matching the Rule Lifecycle in Book 06 §5 for
// consistency across the platform): draft -> testing -> published -> active
// -> deprecated -> archived. `locale` supports the "Multi-language Ready"
// design goal (§2) by letting a form have one version per language; forms
// with a single language simply publish one locale ("en" by default).
export const formVersionsTable = pgTable("form_versions", {
  id: serial("id").primaryKey(),
  formId: integer("form_id").notNull(),
  version: integer("version").notNull(),
  status: text("status").notNull().default("draft"),
  locale: text("locale").notNull().default("en"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFormVersionSchema = createInsertSchema(formVersionsTable).omit({ id: true, createdAt: true });
export type InsertFormVersion = z.infer<typeof insertFormVersionSchema>;
export type FormVersion = typeof formVersionsTable.$inferSelect;
