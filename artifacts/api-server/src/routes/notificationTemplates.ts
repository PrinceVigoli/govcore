import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, notificationTemplatesTable } from "@workspace/db";
import {
  ListNotificationTemplatesQueryParams,
  CreateNotificationTemplateBody,
  GetNotificationTemplateParams,
  UpdateNotificationTemplateParams,
  UpdateNotificationTemplateBody,
  PublishNotificationTemplateParams,
  PreviewNotificationTemplateParams,
  PreviewNotificationTemplateBody,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { logAudit } from "../lib/audit";
import type { JwtPayload } from "../lib/auth";
import { serializeTemplate, renderTemplate } from "../lib/notificationEngine";

const router = Router();

router.get("/notification-templates", requireAuth, async (req, res): Promise<void> => {
  const q = ListNotificationTemplatesQueryParams.safeParse(req.query);
  const conditions = [];
  if (q.success && q.data.tenantId) conditions.push(eq(notificationTemplatesTable.tenantId, q.data.tenantId));
  if (q.success && q.data.channel) conditions.push(eq(notificationTemplatesTable.channel, q.data.channel));
  if (q.success && q.data.status) conditions.push(eq(notificationTemplatesTable.status, q.data.status));

  const templates = conditions.length > 0
    ? await db.select().from(notificationTemplatesTable).where(and(...conditions)).orderBy(notificationTemplatesTable.code, desc(notificationTemplatesTable.version))
    : await db.select().from(notificationTemplatesTable).orderBy(notificationTemplatesTable.code, desc(notificationTemplatesTable.version));

  res.json(templates.map(serializeTemplate));
});

// Creates a new draft. Templates are versioned rather than mutated
// (ADR-0017), so this auto-increments `version` within a code/channel/locale
// family instead of overwriting whatever is already there.
router.post("/notification-templates", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const parsed = CreateNotificationTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const locale = parsed.data.locale ?? "en";
  const siblings = await db
    .select()
    .from(notificationTemplatesTable)
    .where(
      and(
        eq(notificationTemplatesTable.tenantId, parsed.data.tenantId),
        eq(notificationTemplatesTable.code, parsed.data.code),
        eq(notificationTemplatesTable.channel, parsed.data.channel),
        eq(notificationTemplatesTable.locale, locale),
      ),
    );
  const nextVersion = siblings.length > 0 ? Math.max(...siblings.map((s) => s.version)) + 1 : 1;

  const [template] = await db
    .insert(notificationTemplatesTable)
    .values({
      tenantId: parsed.data.tenantId,
      name: parsed.data.name,
      code: parsed.data.code,
      channel: parsed.data.channel,
      locale,
      version: nextVersion,
      subject: parsed.data.subject ?? null,
      body: parsed.data.body,
      variables: parsed.data.variables ? JSON.stringify(parsed.data.variables) : null,
      status: "draft",
    })
    .returning();

  await logAudit({ actor, action: "create", resource: "notification_template", resourceId: template.id });
  res.status(201).json(serializeTemplate(template));
});

router.get("/notification-templates/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetNotificationTemplateParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [template] = await db.select().from(notificationTemplatesTable).where(eq(notificationTemplatesTable.id, params.data.id));
  if (!template) {
    res.status(404).json({ error: "Template not found" });
    return;
  }
  res.json(serializeTemplate(template));
});

// Only drafts are editable: once a template is active it may already have
// rendered messages that recipients received, and ADR-0017 exists to preserve
// exactly those. Editing a live template is a 409 pointing at versioning.
router.patch("/notification-templates/:id", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const params = UpdateNotificationTemplateParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateNotificationTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select().from(notificationTemplatesTable).where(eq(notificationTemplatesTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Template not found" });
    return;
  }
  if (existing.status !== "draft") {
    res.status(409).json({ error: "Only draft templates can be edited. Create a new version instead." });
    return;
  }

  const [template] = await db
    .update(notificationTemplatesTable)
    .set({
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.subject !== undefined ? { subject: parsed.data.subject } : {}),
      ...(parsed.data.body !== undefined ? { body: parsed.data.body } : {}),
      ...(parsed.data.variables !== undefined ? { variables: JSON.stringify(parsed.data.variables) } : {}),
      ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
    })
    .where(eq(notificationTemplatesTable.id, params.data.id))
    .returning();

  await logAudit({ actor, action: "update", resource: "notification_template", resourceId: template.id });
  res.json(serializeTemplate(template));
});

// Activates a draft and deprecates whatever was active for the same
// code/channel/locale, so resolveTemplate() always finds exactly one.
router.post("/notification-templates/:id/publish", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const params = PublishNotificationTemplateParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [template] = await db.select().from(notificationTemplatesTable).where(eq(notificationTemplatesTable.id, params.data.id));
  if (!template) {
    res.status(404).json({ error: "Template not found" });
    return;
  }

  const updated = await db.transaction(async (tx) => {
    await tx
      .update(notificationTemplatesTable)
      .set({ status: "deprecated" })
      .where(
        and(
          eq(notificationTemplatesTable.tenantId, template.tenantId),
          eq(notificationTemplatesTable.code, template.code),
          eq(notificationTemplatesTable.channel, template.channel),
          eq(notificationTemplatesTable.locale, template.locale),
          eq(notificationTemplatesTable.status, "active"),
        ),
      );
    const [row] = await tx
      .update(notificationTemplatesTable)
      .set({ status: "active" })
      .where(eq(notificationTemplatesTable.id, template.id))
      .returning();
    return row;
  });

  await logAudit({ actor, action: "publish", resource: "notification_template", resourceId: template.id });
  res.json(serializeTemplate(updated));
});

// Renders without sending — lets an admin check a template against a realistic
// payload and see which placeholders are still unresolved.
router.post("/notification-templates/:id/preview", requireAuth, async (req, res): Promise<void> => {
  const params = PreviewNotificationTemplateParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = PreviewNotificationTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [template] = await db.select().from(notificationTemplatesTable).where(eq(notificationTemplatesTable.id, params.data.id));
  if (!template) {
    res.status(404).json({ error: "Template not found" });
    return;
  }

  res.json(renderTemplate(template, parsed.data.payload as Record<string, unknown>));
});

export default router;
