import { useRoute, Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetFormSubmission,
  useGetFormVersion,
  useSyncFormSubmission,
  getGetFormSubmissionQueryKey,
  getGetFormVersionQueryKey,
  getListFormSubmissionsQueryKey,
} from '@workspace/api-client-react';
import { format } from 'date-fns';
import { ArrowLeft, Loader2, CloudUpload, GitBranch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { parseOptions, type FieldNode } from '@/components/forms/FieldRenderer';

/** Renders a stored answer readably: options resolve to their label, structured values print compactly. */
function displayValue(field: FieldNode | undefined, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';

  if (field && ['select', 'radio', 'multi_select'].includes(field.fieldType)) {
    const options = parseOptions(field.options);
    const label = (v: unknown) => options.find((o) => o.value === String(v))?.label ?? String(v);
    return Array.isArray(value) ? value.map(label).join(', ') || '—' : label(value);
  }

  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? value.map(String).join(', ') : '—';
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.lat === 'number' && typeof obj.lng === 'number') {
      return `${Number(obj.lat).toFixed(5)}, ${Number(obj.lng).toFixed(5)}`;
    }
    return JSON.stringify(value);
  }
  return String(value);
}

export default function FormSubmissionDetail() {
  const [, params] = useRoute('/form-submissions/:id');
  const id = Number(params?.id);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: submission, isLoading } = useGetFormSubmission(id, {
    query: { enabled: !!id, queryKey: getGetFormSubmissionQueryKey(id) },
  });

  const { data: version } = useGetFormVersion(submission?.formVersionId ?? 0, {
    query: {
      enabled: !!submission?.formVersionId,
      queryKey: getGetFormVersionQueryKey(submission?.formVersionId ?? 0),
    },
  });

  const syncMutation = useSyncFormSubmission();

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  if (!submission) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">Submission not found.</p>
        <Link href="/form-submissions"><Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" />Back to submissions</Button></Link>
      </div>
    );
  }

  const fieldByKey = new Map<string, FieldNode>(
    (version?.sections.flatMap((s) => s.fields ?? []) ?? []).map((f) => [f.fieldKey, f]),
  );

  const sync = () =>
    syncMutation.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetFormSubmissionQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListFormSubmissionsQueryKey({}) });
          toast({ title: 'Marked as synced' });
        },
        onError: (err: { message?: string }) =>
          toast({ title: 'Could not sync', description: err.message, variant: 'destructive' }),
      },
    );

  return (
    <div className="space-y-6">
      <div>
        <Link href="/form-submissions">
          <Button variant="ghost" size="sm" className="mb-3 -ml-2">
            <ArrowLeft className="mr-2 h-4 w-4" />Submissions
          </Button>
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Submission #{submission.id}</h1>
            <div className="flex flex-wrap items-center gap-3 mt-2">
              <Badge variant={submission.status === 'submitted' ? 'default' : 'secondary'}>{submission.status}</Badge>
              <span className="text-xs text-muted-foreground">
                created {format(new Date(submission.createdAt), 'PPp')}
              </span>
              {submission.submittedAt && (
                <span className="text-xs text-muted-foreground">
                  submitted {format(new Date(submission.submittedAt), 'PPp')}
                </span>
              )}
              {submission.syncedAt && (
                <span className="text-xs text-muted-foreground">
                  synced {format(new Date(submission.syncedAt), 'PPp')}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {submission.workflowInstanceId && (
              <Link href={`/workflow-instances/${submission.workflowInstanceId}`}>
                <Button variant="outline">
                  <GitBranch className="mr-2 h-4 w-4" />Workflow #{submission.workflowInstanceId}
                </Button>
              </Link>
            )}
            {submission.status === 'draft' && (
              <Button onClick={sync} disabled={syncMutation.isPending}>
                {syncMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CloudUpload className="mr-2 h-4 w-4" />}
                Mark synced
              </Button>
            )}
          </div>
        </div>
      </div>

      {version ? (
        version.sections.map((section) => {
          const fields = [...(section.fields ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
          return (
            <Card key={section.id}>
              <CardHeader>
                <CardTitle className="text-base">{section.title}</CardTitle>
                {section.description && <CardDescription>{section.description}</CardDescription>}
              </CardHeader>
              <CardContent>
                <dl className="grid gap-4 md:grid-cols-2">
                  {fields.map((field) => (
                    <div key={field.id}>
                      <dt className="text-xs text-muted-foreground">{field.label}</dt>
                      <dd className="text-sm mt-0.5 break-words">
                        {displayValue(field, submission.values[field.fieldKey])}
                      </dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          );
        })
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Values</CardTitle>
            <CardDescription>Shown as stored, since this version's layout is unavailable.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 md:grid-cols-2">
              {Object.entries(submission.values).map(([key, value]) => (
                <div key={key}>
                  <dt className="text-xs text-muted-foreground font-mono">{key}</dt>
                  <dd className="text-sm mt-0.5 break-words">{displayValue(fieldByKey.get(key), value)}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
