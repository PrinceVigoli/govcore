import { Router, type Request, type Response } from "express";
import { eq, and } from "drizzle-orm";
import { db, workflowTasksTable, workflowInstancesTable, workflowStatesTable } from "@workspace/db";
import { ApproveWorkflowTaskBody, ApproveWorkflowTaskParams, RejectWorkflowTaskBody, RejectWorkflowTaskParams, ListWorkflowTasksQueryParams } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { logAudit } from "../lib/audit";
import type { JwtPayload } from "../lib/auth";
import { serializeTask, resolveTransition, actorHasPermission, applyTaskAction } from "../lib/workflowEngine";

const router = Router();

router.get("/workflow-tasks", requireAuth, async (req, res): Promise<void> => {
  const q = ListWorkflowTasksQueryParams.safeParse(req.query);
  const conditions = [];
  if (q.success && q.data.assigneeUserId) conditions.push(eq(workflowTasksTable.assigneeUserId, q.data.assigneeUserId));
  if (q.success && q.data.workflowInstanceId) conditions.push(eq(workflowTasksTable.workflowInstanceId, q.data.workflowInstanceId));
  if (q.success && q.data.status) conditions.push(eq(workflowTasksTable.status, q.data.status));
  const tasks = conditions.length > 0
    ? await db.select().from(workflowTasksTable).where(and(...conditions)).orderBy(workflowTasksTable.createdAt)
    : await db.select().from(workflowTasksTable).orderBy(workflowTasksTable.createdAt);
  res.json(tasks.map(serializeTask));
});

async function handleTaskAction(req: Request, res: Response, action: "approve" | "reject"): Promise<void> {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const paramsSchema = action === "approve" ? ApproveWorkflowTaskParams : RejectWorkflowTaskParams;
  const bodySchema = action === "approve" ? ApproveWorkflowTaskBody : RejectWorkflowTaskBody;

  const params = paramsSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = bodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [task] = await db.select().from(workflowTasksTable).where(eq(workflowTasksTable.id, params.data.id));
  if (!task) {
    res.status(404).json({ error: "Workflow task not found" });
    return;
  }
  if (task.status !== "pending") {
    res.status(400).json({ error: `Task is already ${task.status}` });
    return;
  }

  const [instance] = await db.select().from(workflowInstancesTable).where(eq(workflowInstancesTable.id, task.workflowInstanceId));
  if (!instance || instance.currentStateId !== task.stateId) {
    res.status(400).json({ error: "Task no longer matches the instance's current state" });
    return;
  }

  const transition = await resolveTransition({
    workflowVersionId: instance.workflowVersionId,
    fromStateId: task.stateId,
    transitionId: parsed.data.transitionId,
    fallbackName: action === "approve" ? "approve" : "reject",
  });
  if (!transition) {
    res.status(400).json({ error: `No "${action}" transition is available from the current state. Pass an explicit transitionId.` });
    return;
  }

  if (transition.requiredPermission) {
    const allowed = await actorHasPermission(actor.userId, transition.requiredPermission);
    if (!allowed) {
      res.status(403).json({ error: `Missing required permission: ${transition.requiredPermission}` });
      return;
    }
  }

  const [toState] = await db.select().from(workflowStatesTable).where(eq(workflowStatesTable.id, transition.toStateId));
  if (!toState) {
    res.status(400).json({ error: "Transition target state no longer exists" });
    return;
  }

  const detail = await applyTaskAction({
    task,
    instance,
    transition,
    toState,
    actorUserId: actor.userId,
    action,
    comment: parsed.data.comment,
    nextAssigneeUserId: parsed.data.nextAssigneeUserId,
    nextAssigneeRoleId: parsed.data.nextAssigneeRoleId,
  });

  await logAudit({ actor, action, resource: "workflow_task", resourceId: task.id });
  res.json(detail);
}

router.post("/workflow-tasks/:id/approve", requireAuth, (req, res) => {
  void handleTaskAction(req, res, "approve");
});

router.post("/workflow-tasks/:id/reject", requireAuth, (req, res) => {
  void handleTaskAction(req, res, "reject");
});

export default router;
