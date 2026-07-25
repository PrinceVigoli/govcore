import { useState } from 'react';
import { Link } from 'wouter';
import {
  useListNotifications,
  useCreateNotification,
  useSendNotifications,
  getListNotificationsQueryKey,
  NotificationInputChannel,
  NotificationInputPriority,
} from '@workspace/api-client-react';
import type {
  NotificationInputChannel as ChannelValue,
  NotificationInputPriority as PriorityValue,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Bell, Plus, Loader2, Send, PlayCircle, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

const CHANNELS = Object.values(NotificationInputChannel);
const PRIORITIES = Object.values(NotificationInputPriority);
const STATUSES = ['all', 'pending', 'queued', 'sent', 'failed', 'cancelled'] as const;

export default function NotificationsList() {
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('all');
  const [composeOpen, setComposeOpen] = useState(false);

  const [tenantId, setTenantId] = useState('1');
  const [eventType, setEventType] = useState('');
  const [templateCode, setTemplateCode] = useState('');
  const [channel, setChannel] = useState<ChannelValue>('in_app');
  const [priority, setPriority] = useState<PriorityValue>('normal');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [payloadText, setPayloadText] = useState('{}');
  const [userIdsText, setUserIdsText] = useState('');
  const [addressesText, setAddressesText] = useState('');

  const query = status === 'all' ? {} : { status: status as 'pending' | 'queued' | 'sent' | 'failed' | 'cancelled' };
  const { data: notifications, isLoading } = useListNotifications(query, {
    query: { queryKey: getListNotificationsQueryKey(query) },
  });

  const createMutation = useCreateNotification();
  const sendMutation = useSendNotifications();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const refresh = () => queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey(query) });

  const compose = () => {
    if (!eventType.trim()) {
      toast({ title: 'Event type is required', variant: 'destructive' });
      return;
    }
    if (!templateCode.trim() && !body.trim()) {
      toast({ title: 'Provide a template code or a message body', variant: 'destructive' });
      return;
    }

    let payload: Record<string, unknown> = {};
    if (payloadText.trim()) {
      try {
        payload = JSON.parse(payloadText);
      } catch {
        toast({ title: 'Variables must be valid JSON', variant: 'destructive' });
        return;
      }
    }

    const recipientUserIds = userIdsText
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
    const recipientAddresses = addressesText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (recipientUserIds.length === 0 && recipientAddresses.length === 0) {
      toast({ title: 'Add at least one recipient', variant: 'destructive' });
      return;
    }

    createMutation.mutate(
      {
        data: {
          tenantId: Number(tenantId) || 1,
          eventType: eventType.trim(),
          templateCode: templateCode.trim() || undefined,
          channel,
          priority,
          subject: templateCode.trim() ? undefined : subject || undefined,
          body: templateCode.trim() ? undefined : body,
          payload,
          recipientUserIds: recipientUserIds.length ? recipientUserIds : undefined,
          recipientAddresses: recipientAddresses.length ? recipientAddresses : undefined,
        },
      },
      {
        onSuccess: (result) => {
          refresh();
          setComposeOpen(false);
          const suppressed = result.suppressedUserIds?.length ?? 0;
          toast({
            title: `Queued for ${result.queued} recipient${result.queued === 1 ? '' : 's'}`,
            description: suppressed > 0 ? `${suppressed} recipient(s) have this channel turned off.` : undefined,
          });
        },
        onError: (err: unknown) => {
          const data = (err as { data?: { error?: string; missingVariables?: string[] } })?.data;
          toast({
            title: 'Could not queue notification',
            description: data?.missingVariables?.length
              ? `Missing variables: ${data.missingVariables.join(', ')}`
              : data?.error ?? (err as { message?: string })?.message,
            variant: 'destructive',
          });
        },
      },
    );
  };

  const runDelivery = () =>
    sendMutation.mutate(
      { data: {} },
      {
        onSuccess: (result) => {
          refresh();
          toast({
            title: `Processed ${result.processed} queued item${result.processed === 1 ? '' : 's'}`,
            description: `${result.sent} sent · ${result.failed} will retry · ${result.deadLettered} gave up`,
          });
        },
        onError: (err: { message?: string }) =>
          toast({ title: 'Delivery run failed', description: err.message, variant: 'destructive' }),
      },
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Messages queued from business events. Delivery runs asynchronously, with retries and a dead-letter state.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/notification-templates">
            <Button variant="outline"><Mail className="mr-2 h-4 w-4" />Templates</Button>
          </Link>
          <Button variant="outline" onClick={runDelivery} disabled={sendMutation.isPending}>
            {sendMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
            Run delivery
          </Button>
          <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" />New Notification</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Queue a notification</DialogTitle>
                <DialogDescription>
                  Send from a published template, or write a one-off message. Recipients who turned this channel off are skipped.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="eventType">Event type</Label>
                    <Input id="eventType" placeholder="PermitIssued" value={eventType} onChange={(e) => setEventType(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tenantId">Tenant ID</Label>
                    <Input id="tenantId" type="number" value={tenantId} onChange={(e) => setTenantId(e.target.value)} />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Channel</Label>
                    <Select value={channel} onValueChange={(v) => setChannel(v as ChannelValue)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CHANNELS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Priority</Label>
                    <Select value={priority} onValueChange={(v) => setPriority(v as PriorityValue)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="templateCode">Template code</Label>
                    <Input id="templateCode" placeholder="Optional" value={templateCode} onChange={(e) => setTemplateCode(e.target.value)} />
                  </div>
                </div>

                {templateCode.trim() ? (
                  <div className="space-y-2">
                    <Label htmlFor="payload">Variables (JSON)</Label>
                    <Textarea id="payload" rows={5} className="font-mono text-xs" value={payloadText} onChange={(e) => setPayloadText(e.target.value)} />
                    <p className="text-xs text-muted-foreground">Every placeholder the template uses must appear here.</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="subject">Subject</Label>
                      <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="body">Message</Label>
                      <Textarea id="body" rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
                    </div>
                  </>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="userIds">Recipient user IDs</Label>
                    <Input id="userIds" placeholder="1, 2, 3" value={userIdsText} onChange={(e) => setUserIdsText(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="addresses">Addresses</Label>
                    <Input id="addresses" placeholder="juan@example.gov.ph" value={addressesText} onChange={(e) => setAddressesText(e.target.value)} />
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button onClick={compose} disabled={createMutation.isPending}>
                  {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  Queue notification
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Select value={status} onValueChange={(v) => setStatus(v as (typeof STATUSES)[number])}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s === 'all' ? 'All statuses' : s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card border border-border rounded-md shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Notification</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                </TableCell>
              </TableRow>
            ) : notifications?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  No notifications match this filter.
                </TableCell>
              </TableRow>
            ) : (
              notifications?.map((n) => (
                <TableRow key={n.id} className="hover-elevate">
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium flex items-center">
                        <Bell className="h-4 w-4 mr-2 text-muted-foreground" />
                        {n.subject ?? `#${n.id}`}
                      </span>
                      <span className="text-xs text-muted-foreground mt-1 line-clamp-1">{n.body}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{n.eventType}</TableCell>
                  <TableCell><Badge variant="outline" className="font-normal">{n.channel}</Badge></TableCell>
                  <TableCell className="text-xs">{n.priority}</TableCell>
                  <TableCell>
                    <Badge variant={n.status === 'sent' ? 'default' : n.status === 'failed' ? 'destructive' : 'secondary'}>
                      {n.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{format(new Date(n.createdAt), 'PPp')}</TableCell>
                  <TableCell className="text-right">
                    <Link href={`/notifications/${n.id}`}>
                      <Button variant="ghost" size="sm">View</Button>
                    </Link>
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
