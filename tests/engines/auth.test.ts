// Unlike rules/forms/notifications/documents, auth.ts has no db import, so
// it's tested directly rather than via an extracted `.core.ts` copy.
import { signToken, verifyToken, type JwtPayload } from "../../artifacts/api-server/src/lib/auth";

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
function throws(name: string, fn: () => unknown) {
  try {
    fn();
    fail++;
    console.log(`  FAIL  ${name} (expected throw)`);
  } catch {
    pass++;
    console.log(`  PASS  ${name}`);
  }
}

const payload: JwtPayload = { userId: 1, tenantId: 1, username: "juan" };

console.log("\n— Round trip —");
const token = signToken(payload);
check("verify returns the signed payload", (({ userId, tenantId, username }) => ({ userId, tenantId, username }))(verifyToken(token)), payload);

console.log("\n— Tamper rejection —");
const [header, body, sig] = token.split(".");
const tampered = `${header}.${body}.${sig.slice(0, -1)}${sig.at(-1) === "a" ? "b" : "a"}`;
throws("flipped signature byte is rejected", () => verifyToken(tampered));

const [h2, , s2] = token.split(".");
const forgedPayload = Buffer.from(JSON.stringify({ ...payload, userId: 999 })).toString("base64url");
throws("re-signed payload without matching signature is rejected", () => verifyToken(`${h2}.${forgedPayload}.${s2}`));

console.log("\n— Malformed input —");
throws("empty string is rejected", () => verifyToken(""));
throws("random string is rejected", () => verifyToken("not-a-jwt"));

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
