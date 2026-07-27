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
import { SUPERADMIN_ROLE_CODES } from "../lib/authorization";
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


// Reserved role codes confer superadmin status (see lib/authorization.ts), and
// superadmin now means cross-tenant reach. Roles are tenant-scoped and created
// through this endpoint, so without this guard anyone holding identity:manage
// in their own tenant could mint a "platform_admin" role, assign it to
// themselves, and acquire access to every other LGU's records.
//
// This is one half of a two-part defence; the other is that superadmin
// recognition additionally requires `isSystem`, which is never accepted from
// client input here. Removing either half reopens the escalation.
function reservedCodeError(code: string | undefined): string | null {
  if (!code) return null;
  if ((SUPERADMIN_ROLE_CODES as readonly string[]).includes(code.trim().toLowerCase())) {
    return `Role code "${code}" is reserved for platform administration and cannot be created or changed through the API`;
  }
  return null;
}

router.post("/roles", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const parsed = CreateRoleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const codeError = reservedCodeError(parsed.data.code);
  if (codeError) {
    res.status(403).json({ error: codeError });
    return;
  }
  // isSystem is set only by the bootstrap path, never from a request body.
  const [role] = await db.insert(rolesTable).values({ ...parsed.data, isSystem: false }).returning();
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
  const codeError = reservedCodeError(parsed.data.code);
  if (codeError) {
    res.status(403).json({ error: codeError });
    return;
  }

  // A system role is platform-owned; renaming or re-coding one through the API
  // is how an attacker would try to reach the isSystem half of the superadmin
  // check without going through the reserved-code half.
  const [existing] = await db.select().from(rolesTable).where(eq(rolesTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Role not found" });
    return;
  }
  if (existing.isSystem) {
    res.status(403).json({ error: "System roles cannot be modified through the API" });
    return;
  }

  // isSystem is never accepted from a request body — see reservedCodeError.
  const { isSystem: _ignoredIsSystem, ...safeUpdate } = parsed.data as typeof parsed.data & { isSystem?: boolean };
  const [role] = await db.update(rolesTable).set(safeUpdate).where(eq(rolesTable.id, params.data.id)).returning();
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
