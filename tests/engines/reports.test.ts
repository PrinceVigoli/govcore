// Tests for the pure Report Engine core (Book 10): the spec compiler, CSV
// serialization, and cron scheduling. The compiler is the security boundary —
// it turns user-supplied report config into SQL — so its tests are the point
// of this suite: whitelisting, unconditional tenant scoping, parameterization,
// and validation are all verified here without a database.

import {
  validateSpec,
  compileQuery,
  type ReportSpec,
} from "../../lib/report-engine/src/compiler";
import { rowsToCsv, toCsvValue } from "../../lib/report-engine/src/csv";
import { isValidCron, cronMatches, nextRunAfter, isDue } from "../../lib/report-engine/src/schedule";

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
function checkThrows(name: string, fn: () => unknown) {
  try {
    fn();
    fail++;
    console.log(`  FAIL  ${name}\n        expected a throw, but it returned`);
  } catch {
    pass++;
    console.log(`  PASS  ${name}`);
  }
}

console.log("\n— validateSpec: source & column whitelisting —");
check("unknown source rejected", validateSpec("secrets", { columns: [] }).ok, false);
check("known source, valid column ok", validateSpec("documents", { columns: ["title"] }).ok, true);
check("unknown column rejected", validateSpec("documents", { columns: ["ssn"] }).ok, false);
check(
  "unknown column names the offender",
  validateSpec("documents", { columns: ["ssn"] }).errors[0].includes("ssn"),
  true,
);

console.log("\n— validateSpec: filters —");
check("valid filter ok", validateSpec("documents", { columns: ["title"], filters: [{ column: "status", operator: "eq", value: "signed" }] }).ok, true);
check("filter on unknown column rejected", validateSpec("documents", { columns: [], filters: [{ column: "nope", operator: "eq", value: 1 }] }).ok, false);
check("operator needing value, missing value rejected", validateSpec("documents", { columns: [], filters: [{ column: "title", operator: "eq" }] }).ok, false);
check("contains on non-text rejected", validateSpec("documents", { columns: [], filters: [{ column: "id", operator: "contains", value: "x" }] }).ok, false);
check("in without array rejected", validateSpec("documents", { columns: [], filters: [{ column: "status", operator: "in", value: "signed" }] }).ok, false);
check("is_null needs no value", validateSpec("documents", { columns: [], filters: [{ column: "referenceNumber", operator: "is_null" }] }).ok, true);

console.log("\n— validateSpec: enum operands —");
check("valid enum value ok", validateSpec("documents", { columns: [], filters: [{ column: "status", operator: "eq", value: "signed" }] }).ok, true);
check("invalid enum value rejected", validateSpec("documents", { columns: [], filters: [{ column: "status", operator: "eq", value: "banana" }] }).ok, false);
check("enum in-list all-valid ok", validateSpec("documents", { columns: [], filters: [{ column: "status", operator: "in", value: ["signed", "approved"] }] }).ok, true);
check("enum in-list with one bad value rejected", validateSpec("documents", { columns: [], filters: [{ column: "status", operator: "in", value: ["signed", "nope"] }] }).ok, false);

console.log("\n— validateSpec: grouping —");
check("group by groupable column ok", validateSpec("documents", { columns: ["status"], groupBy: ["status"] }).ok, true);
check("selected non-grouped column rejected", validateSpec("documents", { columns: ["title"], groupBy: ["status"] }).ok, false);
check("group by non-groupable column rejected", validateSpec("documents", { columns: [], groupBy: ["title"] }).ok, false);

console.log("\n— validateSpec: limit —");
check("negative limit rejected", validateSpec("documents", { columns: ["title"], limit: -5 }).ok, false);
check("zero limit rejected", validateSpec("documents", { columns: ["title"], limit: 0 }).ok, false);

console.log("\n— compileQuery: tenant scoping is unconditional —");
const q1 = compileQuery("documents", { columns: ["title"] }, 42);
check("tenant predicate present", /"tenant_id" = \$1/.test(q1.sql), true);
check("tenant id is the first bound param", q1.params[0], 42);
check("selects from the whitelisted table", /FROM "documents"/.test(q1.sql), true);
check("aliases column to its key", /"title" AS "title"/.test(q1.sql), true);
check("always has a LIMIT", /LIMIT \$\d+/.test(q1.sql), true);

console.log("\n— compileQuery: a tenant filter in the spec can't override scoping —");
// Even if someone crafts a spec, tenant scoping is added by the compiler from
// its own argument, not the spec — so it's always the caller's tenant.
const q2 = compileQuery("documents", { columns: ["title"], filters: [{ column: "status", operator: "eq", value: "signed" }] }, 7);
check("tenant still bound to caller's id", q2.params[0], 7);
check("filter value is parameterized, not inlined", q2.params.includes("signed"), true);
check("no raw value in SQL text", q2.sql.includes("signed"), false);

console.log("\n— compileQuery: parameterization of every operator —");
const q3 = compileQuery("documents", {
  columns: ["title"],
  filters: [
    { column: "title", operator: "contains", value: "permit" },
    { column: "status", operator: "in", value: ["signed", "approved"] },
  ],
}, 1);
check("contains becomes ILIKE with % wrapping in params", q3.params.includes("%permit%"), true);
check("in expands to one param per element", q3.params.filter((p) => p === "signed" || p === "approved").length, 2);
check("no operand inlined anywhere", /permit|signed|approved/.test(q3.sql), false);

console.log("\n— compileQuery: invalid spec must not compile —");
checkThrows("compiling an unknown column throws", () => compileQuery("documents", { columns: ["ssn"] }, 1));
checkThrows("compiling an invalid enum throws", () => compileQuery("documents", { columns: [], filters: [{ column: "status", operator: "eq", value: "banana" }] }, 1));

console.log("\n— compileQuery: grouping produces an aggregate —");
const q4 = compileQuery("documents", { columns: ["status"], groupBy: ["status"] }, 3);
check("group query counts", /count\(\*\)::int AS "count"/.test(q4.sql), true);
check("group query has GROUP BY", /GROUP BY "status"/.test(q4.sql), true);
check("grouped tenant scope still present", /"tenant_id" = \$1/.test(q4.sql), true);

console.log("\n— compileQuery: empty IN list is constant-false, not invalid SQL —");
const q5 = compileQuery("documents", { columns: ["title"], filters: [{ column: "status", operator: "in", value: [] }] }, 1);
check("empty IN compiles to false", /AND false/.test(q5.sql), true);

console.log("\n— compileQuery: default limit is bounded —");
const q6 = compileQuery("documents", { columns: ["title"], limit: 999999 }, 1);
check("limit capped at MAX_LIMIT (10000)", q6.params[q6.params.length - 1], 10000);

console.log("\n— toCsvValue: RFC-4180 quoting —");
check("plain value unquoted", toCsvValue("hello"), "hello");
check("comma triggers quoting", toCsvValue("a,b"), '"a,b"');
check("embedded quote is doubled", toCsvValue('she said "hi"'), '"she said ""hi"""');
check("newline triggers quoting", toCsvValue("line1\nline2"), '"line1\nline2"');
check("null is empty", toCsvValue(null), "");
check("undefined is empty", toCsvValue(undefined), "");
check("number stringified", toCsvValue(0), "0");
check("boolean stringified", toCsvValue(false), "false");

console.log("\n— rowsToCsv —");
check(
  "header + rows with CRLF",
  rowsToCsv([{ a: 1, b: "x" }, { a: 2, b: "y,z" }]),
  'a,b\r\n1,x\r\n2,"y,z"',
);
check("empty rows without columns is empty", rowsToCsv([]), "");
check("explicit columns drive header order", rowsToCsv([{ a: 1, b: 2 }], ["b", "a"]), "b,a\r\n2,1");

console.log("\n— cron: validation —");
check("valid 5-field", isValidCron("0 6 * * *"), true);
check("step value valid", isValidCron("*/15 * * * *"), true);
check("wrong field count invalid", isValidCron("0 6 * *"), false);
check("range unsupported -> invalid", isValidCron("0 9-17 * * *"), false);
check("list unsupported -> invalid", isValidCron("0 6,18 * * *"), false);

console.log("\n— cron: matching —");
check("daily 6am matches 06:00", cronMatches("0 6 * * *", new Date("2026-03-01T06:00:00Z")), true);
check("daily 6am does not match 06:01", cronMatches("0 6 * * *", new Date("2026-03-01T06:01:00Z")), false);
check("every 15 min matches :30", cronMatches("*/15 * * * *", new Date("2026-03-01T09:30:00Z")), true);
check("every 15 min does not match :31", cronMatches("*/15 * * * *", new Date("2026-03-01T09:31:00Z")), false);

console.log("\n— cron: nextRunAfter —");
const next = nextRunAfter("0 6 * * *", new Date("2026-03-01T07:00:00Z"));
check("next daily-6am after 7am is tomorrow 6am", next?.toISOString(), "2026-03-02T06:00:00.000Z");
check("invalid cron yields null", nextRunAfter("nonsense", new Date()), null);
const nextQuarter = nextRunAfter("*/15 * * * *", new Date("2026-03-01T09:07:00Z"));
check("next */15 after 09:07 is 09:15", nextQuarter?.toISOString(), "2026-03-01T09:15:00.000Z");

console.log("\n— isDue —");
check("enabled & past due -> due", isDue({ enabled: true, nextRunAt: new Date("2026-01-01T00:00:00Z") }, new Date("2026-01-01T00:05:00Z")), true);
check("disabled -> not due", isDue({ enabled: false, nextRunAt: new Date("2020-01-01T00:00:00Z") }, new Date()), false);
check("null nextRunAt -> not due", isDue({ enabled: true, nextRunAt: null }, new Date()), false);
check("future nextRunAt -> not due", isDue({ enabled: true, nextRunAt: new Date("2030-01-01T00:00:00Z") }, new Date("2026-01-01T00:00:00Z")), false);

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
