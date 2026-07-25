import type { Request, Response, NextFunction } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { count, eq, sql } from "drizzle-orm";
import {
  db,
  rolesTable,
  tenantsTable,
  userRolesTable,
  usersTable,
  rolePermissionsTable,
  permissionsTable,
} from "@workspace/db";
import { logger } from "./logger";

export interface JwtPayload {
  userId: number;
  tenantId: number;
  username: string;
  email: string;
  clerkUserId: string;
}

type AuthenticatedRequest = Request & { user: JwtPayload };

function actorOf(req: Request): JwtPayload {
  return (req as AuthenticatedRequest).user;
}

function moduleForPath(path: string): string | null {
  path = path.replace(/^\/api(?=\/|$)/, "");
  if (/^\/(tenants|users|roles|permissions|departments|audit-logs|identity)/.test(path)) return "identity";
  if (/^\/workflows|^\/workflow-/.test(path)) return "workflows";
  if (/^\/rules/.test(path)) return "rules";
  if (/^\/forms|^\/form-submissions/.test(path)) return "forms";
  if (/^\/notifications|^\/notification-templates/.test(path)) return "notifications";
  if (/^\/documents|^\/document-templates/.test(path)) return "documents";
  if (/^\/search/.test(path)) return "search";
  if (/^\/integrations/.test(path)) return "integrations";
  return null;
}

async function hasPermission(userId: number, module: string, action: "read" | "manage"): Promise<boolean> {
  const rows = await db
    .select({ roleCode: rolesTable.code, permissionModule: permissionsTable.module, permissionAction: permissionsTable.action })
    .from(userRolesTable)
    .innerJoin(rolesTable, eq(userRolesTable.roleId, rolesTable.id))
    .leftJoin(rolePermissionsTable, eq(rolePermissionsTable.roleId, rolesTable.id))
    .leftJoin(permissionsTable, eq(rolePermissionsTable.permissionId, permissionsTable.id))
    .where(eq(userRolesTable.userId, userId));

  return rows.some((row) => {
    if (["platform_admin", "system_admin", "super_admin"].includes(row.roleCode)) return true;
    if (!row.permissionModule || !row.permissionAction) return false;
    return (
      (row.permissionModule === module || row.permissionModule === "*") &&
      (row.permissionAction === action || row.permissionAction === "manage" || row.permissionAction === "*")
    );
  });
}

async function ensureGovCoreUser(clerkUserId: string, email: string, firstName: string, lastName: string) {
  const [linked] = await db.select().from(usersTable).where(eq(usersTable.authProviderId, clerkUserId));
  if (linked) return linked;

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existing) {
    if (existing.authProviderId && existing.authProviderId !== clerkUserId) return null;
    const [linkedExisting] = await db
      .update(usersTable)
      .set({ authProviderId: clerkUserId })
      .where(eq(usersTable.id, existing.id))
      .returning();
    return linkedExisting ?? existing;
  }

  const [{ value: userCount }] = await db.select({ value: count() }).from(usersTable);
  if (Number(userCount) > 0) return null;

  const usernameBase = email.split("@")[0].toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 40) || "admin";
  const slug = `default-lgu-${Date.now()}`;
  const user = await db.transaction(async (tx) => {
    const [tenant] = await tx.insert(tenantsTable).values({
      name: "Default Local Government Unit",
      slug,
      contactEmail: email,
      status: "active",
    }).returning();
    const [createdUser] = await tx.insert(usersTable).values({
      tenantId: tenant.id,
      firstName: firstName || "GovCore",
      lastName: lastName || "Administrator",
      email,
      authProviderId: clerkUserId,
      username: usernameBase,
      passwordHash: `managed-by-clerk:${clerkUserId}`,
      status: "active",
    }).returning();
    const [role] = await tx.insert(rolesTable).values({
      tenantId: tenant.id,
      name: "Platform Administrator",
      code: "platform_admin",
      description: "Initial GovCore administrator managed through Clerk",
      isSystem: true,
    }).returning();
    await tx.insert(userRolesTable).values({ userId: createdUser.id, roleId: role.id });
    return createdUser;
  });
  return user;
}

const tenantScopedTables: Record<string, string> = {
  tenants: "tenants",
  users: "users",
  roles: "roles",
  departments: "departments",
  workflows: "workflow_definitions",
  "workflow-instances": "workflow_instances",
  "workflow-tasks": "workflow_tasks",
  forms: "forms",
  "form-submissions": "form_submissions",
  rules: "rules",
  notifications: "notifications",
  "notification-templates": "notification_templates",
  documents: "documents",
  "document-templates": "document_templates",
  attachments: "attachments",
};

async function enforceTenantRecord(req: Request, actor: JwtPayload): Promise<boolean> {
  if (!["GET", "PATCH", "DELETE"].includes(req.method)) return true;
  const segments = req.path.split("/").filter(Boolean);
  const resource = segments[0] === "integrations" ? undefined : segments[0];
  const table = resource ? tenantScopedTables[resource] : undefined;
  const id = resource ? Number(segments[1]) : NaN;
  if (!table || !Number.isInteger(id)) return true;

  const result = await db.execute(
    sql`select 1 from ${sql.raw(table)} where id = ${id} and tenant_id = ${actor.tenantId} limit 1`,
  );
  if (result.rows.length > 0) return true;
  return false;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId: clerkUserId } = getAuth(req);
    if (!clerkUserId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const clerkUser = await clerkClient.users.getUser(clerkUserId);
    const email = clerkUser.primaryEmailAddress?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress;
    if (!email) {
      res.status(403).json({ error: "Your account needs a verified email address" });
      return;
    }

    const user = await ensureGovCoreUser(
      clerkUserId,
      email.toLowerCase(),
      clerkUser.firstName ?? "",
      clerkUser.lastName ?? "",
    );
    if (!user) {
      res.status(403).json({ error: "Your account is not provisioned for a GovCore tenant" });
      return;
    }
    if (user.status !== "active") {
      res.status(403).json({ error: "Your GovCore account is not active" });
      return;
    }

    const actor: JwtPayload = {
      userId: user.id,
      tenantId: user.tenantId,
      username: user.username,
      email: user.email,
      clerkUserId,
    };
    (req as AuthenticatedRequest).user = actor;

    const module = moduleForPath(req.path);
    if (module && req.path !== "/auth/me") {
      const action = req.method === "GET" ? "read" : "manage";
      if (!(await hasPermission(actor.userId, module, action))) {
        res.status(403).json({ error: `Missing ${action} permission for ${module}` });
        return;
      }
    }

    const requestedTenant = req.query.tenantId ?? req.body?.tenantId;
    if (requestedTenant !== undefined && Number(requestedTenant) !== actor.tenantId) {
      res.status(403).json({ error: "Tenant context does not match your membership" });
      return;
    }
    if (req.method === "GET" && req.query.tenantId === undefined) {
      req.query.tenantId = String(actor.tenantId);
    }
    if (req.method !== "GET" && req.body && typeof req.body === "object" && req.body.tenantId === undefined) {
      req.body.tenantId = actor.tenantId;
    }
    if (!(await enforceTenantRecord(req, actor))) {
      res.status(404).json({ error: "Resource not found" });
      return;
    }

    next();
  } catch (error) {
    logger.warn({ err: error }, "Authentication bridge failed");
    res.status(401).json({ error: "Unable to establish an authenticated GovCore session" });
  }
}

export function getActor(req: Request): JwtPayload {
  return actorOf(req);
}
