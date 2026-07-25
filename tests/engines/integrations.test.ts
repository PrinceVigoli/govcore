import {
  backoffMs,
  decideRetry,
  signPayload,
  verifySignature,
} from './integrations.core';

let pass = 0, fail = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

console.log('\n— backoff (must match Notification Engine exactly) —');
check('attempt 1 = 1min', backoffMs(1), 60_000);
check('attempt 2 = 2min', backoffMs(2), 120_000);
check('attempt 3 = 4min', backoffMs(3), 240_000);
check('attempt 4 = 8min', backoffMs(4), 480_000);
check('caps at 1hr', backoffMs(20), 3_600_000);
check('monotonic up to the cap', backoffMs(5) > backoffMs(4), true);

console.log('\n— decideRetry: retry vs dead-letter —');
const now = new Date('2026-01-01T00:00:00Z');
const first = decideRetry(1, 8, now);
check('under maxAttempts -> retry', first.shouldRetry, true);
check('retry is not dead-letter', first.isDeadLetter, false);
check('schedules a future time', first.nextAvailableAt! > now, true);
// attempt 1 backoff is 60s
check('next attempt uses backoff', first.nextAvailableAt!.getTime() - now.getTime(), 60_000);

const exhausted = decideRetry(8, 8, now);
check('at maxAttempts -> dead-letter', exhausted.isDeadLetter, true);
check('dead-letter does not retry', exhausted.shouldRetry, false);
check('dead-letter has no next time', exhausted.nextAvailableAt, null);

const over = decideRetry(9, 8, now);
check('past maxAttempts -> still dead-letter', over.isDeadLetter, true);

console.log('\n— HMAC signing —');
const secret = 'whsec_test_1234567890';
const body = '{"event":"document.signed","id":42}';
const sig = signPayload(body, secret);
check('signature is 64 hex chars (sha256)', /^[0-9a-f]{64}$/.test(sig), true);
check('deterministic for same input', signPayload(body, secret), sig);
check('differs with a different secret', signPayload(body, 'other_secret') !== sig, true);
check('differs with a different body', signPayload('{"tampered":true}', secret) !== sig, true);

console.log('\n— signature verification —');
check('correct signature verifies', verifySignature(body, secret, sig), true);
check('wrong secret fails', verifySignature(body, 'wrong', sig), false);
check('tampered body fails', verifySignature('{"tampered":true}', secret, sig), false);
// A receiver must not crash on junk — verification returns false, never throws.
check('malformed hex signature -> false, no throw', verifySignature(body, secret, 'not-hex-zz'), false);
check('empty signature -> false', verifySignature(body, secret, ''), false);
check('length-mismatched signature -> false', verifySignature(body, secret, 'ab'), false);

// The whole point of the HMAC: a receiver can confirm the payload came from us
// and wasn't altered in transit. Round-trip it end to end.
console.log('\n— round trip (what a webhook receiver does) —');
const payload = JSON.stringify({ eventType: 'workflow.completed', at: '2026-01-01', instanceId: 7 });
const wireSig = signPayload(payload, secret);
check('receiver accepts an untampered delivery', verifySignature(payload, secret, wireSig), true);
const tampered = payload.replace('7', '8');
check('receiver rejects a tampered delivery', verifySignature(tampered, secret, wireSig), false);

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
