import { eq, and, or, isNull, lte, asc, inArray, desc } from "drizzle-orm";
import {
  db,
  usersTable,
  userRolesTable,
  notificationsTable,
  notificationTemplatesTable,
  notificationQueueTable,
  notificationDeliveryTable,
  notificationPreferencesTable,
  type Notification,
  type NotificationTemplate,
  type NotificationQueueItem,
  type NotificationDelivery,
  type NotificationPreference,
} from "@workspace/db";

// ── Serialization ──────────────────────────────────────────────────────────
// Every date column is serialized to an ISO string so the wire shape matches
// the OpenAPI spec (`format: date-time`).

export function serializeTemplate(t: NotificationTemplate) {
  return { ...t, createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString() };
}

export function serializeNotification(n: Notification) {
  return {
    ...n,
    scheduledFor: n.scheduledFor ? n.scheduledFor.toISOString() : null,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
  };
}

export function serializeQueueItem(q: NotificationQueueItem) {
  return {
    ...q,
    availableAt: q.availableAt.toISOString(),
    createdAt: q.createdAt.toISOString(),
    updatedAt: q.updatedAt.toISOString(),
  };
}

export function serializeDelivery(d: NotificationDelivery) {
  return { ...d, createdAt: d.createdAt.toISOString() };
}

export function serializePreference(p: NotificationPreference) {
  return { ...p, createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString() };
}

// ── Channels ───────────────────────────────────────────────────────────────
// §4 Notification Channels. Webhooks are listed as future work in the spec and
// are deliberately not implemented here.

export const CHANNELS = ["email", "sms", "push", "in_app", "announcement"] as const;
export type Channel = (typeof CHANNELS)[number];

// ── Template rendering (§6 Templates) ──────────────────────────────────────

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

export function parseVariables(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/**
 * Substitutes {{variable}} placeholders from a payload. An unresolved
 * placeholder is left verbatim rather than replaced with "undefined": a
 * citizen receiving "Dear {{citizen_name}}" is an obvious, reportable bug,
 * whereas "Dear undefined" reads like a broken system and is easy to miss in
 * review. Missing variables are reported separately by renderTemplate().
 */
export function renderString(template: string, payload: Record<string, unknown>): string {
  return template.replace(PLACEHOLDER, (match, key: string) => {
    const value = payload[key];
    if (value === undefined || value === null) return match;
    return String(value);
  });
}

export function collectPlaceholders(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(PLACEHOLDER)) found.add(match[1]);
  return [...found];
}

export interface RenderResult {
  subject: string | null;
  body: string;
  missingVariables: string[];
}

/**
 * Renders a template's subject and body against a payload, and reports any
 * placeholder the payload didn't supply. Callers decide whether a missing
 * variable is fatal — the send endpoint rejects it, so a half-filled message
 * never reaches a citizen.
 */
export function renderTemplate(template: NotificationTemplate, payload: Record<string, unknown>): RenderResult {
  const declared = parseVariables(template.variables);
  const used = new Set([...collectPlaceholders(template.body), ...collectPlaceholders(template.subject ?? "")]);
  for (const name of declared) used.add(name);

  const missingVariables = [...used].filter((name) => payload[name] === undefined || payload[name] === null);

  return {
    subject: template.subject ? renderString(template.subject, payload) : null,
    body: renderString(template.body, payload),
    missingVariables,
  };
}

/**
 * Resolves the single active template for a code/channel/locale, falling back
 * to the tenant's "en" template when the requested locale has no active
 * version — a missing translation should still deliver the message rather than
 * silently dropping it (§2 Multi-language).
 */
export async function resolveTemplate(opts: {
  tenantId: number;
  code: string;
  channel: string;
  locale?: string;
}): Promise<NotificationTemplate | null> {
  const locale = opts.locale ?? "en";

  const [exact] = await db
    .select()
    .from(notificationTemplatesTable)
    .where(
      and(
        eq(notificationTemplatesTable.tenantId, opts.tenantId),
        eq(notificationTemplatesTable.code, opts.code),
        eq(notificationTemplatesTable.channel, opts.channel),
        eq(notificationTemplatesTable.locale, locale),
        eq(notificationTemplatesTable.status, "active"),
      ),
    )
    .orderBy(desc(notificationTemplatesTable.version))
    .limit(1);
  if (exact) return exact;

  if (locale === "en") return null;

  const [fallback] = await db
    .select()
    .from(notificationTemplatesTable)
    .where(
      and(
        eq(notificationTemplatesTable.tenantId, opts.tenantId),
        eq(notificationTemplatesTable.code, opts.code),
        eq(notificationTemplatesTable.channel, opts.channel),
        eq(notificationTemplatesTable.locale, "en"),
        eq(notificationTemplatesTable.status, "active"),
      ),
    )
    .orderBy(desc(notificationTemplatesTable.version))
    .limit(1);
  return fallback ?? null;
}

// ── Recipient resolution (§5 Recipient Resolution) ─────────────────────────

export interface ResolvedRecipient {
  userId: number | null;
  address: string;
}

function addressForChannel(
  channel: string,
  user: { id: number; email: string },
): string | null {
  switch (channel) {
    case "email":
      return user.email;
    case "in_app":
    case "push":
      // In-app and push target the user record itself; the delivery adapter
      // looks up device tokens at send time rather than freezing them here,
      // since a token can be revoked between queueing and delivery.
      return String(user.id);
    case "sms":
      // The platform has no phone column yet (see Book 04 Identity). Rather
      // than invent one, SMS recipients must be passed explicitly as addresses.
      return null;
    default:
      return null;
  }
}

/**
 * Expands a send request into concrete recipients. Explicit addresses are
 * taken as-is; userIds and roleIds are resolved against the platform's
 * identity tables and filtered by each user's notification preferences.
 *
 * Preference filtering is deliberately opt-out: a user with no preference row
 * receives the message, because most recipients never open their settings and
 * silently dropping a permit decision would be worse than an unwanted email.
 */
export async function resolveRecipients(opts: {
  tenantId: number;
  channel: string;
  eventType: string;
  userIds?: number[];
  roleIds?: number[];
  addresses?: string[];
}): Promise<{ recipients: ResolvedRecipient[]; suppressed: number[]; unroutable: number[] }> {
  const userIds = new Set<number>(opts.userIds ?? []);

  if (opts.roleIds && opts.roleIds.length > 0) {
    const assignments = await db
      .select()
      .from(userRolesTable)
      .where(inArray(userRolesTable.roleId, opts.roleIds));
    for (const a of assignments) userIds.add(a.userId);
  }

  const recipients: ResolvedRecipient[] = [];
  const suppressed: number[] = [];
  const unroutable: number[] = [];

  for (const address of opts.addresses ?? []) {
    const trimmed = address.trim();
    if (trimmed) recipients.push({ userId: null, address: trimmed });
  }

  if (userIds.size > 0) {
    const users = await db
      .select()
      .from(usersTable)
      .where(and(inArray(usersTable.id, [...userIds]), eq(usersTable.tenantId, opts.tenantId), eq(usersTable.status, "active")));

    const prefs = await db
      .select()
      .from(notificationPreferencesTable)
      .where(
        and(
          eq(notificationPreferencesTable.tenantId, opts.tenantId),
          eq(notificationPreferencesTable.channel, opts.channel),
          inArray(notificationPreferencesTable.userId, [...userIds]),
        ),
      );

    for (const user of users) {
      if (!isChannelEnabled(prefs, user.id, opts.eventType)) {
        suppressed.push(user.id);
        continue;
      }
      const address = addressForChannel(opts.channel, user);
      if (!address) {
        unroutable.push(user.id);
        continue;
      }
      recipients.push({ userId: user.id, address });
    }
  }

  // Two roles can both include the same user; dedupe so nobody is messaged twice.
  const seen = new Set<string>();
  const deduped = recipients.filter((r) => {
    const key = `${r.userId ?? "-"}:${r.address}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { recipients: deduped, suppressed, unroutable };
}

/**
 * An event-specific preference row wins over the channel default; with neither,
 * the channel is enabled.
 */
export function isChannelEnabled(
  prefs: NotificationPreference[],
  userId: number,
  eventType: string,
): boolean {
  const forUser = prefs.filter((p) => p.userId === userId);
  const specific = forUser.find((p) => p.eventType === eventType);
  if (specific) return specific.enabled;
  const fallback = forUser.find((p) => p.eventType === null);
  if (fallback) return fallback.enabled;
  return true;
}

// ── Queueing (§5 Queue, ADR-0018 asynchronous delivery) ────────────────────

/**
 * Enqueues one row per recipient and records a "queued" delivery event for
 * each. Runs in a single transaction with the caller's notification insert so
 * a notification never exists without its queue rows.
 */
export async function enqueueRecipients(
  tx: typeof db,
  opts: {
    notification: Notification;
    recipients: ResolvedRecipient[];
  },
): Promise<NotificationQueueItem[]> {
  const { notification, recipients } = opts;
  if (recipients.length === 0) return [];

  const availableAt = notification.scheduledFor ?? new Date();
  const rows: NotificationQueueItem[] = [];

  for (const recipient of recipients) {
    const [row] = await tx
      .insert(notificationQueueTable)
      .values({
        notificationId: notification.id,
        tenantId: notification.tenantId,
        recipientUserId: recipient.userId,
        recipientAddress: recipient.address,
        channel: notification.channel,
        priority: notification.priority,
        status: "pending",
        availableAt,
      })
      .returning();
    rows.push(row);

    await tx.insert(notificationDeliveryTable).values({
      notificationId: notification.id,
      queueItemId: row.id,
      tenantId: notification.tenantId,
      recipientAddress: recipient.address,
      channel: notification.channel,
      eventType: "queued",
      attempt: 0,
    });
  }

  return rows;
}

// ── Delivery adapters (§4) ─────────────────────────────────────────────────

export interface DeliveryOutcome {
  ok: boolean;
  providerMessageId?: string;
  detail?: string;
}

/**
 * Channel adapters. Only in-app delivery is genuinely terminal here: the
 * message is already durably stored in `notifications`, so "delivering" it is
 * a no-op that the recipient reads from the API.
 *
 * Email/SMS/push have no configured provider in this deployment. Rather than
 * pretend to send and record a false success in the audit trail, they fail
 * with an explicit "no provider configured" error, which routes them through
 * the normal retry/dead-letter path and leaves an honest record. Wiring a real
 * provider means implementing this one function.
 */
export async function deliver(opts: {
  channel: string;
  address: string;
  subject: string | null;
  body: string;
}): Promise<DeliveryOutcome> {
  switch (opts.channel) {
    case "in_app":
    case "announcement":
      return { ok: true, providerMessageId: `inapp:${opts.address}` };
    case "email":
    case "sms":
    case "push":
      return {
        ok: false,
        detail: `No ${opts.channel} provider is configured for this deployment`,
      };
    default:
      return { ok: false, detail: `Unknown channel "${opts.channel}"` };
  }
}

// Exponential backoff between attempts, so a provider outage doesn't get
// hammered by a queue draining at full speed (§13 Retry policies).
function backoffMs(attempt: number): number {
  return Math.min(60_000 * 2 ** (attempt - 1), 60 * 60_000);
}

const PRIORITY_RANK: Record<string, number> = { high: 0, normal: 1, low: 2 };

// A row claimed by a worker that then crashed (or was killed mid-delivery)
// would otherwise sit in "processing" forever. Treating it as due again after
// this long lets another worker pick it up — the tradeoff is a possible
// duplicate send if the original worker was merely slow, not dead, which is
// preferable to losing the notification.
const STALE_PROCESSING_MS = 5 * 60_000;

/**
 * Processes due queue items (§13 Queue workers, Batch processing, Channel
 * prioritization). Each item is isolated: one recipient's failure never aborts
 * the batch, mirroring how the Rules Engine isolates rule failures.
 *
 * An item that exhausts maxAttempts moves to "dead_letter" rather than
 * retrying forever, and its notification is marked failed only when no
 * recipient succeeded.
 *
 * Concurrency: the previous version selected due rows and only updated their
 * status once delivery finished several `await`s later, so two overlapping
 * calls to this function — two worker processes, or two nearly-simultaneous
 * `POST /notifications/send` requests — could both select the same pending
 * row and send it twice. Rows are now claimed up front, inside a transaction,
 * with `SELECT ... FOR UPDATE SKIP LOCKED`: a concurrent caller's select
 * simply skips whatever this one has already locked, so the two callers get
 * disjoint rows (or the second gets none) instead of a shared set.
 */
export async function processQueue(opts: { tenantId?: number; limit?: number } = {}): Promise<{
  processed: number;
  sent: number;
  failed: number;
  deadLettered: number;
}> {
  const limit = Math.min(opts.limit ?? 25, 100);
  const now = new Date();
  const staleBefore = new Date(now.getTime() - STALE_PROCESSING_MS);

  const dueCondition = or(
    and(inArray(notificationQueueTable.status, ["pending", "failed"]), lte(notificationQueueTable.availableAt, now)),
    and(eq(notificationQueueTable.status, "processing"), lte(notificationQueueTable.updatedAt, staleBefore)),
  );
  const conditions = opts.tenantId ? and(dueCondition, eq(notificationQueueTable.tenantId, opts.tenantId)) : dueCondition;

  const claimed = await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(notificationQueueTable)
      .where(conditions)
      .orderBy(asc(notificationQueueTable.availableAt))
      .limit(limit)
      .for("update", { skipLocked: true });

    if (rows.length === 0) return [];

    // Claimed before this transaction commits, so no other caller's SELECT —
    // whether blocked by the row lock or arriving after commit — can select
    // these rows again while they're in flight.
    await tx
      .update(notificationQueueTable)
      .set({ status: "processing" })
      .where(
        inArray(
          notificationQueueTable.id,
          rows.map((r) => r.id),
        ),
      );

    return rows;
  });

  // Channel prioritization: high-priority messages go first within the batch.
  claimed.sort((a, b) => (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1));

  let sent = 0;
  let failed = 0;
  let deadLettered = 0;

  for (const item of claimed) {
    const attempt = item.attempts + 1;
    const [notification] = await db.select().from(notificationsTable).where(eq(notificationsTable.id, item.notificationId));
    if (!notification) continue;

    let outcome: DeliveryOutcome;
    try {
      outcome = await deliver({
        channel: item.channel,
        address: item.recipientAddress,
        subject: notification.subject,
        body: notification.body,
      });
    } catch (err) {
      outcome = { ok: false, detail: err instanceof Error ? err.message : "Unknown delivery error" };
    }

    if (outcome.ok) {
      await db
        .update(notificationQueueTable)
        .set({ status: "sent", attempts: attempt, lastError: null })
        .where(eq(notificationQueueTable.id, item.id));
      await db.insert(notificationDeliveryTable).values({
        notificationId: item.notificationId,
        queueItemId: item.id,
        tenantId: item.tenantId,
        recipientAddress: item.recipientAddress,
        channel: item.channel,
        eventType: "sent",
        attempt,
        providerMessageId: outcome.providerMessageId ?? null,
      });
      sent += 1;
    } else {
      const exhausted = attempt >= item.maxAttempts;
      await db
        .update(notificationQueueTable)
        .set({
          status: exhausted ? "dead_letter" : "failed",
          attempts: attempt,
          lastError: outcome.detail ?? "Delivery failed",
          availableAt: exhausted ? item.availableAt : new Date(Date.now() + backoffMs(attempt)),
        })
        .where(eq(notificationQueueTable.id, item.id));
      await db.insert(notificationDeliveryTable).values({
        notificationId: item.notificationId,
        queueItemId: item.id,
        tenantId: item.tenantId,
        recipientAddress: item.recipientAddress,
        channel: item.channel,
        eventType: exhausted ? "failed" : "attempted",
        attempt,
        providerResponse: JSON.stringify({ error: outcome.detail ?? "Delivery failed" }),
      });
      if (exhausted) deadLettered += 1;
      else failed += 1;
    }

    await refreshNotificationStatus(item.notificationId);
  }

  return { processed: claimed.length, sent, failed, deadLettered };
}

/**
 * Rolls per-recipient queue state up to the notification. "sent" means at
 * least one recipient received it; "failed" only when every recipient is
 * terminally undeliverable — a single bad address shouldn't mark a
 * hundred-recipient announcement as failed.
 */
export async function refreshNotificationStatus(notificationId: number): Promise<void> {
  const items = await db.select().from(notificationQueueTable).where(eq(notificationQueueTable.notificationId, notificationId));
  if (items.length === 0) return;

  const anySent = items.some((i) => i.status === "sent");
  const allTerminal = items.every((i) => i.status === "sent" || i.status === "dead_letter" || i.status === "cancelled");

  let status: string;
  if (anySent && allTerminal) status = "sent";
  else if (!anySent && allTerminal) status = "failed";
  else status = "queued";

  await db.update(notificationsTable).set({ status }).where(eq(notificationsTable.id, notificationId));
}

// ── Preferences (§9) ───────────────────────────────────────────────────────

/**
 * Upserts a user's channel/event preference. Drizzle's onConflict needs a
 * unique index to target; this table intentionally has none (a user may hold
 * one default row plus several event-specific rows per channel), so the
 * lookup-then-write is explicit.
 */
export async function setPreference(opts: {
  tenantId: number;
  userId: number;
  channel: string;
  eventType?: string | null;
  enabled: boolean;
}): Promise<NotificationPreference> {
  const eventType = opts.eventType ?? null;

  const [existing] = await db
    .select()
    .from(notificationPreferencesTable)
    .where(
      and(
        eq(notificationPreferencesTable.tenantId, opts.tenantId),
        eq(notificationPreferencesTable.userId, opts.userId),
        eq(notificationPreferencesTable.channel, opts.channel),
        eventType === null
          ? isNull(notificationPreferencesTable.eventType)
          : eq(notificationPreferencesTable.eventType, eventType),
      ),
    );

  if (existing) {
    const [updated] = await db
      .update(notificationPreferencesTable)
      .set({ enabled: opts.enabled })
      .where(eq(notificationPreferencesTable.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(notificationPreferencesTable)
    .values({
      tenantId: opts.tenantId,
      userId: opts.userId,
      channel: opts.channel,
      eventType,
      enabled: opts.enabled,
    })
    .returning();
  return created;
}
