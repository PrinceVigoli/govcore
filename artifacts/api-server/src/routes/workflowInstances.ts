import { Router } from "express";
import { eq, and, inArray } from "drizzle-orm";
import {
  db,
  workflowDefinitionsTable,
  workflowVersionsTable,
  workflowInstancesTable,
  workflowStatesTable,
  workflowTasksTable,
  workflowHistoryTable,
} from "@workspace/db";
import { StartWorkflowInstanceBody, GetWorkflowInstanceParams, ListWorkflowInstancesQueryParams } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { logAudit } from "../lib/audit";
import type { JwtPayload } from "../lib/auth";
import { serializeInstance, getLatestPublishedVersion, getInstanceDetail } from "../lib/workflowEngine";

const router = Router();

router.get("/workflow-instances", requireAuth, async (req, res): Promise<void> => {
  const q = ListWorkflowInstancesQueryParams.safeParse(req.query);
  const conditions = [];
  if (q.success && q.data.tenantId) conditions.push(eq(workflowInstancesTable.tenantId, q.data.tenantId));
  if (q.success && q.data.resourceType) conditions.push(eq(workflowInstancesTable.resourceType, q.data.resourceType));
  if (q.success && q.data.resourceId) conditions.push(eq(workflowInstancesTable.resourceId, q.data.resourceId));
  if (q.success && q.data.status) conditions.push(eq(workflowInstancesTable.status, q.data.status));

  if (q.success && q.data.workflowDefinitionId) {
    const versionIds = (
      await db.select({ id: workflowVersionsTable.id }).from(workflowVersionsTable).where(eq(workflowVersionsTable.workflowDefinitionId, q.data.workflowDefinitionId))
    ).map((v) => v.id);
    if (versionIds.length === 0) {
      res.json([]);
      return;
    }
    conditions.push(inArray(workflowInstancesTable.workflowVersionId, versionIds));
  }

  const instances = conditions.length > 0
    ? await db.select().from(workflowInstancesTable).where(and(...conditions)).orderBy(workflowInstancesTable.createdAt)
    : await db.select().from(workflowInstancesTable).orderBy(workflowInstancesTable.createdAt);
  res.json(instances.map(serializeInstance));
});

router.post("/workflow-instances", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const parsed = StartWorkflowInstanceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [def] = await db.select().from(workflowDefinitionsTable).where(eq(workflowDefinitionsTable.id, parsed.data.workflowDefinitionId));
  if (!def) {
    res.status(404).json({ error: "Workflow definition not found" });
    return;
  }
  const version = await getLatestPublishedVersion(def.id);
  if (!version) {
    res.status(400).json({ error: "Workflow definition has no published version" });
    return;
  }
  const [initialState] = await db
    .select()
    .from(workflowStatesTable)
    .where(and(eq(workflowStatesTable.workflowVersionId, version.id), eq(workflowStatesTable.isInitial, true)));
  if (!initialState) {
    res.status(400).json({ error: "Published version has no initial state" });
    return;
  }

  const instance = await db.transaction(async (tx) => {
    const [inst] = await tx
      .insert(workflowInstancesTable)
      .values({
        workflowVersionId: version.id,
        tenantId: def.tenantId,
        resourceType: def.resourceType,
        resourceId: parsed.data.resourceId,
        currentStateId: initialState.id,
        status: "in_progress",
        initiatedBy: actor.userId,
      })
      .returning();

    if (!initialState.isFinal) {
      await tx.insert(workflowTasksTable).values({
        workflowInstanceId: inst.id,
        stateId: initialState.id,
        assigneeUserId: parsed.data.firstAssigneeUserId ?? null,
        assigneeRoleId: parsed.data.firstAssigneeRoleId ?? null,
        status: "pending",
      });
    }

    await tx.insert(workflowHistoryTable).values({
      workflowInstanceId: inst.id,
      transitionId: null,
      fromStateId: null,
      toStateId: initialState.id,
      actorUserId: actor.userId,
      action: "started",
      comment: null,
    });

    return inst;
  });

  await logAudit({ actor, action: "start", resource: "workflow_instance", resourceId: instance.id });
  const detail = await getInstanceDetail(instance.id);
  res.status(201).json(detail);
});

router.get("/workflow-instances/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetWorkflowInstanceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const detail = await getInstanceDetail(params.data.id);
  if (!detail) {
    res.status(404).json({ error: "Workflow instance not found" });
    return;
  }
  res.json(detail);
});

export default router;
