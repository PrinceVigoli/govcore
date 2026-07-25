import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, rolesTable, permissionsTable, rolePermissionsTable } from "@workspace/db";
import {
  CreateRoleBody,
  UpdateRoleBody,
  GetRoleParams,
  UpdateRoleParams,
  DeleteRoleParams,
  GetRolePermissionsParams,
  AssignRolePermissionParams,
  AssignRolePermissionBody,
  RemoveRolePermissionParams,
  ListRolesQueryParams,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { logAudit } from "../lib/audit";
import type { JwtPayload } from "../lib/auth";

const router = Router();

function serializeRole(r: typeof rolesTable.$inferSelect) {
  return {
    ...r,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

router.get("/roles", requireAuth, async (req, res): Promise<void> => {
  const q = ListRolesQueryParams.safeParse(req.query);
  const conditions = [];
  if (q.success && q.data.tenantId) conditions.push(eq(rolesTable.tenantId, q.data.tenantId));
  const roles = conditions.length > 0
    ? await db.select().from(rolesTable).where(and(...conditions)).orderBy(rolesTable.name)
    : await db.select().from(rolesTable).orderBy(rolesTable.name);
  res.json(roles.map(serializeRole));
});

router.post("/roles", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const parsed = CreateRoleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [role] = await db.insert(rolesTable).values(parsed.data).returning();
  await logAudit({ actor, action: "create", resource: "role", resourceId: role.id });
  res.status(201).json(serializeRole(role));
});

router.get("/roles/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetRoleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [role] = await db.select().from(rolesTable).where(eq(rolesTable.id, params.data.id));
  if (!role) {
    res.status(404).json({ error: "Role not found" });
    return;
  }
  const rolePerms = await db
    .select({ permission: permissionsTable })
    .from(rolePermissionsTable)
    .innerJoin(permissionsTable, eq(rolePermissionsTable.permissionId, permissionsTable.id))
    .where(eq(rolePermissionsTable.roleId, role.id));
  res.json({ ...serializeRole(role), permissions: rolePerms.map((p) => p.permission) });
});

router.patch("/roles/:id", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const params = UpdateRoleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateRoleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [role] = await db.update(rolesTable).set(parsed.data).where(eq(rolesTable.id, params.data.id)).returning();
  if (!role) {
    res.status(404).json({ error: "Role not found" });
    return;
  }
  await logAudit({ actor, action: "update", resource: "role", resourceId: role.id });
  res.json(serializeRole(role));
});

router.delete("/roles/:id", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const params = DeleteRoleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [role] = await db.delete(rolesTable).where(eq(rolesTable.id, params.data.id)).returning();
  if (!role) {
    res.status(404).json({ error: "Role not found" });
    return;
  }
  await logAudit({ actor, action: "delete", resource: "role", resourceId: params.data.id });
  res.sendStatus(204);
});

router.get("/roles/:id/permissions", requireAuth, async (req, res): Promise<void> => {
  const params = GetRolePermissionsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const rolePerms = await db
    .select({ permission: permissionsTable })
    .from(rolePermissionsTable)
    .innerJoin(permissionsTable, eq(rolePermissionsTable.permissionId, permissionsTable.id))
    .where(eq(rolePermissionsTable.roleId, params.data.id));
  res.json(rolePerms.map((p) => p.permission));
});

router.post("/roles/:id/permissions", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const params = AssignRolePermissionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = AssignRolePermissionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await db.insert(rolePermissionsTable).values({ roleId: params.data.id, permissionId: parsed.data.permissionId }).onConflictDoNothing();
  await logAudit({ actor, action: "assign_permission", resource: "role", resourceId: params.data.id });
  res.sendStatus(204);
});

router.delete("/roles/:id/permissions/:permissionId", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const params = RemoveRolePermissionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db
    .delete(rolePermissionsTable)
    .where(and(eq(rolePermissionsTable.roleId, params.data.id), eq(rolePermissionsTable.permissionId, params.data.permissionId)));
  await logAudit({ actor, action: "remove_permission", resource: "role", resourceId: params.data.id });
  res.sendStatus(204);
});

export default router;
