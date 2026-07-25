import { randomBytes } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { db, webhookSubscriptionsTable, type WebhookSubscription } from "@workspace/db";
import { signPayload } from "./retryPolicy";

// Integration Engine (Sprint 2A) — Webhook framework: register/list/pause a
// webhook_subscriptions row, and turn an event into a signed delivery
// envelope. Actually POSTing the envelope is the Retry Queue's job
// (retryQueue.ts) — this module only manages subscriptions and builds what
// gets sent, mirroring the Notification Engine's split between "resolve
// recipients" and "process queue".

/** `secret` is never returned once set, same convention as password/token columns elsewhere in this codebase. */
export function serializeWebhookSubscription(w: WebhookSubscription) {
  const { secret: _secret, ...rest } = w;
  return { ...rest, createdAt: w.createdAt.toISOString(), updatedAt: w.updatedAt.toISOString() };
}

export interface RegisterWebhookOptions {
  tenantId: number;
  eventType: string; // exact event type, or "*" for all events
  targetUrl: string;
  integrationEndpointId?: number | null;
  /** Honored verbatim if supplied (e.g. rotating an existing secret); otherwise a random one is generated. */
  secret?: string;
}

export async function registerWebhook(opts: RegisterWebhookOptions): Promise<WebhookSubscription> {
  const secret = opts.secret ?? randomBytes(32).toString("hex");
  const [row] = await db
    .insert(webhookSubscriptionsTable)
    .values({
      tenantId: opts.tenantId,
      integrationEndpointId: opts.integrationEndpointId ?? null,
      eventType: opts.eventType,
      targetUrl: opts.targetUrl,
      secret,
      status: "active",
    })
    .returning();
  return row;
}

export async function listWebhooks(tenantId: number): Promise<WebhookSubscription[]> {
  return db.select().from(webhookSubscriptionsTable).where(eq(webhookSubscriptionsTable.tenantId, tenantId));
}

export async function getWebhook(tenantId: number, id: number): Promise<WebhookSubscription | null> {
  const [row] = await db
    .select()
    .from(webhookSubscriptionsTable)
    .where(and(eq(webhookSubscriptionsTable.tenantId, tenantId), eq(webhookSubscriptionsTable.id, id)));
  return row ?? null;
}

/**
 * Sets a subscription's status (active | paused | disabled). Pausing keeps
 * the row — and its secret — intact so it can be resumed without the
 * receiver having to re-verify a new signing key.
 */
export async function setWebhookStatus(
  tenantId: number,
  id: number,
  status: "active" | "paused" | "disabled",
): Promise<WebhookSubscription | null> {
  const [row] = await db
    .update(webhookSubscriptionsTable)
    .set({ status })
    .where(and(eq(webhookSubscriptionsTable.tenantId, tenantId), eq(webhookSubscriptionsTable.id, id)))
    .returning();
  return row ?? null;
}

export interface WebhookDeliveryPayload {
  /** JSON-encoded envelope: `{ eventType, payload, deliveredAt }`. */
  body: string;
  /** HMAC-SHA256, hex-encoded, sent as the `X-GovCore-Signature` header. */
  signature: string;
}

/**
 * Turns an event into the exact bytes that get POSTed, plus its signature.
 * Signing happens over the exact `body` string (not the parsed object), so
 * the receiver's byte-for-byte HMAC check matches what was actually sent
 * over the wire.
 */
export function buildDeliveryPayload(
  subscription: Pick<WebhookSubscription, "secret">,
  eventType: string,
  payload: unknown,
): WebhookDeliveryPayload {
  const body = JSON.stringify({ eventType, payload, deliveredAt: new Date().toISOString() });
  return { body, signature: signPayload(body, subscription.secret) };
}

/** An event matches a subscription if the types are identical, or the subscription is wildcarded ("*" = all events). */
export function eventMatchesSubscription(eventType: string, subscriptionEventType: string): boolean {
  return subscriptionEventType === "*" || subscriptionEventType === eventType;
}
