import { eq, and, asc, desc } from "drizzle-orm";
import {
  db,
  workflowDefinitionsTable,
  workflowVersionsTable,
  workflowStatesTable,
  workflowTransitionsTable,
  workflowInstancesTable,
  workflowTasksTable,
  workflowHistoryTable,
  userRolesTable,
  rolePermissionsTable,
  permissionsTable,
  type WorkflowInstance,
  type WorkflowTask,
  type WorkflowTransition,
  type WorkflowState,
} from "@workspace/db";

// ── Serialization ──────────────────────────────────────────────────────────
// Every date column is serialized to an ISO string so the wire shape matches
// the OpenAPI spec (`format: date-time`).

export function serializeDefinition(d: typeof workflowDefinitionsTable.$inferSelect) {
  return { ...d, createdAt: d.createdAt.toISOString(), updatedAt: d.updatedAt.toISOString() };
}

export function serializeVersion(v: typeof workflowVersionsTable.$inferSelect) {
  return { ...v, publishedAt: v.publishedAt ? v.publishedAt.toISOString() : null, createdAt: v.createdAt.toISOString() };
}

export function serializeInstance(i: WorkflowInstance) {
  return { ...i, createdAt: i.createdAt.toISOString(), updatedAt: i.updatedAt.toISOString() };
}

export function serializeTask(t: WorkflowTask) {
  return {
    ...t,
    createdAt: t.createdAt.toISOString(),
    resolvedAt: t.resolvedAt ? t.resolvedAt.toISOString() : null,
  };
}

export function serializeHistory(h: typeof workflowHistoryTable.$inferSelect) {
  return { ...h, createdAt: h.createdAt.toISOString() };
}

// ── Permission checks ───────────────────────────────────────────────────────
// Permissions are stored as (module, action, resource) triples. A transition's
// `requiredPermission` is the composed "module:action:resource" code.

export async function actorHasPermission(userId: number, permissionCode: string): Promise<boolean> {
  const [module_, action, resource] = permissionCode.split(":");
  if (!module_ || !action || !resource) return false;
  const rows = await db
    .select({ id: permissionsTable.id })
    .from(userRolesTable)
    .innerJoin(rolePermissionsTable, eq(rolePermissionsTable.roleId, userRolesTable.roleId))
    .innerJoin(
      permissionsTable,
      and(
        eq(permissionsTable.id, rolePermissionsTable.permissionId),
        eq(permissionsTable.module, module_),
        eq(permissionsTable.action, action),
        eq(permissionsTable.resource, resource),
      ),
    )
    .where(eq(userRolesTable.userId, userId))
    .limit(1);
  return rows.length > 0;
}

// ── Graph lookups ───────────────────────────────────────────────────────────

export async function getLatestPublishedVersion(workflowDefinitionId: number) {
  const [version] = await db
    .select()
    .from(workflowVersionsTable)
    .where(and(eq(workflowVersionsTable.workflowDefinitionId, workflowDefinitionId), eq(workflowVersionsTable.isPublished, true)))
    .orderBy(desc(workflowVersionsTable.version))
    .limit(1);
  return version ?? null;
}

export async function getVersionGraph(workflowVersionId: number): Promise<{ states: WorkflowState[]; transitions: WorkflowTransition[] }> {
  const [states, transitions] = await Promise.all([
    db.select().from(workflowStatesTable).where(eq(workflowStatesTable.workflowVersionId, workflowVersionId)).orderBy(asc(workflowStatesTable.sortOrder)),
    db.select().from(workflowTransitionsTable).where(eq(workflowTransitionsTable.workflowVersionId, workflowVersionId)),
  ]);
  return { states, transitions };
}

/**
 * Resolves which transition a task action should take: either the explicit
 * transitionId supplied by the caller, or (by convention) the transition
 * named "approve"/"reject" leaving the task's current state.
 */
export async function resolveTransition(opts: {
  workflowVersionId: number;
  fromStateId: number;
  transitionId?: number;
  fallbackName: string;
}): Promise<WorkflowTransition | null> {
  const candidates = await db
    .select()
    .from(workflowTransitionsTable)
    .where(and(eq(workflowTransitionsTable.workflowVersionId, opts.workflowVersionId), eq(workflowTransitionsTable.fromStateId, opts.fromStateId)));

  if (opts.transitionId != null) {
    return candidates.find((t) => t.id === opts.transitionId) ?? null;
  }
  const lower = opts.fallbackName.toLowerCase();
  return candidates.find((t) => t.name.toLowerCase() === lower) ?? null;
}

export async function getInstanceDetail(instanceId: number) {
  const [instance] = await db.select().from(workflowInstancesTable).where(eq(workflowInstancesTable.id, instanceId));
  if (!instance) return null;
  const [currentState] = await db.select().from(workflowStatesTable).where(eq(workflowStatesTable.id, instance.currentStateId));
  const [tasks, history] = await Promise.all([
    db.select().from(workflowTasksTable).where(eq(workflowTasksTable.workflowInstanceId, instanceId)).orderBy(asc(workflowTasksTable.createdAt)),
    db.select().from(workflowHistoryTable).where(eq(workflowHistoryTable.workflowInstanceId, instanceId)).orderBy(asc(workflowHistoryTable.createdAt)),
  ]);
  return {
    ...serializeInstance(instance),
    currentState,
    tasks: tasks.map(serializeTask),
    history: history.map(serializeHistory),
  };
}

/**
 * Executes a single approve/reject step of the state machine:
 * resolves the task, closes it, advances the instance to the transition's
 * target state, writes an immutable history entry, and — if the new state
 * isn't final — opens the next pending task. All in one transaction so the
 * instance never observes a partially-applied transition.
 */
export async function applyTaskAction(opts: {
  task: WorkflowTask;
  instance: WorkflowInstance;
  transition: WorkflowTransition;
  toState: WorkflowState;
  actorUserId: number;
  action: "approve" | "reject";
  comment?: string;
  nextAssigneeUserId?: number;
  nextAssigneeRoleId?: number;
}) {
  const { task, instance, transition, toState, actorUserId, action, comment, nextAssigneeUserId, nextAssigneeRoleId } = opts;

  await db.transaction(async (tx) => {
    await tx
      .update(workflowTasksTable)
      .set({
        status: action === "approve" ? "approved" : "rejected",
        resolvedAt: new Date(),
        resolvedBy: actorUserId,
        comment: comment ?? task.comment,
      })
      .where(eq(workflowTasksTable.id, task.id));

    await tx.insert(workflowHistoryTable).values({
      workflowInstanceId: instance.id,
      transitionId: transition.id,
      fromStateId: instance.currentStateId,
      toStateId: transition.toStateId,
      actorUserId,
      action,
      comment: comment ?? null,
    });

    await tx
      .update(workflowInstancesTable)
      .set({ currentStateId: transition.toStateId, status: toState.isFinal ? "completed" : "in_progress" })
      .where(eq(workflowInstancesTable.id, instance.id));

    if (!toState.isFinal) {
      await tx.insert(workflowTasksTable).values({
        workflowInstanceId: instance.id,
        stateId: toState.id,
        assigneeUserId: nextAssigneeUserId ?? null,
        assigneeRoleId: nextAssigneeRoleId ?? null,
        status: "pending",
      });
    }
  });

  return getInstanceDetail(instance.id);
}
