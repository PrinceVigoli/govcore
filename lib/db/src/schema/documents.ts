import { pgTable, serial, text, integer, timestamp, uuid, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Book 09 — the definition-level document record. Content lives on versioned
// rows (see documentVersions.ts) so history is immutable (ADR-0021).
//
// `uuid` is the engine's public identifier (ADR-0019 "Documents use UUIDs —
// storage independence"): storage keys, QR verification URLs, and cross-module
// references all use it, so a document can move between local disk, NAS, and
// S3 without any stored reference breaking.
//
// Lifecycle (§4): draft -> generated -> reviewed -> approved -> signed ->
// archived -> retained -> disposed. Every transition is written to
// document_access_logs, giving the audit trail §4 requires.
//
// `resourceType`/`resourceId` tie a document back to the business record that
// produced it (a permit application, a payroll run), which is what lets the
// Workflow Engine attach generated output to the thing being approved (§13).
export const documentsTable = pgTable(
  "documents",
  {
    id: serial("id").primaryKey(),
    uuid: uuid("uuid").notNull().defaultRandom().unique(),
    tenantId: integer("tenant_id").notNull(),
    templateId: integer("template_id"), // Exact template version generated from; null for uploads
    title: text("title").notNull(),
    documentType: text("document_type").notNull(),
    module: text("module").notNull(),
    resourceType: text("resource_type"),
    resourceId: text("resource_id"),
    referenceNumber: text("reference_number"), // Human-facing number printed on the document
    status: text("status").notNull().default("draft"),
    currentVersion: integer("current_version").notNull().default(0), // 0 until first generation
    contentHash: text("content_hash"), // SHA-256 of the active version, for QR hash validation (§10)
    retainUntil: timestamp("retain_until", { withTimezone: true }), // Records retention (§4 Retained/Disposed)
    createdByUserId: integer("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    // Backstop for nextReferenceNumber's advisory lock (documentEngine.ts): if
    // that invariant is ever violated, a collision fails loudly here instead
    // of silently duplicating a citizen-facing reference number. Postgres
    // treats each NULL as distinct, so unnumbered (non-templated) documents
    // never collide with each other under this index.
    uniqueIndex("documents_tenant_reference_number_unique").on(table.tenantId, table.referenceNumber),
  ],
);

export const insertDocumentSchema = createInsertSchema(documentsTable).omit({ id: true, uuid: true, createdAt: true, updatedAt: true });
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documentsTable.$inferSelect;
