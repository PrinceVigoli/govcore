import { Router } from "express";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, usersTable, userRolesTable, rolesTable } from "@workspace/db";
import {
  CreateUserBody,
  UpdateUserBody,
  GetUserParams,
  UpdateUserParams,
  DeleteUserParams,
  UpdateUserStatusParams,
  UpdateUserStatusBody,
  GetUserRolesParams,
  AssignUserRoleParams,
  AssignUserRoleBody,
  RemoveUserRoleParams,
  ListUsersQueryParams,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { logAudit } from "../lib/audit";
import type { JwtPayload } from "../lib/auth";

const router = Router();

function serializeUser(u: typeof usersTable.$inferSelect) {
  const { passwordHash: _, ...rest } = u;
  void _;
  return {
    ...rest,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  };
}

router.get("/users", requireAuth, async (req, res): Promise<void> => {
  const q = ListUsersQueryParams.safeParse(req.query);
  const conditions = [];
  if (q.success) {
    if (q.data.tenantId) conditions.push(eq(usersTable.tenantId, q.data.tenantId));
    if (q.data.departmentId) conditions.push(eq(usersTable.departmentId, q.data.departmentId));
    if (q.data.status) conditions.push(eq(usersTable.status, q.data.status));
  }
  const users = conditions.length > 0
    ? await db.select().from(usersTable).where(and(...conditions)).orderBy(usersTable.lastName)
    : await db.select().from(usersTable).orderBy(usersTable.lastName);
  res.json(users.map(serializeUser));
});

router.post("/users", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { password, ...rest } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db.insert(usersTable).values({ ...rest, passwordHash }).returning();
  await logAudit({ actor, action: "create", resource: "user", resourceId: user.id });
  res.status(201).json(serializeUser(user));
});

router.get("/users/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const userRoles = await db
    .select({ role: rolesTable })
    .from(userRolesTable)
    .innerJoin(rolesTable, eq(userRolesTable.roleId, rolesTable.id))
    .where(eq(userRolesTable.userId, user.id));
  const roles = userRoles.map((r) => ({
    ...r.role,
    createdAt: r.role.createdAt.toISOString(),
    updatedAt: r.role.updatedAt.toISOString(),
  }));
  res.json({ ...serializeUser(user), roles });
});

router.patch("/users/:id", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const params = UpdateUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [user] = await db.update(usersTable).set(parsed.data).where(eq(usersTable.id, params.data.id)).returning();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  await logAudit({ actor, action: "update", resource: "user", resourceId: user.id });
  res.json(serializeUser(user));
});

router.delete("/users/:id", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const params = DeleteUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [user] = await db.delete(usersTable).where(eq(usersTable.id, params.data.id)).returning();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  await logAudit({ actor, action: "delete", resource: "user", resourceId: params.data.id });
  res.sendStatus(204);
});

router.patch("/users/:id/status", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const params = UpdateUserStatusParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateUserStatusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [user] = await db
    .update(usersTable)
    .set({ status: parsed.data.status })
    .where(eq(usersTable.id, params.data.id))
    .returning();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  await logAudit({ actor, action: `status_change:${parsed.data.status}`, resource: "user", resourceId: user.id });
  res.json(serializeUser(user));
});

router.get("/users/:id/roles", requireAuth, async (req, res): Promise<void> => {
  const params = GetUserRolesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const userRoles = await db
    .select({ role: rolesTable })
    .from(userRolesTable)
    .innerJoin(rolesTable, eq(userRolesTable.roleId, rolesTable.id))
    .where(eq(userRolesTable.userId, params.data.id));
  res.json(userRoles.map((r) => ({
    ...r.role,
    createdAt: r.role.createdAt.toISOString(),
    updatedAt: r.role.updatedAt.toISOString(),
  })));
});

router.post("/users/:id/roles", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const params = AssignUserRoleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = AssignUserRoleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await db.insert(userRolesTable).values({ userId: params.data.id, roleId: parsed.data.roleId }).onConflictDoNothing();
  await logAudit({ actor, action: "assign_role", resource: "user", resourceId: params.data.id, details: `roleId: ${parsed.data.roleId}` });
  res.sendStatus(204);
});

router.delete("/users/:id/roles/:roleId", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const params = RemoveUserRoleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db
    .delete(userRolesTable)
    .where(and(eq(userRolesTable.userId, params.data.id), eq(userRolesTable.roleId, params.data.roleId)));
  await logAudit({ actor, action: "remove_role", resource: "user", resourceId: params.data.id, details: `roleId: ${params.data.roleId}` });
  res.sendStatus(204);
});

export default router;
