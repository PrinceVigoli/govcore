import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, userRolesTable, rolesTable } from "@workspace/db";
import { LoginBody } from "@workspace/api-zod";
import { requireAuth, getActor } from "../lib/auth";
import { logAudit } from "../lib/audit";
import type { JwtPayload } from "../lib/auth";

const router = Router();

router.post("/auth/login", async (req, res): Promise<void> => {
  LoginBody.safeParse(req.body);
  res.status(410).json({ error: "GovCore sign-in is managed by Clerk. Use the sign-in screen." });
});

router.post("/auth/logout", requireAuth, async (req, res): Promise<void> => {
  const actor = getActor(req);
  await logAudit({ actor, action: "logout", resource: "user", resourceId: actor.userId, ipAddress: req.ip });
  res.sendStatus(204);
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const actor = getActor(req);

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

  await db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));
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
