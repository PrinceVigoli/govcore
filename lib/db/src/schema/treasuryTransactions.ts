import { pgTable, serial, text, integer, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// General Ledger Transaction — double-entry journal entries generated from
// vouchers and collections. Provides the audit trail for all fund movements.
export const treasuryTransactionsTable = pgTable("treasury_transactions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  fundId: integer("fund_id").notNull(),                              // FK → treasury_funds
  accountId: integer("account_id").notNull(),                        // FK → treasury_accounts
  referenceType: text("reference_type").notNull(),                   // voucher | collection | journal_entry
  referenceId: integer("reference_id").notNull(),                    // FK → the source record
  referenceNumber: text("reference_number").notNull(),               // DV / OR / JEV number
  description: text("description").notNull(),
  debit: numeric("debit", { precision: 18, scale: 2 }).notNull().default("0"),
  credit: numeric("credit", { precision: 18, scale: 2 }).notNull().default("0"),
  transactionDate: timestamp("transaction_date", { withTimezone: true }).notNull().defaultNow(),
  fiscalYear: integer("fiscal_year").notNull(),
  period: integer("period").notNull(),                               // 1–12 (month) or 13 (year-end adjustment)
  postedByUserId: integer("posted_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTreasuryTransactionSchema = createInsertSchema(treasuryTransactionsTable).omit({ id: true, createdAt: true });
export type InsertTreasuryTransaction = z.infer<typeof insertTreasuryTransactionSchema>;
export type TreasuryTransaction = typeof treasuryTransactionsTable.$inferSelect;
