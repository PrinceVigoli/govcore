import { Router } from "express";
import { search, listSearchableEntityTypes, reindexAll } from "@workspace/search";
import { SearchQueryParams } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import type { JwtPayload } from "../lib/auth";

// Search API (Sprint 2A). Validates with the generated `@workspace/api-zod`
// schemas, same as every other route — the inline zod stand-in the checkpoint
// used has been replaced now that codegen can run.

const router = Router();

router.get("/search", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const q = SearchQueryParams.safeParse(req.query);
  if (!q.success) {
    res.status(400).json({ error: q.error.message });
    return;
  }
  const entityTypes = q.data.entityTypes
    ? q.data.entityTypes.split(",").map((t) => t.trim()).filter(Boolean)
    : undefined;

  const result = await search({
    tenantId: actor.tenantId,
    userId: actor.userId,
    query: q.data.query,
    entityTypes,
    limit: q.data.limit,
  });
  res.json(result);
});

router.get("/search/entity-types", requireAuth, async (_req, res): Promise<void> => {
  res.json({ entityTypes: listSearchableEntityTypes() });
});

router.post("/search/reindex", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const results = await reindexAll(actor.tenantId);
  res.json({ tenantId: actor.tenantId, results });
});

export default router;
