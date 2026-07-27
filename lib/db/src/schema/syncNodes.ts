import { pgTable, serial, text, integer, bigint, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Book 13 — a registered GovCore Node: a local instance (a municipal office
// with intermittent connectivity) that syncs against the central server. The
// spec's "local node architecture" — this is the server's record of each one.
//
// `cursor` is the highest change seq this node has successfully pulled. It is
// the single source of truth for "what has this node seen"; a pull returns
// changes with seq > cursor and, on success, the node advances it. Keeping the
// cursor server-side too (not only on the node) lets the server report sync lag
// and lets a re-provisioned node resume rather than re-pull everything.
//
// `nodeKey` is a stable per-node identifier the node presents on every sync
// call; `status` gates a node out of sync (e.g. decommissioned) without
// deleting its history.
export const syncNodesTable = pgTable("sync_nodes", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  nodeKey: text("node_key").notNull(), // Stable identifier the node presents
  name: text("name").notNull(),
  location: text("location"), // Human label, e.g. "Pudtol Municipal Hall"
  status: text("status").notNull().default("active"), // active | paused | decommissioned
  cursor: bigint("cursor", { mode: "number" }).notNull().default(0), // Highest change seq pulled
  lastPulledAt: timestamp("last_pulled_at", { withTimezone: true }),
  lastPushedAt: timestamp("last_pushed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSyncNodeSchema = createInsertSchema(syncNodesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSyncNode = z.infer<typeof insertSyncNodeSchema>;
export type SyncNode = typeof syncNodesTable.$inferSelect;
