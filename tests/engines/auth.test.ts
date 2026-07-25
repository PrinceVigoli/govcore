import type { Request } from "express";
import type { JwtPayload } from "../../artifacts/api-server/src/lib/auth";

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

process.env.DATABASE_URL ??= "******127.0.0.1:5432/govcore_test";


async function main() {
  const { getActor } = await import("../../artifacts/api-server/src/lib/auth");

  console.log("\n— Actor extraction —");
  const actor: JwtPayload = {
    userId: 1,
    tenantId: 1,
    username: "juan",
    email: "juan@example.com",
    clerkUserId: "user_123",
  };
  const req = { user: actor } as Request;
  check("getActor returns attached actor", getActor(req), actor);
  check("getActor preserves actor reference", getActor(req) === actor, true);

  console.log(`\n${pass} passed, ${fail} failed\n`);
  if (fail > 0) process.exit(1);
}

void main();
