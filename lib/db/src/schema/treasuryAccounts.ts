import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Chart of Accounts — follows the New Government Accounting System (NGAS)
// account codes prescribed by COA for Philippine LGUs.
// Each account belongs to exactly one fund and has a normal balance side.
export const treasuryAccountsTable = pgTable("treasury_accounts", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  fundId: integer("fund_id").notNull(),                     // FK → treasury_funds
  accountCode: text("account_code").notNull(),               // e.g. "1-01-01-010"
  accountName: text("account_name").notNull(),               // e.g. "Cash in Vault"
  accountType: text("account_type").notNull(),               // asset | liability | equity | revenue | expense
  normalBalance: text("normal_balance").notNull().default("debit"), // debit | credit
  parentAccountId: integer("parent_account_id"),             // for hierarchical COA
  isControlAccount: integer("is_control_account").notNull().default(0), // 0 | 1
  description: text("description"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTreasuryAccountSchema = createInsertSchema(treasuryAccountsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTreasuryAccount = z.infer<typeof insertTreasuryAccountSchema>;
export type TreasuryAccount = typeof treasuryAccountsTable.$inferSelect;
