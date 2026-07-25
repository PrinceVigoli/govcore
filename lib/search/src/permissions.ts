import { eq, inArray } from "drizzle-orm";
import { db, userRolesTable, rolePermissionsTable, permissionsTable } from "@workspace/db";

// Search Permissions — Sprint 2A. Reuses the existing identity RBAC tables
// (permissions / role_permissions / user_roles) rather than inventing a
// parallel search-specific permission model. A search result's entityType
// maps to a permissions.module value; a user can only see results for
// modules where at least one of their roles holds a "read" (or "search")
// action permission. Tenant scoping (search_index.tenantId === the caller's
// tenantId) is enforced separately in searchService.ts and is never
// optional — this function only narrows *which entity types* within that
// tenant are visible.
export const ENTITY_TYPE_TO_MODULE: Record<string, string> = {
  rule: "rules",
  form: "forms",
  workflow_definition: "workflows",
  document_template: "documents",
  notification_template: "notifications",
  department: "identity",
  user: "identity",
};

export const ALL_ENTITY_TYPES = Object.keys(ENTITY_TYPE_TO_MODULE);

/**
 * Returns the set of entityType values a user is allowed to see in search
 * results. A user with no matching role/permission rows sees nothing —
 * search permissions fail closed, not open.
 */
export async function allowedEntityTypesForUser(userId: number): Promise<Set<string>> {
  const roleRows = await db.select({ roleId: userRolesTable.roleId }).from(userRolesTable).where(eq(userRolesTable.userId, userId));
  const roleIds = roleRows.map((r) => r.roleId);
  if (roleIds.length === 0) return new Set();

  const permRows = await db
    .select({ module: permissionsTable.module, action: permissionsTable.action })
    .from(rolePermissionsTable)
    .innerJoin(permissionsTable, eq(rolePermissionsTable.permissionId, permissionsTable.id))
    .where(inArray(rolePermissionsTable.roleId, roleIds));

  const readableModules = new Set(
    permRows.filter((p) => p.action === "read" || p.action === "search" || p.action === "manage").map((p) => p.module),
  );

  const allowed = new Set<string>();
  for (const entityType of ALL_ENTITY_TYPES) {
    if (readableModules.has(ENTITY_TYPE_TO_MODULE[entityType])) allowed.add(entityType);
  }
  return allowed;
}

/** Filters a list of entityType-bearing rows down to what `allowed` permits. */
export function filterByAllowedTypes<T extends { entityType: string }>(rows: T[], allowed: Set<string>): T[] {
  return rows.filter((r) => allowed.has(r.entityType));
}

