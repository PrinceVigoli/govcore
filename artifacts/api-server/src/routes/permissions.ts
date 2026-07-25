import { Router } from "express";
import { db, permissionsTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";

const router = Router();

router.get("/permissions", requireAuth, async (_req, res): Promise<void> => {
  const perms = await db.select().from(permissionsTable).orderBy(permissionsTable.module, permissionsTable.action);
  res.json(perms);
});

export default router;
