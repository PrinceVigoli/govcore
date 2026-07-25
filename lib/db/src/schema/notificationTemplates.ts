import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Book 08 — Notification Engine: a versioned message template (§6 Templates).
// Templates are versioned rather than mutated (ADR-0017 "Preserve historical
// messages") using the same definition/version split as forms and rules: the
// `code` + `channel` + `locale` triple identifies a logical template, and each
// row is one immutable version of it. A sent notification records the exact
// templateId it rendered from, so the historical message can always be
// reconstructed even after the template is revised.
//
// `variables` is a JSON-encoded array of the placeholder names the body
// expects (e.g. ["citizen_name","reference_number"]), same JSON-in-text
// convention as rule_conditions.value. It documents the template's contract
// and lets the API warn when a send omits a variable the body references.
export const notificationTemplatesTable = pgTable("notification_templates", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  name: text("name").notNull(),
  code: text("code").notNull(), // Stable identifier events reference, e.g. "WORKFLOW_APPROVED"
  channel: text("channel").notNull(), // email | sms | push | in_app | announcement
  locale: text("locale").notNull().default("en"), // §2 multi-language, mirrors form_versions.locale
  version: integer("version").notNull().default(1),
  subject: text("subject"), // Unused by sms/in_app; required in practice for email
  body: text("body").notNull(), // Supports {{variable}} placeholders
  variables: text("variables"), // JSON-encoded string[] of expected placeholder names
  status: text("status").notNull().default("draft"), // draft | active | deprecated | archived
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertNotificationTemplateSchema = createInsertSchema(notificationTemplatesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertNotificationTemplate = z.infer<typeof insertNotificationTemplateSchema>;
export type NotificationTemplate = typeof notificationTemplatesTable.$inferSelect;
