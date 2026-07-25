import { useState, useMemo } from 'react';
import { Link } from 'wouter';
import {
  useListReportDefinitions,
  useListReportSources,
  useCreateReportDefinition,
  getListReportDefinitionsQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { BarChart3, Plus, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  active: 'default',
  draft: 'secondary',
  deprecated: 'outline',
  archived: 'outline',
};

export default function ReportsList() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [module, setModule] = useState('');
  const [sourceCode, setSourceCode] = useState('');
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set());

  const { data: definitions, isLoading } = useListReportDefinitions(undefined, {
    query: { queryKey: getListReportDefinitionsQueryKey() },
  });
  const { data: sources } = useListReportSources();
  const createMutation = useCreateReportDefinition();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const activeSource = useMemo(() => sources?.find((s) => s.code === sourceCode), [sources, sourceCode]);

  const toggleColumn = (key: string) =>
    setSelectedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const resetForm = () => {
    setName(''); setCode(''); setModule(''); setSourceCode(''); setSelectedColumns(new Set());
  };

  const create = () => {
    if (!name.trim() || !code.trim() || !module.trim() || !sourceCode) {
      toast({ title: 'Name, code, module, and data source are required', variant: 'destructive' });
      return;
    }
    createMutation.mutate(
      {
        data: {
          name: name.trim(),
          code: code.trim(),
          module: module.trim(),
          sourceCode,
          // Start with the chosen columns; the builder refines filters/sort later.
          spec: { columns: [...selectedColumns] },
        },
      },
      {
        onSuccess: (created) => {
          queryClient.invalidateQueries({ queryKey: getListReportDefinitionsQueryKey() });
          setCreateOpen(false);
          resetForm();
          toast({ title: 'Draft report created', description: `Open "${created.name}" to build and publish it.` });
        },
        onError: (err: unknown) => {
          const data = (err as { data?: { error?: string; details?: string[] } })?.data;
          toast({
            title: 'Could not create report',
            description: data?.details?.length ? data.details.join('; ') : data?.error ?? (err as { message?: string })?.message,
            variant: 'destructive',
          });
        },
      },
    );
  };

  const filtered = definitions?.filter((d) => {
    const matchesSearch =
      d.name.toLowerCase().includes(search.toLowerCase()) || d.code.toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (statusFilter === 'all' || d.status === statusFilter);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Reports are defined as data over a curated set of sources — no SQL, and every run is scoped to your tenant and audited.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />New Report</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create a report</DialogTitle>
              <DialogDescription>
                Pick a data source and the columns to start with. You'll add filters, sorting, and grouping in the builder.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input placeholder="Signed permits by municipality" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Code</Label>
                  <Input placeholder="SIGNED_PERMITS" value={code} onChange={(e) => setCode(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Module</Label>
                  <Input placeholder="documents" value={module} onChange={(e) => setModule(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Data source</Label>
                <Select value={sourceCode} onValueChange={(v) => { setSourceCode(v); setSelectedColumns(new Set()); }}>
                  <SelectTrigger><SelectValue placeholder="Choose a source..." /></SelectTrigger>
                  <SelectContent>
                    {sources?.map((s) => <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {activeSource && (
                <div className="space-y-2">
                  <Label>Columns</Label>
                  <div className="flex flex-wrap gap-1.5 rounded-md border border-border p-3">
                    {activeSource.columns.map((c) => (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => toggleColumn(c.key)}
                        className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                          selectedColumns.has(c.key)
                            ? 'border-primary bg-primary/10 text-foreground'
                            : 'border-border text-muted-foreground hover:bg-accent'
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">Leave all unselected to include every column.</p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button onClick={create} disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create draft
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search reports..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="deprecated">Deprecated</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card border border-border rounded-md shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Report</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></TableCell></TableRow>
            ) : filtered?.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">No reports match this filter.</TableCell></TableRow>
            ) : (
              filtered?.map((d) => (
                <TableRow key={d.id} className="hover-elevate">
                  <TableCell>
                    <span className="font-medium flex items-center">
                      <BarChart3 className="h-4 w-4 mr-2 text-muted-foreground" />
                      {d.name}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{d.code}</TableCell>
                  <TableCell className="text-xs">{d.sourceCode}</TableCell>
                  <TableCell className="text-xs">v{d.version}</TableCell>
                  <TableCell><Badge variant={STATUS_VARIANT[d.status] ?? 'secondary'}>{d.status}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{format(new Date(d.updatedAt), 'PP')}</TableCell>
                  <TableCell className="text-right">
                    <Link href={`/reports/${d.id}`}><Button variant="ghost" size="sm">Open</Button></Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
