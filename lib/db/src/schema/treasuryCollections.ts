import { pgTable, serial, text, integer, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Collection — a revenue receipt issued by the LGU Treasurer.
// Every collection must be covered by an Official Receipt (OR) numbered
// sequentially per COA Circular 97-002.
export const treasuryCollectionsTable = pgTable("treasury_collections", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  fundId: integer("fund_id").notNull(),                              // FK → treasury_funds (revenue goes into this fund)
  accountId: integer("account_id").notNull(),                        // FK → treasury_accounts (revenue account credited)
  orNumber: text("or_number").notNull(),                             // Official Receipt number
  payerName: text("payer_name").notNull(),
  payerAddress: text("payer_address"),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  particulars: text("particulars").notNull(),                        // Nature of payment
  paymentMode: text("payment_mode").notNull().default("cash"),       // cash | check | online | pos
  referenceNumber: text("reference_number"),                         // check #, transaction ref, etc.
  collectedByUserId: integer("collected_by_user_id"),                // FK → users (cashier)
  collectedAt: timestamp("collected_at", { withTimezone: true }).notNull().defaultNow(),
  status: text("status").notNull().default("posted"),                // draft | posted | cancelled
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cancellationReason: text("cancellation_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTreasuryCollectionSchema = createInsertSchema(treasuryCollectionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTreasuryCollection = z.infer<typeof insertTreasuryCollectionSchema>;
export type TreasuryCollection = typeof treasuryCollectionsTable.$inferSelect;
