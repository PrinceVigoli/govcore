import { useEffect, useState } from 'react';
import { useRoute, Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetForm,
  useGetFormVersion,
  useCreateFormSubmission,
  getGetFormQueryKey,
  getGetFormVersionQueryKey,
  getListFormSubmissionsQueryKey,
} from '@workspace/api-client-react';
import { ArrowLeft, Loader2, Send, Save, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { FormRenderer } from '@/components/forms/FormRenderer';
import { buildInitialValues } from '@/components/forms/FieldRenderer';

interface ServerValidationError {
  fieldKey: string;
  validationType: string;
  message: string;
}

export default function FormFill() {
  const [, params] = useRoute('/forms/:id/fill');
  const id = Number(params?.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [values, setValues] = useState<Record<string, unknown>>({});
  const [seeded, setSeeded] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: form, isLoading: formLoading } = useGetForm(id, {
    query: { enabled: !!id, queryKey: getGetFormQueryKey(id) },
  });

  const activeVersion = form?.versions.find((v) => v.status === 'active');

  const { data: version, isLoading: versionLoading } = useGetFormVersion(activeVersion?.id ?? 0, {
    query: { enabled: !!activeVersion, queryKey: getGetFormVersionQueryKey(activeVersion?.id ?? 0) },
  });

  // Seed defaults once the version's tree arrives, without clobbering
  // anything the citizen has already typed.
  useEffect(() => {
    if (version && !seeded) {
      setValues(buildInitialValues(version.sections.flatMap((s) => s.fields ?? [])));
      setSeeded(true);
    }
  }, [version, seeded]);

  const createSubmission = useCreateFormSubmission();

  const submit = (status: 'draft' | 'submitted') => {
    if (!activeVersion) return;
    setErrors({});
    createSubmission.mutate(
      { data: { formVersionId: activeVersion.id, status, values } },
      {
        onSuccess: (result) => {
          queryClient.invalidateQueries({ queryKey: getListFormSubmissionsQueryKey({}) });
          toast({
            title: status === 'draft' ? 'Draft saved' : 'Submitted',
            description:
              status === 'submitted' && result.workflowInstanceId
                ? `Workflow instance #${result.workflowInstanceId} started.`
                : undefined,
          });
          setLocation(`/form-submissions/${result.id}`);
        },
        onError: async (err: unknown) => {
          // The engine returns field-level errors (Book 07 §7); surface them
          // inline on the offending fields rather than as one opaque toast.
          const payload = (err as { data?: { errors?: ServerValidationError[]; error?: string } })?.data;
          if (payload?.errors?.length) {
            const mapped: Record<string, string> = {};
            for (const e of payload.errors) mapped[e.fieldKey] = e.message;
            setErrors(mapped);
            toast({
              title: 'Please correct the highlighted fields',
              description: `${payload.errors.length} field(s) need attention.`,
              variant: 'destructive',
            });
            return;
          }
          toast({
            title: 'Could not submit',
            description: payload?.error ?? (err as { message?: string })?.message,
            variant: 'destructive',
          });
        },
      },
    );
  };

  if (formLoading || versionLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  if (!form) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">Form not found.</p>
        <Link href="/forms"><Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" />Back to forms</Button></Link>
      </div>
    );
  }

  if (!activeVersion || !version) {
    return (
      <div className="space-y-4">
        <Link href={`/forms/${id}`}>
          <Button variant="ghost" size="sm" className="-ml-2"><ArrowLeft className="mr-2 h-4 w-4" />{form.name}</Button>
        </Link>
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>No active version</AlertTitle>
          <AlertDescription>
            This form has no published version yet. Build a version and publish it before collecting entries.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const errorCount = Object.keys(errors).length;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/forms/${id}`}>
          <Button variant="ghost" size="sm" className="mb-3 -ml-2">
            <ArrowLeft className="mr-2 h-4 w-4" />{form.name}
          </Button>
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{form.name}</h1>
          <Badge variant="secondary">v{activeVersion.version}</Badge>
          <span className="text-xs text-muted-foreground font-mono">{activeVersion.locale}</span>
        </div>
        {form.description && <p className="text-sm text-muted-foreground mt-1">{form.description}</p>}
      </div>

      {errorCount > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{errorCount} field{errorCount === 1 ? '' : 's'} need attention</AlertTitle>
          <AlertDescription>Correct the highlighted fields below, then submit again.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Entry</CardTitle>
          <CardDescription>
            Calculated fields and conditional rules are applied by the server on submit.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormRenderer
            sections={version.sections}
            values={values}
            errors={errors}
            disabled={createSubmission.isPending}
            onChange={(key, value) => {
              setValues((prev) => ({ ...prev, [key]: value }));
              setErrors((prev) => {
                if (!prev[key]) return prev;
                const next = { ...prev };
                delete next[key];
                return next;
              });
            }}
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => submit('submitted')} disabled={createSubmission.isPending}>
          {createSubmission.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          Submit
        </Button>
        <Button variant="outline" onClick={() => submit('draft')} disabled={createSubmission.isPending}>
          <Save className="mr-2 h-4 w-4" />Save draft
        </Button>
        <p className="text-xs text-muted-foreground">A draft skips validation so you can finish it later.</p>
      </div>
    </div>
  );
}
