import { useRoute, Link } from 'wouter';
import {
  useGetWorkflowInstance,
  useGetWorkflowVersion,
  getGetWorkflowInstanceQueryKey,
  getGetWorkflowVersionQueryKey,
} from '@workspace/api-client-react';
import { format } from 'date-fns';
import { ArrowLeft, Workflow, Loader2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TaskActionButtons } from '@/components/workflow/TaskActionButtons';

export default function WorkflowInstanceDetail() {
  const [, params] = useRoute('/workflow-instances/:id');
  const id = Number(params?.id);

  const { data: instance, isLoading } = useGetWorkflowInstance(id, {
    query: { enabled: !!id, queryKey: getGetWorkflowInstanceQueryKey(id) },
  });
  const { data: version } = useGetWorkflowVersion(instance?.workflowVersionId ?? 0, {
    query: { enabled: !!instance, queryKey: getGetWorkflowVersionQueryKey(instance?.workflowVersionId ?? 0) },
  });

  const stateName = (stateId: number | null | undefined) => {
    if (stateId == null) return '—';
    return version?.states.find((s) => s.id === stateId)?.name ?? `#${stateId}`;
  };

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!instance) return <div className="p-8 text-center text-muted-foreground">Workflow instance not found</div>;

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
            <Workflow className="mr-2 h-6 w-6 text-primary" />
            {instance.resourceType} · {instance.resourceId}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Current state: <span className="font-medium text-foreground">{instance.currentState.name}</span>
            <Badge variant={instance.status === 'completed' ? 'default' : instance.status === 'cancelled' ? 'destructive' : 'secondary'} className="ml-2">
              {instance.status}
            </Badge>
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tasks</CardTitle>
          <CardDescription>Pending and resolved actions for this instance.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {instance.tasks.length === 0 && <p className="text-sm text-muted-foreground">No tasks yet.</p>}
          {instance.tasks.map((task) => (
            <div key={task.id} className="flex items-center justify-between border border-border rounded-md p-3">
              <div className="text-sm">
                <div className="font-medium">{stateName(task.stateId)}</div>
                <div className="text-xs text-muted-foreground">
                  {task.assigneeUserId ? `Assigned to user #${task.assigneeUserId}` : task.assigneeRoleId ? `Assigned to role #${task.assigneeRoleId}` : 'Unassigned'}
                  {' · '}
                  {format(new Date(task.createdAt), 'MMM d, yyyy p')}
                </div>
                {task.comment && <div className="text-xs text-muted-foreground mt-1 italic">"{task.comment}"</div>}
              </div>
              <TaskActionButtons task={task} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
          <CardDescription>Immutable audit trail of every transition this instance has taken.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {instance.history.map((entry) => (
              <div key={entry.id} className="flex gap-3">
                <div className="mt-0.5">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="text-sm">
                  <div>
                    <span className="font-medium capitalize">{entry.action}</span>
                    {' — '}
                    {stateName(entry.fromStateId)} → {stateName(entry.toStateId)}
                    {entry.actorUserId && <span className="text-muted-foreground"> by user #{entry.actorUserId}</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">{format(new Date(entry.createdAt), 'MMM d, yyyy p')}</div>
                  {entry.comment && <div className="text-xs text-muted-foreground mt-1 italic">"{entry.comment}"</div>}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
