import { createHash } from "node:crypto";
type DocumentTemplate = { body: string; variables: string|null; templateType: string };
interface RenderResult { content: string; missingVariables: string[] }
const DOCUMENT_STATUSES = [
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
const STATUS_ORDER = new Map<string, number>(DOCUMENT_STATUSES.map((s, i) => [s, i]));
function canTransition(from: string, to: string): boolean {
  const a = STATUS_ORDER.get(from);
  const b = STATUS_ORDER.get(to);
  if (a === undefined || b === undefined) return false;
  return b > a;
}

function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function buildStorageKey(documentUuid: string, version: number, extension: string): string {
  return `documents/${documentUuid}/v${version}.${extension}`;
}

function buildAttachmentKey(attachmentUuid: string, fileName: string): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `attachments/${attachmentUuid}/${safe}`;
}

const EXTENSION_BY_MIME: Record<string, string> = {
  "text/html": "html",
  "text/plain": "txt",
  "application/pdf": "pdf",
};
function extensionForMime(mimeType: string): string {
  return EXTENSION_BY_MIME[mimeType] ?? "bin";
}

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;
function parseVariables(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function collectPlaceholders(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(PLACEHOLDER)) found.add(match[1]);
  return [...found];
}

function renderString(template: string, payload: Record<string, unknown>): string {
  return template.replace(PLACEHOLDER, (match, key: string) => {
    const value = payload[key];
    if (value === undefined || value === null) return match;
    return String(value);
  });
}

function renderTemplate(template: DocumentTemplate, payload: Record<string, unknown>): RenderResult {
  const used = new Set(collectPlaceholders(template.body));
  for (const name of parseVariables(template.variables)) used.add(name);
  const missingVariables = [...used].filter((name) => payload[name] === undefined || payload[name] === null);
  return { content: renderString(template.body, payload), missingVariables };
}

function buildVerificationUrl(baseUrl: string, documentUuid: string): string {
  return `${baseUrl.replace(/\/$/, "")}/verify/${documentUuid}`;
}


export { canTransition, hashContent, buildStorageKey, buildAttachmentKey, extensionForMime, renderTemplate, renderString, collectPlaceholders, parseVariables, buildVerificationUrl, DOCUMENT_STATUSES };
export type { DocumentTemplate };
