import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Integration Engine (Sprint 2A) — Event Publisher: an append-only log of
// internal events published by any GovCore module (e.g. "document.signed",
// "workflow.instance.completed"). Persisting the event (not just handing it
// to in-process subscribers) lets a late-registered webhook subscription
// replay history, and gives the Retry Queue something durable to point back
// at when a delivery fails.
export const integrationEventsTable = pgTable("integration_events", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  eventType: text("event_type").notNull(),
  payload: text("payload").notNull(), // JSON-encoded text, same convention as rule_conditions.value
  sourceModule: text("source_module"), // e.g. "documents", "workflows" — informational
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertIntegrationEventSchema = createInsertSchema(integrationEventsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertIntegrationEvent = z.infer<typeof insertIntegrationEventSchema>;
export type IntegrationEvent = typeof integrationEventsTable.$inferSelect;
