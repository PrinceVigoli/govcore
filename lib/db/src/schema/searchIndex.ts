import { pgTable, serial, text, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Search Engine (Sprint 2A) — a denormalized, reindexable row per searchable
// entity. Kept deliberately simple (plain text + ILIKE/word-scoring in
// searchService.ts) rather than a tsvector/GIN column, matching this
// workspace's existing preference for plain columns decoded defensively at
// read time over Postgres-specific machinery (see `JSON-in-text columns` in
// replit.md). One row per (tenantId, entityType, entityId); reindexing an
// entity upserts its row rather than accumulating duplicates.
export const searchIndexTable = pgTable(
  "search_index",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    module: text("module").notNull(), // e.g. "identity", "workflows", "rules", "forms", "notifications", "documents"
    entityType: text("entity_type").notNull(), // e.g. "rule", "form", "workflow_definition", "document"
    entityId: integer("entity_id").notNull(),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    content: text("content").notNull().default(""), // searchable body text, plain (not JSON-encoded)
    url: text("url"), // frontend deep link, e.g. "/rules/42"
    indexedAt: timestamp("indexed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("search_index_entity_unique").on(t.tenantId, t.entityType, t.entityId)],
);

export const insertSearchIndexSchema = createInsertSchema(searchIndexTable).omit({ id: true, indexedAt: true });
export type InsertSearchIndexEntry = z.infer<typeof insertSearchIndexSchema>;
export type SearchIndexEntry = typeof searchIndexTable.$inferSelect;
