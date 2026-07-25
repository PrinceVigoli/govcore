import { pgTable, serial, text, integer, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Integration Engine (Sprint 2A) — the Integration Registry: named, reusable
// definitions of an external API client's connection shape (base URL, auth
// type). No credentials are stored here — `config` holds non-secret client
// options (timeouts, headers to always send) as JSON-encoded text, same
// convention as `rule_conditions.value` elsewhere in this schema. Registering
// an endpoint does not call it; this is scaffolding only (no external
// government API is wired up in Sprint 2A).
export const integrationEndpointsTable = pgTable(
  "integration_endpoints",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    name: text("name").notNull(),
    code: text("code").notNull(), // stable machine key, e.g. "lto_vehicle_registry"
    baseUrl: text("base_url").notNull(),
    authType: text("auth_type").notNull().default("none"), // none | api_key | bearer | basic
    status: text("status").notNull().default("inactive"), // inactive | active | disabled
    config: text("config"), // JSON-encoded text: non-secret client options
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [unique("integration_endpoints_tenant_code_unique").on(t.tenantId, t.code)],
);

export const insertIntegrationEndpointSchema = createInsertSchema(integrationEndpointsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertIntegrationEndpoint = z.infer<typeof insertIntegrationEndpointSchema>;
export type IntegrationEndpoint = typeof integrationEndpointsTable.$inferSelect;
