import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Book 09 — Document Engine: a reusable generation template (§7, ADR-0020
// "Templates are reusable"). Versioned with the same definition/version split
// used by notification templates: a code/locale family holds many rows, one
// per version, and only one is active at a time. A generated document records
// the exact templateId it rendered from, so reprinting a 2024 certificate
// reproduces the 2024 wording (ADR-0021).
//
// `templateType` is the source format (§7 Template Types): html | rich_text.
// docx/pdf source templates are listed in the spec but need a binary
// round-trip this deployment has no renderer for, so they're rejected at the
// API rather than silently accepted and never rendered.
//
// `variables` is a JSON-encoded string[] of the placeholders the body expects,
// same convention as notification_templates.variables.
export const documentTemplatesTable = pgTable("document_templates", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  name: text("name").notNull(),
  code: text("code").notNull(), // Stable identifier modules reference, e.g. "BUSINESS_PERMIT"
  description: text("description"),
  module: text("module").notNull(),
  documentType: text("document_type").notNull(), // certificate | permit | receipt | contract | report | letter
  templateType: text("template_type").notNull().default("html"), // html | rich_text
  locale: text("locale").notNull().default("en"),
  version: integer("version").notNull().default(1),
  body: text("body").notNull(), // Supports {{variable}} placeholders
  variables: text("variables"), // JSON-encoded string[]
  status: text("status").notNull().default("draft"), // draft | active | deprecated | archived
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDocumentTemplateSchema = createInsertSchema(documentTemplatesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDocumentTemplate = z.infer<typeof insertDocumentTemplateSchema>;
export type DocumentTemplate = typeof documentTemplatesTable.$inferSelect;
