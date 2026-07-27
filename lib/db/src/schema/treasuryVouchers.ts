import { pgTable, serial, text, integer, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Disbursement Voucher (DV) — the primary payment instrument used by Philippine LGUs.
// All government payments must be covered by a DV before cash is released (COA Circular 2004-006).
export const treasuryVouchersTable = pgTable("treasury_vouchers", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  fundId: integer("fund_id").notNull(),                              // FK → treasury_funds
  voucherNumber: text("voucher_number").notNull(),                   // e.g. "DV-2025-00001"
  voucherType: text("voucher_type").notNull().default("disbursement"), // disbursement | payroll | petty_cash | reimbursement
  payeeName: text("payee_name").notNull(),
  payeeAddress: text("payee_address"),
  tinNumber: text("tin_number"),                                     // BIR TIN of payee
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  description: text("description").notNull(),
  particulars: text("particulars"),
  modeOfPayment: text("mode_of_payment").notNull().default("check"), // check | ada | cash
  checkNumber: text("check_number"),
  status: text("status").notNull().default("draft"),                 // draft | for_approval | approved | paid | cancelled
  preparedByUserId: integer("prepared_by_user_id"),
  certifiedByUserId: integer("certified_by_user_id"),
  approvedByUserId: integer("approved_by_user_id"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cancellationReason: text("cancellation_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTreasuryVoucherSchema = createInsertSchema(treasuryVouchersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTreasuryVoucher = z.infer<typeof insertTreasuryVoucherSchema>;
export type TreasuryVoucher = typeof treasuryVouchersTable.$inferSelect;

// Line items of a DV — each line charges a specific account in the COA.
export const treasuryVoucherItemsTable = pgTable("treasury_voucher_items", {
  id: serial("id").primaryKey(),
  voucherId: integer("voucher_id").notNull(),                        // FK → treasury_vouchers
  accountId: integer("account_id").notNull(),                        // FK → treasury_accounts
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTreasuryVoucherItemSchema = createInsertSchema(treasuryVoucherItemsTable).omit({ id: true, createdAt: true });
export type InsertTreasuryVoucherItem = z.infer<typeof insertTreasuryVoucherItemSchema>;
export type TreasuryVoucherItem = typeof treasuryVoucherItemsTable.$inferSelect;
