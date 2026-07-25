import { Router } from "express";
import { eq, and, desc, inArray } from "drizzle-orm";
import {
  db,
  notificationsTable,
  notificationQueueTable,
  notificationDeliveryTable,
} from "@workspace/db";
import {
  ListNotificationsQueryParams,
  CreateNotificationBody,
  GetNotificationParams,
  CancelNotificationParams,
  SendNotificationsBody,
  ListNotificationHistoryQueryParams,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { logAudit } from "../lib/audit";
import type { JwtPayload } from "../lib/auth";
import {
  serializeNotification,
  serializeQueueItem,
  serializeDelivery,
  resolveTemplate,
  renderTemplate,
  resolveRecipients,
  enqueueRecipients,
  processQueue,
  refreshNotificationStatus,
} from "../lib/notificationEngine";

const router = Router();

router.get("/notifications", requireAuth, async (req, res): Promise<void> => {
  const q = ListNotificationsQueryParams.safeParse(req.query);
  const conditions = [];
  if (q.success && q.data.tenantId) conditions.push(eq(notificationsTable.tenantId, q.data.tenantId));
  if (q.success && q.data.channel) conditions.push(eq(notificationsTable.channel, q.data.channel));
  if (q.success && q.data.status) conditions.push(eq(notificationsTable.status, q.data.status));
  if (q.success && q.data.eventType) conditions.push(eq(notificationsTable.eventType, q.data.eventType));

  const notifications = conditions.length > 0
    ? await db.select().from(notificationsTable).where(and(...conditions)).orderBy(desc(notificationsTable.createdAt))
    : await db.select().from(notificationsTable).orderBy(desc(notificationsTable.createdAt));

  res.json(notifications.map(serializeNotification));
});

/**
 * The notification lifecycle up to Queue (§5): select a template, render it,
 * resolve recipients, and enqueue. Delivery itself is asynchronous
 * (ADR-0018) — this returns as soon as the queue rows are committed.
 *
 * Ordering matters here: the template is resolved and rendered *before* the
 * transaction opens, so a missing template or unresolved variable is rejected
 * with a 400 instead of writing a half-formed notification.
 */
router.post("/notifications", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const parsed = CreateNotificationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const payload = (parsed.data.payload ?? {}) as Record<string, unknown>;
  let channel = parsed.data.channel;
  let templateId: number | null = null;
  let subject = parsed.data.subject ?? null;
  let body = parsed.data.body ?? null;

  if (parsed.data.templateCode) {
    if (!channel) {
      res.status(400).json({ error: "channel is required when sending from a template" });
      return;
    }
    const template = await resolveTemplate({
      tenantId: parsed.data.tenantId,
      code: parsed.data.templateCode,
      channel,
      locale: parsed.data.locale,
    });
    if (!template) {
      res.status(404).json({ error: `No active "${channel}" template found for code "${parsed.data.templateCode}"` });
      return;
    }
    const rendered = renderTemplate(template, payload);
    if (rendered.missingVariables.length > 0) {
      res.status(400).json({
        error: "Template variables missing from payload",
        missingVariables: rendered.missingVariables,
      });
      return;
    }
    templateId = template.id;
    subject = rendered.subject;
    body = rendered.body;
    channel = template.channel as typeof channel;
  }

  if (!channel) {
    res.status(400).json({ error: "channel is required" });
    return;
  }
  if (!body) {
    res.status(400).json({ error: "Provide either templateCode or an explicit body" });
    return;
  }

  const { recipients, suppressed, unroutable } = await resolveRecipients({
    tenantId: parsed.data.tenantId,
    channel,
    eventType: parsed.data.eventType,
    userIds: parsed.data.recipientUserIds,
    roleIds: parsed.data.recipientRoleIds,
    addresses: parsed.data.recipientAddresses,
  });

  if (recipients.length === 0) {
    res.status(400).json({
      error: "No resolvable recipients for this notification",
      suppressedUserIds: suppressed,
      unroutableUserIds: unroutable,
    });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const [notification] = await tx
      .insert(notificationsTable)
      .values({
        tenantId: parsed.data.tenantId,
        templateId,
        eventType: parsed.data.eventType,
        resourceType: parsed.data.resourceType ?? null,
        resourceId: parsed.data.resourceId ?? null,
        channel,
        subject,
        body,
        payload: Object.keys(payload).length > 0 ? JSON.stringify(payload) : null,
        priority: parsed.data.priority ?? "normal",
        status: "queued",
        scheduledFor: parsed.data.scheduledFor ? new Date(parsed.data.scheduledFor) : null,
        createdByUserId: actor?.userId ?? null,
      })
      .returning();

    const queued = await enqueueRecipients(tx as unknown as typeof db, { notification, recipients });
    return { notification, queued: queued.length };
  });

  await logAudit({ actor, action: "create", resource: "notification", resourceId: result.notification.id });
  res.status(201).json({
    ...serializeNotification(result.notification),
    queued: result.queued,
    suppressedUserIds: suppressed,
    unroutableUserIds: unroutable,
  });
});

router.get("/notifications/history", requireAuth, async (req, res): Promise<void> => {
  const q = ListNotificationHistoryQueryParams.safeParse(req.query);
  const conditions = [];
  if (q.success && q.data.tenantId) conditions.push(eq(notificationDeliveryTable.tenantId, q.data.tenantId));
  if (q.success && q.data.notificationId) conditions.push(eq(notificationDeliveryTable.notificationId, q.data.notificationId));
  if (q.success && q.data.eventType) conditions.push(eq(notificationDeliveryTable.eventType, q.data.eventType));

  const events = conditions.length > 0
    ? await db.select().from(notificationDeliveryTable).where(and(...conditions)).orderBy(desc(notificationDeliveryTable.createdAt)).limit(200)
    : await db.select().from(notificationDeliveryTable).orderBy(desc(notificationDeliveryTable.createdAt)).limit(200);

  res.json(events.map(serializeDelivery));
});

// Drains due queue items. Exposed as an endpoint so a cron/worker can call it;
// it's also what the admin "Run delivery" button uses.
router.post("/notifications/send", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const parsed = SendNotificationsBody.safeParse(req.body ?? {});
  const result = await processQueue({
    tenantId: parsed.success ? parsed.data?.tenantId : undefined,
    limit: parsed.success ? parsed.data?.limit : undefined,
  });
  await logAudit({ actor, action: "send_batch", resource: "notification", details: JSON.stringify(result) });
  res.json(result);
});

router.get("/notifications/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetNotificationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [notification] = await db.select().from(notificationsTable).where(eq(notificationsTable.id, params.data.id));
  if (!notification) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }

  const [queueItems, deliveries] = await Promise.all([
    db.select().from(notificationQueueTable).where(eq(notificationQueueTable.notificationId, notification.id)),
    db.select().from(notificationDeliveryTable).where(eq(notificationDeliveryTable.notificationId, notification.id)).orderBy(desc(notificationDeliveryTable.createdAt)),
  ]);

  res.json({
    ...serializeNotification(notification),
    queueItems: queueItems.map(serializeQueueItem),
    deliveries: deliveries.map(serializeDelivery),
  });
});

// Cancels only what hasn't gone out yet. Already-sent items are left alone —
// a message a citizen has received can't be un-received, and rewriting its
// delivery record would falsify the audit trail (§12).
router.post("/notifications/:id/cancel", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const params = CancelNotificationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [notification] = await db.select().from(notificationsTable).where(eq(notificationsTable.id, params.data.id));
  if (!notification) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }

  await db.transaction(async (tx) => {
    const pending = await tx
      .select()
      .from(notificationQueueTable)
      .where(
        and(
          eq(notificationQueueTable.notificationId, notification.id),
          inArray(notificationQueueTable.status, ["pending", "failed"]),
        ),
      );

    if (pending.length > 0) {
      await tx
        .update(notificationQueueTable)
        .set({ status: "cancelled" })
        .where(inArray(notificationQueueTable.id, pending.map((p) => p.id)));

      for (const item of pending) {
        await tx.insert(notificationDeliveryTable).values({
          notificationId: notification.id,
          queueItemId: item.id,
          tenantId: notification.tenantId,
          recipientAddress: item.recipientAddress,
          channel: item.channel,
          eventType: "cancelled",
          attempt: item.attempts,
        });
      }
    }
  });

  await refreshNotificationStatus(notification.id);
  const [updated] = await db.select().from(notificationsTable).where(eq(notificationsTable.id, notification.id));

  // refreshNotificationStatus only rolls up queue state; a notification whose
  // every item was cancelled has no "sent" to report, so mark it cancelled.
  const items = await db.select().from(notificationQueueTable).where(eq(notificationQueueTable.notificationId, notification.id));
  const allCancelled = items.length > 0 && items.every((i) => i.status === "cancelled");
  const final = allCancelled
    ? (await db.update(notificationsTable).set({ status: "cancelled" }).where(eq(notificationsTable.id, notification.id)).returning())[0]
    : updated;

  await logAudit({ actor, action: "cancel", resource: "notification", resourceId: notification.id });
  res.json(serializeNotification(final));
});

export default router;
