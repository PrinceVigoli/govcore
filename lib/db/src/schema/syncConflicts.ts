import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Book 13 — a detected conflict awaiting or recording resolution. Under the
// per-entity design, an entity whose policy is "manual" writes a row here
// instead of auto-discarding a side; policies that auto-resolve
// (last_write_wins / server_wins / node_wins) ALSO write a resolved row, so the
// audit trail always shows that a conflict occurred and how it was settled —
// the spec's "Auditable" goal.
//
// A conflict captures both sides: the base revision they diverged from, the
// server's competing change, and the node's incoming change. `resolution` is
// null while pending (manual policy) and set once decided; `resolvedWith`
// records which side won (server | node | merged) and by what means
// (policy code, or a user id for manual).
export const syncConflictsTable = pgTable("sync_conflicts", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  nodeId: integer("node_id").notNull(),
  entityType: text("entity_type").notNull(),
  entityKey: text("entity_key").notNull(),
  baseRevision: integer("base_revision"), // Revision both sides diverged from
  serverRevision: integer("server_revision"),
  nodeRevision: integer("node_revision"),
  serverPayload: text("server_payload"), // JSON snapshot of the server side
  nodePayload: text("node_payload"), // JSON snapshot of the incoming node side
  policy: text("policy").notNull(), // The conflictPolicy in force when detected
  status: text("status").notNull().default("pending"), // pending | resolved
  resolvedWith: text("resolved_with"), // server | node | merged
  resolvedByUserId: integer("resolved_by_user_id"), // Set for manual resolution
  resolvedPayload: text("resolved_payload"), // Final chosen/merged snapshot
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const insertSyncConflictSchema = createInsertSchema(syncConflictsTable).omit({ id: true, createdAt: true });
export type InsertSyncConflict = z.infer<typeof insertSyncConflictSchema>;
export type SyncConflict = typeof syncConflictsTable.$inferSelect;
