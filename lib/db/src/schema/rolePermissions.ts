import { pgTable, integer, primaryKey, timestamp } from "drizzle-orm/pg-core";

export const rolePermissionsTable = pgTable("role_permissions", {
  roleId: integer("role_id").notNull(),
  permissionId: integer("permission_id").notNull(),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })]);

export type RolePermission = typeof rolePermissionsTable.$inferSelect;
