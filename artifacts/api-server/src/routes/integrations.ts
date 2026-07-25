import { Router, type Request } from "express";
import {
  createEndpoint,
  listEndpoints,
  getEndpoint,
  updateEndpoint,
  deleteEndpoint,
  serializeIntegrationEndpoint,
  registerWebhook,
  listWebhooks,
  getWebhook,
  setWebhookStatus,
  serializeWebhookSubscription,
  publish,
  listEvents,
  serializeIntegrationEvent,
  listRetryQueue,
  processQueue,
} from "@workspace/integration-engine";
import {
  CreateIntegrationEndpointBody,
  UpdateIntegrationEndpointBody,
  RegisterWebhookBody,
  SetWebhookStatusBody,
  PublishIntegrationEventBody,
  ListIntegrationEventsQueryParams,
  ListRetryQueueQueryParams,
  ProcessRetryQueueBody,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { logAudit } from "../lib/audit";
import type { JwtPayload } from "../lib/auth";

// Integrations API (Sprint 2A) — covers the Integration Registry, Webhook
// framework, Event Publisher, and Retry Queue. Validates with the generated
// `@workspace/api-zod` schemas, same as every other route.

const router = Router();

function actorOf(req: Request): JwtPayload {
  return (req as Request & { user: JwtPayload }).user;
}

// ── Integration Registry ────────────────────────────────────────────────

router.get("/integrations/endpoints", requireAuth, async (req, res): Promise<void> => {
  const actor = actorOf(req);
  const endpoints = await listEndpoints(actor.tenantId);
  res.json(endpoints.map(serializeIntegrationEndpoint));
});

router.post("/integrations/endpoints", requireAuth, async (req, res): Promise<void> => {
  const actor = actorOf(req);
  const parsed = CreateIntegrationEndpointBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const endpoint = await createEndpoint({ tenantId: actor.tenantId, ...parsed.data });
  await logAudit({ actor, action: "create", resource: "integration_endpoint", resourceId: endpoint.id });
  res.status(201).json(serializeIntegrationEndpoint(endpoint));
});

router.get("/integrations/endpoints/:id", requireAuth, async (req, res): Promise<void> => {
  const actor = actorOf(req);
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "id must be an integer" });
    return;
  }
  const endpoint = await getEndpoint(actor.tenantId, id);
  if (!endpoint) {
    res.status(404).json({ error: "Integration endpoint not found" });
    return;
  }
  res.json(serializeIntegrationEndpoint(endpoint));
});

router.patch("/integrations/endpoints/:id", requireAuth, async (req, res): Promise<void> => {
  const actor = actorOf(req);
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "id must be an integer" });
    return;
  }
  const parsed = UpdateIntegrationEndpointBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const endpoint = await updateEndpoint(actor.tenantId, id, parsed.data);
  if (!endpoint) {
    res.status(404).json({ error: "Integration endpoint not found" });
    return;
  }
  await logAudit({ actor, action: "update", resource: "integration_endpoint", resourceId: endpoint.id });
  res.json(serializeIntegrationEndpoint(endpoint));
});

router.delete("/integrations/endpoints/:id", requireAuth, async (req, res): Promise<void> => {
  const actor = actorOf(req);
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "id must be an integer" });
    return;
  }
  const deleted = await deleteEndpoint(actor.tenantId, id);
  if (!deleted) {
    res.status(404).json({ error: "Integration endpoint not found" });
    return;
  }
  await logAudit({ actor, action: "delete", resource: "integration_endpoint", resourceId: id });
  res.sendStatus(204);
});

// ── Webhook framework ───────────────────────────────────────────────────

router.get("/integrations/webhooks", requireAuth, async (req, res): Promise<void> => {
  const actor = actorOf(req);
  const webhooks = await listWebhooks(actor.tenantId);
  res.json(webhooks.map(serializeWebhookSubscription));
});

router.post("/integrations/webhooks", requireAuth, async (req, res): Promise<void> => {
  const actor = actorOf(req);
  const parsed = RegisterWebhookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const webhook = await registerWebhook({ tenantId: actor.tenantId, ...parsed.data });
  await logAudit({ actor, action: "create", resource: "webhook_subscription", resourceId: webhook.id });
  // The secret is returned exactly once, on creation, so the caller can
  // configure their receiver — the same tradeoff a "download your API key
  // now, it won't be shown again" flow makes.
  res.status(201).json({ ...serializeWebhookSubscription(webhook), secret: webhook.secret });
});

router.get("/integrations/webhooks/:id", requireAuth, async (req, res): Promise<void> => {
  const actor = actorOf(req);
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "id must be an integer" });
    return;
  }
  const webhook = await getWebhook(actor.tenantId, id);
  if (!webhook) {
    res.status(404).json({ error: "Webhook subscription not found" });
    return;
  }
  res.json(serializeWebhookSubscription(webhook));
});

router.patch("/integrations/webhooks/:id/status", requireAuth, async (req, res): Promise<void> => {
  const actor = actorOf(req);
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "id must be an integer" });
    return;
  }
  const parsed = SetWebhookStatusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const webhook = await setWebhookStatus(actor.tenantId, id, parsed.data.status);
  if (!webhook) {
    res.status(404).json({ error: "Webhook subscription not found" });
    return;
  }
  await logAudit({ actor, action: "update", resource: "webhook_subscription", resourceId: webhook.id });
  res.json(serializeWebhookSubscription(webhook));
});

// ── Event Publisher ─────────────────────────────────────────────────────

router.get("/integrations/events", requireAuth, async (req, res): Promise<void> => {
  const actor = actorOf(req);
  const q = ListIntegrationEventsQueryParams.safeParse(req.query);
  if (!q.success) {
    res.status(400).json({ error: q.error.message });
    return;
  }
  const events = await listEvents(actor.tenantId, q.data);
  res.json(events.map(serializeIntegrationEvent));
});

// Lets any GovCore module — or an operator testing a new webhook — publish
// an event through the same path the internal engines will eventually use.
router.post("/integrations/events", requireAuth, async (req, res): Promise<void> => {
  const actor = actorOf(req);
  const parsed = PublishIntegrationEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  // `payload` is optional on the wire but required by publish() (an event may
  // legitimately carry no data); default it to null so the property is present.
  const result = await publish({ tenantId: actor.tenantId, payload: null, ...parsed.data });
  await logAudit({ actor, action: "publish", resource: "integration_event", resourceId: result.event.id });
  res.status(201).json({ event: serializeIntegrationEvent(result.event), queued: result.queued });
});

// ── Retry Queue ──────────────────────────────────────────────────────────

router.get("/integrations/retry-queue", requireAuth, async (req, res): Promise<void> => {
  const actor = actorOf(req);
  const q = ListRetryQueueQueryParams.safeParse(req.query);
  if (!q.success) {
    res.status(400).json({ error: q.error.message });
    return;
  }
  const items = await listRetryQueue(actor.tenantId, q.data);
  res.json(items);
});

// Manually triggers a worker pass, scoped to the caller's tenant. A real
// deployment would also run this on a schedule/cron, the same way
// processQueue() in the Notification Engine is expected to be driven.
router.post("/integrations/retry-queue/process", requireAuth, async (req, res): Promise<void> => {
  const actor = actorOf(req);
  const parsed = ProcessRetryQueueBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const result = await processQueue({ tenantId: actor.tenantId, limit: parsed.data.limit });
  res.json(result);
});

export default router;
