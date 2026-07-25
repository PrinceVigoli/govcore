import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Book 08 — one queued delivery attempt per recipient (§5 Queue, §13
// Performance). Delivery is asynchronous (ADR-0018): the send endpoint enqueues
// rows and returns immediately, and a worker later claims due rows.
//
// This is also the offline story (§11): a GovCore Node enqueues locally while
// disconnected and drains the queue when connectivity returns, which is why
// `availableAt` (not a hard timestamp on the notification) governs when a row
// becomes claimable.
//
// Retry/dead-letter (§13) is modelled with `attempts` vs `maxAttempts`: a
// failed attempt increments `attempts` and pushes `availableAt` out by a
// backoff; once attempts reach maxAttempts the row moves to "dead_letter"
// rather than retrying forever.
export const notificationQueueTable = pgTable("notification_queue", {
  id: serial("id").primaryKey(),
  notificationId: integer("notification_id").notNull(),
  tenantId: integer("tenant_id").notNull(),
  recipientUserId: integer("recipient_user_id"), // Resolved platform user, when the recipient is one
  recipientAddress: text("recipient_address").notNull(), // Email address, mobile number, device token, or user id for in_app
  channel: text("channel").notNull(),
  priority: text("priority").notNull().default("normal"),
  status: text("status").notNull().default("pending"), // pending | processing | sent | failed | dead_letter | cancelled
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(), // Claimable once now() >= availableAt
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertNotificationQueueSchema = createInsertSchema(notificationQueueTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertNotificationQueueItem = z.infer<typeof insertNotificationQueueSchema>;
export type NotificationQueueItem = typeof notificationQueueTable.$inferSelect;
