import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, documentTemplatesTable } from "@workspace/db";
import {
  ListDocumentTemplatesQueryParams,
  CreateDocumentTemplateBody,
  GetDocumentTemplateParams,
  UpdateDocumentTemplateParams,
  UpdateDocumentTemplateBody,
  PublishDocumentTemplateParams,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { logAudit } from "../lib/audit";
import type { JwtPayload } from "../lib/auth";
import { serializeDocumentTemplate } from "../lib/documentEngine";

const router = Router();

router.get("/document-templates", requireAuth, async (req, res): Promise<void> => {
  const q = ListDocumentTemplatesQueryParams.safeParse(req.query);
  const conditions = [];
  if (q.success && q.data.tenantId) conditions.push(eq(documentTemplatesTable.tenantId, q.data.tenantId));
  if (q.success && q.data.module) conditions.push(eq(documentTemplatesTable.module, q.data.module));
  if (q.success && q.data.status) conditions.push(eq(documentTemplatesTable.status, q.data.status));

  const templates = conditions.length > 0
    ? await db.select().from(documentTemplatesTable).where(and(...conditions)).orderBy(documentTemplatesTable.code, desc(documentTemplatesTable.version))
    : await db.select().from(documentTemplatesTable).orderBy(documentTemplatesTable.code, desc(documentTemplatesTable.version));

  res.json(templates.map(serializeDocumentTemplate));
});

// Creates a new draft, auto-incrementing `version` within a code/locale family
// (ADR-0021: history is immutable, so revisions add rather than overwrite).
router.post("/document-templates", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const parsed = CreateDocumentTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const locale = parsed.data.locale ?? "en";
  const siblings = await db
    .select()
    .from(documentTemplatesTable)
    .where(
      and(
        eq(documentTemplatesTable.tenantId, parsed.data.tenantId),
        eq(documentTemplatesTable.code, parsed.data.code),
        eq(documentTemplatesTable.locale, locale),
      ),
    );
  const nextVersion = siblings.length > 0 ? Math.max(...siblings.map((s) => s.version)) + 1 : 1;

  const [template] = await db
    .insert(documentTemplatesTable)
    .values({
      tenantId: parsed.data.tenantId,
      name: parsed.data.name,
      code: parsed.data.code,
      description: parsed.data.description ?? null,
      module: parsed.data.module,
      documentType: parsed.data.documentType,
      templateType: parsed.data.templateType ?? "html",
      locale,
      version: nextVersion,
      body: parsed.data.body,
      variables: parsed.data.variables ? JSON.stringify(parsed.data.variables) : null,
      status: "draft",
    })
    .returning();

  await logAudit({ actor, action: "create", resource: "document_template", resourceId: template.id });
  res.status(201).json(serializeDocumentTemplate(template));
});

router.get("/document-templates/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetDocumentTemplateParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [template] = await db.select().from(documentTemplatesTable).where(eq(documentTemplatesTable.id, params.data.id));
  if (!template) {
    res.status(404).json({ error: "Template not found" });
    return;
  }
  res.json(serializeDocumentTemplate(template));
});

// Only drafts are editable: an active template may already have produced
// certificates citizens are holding, and ADR-0021 exists to preserve exactly
// those.
router.patch("/document-templates/:id", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const params = UpdateDocumentTemplateParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateDocumentTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select().from(documentTemplatesTable).where(eq(documentTemplatesTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Template not found" });
    return;
  }
  if (existing.status !== "draft") {
    res.status(409).json({ error: "Only draft templates can be edited. Create a new version instead." });
    return;
  }

  const [template] = await db
    .update(documentTemplatesTable)
    .set({
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
      ...(parsed.data.body !== undefined ? { body: parsed.data.body } : {}),
      ...(parsed.data.variables !== undefined ? { variables: JSON.stringify(parsed.data.variables) } : {}),
      ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
    })
    .where(eq(documentTemplatesTable.id, params.data.id))
    .returning();

  await logAudit({ actor, action: "update", resource: "document_template", resourceId: template.id });
  res.json(serializeDocumentTemplate(template));
});

router.post("/document-templates/:id/publish", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const params = PublishDocumentTemplateParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [template] = await db.select().from(documentTemplatesTable).where(eq(documentTemplatesTable.id, params.data.id));
  if (!template) {
    res.status(404).json({ error: "Template not found" });
    return;
  }

  const updated = await db.transaction(async (tx) => {
    await tx
      .update(documentTemplatesTable)
      .set({ status: "deprecated" })
      .where(
        and(
          eq(documentTemplatesTable.tenantId, template.tenantId),
          eq(documentTemplatesTable.code, template.code),
          eq(documentTemplatesTable.locale, template.locale),
          eq(documentTemplatesTable.status, "active"),
        ),
      );
    const [row] = await tx
      .update(documentTemplatesTable)
      .set({ status: "active" })
      .where(eq(documentTemplatesTable.id, template.id))
      .returning();
    return row;
  });

  await logAudit({ actor, action: "publish", resource: "document_template", resourceId: template.id });
  res.json(serializeDocumentTemplate(updated));
});

export default router;
