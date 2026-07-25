import { Link } from 'wouter';
import { useGetMe, useListWorkflowTasks, getGetMeQueryKey, getListWorkflowTasksQueryKey } from '@workspace/api-client-react';
import { format } from 'date-fns';
import { ListChecks, Loader2, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TaskActionButtons } from '@/components/workflow/TaskActionButtons';

export default function WorkflowTasksInbox() {
  const { data: me } = useGetMe({ query: { retry: false, queryKey: getGetMeQueryKey() } });

  const { data: tasks, isLoading } = useListWorkflowTasks(
    { assigneeUserId: me?.id, status: 'pending' },
    { query: { enabled: !!me, queryKey: getListWorkflowTasksQueryKey({ assigneeUserId: me?.id, status: 'pending' }) } }
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center">
          <ListChecks className="mr-2 h-6 w-6 text-primary" />
          My Tasks
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Pending approvals assigned to you.</p>
      </div>

      <div className="bg-card border border-border rounded-md shadow-sm divide-y divide-border">
        {isLoading ? (
          <div className="h-24 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : tasks?.length === 0 ? (
          <div className="h-24 flex items-center justify-center text-muted-foreground text-sm">
            No pending tasks. You're all caught up.
          </div>
        ) : (
          tasks?.map((task) => (
            <div key={task.id} className="flex items-center justify-between p-4">
              <div>
                <div className="text-sm font-medium">Workflow instance #{task.workflowInstanceId}</div>
                <div className="text-xs text-muted-foreground">
                  Assigned {format(new Date(task.createdAt), 'MMM d, yyyy p')}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Link href={`/workflow-instances/${task.workflowInstanceId}`}>
                  <Button variant="ghost" size="sm">
                    View instance <ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </Link>
                <TaskActionButtons task={task} />
              </div>
            </div>
          ))
        )}
      </div>

      {me && (
        <p className="text-xs text-muted-foreground">
          Showing tasks assigned to <Badge variant="secondary" className="font-mono">user #{me.id}</Badge>
        </p>
      )}
    </div>
  );
}
