import { useState, useEffect, useMemo } from 'react';
import { useRoute, Link } from 'wouter';
import {
  useGetReportDefinition,
  useListReportSources,
  useUpdateReportDefinition,
  usePublishReportDefinition,
  usePreviewReport,
  useRunReportDefinition,
  useListReportRuns,
  useListScheduledReports,
  useCreateScheduledReport,
  getGetReportDefinitionQueryKey,
  getListReportRunsQueryKey,
  getListScheduledReportsQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  ArrowLeft, BarChart3, Loader2, Save, Rocket, Play, Plus, Trash2, CalendarClock, Download, AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

interface Filter { column: string; operator: string; value?: unknown }
interface Sort { column: string; direction?: 'asc' | 'desc' }
interface Spec { columns: string[]; filters?: Filter[]; sort?: Sort[]; groupBy?: string[]; limit?: number }

const OPERATORS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'starts_with', 'in', 'is_null', 'is_not_null'];
const NO_VALUE_OPS = ['is_null', 'is_not_null'];

export default function ReportDetail() {
  const [, params] = useRoute('/reports/:id');
  const id = Number(params?.id);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: definition, isLoading } = useGetReportDefinition(id, {
    query: { enabled: !!id, queryKey: getGetReportDefinitionQueryKey(id) },
  });
  const { data: sources } = useListReportSources();
  const { data: runs } = useListReportRuns(id, { query: { enabled: !!id, queryKey: getListReportRunsQueryKey(id) } });
  const { data: schedules } = useListScheduledReports({ query: { queryKey: getListScheduledReportsQueryKey() } });

  const updateMutation = useUpdateReportDefinition();
  const publishMutation = usePublishReportDefinition();
  const previewMutation = usePreviewReport();
  const runMutation = useRunReportDefinition();
  const createSchedule = useCreateScheduledReport();

  const [spec, setSpec] = useState<Spec>({ columns: [] });
  const [preview, setPreview] = useState<{ valid: boolean; errors: string[]; columns?: string[]; rows?: Record<string, unknown>[] } | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleName, setScheduleName] = useState('');
  const [scheduleCron, setScheduleCron] = useState('0 6 * * *');

  // Load the saved spec into local editing state once the definition arrives.
  useEffect(() => {
    if (definition) {
      try { setSpec(JSON.parse(definition.spec)); } catch { setSpec({ columns: [] }); }
    }
  }, [definition]);

  const source = useMemo(() => sources?.find((s) => s.code === definition?.sourceCode), [sources, definition]);
  const isDraft = definition?.status === 'draft';
  const mySchedules = schedules?.filter((s) => s.reportDefinitionId === id) ?? [];

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (!definition) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">Report not found.</p>
        <Link href="/reports"><Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" />Back to reports</Button></Link>
      </div>
    );
  }

  const filterableCols = source?.columns.filter((c) => c.filterable) ?? [];
  const groupableCols = source?.columns.filter((c) => c.groupable) ?? [];

  const toggleColumn = (key: string) =>
    setSpec((s) => {
      const has = s.columns.includes(key);
      return { ...s, columns: has ? s.columns.filter((k) => k !== key) : [...s.columns, key] };
    });

  const addFilter = () => setSpec((s) => ({ ...s, filters: [...(s.filters ?? []), { column: filterableCols[0]?.key ?? '', operator: 'eq', value: '' }] }));
  const updateFilter = (i: number, patch: Partial<Filter>) =>
    setSpec((s) => ({ ...s, filters: (s.filters ?? []).map((f, idx) => (idx === i ? { ...f, ...patch } : f)) }));
  const removeFilter = (i: number) => setSpec((s) => ({ ...s, filters: (s.filters ?? []).filter((_, idx) => idx !== i) }));

  const toggleGroupBy = (key: string) =>
    setSpec((s) => {
      const cur = s.groupBy ?? [];
      const has = cur.includes(key);
      return { ...s, groupBy: has ? cur.filter((k) => k !== key) : [...cur, key] };
    });

  const save = () =>
    updateMutation.mutate(
      { id, data: { spec: spec as never } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetReportDefinitionQueryKey(id) });
          toast({ title: 'Report saved' });
        },
        onError: (err: unknown) => {
          const data = (err as { data?: { error?: string; details?: string[] } })?.data;
          toast({ title: 'Could not save', description: data?.details?.length ? data.details.join('; ') : data?.error, variant: 'destructive' });
        },
      },
    );

  const runPreview = () =>
    previewMutation.mutate(
      { data: { sourceCode: definition.sourceCode, spec: spec as never } },
      {
        onSuccess: (result) => setPreview(result),
        onError: (err: { message?: string }) => toast({ title: 'Preview failed', description: err.message, variant: 'destructive' }),
      },
    );

  const publish = () =>
    publishMutation.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetReportDefinitionQueryKey(id) });
          toast({ title: 'Report published', description: 'It can now be scheduled and run as an active version.' });
        },
        onError: (err: unknown) => {
          const data = (err as { data?: { error?: string } })?.data;
          toast({ title: 'Could not publish', description: data?.error, variant: 'destructive' });
        },
      },
    );

  const run = () =>
    runMutation.mutate(
      { id, data: { format: 'json' } },
      {
        onSuccess: (result) => {
          queryClient.invalidateQueries({ queryKey: getListReportRunsQueryKey(id) });
          setPreview({ valid: true, errors: [], columns: result.columns, rows: result.rows });
          toast({ title: `Ran report — ${result.rowCount} rows` });
        },
        onError: (err: unknown) => {
          const data = (err as { data?: { error?: string } })?.data;
          toast({ title: 'Run failed', description: data?.error, variant: 'destructive' });
        },
      },
    );

  const addSchedule = () => {
    if (!scheduleName.trim()) {
      toast({ title: 'Schedule name is required', variant: 'destructive' });
      return;
    }
    createSchedule.mutate(
      { data: { reportDefinitionId: id, name: scheduleName.trim(), cron: scheduleCron.trim(), format: 'csv' } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListScheduledReportsQueryKey() });
          setScheduleOpen(false);
          setScheduleName('');
          toast({ title: 'Schedule created' });
        },
        onError: (err: unknown) => {
          const data = (err as { data?: { error?: string } })?.data;
          toast({ title: 'Could not schedule', description: data?.error, variant: 'destructive' });
        },
      },
    );
  };

  const previewCols = preview?.columns ?? [];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/reports">
          <Button variant="ghost" size="sm" className="mb-3 -ml-2"><ArrowLeft className="mr-2 h-4 w-4" />Reports</Button>
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center">
              <BarChart3 className="h-6 w-6 mr-2 text-muted-foreground" />
              {definition.name}
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="font-mono text-sm text-muted-foreground">{definition.code}</span>
              <Badge variant="outline">{definition.sourceCode}</Badge>
              <Badge variant={definition.status === 'active' ? 'default' : 'secondary'}>{definition.status}</Badge>
              <span className="text-xs text-muted-foreground">v{definition.version}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={run} disabled={runMutation.isPending}>
              {runMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Run
            </Button>
            <a href={`/api/report-definitions/${id}/run?format=csv`} onClick={(e) => { e.preventDefault(); run(); }}>
              <Button variant="outline"><Download className="mr-2 h-4 w-4" />Export CSV</Button>
            </a>
            {isDraft && (
              <>
                <Button variant="outline" onClick={save} disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save
                </Button>
                <Button onClick={publish} disabled={publishMutation.isPending}>
                  {publishMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}
                  Publish
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {!isDraft && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>This version is read-only</AlertTitle>
          <AlertDescription>Published reports are frozen so past exports stay reproducible. Create a new version to change the definition.</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Columns</CardTitle>
            <CardDescription>What the report returns. None selected means all columns.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {source?.columns.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  disabled={!isDraft}
                  onClick={() => toggleColumn(c.key)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-60 ${
                    spec.columns.includes(c.key) ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:bg-accent'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Group by</CardTitle>
            <CardDescription>Grouping returns counts per group instead of rows.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {groupableCols.length === 0 ? (
                <p className="text-xs text-muted-foreground">This source has no groupable columns.</p>
              ) : groupableCols.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  disabled={!isDraft}
                  onClick={() => toggleGroupBy(c.key)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-60 ${
                    (spec.groupBy ?? []).includes(c.key) ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:bg-accent'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Filters</CardTitle>
            <CardDescription>All filters must match. Values are always sent as parameters.</CardDescription>
          </div>
          {isDraft && <Button variant="outline" size="sm" onClick={addFilter}><Plus className="mr-2 h-4 w-4" />Add filter</Button>}
        </CardHeader>
        <CardContent className="space-y-2">
          {(spec.filters ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No filters — the report returns everything in your tenant.</p>
          ) : (
            (spec.filters ?? []).map((f, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Select value={f.column} onValueChange={(v) => updateFilter(i, { column: v })} disabled={!isDraft}>
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>{filterableCols.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={f.operator} onValueChange={(v) => updateFilter(i, { operator: v })} disabled={!isDraft}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>{OPERATORS.map((op) => <SelectItem key={op} value={op}>{op}</SelectItem>)}</SelectContent>
                </Select>
                {!NO_VALUE_OPS.includes(f.operator) && (
                  <Input
                    className="w-48"
                    placeholder="value"
                    disabled={!isDraft}
                    value={String(f.value ?? '')}
                    onChange={(e) => updateFilter(i, { value: e.target.value })}
                  />
                )}
                {isDraft && <Button variant="ghost" size="icon" onClick={() => removeFilter(i)}><Trash2 className="h-4 w-4" /></Button>}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Preview</CardTitle>
            <CardDescription>A live sample (max 25 rows). Nothing is recorded.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={runPreview} disabled={previewMutation.isPending}>
            {previewMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
            Preview
          </Button>
        </CardHeader>
        <CardContent>
          {!preview ? (
            <p className="text-sm text-muted-foreground">Run a preview to see sample rows.</p>
          ) : !preview.valid ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Spec has {preview.errors.length} problem{preview.errors.length === 1 ? '' : 's'}</AlertTitle>
              <AlertDescription>{preview.errors.join('; ')}</AlertDescription>
            </Alert>
          ) : (preview.rows?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">Valid spec — no rows matched.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>{previewCols.map((c) => <TableHead key={c}>{c}</TableHead>)}</TableRow>
                </TableHeader>
                <TableBody>
                  {preview.rows?.map((row, i) => (
                    <TableRow key={i}>
                      {previewCols.map((c) => <TableCell key={c} className="text-xs">{String(row[c] ?? '')}</TableCell>)}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base flex items-center"><CalendarClock className="h-4 w-4 mr-2 text-muted-foreground" />Schedules</CardTitle>
              <CardDescription>Recurring runs (cron, UTC).</CardDescription>
            </div>
            <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
              <DialogTrigger asChild><Button variant="outline" size="sm" disabled={definition.status !== 'active'}><Plus className="mr-2 h-4 w-4" />Add</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Schedule this report</DialogTitle>
                  <DialogDescription>Uses a 5-field cron in UTC. Examples: "0 6 * * *" daily 6am, "*/15 * * * *" every 15 min.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2"><Label>Name</Label><Input value={scheduleName} onChange={(e) => setScheduleName(e.target.value)} placeholder="Daily permits export" /></div>
                  <div className="space-y-2"><Label>Cron</Label><Input className="font-mono" value={scheduleCron} onChange={(e) => setScheduleCron(e.target.value)} /></div>
                </div>
                <DialogFooter>
                  <Button onClick={addSchedule} disabled={createSchedule.isPending}>
                    {createSchedule.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create schedule
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {mySchedules.length === 0 ? (
              <p className="text-sm text-muted-foreground">{definition.status === 'active' ? 'No schedules yet.' : 'Publish the report to schedule it.'}</p>
            ) : (
              <div className="space-y-2">
                {mySchedules.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{s.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{s.cron} · next {s.nextRunAt ? format(new Date(s.nextRunAt), 'PPp') : '—'}</p>
                    </div>
                    <Badge variant={s.enabled ? 'default' : 'secondary'}>{s.enabled ? 'enabled' : 'paused'}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Run history</CardTitle>
            <CardDescription>Recent executions, newest first.</CardDescription>
          </CardHeader>
          <CardContent>
            {!runs || runs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No runs yet.</p>
            ) : (
              <div className="space-y-2">
                {runs.slice(0, 8).map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-3">
                    <div className="flex items-center gap-2">
                      <Badge variant={r.status === 'succeeded' ? 'default' : r.status === 'failed' ? 'destructive' : 'secondary'}>{r.status}</Badge>
                      <span className="text-xs text-muted-foreground">{r.triggeredBy}</span>
                      {r.rowCount != null && <span className="text-xs text-muted-foreground">{r.rowCount} rows</span>}
                    </div>
                    <span className="text-xs text-muted-foreground">{format(new Date(r.startedAt), 'PPp')}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
