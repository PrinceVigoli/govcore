import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import {
  db,
  syncEntitiesTable,
  syncNodesTable,
  syncConflictsTable,
} from "@workspace/db";
import {
  isConflictPolicy,
  pullChanges,
  pushChanges,
  resolveConflict,
  nodeStatus,
  serializeEntity,
  serializeNode,
  serializeConflict,
  type IncomingChange,
} from "@workspace/sync-engine";
import {
  RegisterSyncEntityBody,
  UpdateSyncEntityParams,
  UpdateSyncEntityBody,
  RegisterSyncNodeBody,
  UpdateSyncNodeParams,
  UpdateSyncNodeBody,
  PullSyncChangesBody,
  PushSyncChangesBody,
  ListSyncConflictsQueryParams,
  ResolveSyncConflictParams,
  ResolveSyncConflictBody,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { logAudit } from "../lib/audit";
import type { JwtPayload } from "../lib/auth";

// Book 13 — Synchronization Engine API. Nodes pull changes and push offline
// edits; conflicts resolve per the entity's registered policy, escalating to a
// human when that policy is "manual". Every route is tenant-scoped from the
// authenticated actor.

const router = Router();

// ── Entity registry ────────────────────────────────────────────────────────

router.get("/sync-entities", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const rows = await db
    .select()
    .from(syncEntitiesTable)
    .where(eq(syncEntitiesTable.tenantId, actor.tenantId))
    .orderBy(syncEntitiesTable.entityType);
  res.json(rows.map(serializeEntity));
});

router.post("/sync-entities", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const parsed = RegisterSyncEntityBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  // Default to "manual": for government records, escalating a divergence is
  // always safer than silently discarding one side.
  const policy = parsed.data.conflictPolicy ?? "manual";
  if (!isConflictPolicy(policy)) {
    res.status(400).json({ error: `Unknown conflict policy "${policy}"` });
    return;
  }

  const [entity] = await db
    .insert(syncEntitiesTable)
    .values({
      tenantId: actor.tenantId,
      entityType: parsed.data.entityType,
      conflictPolicy: policy,
      enabled: true,
    })
    .returning();

  await logAudit({ actor, action: "create", resource: "sync_entity", resourceId: entity.id });
  res.status(201).json(serializeEntity(entity));
});

router.patch("/sync-entities/:id", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const params = UpdateSyncEntityParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateSyncEntityBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (parsed.data.conflictPolicy !== undefined && !isConflictPolicy(parsed.data.conflictPolicy)) {
    res.status(400).json({ error: `Unknown conflict policy "${parsed.data.conflictPolicy}"` });
    return;
  }

  const [updated] = await db
    .update(syncEntitiesTable)
    .set({
      ...(parsed.data.conflictPolicy !== undefined ? { conflictPolicy: parsed.data.conflictPolicy } : {}),
      ...(parsed.data.enabled !== undefined ? { enabled: parsed.data.enabled } : {}),
    })
    .where(and(eq(syncEntitiesTable.id, params.data.id), eq(syncEntitiesTable.tenantId, actor.tenantId)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Sync entity not found" });
    return;
  }

  await logAudit({ actor, action: "update", resource: "sync_entity", resourceId: updated.id });
  res.json(serializeEntity(updated));
});

// ── Nodes ──────────────────────────────────────────────────────────────────

router.get("/sync-nodes", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  res.json(await nodeStatus(actor.tenantId));
});

router.post("/sync-nodes", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const parsed = RegisterSyncNodeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(syncNodesTable)
    .where(and(eq(syncNodesTable.tenantId, actor.tenantId), eq(syncNodesTable.nodeKey, parsed.data.nodeKey)));
  if (existing) {
    res.status(409).json({ error: `A node with key "${parsed.data.nodeKey}" already exists` });
    return;
  }

  const [node] = await db
    .insert(syncNodesTable)
    .values({
      tenantId: actor.tenantId,
      nodeKey: parsed.data.nodeKey,
      name: parsed.data.name,
      location: parsed.data.location ?? null,
      status: "active",
      cursor: 0,
    })
    .returning();

  await logAudit({ actor, action: "create", resource: "sync_node", resourceId: node.id });
  res.status(201).json(serializeNode(node));
});

router.patch("/sync-nodes/:id", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const params = UpdateSyncNodeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateSyncNodeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [updated] = await db
    .update(syncNodesTable)
    .set({
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.location !== undefined ? { location: parsed.data.location } : {}),
      ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
    })
    .where(and(eq(syncNodesTable.id, params.data.id), eq(syncNodesTable.tenantId, actor.tenantId)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Sync node not found" });
    return;
  }

  await logAudit({ actor, action: "update", resource: "sync_node", resourceId: updated.id });
  res.json(serializeNode(updated));
});

// ── Pull / push ────────────────────────────────────────────────────────────

// Resolves a node by key within the caller's tenant, rejecting nodes that
// aren't active. Shared by pull and push so both enforce the same gate.
async function activeNode(tenantId: number, nodeKey: string) {
  const [node] = await db
    .select()
    .from(syncNodesTable)
    .where(and(eq(syncNodesTable.tenantId, tenantId), eq(syncNodesTable.nodeKey, nodeKey)));
  return node ?? null;
}

router.post("/sync/pull", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const parsed = PullSyncChangesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const node = await activeNode(actor.tenantId, parsed.data.nodeKey);
  if (!node) {
    res.status(404).json({ error: "Sync node not found" });
    return;
  }
  if (node.status !== "active") {
    res.status(409).json({ error: `Node is ${node.status}; sync is disabled for it` });
    return;
  }

  const result = await pullChanges(node, parsed.data.batchSize);
  res.json(result);
});

router.post("/sync/push", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const parsed = PushSyncChangesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const node = await activeNode(actor.tenantId, parsed.data.nodeKey);
  if (!node) {
    res.status(404).json({ error: "Sync node not found" });
    return;
  }
  if (node.status !== "active") {
    res.status(409).json({ error: `Node is ${node.status}; sync is disabled for it` });
    return;
  }

  const incoming = parsed.data.changes as (IncomingChange & { entityType: string })[];
  const outcomes = await pushChanges(node, incoming, actor.userId);

  const conflicts = outcomes.filter((o) => o.outcome === "conflict").length;
  await logAudit({
    actor,
    action: "push",
    resource: "sync_node",
    resourceId: node.id,
    details: `${outcomes.length} changes, ${conflicts} escalated`,
  });

  res.json({ outcomes });
});

// ── Conflicts ──────────────────────────────────────────────────────────────

router.get("/sync-conflicts", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const q = ListSyncConflictsQueryParams.safeParse(req.query);
  const conditions = [eq(syncConflictsTable.tenantId, actor.tenantId)];
  if (q.success && q.data.status) conditions.push(eq(syncConflictsTable.status, q.data.status));

  const rows = await db
    .select()
    .from(syncConflictsTable)
    .where(and(...conditions))
    .orderBy(desc(syncConflictsTable.createdAt))
    .limit(200);
  res.json(rows.map(serializeConflict));
});

router.post("/sync-conflicts/:id/resolve", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const params = ResolveSyncConflictParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = ResolveSyncConflictBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [conflict] = await db
    .select()
    .from(syncConflictsTable)
    .where(and(eq(syncConflictsTable.id, params.data.id), eq(syncConflictsTable.tenantId, actor.tenantId)));
  if (!conflict) {
    res.status(404).json({ error: "Conflict not found" });
    return;
  }

  try {
    const resolved = await resolveConflict(conflict, parsed.data.choice, actor.userId, parsed.data.mergedPayload);
    await logAudit({
      actor,
      action: "resolve",
      resource: "sync_conflict",
      resourceId: resolved.id,
      details: `resolved with ${parsed.data.choice}`,
    });
    res.json(serializeConflict(resolved));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Could not resolve conflict" });
  }
});

export default router;
