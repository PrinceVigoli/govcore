import type { RuleGroup, RuleCondition } from '@workspace/api-client-react';
import { Badge } from '@/components/ui/badge';

/** Human-readable operator labels, so a non-technical admin can read the logic. */
const OPERATOR_LABELS: Record<string, string> = {
  equals: 'is',
  not_equals: 'is not',
  greater_than: '>',
  greater_than_or_equal: '≥',
  less_than: '<',
  less_than_or_equal: '≤',
  contains: 'contains',
  in: 'is one of',
  not_in: 'is not one of',
};

/** Conditions store `value` JSON-encoded; show the decoded form. */
function formatValue(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String).join(', ');
    return String(parsed);
  } catch {
    return raw;
  }
}

/**
 * Renders a rule version's condition graph as an indented boolean tree,
 * mirroring how the engine evaluates it: each group combines its own
 * conditions and its child groups with the group's AND/OR operator.
 *
 * A version whose root group is missing is shown as an explicit warning
 * rather than silently rendering nothing — the engine treats that same case
 * as an evaluation failure.
 */
export function ConditionTree({
  groups,
  conditions,
  groupId,
  depth = 0,
}: {
  groups: RuleGroup[];
  conditions: RuleCondition[];
  groupId?: number;
  depth?: number;
}) {
  const root = groupId !== undefined
    ? groups.find((g) => g.id === groupId)
    : groups.find((g) => g.parentGroupId === null || g.parentGroupId === undefined);

  if (!root) {
    return <p className="text-xs text-destructive">No root condition group — this version cannot be evaluated.</p>;
  }

  const own = conditions
    .filter((c) => c.groupId === root.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const children = groups
    .filter((g) => g.parentGroupId === root.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const isEmpty = own.length === 0 && children.length === 0;
  const operator = root.logicalOperator.toUpperCase() === 'OR' ? 'OR' : 'AND';

  return (
    <div className={depth > 0 ? 'border-l border-border pl-3 ml-1' : undefined}>
      <div className="flex items-center gap-2 mb-1.5">
        <Badge variant={operator === 'OR' ? 'secondary' : 'outline'} className="text-[10px] font-mono">
          {operator}
        </Badge>
        {isEmpty && <span className="text-xs text-muted-foreground">empty group</span>}
      </div>

      <div className="space-y-1.5">
        {own.map((c) => (
          <div key={c.id} className="text-xs">
            <span className="font-mono text-foreground">{c.field}</span>{' '}
            <span className="text-muted-foreground">{OPERATOR_LABELS[c.operator] ?? c.operator}</span>{' '}
            <span className="font-mono text-foreground">{formatValue(c.value)}</span>
          </div>
        ))}

        {children.map((child) => (
          <ConditionTree
            key={child.id}
            groups={groups}
            conditions={conditions}
            groupId={child.id}
            depth={depth + 1}
          />
        ))}
      </div>
    </div>
  );
}
