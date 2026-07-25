import { pgTable, serial, text, integer, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Book 09 — an uploaded file (§5 Supported Document Types: scanned documents,
// images, GIS attachments). Distinct from `documents`, which are *generated*
// from templates; an attachment is bytes a person supplied.
//
// This is the table Book 07's file fields were missing. `submission_values`
// previously stored a bare "storage key/URL" string with nothing backing it —
// no size, no MIME type, no uploader, no audit trail. A file_upload / image /
// signature field now stores this row's `uuid`, so the form submission points
// at a real record.
//
// `attachedToType`/`attachedToId` are a soft polymorphic link (form_submission,
// document, workflow_instance, ...). Kept as text rather than separate FK
// columns because attachments hang off many unrelated tables, and the
// alternative is one nullable FK per owning module.
export const attachmentsTable = pgTable("attachments", {
  id: serial("id").primaryKey(),
  uuid: uuid("uuid").notNull().defaultRandom().unique(),
  tenantId: integer("tenant_id").notNull(),
  documentId: integer("document_id"), // Set when the file belongs to a generated document
  attachedToType: text("attached_to_type"), // e.g. "form_submission"
  attachedToId: text("attached_to_id"),
  fieldKey: text("field_key"), // The form field this satisfies, when attached to a submission
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull().default(0),
  storageProvider: text("storage_provider").notNull().default("inline"),
  storageKey: text("storage_key"),
  content: text("content"), // Base64 payload for inline storage; null once a real provider is wired
  contentHash: text("content_hash"),
  uploadedByUserId: integer("uploaded_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAttachmentSchema = createInsertSchema(attachmentsTable).omit({ id: true, uuid: true, createdAt: true });
export type InsertAttachment = z.infer<typeof insertAttachmentSchema>;
export type Attachment = typeof attachmentsTable.$inferSelect;
