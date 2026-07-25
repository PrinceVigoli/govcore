import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, workflowVersionsTable } from "@workspace/db";
import { GetWorkflowVersionParams, PublishWorkflowVersionParams } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { logAudit } from "../lib/audit";
import type { JwtPayload } from "../lib/auth";
import { serializeVersion, getVersionGraph } from "../lib/workflowEngine";

const router = Router();

router.get("/workflow-versions/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetWorkflowVersionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [version] = await db.select().from(workflowVersionsTable).where(eq(workflowVersionsTable.id, params.data.id));
  if (!version) {
    res.status(404).json({ error: "Workflow version not found" });
    return;
  }
  const { states, transitions } = await getVersionGraph(version.id);
  res.json({ ...serializeVersion(version), states, transitions });
});

router.post("/workflow-versions/:id/publish", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const params = PublishWorkflowVersionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [version] = await db
    .update(workflowVersionsTable)
    .set({ isPublished: true, publishedAt: new Date() })
    .where(eq(workflowVersionsTable.id, params.data.id))
    .returning();
  if (!version) {
    res.status(404).json({ error: "Workflow version not found" });
    return;
  }
  await logAudit({ actor, action: "publish", resource: "workflow_version", resourceId: version.id });
  res.json(serializeVersion(version));
});

export default router;
