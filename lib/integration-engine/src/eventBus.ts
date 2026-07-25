import { eq, and, desc } from "drizzle-orm";
import {
  db,
  integrationEventsTable,
  webhookSubscriptionsTable,
  integrationRetryQueueTable,
  type IntegrationEvent,
} from "@workspace/db";
import { eventMatchesSubscription, buildDeliveryPayload } from "./webhookFramework";

// Integration Engine (Sprint 2A) — Event Publisher/Subscriber.
//
// publish() does two things in one call:
//   1. Persists the event to the append-only integration_events log, so a
//      late-registered webhook subscription can look back at history.
//   2. Enqueues one integration_retry_queue row per matching *active*
//      webhook subscription — one row per fan-out target, the same shape
//      notification_queue uses (one row per resolved recipient).
//
// subscribe() is a second, independent fan-out for same-process listeners
// (e.g. another engine wanting a callback without going through HTTP). It
// never touches the DB and isn't persisted, so a listener registered after
// an event fires simply misses it — that's what the durable log + retry
// queue exist for.

type Listener = (eventType: string, payload: unknown) => void | Promise<void>;

const listeners = new Set<Listener>();

/** Registers an in-process listener notified on every publish() call in this process. Returns an unsubscribe function. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function serializeIntegrationEvent(e: IntegrationEvent) {
  return { ...e, createdAt: e.createdAt.toISOString() };
}

export interface PublishOptions {
  tenantId: number;
  eventType: string;
  payload: unknown;
  sourceModule?: string;
}

export interface PublishResult {
  event: IntegrationEvent;
  /** Number of retry-queue rows enqueued for matching active subscriptions. */
  queued: number;
}

export async function publish(opts: PublishOptions): Promise<PublishResult> {
  const [event] = await db
    .insert(integrationEventsTable)
    .values({
      tenantId: opts.tenantId,
      eventType: opts.eventType,
      payload: JSON.stringify(opts.payload),
      sourceModule: opts.sourceModule ?? null,
    })
    .returning();

  const activeSubscriptions = await db
    .select()
    .from(webhookSubscriptionsTable)
    .where(and(eq(webhookSubscriptionsTable.tenantId, opts.tenantId), eq(webhookSubscriptionsTable.status, "active")));

  const matching = activeSubscriptions.filter((s) => eventMatchesSubscription(opts.eventType, s.eventType));

  let queued = 0;
  for (const subscription of matching) {
    const delivery = buildDeliveryPayload(subscription, opts.eventType, opts.payload);
    await db.insert(integrationRetryQueueTable).values({
      tenantId: opts.tenantId,
      jobType: "webhook_delivery",
      webhookSubscriptionId: subscription.id,
      integrationEventId: event.id,
      payload: JSON.stringify({ url: subscription.targetUrl, body: delivery.body, signature: delivery.signature }),
      status: "pending",
    });
    queued++;
  }

  // Same isolation principle as the Rules/Notification engines: one bad
  // listener never breaks the publish call for the caller, and never
  // blocks another listener from running.
  for (const listener of listeners) {
    try {
      await listener(opts.eventType, opts.payload);
    } catch {
      // in-process listener failures are the listener's problem, not the publisher's
    }
  }

  return { event, queued };
}

export async function listEvents(
  tenantId: number,
  opts: { eventType?: string; limit?: number } = {},
): Promise<IntegrationEvent[]> {
  const limit = Math.min(opts.limit ?? 50, 200);
  const conditions = opts.eventType
    ? and(eq(integrationEventsTable.tenantId, tenantId), eq(integrationEventsTable.eventType, opts.eventType))
    : eq(integrationEventsTable.tenantId, tenantId);
  return db.select().from(integrationEventsTable).where(conditions).orderBy(desc(integrationEventsTable.id)).limit(limit);
}
