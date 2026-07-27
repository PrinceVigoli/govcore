import { pgTable, serial, text, integer, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Budget Appropriation — the annual spending authority granted by the Sanggunian.
// Tracks the three-stage budget execution cycle per NGAS:
//   Appropriation → Allotment → Obligation → Disbursement
export const treasuryBudgetsTable = pgTable("treasury_budgets", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  fundId: integer("fund_id").notNull(),                              // FK → treasury_funds
  departmentId: integer("department_id"),                            // FK → departments (nullable = LGU-wide)
  accountId: integer("account_id").notNull(),                        // FK → treasury_accounts (object-of-expenditure)
  fiscalYear: integer("fiscal_year").notNull(),                      // e.g. 2025
  appropriatedAmount: numeric("appropriated_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  allottedAmount: numeric("allotted_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  obligatedAmount: numeric("obligated_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  disbursedAmount: numeric("disbursed_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("active"),                // active | lapsed | supplemental
  remarks: text("remarks"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTreasuryBudgetSchema = createInsertSchema(treasuryBudgetsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTreasuryBudget = z.infer<typeof insertTreasuryBudgetSchema>;
export type TreasuryBudget = typeof treasuryBudgetsTable.$inferSelect;
