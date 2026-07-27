import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Book 13 — Synchronization Engine: the registry of which entity types
// participate in sync, and — the heart of the per-entity design (ADR
// "configuration over customization") — HOW conflicts on each are resolved.
//
// `conflictPolicy` is the decision that shapes everything downstream:
//   - "last_write_wins": the newer version (by revision, then timestamp) is
//     kept and the loser is logged. Fine for low-stakes lookup data.
//   - "manual": a true conflict (both sides changed the same record since the
//     node last synced) is NOT auto-resolved — it's written to sync_conflicts
//     and surfaced for a person to decide. This is the safe default for records
//     where silently discarding an edit is unacceptable (a permit status, a
//     payroll figure).
//   - "server_wins" / "node_wins": deterministic overrides for cases where one
//     side is authoritative by definition.
//
// A tenant registers each syncable entity once; the policy is metadata, not
// code, so changing how "documents" resolve conflicts is a config change, not a
// deploy.
export const syncEntitiesTable = pgTable("sync_entities", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  entityType: text("entity_type").notNull(), // e.g. "form_submission", "document"
  conflictPolicy: text("conflict_policy").notNull().default("manual"), // manual | last_write_wins | server_wins | node_wins
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSyncEntitySchema = createInsertSchema(syncEntitiesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSyncEntity = z.infer<typeof insertSyncEntitySchema>;
export type SyncEntity = typeof syncEntitiesTable.$inferSelect;
