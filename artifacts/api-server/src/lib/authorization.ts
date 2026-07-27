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
  if (/^\/report-definitions|^\/report-sources|^\/report-preview|^\/scheduled-reports/.test(path)) return "reports";
  if (/^\/sync/.test(path)) return "sync";
  if (/^\/treasury/.test(path)) return "treasury";
  return null;
}

/** One role's grant, as read from the joined role/permission rows. */
export interface RoleGrant {
  roleCode: string;
  /**
   * Whether the role is a system role. Load-bearing for security: a superadmin
   * role code alone is NOT enough to be treated as a superadmin, because role
   * codes are tenant-scoped and creatable through the API. See
   * isSuperadminGrant.
   */
  isSystem: boolean;
  permissionModule: string | null;
  permissionAction: string | null;
}

/**
 * Whether a grant confers superadmin status.
 *
 * A reserved role code is necessary but NOT sufficient. Roles live in a
 * tenant-scoped table and are creatable through `POST /roles`, so recognizing
 * superadmin on `code` alone would let anyone holding `identity:manage` in
 * their own tenant mint a role called "platform_admin", assign it to
 * themselves, and acquire cross-tenant reach over every other LGU. Requiring
 * `isSystem` — which the roles API refuses to set (see routes/roles.ts) and
 * only the bootstrap path writes — closes that escalation.
 *
 * Both halves must hold. Changing either without the other reopens the hole.
 */
export function isSuperadminGrant(grant: RoleGrant): boolean {
  return grant.isSystem === true && (SUPERADMIN_ROLE_CODES as readonly string[]).includes(grant.roleCode);
}

/** Whether any of a user's grants confers superadmin status. */
export function anyGrantIsSuperadmin(grants: RoleGrant[]): boolean {
  return grants.some(isSuperadminGrant);
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
  if (isSuperadminGrant(grant)) return true;
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
