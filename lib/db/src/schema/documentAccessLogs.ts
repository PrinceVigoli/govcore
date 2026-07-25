import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Book 09 — immutable access and lifecycle trail (§14 "Audit Logs, Download
// History"; §4 "Every stage is recorded in the audit trail"). Insert-only,
// mirroring workflow_history, rule_history, and notification_delivery.
//
// Covers both lifecycle transitions (generated, approved, signed, archived)
// and access events (viewed, downloaded, verified). Keeping them in one table
// means "who has touched this document" is a single query, which is the
// question an audit actually asks.
//
// `actorUserId` is null for public QR verifications — an anonymous check is
// still worth recording, since a spike of verifications on one certificate is
// itself a signal.
export const documentAccessLogsTable = pgTable("document_access_logs", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull(),
  documentVersionId: integer("document_version_id"),
  tenantId: integer("tenant_id").notNull(),
  action: text("action").notNull(), // created | generated | viewed | downloaded | verified | status_changed | signed | archived | disposed
  detail: text("detail"),
  actorUserId: integer("actor_user_id"), // null = anonymous (e.g. public QR verification)
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDocumentAccessLogSchema = createInsertSchema(documentAccessLogsTable).omit({ id: true, createdAt: true });
export type InsertDocumentAccessLog = z.infer<typeof insertDocumentAccessLogSchema>;
export type DocumentAccessLog = typeof documentAccessLogsTable.$inferSelect;
