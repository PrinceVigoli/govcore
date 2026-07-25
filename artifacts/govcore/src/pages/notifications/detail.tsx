import { useRoute, Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetNotification,
  useCancelNotification,
  getGetNotificationQueryKey,
  getListNotificationsQueryKey,
} from '@workspace/api-client-react';
import { format } from 'date-fns';
import { ArrowLeft, Bell, Loader2, Ban, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';

const QUEUE_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  sent: 'default',
  dead_letter: 'destructive',
  failed: 'destructive',
  cancelled: 'outline',
};

export default function NotificationDetail() {
  const [, params] = useRoute('/notifications/:id');
  const id = Number(params?.id);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: notification, isLoading } = useGetNotification(id, {
    query: { enabled: !!id, queryKey: getGetNotificationQueryKey(id) },
  });

  const cancelMutation = useCancelNotification();

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (!notification) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">Notification not found.</p>
        <Link href="/notifications"><Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" />Back to notifications</Button></Link>
      </div>
    );
  }

  const cancellable = notification.queueItems.some((q) => q.status === 'pending' || q.status === 'failed');
  const deadLettered = notification.queueItems.filter((q) => q.status === 'dead_letter');

  const cancel = () =>
    cancelMutation.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetNotificationQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey({}) });
          toast({ title: 'Cancelled', description: 'Messages already sent are unaffected.' });
        },
        onError: (err: { message?: string }) =>
          toast({ title: 'Could not cancel', description: err.message, variant: 'destructive' }),
      },
    );

  return (
    <div className="space-y-6">
      <div>
        <Link href="/notifications">
          <Button variant="ghost" size="sm" className="mb-3 -ml-2"><ArrowLeft className="mr-2 h-4 w-4" />Notifications</Button>
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center">
              <Bell className="h-6 w-6 mr-2 text-muted-foreground" />
              {notification.subject ?? `Notification #${notification.id}`}
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <Badge variant={notification.status === 'sent' ? 'default' : notification.status === 'failed' ? 'destructive' : 'secondary'}>
                {notification.status}
              </Badge>
              <Badge variant="outline">{notification.channel}</Badge>
              <span className="font-mono text-xs text-muted-foreground">{notification.eventType}</span>
              <span className="text-xs text-muted-foreground">{notification.priority} priority</span>
              <span className="text-xs text-muted-foreground">created {format(new Date(notification.createdAt), 'PPp')}</span>
            </div>
          </div>
          {cancellable && (
            <Button variant="outline" onClick={cancel} disabled={cancelMutation.isPending}>
              {cancelMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ban className="mr-2 h-4 w-4" />}
              Cancel undelivered
            </Button>
          )}
        </div>
      </div>

      {deadLettered.length > 0 && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base flex items-center">
              <AlertTriangle className="h-4 w-4 mr-2 text-destructive" />
              {deadLettered.length} recipient{deadLettered.length === 1 ? '' : 's'} gave up after retrying
            </CardTitle>
            <CardDescription>{deadLettered[0].lastError}</CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Message</CardTitle>
          {notification.resourceType && (
            <CardDescription>
              Triggered by <span className="font-mono">{notification.resourceType}</span>
              {notification.resourceId && <> #{notification.resourceId}</>}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-border bg-muted/20 p-4 space-y-2">
            {notification.subject && <p className="text-sm font-medium border-b border-border pb-2">{notification.subject}</p>}
            <p className="text-sm whitespace-pre-wrap">{notification.body}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recipients</CardTitle>
          <CardDescription>One queue entry per recipient, with its own retry count.</CardDescription>
        </CardHeader>
        <CardContent>
          {notification.queueItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">No queue entries.</p>
          ) : (
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Next attempt</TableHead>
                  <TableHead>Last error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {notification.queueItems.map((q) => (
                  <TableRow key={q.id}>
                    <TableCell className="font-mono text-xs">{q.recipientAddress}</TableCell>
                    <TableCell><Badge variant={QUEUE_VARIANT[q.status] ?? 'secondary'}>{q.status}</Badge></TableCell>
                    <TableCell className="text-xs">{q.attempts} / {q.maxAttempts}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {q.status === 'failed' ? format(new Date(q.availableAt), 'PPp') : '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-xs truncate">{q.lastError ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Delivery trail</CardTitle>
          <CardDescription>Append-only. Every attempt leaves a record, newest first.</CardDescription>
        </CardHeader>
        <CardContent>
          {notification.deliveries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No delivery events yet.</p>
          ) : (
            <div className="space-y-2">
              {notification.deliveries.map((d) => (
                <div key={d.id} className="flex items-start justify-between gap-4 rounded-md border border-border p-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={d.eventType === 'failed' ? 'destructive' : d.eventType === 'sent' ? 'default' : 'secondary'}>
                        {d.eventType}
                      </Badge>
                      <span className="font-mono text-xs text-muted-foreground">{d.recipientAddress}</span>
                      {d.attempt > 0 && <span className="text-xs text-muted-foreground">attempt {d.attempt}</span>}
                    </div>
                    {d.providerResponse && (
                      <p className="text-xs text-muted-foreground font-mono mt-1 break-all line-clamp-2">{d.providerResponse}</p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{format(new Date(d.createdAt), 'PPp')}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
