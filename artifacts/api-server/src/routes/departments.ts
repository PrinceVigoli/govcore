import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, departmentsTable } from "@workspace/db";
import {
  CreateDepartmentBody,
  UpdateDepartmentBody,
  GetDepartmentParams,
  UpdateDepartmentParams,
  DeleteDepartmentParams,
  ListDepartmentsQueryParams,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { logAudit } from "../lib/audit";
import type { JwtPayload } from "../lib/auth";

const router = Router();

function serializeDept(d: typeof departmentsTable.$inferSelect) {
  return {
    ...d,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

router.get("/departments", requireAuth, async (req, res): Promise<void> => {
  const q = ListDepartmentsQueryParams.safeParse(req.query);
  const query = db.select().from(departmentsTable);
  const conditions = [];
  if (q.success && q.data.tenantId) {
    conditions.push(eq(departmentsTable.tenantId, q.data.tenantId));
  }
  const depts = conditions.length > 0
    ? await db.select().from(departmentsTable).where(and(...conditions)).orderBy(departmentsTable.name)
    : await db.select().from(departmentsTable).orderBy(departmentsTable.name);
  void query;
  res.json(depts.map(serializeDept));
});

router.post("/departments", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const parsed = CreateDepartmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [dept] = await db.insert(departmentsTable).values(parsed.data).returning();
  await logAudit({ actor, action: "create", resource: "department", resourceId: dept.id });
  res.status(201).json(serializeDept(dept));
});

router.get("/departments/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetDepartmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [dept] = await db.select().from(departmentsTable).where(eq(departmentsTable.id, params.data.id));
  if (!dept) {
    res.status(404).json({ error: "Department not found" });
    return;
  }
  res.json(serializeDept(dept));
});

router.patch("/departments/:id", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const params = UpdateDepartmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateDepartmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [dept] = await db
    .update(departmentsTable)
    .set(parsed.data)
    .where(eq(departmentsTable.id, params.data.id))
    .returning();
  if (!dept) {
    res.status(404).json({ error: "Department not found" });
    return;
  }
  await logAudit({ actor, action: "update", resource: "department", resourceId: dept.id });
  res.json(serializeDept(dept));
});

router.delete("/departments/:id", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const params = DeleteDepartmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [dept] = await db.delete(departmentsTable).where(eq(departmentsTable.id, params.data.id)).returning();
  if (!dept) {
    res.status(404).json({ error: "Department not found" });
    return;
  }
  await logAudit({ actor, action: "delete", resource: "department", resourceId: params.data.id });
  res.sendStatus(204);
});

export default router;
