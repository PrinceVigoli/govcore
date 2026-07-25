import { eq, and, asc, lte, or, isNull } from "drizzle-orm";
import {
  db,
  rulesTable,
  ruleVersionsTable,
  ruleGroupsTable,
  ruleConditionsTable,
  ruleActionsTable,
  ruleHistoryTable,
  type Rule,
  type RuleVersion,
  type RuleGroup,
  type RuleCondition,
  type RuleAction,
} from "@workspace/db";

// ── Serialization ──────────────────────────────────────────────────────────
// Every date column is serialized to an ISO string so the wire shape matches
// the OpenAPI spec (`format: date-time`).

export function serializeRule(r: Rule) {
  return { ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() };
}

export function serializeRuleVersion(v: RuleVersion) {
  return {
    ...v,
    effectiveDate: v.effectiveDate ? v.effectiveDate.toISOString() : null,
    publishedAt: v.publishedAt ? v.publishedAt.toISOString() : null,
    createdAt: v.createdAt.toISOString(),
  };
}

export function serializeRuleHistory(h: typeof ruleHistoryTable.$inferSelect) {
  return { ...h, createdAt: h.createdAt.toISOString() };
}

export async function getVersionGraph(ruleVersionId: number): Promise<{ groups: RuleGroup[]; conditions: RuleCondition[]; actions: RuleAction[] }> {
  const [groups, conditions, actions] = await Promise.all([
    db.select().from(ruleGroupsTable).where(eq(ruleGroupsTable.ruleVersionId, ruleVersionId)).orderBy(asc(ruleGroupsTable.sortOrder)),
    db.select().from(ruleConditionsTable).where(eq(ruleConditionsTable.ruleVersionId, ruleVersionId)).orderBy(asc(ruleConditionsTable.sortOrder)),
    db.select().from(ruleActionsTable).where(eq(ruleActionsTable.ruleVersionId, ruleVersionId)).orderBy(asc(ruleActionsTable.sortOrder)),
  ]);
  return { groups, conditions, actions };
}

// ── Condition evaluation ───────────────────────────────────────────────────

const COMPARABLE_OPERATORS = new Set([
  "equals",
  "not_equals",
  "greater_than",
  "greater_than_or_equal",
  "less_than",
  "less_than_or_equal",
  "contains",
  "in",
  "not_in",
]);

export class RuleEvaluationError extends Error {}

function evaluateCondition(condition: RuleCondition, context: Record<string, unknown>): boolean {
  if (!COMPARABLE_OPERATORS.has(condition.operator)) {
    throw new RuleEvaluationError(`Unsupported operator "${condition.operator}" on condition ${condition.id}`);
  }
  if (!(condition.field in context)) {
    throw new RuleEvaluationError(`Missing field "${condition.field}" in evaluation context (condition ${condition.id})`);
  }

  const actual = context[condition.field];
  let expected: unknown;
  try {
    expected = JSON.parse(condition.value);
  } catch {
    // Allow plain unquoted strings/numbers stored without JSON encoding.
    expected = condition.value;
  }

  switch (condition.operator) {
    case "equals":
      return actual === expected;
    case "not_equals":
      return actual !== expected;
    case "greater_than":
      return typeof actual === "number" && typeof expected === "number" && actual > expected;
    case "greater_than_or_equal":
      return typeof actual === "number" && typeof expected === "number" && actual >= expected;
    case "less_than":
      return typeof actual === "number" && typeof expected === "number" && actual < expected;
    case "less_than_or_equal":
      return typeof actual === "number" && typeof expected === "number" && actual <= expected;
    case "contains":
      if (typeof actual === "string") return actual.includes(String(expected));
      if (Array.isArray(actual)) return actual.includes(expected);
      return false;
    case "in":
      return Array.isArray(expected) && expected.includes(actual);
    case "not_in":
      return Array.isArray(expected) && !expected.includes(actual);
    default:
      return false;
  }
}

/**
 * Recursively evaluates a group's child groups and leaf conditions, combining
 * them with the group's logicalOperator (AND/OR). Short-circuits: AND stops
 * at the first false child, OR stops at the first true child.
 */
export function evaluateGroup(
  groupId: number,
  groups: RuleGroup[],
  conditions: RuleCondition[],
  context: Record<string, unknown>,
): boolean {
  const group = groups.find((g) => g.id === groupId);
  if (!group) throw new RuleEvaluationError(`Rule group ${groupId} not found in its own version's graph`);

  const childGroups = groups.filter((g) => g.parentGroupId === groupId);
  const ownConditions = conditions.filter((c) => c.groupId === groupId);
  const isAnd = group.logicalOperator.toUpperCase() !== "OR";

  const results: boolean[] = [];
  for (const c of ownConditions) {
    const result = evaluateCondition(c, context);
    if (isAnd && !result) return false;
    if (!isAnd && result) return true;
    results.push(result);
  }
  for (const child of childGroups) {
    const result = evaluateGroup(child.id, groups, conditions, context);
    if (isAnd && !result) return false;
    if (!isAnd && result) return true;
    results.push(result);
  }

  // No early exit fired: AND groups are true unless something failed above,
  // OR groups are true only if something in `results` already returned true.
  return isAnd ? true : results.some(Boolean);
}

export interface RuleDecision {
  ruleId: number;
  ruleCode: string;
  ruleVersionId: number;
  matched: boolean;
  actions: Array<{ actionType: string; target: string | null; value: string | null }>;
}

/**
 * The engine's core pipeline (Book 06 §7): Request -> LoadRules ->
 * EvaluateConditions -> ExecuteActions -> ReturnDecision. Rules are isolated
 * from each other — one rule's evaluation error is recorded as RuleFailed and
 * skipped rather than aborting the whole batch, so a single malformed rule
 * can't take down every other policy check running against the same request.
 */
export async function evaluateRules(opts: {
  tenantId: number;
  module?: string;
  resourceType: string;
  context: Record<string, unknown>;
  actorUserId?: number;
}): Promise<{ decisions: RuleDecision[]; failures: Array<{ ruleId: number; error: string }> }> {
  const now = new Date();
  const conditions = [eq(rulesTable.tenantId, opts.tenantId), eq(rulesTable.resourceType, opts.resourceType), eq(rulesTable.status, "active")];
  if (opts.module) conditions.push(eq(rulesTable.module, opts.module));

  const activeRules = await db
    .select()
    .from(rulesTable)
    .where(and(...conditions));

  const decisions: Array<RuleDecision & { _priority: number }> = [];
  const failures: Array<{ ruleId: number; error: string }> = [];

  for (const rule of activeRules) {
    const [activeVersion] = await db
      .select()
      .from(ruleVersionsTable)
      .where(
        and(
          eq(ruleVersionsTable.ruleId, rule.id),
          eq(ruleVersionsTable.status, "active"),
          or(isNull(ruleVersionsTable.effectiveDate), lte(ruleVersionsTable.effectiveDate, now)),
        ),
      )
      .orderBy(asc(ruleVersionsTable.priority))
      .limit(1);

    if (!activeVersion) continue; // rule has no version currently in effect

    try {
      const { groups, conditions: ruleConditions, actions } = await getVersionGraph(activeVersion.id);
      const rootGroup = groups.find((g) => g.parentGroupId === null);
      if (!rootGroup) throw new RuleEvaluationError("Rule version has no root condition group");

      const matched = evaluateGroup(rootGroup.id, groups, ruleConditions, opts.context);
      const publicDecision: RuleDecision = {
        ruleId: rule.id,
        ruleCode: rule.code,
        ruleVersionId: activeVersion.id,
        matched,
        actions: matched ? actions.map((a) => ({ actionType: a.actionType, target: a.target, value: a.value })) : [],
      };
      decisions.push({ ...publicDecision, _priority: activeVersion.priority });

      await db.insert(ruleHistoryTable).values({
        ruleId: rule.id,
        ruleVersionId: activeVersion.id,
        eventType: "evaluated",
        context: JSON.stringify(opts.context),
        result: JSON.stringify(publicDecision),
        actorUserId: opts.actorUserId ?? null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown evaluation error";
      failures.push({ ruleId: rule.id, error: message });
      await db.insert(ruleHistoryTable).values({
        ruleId: rule.id,
        ruleVersionId: activeVersion.id,
        eventType: "failed",
        context: JSON.stringify(opts.context),
        result: JSON.stringify({ error: message }),
        actorUserId: opts.actorUserId ?? null,
      });
    }
  }

  // Priority ordering (§15 Performance): lower priority number = returned
  // first, so callers that only care about the first match (e.g. "which
  // approval tier applies") can short-circuit on decisions[0].
  decisions.sort((a, b) => a._priority - b._priority);
  return { decisions: decisions.map(({ _priority, ...d }) => d), failures };
}
