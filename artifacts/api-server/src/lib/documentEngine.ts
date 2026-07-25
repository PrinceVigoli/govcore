import { createHash, randomUUID } from "node:crypto";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  db,
  documentsTable,
  documentTemplatesTable,
  documentVersionsTable,
  documentAccessLogsTable,
  documentSignaturesTable,
  attachmentsTable,
  type Document,
  type DocumentTemplate,
  type DocumentVersion,
  type DocumentAccessLog,
  type DocumentSignature,
  type Attachment,
} from "@workspace/db";

// ── Serialization ──────────────────────────────────────────────────────────

export function serializeDocument(d: Document) {
  return {
    ...d,
    retainUntil: d.retainUntil ? d.retainUntil.toISOString() : null,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

export function serializeDocumentTemplate(t: DocumentTemplate) {
  return { ...t, createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString() };
}

export function serializeDocumentVersion(v: DocumentVersion) {
  return { ...v, createdAt: v.createdAt.toISOString() };
}

export function serializeAccessLog(l: DocumentAccessLog) {
  return { ...l, createdAt: l.createdAt.toISOString() };
}

export function serializeSignature(s: DocumentSignature) {
  return { ...s, signedAt: s.signedAt.toISOString() };
}

export function serializeAttachment(a: Attachment) {
  // `content` is deliberately omitted: an attachment list should never ship
  // every file's bytes. The download endpoint returns content explicitly.
  const { content: _content, ...rest } = a;
  return { ...rest, createdAt: a.createdAt.toISOString() };
}

// ── Lifecycle (§4) ─────────────────────────────────────────────────────────

export const DOCUMENT_STATUSES = [
  "draft",
  "generated",
  "reviewed",
  "approved",
  "signed",
  "archived",
  "retained",
  "disposed",
] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

// Legal ordering of the lifecycle. Documents move forward through these
// stages; the API rejects backward moves so an archived record can't be
// quietly returned to draft. "disposed" is terminal.
const STATUS_ORDER = new Map<string, number>(DOCUMENT_STATUSES.map((s, i) => [s, i]));

export function canTransition(from: string, to: string): boolean {
  const a = STATUS_ORDER.get(from);
  const b = STATUS_ORDER.get(to);
  if (a === undefined || b === undefined) return false;
  return b > a;
}

// ── Hashing (§10 Hash Validation) ──────────────────────────────────────────

export function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

// ── Storage (§6 Storage Strategy, ADR-0019) ────────────────────────────────

export const STORAGE_PROVIDERS = ["inline", "local", "nas", "s3"] as const;

/**
 * Builds the storage key for a document version. Derived from the document's
 * UUID rather than a filesystem path (ADR-0019 "storage independence"), so the
 * same key resolves under any provider and moving between them never
 * invalidates a stored reference.
 */
export function buildStorageKey(documentUuid: string, version: number, extension: string): string {
  return `documents/${documentUuid}/v${version}.${extension}`;
}

export function buildAttachmentKey(attachmentUuid: string, fileName: string): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `attachments/${attachmentUuid}/${safe}`;
}

const EXTENSION_BY_MIME: Record<string, string> = {
  "text/html": "html",
  "text/plain": "txt",
  "application/pdf": "pdf",
};

export function extensionForMime(mimeType: string): string {
  return EXTENSION_BY_MIME[mimeType] ?? "bin";
}

/**
 * This deployment has no object store configured, so generated content is
 * stored inline in `document_versions.content`. That keeps generation, hashing,
 * verification, and download working end to end rather than stubbing them.
 *
 * Wiring S3/NAS means implementing this one function plus its read counterpart:
 * write the bytes, return the provider name, and leave `content` null.
 */
export async function storeContent(opts: {
  key: string;
  content: string;
}): Promise<{ provider: string; storageKey: string | null; inlineContent: string | null }> {
  return { provider: "inline", storageKey: opts.key, inlineContent: opts.content };
}

// ── Template rendering (§7) ────────────────────────────────────────────────
// Same placeholder grammar as the Notification Engine (Book 08), deliberately:
// an admin who has written one template already knows how to write the other.

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

export function parseVariables(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function collectPlaceholders(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(PLACEHOLDER)) found.add(match[1]);
  return [...found];
}

/**
 * Substitutes {{variable}} placeholders. An unresolved placeholder is left
 * verbatim rather than becoming "undefined" — on a printed certificate,
 * "{{citizen_name}}" is an obvious defect someone will report, while
 * "undefined" looks like a real (and embarrassing) value.
 */
export function renderString(template: string, payload: Record<string, unknown>): string {
  return template.replace(PLACEHOLDER, (match, key: string) => {
    const value = payload[key];
    if (value === undefined || value === null) return match;
    return String(value);
  });
}

export interface RenderResult {
  content: string;
  missingVariables: string[];
}

export function renderTemplate(template: DocumentTemplate, payload: Record<string, unknown>): RenderResult {
  const used = new Set(collectPlaceholders(template.body));
  for (const name of parseVariables(template.variables)) used.add(name);
  const missingVariables = [...used].filter((name) => payload[name] === undefined || payload[name] === null);
  return { content: renderString(template.body, payload), missingVariables };
}

/**
 * Resolves the single active template for a code/locale, falling back to "en"
 * so a missing translation still produces a document (mirrors the Notification
 * Engine's resolution).
 */
export async function resolveTemplate(opts: {
  tenantId: number;
  code: string;
  locale?: string;
}): Promise<DocumentTemplate | null> {
  const locale = opts.locale ?? "en";

  const [exact] = await db
    .select()
    .from(documentTemplatesTable)
    .where(
      and(
        eq(documentTemplatesTable.tenantId, opts.tenantId),
        eq(documentTemplatesTable.code, opts.code),
        eq(documentTemplatesTable.locale, locale),
        eq(documentTemplatesTable.status, "active"),
      ),
    )
    .orderBy(desc(documentTemplatesTable.version))
    .limit(1);
  if (exact) return exact;
  if (locale === "en") return null;

  const [fallback] = await db
    .select()
    .from(documentTemplatesTable)
    .where(
      and(
        eq(documentTemplatesTable.tenantId, opts.tenantId),
        eq(documentTemplatesTable.code, opts.code),
        eq(documentTemplatesTable.locale, "en"),
        eq(documentTemplatesTable.status, "active"),
      ),
    )
    .orderBy(desc(documentTemplatesTable.version))
    .limit(1);
  return fallback ?? null;
}

// ── Reference numbers ──────────────────────────────────────────────────────

/**
 * Human-facing document number, e.g. "BUSINESS_PERMIT-2026-0001". Distinct
 * from the UUID: citizens quote this over the phone, systems use the UUID.
 * Sequence is per code/year and derived from existing rows, so it stays
 * readable without a dedicated counter table.
 *
 * Concurrency: reading "max existing + 1" is a classic race — two requests
 * for the same tenant/code arriving together can read the same max and both
 * mint "0001". `pg_advisory_xact_lock` serializes callers on the
 * (tenantId, prefix) pair without a counter table: the first caller holds the
 * lock until its transaction ends, so the second caller's read waits until
 * after the first's insert is visible.
 *
 * This only closes the race if the caller passes the *same transaction* that
 * performs the resulting `documentsTable` insert — the lock is released the
 * moment that transaction commits, so computing the number outside the
 * transaction that consumes it reopens the gap. `documents_tenant_reference_number_unique`
 * (see the documents schema) is the backstop if that invariant is ever violated:
 * a real collision fails loudly as a constraint error instead of silently
 * duplicating a reference number.
 */
export async function nextReferenceNumber(tx: typeof db, opts: { tenantId: number; code: string }): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `${opts.code}-${year}-`;

  await tx.execute(sql`select pg_advisory_xact_lock(${opts.tenantId}, hashtext(${prefix}))`);

  const existing = await tx
    .select({ referenceNumber: documentsTable.referenceNumber })
    .from(documentsTable)
    .where(eq(documentsTable.tenantId, opts.tenantId));

  let max = 0;
  for (const row of existing) {
    if (!row.referenceNumber?.startsWith(prefix)) continue;
    const seq = Number(row.referenceNumber.slice(prefix.length));
    if (Number.isFinite(seq) && seq > max) max = seq;
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

// ── QR codes (§10) ─────────────────────────────────────────────────────────

/**
 * The QR payload is the public verification URL keyed by UUID. It carries no
 * document content — scanning reveals nothing without the server confirming
 * it, which is what makes a photocopied QR useless on its own.
 */
export function buildVerificationUrl(baseUrl: string, documentUuid: string): string {
  return `${baseUrl.replace(/\/$/, "")}/verify/${documentUuid}`;
}

export interface VerificationResult {
  valid: boolean;
  reason?: string;
  document?: {
    uuid: string;
    title: string;
    documentType: string;
    referenceNumber: string | null;
    status: string;
    version: number;
    issuedAt: string;
  };
  signatures?: Array<{ signerName: string; signerRole: string | null; signedAt: string }>;
}

/**
 * Public verification (§10: Verification Page, Metadata, Hash Validation,
 * Public Status). Returns only what a verifier legitimately needs — never the
 * document body, since this endpoint is unauthenticated.
 *
 * If `presentedHash` is supplied it must match the active version's hash: that
 * is the check distinguishing a genuine document from an altered copy bearing a
 * real QR code.
 */
export async function verifyDocument(opts: {
  uuid: string;
  presentedHash?: string;
}): Promise<VerificationResult> {
  const [document] = await db.select().from(documentsTable).where(eq(documentsTable.uuid, opts.uuid));
  if (!document) return { valid: false, reason: "No document matches this code" };

  if (document.status === "draft") {
    return { valid: false, reason: "This document has not been issued" };
  }
  if (document.status === "disposed") {
    return { valid: false, reason: "This document has been disposed and is no longer valid" };
  }

  const [version] = await db
    .select()
    .from(documentVersionsTable)
    .where(and(eq(documentVersionsTable.documentId, document.id), eq(documentVersionsTable.version, document.currentVersion)));

  if (!version) return { valid: false, reason: "This document has no issued version" };

  if (opts.presentedHash && opts.presentedHash !== version.contentHash) {
    return { valid: false, reason: "The presented document does not match the issued record" };
  }

  const signatures = await db
    .select()
    .from(documentSignaturesTable)
    .where(eq(documentSignaturesTable.documentVersionId, version.id));

  // A signature attests to specific bytes. If the active version was
  // regenerated after signing, the signature no longer covers what's being
  // verified, so it must not be presented as valid.
  const validSignatures = signatures.filter((s) => s.signedHash === version.contentHash);

  return {
    valid: true,
    document: {
      uuid: document.uuid,
      title: document.title,
      documentType: document.documentType,
      referenceNumber: document.referenceNumber,
      status: document.status,
      version: version.version,
      issuedAt: version.createdAt.toISOString(),
    },
    signatures: validSignatures.map((s) => ({
      signerName: s.signerName,
      signerRole: s.signerRole,
      signedAt: s.signedAt.toISOString(),
    })),
  };
}

// ── Access logging (§14) ───────────────────────────────────────────────────

export async function logAccess(opts: {
  documentId: number;
  documentVersionId?: number | null;
  tenantId: number;
  action: string;
  detail?: string;
  actorUserId?: number | null;
  ipAddress?: string | null;
}): Promise<void> {
  try {
    await db.insert(documentAccessLogsTable).values({
      documentId: opts.documentId,
      documentVersionId: opts.documentVersionId ?? null,
      tenantId: opts.tenantId,
      action: opts.action,
      detail: opts.detail ?? null,
      actorUserId: opts.actorUserId ?? null,
      ipAddress: opts.ipAddress ?? null,
    });
  } catch {
    // Access logging must never break the operation being logged, matching
    // how logAudit() behaves elsewhere in the platform.
  }
}

// ── Generation (§4 Draft -> Generated) ─────────────────────────────────────

/**
 * Renders a document's template and appends a new immutable version
 * (ADR-0021). Never mutates an existing version: regeneration produces N+1,
 * and the document's `currentVersion`/`contentHash` move to point at it.
 *
 * Returns the new version plus the document's refreshed row.
 */
export async function generateVersion(opts: {
  document: Document;
  template: DocumentTemplate;
  payload: Record<string, unknown>;
  actorUserId?: number | null;
}): Promise<{ version: DocumentVersion; document: Document }> {
  const rendered = renderTemplate(opts.template, opts.payload);
  const contentHash = hashContent(rendered.content);
  const mimeType = opts.template.templateType === "rich_text" ? "text/plain" : "text/html";
  const nextVersion = opts.document.currentVersion + 1;

  const stored = await storeContent({
    key: buildStorageKey(opts.document.uuid, nextVersion, extensionForMime(mimeType)),
    content: rendered.content,
  });

  return db.transaction(async (tx) => {
    const [version] = await tx
      .insert(documentVersionsTable)
      .values({
        documentId: opts.document.id,
        version: nextVersion,
        mimeType,
        content: stored.inlineContent,
        storageProvider: stored.provider,
        storageKey: stored.storageKey,
        sizeBytes: Buffer.byteLength(rendered.content, "utf8"),
        contentHash,
        payload: JSON.stringify(opts.payload),
        generatedByUserId: opts.actorUserId ?? null,
      })
      .returning();

    const [document] = await tx
      .update(documentsTable)
      .set({
        currentVersion: nextVersion,
        contentHash,
        templateId: opts.template.id,
        // Generating advances a draft; a document already further along
        // (reviewed, approved) keeps its status so regeneration doesn't
        // silently undo an approval.
        ...(opts.document.status === "draft" ? { status: "generated" } : {}),
      })
      .where(eq(documentsTable.id, opts.document.id))
      .returning();

    return { version, document };
  });
}

// ── Attachments (§5, integration with Book 07 forms) ───────────────────────

/**
 * Records an uploaded file. Content is stored inline as base64 in this
 * deployment; `storeContent` is the single place to change for a real provider.
 *
 * The returned `uuid` is what a form's file_upload / image / signature field
 * stores in submission_values, replacing the bare unbacked string Book 07 used.
 */
export async function createAttachment(opts: {
  tenantId: number;
  fileName: string;
  mimeType: string;
  content: string; // base64
  attachedToType?: string | null;
  attachedToId?: string | null;
  fieldKey?: string | null;
  documentId?: number | null;
  uploadedByUserId?: number | null;
}): Promise<Attachment> {
  const uuid = randomUUID();
  const sizeBytes = Buffer.byteLength(opts.content, "base64");

  const [row] = await db
    .insert(attachmentsTable)
    .values({
      uuid,
      tenantId: opts.tenantId,
      documentId: opts.documentId ?? null,
      attachedToType: opts.attachedToType ?? null,
      attachedToId: opts.attachedToId ?? null,
      fieldKey: opts.fieldKey ?? null,
      fileName: opts.fileName,
      mimeType: opts.mimeType,
      sizeBytes,
      storageProvider: "inline",
      storageKey: buildAttachmentKey(uuid, opts.fileName),
      content: opts.content,
      contentHash: hashContent(opts.content),
      uploadedByUserId: opts.uploadedByUserId ?? null,
    })
    .returning();

  return row;
}
