import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Book 08 — per-user, per-channel opt-in (§9 "USER ||--o{
// NOTIFICATION_PREFERENCE : owns"). A missing row means "no preference
// expressed", which the engine treats as opted-in: a citizen who never touched
// their settings must still receive the permit decision they applied for.
//
// `eventType` null = the user's default for that channel; a row with a specific
// eventType overrides the default for just that event, so someone can mute
// routine reminders without muting approvals.
//
// `enabled: false` suppresses delivery on that channel, but the notification
// row is still created — suppression is a delivery decision, not a reason to
// lose the audit record that the event occurred.
export const notificationPreferencesTable = pgTable("notification_preferences", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  userId: integer("user_id").notNull(),
  channel: text("channel").notNull(),
  eventType: text("event_type"), // null = default for this channel
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertNotificationPreferenceSchema = createInsertSchema(notificationPreferencesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertNotificationPreference = z.infer<typeof insertNotificationPreferenceSchema>;
export type NotificationPreference = typeof notificationPreferencesTable.$inferSelect;
