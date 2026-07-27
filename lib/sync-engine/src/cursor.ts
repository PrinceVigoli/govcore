// Book 13 — pure cursor / change-log logic. Kept dependency-free so the rules
// that decide what a node receives (and whether it can safely advance) are
// unit-testable without a database.
//
// The cursor contract, which everything else depends on:
//   - Every change carries a per-tenant monotonic `seq`.
//   - A node stores the highest seq it has successfully applied.
//   - A pull returns changes with `seq > cursor`, in seq order, capped to a
//     batch size — so a node on a bad link syncs incrementally rather than
//     timing out on one huge response.
//   - The node only advances its cursor to the last seq it ACTUALLY applied.
//     Advancing past an unapplied change would silently skip it forever, so
//     `nextCursor` is derived from the batch, never guessed.

export const DEFAULT_BATCH_SIZE = 500;
export const MAX_BATCH_SIZE = 5_000;

export interface ChangeRecord {
  seq: number;
  entityType: string;
  entityKey: string;
  op: "create" | "update" | "delete";
  revision: number;
  payload?: unknown;
  originNodeId?: number | null;
}

export interface PullBatch<T extends ChangeRecord = ChangeRecord> {
  changes: T[];
  /** The cursor the node should store once it has applied every change here. */
  nextCursor: number;
  /** True when more changes remain beyond this batch — the node should pull again. */
  hasMore: boolean;
}

/** Clamps a requested batch size into the allowed range. */
export function clampBatchSize(requested?: number): number {
  if (requested === undefined || !Number.isFinite(requested)) return DEFAULT_BATCH_SIZE;
  const n = Math.floor(requested);
  if (n <= 0) return DEFAULT_BATCH_SIZE;
  return Math.min(n, MAX_BATCH_SIZE);
}

/**
 * Builds the batch a node should receive from an ordered set of candidate
 * changes.
 *
 * `rows` must already be filtered to the tenant and ordered by seq ascending;
 * this function owns the batching and cursor arithmetic, not the query.
 *
 * `excludeOriginNodeId`, when given, drops changes the node itself authored —
 * a node has already applied its own writes locally, and echoing them back
 * would re-apply (and re-bump) records for no reason.
 */
export function buildPullBatch<T extends ChangeRecord>(
  rows: T[],
  cursor: number,
  batchSize?: number,
  excludeOriginNodeId?: number | null,
): PullBatch<T> {
  const size = clampBatchSize(batchSize);

  const eligible = rows.filter((r) => {
    if (r.seq <= cursor) return false;
    if (excludeOriginNodeId != null && r.originNodeId === excludeOriginNodeId) return false;
    return true;
  });

  const changes = eligible.slice(0, size);
  const hasMore = eligible.length > changes.length;

  // Advance only as far as the batch actually reaches. With nothing to send,
  // the cursor must stay put — never jump to some "latest" value, or filtered
  // changes beyond it would be skipped forever.
  const nextCursor = changes.length > 0 ? changes[changes.length - 1].seq : cursor;

  return { changes, nextCursor, hasMore };
}

/**
 * Whether a proposed cursor advance is legal. A node may only move forward, and
 * only to a seq the server actually issued. Rejecting a backwards or
 * beyond-the-log cursor keeps a buggy or malicious node from skipping changes.
 */
export function isValidCursorAdvance(current: number, proposed: number, latestSeq: number): boolean {
  if (!Number.isInteger(proposed) || proposed < 0) return false;
  if (proposed < current) return false;
  return proposed <= latestSeq;
}

/**
 * The seq to assign the next change for a tenant. Sequences start at 1 so that
 * a cursor of 0 unambiguously means "this node has seen nothing".
 */
export function nextSeq(currentMaxSeq: number | null | undefined): number {
  if (currentMaxSeq === null || currentMaxSeq === undefined || currentMaxSeq < 0) return 1;
  return currentMaxSeq + 1;
}

/**
 * Summarizes how far behind a node is. Used for the fleet view — an operator
 * needs to see at a glance which municipal office hasn't synced in a week.
 */
export function syncLag(cursor: number, latestSeq: number): { behind: number; upToDate: boolean } {
  const behind = Math.max(0, latestSeq - cursor);
  return { behind, upToDate: behind === 0 };
}
