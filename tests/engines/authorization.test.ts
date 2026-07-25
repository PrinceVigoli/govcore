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

const grant = (roleCode: string, permissionModule: string | null, permissionAction: string | null): RoleGrant => ({
  roleCode,
  permissionModule,
  permissionAction,
});

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

console.log("\n— roleGrantsPermission: superadmin bypass —");
for (const code of SUPERADMIN_ROLE_CODES) {
  // Superadmins are allowed everything, even with no permission rows attached.
  check(`${code} allowed despite null grant`, roleGrantsPermission(grant(code, null, null), "documents", "manage"), true);
  check(`${code} allowed on read`, roleGrantsPermission(grant(code, null, null), "search", "read"), true);
}

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
  anyGrantPermits([grant("clerk", "forms", "read"), grant("platform_admin", null, null)], "documents", "manage"),
  true,
);
check(
  "read-only grants never satisfy a manage requirement",
  anyGrantPermits([grant("clerk", "documents", "read"), grant("clerk", "*", "read")], "documents", "manage"),
  false,
);

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
