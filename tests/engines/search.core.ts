// Global Search Service (Book: Platform Infrastructure, Search Engine) — pure
// scoring logic. Kept dependency-free (no db import) so it can be copied
// verbatim into tests/engines/search.core.ts for database-free tests, the
// same convention rules/forms/notifications/documents already follow.
//
// Deliberately simple: tokenize the query, then score a candidate by how many
// query tokens it contains and where (title hits outrank content hits).
// No stemming, no fuzzy matching — an exact-substring, ILIKE-equivalent
// scorer that's predictable and cheap to reason about, matching this
// workspace's preference for plain, explicit logic over hidden magic.

export interface SearchCandidate {
  entityType: string;
  entityId: number;
  title: string;
  subtitle: string | null;
  content: string;
  url: string | null;
}

export interface ScoredResult extends SearchCandidate {
  score: number;
  matchedIn: Array<"title" | "subtitle" | "content">;
}

/** Lowercases and splits on non-alphanumeric runs; drops empty/1-char tokens. */
export function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length > 1);
}

const TITLE_WEIGHT = 5;
const SUBTITLE_WEIGHT = 3;
const CONTENT_WEIGHT = 1;
// A hit on every query token, not just some, earns a bonus — this is what
// lets a two-word exact phrase like "business permit" outrank a document
// that only happens to mention "business" a lot.
const ALL_TOKENS_BONUS = 4;

/**
 * Scores one candidate against a tokenized query. Returns null (not a score
 * of 0) when nothing matched, so callers can filter non-matches without a
 * magic-number check.
 */
export function scoreCandidate(candidate: SearchCandidate, tokens: string[]): ScoredResult | null {
  if (tokens.length === 0) return null;

  const title = candidate.title.toLowerCase();
  const subtitle = (candidate.subtitle ?? "").toLowerCase();
  const content = candidate.content.toLowerCase();

  let score = 0;
  let titleHits = 0;
  let subtitleHits = 0;
  let contentHits = 0;

  for (const token of tokens) {
    if (title.includes(token)) {
      score += TITLE_WEIGHT;
      titleHits++;
    }
    if (subtitle.includes(token)) {
      score += SUBTITLE_WEIGHT;
      subtitleHits++;
    }
    if (content.includes(token)) {
      score += CONTENT_WEIGHT;
      contentHits++;
    }
  }

  if (score === 0) return null;

  const matchedAllTokens = titleHits === tokens.length || subtitleHits === tokens.length || contentHits === tokens.length;
  if (matchedAllTokens) score += ALL_TOKENS_BONUS;

  const matchedIn: Array<"title" | "subtitle" | "content"> = [];
  if (titleHits > 0) matchedIn.push("title");
  if (subtitleHits > 0) matchedIn.push("subtitle");
  if (contentHits > 0) matchedIn.push("content");

  return { ...candidate, score, matchedIn };
}

/**
 * Scores and ranks every candidate, highest score first; ties broken by
 * entityType then entityId so results are stable across runs.
 */
export function rankCandidates(candidates: SearchCandidate[], query: string, limit = 25): ScoredResult[] {
  const tokens = tokenize(query);
  const scored: ScoredResult[] = [];
  for (const c of candidates) {
    const result = scoreCandidate(c, tokens);
    if (result) scored.push(result);
  }
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.entityType !== b.entityType) return a.entityType.localeCompare(b.entityType);
    return a.entityId - b.entityId;
  });
  return scored.slice(0, limit);
}

// ── Pure permission-filtering helpers (copied from permissions.ts) ──

export const ENTITY_TYPE_TO_MODULE: Record<string, string> = {
  rule: "rules",
  form: "forms",
  workflow_definition: "workflows",
  document_template: "documents",
  notification_template: "notifications",
  department: "identity",
  user: "identity",
};

export const ALL_ENTITY_TYPES = Object.keys(ENTITY_TYPE_TO_MODULE);

/**
 * Returns the set of entityType values a user is allowed to see in search
 * results. A user with no matching role/permission rows sees nothing —
 * search permissions fail closed, not open.
 */

export function filterByAllowedTypes<T extends { entityType: string }>(rows: T[], allowed: Set<string>): T[] {
  return rows.filter((r) => allowed.has(r.entityType));
}
