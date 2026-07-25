import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Book 09 — an immutable snapshot of a document's content (§8 Versioning,
// ADR-0021 "Version history is immutable — legal compliance and
// auditability"). Rows are inserted, never updated: regenerating a document
// appends version N+1 rather than rewriting N, so a citizen holding a printed
// copy of version 2 can always be shown exactly what version 2 said.
//
// `storageProvider` + `storageKey` are how content is located (§6). The key is
// derived from the document's UUID rather than a filesystem path, so the same
// row resolves whether the bytes live on local disk or in S3.
//
// `content` holds rendered text inline for html/rich_text output. Binary
// formats set `storageKey` instead and leave this null — the column exists so
// this deployment, which has no object store wired, can still generate and
// serve real documents end to end.
//
// `contentHash` is the SHA-256 the QR verification endpoint checks (§10 Hash
// Validation): it proves a presented document matches what was issued.
export const documentVersionsTable = pgTable("document_versions", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull(),
  version: integer("version").notNull(),
  mimeType: text("mime_type").notNull().default("text/html"),
  content: text("content"), // Rendered inline content for text formats
  storageProvider: text("storage_provider").notNull().default("inline"), // inline | local | nas | s3
  storageKey: text("storage_key"),
  sizeBytes: integer("size_bytes"),
  contentHash: text("content_hash").notNull(),
  payload: text("payload"), // JSON-encoded variables used at render time
  generatedByUserId: integer("generated_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDocumentVersionSchema = createInsertSchema(documentVersionsTable).omit({ id: true, createdAt: true });
export type InsertDocumentVersion = z.infer<typeof insertDocumentVersionSchema>;
export type DocumentVersion = typeof documentVersionsTable.$inferSelect;
