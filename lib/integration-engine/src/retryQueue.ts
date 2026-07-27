import { eq, and, or, inArray, lte, asc } from "drizzle-orm";
import { db, integrationRetryQueueTable, type IntegrationRetryQueueItem } from "@workspace/db";
import { STALE_PROCESSING_MS } from "@workspace/queue-utils";
import { decideRetry } from "./retryPolicy";

// Integration Engine (Sprint 2A) — Retry Queue worker.
//
// Mirrors notificationEngine.ts's processQueue() closely and deliberately:
// claim due rows inside a transaction with SELECT ... FOR UPDATE SKIP
// LOCKED so two concurrent callers (two worker processes, or two
// near-simultaneous manual triggers) never claim — and so never double
// deliver — the same row. Each claimed row is then delivered in isolation,
// so one unreachable webhook endpoint never blocks the rest of the batch.
//
// `payload` already contains the exact url/body/signature to send (built by
// eventBus.publish() via webhookFramework.buildDeliveryPayload), so this
// worker never needs to look at webhook_subscriptions itself — it just
// ships bytes and records the outcome.

// STALE_PROCESSING_MS (imported above, from @workspace/queue-utils): a row
// claimed by a worker that then crashed mid-delivery would otherwise sit
// "processing" forever; treat it as due again after this long. Same
// tradeoff notificationEngine makes: a possible duplicate delivery if the
// original worker was merely slow (not dead) beats losing the job.

export interface QueuedDelivery {
  url: string;
  body: string;
  signature: string;
}

function parsePayload(raw: string): QueuedDelivery | null {
  try {
    const parsed = JSON.parse(raw) as Partial<QueuedDelivery>;
    if (typeof parsed.url === "string" && typeof parsed.body === "string" && typeof parsed.signature === "string") {
      return { url: parsed.url, body: parsed.body, signature: parsed.signature };
    }
    return null;
  } catch {
    return null;
  }
}

export interface DeliverOutcome {
  ok: boolean;
  status?: number;
  detail?: string;
}

export type DeliverFn = (delivery: QueuedDelivery) => Promise<DeliverOutcome>;

// Real network delivery. Injectable via opts.deliver so tests never make an
// actual HTTP call — same pattern as ApiClient's fetchImpl.
const defaultDeliver: DeliverFn = async (delivery) => {
  try {
    const res = await fetch(delivery.url, {
      method: "POST",
      headers: { "content-type": "application/json", "X-GovCore-Signature": delivery.signature },
      body: delivery.body,
    });
    return { ok: res.ok, status: res.status, detail: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : "Unknown delivery error" };
  }
};

export interface ProcessQueueResult {
  processed: number;
  delivered: number;
  failed: number;
  deadLettered: number;
}

export async function processQueue(
  opts: { tenantId?: number; limit?: number; deliver?: DeliverFn; now?: Date } = {},
): Promise<ProcessQueueResult> {
  const limit = Math.min(opts.limit ?? 25, 100);
  const deliver = opts.deliver ?? defaultDeliver;
  const now = opts.now ?? new Date();
  const staleBefore = new Date(now.getTime() - STALE_PROCESSING_MS);

  const dueCondition = or(
    and(inArray(integrationRetryQueueTable.status, ["pending", "failed"]), lte(integrationRetryQueueTable.availableAt, now)),
    and(eq(integrationRetryQueueTable.status, "processing"), lte(integrationRetryQueueTable.updatedAt, staleBefore)),
  );
  const conditions = opts.tenantId ? and(dueCondition, eq(integrationRetryQueueTable.tenantId, opts.tenantId)) : dueCondition;

  const claimed = await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(integrationRetryQueueTable)
      .where(conditions)
      .orderBy(asc(integrationRetryQueueTable.availableAt))
      .limit(limit)
      .for("update", { skipLocked: true });

    if (rows.length === 0) return [];

    // Claimed before this transaction commits, so no other caller's SELECT
    // can pick up these rows again while they're in flight.
    await tx
      .update(integrationRetryQueueTable)
      .set({ status: "processing" })
      .where(
        inArray(
          integrationRetryQueueTable.id,
          rows.map((r) => r.id),
        ),
      );

    return rows;
  });

  let delivered = 0;
  let failed = 0;
  let deadLettered = 0;

  for (const item of claimed) {
    const attempt = item.attempts + 1;
    const parsed = parsePayload(item.payload);

    if (!parsed) {
      // A malformed payload can never succeed on retry — dead-letter it
      // immediately instead of burning attempts against a job that will
      // never deliver.
      await db
        .update(integrationRetryQueueTable)
        .set({ status: "dead_letter", attempts: attempt, lastError: "Unparseable retry queue payload" })
        .where(eq(integrationRetryQueueTable.id, item.id));
      deadLettered++;
      continue;
    }

    const outcome = await deliver(parsed);

    if (outcome.ok) {
      await db
        .update(integrationRetryQueueTable)
        .set({ status: "delivered", attempts: attempt, lastError: null })
        .where(eq(integrationRetryQueueTable.id, item.id));
      delivered++;
      continue;
    }

    const decision = decideRetry(attempt, item.maxAttempts, now);
    await db
      .update(integrationRetryQueueTable)
      .set({
        status: decision.isDeadLetter ? "dead_letter" : "failed",
        attempts: attempt,
        lastError: outcome.detail ?? "Delivery failed",
        availableAt: decision.nextAvailableAt ?? item.availableAt,
      })
      .where(eq(integrationRetryQueueTable.id, item.id));
    if (decision.isDeadLetter) deadLettered++;
    else failed++;
  }

  return { processed: claimed.length, delivered, failed, deadLettered };
}

export async function listRetryQueue(
  tenantId: number,
  opts: { status?: string; limit?: number } = {},
): Promise<IntegrationRetryQueueItem[]> {
  const limit = Math.min(opts.limit ?? 50, 200);
  const conditions = opts.status
    ? and(eq(integrationRetryQueueTable.tenantId, tenantId), eq(integrationRetryQueueTable.status, opts.status))
    : eq(integrationRetryQueueTable.tenantId, tenantId);
  return db.select().from(integrationRetryQueueTable).where(conditions).orderBy(asc(integrationRetryQueueTable.id)).limit(limit);
}
