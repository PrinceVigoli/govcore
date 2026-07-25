import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Book 07 — Forms Engine: the definition-level record. Layout (sections,
// fields, validations) lives on versioned rows (see formVersions.ts) so a
// published form is immutable (ADR-0014) and historical submissions stay
// linked to the exact layout a citizen filled out, even as later drafts
// change the metadata (§8 Versioning).
export const formsTable = pgTable("forms", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  name: text("name").notNull(),
  code: text("code").notNull(),
  description: text("description"),
  module: text("module").notNull(), // Owning module, e.g. "agriculture", "permits"
  resourceType: text("resource_type").notNull(), // The kind of business record this form collects (e.g. "permit_application"); also the Rules Engine resourceType consulted for visibility/validation/calculation (§11-12)
  workflowDefinitionId: integer("workflow_definition_id"), // Optional: a submitted (non-draft) submission of this form starts an instance of this workflow (§11 Workflow Integration)
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertFormSchema = createInsertSchema(formsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertForm = z.infer<typeof insertFormSchema>;
export type Form = typeof formsTable.$inferSelect;
