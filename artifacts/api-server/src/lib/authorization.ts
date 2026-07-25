// Pure authorization logic, extracted from auth.ts so it can be unit-tested
// without pulling in Clerk or the database pool. auth.ts imports these; this
// module imports nothing heavy on purpose.
//
// Two decisions live here, and a mistake in either is a silent authorization
// hole rather than a crash:
//   - moduleForPath: which permission module guards a given request path
//   - roleGrantsPermission: whether a single role row satisfies a required
//     (module, action), including the superadmin bypass and wildcards
//
// Both mirror the behavior that previously lived inline in auth.ts and must
// stay in lockstep with it.

/** Role codes that bypass per-module permission checks entirely. */
export const SUPERADMIN_ROLE_CODES = ["platform_admin", "system_admin", "super_admin"] as const;

/**
 * Maps a request path to the permission module that guards it, or null when
 * the path isn't permission-gated. A leading "/api" prefix is stripped first
 * so both "/documents" and "/api/documents" resolve identically.
 *
 * Order matters: the first matching rule wins, exactly as in the original
 * inline chain.
 */
export function moduleForPath(path: string): string | null {
  path = path.replace(/^\/api(?=\/|$)/, "");
  if (/^\/(tenants|users|roles|permissions|departments|audit-logs|identity)/.test(path)) return "identity";
  if (/^\/workflows|^\/workflow-/.test(path)) return "workflows";
  if (/^\/rules/.test(path)) return "rules";
  if (/^\/forms|^\/form-submissions/.test(path)) return "forms";
  if (/^\/notifications|^\/notification-templates/.test(path)) return "notifications";
  if (/^\/documents|^\/document-templates/.test(path)) return "documents";
  if (/^\/search/.test(path)) return "search";
  if (/^\/integrations/.test(path)) return "integrations";
  return null;
}

/** One role's grant, as read from the joined role/permission rows. */
export interface RoleGrant {
  roleCode: string;
  permissionModule: string | null;
  permissionAction: string | null;
}

/**
 * Whether a single role grant satisfies a required (module, action).
 *
 * Rules, in order:
 *   1. Superadmin role codes are allowed everything.
 *   2. A grant with no module or no action grants nothing (a role with zero
 *      permission rows attached, surfaced by the LEFT JOIN as nulls).
 *   3. Otherwise the grant's module must match the requested module or be the
 *      "*" wildcard, AND the grant's action must match the requested action,
 *      be "manage" (which implies read), or be the "*" wildcard.
 */
export function roleGrantsPermission(grant: RoleGrant, module: string, action: "read" | "manage"): boolean {
  if ((SUPERADMIN_ROLE_CODES as readonly string[]).includes(grant.roleCode)) return true;
  if (!grant.permissionModule || !grant.permissionAction) return false;
  return (
    (grant.permissionModule === module || grant.permissionModule === "*") &&
    (grant.permissionAction === action || grant.permissionAction === "manage" || grant.permissionAction === "*")
  );
}

/**
 * Whether any of a user's role grants satisfies the required (module, action).
 * This is the whole-decision form of roleGrantsPermission, matching how
 * hasPermission folds the joined rows.
 */
export function anyGrantPermits(grants: RoleGrant[], module: string, action: "read" | "manage"): boolean {
  return grants.some((grant) => roleGrantsPermission(grant, module, action));
}
