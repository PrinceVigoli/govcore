import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, formVersionsTable } from "@workspace/db";
import { GetFormVersionParams, PublishFormVersionParams } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { logAudit } from "../lib/audit";
import type { JwtPayload } from "../lib/auth";
import { serializeFormVersion, getVersionTree } from "../lib/formsEngine";

const router = Router();

router.get("/form-versions/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetFormVersionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [version] = await db.select().from(formVersionsTable).where(eq(formVersionsTable.id, params.data.id));
  if (!version) {
    res.status(404).json({ error: "Form version not found" });
    return;
  }
  const { sections } = await getVersionTree(version.id);
  res.json({ ...serializeFormVersion(version), sections });
});

// Moves a draft/testing version straight to "active" (Book 07 §8: draft ->
// testing -> published -> active -> deprecated -> archived; this endpoint
// collapses publish+activate into one call, matching how rule versions are
// published in this codebase — see Book 06's rule-versions/:id/publish).
// Any other version of the same form that is currently active is demoted to
// "deprecated" so at most one version is ever live per form, keeping
// published forms immutable (ADR-0014) while still allowing exactly one
// current layout to be in effect.
router.post("/form-versions/:id/publish", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const params = PublishFormVersionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [version] = await db.select().from(formVersionsTable).where(eq(formVersionsTable.id, params.data.id));
  if (!version) {
    res.status(404).json({ error: "Form version not found" });
    return;
  }

  const updated = await db.transaction(async (tx) => {
    await tx
      .update(formVersionsTable)
      .set({ status: "deprecated" })
      .where(eq(formVersionsTable.formId, version.formId));
    const [row] = await tx
      .update(formVersionsTable)
      .set({ status: "active", publishedAt: new Date() })
      .where(eq(formVersionsTable.id, version.id))
      .returning();
    return row;
  });

  await logAudit({ actor, action: "publish", resource: "form_version", resourceId: version.id });
  res.json(serializeFormVersion(updated));
});

export default router;
