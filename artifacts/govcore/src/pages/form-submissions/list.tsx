import { useState } from 'react';
import { Link } from 'wouter';
import { useListFormSubmissions, getListFormSubmissionsQueryKey } from '@workspace/api-client-react';
import { format } from 'date-fns';
import { ClipboardList, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const STATUSES = ['all', 'draft', 'submitted', 'synced'] as const;

export default function FormSubmissionsList() {
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('all');
  const query = status === 'all' ? {} : { status: status as 'draft' | 'submitted' | 'synced' };

  const { data: submissions, isLoading } = useListFormSubmissions(query, {
    query: { queryKey: getListFormSubmissionsQueryKey(query) },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Submissions</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Entries captured across every form, including drafts saved offline and later synced.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Select value={status} onValueChange={(v) => setStatus(v as (typeof STATUSES)[number])}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s === 'all' ? 'All statuses' : s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card border border-border rounded-md shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Submission</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Workflow</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                </TableCell>
              </TableRow>
            ) : submissions?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No submissions match this filter.
                </TableCell>
              </TableRow>
            ) : (
              submissions?.map((s) => (
                <TableRow key={s.id} className="hover-elevate">
                  <TableCell>
                    <span className="font-medium flex items-center">
                      <ClipboardList className="h-4 w-4 mr-2 text-muted-foreground" />
                      #{s.id}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">v{s.formVersionId}</TableCell>
                  <TableCell>
                    <Badge variant={s.status === 'submitted' ? 'default' : 'secondary'}>{s.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {s.workflowInstanceId ? (
                      <Link href={`/workflow-instances/${s.workflowInstanceId}`}>
                        <span className="underline hover:text-foreground">#{s.workflowInstanceId}</span>
                      </Link>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(s.createdAt), 'PPp')}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/form-submissions/${s.id}`}>
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
