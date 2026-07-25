import { eq, and } from "drizzle-orm";
import { db, integrationEndpointsTable, type IntegrationEndpoint } from "@workspace/db";

// Integration Engine (Sprint 2A) — Integration Registry: CRUD over
// integration_endpoints. Registering an endpoint only records its
// connection shape (base URL, auth type, non-secret config); it never calls
// the endpoint. No credentials are stored here (see integrationEndpoints.ts's
// schema comment), so building an ApiClient from a registered endpoint and
// supplying the actual secret is left to the caller — Sprint 2B's
// per-external-API adapter packages.

export function serializeIntegrationEndpoint(e: IntegrationEndpoint) {
  return { ...e, createdAt: e.createdAt.toISOString(), updatedAt: e.updatedAt.toISOString() };
}

export type EndpointAuthType = "none" | "api_key" | "bearer" | "basic";
export type EndpointStatus = "inactive" | "active" | "disabled";

export interface CreateEndpointOptions {
  tenantId: number;
  name: string;
  code: string;
  baseUrl: string;
  authType?: EndpointAuthType;
  config?: Record<string, unknown> | null;
}

export async function createEndpoint(opts: CreateEndpointOptions): Promise<IntegrationEndpoint> {
  const [row] = await db
    .insert(integrationEndpointsTable)
    .values({
      tenantId: opts.tenantId,
      name: opts.name,
      code: opts.code,
      baseUrl: opts.baseUrl,
      authType: opts.authType ?? "none",
      status: "inactive",
      config: opts.config ? JSON.stringify(opts.config) : null,
    })
    .returning();
  return row;
}

export async function listEndpoints(tenantId: number): Promise<IntegrationEndpoint[]> {
  return db
    .select()
    .from(integrationEndpointsTable)
    .where(eq(integrationEndpointsTable.tenantId, tenantId))
    .orderBy(integrationEndpointsTable.name);
}

export async function getEndpoint(tenantId: number, id: number): Promise<IntegrationEndpoint | null> {
  const [row] = await db
    .select()
    .from(integrationEndpointsTable)
    .where(and(eq(integrationEndpointsTable.tenantId, tenantId), eq(integrationEndpointsTable.id, id)));
  return row ?? null;
}

export interface UpdateEndpointOptions {
  name?: string;
  baseUrl?: string;
  authType?: EndpointAuthType;
  status?: EndpointStatus;
  config?: Record<string, unknown> | null;
}

export async function updateEndpoint(
  tenantId: number,
  id: number,
  opts: UpdateEndpointOptions,
): Promise<IntegrationEndpoint | null> {
  const values: Record<string, unknown> = {};
  if (opts.name !== undefined) values.name = opts.name;
  if (opts.baseUrl !== undefined) values.baseUrl = opts.baseUrl;
  if (opts.authType !== undefined) values.authType = opts.authType;
  if (opts.status !== undefined) values.status = opts.status;
  if (opts.config !== undefined) values.config = opts.config ? JSON.stringify(opts.config) : null;

  const [row] = await db
    .update(integrationEndpointsTable)
    .set(values)
    .where(and(eq(integrationEndpointsTable.tenantId, tenantId), eq(integrationEndpointsTable.id, id)))
    .returning();
  return row ?? null;
}

export async function deleteEndpoint(tenantId: number, id: number): Promise<boolean> {
  const [row] = await db
    .delete(integrationEndpointsTable)
    .where(and(eq(integrationEndpointsTable.tenantId, tenantId), eq(integrationEndpointsTable.id, id)))
    .returning();
  return row !== undefined;
}
