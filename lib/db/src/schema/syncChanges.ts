import { pgTable, serial, text, integer, timestamp, bigint } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Book 13 — the change log: an append-only record of every create/update/delete
// to a syncable entity. This is the backbone of pull-based sync — a node pulls
// by asking "give me every change after cursor N", so the log must be ordered
// and gap-free per tenant.
//
// `seq` is a per-tenant monotonic sequence number (assigned server-side inside
// the same transaction as the write). A node stores the highest seq it has seen
// as its cursor; pulling is `WHERE tenant_id = ? AND seq > cursor ORDER BY seq`.
// Kept as bigint because over a system's lifetime this table is high-volume.
//
// `revision` is the entity's own version counter (1, 2, 3…), independent of
// seq. Conflict detection compares revisions: if a node edited revision 3 but
// the server is already at revision 4, both touched the same base — a conflict.
//
// `payload` is the JSON-encoded entity snapshot (or the changed fields);
// `op` is create | update | delete. `originNodeId` records which node
// authored the change so a node can skip echoing its own pushes back to itself.
export const syncChangesTable = pgTable("sync_changes", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  seq: bigint("seq", { mode: "number" }).notNull(), // Per-tenant monotonic cursor value
  entityType: text("entity_type").notNull(),
  entityKey: text("entity_key").notNull(), // Stable identifier of the record within its type
  op: text("op").notNull(), // create | update | delete
  revision: integer("revision").notNull(), // The entity's version this change produced
  payload: text("payload"), // JSON-encoded snapshot; null for deletes
  originNodeId: integer("origin_node_id"), // Node that authored it; null = central server
  actorUserId: integer("actor_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSyncChangeSchema = createInsertSchema(syncChangesTable).omit({ id: true, createdAt: true });
export type InsertSyncChange = z.infer<typeof insertSyncChangeSchema>;
export type SyncChange = typeof syncChangesTable.$inferSelect;
