import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Integration Engine (Sprint 2A) — Retry Queue: one row per outbound job
// (currently: webhook deliveries) that needs at-least-once delivery with
// exponential backoff. Mirrors `notification_queue`'s shape and worker
// pattern (`processQueue` claims due rows with `SELECT ... FOR UPDATE SKIP
// LOCKED`) so the two queues behave identically to an operator.
export const integrationRetryQueueTable = pgTable("integration_retry_queue", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  jobType: text("job_type").notNull().default("webhook_delivery"),
  webhookSubscriptionId: integer("webhook_subscription_id"),
  integrationEventId: integer("integration_event_id"),
  payload: text("payload").notNull(), // JSON-encoded text: the exact body to deliver
  status: text("status").notNull().default("pending"), // pending | processing | delivered | failed | dead_letter
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(8),
  lastError: text("last_error"),
  availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertIntegrationRetryQueueSchema = createInsertSchema(integrationRetryQueueTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertIntegrationRetryQueueItem = z.infer<typeof insertIntegrationRetryQueueSchema>;
export type IntegrationRetryQueueItem = typeof integrationRetryQueueTable.$inferSelect;
