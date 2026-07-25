import { Router } from "express";
import { eq, and, asc } from "drizzle-orm";
import {
  db,
  workflowDefinitionsTable,
  workflowVersionsTable,
  workflowStatesTable,
  workflowTransitionsTable,
} from "@workspace/db";
import {
  CreateWorkflowDefinitionBody,
  UpdateWorkflowDefinitionBody,
  GetWorkflowDefinitionParams,
  UpdateWorkflowDefinitionParams,
  DeleteWorkflowDefinitionParams,
  CreateWorkflowVersionParams,
  CreateWorkflowVersionBody,
  ListWorkflowDefinitionsQueryParams,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { logAudit } from "../lib/audit";
import type { JwtPayload } from "../lib/auth";
import { serializeDefinition, serializeVersion } from "../lib/workflowEngine";

const router = Router();

router.get("/workflow-definitions", requireAuth, async (req, res): Promise<void> => {
  const q = ListWorkflowDefinitionsQueryParams.safeParse(req.query);
  const conditions = [];
  if (q.success && q.data.tenantId) conditions.push(eq(workflowDefinitionsTable.tenantId, q.data.tenantId));
  if (q.success && q.data.resourceType) conditions.push(eq(workflowDefinitionsTable.resourceType, q.data.resourceType));
  const defs = conditions.length > 0
    ? await db.select().from(workflowDefinitionsTable).where(and(...conditions)).orderBy(workflowDefinitionsTable.name)
    : await db.select().from(workflowDefinitionsTable).orderBy(workflowDefinitionsTable.name);
  res.json(defs.map(serializeDefinition));
});

router.post("/workflow-definitions", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const parsed = CreateWorkflowDefinitionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [def] = await db.insert(workflowDefinitionsTable).values(parsed.data).returning();
  await logAudit({ actor, action: "create", resource: "workflow_definition", resourceId: def.id });
  res.status(201).json(serializeDefinition(def));
});

router.get("/workflow-definitions/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetWorkflowDefinitionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [def] = await db.select().from(workflowDefinitionsTable).where(eq(workflowDefinitionsTable.id, params.data.id));
  if (!def) {
    res.status(404).json({ error: "Workflow definition not found" });
    return;
  }
  const versions = await db
    .select()
    .from(workflowVersionsTable)
    .where(eq(workflowVersionsTable.workflowDefinitionId, def.id))
    .orderBy(asc(workflowVersionsTable.version));
  res.json({ ...serializeDefinition(def), versions: versions.map(serializeVersion) });
});

router.patch("/workflow-definitions/:id", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const params = UpdateWorkflowDefinitionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateWorkflowDefinitionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [def] = await db
    .update(workflowDefinitionsTable)
    .set(parsed.data)
    .where(eq(workflowDefinitionsTable.id, params.data.id))
    .returning();
  if (!def) {
    res.status(404).json({ error: "Workflow definition not found" });
    return;
  }
  await logAudit({ actor, action: "update", resource: "workflow_definition", resourceId: def.id });
  res.json(serializeDefinition(def));
});

router.delete("/workflow-definitions/:id", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const params = DeleteWorkflowDefinitionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [def] = await db.delete(workflowDefinitionsTable).where(eq(workflowDefinitionsTable.id, params.data.id)).returning();
  if (!def) {
    res.status(404).json({ error: "Workflow definition not found" });
    return;
  }
  await logAudit({ actor, action: "delete", resource: "workflow_definition", resourceId: params.data.id });
  res.sendStatus(204);
});

// Create a new draft version: a client-authored graph of states + transitions.
// States carry a temporary `key` used only within this request so transitions
// can reference `fromKey`/`toKey` before real row ids exist.
router.post("/workflow-definitions/:id/versions", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const params = CreateWorkflowVersionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = CreateWorkflowVersionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [def] = await db.select().from(workflowDefinitionsTable).where(eq(workflowDefinitionsTable.id, params.data.id));
  if (!def) {
    res.status(404).json({ error: "Workflow definition not found" });
    return;
  }

  const keys = parsed.data.states.map((s) => s.key);
  if (new Set(keys).size !== keys.length) {
    res.status(400).json({ error: "State keys must be unique within a version" });
    return;
  }
  for (const t of parsed.data.transitions) {
    if (!keys.includes(t.fromKey) || !keys.includes(t.toKey)) {
      res.status(400).json({ error: `Transition "${t.name}" references an unknown state key` });
      return;
    }
  }
  if (!parsed.data.states.some((s) => s.isInitial)) {
    res.status(400).json({ error: "At least one state must be marked isInitial" });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const allVersions = await tx.select().from(workflowVersionsTable).where(eq(workflowVersionsTable.workflowDefinitionId, def.id));
    const nextVersion = allVersions.length > 0 ? Math.max(...allVersions.map((v) => v.version)) + 1 : 1;

    const [version] = await tx.insert(workflowVersionsTable).values({ workflowDefinitionId: def.id, version: nextVersion }).returning();

    const keyToId = new Map<string, number>();
    const insertedStates = [];
    for (const s of parsed.data.states) {
      const [row] = await tx
        .insert(workflowStatesTable)
        .values({
          workflowVersionId: version.id,
          name: s.name,
          code: s.code,
          type: s.type ?? "review",
          isInitial: s.isInitial ?? false,
          isFinal: s.isFinal ?? false,
          sortOrder: s.sortOrder ?? 0,
        })
        .returning();
      keyToId.set(s.key, row.id);
      insertedStates.push(row);
    }

    const insertedTransitions = [];
    for (const t of parsed.data.transitions) {
      const [row] = await tx
        .insert(workflowTransitionsTable)
        .values({
          workflowVersionId: version.id,
          name: t.name,
          fromStateId: keyToId.get(t.fromKey)!,
          toStateId: keyToId.get(t.toKey)!,
          requiredPermission: t.requiredPermission ?? null,
        })
        .returning();
      insertedTransitions.push(row);
    }

    return { version, states: insertedStates, transitions: insertedTransitions };
  });

  await logAudit({ actor, action: "create_version", resource: "workflow_definition", resourceId: def.id });
  res.status(201).json({ ...serializeVersion(result.version), states: result.states, transitions: result.transitions });
});

export default router;
