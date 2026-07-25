import { useState } from 'react';
import { useRoute, Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetRule,
  useCreateRuleVersion,
  usePublishRuleVersion,
  useGetRuleVersion,
  useListRuleHistory,
  getGetRuleQueryKey,
  getGetRuleVersionQueryKey,
  getListRuleHistoryQueryKey,
  RuleConditionInputOperator,
  RuleActionInputActionType,
  RuleGroupInputLogicalOperator,
} from '@workspace/api-client-react';
import type {
  RuleConditionInputOperator as OperatorValue,
  RuleActionInputActionType as ActionTypeValue,
  RuleGroupInputLogicalOperator as LogicalOperatorValue,
} from '@workspace/api-client-react';
import { format } from 'date-fns';
import { ArrowLeft, Scale, Loader2, Plus, Trash2, Rocket, Eye, PencilRuler, History, FlaskConical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { ConditionTree } from '@/components/rules/ConditionTree';

const OPERATORS = Object.values(RuleConditionInputOperator);
const ACTION_TYPES = Object.values(RuleActionInputActionType);
const LOGICAL_OPERATORS = Object.values(RuleGroupInputLogicalOperator);

// Operators whose value is a list rather than a scalar (Book 06 condition
// semantics) — the builder parses these as comma-separated input.
const LIST_OPERATORS = new Set<string>(['in', 'not_in']);

type DraftGroup = { key: string; parentKey: string; logicalOperator: LogicalOperatorValue };
type DraftCondition = { key: string; groupKey: string; field: string; operator: OperatorValue; value: string };
type DraftAction = { key: string; actionType: ActionTypeValue; target: string; value: string };

let counter = 0;
const nextKey = (prefix: string) => `${prefix}${(counter += 1)}`;

const ROOT_KEY = 'root';

/** Coerces the builder's free-text value into the JSON the engine compares against. */
function coerceValue(raw: string, operator: string): unknown {
  const trimmed = raw.trim();
  if (LIST_OPERATORS.has(operator)) {
    return trimmed
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => (s === 'true' ? true : s === 'false' ? false : Number.isNaN(Number(s)) || s === '' ? s : Number(s)));
  }
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed !== '' && !Number.isNaN(Number(trimmed))) return Number(trimmed);
  return trimmed;
}

function VersionGraph({ versionId }: { versionId: number }) {
  const { data: version, isLoading } = useGetRuleVersion(versionId, {
    query: { queryKey: getGetRuleVersionQueryKey(versionId) },
  });

  if (isLoading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  if (!version) return null;

  return (
    <div className="grid gap-4 md:grid-cols-2 mt-3">
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">Conditions</p>
        <ConditionTree groups={version.groups} conditions={version.conditions} />
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">Actions when matched</p>
        {version.actions.length === 0 ? (
          <p className="text-xs text-muted-foreground">No actions configured.</p>
        ) : (
          <div className="space-y-1">
            {version.actions.map((a) => (
              <div key={a.id} className="text-xs">
                <span className="font-medium text-foreground">{a.actionType}</span>
                {a.target && <span className="text-muted-foreground"> → <span className="font-mono">{a.target}</span></span>}
                {a.value && <span className="text-muted-foreground"> = <span className="font-mono">{a.value}</span></span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function RuleDetail() {
  const [, params] = useRoute('/rules/:id');
  const id = Number(params?.id);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [builderOpen, setBuilderOpen] = useState(false);
  const [expandedVersion, setExpandedVersion] = useState<number | null>(null);
  const [priority, setPriority] = useState('100');

  // The root group always exists and can't be removed — the engine requires
  // exactly one root per version.
  const [groups, setGroups] = useState<DraftGroup[]>([{ key: ROOT_KEY, parentKey: '', logicalOperator: 'AND' }]);
  const [conditions, setConditions] = useState<DraftCondition[]>([
    { key: nextKey('c'), groupKey: ROOT_KEY, field: '', operator: 'equals', value: '' },
  ]);
  const [actions, setActions] = useState<DraftAction[]>([]);

  const { data: rule, isLoading } = useGetRule(id, {
    query: { enabled: !!id, queryKey: getGetRuleQueryKey(id) },
  });
  const { data: history } = useListRuleHistory(id, {
    query: { enabled: !!id, queryKey: getListRuleHistoryQueryKey(id) },
  });

  const createVersion = useCreateRuleVersion();
  const publishVersion = usePublishRuleVersion();

  const addGroup = () =>
    setGroups((p) => [...p, { key: nextKey('g'), parentKey: ROOT_KEY, logicalOperator: 'AND' }]);
  const removeGroup = (key: string) => {
    setGroups((p) => p.filter((g) => g.key !== key && g.parentKey !== key));
    setConditions((p) => p.filter((c) => c.groupKey !== key));
  };
  const addCondition = () =>
    setConditions((p) => [...p, { key: nextKey('c'), groupKey: ROOT_KEY, field: '', operator: 'equals', value: '' }]);
  const addAction = () =>
    setActions((p) => [...p, { key: nextKey('a'), actionType: 'require_approval', target: '', value: '' }]);

  const updateGroup = (key: string, patch: Partial<DraftGroup>) =>
    setGroups((p) => p.map((g) => (g.key === key ? { ...g, ...patch } : g)));
  const updateCondition = (key: string, patch: Partial<DraftCondition>) =>
    setConditions((p) => p.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  const updateAction = (key: string, patch: Partial<DraftAction>) =>
    setActions((p) => p.map((a) => (a.key === key ? { ...a, ...patch } : a)));

  const submitVersion = () => {
    if (conditions.length === 0) {
      toast({ title: 'Add at least one condition', variant: 'destructive' });
      return;
    }
    if (conditions.some((c) => !c.field.trim())) {
      toast({ title: 'Every condition needs a field name', variant: 'destructive' });
      return;
    }
    if (actions.length === 0) {
      toast({
        title: 'Add at least one action',
        description: 'A rule that matches but does nothing has no effect.',
        variant: 'destructive',
      });
      return;
    }

    createVersion.mutate(
      {
        id,
        data: {
          priority: Number(priority) || 100,
          groups: groups.map((g, i) => ({
            key: g.key,
            parentKey: g.key === ROOT_KEY ? undefined : g.parentKey || ROOT_KEY,
            logicalOperator: g.logicalOperator,
            sortOrder: i,
          })),
          conditions: conditions.map((c, i) => ({
            groupKey: c.groupKey,
            field: c.field.trim(),
            operator: c.operator,
            value: coerceValue(c.value, c.operator),
            sortOrder: i,
          })),
          actions: actions.map((a, i) => ({
            actionType: a.actionType,
            target: a.target || undefined,
            value: a.value || undefined,
            sortOrder: i,
          })),
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetRuleQueryKey(id) });
          setBuilderOpen(false);
          toast({ title: 'Draft version created' });
        },
        onError: (err: { message?: string }) =>
          toast({ title: 'Could not create version', description: err.message, variant: 'destructive' }),
      },
    );
  };

  const publish = (versionId: number) =>
    publishVersion.mutate(
      { id: versionId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetRuleQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListRuleHistoryQueryKey(id) });
          toast({ title: 'Version published', description: 'It is now the active version for this rule.' });
        },
        onError: (err: { message?: string }) =>
          toast({ title: 'Could not publish', description: err.message, variant: 'destructive' }),
      },
    );

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (!rule) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">Rule not found.</p>
        <Link href="/rules"><Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" />Back to rules</Button></Link>
      </div>
    );
  }

  const groupLabel = (key: string) => (key === ROOT_KEY ? 'Root group' : `Group ${key}`);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/rules">
          <Button variant="ghost" size="sm" className="mb-3 -ml-2"><ArrowLeft className="mr-2 h-4 w-4" />Rules</Button>
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center">
              <Scale className="h-6 w-6 mr-2 text-muted-foreground" />
              {rule.name}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              <span className="font-mono">{rule.code}</span> · {rule.ruleType} · {rule.module} ·{' '}
              <span className="font-mono">{rule.resourceType}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/rules/evaluate">
              <Button variant="outline"><FlaskConical className="mr-2 h-4 w-4" />Test</Button>
            </Link>
            <Dialog open={builderOpen} onOpenChange={setBuilderOpen}>
              <DialogTrigger asChild>
                <Button><PencilRuler className="mr-2 h-4 w-4" />Build Version</Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Build a draft version</DialogTitle>
                  <DialogDescription>
                    Conditions are grouped into a boolean tree. Publishing activates this version without mutating logic that is already live.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Priority</Label>
                      <Input type="number" value={priority} onChange={(e) => setPriority(e.target.value)} />
                      <p className="text-xs text-muted-foreground">Lower runs first when several rules match.</p>
                    </div>
                  </div>

                  {/* Groups */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-semibold">Condition groups</h4>
                        <p className="text-xs text-muted-foreground">Nest groups to express logic like (A AND B) OR C.</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={addGroup}>
                        <Plus className="mr-2 h-3 w-3" />Add group
                      </Button>
                    </div>
                    {groups.map((g) => (
                      <div key={g.key} className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto] items-center rounded-md border border-border p-3">
                        <span className="text-sm font-medium">{groupLabel(g.key)}</span>
                        <Select value={g.logicalOperator} onValueChange={(v) => updateGroup(g.key, { logicalOperator: v as LogicalOperatorValue })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {LOGICAL_OPERATORS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        {g.key === ROOT_KEY ? (
                          <span className="text-xs text-muted-foreground">top level</span>
                        ) : (
                          <Select value={g.parentKey || ROOT_KEY} onValueChange={(v) => updateGroup(g.key, { parentKey: v })}>
                            <SelectTrigger><SelectValue placeholder="Parent" /></SelectTrigger>
                            <SelectContent>
                              {groups.filter((o) => o.key !== g.key).map((o) => (
                                <SelectItem key={o.key} value={o.key}>{groupLabel(o.key)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        {g.key === ROOT_KEY ? (
                          <span />
                        ) : (
                          <Button variant="ghost" size="icon" onClick={() => removeGroup(g.key)}>
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Conditions */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold">Conditions</h4>
                      <Button variant="outline" size="sm" onClick={addCondition}>
                        <Plus className="mr-2 h-3 w-3" />Add condition
                      </Button>
                    </div>
                    {conditions.map((c) => (
                      <div key={c.key} className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_1fr_auto] items-start rounded-md border border-border p-3">
                        <Input placeholder="Field (e.g. applicant_age)" value={c.field} onChange={(e) => updateCondition(c.key, { field: e.target.value })} />
                        <Select value={c.operator} onValueChange={(v) => updateCondition(c.key, { operator: v as OperatorValue })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {OPERATORS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Input
                          placeholder={LIST_OPERATORS.has(c.operator) ? 'a, b, c' : 'Value'}
                          value={c.value}
                          onChange={(e) => updateCondition(c.key, { value: e.target.value })}
                        />
                        <Select value={c.groupKey} onValueChange={(v) => updateCondition(c.key, { groupKey: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {groups.map((g) => <SelectItem key={g.key} value={g.key}>{groupLabel(g.key)}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Button variant="ghost" size="icon" onClick={() => setConditions((p) => p.filter((x) => x.key !== c.key))}>
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold">Actions when matched</h4>
                      <Button variant="outline" size="sm" onClick={addAction}>
                        <Plus className="mr-2 h-3 w-3" />Add action
                      </Button>
                    </div>
                    {actions.length === 0 && <p className="text-xs text-muted-foreground">No actions yet.</p>}
                    {actions.map((a) => (
                      <div key={a.key} className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto] items-start rounded-md border border-border p-3">
                        <Select value={a.actionType} onValueChange={(v) => updateAction(a.key, { actionType: v as ActionTypeValue })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {ACTION_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Input placeholder="Target (field or role code)" value={a.target} onChange={(e) => updateAction(a.key, { target: e.target.value })} />
                        <Input placeholder="Value" value={a.value} onChange={(e) => updateAction(a.key, { value: e.target.value })} />
                        <Button variant="ghost" size="icon" onClick={() => setActions((p) => p.filter((x) => x.key !== a.key))}>
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                <DialogFooter>
                  <Button onClick={submitVersion} disabled={createVersion.isPending}>
                    {createVersion.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create draft version
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Versions</CardTitle>
          <CardDescription>
            Only one version is active at a time. Lower priority numbers are evaluated first.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {rule.versions.length === 0 && <p className="text-sm text-muted-foreground">No versions yet. Build one to get started.</p>}
          {rule.versions.map((v) => (
            <div key={v.id} className="rounded-md border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-medium text-sm">Version {v.version}</span>
                  <Badge variant={v.status === 'active' ? 'default' : 'secondary'}>{v.status}</Badge>
                  <span className="text-xs text-muted-foreground">priority {v.priority}</span>
                  {v.publishedAt && (
                    <span className="text-xs text-muted-foreground">published {format(new Date(v.publishedAt), 'PP')}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setExpandedVersion(expandedVersion === v.id ? null : v.id)}>
                    <Eye className="mr-2 h-4 w-4" />{expandedVersion === v.id ? 'Hide' : 'Inspect'}
                  </Button>
                  {v.status !== 'active' && (
                    <Button variant="outline" size="sm" onClick={() => publish(v.id)} disabled={publishVersion.isPending}>
                      <Rocket className="mr-2 h-4 w-4" />Publish
                    </Button>
                  )}
                </div>
              </div>
              {expandedVersion === v.id && <VersionGraph versionId={v.id} />}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center">
            <History className="h-4 w-4 mr-2 text-muted-foreground" />Audit trail
          </CardTitle>
          <CardDescription>Every publish, evaluation, and failure, newest first.</CardDescription>
        </CardHeader>
        <CardContent>
          {!history || history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recorded events yet.</p>
          ) : (
            <div className="space-y-2">
              {[...history]
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .slice(0, 25)
                .map((h) => (
                  <div key={h.id} className="flex items-start justify-between gap-4 rounded-md border border-border p-3">
                    <div className="min-w-0">
                      <Badge variant={h.eventType === 'failed' ? 'destructive' : 'secondary'} className="mb-1">
                        {h.eventType}
                      </Badge>
                      {h.result && (
                        <p className="text-xs text-muted-foreground font-mono break-all line-clamp-2">{h.result}</p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(h.createdAt), 'PPp')}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
