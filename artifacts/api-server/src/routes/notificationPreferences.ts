import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, notificationPreferencesTable } from "@workspace/db";
import { ListNotificationPreferencesQueryParams, SetNotificationPreferenceBody } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { logAudit } from "../lib/audit";
import type { JwtPayload } from "../lib/auth";
import { serializePreference, setPreference } from "../lib/notificationEngine";

const router = Router();

router.get("/notification-preferences", requireAuth, async (req, res): Promise<void> => {
  const q = ListNotificationPreferencesQueryParams.safeParse(req.query);
  if (!q.success) {
    res.status(400).json({ error: q.error.message });
    return;
  }
  const prefs = await db
    .select()
    .from(notificationPreferencesTable)
    .where(eq(notificationPreferencesTable.userId, q.data.userId))
    .orderBy(notificationPreferencesTable.channel);
  res.json(prefs.map(serializePreference));
});

// PUT rather than POST: setting a preference is idempotent, and the engine
// keeps at most one row per (user, channel, eventType).
router.put("/notification-preferences", requireAuth, async (req, res): Promise<void> => {
  const actor = (req as typeof req & { user: JwtPayload }).user;
  const parsed = SetNotificationPreferenceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const pref = await setPreference({
    tenantId: parsed.data.tenantId,
    userId: parsed.data.userId,
    channel: parsed.data.channel,
    eventType: parsed.data.eventType ?? null,
    enabled: parsed.data.enabled,
  });
  await logAudit({ actor, action: "update", resource: "notification_preference", resourceId: pref.id });
  res.json(serializePreference(pref));
});

export default router;
