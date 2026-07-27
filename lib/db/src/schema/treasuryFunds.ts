import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Treasury Fund — a pool of government money segregated by law or ordinance.
// Philippine LGUs maintain at least three statutory funds:
//   101 General Fund, 164 Special Education Fund, 151 Trust Fund.
// Additional special funds (e.g. Calamity Fund, LDRRMF) are also modelled here.
export const treasuryFundsTable = pgTable("treasury_funds", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  name: text("name").notNull(),
  code: text("code").notNull(),                           // e.g. "101", "164", "151"
  fundType: text("fund_type").notNull().default("general"), // general | sef | trust | special
  description: text("description"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTreasuryFundSchema = createInsertSchema(treasuryFundsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTreasuryFund = z.infer<typeof insertTreasuryFundSchema>;
export type TreasuryFund = typeof treasuryFundsTable.$inferSelect;
