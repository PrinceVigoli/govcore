import { eq, and } from "drizzle-orm";
import {
  db,
  searchIndexTable,
  rulesTable,
  formsTable,
  workflowDefinitionsTable,
  documentTemplatesTable,
  notificationTemplatesTable,
  departmentsTable,
  usersTable,
  type SearchIndexEntry,
} from "@workspace/db";
import type { SearchCandidate } from "./ranking";

// Search Indexing (Sprint 2A) — builds `search_index` rows from each module's
// tables. Deliberately a pull-based reindex rather than write-path hooks
// scattered across rulesEngine/formsEngine/etc: adding an index write to
// every other engine's create/update paths would increase coupling exactly
// where Task 3 asks this sprint to reduce it. `reindexAll` is safe to call
// on a schedule or on demand (e.g. `POST /search/reindex`) and is fully
// idempotent — each entity maps to exactly one row via the
// (tenantId, entityType, entityId) unique constraint.

type IndexRow = Omit<SearchCandidate, never> & { tenantId: number; module: string };

async function upsertRows(rows: IndexRow[]): Promise<number> {
  let count = 0;
  for (const row of rows) {
    const existing = await db
      .select({ id: searchIndexTable.id })
      .from(searchIndexTable)
      .where(
        and(
          eq(searchIndexTable.tenantId, row.tenantId),
          eq(searchIndexTable.entityType, row.entityType),
          eq(searchIndexTable.entityId, row.entityId),
        ),
      );
    if (existing.length > 0) {
      await db
        .update(searchIndexTable)
        .set({
          module: row.module,
          title: row.title,
          subtitle: row.subtitle,
          content: row.content,
          url: row.url,
          indexedAt: new Date(),
        })
        .where(eq(searchIndexTable.id, existing[0].id));
    } else {
      await db.insert(searchIndexTable).values({
        tenantId: row.tenantId,
        module: row.module,
        entityType: row.entityType,
        entityId: row.entityId,
        title: row.title,
        subtitle: row.subtitle,
        content: row.content,
        url: row.url,
      });
    }
    count++;
  }
  return count;
}

export async function reindexRules(tenantId: number): Promise<number> {
  const rows = await db.select().from(rulesTable).where(eq(rulesTable.tenantId, tenantId));
  return upsertRows(
    rows.map((r) => ({
      tenantId,
      module: "rules",
      entityType: "rule",
      entityId: r.id,
      title: r.name,
      subtitle: r.code,
      content: [r.description ?? "", r.module, r.ruleType, r.resourceType].join(" "),
      url: `/rules/${r.id}`,
    })),
  );
}

export async function reindexForms(tenantId: number): Promise<number> {
  const rows = await db.select().from(formsTable).where(eq(formsTable.tenantId, tenantId));
  return upsertRows(
    rows.map((f) => ({
      tenantId,
      module: "forms",
      entityType: "form",
      entityId: f.id,
      title: f.name,
      subtitle: f.code,
      content: [f.description ?? "", f.module, f.resourceType].join(" "),
      url: `/forms/${f.id}`,
    })),
  );
}

export async function reindexWorkflowDefinitions(tenantId: number): Promise<number> {
  const rows = await db.select().from(workflowDefinitionsTable).where(eq(workflowDefinitionsTable.tenantId, tenantId));
  return upsertRows(
    rows.map((w) => ({
      tenantId,
      module: "workflows",
      entityType: "workflow_definition",
      entityId: w.id,
      title: w.name,
      subtitle: w.code,
      content: [w.description ?? "", w.resourceType].join(" "),
      url: `/workflows/${w.id}`,
    })),
  );
}

export async function reindexDocumentTemplates(tenantId: number): Promise<number> {
  const rows = await db.select().from(documentTemplatesTable).where(eq(documentTemplatesTable.tenantId, tenantId));
  return upsertRows(
    rows.map((d) => ({
      tenantId,
      module: "documents",
      entityType: "document_template",
      entityId: d.id,
      title: d.name,
      subtitle: d.code,
      content: [d.description ?? "", d.module, d.documentType].join(" "),
      url: `/document-templates/${d.id}`,
    })),
  );
}

export async function reindexNotificationTemplates(tenantId: number): Promise<number> {
  const rows = await db.select().from(notificationTemplatesTable).where(eq(notificationTemplatesTable.tenantId, tenantId));
  return upsertRows(
    rows.map((n) => ({
      tenantId,
      module: "notifications",
      entityType: "notification_template",
      entityId: n.id,
      title: n.name,
      subtitle: n.code,
      content: [n.subject ?? "", n.channel].join(" "),
      url: `/notification-templates/${n.id}`,
    })),
  );
}

export async function reindexDepartments(tenantId: number): Promise<number> {
  const rows = await db.select().from(departmentsTable).where(eq(departmentsTable.tenantId, tenantId));
  return upsertRows(
    rows.map((d) => ({
      tenantId,
      module: "identity",
      entityType: "department",
      entityId: d.id,
      title: d.name,
      subtitle: d.code,
      content: d.description ?? "",
      url: `/departments/${d.id}`,
    })),
  );
}

export async function reindexUsers(tenantId: number): Promise<number> {
  const rows = await db.select().from(usersTable).where(eq(usersTable.tenantId, tenantId));
  return upsertRows(
    rows.map((u) => ({
      tenantId,
      module: "identity",
      entityType: "user",
      entityId: u.id,
      title: `${u.firstName} ${u.lastName}`,
      subtitle: u.username,
      content: u.email, // no other PII indexed — never passwordHash
      url: `/users/${u.id}`,
    })),
  );
}

const REINDEXERS: Record<string, (tenantId: number) => Promise<number>> = {
  rule: reindexRules,
  form: reindexForms,
  workflow_definition: reindexWorkflowDefinitions,
  document_template: reindexDocumentTemplates,
  notification_template: reindexNotificationTemplates,
  department: reindexDepartments,
  user: reindexUsers,
};

export const INDEXABLE_ENTITY_TYPES = Object.keys(REINDEXERS);

/** Rebuilds the full index for a tenant, one entity type at a time. */
export async function reindexAll(tenantId: number): Promise<{ entityType: string; indexed: number }[]> {
  const results: { entityType: string; indexed: number }[] = [];
  for (const [entityType, fn] of Object.entries(REINDEXERS)) {
    const indexed = await fn(tenantId);
    results.push({ entityType, indexed });
  }
  return results;
}

export async function removeFromIndex(tenantId: number, entityType: string, entityId: number): Promise<void> {
  await db
    .delete(searchIndexTable)
    .where(
      and(eq(searchIndexTable.tenantId, tenantId), eq(searchIndexTable.entityType, entityType), eq(searchIndexTable.entityId, entityId)),
    );
}

export type { SearchIndexEntry };
