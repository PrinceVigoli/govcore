// Book 13 — the service layer: DB orchestration on top of the pure conflict and
// cursor cores. Registration, pull, push, and conflict resolution.

import { eq, and, gt, desc, sql } from "drizzle-orm";
import {
  db,
  syncEntitiesTable,
  syncChangesTable,
  syncNodesTable,
  syncConflictsTable,
  type SyncEntity,
  type SyncChange,
  type SyncNode,
  type SyncConflict,
} from "@workspace/db";
import {
  resolve,
  isConflictPolicy,
  type ConflictPolicy,
  type IncomingChange,
  type ServerState,
  type Decision,
} from "./conflict";
import { buildPullBatch, clampBatchSize, nextSeq, syncLag, type ChangeRecord } from "./cursor";

// ── Serializers ────────────────────────────────────────────────────────────

export function serializeEntity(e: SyncEntity) {
  return { ...e, createdAt: e.createdAt.toISOString(), updatedAt: e.updatedAt.toISOString() };
}

export function serializeNode(n: SyncNode) {
  return {
    ...n,
    lastPulledAt: n.lastPulledAt ? n.lastPulledAt.toISOString() : null,
    lastPushedAt: n.lastPushedAt ? n.lastPushedAt.toISOString() : null,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
  };
}

export function serializeChange(c: SyncChange) {
  return { ...c, createdAt: c.createdAt.toISOString() };
}

export function serializeConflict(c: SyncConflict) {
  return {
    ...c,
    createdAt: c.createdAt.toISOString(),
    resolvedAt: c.resolvedAt ? c.resolvedAt.toISOString() : null,
  };
}

// ── Entity registry ────────────────────────────────────────────────────────

export async function resolvePolicy(tenantId: number, entityType: string): Promise<ConflictPolicy | null> {
  const [row] = await db
    .select()
    .from(syncEntitiesTable)
    .where(
      and(
        eq(syncEntitiesTable.tenantId, tenantId),
        eq(syncEntitiesTable.entityType, entityType),
        eq(syncEntitiesTable.enabled, true),
      ),
    )
    .limit(1);
  if (!row) return null;
  // A policy value that isn't recognized must not silently fall through to
  // "apply" — treat it as the safe default instead.
  return isConflictPolicy(row.conflictPolicy) ? row.conflictPolicy : "manual";
}

// ── Change log ─────────────────────────────────────────────────────────────

/** The highest seq issued for a tenant, or 0 when the log is empty. */
export async function latestSeq(tenantId: number): Promise<number> {
  const [row] = await db
    .select({ max: sql<number | null>`max(${syncChangesTable.seq})` })
    .from(syncChangesTable)
    .where(eq(syncChangesTable.tenantId, tenantId));
  return row?.max ?? 0;
}

/**
 * Appends a change to the log, assigning the next per-tenant seq inside a
 * transaction.
 *
 * CONCURRENCY NOTE (documented boundary, consistent with the other engines):
 * seq assignment reads max(seq) then inserts. Under simultaneous writes for the
 * same tenant this can collide; a production deployment should back this with a
 * per-tenant sequence or a unique (tenant_id, seq) constraint plus retry. Not
 * verifiable in this environment — there is no Postgres here to test it against.
 */
export async function appendChange(input: {
  tenantId: number;
  entityType: string;
  entityKey: string;
  op: "create" | "update" | "delete";
  revision: number;
  payload?: unknown;
  originNodeId?: number | null;
  actorUserId?: number | null;
}): Promise<SyncChange> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ max: sql<number | null>`max(${syncChangesTable.seq})` })
      .from(syncChangesTable)
      .where(eq(syncChangesTable.tenantId, input.tenantId));

    const [change] = await tx
      .insert(syncChangesTable)
      .values({
        tenantId: input.tenantId,
        seq: nextSeq(row?.max ?? 0),
        entityType: input.entityType,
        entityKey: input.entityKey,
        op: input.op,
        revision: input.revision,
        payload: input.payload === undefined || input.payload === null ? null : JSON.stringify(input.payload),
        originNodeId: input.originNodeId ?? null,
        actorUserId: input.actorUserId ?? null,
      })
      .returning();
    return change;
  });
}

// ── Pull ───────────────────────────────────────────────────────────────────

export interface PullResult {
  changes: ReturnType<typeof serializeChange>[];
  nextCursor: number;
  hasMore: boolean;
}

/**
 * Returns the next batch of changes for a node and advances its cursor.
 *
 * The node's own changes are excluded — it already has them locally, and
 * re-applying them would be wasted work. The cursor advances only as far as the
 * batch actually reaches (see cursor.ts), so nothing is ever skipped.
 */
export async function pullChanges(node: SyncNode, batchSize?: number): Promise<PullResult> {
  const size = clampBatchSize(batchSize);

  // Fetch one extra row so buildPullBatch can tell whether more remain.
  const rows = await db
    .select()
    .from(syncChangesTable)
    .where(and(eq(syncChangesTable.tenantId, node.tenantId), gt(syncChangesTable.seq, node.cursor)))
    .orderBy(syncChangesTable.seq)
    .limit(size + 1);

  const batch = buildPullBatch(rows as unknown as (SyncChange & ChangeRecord)[], node.cursor, size, node.id);

  if (batch.nextCursor !== node.cursor) {
    await db
      .update(syncNodesTable)
      .set({ cursor: batch.nextCursor, lastPulledAt: new Date() })
      .where(eq(syncNodesTable.id, node.id));
  } else {
    await db.update(syncNodesTable).set({ lastPulledAt: new Date() }).where(eq(syncNodesTable.id, node.id));
  }

  return {
    changes: batch.changes.map((c) => serializeChange(c as unknown as SyncChange)),
    nextCursor: batch.nextCursor,
    hasMore: batch.hasMore,
  };
}

// ── Push ───────────────────────────────────────────────────────────────────

export interface PushOutcome {
  entityType: string;
  entityKey: string;
  outcome: Decision["outcome"];
  winner: Decision["winner"];
  reason: string;
  /** Set when the change was escalated for manual resolution. */
  conflictId?: number;
  /** The seq of the resulting change, when one was written. */
  seq?: number;
}

/**
 * Current server state for a record, derived from the change log. The log is
 * the source of truth for sync purposes: the newest change for a key gives its
 * revision and whether it has been deleted.
 */
async function currentServerState(tenantId: number, entityType: string, entityKey: string): Promise<ServerState> {
  const [row] = await db
    .select()
    .from(syncChangesTable)
    .where(
      and(
        eq(syncChangesTable.tenantId, tenantId),
        eq(syncChangesTable.entityType, entityType),
        eq(syncChangesTable.entityKey, entityKey),
      ),
    )
    .orderBy(desc(syncChangesTable.seq))
    .limit(1);

  if (!row) return { exists: false, revision: 0 };
  return {
    exists: true,
    revision: row.revision,
    updatedAt: row.createdAt.getTime(),
    deleted: row.op === "delete",
  };
}

/**
 * Applies a batch of offline changes from a node.
 *
 * Each change is decided independently under its entity's policy, so one
 * escalated conflict doesn't block the rest of the batch — a node that queued
 * fifty edits overnight gets forty-nine applied and one flagged, rather than
 * all fifty stalled.
 *
 * Every conflict is recorded in sync_conflicts, including auto-resolved ones,
 * so the audit trail shows that a divergence happened and how it was settled.
 */
export async function pushChanges(
  node: SyncNode,
  incoming: (IncomingChange & { entityType: string })[],
  actorUserId?: number | null,
): Promise<PushOutcome[]> {
  const results: PushOutcome[] = [];

  for (const change of incoming) {
    const policy = await resolvePolicy(node.tenantId, change.entityType);
    if (!policy) {
      results.push({
        entityType: change.entityType,
        entityKey: change.entityKey,
        outcome: "discard",
        winner: "server",
        reason: `Entity type "${change.entityType}" is not registered for sync`,
      });
      continue;
    }

    const server = await currentServerState(node.tenantId, change.entityType, change.entityKey);
    const decision = resolve(policy, server, change);

    if (decision.outcome === "conflict") {
      const [conflict] = await db
        .insert(syncConflictsTable)
        .values({
          tenantId: node.tenantId,
          nodeId: node.id,
          entityType: change.entityType,
          entityKey: change.entityKey,
          baseRevision: change.baseRevision,
          serverRevision: server.revision,
          nodeRevision: change.baseRevision + 1,
          serverPayload: null,
          nodePayload: change.payload === undefined || change.payload === null ? null : JSON.stringify(change.payload),
          policy,
          status: "pending",
        })
        .returning();

      results.push({
        entityType: change.entityType,
        entityKey: change.entityKey,
        outcome: decision.outcome,
        winner: decision.winner,
        reason: decision.reason,
        conflictId: conflict.id,
      });
      continue;
    }

    // Auto-resolved divergences are still recorded, resolved, for the audit trail.
    if (decision.isConflict) {
      await db.insert(syncConflictsTable).values({
        tenantId: node.tenantId,
        nodeId: node.id,
        entityType: change.entityType,
        entityKey: change.entityKey,
        baseRevision: change.baseRevision,
        serverRevision: server.revision,
        nodeRevision: change.baseRevision + 1,
        nodePayload: change.payload === undefined || change.payload === null ? null : JSON.stringify(change.payload),
        policy,
        status: "resolved",
        resolvedWith: decision.winner === "node" ? "node" : "server",
        resolvedPayload:
          decision.winner === "node" && change.payload != null ? JSON.stringify(change.payload) : null,
        resolvedAt: new Date(),
      });
    }

    if (decision.outcome === "discard") {
      results.push({
        entityType: change.entityType,
        entityKey: change.entityKey,
        outcome: decision.outcome,
        winner: decision.winner,
        reason: decision.reason,
      });
      continue;
    }

    // fast_forward or apply → write the change to the log.
    const written = await appendChange({
      tenantId: node.tenantId,
      entityType: change.entityType,
      entityKey: change.entityKey,
      op: change.op,
      revision: Math.max(server.revision, change.baseRevision) + 1,
      payload: change.payload,
      originNodeId: node.id,
      actorUserId: actorUserId ?? null,
    });

    results.push({
      entityType: change.entityType,
      entityKey: change.entityKey,
      outcome: decision.outcome,
      winner: decision.winner,
      reason: decision.reason,
      seq: written.seq,
    });
  }

  await db.update(syncNodesTable).set({ lastPushedAt: new Date() }).where(eq(syncNodesTable.id, node.id));
  return results;
}

// ── Conflict resolution ────────────────────────────────────────────────────

/**
 * Settles a pending conflict with an explicit human decision. Choosing the node
 * side (or a merged payload) writes a new change to the log so every node
 * converges on the resolution; choosing the server side records the decision
 * without writing, since the server already holds that state.
 */
export async function resolveConflict(
  conflict: SyncConflict,
  choice: "server" | "node" | "merged",
  userId: number | null,
  mergedPayload?: unknown,
): Promise<SyncConflict> {
  if (conflict.status === "resolved") {
    throw new Error("Conflict is already resolved");
  }
  if (choice === "merged" && mergedPayload === undefined) {
    throw new Error("A merged resolution requires a payload");
  }

  const payload =
    choice === "node"
      ? conflict.nodePayload
        ? JSON.parse(conflict.nodePayload)
        : null
      : choice === "merged"
        ? mergedPayload
        : null;

  if (choice !== "server") {
    const server = await currentServerState(conflict.tenantId, conflict.entityType, conflict.entityKey);
    await appendChange({
      tenantId: conflict.tenantId,
      entityType: conflict.entityType,
      entityKey: conflict.entityKey,
      op: "update",
      revision: server.revision + 1,
      payload,
      originNodeId: null, // resolved centrally
      actorUserId: userId,
    });
  }

  const [updated] = await db
    .update(syncConflictsTable)
    .set({
      status: "resolved",
      resolvedWith: choice,
      resolvedByUserId: userId,
      resolvedPayload: payload === null || payload === undefined ? null : JSON.stringify(payload),
      resolvedAt: new Date(),
    })
    .where(eq(syncConflictsTable.id, conflict.id))
    .returning();

  return updated;
}

// ── Fleet status ───────────────────────────────────────────────────────────

/** Per-node sync lag for the fleet view. */
export async function nodeStatus(tenantId: number): Promise<
  (ReturnType<typeof serializeNode> & { behind: number; upToDate: boolean })[]
> {
  const [nodes, latest] = await Promise.all([
    db.select().from(syncNodesTable).where(eq(syncNodesTable.tenantId, tenantId)).orderBy(syncNodesTable.name),
    latestSeq(tenantId),
  ]);

  return nodes.map((n) => {
    const lag = syncLag(n.cursor, latest);
    return { ...serializeNode(n), behind: lag.behind, upToDate: lag.upToDate };
  });
}
