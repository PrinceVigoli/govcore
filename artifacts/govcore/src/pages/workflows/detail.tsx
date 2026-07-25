import { useState } from 'react';
import { useRoute, Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetWorkflowDefinition,
  useCreateWorkflowVersion,
  usePublishWorkflowVersion,
  useGetWorkflowVersion,
  useStartWorkflowInstance,
  useListWorkflowInstances,
  getGetWorkflowDefinitionQueryKey,
  getGetWorkflowVersionQueryKey,
  getListWorkflowInstancesQueryKey,
} from '@workspace/api-client-react';
import { format } from 'date-fns';
import { ArrowLeft, GitBranch, Loader2, Plus, Trash2, Rocket, CheckCircle2, Play, ListTree } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

type DraftState = { key: string; name: string; code: string; type: string; isInitial: boolean; isFinal: boolean };
type DraftTransition = { name: string; fromKey: string; toKey: string; requiredPermission: string };

let keyCounter = 0;
function nextKey() {
  keyCounter += 1;
  return `s${keyCounter}`;
}

function VersionGraph({ versionId }: { versionId: number }) {
  const { data: version, isLoading } = useGetWorkflowVersion(versionId, {
    query: { queryKey: getGetWorkflowVersionQueryKey(versionId) },
  });

  if (isLoading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  if (!version) return null;

  const stateName = (id: number) => version.states.find((s) => s.id === id)?.name ?? `#${id}`;

  return (
    <div className="grid gap-4 md:grid-cols-2 mt-3">
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">States</p>
        <div className="flex flex-wrap gap-2">
          {version.states.map((s) => (
            <Badge key={s.id} variant={s.isFinal ? 'default' : 'secondary'} className="font-normal">
              {s.name}
              {s.isInitial && ' · start'}
              {s.isFinal && ' · final'}
            </Badge>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">Transitions</p>
        <div className="space-y-1">
          {version.transitions.map((t) => (
            <div key={t.id} className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{t.name}</span>: {stateName(t.fromStateId)} → {stateName(t.toStateId)}
              {t.requiredPermission && <span className="ml-1 font-mono">[{t.requiredPermission}]</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function WorkflowDetail() {
  const [, params] = useRoute('/workflows/:id');
  const id = Number(params?.id);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedVersion, setExpandedVersion] = useState<number | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [resourceId, setResourceId] = useState('');
  const [firstAssigneeUserId, setFirstAssigneeUserId] = useState('');

  const [states, setStates] = useState<DraftState[]>([
    { key: nextKey(), name: 'Draft', code: 'draft', type: 'draft', isInitial: true, isFinal: false },
    { key: nextKey(), name: 'Under Review', code: 'review', type: 'review', isInitial: false, isFinal: false },
    { key: nextKey(), name: 'Approved', code: 'approved', type: 'completed', isInitial: false, isFinal: true },
  ]);
  const [transitions, setTransitions] = useState<DraftTransition[]>([]);

  const { data: definition, isLoading } = useGetWorkflowDefinition(id, {
    query: { enabled: !!id, queryKey: getGetWorkflowDefinitionQueryKey(id) },
  });
  const { data: instances } = useListWorkflowInstances(
    { workflowDefinitionId: id },
    { query: { enabled: !!id, queryKey: getListWorkflowInstancesQueryKey({ workflowDefinitionId: id }) } }
  );

  const createVersionMutation = useCreateWorkflowVersion();
  const publishMutation = usePublishWorkflowVersion();
  const startMutation = useStartWorkflowInstance();

  const addState = () => setStates((prev) => [...prev, { key: nextKey(), name: '', code: '', type: 'review', isInitial: false, isFinal: false }]);
  const removeState = (key: string) => {
    setStates((prev) => prev.filter((s) => s.key !== key));
    setTransitions((prev) => prev.filter((t) => t.fromKey !== key && t.toKey !== key));
  };
  const addTransition = () => setTransitions((prev) => [...prev, { name: '', fromKey: states[0]?.key ?? '', toKey: states[0]?.key ?? '', requiredPermission: '' }]);
  const removeTransition = (index: number) => setTransitions((prev) => prev.filter((_, i) => i !== index));

  const submitVersion = () => {
    if (!states.some((s) => s.isInitial)) {
      toast({ title: 'At least one state must be the start state', variant: 'destructive' });
      return;
    }
    createVersionMutation.mutate(
      {
        id,
        data: {
          states: states.map(({ key, name, code, type, isInitial, isFinal }) => ({ key, name, code, type: type as 'draft' | 'review' | 'approved' | 'rejected' | 'completed', isInitial, isFinal })),
          transitions: transitions
            .filter((t) => t.name && t.fromKey && t.toKey)
            .map(({ name, fromKey, toKey, requiredPermission }) => ({ name, fromKey, toKey, requiredPermission: requiredPermission || undefined })),
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetWorkflowDefinitionQueryKey(id) });
          setBuilderOpen(false);
          toast({ title: 'Draft version created' });
        },
        onError: (err) => toast({ title: 'Failed to create version', description: err.message, variant: 'destructive' }),
      }
    );
  };

  const publish = (versionId: number) => {
    publishMutation.mutate(
      { id: versionId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetWorkflowDefinitionQueryKey(id) });
          toast({ title: 'Version published' });
        },
        onError: (err) => toast({ title: 'Failed to publish', description: err.message, variant: 'destructive' }),
      }
    );
  };

  const startInstance = () => {
    if (!resourceId.trim()) {
      toast({ title: 'Resource ID is required', variant: 'destructive' });
      return;
    }
    startMutation.mutate(
      {
        data: {
          workflowDefinitionId: id,
          resourceId: resourceId.trim(),
          firstAssigneeUserId: firstAssigneeUserId ? Number(firstAssigneeUserId) : undefined,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListWorkflowInstancesQueryKey({ workflowDefinitionId: id }) });
          setStartOpen(false);
          setResourceId('');
          setFirstAssigneeUserId('');
          toast({ title: 'Workflow instance started' });
        },
        onError: (err) => toast({ title: 'Failed to start instance', description: err.message, variant: 'destructive' }),
      }
    );
  };

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!definition) return <div className="p-8 text-center text-muted-foreground">Workflow not found</div>;

  const hasPublishedVersion = definition.versions.some((v) => v.isPublished);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center space-x-4">
        <Link href="/workflows">
          <Button variant="ghost" size="icon" className="shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center">
            <GitBranch className="mr-2 h-6 w-6 text-primary" />
            {definition.name}
          </h1>
          <p className="text-sm text-muted-foreground mt-1 font-mono">{definition.code} · {definition.resourceType}</p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Versions</CardTitle>
            <CardDescription>Each version is an immutable graph of states and transitions.</CardDescription>
          </div>
          <Dialog open={builderOpen} onOpenChange={setBuilderOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus className="mr-2 h-4 w-4" />
                New Draft Version
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>New Draft Version</DialogTitle>
                <DialogDescription>Define the states an instance can be in, then the transitions that move it between them.</DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>States</Label>
                  <Button type="button" variant="ghost" size="sm" onClick={addState}>
                    <Plus className="h-3 w-3 mr-1" /> Add state
                  </Button>
                </div>
                {states.map((s) => (
                  <div key={s.key} className="grid grid-cols-12 gap-2 items-center">
                    <Input
                      className="col-span-3"
                      placeholder="Name"
                      value={s.name}
                      onChange={(e) => setStates((prev) => prev.map((row) => (row.key === s.key ? { ...row, name: e.target.value } : row)))}
                    />
                    <Input
                      className="col-span-2"
                      placeholder="code"
                      value={s.code}
                      onChange={(e) => setStates((prev) => prev.map((row) => (row.key === s.key ? { ...row, code: e.target.value } : row)))}
                    />
                    <Select value={s.type} onValueChange={(v) => setStates((prev) => prev.map((row) => (row.key === s.key ? { ...row, type: v } : row)))}>
                      <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">draft</SelectItem>
                        <SelectItem value="review">review</SelectItem>
                        <SelectItem value="approved">approved</SelectItem>
                        <SelectItem value="rejected">rejected</SelectItem>
                        <SelectItem value="completed">completed</SelectItem>
                      </SelectContent>
                    </Select>
                    <label className="col-span-1 flex items-center gap-1 text-xs">
                      <Checkbox checked={s.isInitial} onCheckedChange={(v) => setStates((prev) => prev.map((row) => (row.key === s.key ? { ...row, isInitial: !!v } : row)))} />
                      start
                    </label>
                    <label className="col-span-2 flex items-center gap-1 text-xs">
                      <Checkbox checked={s.isFinal} onCheckedChange={(v) => setStates((prev) => prev.map((row) => (row.key === s.key ? { ...row, isFinal: !!v } : row)))} />
                      final
                    </label>
                    <Button type="button" variant="ghost" size="icon" className="col-span-1" onClick={() => removeState(s.key)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="space-y-3 pt-2 border-t border-border">
                <div className="flex items-center justify-between pt-3">
                  <Label>Transitions</Label>
                  <Button type="button" variant="ghost" size="sm" onClick={addTransition} disabled={states.length === 0}>
                    <Plus className="h-3 w-3 mr-1" /> Add transition
                  </Button>
                </div>
                {transitions.map((t, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <Input
                      className="col-span-3"
                      placeholder="Approve"
                      value={t.name}
                      onChange={(e) => setTransitions((prev) => prev.map((row, idx) => (idx === i ? { ...row, name: e.target.value } : row)))}
                    />
                    <Select value={t.fromKey} onValueChange={(v) => setTransitions((prev) => prev.map((row, idx) => (idx === i ? { ...row, fromKey: v } : row)))}>
                      <SelectTrigger className="col-span-3"><SelectValue placeholder="From" /></SelectTrigger>
                      <SelectContent>
                        {states.map((s) => <SelectItem key={s.key} value={s.key}>{s.name || s.key}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={t.toKey} onValueChange={(v) => setTransitions((prev) => prev.map((row, idx) => (idx === i ? { ...row, toKey: v } : row)))}>
                      <SelectTrigger className="col-span-3"><SelectValue placeholder="To" /></SelectTrigger>
                      <SelectContent>
                        {states.map((s) => <SelectItem key={s.key} value={s.key}>{s.name || s.key}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input
                      className="col-span-2"
                      placeholder="permission (optional)"
                      value={t.requiredPermission}
                      onChange={(e) => setTransitions((prev) => prev.map((row, idx) => (idx === i ? { ...row, requiredPermission: e.target.value } : row)))}
                    />
                    <Button type="button" variant="ghost" size="icon" className="col-span-1" onClick={() => removeTransition(i)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">Tip: name transitions "Approve" / "Reject" so task actions can resolve them automatically.</p>
              </div>

              <DialogFooter>
                <Button type="button" onClick={submitVersion} disabled={createVersionMutation.isPending}>
                  {createVersionMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Draft Version
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="space-y-4">
          {definition.versions.length === 0 && <p className="text-sm text-muted-foreground">No versions yet. Create a draft version to define the process.</p>}
          {definition.versions.map((v) => (
            <div key={v.id} className="border border-border rounded-md p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium">Version {v.version}</span>
                  {v.isPublished ? (
                    <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" /> Published</Badge>
                  ) : (
                    <Badge variant="secondary">Draft</Badge>
                  )}
                  <span className="text-xs text-muted-foreground">{format(new Date(v.createdAt), 'MMM d, yyyy')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setExpandedVersion(expandedVersion === v.id ? null : v.id)}>
                    <ListTree className="h-3.5 w-3.5 mr-1" />
                    {expandedVersion === v.id ? 'Hide graph' : 'View graph'}
                  </Button>
                  {!v.isPublished && (
                    <Button size="sm" onClick={() => publish(v.id)} disabled={publishMutation.isPending}>
                      <Rocket className="h-3.5 w-3.5 mr-1" /> Publish
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
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Instances</CardTitle>
            <CardDescription>Running processes started from a published version of this workflow.</CardDescription>
          </div>
          <Dialog open={startOpen} onOpenChange={setStartOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" disabled={!hasPublishedVersion}>
                <Play className="mr-2 h-4 w-4" />
                Start Instance
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Start Workflow Instance</DialogTitle>
                <DialogDescription>Attach a new instance to a business record using the latest published version.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Resource ID</Label>
                  <Input placeholder="e.g. permit-application id" value={resourceId} onChange={(e) => setResourceId(e.target.value)} />
                </div>
                <div>
                  <Label>First Assignee User ID (optional)</Label>
                  <Input type="number" value={firstAssigneeUserId} onChange={(e) => setFirstAssigneeUserId(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={startInstance} disabled={startMutation.isPending}>
                  {startMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Start
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="space-y-2">
          {(!instances || instances.length === 0) && <p className="text-sm text-muted-foreground">No instances started yet.</p>}
          {instances?.map((inst) => (
            <Link key={inst.id} href={`/workflow-instances/${inst.id}`}>
              <div className="flex items-center justify-between border border-border rounded-md p-3 hover-elevate cursor-pointer">
                <span className="font-mono text-sm">{inst.resourceId}</span>
                <Badge variant={inst.status === 'completed' ? 'default' : inst.status === 'cancelled' ? 'destructive' : 'secondary'}>{inst.status}</Badge>
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
