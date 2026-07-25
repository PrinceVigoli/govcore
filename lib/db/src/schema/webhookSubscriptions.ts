import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Integration Engine (Sprint 2A) — Webhook framework: a target URL that wants
// to be notified when an internal event (published via the Event Publisher)
// fires. `secret` signs the outbound payload (HMAC-SHA256, hex-encoded, sent
// as the `X-GovCore-Signature` header) so the receiver can verify authenticity.
export const webhookSubscriptionsTable = pgTable("webhook_subscriptions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  integrationEndpointId: integer("integration_endpoint_id"), // optional link to a registered integration
  eventType: text("event_type").notNull(), // e.g. "document.signed", "*" for all events
  targetUrl: text("target_url").notNull(),
  secret: text("secret").notNull(),
  status: text("status").notNull().default("active"), // active | paused | disabled
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertWebhookSubscriptionSchema = createInsertSchema(webhookSubscriptionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertWebhookSubscription = z.infer<typeof insertWebhookSubscriptionSchema>;
export type WebhookSubscription = typeof webhookSubscriptionsTable.$inferSelect;
