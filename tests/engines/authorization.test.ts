// Tests for the pure authorization logic in
// artifacts/api-server/src/lib/authorization.ts — the two decisions that
// determine who may do what. A bug in either is a silent access-control hole,
// not a crash, so these cover the edges deliberately.
//
// This imports the pure module directly (no Clerk, no DB pool), the same way
// search.test.ts / integrations.test.ts test extracted engine logic.

import {
  moduleForPath,
  roleGrantsPermission,
  anyGrantPermits,
  isSuperadminGrant,
  anyGrantIsSuperadmin,
  SUPERADMIN_ROLE_CODES,
  type RoleGrant,
} from "../../artifacts/api-server/src/lib/authorization";

let pass = 0,
  fail = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const grant = (
  roleCode: string,
  permissionModule: string | null,
  permissionAction: string | null,
  isSystem = false,
): RoleGrant => ({ roleCode, isSystem, permissionModule, permissionAction });

/** A genuine platform role: reserved code AND system-owned. */
const systemGrant = (roleCode: string): RoleGrant => grant(roleCode, null, null, true);

console.log("\n— moduleForPath: each module resolves —");
check("tenants -> identity", moduleForPath("/tenants"), "identity");
check("users -> identity", moduleForPath("/users/42"), "identity");
check("roles -> identity", moduleForPath("/roles"), "identity");
check("permissions -> identity", moduleForPath("/permissions"), "identity");
check("departments -> identity", moduleForPath("/departments"), "identity");
check("audit-logs -> identity", moduleForPath("/audit-logs"), "identity");
check("identity -> identity", moduleForPath("/identity/stats"), "identity");
check("workflows -> workflows", moduleForPath("/workflows"), "workflows");
check("workflow-instances -> workflows", moduleForPath("/workflow-instances/3"), "workflows");
check("workflow-tasks -> workflows", moduleForPath("/workflow-tasks"), "workflows");
check("rules -> rules", moduleForPath("/rules/1/evaluate"), "rules");
check("forms -> forms", moduleForPath("/forms"), "forms");
check("form-submissions -> forms", moduleForPath("/form-submissions/9"), "forms");
check("notifications -> notifications", moduleForPath("/notifications"), "notifications");
check("notification-templates -> notifications", moduleForPath("/notification-templates"), "notifications");
check("documents -> documents", moduleForPath("/documents/7"), "documents");
check("document-templates -> documents", moduleForPath("/document-templates"), "documents");
check("search -> search", moduleForPath("/search"), "search");
check("integrations -> integrations", moduleForPath("/integrations/webhooks"), "integrations");
check("report-definitions -> reports", moduleForPath("/report-definitions/3/run"), "reports");
check("report-sources -> reports", moduleForPath("/report-sources"), "reports");
check("report-preview -> reports", moduleForPath("/report-preview"), "reports");
check("scheduled-reports -> reports", moduleForPath("/scheduled-reports"), "reports");
check("sync pull -> sync", moduleForPath("/sync/pull"), "sync");
check("sync-nodes -> sync", moduleForPath("/sync-nodes"), "sync");
check("sync-conflicts -> sync", moduleForPath("/sync-conflicts/1/resolve"), "sync");
check("treasury -> treasury", moduleForPath("/treasury/vouchers/9"), "treasury");

console.log("\n— moduleForPath: /api prefix is stripped —");
check("/api/documents -> documents", moduleForPath("/api/documents"), "documents");
check("/api/rules -> rules", moduleForPath("/api/rules/1"), "rules");
check("bare /api -> null (nothing after prefix)", moduleForPath("/api"), null);
// Only the leading /api segment is stripped, not a substring.
check("/apidocs is NOT treated as /docs", moduleForPath("/apidocs"), null);

console.log("\n— moduleForPath: unknown / ungated paths -> null —");
check("unknown top-level -> null", moduleForPath("/health"), null);
check("root -> null", moduleForPath("/"), null);
check("auth route is not module-gated here -> null", moduleForPath("/auth/me"), null);
check("empty string -> null", moduleForPath(""), null);

console.log("\n— moduleForPath: first-match ordering —");
// Every "workflow-*" must land on workflows, not be shadowed by a later rule.
check("workflow-definitions -> workflows (not forms)", moduleForPath("/workflow-definitions"), "workflows");

console.log("\n— roleGrantsPermission: superadmin bypass requires a SYSTEM role —");
for (const code of SUPERADMIN_ROLE_CODES) {
  // A real platform role: reserved code + isSystem. Allowed everything.
  check(`${code} (system) allowed despite null grant`, roleGrantsPermission(systemGrant(code), "documents", "manage"), true);
  check(`${code} (system) allowed on read`, roleGrantsPermission(systemGrant(code), "search", "read"), true);
}

console.log("\n— PRIVILEGE ESCALATION GUARD: a reserved code alone is NOT enough —");
// Roles are tenant-scoped and created through POST /roles. If a reserved code
// by itself conferred superadmin, anyone holding identity:manage in their own
// tenant could mint a "platform_admin" role, assign it to themselves, and
// reach every other LGU's records. isSystem is never accepted from a request
// body, so requiring it is what closes that path.
for (const code of SUPERADMIN_ROLE_CODES) {
  check(`forged ${code} (isSystem=false) is NOT superadmin`, isSuperadminGrant(grant(code, null, null, false)), false);
  check(`forged ${code} grants no permissions`, roleGrantsPermission(grant(code, null, null, false), "documents", "manage"), false);
  check(`genuine ${code} (isSystem=true) IS superadmin`, isSuperadminGrant(systemGrant(code)), true);
}
// isSystem alone is likewise insufficient — both halves must hold.
check("system role with an ordinary code is not superadmin", isSuperadminGrant(grant("clerk", null, null, true)), false);
check("ordinary role, ordinary code is not superadmin", isSuperadminGrant(grant("clerk", null, null, false)), false);

console.log("\n— anyGrantIsSuperadmin —");
check("empty grants -> not superadmin", anyGrantIsSuperadmin([]), false);
check("one genuine system role anywhere wins", anyGrantIsSuperadmin([grant("clerk", "forms", "read"), systemGrant("platform_admin")]), true);
check("a set of forged roles never confers it", anyGrantIsSuperadmin(SUPERADMIN_ROLE_CODES.map((c) => grant(c, "*", "*", false))), false);

console.log("\n— roleGrantsPermission: null / empty grants deny —");
check("null module denies", roleGrantsPermission(grant("clerk", null, "read"), "documents", "read"), false);
check("null action denies", roleGrantsPermission(grant("clerk", "documents", null), "documents", "read"), false);
check("both null denies", roleGrantsPermission(grant("clerk", null, null), "documents", "read"), false);

console.log("\n— roleGrantsPermission: exact module + action —");
check("exact match read", roleGrantsPermission(grant("clerk", "documents", "read"), "documents", "read"), true);
check("exact match manage", roleGrantsPermission(grant("clerk", "documents", "manage"), "documents", "manage"), true);
check("wrong module denies", roleGrantsPermission(grant("clerk", "forms", "read"), "documents", "read"), false);

console.log("\n— roleGrantsPermission: manage implies read (but not the reverse) —");
check("manage grant satisfies read", roleGrantsPermission(grant("clerk", "documents", "manage"), "documents", "read"), true);
// The critical asymmetry: a read grant must NOT satisfy a manage requirement.
check("read grant does NOT satisfy manage", roleGrantsPermission(grant("clerk", "documents", "read"), "documents", "manage"), false);

console.log("\n— roleGrantsPermission: wildcards —");
check("module '*' matches any module", roleGrantsPermission(grant("clerk", "*", "read"), "integrations", "read"), true);
check("action '*' matches any action", roleGrantsPermission(grant("clerk", "documents", "*"), "documents", "manage"), true);
check("module '*' + action '*' is all-access", roleGrantsPermission(grant("clerk", "*", "*"), "anything", "manage"), true);
// A module wildcard still must clear the action rule.
check("module '*' with read grant does NOT satisfy manage", roleGrantsPermission(grant("clerk", "*", "read"), "documents", "manage"), false);

console.log("\n— anyGrantPermits: folding many role rows —");
check("empty grants deny (fail closed)", anyGrantPermits([], "documents", "read"), false);
check(
  "one matching grant among several permits",
  anyGrantPermits(
    [grant("clerk", "forms", "read"), grant("clerk", "documents", "manage"), grant("clerk", "search", "read")],
    "documents",
    "manage",
  ),
  true,
);
check(
  "no matching grant denies",
  anyGrantPermits([grant("clerk", "forms", "read"), grant("clerk", "search", "read")], "documents", "manage"),
  false,
);
check(
  "a superadmin row anywhere in the set wins",
  anyGrantPermits([grant("clerk", "forms", "read"), systemGrant("platform_admin")], "documents", "manage"),
  true,
);
check(
  "read-only grants never satisfy a manage requirement",
  anyGrantPermits([grant("clerk", "documents", "read"), grant("clerk", "*", "read")], "documents", "manage"),
  false,
);

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
