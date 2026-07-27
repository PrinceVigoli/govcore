import { useState } from 'react';
import {
  useListSyncNodes,
  useListSyncConflicts,
  useListSyncEntities,
  useRegisterSyncNode,
  useRegisterSyncEntity,
  useUpdateSyncEntity,
  useResolveSyncConflict,
  getListSyncNodesQueryKey,
  getListSyncConflictsQueryKey,
  getListSyncEntitiesQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { RefreshCw, Plus, Loader2, AlertTriangle, CheckCircle2, Server, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

const POLICIES = [
  { value: 'manual', label: 'Manual — escalate to a person' },
  { value: 'last_write_wins', label: 'Last write wins' },
  { value: 'server_wins', label: 'Server wins' },
  { value: 'node_wins', label: 'Node wins' },
];

const POLICY_LABEL: Record<string, string> = {
  manual: 'manual',
  last_write_wins: 'last write wins',
  server_wins: 'server wins',
  node_wins: 'node wins',
};

export default function SyncPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: nodes, isLoading: nodesLoading } = useListSyncNodes({ query: { queryKey: getListSyncNodesQueryKey() } });
  const { data: conflicts } = useListSyncConflicts(undefined, { query: { queryKey: getListSyncConflictsQueryKey() } });
  const { data: entities } = useListSyncEntities({ query: { queryKey: getListSyncEntitiesQueryKey() } });

  const registerNode = useRegisterSyncNode();
  const registerEntity = useRegisterSyncEntity();
  const updateEntity = useUpdateSyncEntity();
  const resolveConflict = useResolveSyncConflict();

  const [nodeOpen, setNodeOpen] = useState(false);
  const [nodeKey, setNodeKey] = useState('');
  const [nodeName, setNodeName] = useState('');
  const [nodeLocation, setNodeLocation] = useState('');

  const [entityOpen, setEntityOpen] = useState(false);
  const [entityType, setEntityType] = useState('');
  const [entityPolicy, setEntityPolicy] = useState('manual');

  const pending = conflicts?.filter((c) => c.status === 'pending') ?? [];

  const addNode = () => {
    if (!nodeKey.trim() || !nodeName.trim()) {
      toast({ title: 'Node key and name are required', variant: 'destructive' });
      return;
    }
    registerNode.mutate(
      { data: { nodeKey: nodeKey.trim(), name: nodeName.trim(), location: nodeLocation.trim() || undefined } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSyncNodesQueryKey() });
          setNodeOpen(false);
          setNodeKey(''); setNodeName(''); setNodeLocation('');
          toast({ title: 'Node registered' });
        },
        onError: (err: unknown) => {
          const data = (err as { data?: { error?: string } })?.data;
          toast({ title: 'Could not register node', description: data?.error, variant: 'destructive' });
        },
      },
    );
  };

  const addEntity = () => {
    if (!entityType.trim()) {
      toast({ title: 'Entity type is required', variant: 'destructive' });
      return;
    }
    registerEntity.mutate(
      { data: { entityType: entityType.trim(), conflictPolicy: entityPolicy as never } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSyncEntitiesQueryKey() });
          setEntityOpen(false);
          setEntityType(''); setEntityPolicy('manual');
          toast({ title: 'Entity registered for sync' });
        },
        onError: (err: unknown) => {
          const data = (err as { data?: { error?: string } })?.data;
          toast({ title: 'Could not register entity', description: data?.error, variant: 'destructive' });
        },
      },
    );
  };

  const changePolicy = (id: number, policy: string) =>
    updateEntity.mutate(
      { id, data: { conflictPolicy: policy as never } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSyncEntitiesQueryKey() });
          toast({ title: 'Conflict policy updated' });
        },
        onError: (err: unknown) => {
          const data = (err as { data?: { error?: string } })?.data;
          toast({ title: 'Could not update policy', description: data?.error, variant: 'destructive' });
        },
      },
    );

  const settle = (id: number, choice: 'server' | 'node') =>
    resolveConflict.mutate(
      { id, data: { choice } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSyncConflictsQueryKey() });
          toast({ title: `Resolved — kept the ${choice} version` });
        },
        onError: (err: unknown) => {
          const data = (err as { data?: { error?: string } })?.data;
          toast({ title: 'Could not resolve', description: data?.error, variant: 'destructive' });
        },
      },
    );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Synchronization</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Local nodes work offline and reconcile when connectivity returns. How a divergence is settled is configured per entity type.
        </p>
      </div>

      {pending.length > 0 && (
        <Card className="border-destructive/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center">
              <AlertTriangle className="h-4 w-4 mr-2 text-destructive" />
              {pending.length} conflict{pending.length === 1 ? '' : 's'} need a decision
            </CardTitle>
            <CardDescription>
              These entity types use the manual policy, so nothing was discarded automatically — pick which version to keep.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Tabs defaultValue="nodes">
        <TabsList>
          <TabsTrigger value="nodes">Nodes</TabsTrigger>
          <TabsTrigger value="conflicts">Conflicts{pending.length > 0 ? ` (${pending.length})` : ''}</TabsTrigger>
          <TabsTrigger value="entities">Policies</TabsTrigger>
        </TabsList>

        <TabsContent value="nodes" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <Dialog open={nodeOpen} onOpenChange={setNodeOpen}>
              <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Register node</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Register a GovCore Node</DialogTitle>
                  <DialogDescription>A local instance that syncs when it has connectivity.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2"><Label>Node key</Label><Input className="font-mono" placeholder="pudtol-hall-01" value={nodeKey} onChange={(e) => setNodeKey(e.target.value)} /></div>
                  <div className="space-y-2"><Label>Name</Label><Input placeholder="Pudtol Municipal Hall" value={nodeName} onChange={(e) => setNodeName(e.target.value)} /></div>
                  <div className="space-y-2"><Label>Location</Label><Input placeholder="Pudtol, Apayao" value={nodeLocation} onChange={(e) => setNodeLocation(e.target.value)} /></div>
                </div>
                <DialogFooter>
                  <Button onClick={addNode} disabled={registerNode.isPending}>
                    {registerNode.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Register
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="bg-card border border-border rounded-md shadow-sm overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Node</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sync state</TableHead>
                  <TableHead>Last pulled</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {nodesLoading ? (
                  <TableRow><TableCell colSpan={5} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></TableCell></TableRow>
                ) : !nodes || nodes.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No nodes registered yet.</TableCell></TableRow>
                ) : (
                  nodes.map((n) => (
                    <TableRow key={n.id} className="hover-elevate">
                      <TableCell>
                        <span className="font-medium flex items-center"><Server className="h-4 w-4 mr-2 text-muted-foreground" />{n.name}</span>
                        {n.location && <span className="text-xs text-muted-foreground ml-6">{n.location}</span>}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{n.nodeKey}</TableCell>
                      <TableCell><Badge variant={n.status === 'active' ? 'default' : 'secondary'}>{n.status}</Badge></TableCell>
                      <TableCell>
                        {n.upToDate ? (
                          <span className="text-xs flex items-center text-muted-foreground"><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />up to date</span>
                        ) : (
                          <span className="text-xs flex items-center"><Radio className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />{n.behind} change{n.behind === 1 ? '' : 's'} behind</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {n.lastPulledAt ? `${formatDistanceToNow(new Date(n.lastPulledAt))} ago` : 'never'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="conflicts" className="space-y-3 mt-4">
          {!conflicts || conflicts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No conflicts recorded.</p>
          ) : (
            conflicts.map((c) => (
              <Card key={c.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="text-base">
                        {c.entityType} · <span className="font-mono text-sm">{c.entityKey}</span>
                      </CardTitle>
                      <CardDescription className="mt-1">
                        Node revision {c.nodeRevision ?? '—'} vs server revision {c.serverRevision ?? '—'} (diverged from {c.baseRevision ?? '—'}) · policy: {POLICY_LABEL[c.policy] ?? c.policy}
                      </CardDescription>
                    </div>
                    {c.status === 'pending' ? (
                      <Badge variant="destructive">pending</Badge>
                    ) : (
                      <Badge variant="secondary">kept {c.resolvedWith}</Badge>
                    )}
                  </div>
                </CardHeader>
                {c.status === 'pending' && (
                  <CardContent className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => settle(c.id, 'server')} disabled={resolveConflict.isPending}>
                      Keep server version
                    </Button>
                    <Button size="sm" onClick={() => settle(c.id, 'node')} disabled={resolveConflict.isPending}>
                      Keep node version
                    </Button>
                  </CardContent>
                )}
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="entities" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <Dialog open={entityOpen} onOpenChange={setEntityOpen}>
              <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Register entity</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Register an entity for sync</DialogTitle>
                  <DialogDescription>
                    Choose how divergences settle. Manual is safest for records where a lost edit matters.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2"><Label>Entity type</Label><Input className="font-mono" placeholder="form_submission" value={entityType} onChange={(e) => setEntityType(e.target.value)} /></div>
                  <div className="space-y-2">
                    <Label>Conflict policy</Label>
                    <Select value={entityPolicy} onValueChange={setEntityPolicy}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{POLICIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={addEntity} disabled={registerEntity.isPending}>
                    {registerEntity.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Register
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="bg-card border border-border rounded-md shadow-sm overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Entity type</TableHead>
                  <TableHead>Conflict policy</TableHead>
                  <TableHead>Enabled</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!entities || entities.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="h-24 text-center text-muted-foreground">No entities registered for sync.</TableCell></TableRow>
                ) : (
                  entities.map((e) => (
                    <TableRow key={e.id} className="hover-elevate">
                      <TableCell className="font-mono text-sm">{e.entityType}</TableCell>
                      <TableCell>
                        <Select value={e.conflictPolicy} onValueChange={(v) => changePolicy(e.id, v)}>
                          <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
                          <SelectContent>{POLICIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell><Badge variant={e.enabled ? 'default' : 'secondary'}>{e.enabled ? 'enabled' : 'disabled'}</Badge></TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
