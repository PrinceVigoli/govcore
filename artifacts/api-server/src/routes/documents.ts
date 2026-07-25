import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import {
  db,
  documentsTable,
  documentVersionsTable,
  documentSignaturesTable,
  documentAccessLogsTable,
  documentTemplatesTable,
  attachmentsTable,
} from "@workspace/db";
import {
  ListDocumentsQueryParams,
  CreateDocumentBody,
  GetDocumentParams,
  GenerateDocumentParams,
  GenerateDocumentBody,
  UpdateDocumentStatusParams,
  UpdateDocumentStatusBody,
  GetDocumentContentParams,
  SignDocumentParams,
  SignDocumentBody,
  ListDocumentAccessLogsParams,
  VerifyDocumentParams,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { logAudit } from "../lib/audit";
import type { JwtPayload } from "../lib/auth";
import {
  serializeDocument,
  serializeDocumentVersion,
  serializeSignature,
  serializeAccessLog,
  serializeAttachment,
  resolveTemplate,
  renderTemplate,
  generateVersion,
  nextReferenceNumber,
  canTransition,
  verifyDocument,
  logAccess,
} from "../lib/documentEngine";

const router = Router();

/** Assembles the full detail payload shared by create/get/generate. */
async function loadDetail(documentId: number) {
  const [document] = await db.select().from(documentsTable).where(eq(documentsTable.id, documentId));
  if (!document) return null;

  const [versions, signatures, attachments] = await Promise.all([
    db.select().from(documentVersionsTable).where(eq(documentVersionsTable.documentId, documentId)).orderBy(desc(documentVersionsTable.version)),
    db.select().from(documentSignaturesTable).where(eq(documentSignaturesTable.documentId, documentId)),
    db.select().from(attachmentsTable).where(eq(attachmentsTable.documentId, documentId)),
  ]);

  return {
    ...serializeDocument(document),
    versions: versions.map(serializeDocumentVersion),
    signatures: signatures.map(serializeSignature),
    attachments: attachments.map(serializeAttachment),
  };
}

router.get("/documents", requireAuth, async (req, res): Promise<void> => {
  const q = ListDocumentsQueryParams.safeParse(req.query);
  const conditions = [];
  if (q.success && q.data.tenantId) conditions.push(eq(documentsTable.tenantId, q.data.tenantId));
  if (q.success && q.data.module) conditions.push(eq(documentsTable.module, q.data.module));
  if (q.success && q.data.documentType) conditions.push(eq(documentsTable.documentType, q.data.documentType));
  if (q.success && q.data.status) conditions.push(eq(documentsTable.status, q.data.status));
  if (q.success && q.data.resourceType) conditions.push(eq(documentsTable.resourceType, q.data.resourceType));
  if (q.success && q.data.resourceId) conditions.push(eq(documentsTable.resourceId, q.data.resourceId));

  const documents = conditions.length > 0
    ? await db.select().from(documentsTable).where(and(...conditions)).orderBy(desc(documentsTable.createdAt))
    : await db.select().from(documentsTable).orderBy(desc(documentsTable.createdAt));

  res.json(documents.map(serializeDocument));
});

/**
 * Creates a document and, when a template and payload are supplied, generates
 * version 1 in the same request — the common case for "permit approved ->
 * produce the PDF" (§13 Workflow Integration).
 *
 * Rendering is validated before any row is written, so a template with an
 * unresolved placeholder is rejected rather than leaving a half-formed
 * document behind.
 */
router.post("/documents", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const parsed = CreateDocumentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const payload = (parsed.data.payload ?? {}) as Record<string, unknown>;
  const wantsGeneration = parsed.data.generate ?? !!(parsed.data.templateCode && parsed.data.payload);

  let template = null;
  if (parsed.data.templateCode) {
    template = await resolveTemplate({
      tenantId: parsed.data.tenantId,
      code: parsed.data.templateCode,
      locale: parsed.data.locale,
    });
    if (!template) {
      res.status(404).json({ error: `No active template found for code "${parsed.data.templateCode}"` });
      return;
    }
    if (wantsGeneration) {
      const rendered = renderTemplate(template, payload);
      if (rendered.missingVariables.length > 0) {
        res.status(400).json({
          error: "Template variables missing from payload",
          missingVariables: rendered.missingVariables,
        });
        return;
      }
    }
  }

  const documentType = parsed.data.documentType ?? template?.documentType ?? "certificate";

  // Reference-number generation and the row that consumes it must share one
  // transaction: nextReferenceNumber's advisory lock is only held for the
  // life of this transaction, so computing the number here and inserting
  // separately would reopen the race it exists to close.
  const [document] = await db.transaction(async (tx) => {
    const referenceNumber = template
      ? await nextReferenceNumber(tx as unknown as typeof db, { tenantId: parsed.data.tenantId, code: template.code })
      : null;

    return tx
      .insert(documentsTable)
      .values({
        tenantId: parsed.data.tenantId,
        templateId: template?.id ?? null,
        title: parsed.data.title,
        documentType,
        module: parsed.data.module,
        resourceType: parsed.data.resourceType ?? null,
        resourceId: parsed.data.resourceId ?? null,
        referenceNumber,
        status: "draft",
        currentVersion: 0,
        createdByUserId: actor?.userId ?? null,
      })
      .returning();
  });

  await logAccess({
    documentId: document.id,
    tenantId: document.tenantId,
    action: "created",
    actorUserId: actor?.userId,
    ipAddress: req.ip,
  });

  if (template && wantsGeneration) {
    const { version } = await generateVersion({ document, template, payload, actorUserId: actor?.userId });
    await logAccess({
      documentId: document.id,
      documentVersionId: version.id,
      tenantId: document.tenantId,
      action: "generated",
      detail: `Version ${version.version}`,
      actorUserId: actor?.userId,
      ipAddress: req.ip,
    });
  }

  await logAudit({ actor, action: "create", resource: "document", resourceId: document.id });
  res.status(201).json(await loadDetail(document.id));
});

// Public QR verification (§10). Declared before /documents/:id so Express
// doesn't match "verify" as an id.
router.get("/documents/verify/:uuid", async (req, res): Promise<void> => {
  const params = VerifyDocumentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const result = await verifyDocument({ uuid: params.data.uuid });

  // Record the check even when it fails — a burst of failed verifications on
  // one code is exactly the signal an audit wants to see.
  if (result.valid && result.document) {
    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.uuid, params.data.uuid));
    if (doc) {
      await logAccess({
        documentId: doc.id,
        tenantId: doc.tenantId,
        action: "verified",
        actorUserId: null,
        ipAddress: req.ip,
      });
    }
  }

  res.json(result);
});

router.get("/documents/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetDocumentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const detail = await loadDetail(params.data.id);
  if (!detail) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  res.json(detail);
});

// Appends a new immutable version (ADR-0021). Never rewrites an existing one.
router.post("/documents/:id/generate", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const params = GenerateDocumentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = GenerateDocumentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [document] = await db.select().from(documentsTable).where(eq(documentsTable.id, params.data.id));
  if (!document) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  if (document.status === "archived" || document.status === "disposed") {
    res.status(409).json({ error: `A ${document.status} document cannot be regenerated` });
    return;
  }

  let template = null;
  if (parsed.data.templateCode) {
    template = await resolveTemplate({
      tenantId: document.tenantId,
      code: parsed.data.templateCode,
      locale: parsed.data.locale,
    });
  } else if (document.templateId) {
    const [existing] = await db.select().from(documentTemplatesTable).where(eq(documentTemplatesTable.id, document.templateId));
    template = existing ?? null;
  }
  if (!template) {
    res.status(404).json({ error: "No template available to generate this document" });
    return;
  }

  const payload = (parsed.data.payload ?? {}) as Record<string, unknown>;
  const rendered = renderTemplate(template, payload);
  if (rendered.missingVariables.length > 0) {
    res.status(400).json({
      error: "Template variables missing from payload",
      missingVariables: rendered.missingVariables,
    });
    return;
  }

  const { version } = await generateVersion({ document, template, payload, actorUserId: actor?.userId });
  await logAccess({
    documentId: document.id,
    documentVersionId: version.id,
    tenantId: document.tenantId,
    action: "generated",
    detail: `Version ${version.version}`,
    actorUserId: actor?.userId,
    ipAddress: req.ip,
  });
  await logAudit({ actor, action: "generate", resource: "document", resourceId: document.id });

  res.json(await loadDetail(document.id));
});

// Lifecycle stages only move forward (§4), so an archived record can't be
// quietly returned to draft.
router.post("/documents/:id/status", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const params = UpdateDocumentStatusParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateDocumentStatusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [document] = await db.select().from(documentsTable).where(eq(documentsTable.id, params.data.id));
  if (!document) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  if (!canTransition(document.status, parsed.data.status)) {
    res.status(409).json({
      error: `Cannot move a document from "${document.status}" to "${parsed.data.status}". Lifecycle stages only move forward.`,
    });
    return;
  }

  const [updated] = await db
    .update(documentsTable)
    .set({
      status: parsed.data.status,
      ...(parsed.data.retainUntil ? { retainUntil: new Date(parsed.data.retainUntil) } : {}),
    })
    .where(eq(documentsTable.id, document.id))
    .returning();

  await logAccess({
    documentId: document.id,
    tenantId: document.tenantId,
    action: "status_changed",
    detail: `${document.status} -> ${parsed.data.status}${parsed.data.detail ? `: ${parsed.data.detail}` : ""}`,
    actorUserId: actor?.userId,
    ipAddress: req.ip,
  });
  await logAudit({ actor, action: "status_change", resource: "document", resourceId: document.id });

  res.json(serializeDocument(updated));
});

// Downloading is an audited event (§14 Download History).
router.get("/documents/:id/content", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const params = GetDocumentContentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [document] = await db.select().from(documentsTable).where(eq(documentsTable.id, params.data.id));
  if (!document) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  const [version] = await db
    .select()
    .from(documentVersionsTable)
    .where(and(eq(documentVersionsTable.documentId, document.id), eq(documentVersionsTable.version, document.currentVersion)));

  if (!version) {
    res.status(404).json({ error: "This document has not been generated yet" });
    return;
  }

  await logAccess({
    documentId: document.id,
    documentVersionId: version.id,
    tenantId: document.tenantId,
    action: "downloaded",
    detail: `Version ${version.version}`,
    actorUserId: actor?.userId,
    ipAddress: req.ip,
  });

  res.json({
    documentId: document.id,
    version: version.version,
    mimeType: version.mimeType,
    content: version.content ?? "",
    contentHash: version.contentHash,
  });
});

/**
 * Signs the document's current version (§9). Binding to the version rather
 * than the document is deliberate: a signature attests to exact bytes, so
 * regenerating afterwards correctly leaves the new version unsigned.
 */
router.post("/documents/:id/sign", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const params = SignDocumentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = SignDocumentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [document] = await db.select().from(documentsTable).where(eq(documentsTable.id, params.data.id));
  if (!document) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  const [version] = await db
    .select()
    .from(documentVersionsTable)
    .where(and(eq(documentVersionsTable.documentId, document.id), eq(documentVersionsTable.version, document.currentVersion)));

  if (!version) {
    res.status(409).json({ error: "Generate the document before signing it" });
    return;
  }

  const [signature] = await db
    .insert(documentSignaturesTable)
    .values({
      documentId: document.id,
      documentVersionId: version.id,
      tenantId: document.tenantId,
      signerUserId: actor?.userId ?? null,
      signerName: parsed.data.signerName,
      signerRole: parsed.data.signerRole ?? null,
      signatureType: "electronic",
      signatureData: parsed.data.signatureData ?? null,
      signedHash: version.contentHash,
    })
    .returning();

  // Signing advances the lifecycle only when the document hasn't already moved
  // past that stage.
  if (canTransition(document.status, "signed")) {
    await db.update(documentsTable).set({ status: "signed" }).where(eq(documentsTable.id, document.id));
  }

  await logAccess({
    documentId: document.id,
    documentVersionId: version.id,
    tenantId: document.tenantId,
    action: "signed",
    detail: `Signed by ${parsed.data.signerName}`,
    actorUserId: actor?.userId,
    ipAddress: req.ip,
  });
  await logAudit({ actor, action: "sign", resource: "document", resourceId: document.id });

  res.status(201).json(serializeSignature(signature));
});

router.get("/documents/:id/access-logs", requireAuth, async (req, res): Promise<void> => {
  const params = ListDocumentAccessLogsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const logs = await db
    .select()
    .from(documentAccessLogsTable)
    .where(eq(documentAccessLogsTable.documentId, params.data.id))
    .orderBy(desc(documentAccessLogsTable.createdAt))
    .limit(200);
  res.json(logs.map(serializeAccessLog));
});

export default router;
