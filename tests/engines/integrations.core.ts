import { createHmac, timingSafeEqual } from "node:crypto";

// Integration Engine (Sprint 2A) — pure retry/backoff and signature logic.
// Mirrors `backoffMs` in notificationEngine.ts exactly (same formula, same
// cap) so the two queues behave identically to an operator reasoning about
// "how long until this retries". Kept dependency-free so it can be copied
// into tests/engines/integrations.core.ts for database-free tests.

/** Exponential backoff, capped at 1 hour — identical formula to the Notification Engine's queue worker. */
export function backoffMs(attempt: number): number {
  return Math.min(60_000 * 2 ** (attempt - 1), 60 * 60_000);
}

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
