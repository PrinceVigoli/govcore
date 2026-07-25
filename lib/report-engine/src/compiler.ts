// Book 10 — the pure ReportSpec compiler. Validates a spec against a
// whitelisted source and compiles it to a parameterized SQL fragment. This is
// the security-critical, dependency-free core (like search's ranking.ts): no
// db, no drizzle — just spec-in, {sql, params}-out — so it's exhaustively
// unit-testable, which is exactly what a query builder that runs on
// user-supplied config needs.
//
// Guarantees enforced here, every time:
//   - Only whitelisted columns appear in SELECT / WHERE / ORDER BY / GROUP BY.
//     A key not on the source is rejected; nothing user-supplied is ever
//     concatenated as an identifier.
//   - Tenant scoping is unconditional: `tenant_column = $N` is always ANDed in,
//     using the tenant passed by the caller, never anything from the spec.
//   - All operands are bound parameters ($1, $2, …), never inlined — so there
//     is no SQL-injection surface even though filter values are user input.
//   - Enum filter operands must be one of the column's declared values.

import { getSource, getColumn, type DataSource, type SourceColumn } from "./sources";

export type FilterOperator =
  | "eq" | "neq" | "gt" | "gte" | "lt" | "lte"
  | "contains" | "starts_with"
  | "in" | "is_null" | "is_not_null";

export interface ReportFilter {
  column: string; // a source column KEY, not a raw column
  operator: FilterOperator;
  value?: unknown; // omitted for is_null / is_not_null
}

export interface ReportSort {
  column: string;
  direction?: "asc" | "desc";
}

export interface ReportSpec {
  columns: string[]; // column keys to SELECT; empty => all source columns
  filters?: ReportFilter[];
  sort?: ReportSort[];
  groupBy?: string[]; // column keys; when set, columns must be groupable + a count is added
  limit?: number;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

const OPERATORS_NEEDING_VALUE: FilterOperator[] = ["eq", "neq", "gt", "gte", "lt", "lte", "contains", "starts_with", "in"];
const STRING_ONLY_OPERATORS: FilterOperator[] = ["contains", "starts_with"];
const ORDERING_OPERATORS: FilterOperator[] = ["gt", "gte", "lt", "lte"];

const MAX_LIMIT = 10_000;
const DEFAULT_LIMIT = 1_000;

/**
 * Validates a spec against its source. Pure and total — returns every problem
 * found rather than throwing on the first, so a report builder UI can show them
 * all at once. A spec that fails validation must never be compiled.
 */
export function validateSpec(sourceCode: string, spec: ReportSpec): ValidationResult {
  const errors: string[] = [];
  const source = getSource(sourceCode);
  if (!source) {
    return { ok: false, errors: [`Unknown data source "${sourceCode}"`] };
  }

  // SELECT columns
  const selected = spec.columns ?? [];
  for (const key of selected) {
    if (!getColumn(source, key)) errors.push(`Column "${key}" is not available on source "${sourceCode}"`);
  }

  // Filters
  for (const filter of spec.filters ?? []) {
    const col = getColumn(source, filter.column);
    if (!col) {
      errors.push(`Filter references unknown column "${filter.column}"`);
      continue;
    }
    if (col.filterable === false) {
      errors.push(`Column "${filter.column}" is not filterable`);
    }
    if (OPERATORS_NEEDING_VALUE.includes(filter.operator) && filter.value === undefined) {
      errors.push(`Filter on "${filter.column}" with operator "${filter.operator}" requires a value`);
    }
    if (STRING_ONLY_OPERATORS.includes(filter.operator) && col.type !== "string") {
      errors.push(`Operator "${filter.operator}" only applies to text columns, not "${filter.column}"`);
    }
    if (ORDERING_OPERATORS.includes(filter.operator) && col.type === "boolean") {
      errors.push(`Operator "${filter.operator}" cannot be used on boolean column "${filter.column}"`);
    }
    if (filter.operator === "in" && !Array.isArray(filter.value)) {
      errors.push(`Operator "in" on "${filter.column}" requires an array value`);
    }
    // Enum operands must be declared values.
    if (col.type === "enum" && col.enumValues) {
      const values = filter.operator === "in" && Array.isArray(filter.value) ? filter.value : filter.value !== undefined ? [filter.value] : [];
      for (const v of values) {
        if (!col.enumValues.includes(v as string)) {
          errors.push(`"${String(v)}" is not a valid value for "${filter.column}" (expected one of: ${col.enumValues.join(", ")})`);
        }
      }
    }
  }

  // Sort
  for (const s of spec.sort ?? []) {
    if (!getColumn(source, s.column)) errors.push(`Sort references unknown column "${s.column}"`);
  }

  // Group by
  for (const key of spec.groupBy ?? []) {
    const col = getColumn(source, key);
    if (!col) {
      errors.push(`Group-by references unknown column "${key}"`);
    } else if (col.groupable === false || col.groupable === undefined) {
      errors.push(`Column "${key}" is not groupable`);
    }
  }
  // When grouping, every selected column must itself be a grouped column
  // (anything else is ambiguous under aggregation).
  if ((spec.groupBy?.length ?? 0) > 0) {
    const grouped = new Set(spec.groupBy);
    for (const key of selected) {
      if (!grouped.has(key)) errors.push(`Column "${key}" must be in groupBy or removed when grouping`);
    }
  }

  if (spec.limit !== undefined && (!Number.isInteger(spec.limit) || spec.limit <= 0)) {
    errors.push(`limit must be a positive integer`);
  }

  return { ok: errors.length === 0, errors };
}

export interface CompiledQuery {
  sql: string;
  params: unknown[];
}

function quoteIdent(name: string): string {
  // Identifiers here come only from the whitelisted catalog, never from user
  // input, but we still double-quote defensively and reject anything that isn't
  // a plain identifier — belt and suspenders on the security boundary.
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) {
    throw new Error(`Refusing to quote non-identifier "${name}"`);
  }
  return `"${name}"`;
}

function operandSql(col: SourceColumn, filter: ReportFilter, params: unknown[]): string {
  const colRef = quoteIdent(col.column);
  switch (filter.operator) {
    case "is_null":
      return `${colRef} IS NULL`;
    case "is_not_null":
      return `${colRef} IS NOT NULL`;
    case "contains":
      params.push(`%${String(filter.value)}%`);
      return `${colRef} ILIKE $${params.length}`;
    case "starts_with":
      params.push(`${String(filter.value)}%`);
      return `${colRef} ILIKE $${params.length}`;
    case "in": {
      const arr = filter.value as unknown[];
      const placeholders = arr.map((v) => {
        params.push(v);
        return `$${params.length}`;
      });
      // An empty IN list can never match; emit a constant-false rather than
      // invalid `IN ()` SQL.
      if (placeholders.length === 0) return `false`;
      return `${colRef} IN (${placeholders.join(", ")})`;
    }
    default: {
      const opMap: Record<string, string> = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" };
      const op = opMap[filter.operator];
      params.push(filter.value);
      return `${colRef} ${op} $${params.length}`;
    }
  }
}

/**
 * Compiles a validated spec to parameterized SQL for a given tenant. Throws if
 * the spec is invalid — callers must validateSpec first. The tenant predicate
 * is added unconditionally and is not derived from the spec.
 */
export function compileQuery(sourceCode: string, spec: ReportSpec, tenantId: number): CompiledQuery {
  const validation = validateSpec(sourceCode, spec);
  if (!validation.ok) {
    throw new Error(`Cannot compile an invalid report spec: ${validation.errors.join("; ")}`);
  }
  const source = getSource(sourceCode) as DataSource;
  const params: unknown[] = [];

  const grouping = spec.groupBy ?? [];
  const isGrouped = grouping.length > 0;

  // SELECT
  let selectList: string;
  if (isGrouped) {
    const cols = grouping.map((key) => {
      const col = getColumn(source, key) as SourceColumn;
      return `${quoteIdent(col.column)} AS ${quoteIdent(col.key)}`;
    });
    selectList = `${cols.join(", ")}, count(*)::int AS ${quoteIdent("count")}`;
  } else {
    const keys = (spec.columns?.length ?? 0) > 0 ? spec.columns : source.columns.map((c) => c.key);
    selectList = keys
      .map((key) => {
        const col = getColumn(source, key) as SourceColumn;
        return `${quoteIdent(col.column)} AS ${quoteIdent(col.key)}`;
      })
      .join(", ");
  }

  // WHERE — tenant scope is always first and always present.
  params.push(tenantId);
  const whereParts = [`${quoteIdent(source.tenantColumn)} = $${params.length}`];
  for (const filter of spec.filters ?? []) {
    const col = getColumn(source, filter.column) as SourceColumn;
    whereParts.push(operandSql(col, filter, params));
  }

  let sql = `SELECT ${selectList} FROM ${quoteIdent(source.table)} WHERE ${whereParts.join(" AND ")}`;

  if (isGrouped) {
    const groupCols = grouping.map((key) => quoteIdent((getColumn(source, key) as SourceColumn).column));
    sql += ` GROUP BY ${groupCols.join(", ")}`;
  }

  // ORDER BY — explicit sort, else the source default.
  const sort = spec.sort ?? [];
  if (!isGrouped) {
    if (sort.length > 0) {
      const orderParts = sort.map((s) => {
        const col = getColumn(source, s.column) as SourceColumn;
        const dir = s.direction === "desc" ? "DESC" : "ASC";
        return `${quoteIdent(col.column)} ${dir}`;
      });
      sql += ` ORDER BY ${orderParts.join(", ")}`;
    } else {
      sql += ` ORDER BY ${quoteIdent(source.defaultSort)} DESC`;
    }
  } else {
    sql += ` ORDER BY ${quoteIdent("count")} DESC`;
  }

  // LIMIT — always bounded.
  const limit = Math.min(spec.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  params.push(limit);
  sql += ` LIMIT $${params.length}`;

  return { sql, params };
}
