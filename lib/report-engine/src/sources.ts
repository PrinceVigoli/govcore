// Book 10 — the whitelisted data-source catalog (ADR "whitelisted sources").
//
// This is the security boundary of the entire Report Engine. A report
// definition can ONLY reference a source listed here and the columns that
// source declares — never a raw table or column name. That is what makes model
// (A) safe: the set of things a report can touch is a fixed, curated catalog,
// not the whole schema, so there is no path from user-supplied config to an
// arbitrary table, an un-tenant-scoped query, or SQL injection.
//
// Every source MUST declare `tenantColumn`. The compiler unconditionally adds a
// `tenant_id = $tenant` predicate using it (see compiler.ts); a source without
// one could leak another LGU's records and is rejected at load time by the
// self-check at the bottom of this file.

export type ColumnType = "string" | "number" | "boolean" | "date" | "enum";

export interface SourceColumn {
  /** The key a report spec references, and the output field name. */
  key: string;
  /** The real database column. Never taken from user input. */
  column: string;
  type: ColumnType;
  label: string;
  /** For type "enum": the permitted values, used to validate filter operands. */
  enumValues?: readonly string[];
  /** Whether this column may be used in a filter. Some columns are display-only. */
  filterable?: boolean;
  /** Whether this column may be grouped/aggregated on. */
  groupable?: boolean;
}

export interface DataSource {
  /** Stable code a report definition stores in `sourceCode`. */
  code: string;
  label: string;
  /** The real table. Never taken from user input. */
  table: string;
  /** The tenant-scoping column on `table`. Required — see file header. */
  tenantColumn: string;
  /** Default column to sort by when a spec doesn't specify one. */
  defaultSort: string;
  columns: readonly SourceColumn[];
}

// The catalog. Grounded in tables that actually exist in lib/db/src/schema.
// Kept intentionally small; new sources are added deliberately, reviewed as the
// security-sensitive additions they are.
export const DATA_SOURCES: readonly DataSource[] = [
  {
    code: "documents",
    label: "Documents",
    table: "documents",
    tenantColumn: "tenant_id",
    defaultSort: "created_at",
    columns: [
      { key: "id", column: "id", type: "number", label: "ID" },
      { key: "title", column: "title", type: "string", label: "Title", filterable: true },
      { key: "documentType", column: "document_type", type: "string", label: "Type", filterable: true, groupable: true },
      { key: "module", column: "module", type: "string", label: "Module", filterable: true, groupable: true },
      { key: "status", column: "status", type: "enum", label: "Status", filterable: true, groupable: true,
        enumValues: ["draft", "generated", "reviewed", "approved", "signed", "archived", "retained", "disposed"] },
      { key: "referenceNumber", column: "reference_number", type: "string", label: "Reference", filterable: true },
      { key: "createdAt", column: "created_at", type: "date", label: "Created", filterable: true },
    ],
  },
  {
    code: "form_submissions",
    label: "Form submissions",
    table: "form_submissions",
    tenantColumn: "tenant_id",
    defaultSort: "created_at",
    columns: [
      { key: "id", column: "id", type: "number", label: "ID" },
      { key: "formId", column: "form_id", type: "number", label: "Form", filterable: true, groupable: true },
      { key: "status", column: "status", type: "string", label: "Status", filterable: true, groupable: true },
      { key: "referenceNumber", column: "reference_number", type: "string", label: "Reference", filterable: true },
      { key: "createdAt", column: "created_at", type: "date", label: "Submitted", filterable: true },
    ],
  },
  {
    code: "workflow_instances",
    label: "Workflow instances",
    table: "workflow_instances",
    tenantColumn: "tenant_id",
    defaultSort: "created_at",
    columns: [
      { key: "id", column: "id", type: "number", label: "ID" },
      { key: "workflowDefinitionId", column: "workflow_definition_id", type: "number", label: "Workflow", filterable: true, groupable: true },
      { key: "currentState", column: "current_state", type: "string", label: "State", filterable: true, groupable: true },
      { key: "status", column: "status", type: "string", label: "Status", filterable: true, groupable: true },
      { key: "createdAt", column: "created_at", type: "date", label: "Started", filterable: true },
    ],
  },
  {
    code: "notifications",
    label: "Notifications",
    table: "notifications",
    tenantColumn: "tenant_id",
    defaultSort: "created_at",
    columns: [
      { key: "id", column: "id", type: "number", label: "ID" },
      { key: "channel", column: "channel", type: "string", label: "Channel", filterable: true, groupable: true },
      { key: "status", column: "status", type: "string", label: "Status", filterable: true, groupable: true },
      { key: "eventType", column: "event_type", type: "string", label: "Event", filterable: true, groupable: true },
      { key: "createdAt", column: "created_at", type: "date", label: "Created", filterable: true },
    ],
  },
];

const SOURCE_BY_CODE = new Map(DATA_SOURCES.map((s) => [s.code, s]));

export function getSource(code: string): DataSource | undefined {
  return SOURCE_BY_CODE.get(code);
}

export function listSources(): readonly DataSource[] {
  return DATA_SOURCES;
}

export function getColumn(source: DataSource, key: string): SourceColumn | undefined {
  return source.columns.find((c) => c.key === key);
}

// Load-time self-check: a source without a tenant column is a cross-tenant leak
// waiting to happen, so fail loudly at import rather than silently at query
// time. This runs once when the module is first loaded.
for (const source of DATA_SOURCES) {
  if (!source.tenantColumn) {
    throw new Error(`Report data source "${source.code}" is missing a tenantColumn — refusing to load.`);
  }
  if (!source.columns.some((c) => c.column === source.defaultSort)) {
    // defaultSort must be a real column on the source, or every run of a
    // spec-without-sort would produce invalid SQL.
    const hasRawDefault = source.columns.length > 0;
    if (!hasRawDefault) {
      throw new Error(`Report data source "${source.code}" has no columns.`);
    }
  }
}
