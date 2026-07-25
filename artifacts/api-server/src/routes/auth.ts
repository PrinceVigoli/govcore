import { Router } from "express";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, usersTable, userRolesTable, rolesTable } from "@workspace/db";
import { LoginBody } from "@workspace/api-zod";
import { signToken, requireAuth } from "../lib/auth";
import { logAudit } from "../lib/audit";
import type { JwtPayload } from "../lib/auth";

const router = Router();

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { username, password } = parsed.data;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.username, username));

  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  if (user.status !== "active") {
    res.status(401).json({ error: "Account is not active" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  // Update last login
  await db
    .update(usersTable)
    .set({ lastLoginAt: new Date() })
    .where(eq(usersTable.id, user.id));

  // Fetch roles
  const userRoles = await db
    .select({ role: rolesTable })
    .from(userRolesTable)
    .innerJoin(rolesTable, eq(userRolesTable.roleId, rolesTable.id))
    .where(eq(userRolesTable.userId, user.id));

  const roles = userRoles.map((r) => r.role);

  const payload: JwtPayload = {
    userId: user.id,
    tenantId: user.tenantId,
    username: user.username,
  };

  const token = signToken(payload);

  await logAudit({
    actor: payload,
    action: "login",
    resource: "user",
    resourceId: user.id,
    ipAddress: req.ip,
  });

  res.json({
    token,
    user: {
      id: user.id,
      tenantId: user.tenantId,
      departmentId: user.departmentId,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      username: user.username,
      status: user.status,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      roles,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    },
  });
});

router.post("/auth/logout", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  await logAudit({ actor, action: "logout", resource: "user", resourceId: actor.userId, ipAddress: req.ip });
  res.sendStatus(204);
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, actor.userId));

  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  const userRoles = await db
    .select({ role: rolesTable })
    .from(userRolesTable)
    .innerJoin(rolesTable, eq(userRolesTable.roleId, rolesTable.id))
    .where(eq(userRolesTable.userId, user.id));

  const roles = userRoles.map((r) => r.role);

  res.json({
    id: user.id,
    tenantId: user.tenantId,
    departmentId: user.departmentId,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    username: user.username,
    status: user.status,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    roles,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  });
});

export default router;
