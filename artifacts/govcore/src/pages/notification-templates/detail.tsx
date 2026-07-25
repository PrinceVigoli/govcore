import { useState } from 'react';
import { useRoute, Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetNotificationTemplate,
  useUpdateNotificationTemplate,
  usePublishNotificationTemplate,
  usePreviewNotificationTemplate,
  getGetNotificationTemplateQueryKey,
  getListNotificationTemplatesQueryKey,
} from '@workspace/api-client-react';
import type { NotificationPreview } from '@workspace/api-client-react';
import { format } from 'date-fns';
import { ArrowLeft, Mail, Loader2, Rocket, Save, Eye, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';

function placeholdersIn(text: string): string[] {
  return [...new Set([...text.matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)].map((m) => m[1]))];
}

export default function NotificationTemplateDetail() {
  const [, params] = useRoute('/notification-templates/:id');
  const id = Number(params?.id);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [subject, setSubject] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const [payloadText, setPayloadText] = useState('{\n  "citizen_name": "Juan Dela Cruz"\n}');
  const [preview, setPreview] = useState<NotificationPreview | null>(null);

  const { data: template, isLoading } = useGetNotificationTemplate(id, {
    query: { enabled: !!id, queryKey: getGetNotificationTemplateQueryKey(id) },
  });

  const updateMutation = useUpdateNotificationTemplate();
  const publishMutation = usePublishNotificationTemplate();
  const previewMutation = usePreviewNotificationTemplate();

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (!template) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">Template not found.</p>
        <Link href="/notification-templates"><Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" />Back to templates</Button></Link>
      </div>
    );
  }

  const isDraft = template.status === 'draft';
  const currentSubject = subject ?? template.subject ?? '';
  const currentBody = body ?? template.body;
  const detected = placeholdersIn(`${currentSubject} ${currentBody}`);

  const save = () =>
    updateMutation.mutate(
      {
        id,
        data: {
          subject: currentSubject || undefined,
          body: currentBody,
          variables: detected,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetNotificationTemplateQueryKey(id) });
          toast({ title: 'Template saved' });
        },
        onError: (err: { message?: string }) =>
          toast({ title: 'Could not save', description: err.message, variant: 'destructive' }),
      },
    );

  const publish = () =>
    publishMutation.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetNotificationTemplateQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListNotificationTemplatesQueryKey() });
          toast({ title: 'Template published', description: 'Sends using this code now render from this version.' });
        },
        onError: (err: { message?: string }) =>
          toast({ title: 'Could not publish', description: err.message, variant: 'destructive' }),
      },
    );

  const runPreview = () => {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(payloadText);
    } catch {
      toast({ title: 'Sample data must be valid JSON', variant: 'destructive' });
      return;
    }
    setPreview(null);
    previewMutation.mutate(
      { id, data: { payload } },
      {
        onSuccess: (data) => setPreview(data),
        onError: (err: { message?: string }) =>
          toast({ title: 'Could not render preview', description: err.message, variant: 'destructive' }),
      },
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/notification-templates">
          <Button variant="ghost" size="sm" className="mb-3 -ml-2"><ArrowLeft className="mr-2 h-4 w-4" />Templates</Button>
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center">
              <Mail className="h-6 w-6 mr-2 text-muted-foreground" />
              {template.name}
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="font-mono text-sm text-muted-foreground">{template.code}</span>
              <Badge variant="outline">{template.channel}</Badge>
              <Badge variant={template.status === 'active' ? 'default' : 'secondary'}>{template.status}</Badge>
              <span className="text-xs text-muted-foreground">v{template.version} · {template.locale}</span>
              <span className="text-xs text-muted-foreground">updated {format(new Date(template.updatedAt), 'PPp')}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isDraft && (
              <>
                <Button variant="outline" onClick={save} disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save
                </Button>
                <Button onClick={publish} disabled={publishMutation.isPending}>
                  {publishMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}
                  Publish
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {!isDraft && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>This version is read-only</AlertTitle>
          <AlertDescription>
            Only drafts can be edited, so messages already sent keep the wording recipients saw. Create a new template with the same code to revise it.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Content</CardTitle>
          <CardDescription>Use {'{{variable}}'} placeholders. A send must supply every variable the template uses.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input id="subject" value={currentSubject} disabled={!isDraft} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="body">Body</Label>
            <Textarea id="body" rows={8} value={currentBody} disabled={!isDraft} onChange={(e) => setBody(e.target.value)} />
          </div>
          {detected.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">Variables used</p>
              <div className="flex flex-wrap gap-1.5">
                {detected.map((v) => <Badge key={v} variant="secondary" className="font-mono text-[10px]">{v}</Badge>)}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Preview</CardTitle>
          <CardDescription>Render against sample data. Nothing is sent.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="payload">Sample data (JSON)</Label>
            <Textarea id="payload" rows={6} className="font-mono text-xs" value={payloadText} onChange={(e) => setPayloadText(e.target.value)} />
          </div>
          <Button variant="outline" onClick={runPreview} disabled={previewMutation.isPending}>
            {previewMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
            Render preview
          </Button>

          {preview && (
            <div className="space-y-3">
              {preview.missingVariables.length > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Missing {preview.missingVariables.length} variable{preview.missingVariables.length === 1 ? '' : 's'}</AlertTitle>
                  <AlertDescription>
                    A real send would be rejected. Unresolved placeholders stay visible below: {preview.missingVariables.join(', ')}
                  </AlertDescription>
                </Alert>
              )}
              <div className="rounded-md border border-border bg-muted/20 p-4 space-y-2">
                {preview.subject && (
                  <p className="text-sm font-medium border-b border-border pb-2">{preview.subject}</p>
                )}
                <p className="text-sm whitespace-pre-wrap">{preview.body}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
