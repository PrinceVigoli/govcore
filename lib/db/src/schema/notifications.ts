import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Book 08 — the logical message produced by one business event (§5 Lifecycle:
// Event -> Template Selection -> Recipient Resolution -> Queue -> Delivery).
// One notification fans out to many recipients: per-recipient delivery state
// lives on notification_queue / notification_delivery rows, so this row stays
// the single auditable record of "this event produced this message".
//
// `eventType` is the business event that triggered it (§7: WorkflowApproved,
// PermitIssued, ...). Notifications are event-driven and never called directly
// by a module (ADR-0016), so this column is the join back to what happened.
//
// `payload` is the JSON-encoded variable map rendered into the template
// ({"citizen_name":"Juan"}). Storing it alongside the rendered subject/body
// means a past message can be re-rendered or explained without depending on
// template rows that may since have been revised.
export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  templateId: integer("template_id"), // Exact template version rendered; null for ad-hoc messages
  eventType: text("event_type").notNull(),
  resourceType: text("resource_type"), // Business record that triggered this, e.g. "permit_application"
  resourceId: text("resource_id"),
  channel: text("channel").notNull(),
  subject: text("subject"), // Rendered at send time, frozen here
  body: text("body").notNull(), // Rendered at send time, frozen here
  payload: text("payload"), // JSON-encoded variables used for rendering
  priority: text("priority").notNull().default("normal"), // high | normal | low — drives channel prioritization (§13)
  status: text("status").notNull().default("pending"), // pending | queued | sent | failed | cancelled
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }), // null = immediate (§8 Scheduling)
  createdByUserId: integer("created_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertNotificationSchema = createInsertSchema(notificationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notificationsTable.$inferSelect;
