import { createHmac, timingSafeEqual } from "node:crypto";
import { backoffMs } from "@workspace/queue-utils";

// Integration Engine (Sprint 2A) — pure retry/signature logic.
//
// `backoffMs` used to be defined here (and duplicated verbatim in
// notificationEngine.ts) so the two queues would back off identically. It
// now lives in `@workspace/queue-utils`, the single shared source both
// engines import, closing the "change both together or they'll drift" risk
// noted in replit.md (Task 3, Sprint 2A coupling/dedup pass). Re-exported
// here so existing imports of `backoffMs` from this module keep working.
export { backoffMs } from "@workspace/queue-utils";

export interface RetryDecision {
  shouldRetry: boolean;
  nextAvailableAt: Date | null;
  isDeadLetter: boolean;
}

/**
 * Decides what happens to a failed retry-queue job: retry with backoff, or
 * move to dead_letter once maxAttempts is exhausted. `now` is injected for
 * testability rather than read from Date.now() internally.
 */
export function decideRetry(attempts: number, maxAttempts: number, now: Date): RetryDecision {
  if (attempts >= maxAttempts) {
    return { shouldRetry: false, nextAvailableAt: null, isDeadLetter: true };
  }
  return { shouldRetry: true, nextAvailableAt: new Date(now.getTime() + backoffMs(attempts)), isDeadLetter: false };
}

/** Signs a webhook payload with HMAC-SHA256, hex-encoded. */
export function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

/**
 * Verifies a webhook signature using a constant-time comparison, so response
 * timing can't be used to guess the correct signature byte-by-byte. Returns
 * false (never throws) on malformed input — a receiver's job is to reject
 * bad signatures, not to crash on them.
 */
export function verifySignature(payload: string, secret: string, signature: string): boolean {
  const expected = signPayload(payload, secret);
  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(signature, "hex");
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}
