import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Book 08 — the immutable delivery audit trail (§5 Tracking/Audit, §12
// "Delivery audit logs"). Rows are only ever inserted, never updated, mirroring
// workflow_history and rule_history: each attempt on a queue item appends a
// row, so a message that succeeded on its third try leaves three rows telling
// the whole story.
//
// `providerMessageId` and `providerResponse` capture whatever the channel
// adapter returned (an SMTP id, an SMS gateway receipt), which is what makes a
// delivery dispute answerable after the fact.
export const notificationDeliveryTable = pgTable("notification_delivery", {
  id: serial("id").primaryKey(),
  notificationId: integer("notification_id").notNull(),
  queueItemId: integer("queue_item_id"),
  tenantId: integer("tenant_id").notNull(),
  recipientAddress: text("recipient_address").notNull(),
  channel: text("channel").notNull(),
  eventType: text("event_type").notNull(), // queued | attempted | sent | delivered | failed | read | cancelled
  attempt: integer("attempt").notNull().default(1),
  providerMessageId: text("provider_message_id"),
  providerResponse: text("provider_response"), // JSON-encoded adapter response or error detail
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertNotificationDeliverySchema = createInsertSchema(notificationDeliveryTable).omit({ id: true, createdAt: true });
export type InsertNotificationDelivery = z.infer<typeof insertNotificationDeliverySchema>;
export type NotificationDelivery = typeof notificationDeliveryTable.$inferSelect;
