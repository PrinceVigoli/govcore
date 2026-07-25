import { Router } from "express";
import { eq, count, and, desc } from "drizzle-orm";
import { db, tenantsTable, usersTable, rolesTable, permissionsTable, departmentsTable, auditLogsTable } from "@workspace/db";
import { GetRecentActivityQueryParams } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { sql } from "drizzle-orm";

const router = Router();

router.get("/identity/stats", requireAuth, async (_req, res): Promise<void> => {
  const [[totalTenants], [activeTenants], [totalUsers], [activeUsers], [suspendedUsers], [totalRoles], [totalPermissions], [totalDepartments], [recentLogins]] =
    await Promise.all([
      db.select({ value: count() }).from(tenantsTable),
      db.select({ value: count() }).from(tenantsTable).where(eq(tenantsTable.status, "active")),
      db.select({ value: count() }).from(usersTable),
      db.select({ value: count() }).from(usersTable).where(eq(usersTable.status, "active")),
      db.select({ value: count() }).from(usersTable).where(eq(usersTable.status, "suspended")),
      db.select({ value: count() }).from(rolesTable),
      db.select({ value: count() }).from(permissionsTable),
      db.select({ value: count() }).from(departmentsTable),
      db.select({ value: count() }).from(auditLogsTable).where(
        and(
          eq(auditLogsTable.action, "login"),
          sql`${auditLogsTable.createdAt} > NOW() - INTERVAL '24 hours'`
        )
      ),
    ]);

  res.json({
    totalTenants: totalTenants.value,
    activeTenants: activeTenants.value,
    totalUsers: totalUsers.value,
    activeUsers: activeUsers.value,
    suspendedUsers: suspendedUsers.value,
    totalRoles: totalRoles.value,
    totalPermissions: totalPermissions.value,
    totalDepartments: totalDepartments.value,
    recentLogins: recentLogins.value,
  });
});

router.get("/identity/recent-activity", requireAuth, async (req, res): Promise<void> => {
  const q = GetRecentActivityQueryParams.safeParse(req.query);
  const limit = q.success && q.data.limit ? q.data.limit : 20;
  const logs = await db
    .select()
    .from(auditLogsTable)
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(limit);
  res.json(logs.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() })));
});

export default router;
