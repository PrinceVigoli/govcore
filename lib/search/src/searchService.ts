import { eq, and, inArray } from "drizzle-orm";
import { db, searchIndexTable } from "@workspace/db";
import { rankCandidates, type ScoredResult } from "./ranking";
import { allowedEntityTypesForUser, ALL_ENTITY_TYPES } from "./permissions";

export interface SearchOptions {
  tenantId: number;
  userId: number;
  query: string;
  entityTypes?: string[]; // Entity Search: restrict to specific types; omit for Global Search
  limit?: number;
}

export interface SearchResponse {
  results: ScoredResult[];
  total: number;
  query: string;
  searchedEntityTypes: string[];
}

/**
 * Global Search Service (all entity types) and Entity Search (a subset) share
 * one implementation: tenant scoping is always applied first and is never
 * optional, then Search Permissions narrows entity types, then candidates
 * are pulled from the index and ranked. Passing `entityTypes` narrows an
 * already-permission-filtered set — it can only ever narrow visibility
 * further, never grant access to a type the caller's role can't see.
 */
export async function search(opts: SearchOptions): Promise<SearchResponse> {
  const limit = Math.min(opts.limit ?? 25, 100);

  const allowed = await allowedEntityTypesForUser(opts.userId);
  let searchedEntityTypes = [...allowed];
  if (opts.entityTypes && opts.entityTypes.length > 0) {
    searchedEntityTypes = searchedEntityTypes.filter((t) => opts.entityTypes!.includes(t));
  }

  if (searchedEntityTypes.length === 0) {
    return { results: [], total: 0, query: opts.query, searchedEntityTypes: [] };
  }

  const rows = await db
    .select()
    .from(searchIndexTable)
    .where(and(eq(searchIndexTable.tenantId, opts.tenantId), inArray(searchIndexTable.entityType, searchedEntityTypes)));

  const candidates = rows.map((r) => ({
    entityType: r.entityType,
    entityId: r.entityId,
    title: r.title,
    subtitle: r.subtitle,
    content: r.content,
    url: r.url,
  }));

  const results = rankCandidates(candidates, opts.query, limit);
  return { results, total: results.length, query: opts.query, searchedEntityTypes };
}

export function listSearchableEntityTypes(): string[] {
  return ALL_ENTITY_TYPES;
}
