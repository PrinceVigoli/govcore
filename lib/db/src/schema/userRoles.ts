import { pgTable, integer, primaryKey, timestamp } from "drizzle-orm/pg-core";

export const userRolesTable = pgTable("user_roles", {
  userId: integer("user_id").notNull(),
  roleId: integer("role_id").notNull(),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.roleId] })]);

export type UserRole = typeof userRolesTable.$inferSelect;
