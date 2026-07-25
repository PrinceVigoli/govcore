import { db, auditLogsTable } from "@workspace/db";
import type { JwtPayload } from "./auth";

export async function logAudit(opts: {
  actor?: JwtPayload;
  action: string;
  resource: string;
  resourceId?: string | number;
  details?: string;
  ipAddress?: string;
}): Promise<void> {
  try {
    await db.insert(auditLogsTable).values({
      tenantId: opts.actor?.tenantId ?? null,
      userId: opts.actor?.userId ?? null,
      userFullName: opts.actor ? `${opts.actor.username}` : null,
      action: opts.action,
      resource: opts.resource,
      resourceId: opts.resourceId != null ? String(opts.resourceId) : null,
      details: opts.details ?? null,
      ipAddress: opts.ipAddress ?? null,
    });
  } catch {
    // audit log failures should never break the main operation
  }
}
