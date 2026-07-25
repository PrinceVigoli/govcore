import { Router } from "express";
import { eq, asc } from "drizzle-orm";
import { db, ruleHistoryTable } from "@workspace/db";
import { ListRuleHistoryParams } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { serializeRuleHistory } from "../lib/rulesEngine";

const router = Router();

router.get("/rule-history/:ruleId", requireAuth, async (req, res): Promise<void> => {
  const params = ListRuleHistoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const history = await db
    .select()
    .from(ruleHistoryTable)
    .where(eq(ruleHistoryTable.ruleId, params.data.ruleId))
    .orderBy(asc(ruleHistoryTable.createdAt));
  res.json(history.map(serializeRuleHistory));
});

export default router;
