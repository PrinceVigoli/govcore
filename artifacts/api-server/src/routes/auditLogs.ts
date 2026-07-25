import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, auditLogsTable } from "@workspace/db";
import { ListAuditLogsQueryParams } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";

const router = Router();

function serializeLog(l: typeof auditLogsTable.$inferSelect) {
  return {
    ...l,
    createdAt: l.createdAt.toISOString(),
  };
}

router.get("/audit-logs", requireAuth, async (req, res): Promise<void> => {
  const q = ListAuditLogsQueryParams.safeParse(req.query);
  const conditions = [];
  let limit = 100;
  if (q.success) {
    if (q.data.tenantId) conditions.push(eq(auditLogsTable.tenantId, q.data.tenantId));
    if (q.data.userId) conditions.push(eq(auditLogsTable.userId, q.data.userId));
    if (q.data.resource) conditions.push(eq(auditLogsTable.resource, q.data.resource));
    if (q.data.limit) limit = q.data.limit;
  }
  const logs = conditions.length > 0
    ? await db.select().from(auditLogsTable).where(and(...conditions)).orderBy(desc(auditLogsTable.createdAt)).limit(limit)
    : await db.select().from(auditLogsTable).orderBy(desc(auditLogsTable.createdAt)).limit(limit);
  res.json(logs.map(serializeLog));
});

export default router;
