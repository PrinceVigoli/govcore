// Shared, dependency-free logic for the platform's two DB-backed queue
// workers: the Notification Engine's `notification_queue`
// (`notificationEngine.ts`) and the Integration Engine's
// `integration_retry_queue` (`retryQueue.ts`). Both claim due rows with
// `SELECT ... FOR UPDATE SKIP LOCKED`, reclaim stale "processing" rows after
// a crash, and back off failed attempts the same way — this module is the
// single place that formula lives, so the two queues can't silently drift
// against each other (Task 3, Sprint 2A: reduce coupling/duplication between
// the Notification and Integration engines).

/**
 * Exponential backoff between delivery attempts, capped at 1 hour, so a
 * provider outage or unreachable webhook endpoint doesn't get hammered by a
 * queue draining at full speed.
 */
export function backoffMs(attempt: number): number {
  return Math.min(60_000 * 2 ** (attempt - 1), 60 * 60_000);
}

/**
 * A row claimed by a worker that then crashed (or was killed mid-delivery)
 * would otherwise sit in "processing" forever. Treating it as due again
 * after this long lets another worker pick it up — the tradeoff is a
 * possible duplicate send/delivery if the original worker was merely slow,
 * not dead, which both queues accept as preferable to losing the job.
 */
export const STALE_PROCESSING_MS = 5 * 60_000;
