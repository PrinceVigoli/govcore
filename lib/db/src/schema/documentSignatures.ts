import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Book 09 — a signature applied to a specific document version (§9).
//
// The spec lists digital-certificate validation, timestamping, and
// cryptographic verification as *future* capabilities, so this table records
// an attributable electronic signature — who signed, which version, when, and
// the hash they signed over — without claiming cryptographic non-repudiation
// it can't deliver. `signatureType` is "electronic" for now; adding
// "digital" later means populating `certificateSubject` and verifying against
// a CA, with no schema change.
//
// Binding to `documentVersionId` rather than the document is the point: a
// signature attests to exact bytes. Regenerating a document produces a new
// version whose signatures are, correctly, absent.
//
// `signedHash` is the version's contentHash at signing time. If a presented
// document's hash no longer matches, the signature is stale and verification
// must fail rather than quietly pass.
export const documentSignaturesTable = pgTable("document_signatures", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull(),
  documentVersionId: integer("document_version_id").notNull(),
  tenantId: integer("tenant_id").notNull(),
  signerUserId: integer("signer_user_id"),
  signerName: text("signer_name").notNull(),
  signerRole: text("signer_role"), // Capacity signed in, e.g. "Municipal Assessor"
  signatureType: text("signature_type").notNull().default("electronic"), // electronic | digital (future)
  signatureData: text("signature_data"), // Data URI of a drawn signature, when captured
  signedHash: text("signed_hash").notNull(),
  certificateSubject: text("certificate_subject"), // Populated only by digital signatures
  signedAt: timestamp("signed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDocumentSignatureSchema = createInsertSchema(documentSignaturesTable).omit({ id: true, signedAt: true });
export type InsertDocumentSignature = z.infer<typeof insertDocumentSignatureSchema>;
export type DocumentSignature = typeof documentSignaturesTable.$inferSelect;
