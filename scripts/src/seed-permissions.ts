// Seeds the platform's module permissions.
//
// Why this exists: `moduleForPath` (artifacts/api-server/src/lib/authorization.ts)
// maps each route family to a permission module, and `requireAuth` denies any
// request whose module the caller holds no grant for. That check fails CLOSED —
// if a module has no permission rows, nobody but a genuine platform superadmin
// can reach it.
//
// `reports`, `sync`, and `treasury` were added to that map after their routes
// shipped, so an existing database will have no rows for them and those screens
// will 403 for ordinary staff until this runs.
//
// Safe to re-run: every insert is onConflictDoNothing, so this converges rather
// than duplicating.
//
//   pnpm --filter @workspace/scripts run seed:permissions
//
// Granting these to specific roles is deliberately NOT done here — which role
// may touch treasury is a policy decision per LGU, not a default. Use
// `POST /roles/:id/permissions`, or the Roles screen, once these exist.

import { db, permissionsTable } from "@workspace/db";

const MODULES = [
  ["identity", "Tenants, users, roles, departments, audit logs"],
  ["workflows", "Workflow definitions, instances, and tasks"],
  ["rules", "Rule definitions and evaluation"],
  ["forms", "Form definitions and submissions"],
  ["notifications", "Notification templates, queue, and preferences"],
  ["documents", "Document templates, generation, and signing"],
  ["search", "Global and entity-scoped search"],
  ["integrations", "External endpoint registry and webhooks"],
  ["reports", "Report definitions, runs, and schedules"],
  ["sync", "Node registration, pull/push, and conflict resolution"],
  ["treasury", "Funds, accounts, budgets, vouchers, and collections"],
] as const;

// "manage" implies "read" in the permission check, but both rows are seeded so
// a role can be granted read-only access without implying write.
const ACTIONS = ["read", "manage"] as const;

async function main() {
  let inserted = 0;

  for (const [module, description] of MODULES) {
    for (const action of ACTIONS) {
      const result = await db
        .insert(permissionsTable)
        .values({
          module,
          action,
          // `resource` is required by the schema. The permission check in
          // authorization.ts matches on (module, action) only, so a
          // module-wide grant uses the "*" resource wildcard.
          resource: "*",
          description: `${action === "read" ? "View" : "Manage"} — ${description}`,
        })
        .onConflictDoNothing()
        .returning();
      if (result.length > 0) inserted++;
    }
  }

  console.log(`Seeded ${MODULES.length} modules x ${ACTIONS.length} actions.`);
  console.log(`${inserted} new permission row(s) inserted; the rest already existed.`);
  console.log("");
  console.log("Next: grant the new modules to whichever roles should hold them.");
  console.log("Nothing is granted automatically — that is a per-LGU policy decision.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed to seed permissions:", err);
  process.exit(1);
});
