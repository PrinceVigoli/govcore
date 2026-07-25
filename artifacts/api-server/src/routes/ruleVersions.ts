import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, ruleVersionsTable, ruleHistoryTable } from "@workspace/db";
import { GetRuleVersionParams, PublishRuleVersionParams } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { logAudit } from "../lib/audit";
import type { JwtPayload } from "../lib/auth";
import { serializeRuleVersion, getVersionGraph } from "../lib/rulesEngine";

const router = Router();

router.get("/rule-versions/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetRuleVersionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [version] = await db.select().from(ruleVersionsTable).where(eq(ruleVersionsTable.id, params.data.id));
  if (!version) {
    res.status(404).json({ error: "Rule version not found" });
    return;
  }
  const { groups, conditions, actions } = await getVersionGraph(version.id);
  res.json({ ...serializeRuleVersion(version), groups, conditions, actions });
});

// Moves a draft/testing version straight to "active" (see Book 06 §5 for the
// full draft -> testing -> published -> active -> deprecated -> archived
// lifecycle; this endpoint collapses the publish+activate step into one call,
// matching how workflow versions are published in this codebase). Any other
// version of the same rule that is currently active is demoted to
// "deprecated" so at most one version is ever live per rule.
router.post("/rule-versions/:id/publish", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const params = PublishRuleVersionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [version] = await db.select().from(ruleVersionsTable).where(eq(ruleVersionsTable.id, params.data.id));
  if (!version) {
    res.status(404).json({ error: "Rule version not found" });
    return;
  }

  const updated = await db.transaction(async (tx) => {
    await tx
      .update(ruleVersionsTable)
      .set({ status: "deprecated" })
      .where(eq(ruleVersionsTable.ruleId, version.ruleId));
    const [row] = await tx
      .update(ruleVersionsTable)
      .set({ status: "active", publishedAt: new Date() })
      .where(eq(ruleVersionsTable.id, version.id))
      .returning();
    await tx.insert(ruleHistoryTable).values({
      ruleId: version.ruleId,
      ruleVersionId: version.id,
      eventType: "published",
      actorUserId: actor.userId,
    });
    return row;
  });

  await logAudit({ actor, action: "publish", resource: "rule_version", resourceId: version.id });
  res.json(serializeRuleVersion(updated));
});

export default router;
