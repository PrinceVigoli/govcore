import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useApproveWorkflowTask,
  useRejectWorkflowTask,
  getListWorkflowTasksQueryKey,
  getGetWorkflowInstanceQueryKey,
  getListWorkflowHistoryQueryKey,
  type WorkflowTask,
} from '@workspace/api-client-react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

export function TaskActionButtons({ task, onDone }: { task: WorkflowTask; onDone?: () => void }) {
  const [mode, setMode] = useState<'approve' | 'reject' | null>(null);
  const [comment, setComment] = useState('');
  const approveMutation = useApproveWorkflowTask();
  const rejectMutation = useRejectWorkflowTask();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  if (task.status !== 'pending') {
    return <Badge variant={task.status === 'approved' ? 'default' : 'secondary'}>{task.status}</Badge>;
  }

  const isPending = approveMutation.isPending || rejectMutation.isPending;

  const submit = () => {
    const mutation = mode === 'approve' ? approveMutation : rejectMutation;
    mutation.mutate(
      { id: task.id, data: { comment: comment.trim() || undefined } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListWorkflowTasksQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetWorkflowInstanceQueryKey(task.workflowInstanceId) });
          queryClient.invalidateQueries({ queryKey: getListWorkflowHistoryQueryKey(task.workflowInstanceId) });
          setMode(null);
          setComment('');
          toast({ title: mode === 'approve' ? 'Task approved' : 'Task rejected' });
          onDone?.();
        },
        onError: (err) => toast({ title: 'Action failed', description: err.message, variant: 'destructive' }),
      }
    );
  };

  return (
    <>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => setMode('approve')}>Approve</Button>
        <Button size="sm" variant="destructive" onClick={() => setMode('reject')}>Reject</Button>
      </div>
      <Dialog open={mode !== null} onOpenChange={(open) => !open && setMode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{mode === 'approve' ? 'Approve' : 'Reject'} Task</DialogTitle>
            <DialogDescription>This is recorded permanently in the workflow's immutable history.</DialogDescription>
          </DialogHeader>
          <Textarea placeholder="Comment (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
          <DialogFooter>
            <Button onClick={submit} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm {mode === 'approve' ? 'Approval' : 'Rejection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
