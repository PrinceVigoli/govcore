import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, attachmentsTable } from "@workspace/db";
import {
  ListAttachmentsQueryParams,
  CreateAttachmentBody,
  GetAttachmentParams,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { logAudit } from "../lib/audit";
import type { JwtPayload } from "../lib/auth";
import { serializeAttachment, createAttachment } from "../lib/documentEngine";

const router = Router();

router.get("/attachments", requireAuth, async (req, res): Promise<void> => {
  const q = ListAttachmentsQueryParams.safeParse(req.query);
  const conditions = [];
  if (q.success && q.data.tenantId) conditions.push(eq(attachmentsTable.tenantId, q.data.tenantId));
  if (q.success && q.data.attachedToType) conditions.push(eq(attachmentsTable.attachedToType, q.data.attachedToType));
  if (q.success && q.data.attachedToId) conditions.push(eq(attachmentsTable.attachedToId, q.data.attachedToId));
  if (q.success && q.data.documentId) conditions.push(eq(attachmentsTable.documentId, q.data.documentId));

  const rows = conditions.length > 0
    ? await db.select().from(attachmentsTable).where(and(...conditions)).orderBy(desc(attachmentsTable.createdAt))
    : await db.select().from(attachmentsTable).orderBy(desc(attachmentsTable.createdAt)).limit(200);

  // serializeAttachment drops `content`: a list must never ship every file's bytes.
  res.json(rows.map(serializeAttachment));
});

/**
 * Uploads a file and returns its record. The `uuid` in the response is what a
 * Book 07 form stores in `submission_values` for a file_upload / image /
 * signature field — replacing the bare, unbacked storage string those fields
 * used to hold.
 */
router.post("/attachments", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const parsed = CreateAttachmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const attachment = await createAttachment({
    tenantId: parsed.data.tenantId,
    fileName: parsed.data.fileName,
    mimeType: parsed.data.mimeType,
    content: parsed.data.content,
    attachedToType: parsed.data.attachedToType,
    attachedToId: parsed.data.attachedToId,
    fieldKey: parsed.data.fieldKey,
    documentId: parsed.data.documentId,
    uploadedByUserId: actor?.userId,
  });

  await logAudit({ actor, action: "upload", resource: "attachment", resourceId: attachment.id });
  res.status(201).json(serializeAttachment(attachment));
});

router.get("/attachments/:uuid", requireAuth, async (req, res): Promise<void> => {
  const params = GetAttachmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [attachment] = await db.select().from(attachmentsTable).where(eq(attachmentsTable.uuid, params.data.uuid));
  if (!attachment) {
    res.status(404).json({ error: "Attachment not found" });
    return;
  }
  // This endpoint intentionally includes `content` — it's the download path.
  res.json({ ...serializeAttachment(attachment), content: attachment.content });
});

export default router;
