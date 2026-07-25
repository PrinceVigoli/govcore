import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Rule Lifecycle (Book 06 §5): draft → testing → published → active → deprecated → archived.
// `priority` breaks ties when multiple active rules match the same evaluation
// request (lower number = evaluated first — see §15 Performance, "Priority ordering").
export const ruleVersionsTable = pgTable("rule_versions", {
  id: serial("id").primaryKey(),
  ruleId: integer("rule_id").notNull(),
  version: integer("version").notNull(),
  status: text("status").notNull().default("draft"),
  priority: integer("priority").notNull().default(100),
  effectiveDate: timestamp("effective_date", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRuleVersionSchema = createInsertSchema(ruleVersionsTable).omit({ id: true, createdAt: true });
export type InsertRuleVersion = z.infer<typeof insertRuleVersionSchema>;
export type RuleVersion = typeof ruleVersionsTable.$inferSelect;
