import { useState } from 'react';
import {
  useListIntegrationEndpoints,
  useCreateIntegrationEndpoint,
  useListWebhooks,
  useRegisterWebhook,
  useSetWebhookStatus,
  useListIntegrationEvents,
  usePublishIntegrationEvent,
  useListRetryQueue,
  useProcessRetryQueue,
  getListIntegrationEndpointsQueryKey,
  getListWebhooksQueryKey,
  getListIntegrationEventsQueryKey,
  getListRetryQueueQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Plug, Webhook, Radio, Repeat, Plus, Loader2, PlayCircle, Copy, Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

const QUEUE_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  delivered: 'default',
  failed: 'destructive',
  dead_letter: 'destructive',
  processing: 'outline',
};

export default function IntegrationsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: endpoints, isLoading: endpointsLoading } = useListIntegrationEndpoints({
    query: { queryKey: getListIntegrationEndpointsQueryKey() },
  });
  const { data: webhooks, isLoading: webhooksLoading } = useListWebhooks({
    query: { queryKey: getListWebhooksQueryKey() },
  });
  const { data: events } = useListIntegrationEvents({}, { query: { queryKey: getListIntegrationEventsQueryKey({}) } });
  const { data: queue } = useListRetryQueue({}, { query: { queryKey: getListRetryQueueQueryKey({}) } });

  const createEndpoint = useCreateIntegrationEndpoint();
  const registerWebhook = useRegisterWebhook();
  const setWebhookStatus = useSetWebhookStatus();
  const publishEvent = usePublishIntegrationEvent();
  const processQueue = useProcessRetryQueue();

  const [endpointOpen, setEndpointOpen] = useState(false);
  const [webhookOpen, setWebhookOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);

  // Endpoint form
  const [epName, setEpName] = useState('');
  const [epCode, setEpCode] = useState('');
  const [epBaseUrl, setEpBaseUrl] = useState('');
  const [epAuthType, setEpAuthType] = useState('none');

  // Webhook form
  const [whEventType, setWhEventType] = useState('');
  const [whTargetUrl, setWhTargetUrl] = useState('');

  // Event form
  const [evEventType, setEvEventType] = useState('');
  const [evPayload, setEvPayload] = useState('{}');

  const invalidate = (key: readonly unknown[]) => queryClient.invalidateQueries({ queryKey: key });

  const submitEndpoint = () => {
    if (!epName.trim() || !epCode.trim() || !epBaseUrl.trim()) {
      toast({ title: 'Name, code, and base URL are required', variant: 'destructive' });
      return;
    }
    createEndpoint.mutate(
      { data: { name: epName.trim(), code: epCode.trim(), baseUrl: epBaseUrl.trim(), authType: epAuthType as never } },
      {
        onSuccess: () => {
          invalidate(getListIntegrationEndpointsQueryKey());
          setEndpointOpen(false);
          setEpName(''); setEpCode(''); setEpBaseUrl('');
          toast({ title: 'Endpoint registered' });
        },
        onError: (err: unknown) => {
          const data = (err as { data?: { error?: string } })?.data;
          toast({ title: 'Could not register endpoint', description: data?.error, variant: 'destructive' });
        },
      },
    );
  };

  const submitWebhook = () => {
    if (!whEventType.trim() || !whTargetUrl.trim()) {
      toast({ title: 'Event type and target URL are required', variant: 'destructive' });
      return;
    }
    registerWebhook.mutate(
      { data: { eventType: whEventType.trim(), targetUrl: whTargetUrl.trim() } },
      {
        onSuccess: (result) => {
          invalidate(getListWebhooksQueryKey());
          setWebhookOpen(false);
          setWhEventType(''); setWhTargetUrl('');
          // The secret is returned exactly once — surface it so the operator can copy it now.
          setRevealedSecret(result.secret);
          toast({ title: 'Webhook registered' });
        },
        onError: (err: unknown) => {
          const data = (err as { data?: { error?: string } })?.data;
          toast({ title: 'Could not register webhook', description: data?.error, variant: 'destructive' });
        },
      },
    );
  };

  const submitEvent = () => {
    if (!evEventType.trim()) {
      toast({ title: 'Event type is required', variant: 'destructive' });
      return;
    }
    let payload: unknown = null;
    if (evPayload.trim()) {
      try {
        payload = JSON.parse(evPayload);
      } catch {
        toast({ title: 'Payload must be valid JSON', variant: 'destructive' });
        return;
      }
    }
    publishEvent.mutate(
      { data: { eventType: evEventType.trim(), payload } },
      {
        onSuccess: (result) => {
          invalidate(getListIntegrationEventsQueryKey({}));
          invalidate(getListRetryQueueQueryKey({}));
          setEventOpen(false);
          setEvEventType(''); setEvPayload('{}');
          toast({
            title: 'Event published',
            description: `Queued for ${result.queued} subscription${result.queued === 1 ? '' : 's'}.`,
          });
        },
        onError: (err: unknown) => {
          const data = (err as { data?: { error?: string } })?.data;
          toast({ title: 'Could not publish event', description: data?.error, variant: 'destructive' });
        },
      },
    );
  };

  const toggleWebhook = (id: number, current: string) => {
    const next = current === 'active' ? 'paused' : 'active';
    setWebhookStatus.mutate(
      { id, data: { status: next } },
      {
        onSuccess: () => {
          invalidate(getListWebhooksQueryKey());
          toast({ title: next === 'active' ? 'Webhook resumed' : 'Webhook paused' });
        },
        onError: (err: unknown) => {
          const data = (err as { data?: { error?: string } })?.data;
          toast({ title: 'Could not update webhook', description: data?.error, variant: 'destructive' });
        },
      },
    );
  };

  const runQueue = () =>
    processQueue.mutate(
      { data: {} },
      {
        onSuccess: (result) => {
          invalidate(getListRetryQueueQueryKey({}));
          toast({
            title: `Processed ${result.processed} item${result.processed === 1 ? '' : 's'}`,
            description: `${result.delivered} delivered · ${result.failed} will retry · ${result.deadLettered} gave up`,
          });
        },
        onError: (err: { message?: string }) =>
          toast({ title: 'Queue run failed', description: err.message, variant: 'destructive' }),
      },
    );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Integrations</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Register external endpoints, subscribe to internal events over signed webhooks, and watch outbound delivery.
        </p>
      </div>

      {revealedSecret && (
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle className="text-base">Signing secret</CardTitle>
            <CardDescription>Copy this now — it is shown only once and can't be retrieved later.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <code className="flex-1 rounded-md bg-muted px-3 py-2 text-xs font-mono break-all">{revealedSecret}</code>
            <Button variant="outline" size="sm" onClick={() => { void navigator.clipboard?.writeText(revealedSecret); toast({ title: 'Copied' }); }}>
              <Copy className="mr-2 h-4 w-4" />Copy
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setRevealedSecret(null)}>Dismiss</Button>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="endpoints">
        <TabsList>
          <TabsTrigger value="endpoints"><Plug className="mr-2 h-4 w-4" />Endpoints</TabsTrigger>
          <TabsTrigger value="webhooks"><Webhook className="mr-2 h-4 w-4" />Webhooks</TabsTrigger>
          <TabsTrigger value="events"><Radio className="mr-2 h-4 w-4" />Events</TabsTrigger>
          <TabsTrigger value="queue"><Repeat className="mr-2 h-4 w-4" />Retry queue</TabsTrigger>
        </TabsList>

        <TabsContent value="endpoints" className="space-y-4 mt-6">
          <div className="flex justify-end">
            <Dialog open={endpointOpen} onOpenChange={setEndpointOpen}>
              <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Register endpoint</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Register integration endpoint</DialogTitle>
                  <DialogDescription>Scaffolding for an external API client. No credentials are stored here.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2"><Label>Name</Label><Input value={epName} onChange={(e) => setEpName(e.target.value)} placeholder="LTO Vehicle Registry" /></div>
                  <div className="space-y-2"><Label>Code</Label><Input value={epCode} onChange={(e) => setEpCode(e.target.value)} placeholder="lto_vehicle_registry" /></div>
                  <div className="space-y-2"><Label>Base URL</Label><Input value={epBaseUrl} onChange={(e) => setEpBaseUrl(e.target.value)} placeholder="https://api.example.gov.ph" /></div>
                  <div className="space-y-2">
                    <Label>Auth type</Label>
                    <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={epAuthType} onChange={(e) => setEpAuthType(e.target.value)}>
                      <option value="none">none</option>
                      <option value="api_key">api_key</option>
                      <option value="bearer">bearer</option>
                      <option value="basic">basic</option>
                    </select>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={submitEndpoint} disabled={createEndpoint.isPending}>
                    {createEndpoint.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Register
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <div className="bg-card border border-border rounded-md overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow><TableHead>Name</TableHead><TableHead>Code</TableHead><TableHead>Base URL</TableHead><TableHead>Auth</TableHead><TableHead>Status</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {endpointsLoading ? (
                  <TableRow><TableCell colSpan={5} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></TableCell></TableRow>
                ) : endpoints?.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No endpoints registered.</TableCell></TableRow>
                ) : endpoints?.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{e.code}</TableCell>
                    <TableCell className="font-mono text-xs">{e.baseUrl}</TableCell>
                    <TableCell><Badge variant="outline" className="font-normal">{e.authType}</Badge></TableCell>
                    <TableCell><Badge variant={e.status === 'active' ? 'default' : 'secondary'}>{e.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="webhooks" className="space-y-4 mt-6">
          <div className="flex justify-end">
            <Dialog open={webhookOpen} onOpenChange={setWebhookOpen}>
              <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Register webhook</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Register webhook subscription</DialogTitle>
                  <DialogDescription>Deliveries are signed with HMAC-SHA256. Use "*" to match all events.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2"><Label>Event type</Label><Input value={whEventType} onChange={(e) => setWhEventType(e.target.value)} placeholder="document.signed" /></div>
                  <div className="space-y-2"><Label>Target URL</Label><Input value={whTargetUrl} onChange={(e) => setWhTargetUrl(e.target.value)} placeholder="https://receiver.example.com/hooks" /></div>
                </div>
                <DialogFooter>
                  <Button onClick={submitWebhook} disabled={registerWebhook.isPending}>
                    {registerWebhook.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Register
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <div className="bg-card border border-border rounded-md overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow><TableHead>Event type</TableHead><TableHead>Target URL</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {webhooksLoading ? (
                  <TableRow><TableCell colSpan={4} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></TableCell></TableRow>
                ) : webhooks?.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">No webhook subscriptions.</TableCell></TableRow>
                ) : webhooks?.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="font-mono text-xs">{w.eventType}</TableCell>
                    <TableCell className="font-mono text-xs truncate max-w-xs">{w.targetUrl}</TableCell>
                    <TableCell><Badge variant={w.status === 'active' ? 'default' : 'secondary'}>{w.status}</Badge></TableCell>
                    <TableCell className="text-right">
                      {w.status !== 'disabled' && (
                        <Button variant="ghost" size="sm" onClick={() => toggleWebhook(w.id, w.status)} disabled={setWebhookStatus.isPending}>
                          {w.status === 'active' ? <><Pause className="mr-2 h-4 w-4" />Pause</> : <><Play className="mr-2 h-4 w-4" />Resume</>}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="events" className="space-y-4 mt-6">
          <div className="flex justify-end">
            <Dialog open={eventOpen} onOpenChange={setEventOpen}>
              <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Publish event</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Publish an event</DialogTitle>
                  <DialogDescription>Fans out to every active webhook subscription matching this type (or "*").</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2"><Label>Event type</Label><Input value={evEventType} onChange={(e) => setEvEventType(e.target.value)} placeholder="document.signed" /></div>
                  <div className="space-y-2"><Label>Payload (JSON)</Label><Textarea rows={5} className="font-mono text-xs" value={evPayload} onChange={(e) => setEvPayload(e.target.value)} /></div>
                </div>
                <DialogFooter>
                  <Button onClick={submitEvent} disabled={publishEvent.isPending}>
                    {publishEvent.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Publish
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <div className="bg-card border border-border rounded-md overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow><TableHead>Event type</TableHead><TableHead>Source</TableHead><TableHead>Published</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {!events || events.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="h-24 text-center text-muted-foreground">No events published yet.</TableCell></TableRow>
                ) : events.map((ev) => (
                  <TableRow key={ev.id}>
                    <TableCell className="font-mono text-xs">{ev.eventType}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{ev.sourceModule ?? '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{format(new Date(ev.createdAt), 'PPp')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="queue" className="space-y-4 mt-6">
          <div className="flex justify-end">
            <Button variant="outline" onClick={runQueue} disabled={processQueue.isPending}>
              {processQueue.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
              Run delivery
            </Button>
          </div>
          <div className="bg-card border border-border rounded-md overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow><TableHead>Job</TableHead><TableHead>Status</TableHead><TableHead>Attempts</TableHead><TableHead>Next attempt</TableHead><TableHead>Last error</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {!queue || queue.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">The retry queue is empty.</TableCell></TableRow>
                ) : queue.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-xs">{item.jobType} #{item.id}</TableCell>
                    <TableCell><Badge variant={QUEUE_VARIANT[item.status] ?? 'secondary'}>{item.status}</Badge></TableCell>
                    <TableCell className="text-xs">{item.attempts} / {item.maxAttempts}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {item.status === 'failed' || item.status === 'pending' ? format(new Date(item.availableAt), 'PPp') : '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-xs truncate">{item.lastError ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
