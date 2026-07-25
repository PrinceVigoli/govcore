import { Router } from "express";
import { eq, asc } from "drizzle-orm";
import { db, workflowHistoryTable } from "@workspace/db";
import { ListWorkflowHistoryParams } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { serializeHistory } from "../lib/workflowEngine";

const router = Router();

router.get("/workflow-history/:instanceId", requireAuth, async (req, res): Promise<void> => {
  const params = ListWorkflowHistoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const history = await db
    .select()
    .from(workflowHistoryTable)
    .where(eq(workflowHistoryTable.workflowInstanceId, params.data.instanceId))
    .orderBy(asc(workflowHistoryTable.createdAt));
  res.json(history.map(serializeHistory));
});

export default router;
