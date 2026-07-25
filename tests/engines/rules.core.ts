
type RuleGroup = { id:number; parentGroupId:number|null; logicalOperator:string; sortOrder:number };
type RuleCondition = { id:number; groupId:number; field:string; operator:string; value:string; sortOrder:number };
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

class RuleEvaluationError extends Error {}

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
function evaluateGroup(
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


export { evaluateGroup, RuleEvaluationError };
export type { RuleGroup, RuleCondition };
