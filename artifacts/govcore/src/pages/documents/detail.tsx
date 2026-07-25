import { useState } from 'react';
import { useRoute, Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetDocument,
  useGenerateDocument,
  useUpdateDocumentStatus,
  useSignDocument,
  useGetDocumentContent,
  useListDocumentAccessLogs,
  getGetDocumentQueryKey,
  getListDocumentAccessLogsQueryKey,
  getGetDocumentContentQueryKey,
  DocumentStatus,
} from '@workspace/api-client-react';
import type { DocumentStatus as DocumentStatusValue } from '@workspace/api-client-react';
import { format } from 'date-fns';
import { ArrowLeft, FileText, Loader2, RefreshCw, PenLine, Eye, QrCode, ShieldCheck, History, Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

const ALL_STATUSES = Object.values(DocumentStatus);
const ORDER = new Map(ALL_STATUSES.map((s, i) => [s, i]));

export default function DocumentDetail() {
  const [, params] = useRoute('/documents/:id');
  const id = Number(params?.id);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [generateOpen, setGenerateOpen] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [payloadText, setPayloadText] = useState('{}');
  const [signerName, setSignerName] = useState('');
  const [signerRole, setSignerRole] = useState('');
  const [showContent, setShowContent] = useState(false);

  const { data: document, isLoading } = useGetDocument(id, {
    query: { enabled: !!id, queryKey: getGetDocumentQueryKey(id) },
  });
  const { data: logs } = useListDocumentAccessLogs(id, {
    query: { enabled: !!id, queryKey: getListDocumentAccessLogsQueryKey(id) },
  });
  const { data: content, isFetching: contentLoading } = useGetDocumentContent(id, {
    query: { enabled: !!id && showContent, queryKey: getGetDocumentContentQueryKey(id) },
  });

  const generateMutation = useGenerateDocument();
  const statusMutation = useUpdateDocumentStatus();
  const signMutation = useSignDocument();

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (!document) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">Document not found.</p>
        <Link href="/documents"><Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" />Back to documents</Button></Link>
      </div>
    );
  }

  const isGenerated = document.currentVersion > 0;
  const currentIndex = ORDER.get(document.status) ?? 0;
  // The lifecycle only moves forward, so only later stages are offered.
  const nextStatuses = ALL_STATUSES.filter((s) => (ORDER.get(s) ?? 0) > currentIndex);
  const activeVersion = document.versions.find((v) => v.version === document.currentVersion);
  // A signature attests to specific bytes; one over an older version is stale.
  const currentSignatures = document.signatures.filter((s) => s.signedHash === document.contentHash);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: getGetDocumentQueryKey(id) });
    queryClient.invalidateQueries({ queryKey: getListDocumentAccessLogsQueryKey(id) });
  };

  const generate = () => {
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(payloadText);
    } catch {
      toast({ title: 'Variables must be valid JSON', variant: 'destructive' });
      return;
    }
    generateMutation.mutate(
      { id, data: { payload } },
      {
        onSuccess: () => {
          refresh();
          setGenerateOpen(false);
          toast({ title: 'New version generated', description: 'Earlier versions are kept unchanged.' });
        },
        onError: (err: unknown) => {
          const data = (err as { data?: { error?: string; missingVariables?: string[] } })?.data;
          toast({
            title: 'Could not generate',
            description: data?.missingVariables?.length
              ? `Missing variables: ${data.missingVariables.join(', ')}`
              : data?.error ?? (err as { message?: string })?.message,
            variant: 'destructive',
          });
        },
      },
    );
  };

  const changeStatus = (status: DocumentStatusValue) =>
    statusMutation.mutate(
      { id, data: { status } },
      {
        onSuccess: () => {
          refresh();
          toast({ title: `Moved to ${status}` });
        },
        onError: (err: unknown) => {
          const data = (err as { data?: { error?: string } })?.data;
          toast({ title: 'Could not change status', description: data?.error, variant: 'destructive' });
        },
      },
    );

  const sign = () => {
    if (!signerName.trim()) {
      toast({ title: 'Signer name is required', variant: 'destructive' });
      return;
    }
    signMutation.mutate(
      { id, data: { signerName: signerName.trim(), signerRole: signerRole.trim() || undefined } },
      {
        onSuccess: () => {
          refresh();
          setSignOpen(false);
          setSignerName('');
          setSignerRole('');
          toast({ title: 'Signature recorded' });
        },
        onError: (err: unknown) => {
          const data = (err as { data?: { error?: string } })?.data;
          toast({ title: 'Could not sign', description: data?.error, variant: 'destructive' });
        },
      },
    );
  };

  const verifyPath = `/verify/${document.uuid}`;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/documents">
          <Button variant="ghost" size="sm" className="mb-3 -ml-2"><ArrowLeft className="mr-2 h-4 w-4" />Documents</Button>
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center">
              <FileText className="h-6 w-6 mr-2 text-muted-foreground" />
              {document.title}
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <Badge variant={document.status === 'signed' || document.status === 'approved' ? 'default' : 'secondary'}>
                {document.status}
              </Badge>
              <Badge variant="outline">{document.documentType}</Badge>
              {document.referenceNumber && <span className="font-mono text-xs">{document.referenceNumber}</span>}
              <span className="text-xs text-muted-foreground">
                {isGenerated ? `v${document.currentVersion}` : 'not generated'}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
              <DialogTrigger asChild>
                <Button variant={isGenerated ? 'outline' : 'default'}>
                  <RefreshCw className="mr-2 h-4 w-4" />{isGenerated ? 'Regenerate' : 'Generate'}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{isGenerated ? 'Generate a new version' : 'Generate document'}</DialogTitle>
                  <DialogDescription>
                    {isGenerated
                      ? 'This adds a new version. Earlier versions stay exactly as issued, and existing signatures will no longer cover the latest one.'
                      : 'Render the template into version 1.'}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  <Label htmlFor="payload">Variables (JSON)</Label>
                  <Textarea id="payload" rows={6} className="font-mono text-xs" value={payloadText} onChange={(e) => setPayloadText(e.target.value)} />
                </div>
                <DialogFooter>
                  <Button onClick={generate} disabled={generateMutation.isPending}>
                    {generateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Generate
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {isGenerated && (
              <Dialog open={signOpen} onOpenChange={setSignOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline"><PenLine className="mr-2 h-4 w-4" />Sign</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Sign this version</DialogTitle>
                    <DialogDescription>
                      The signature covers version {document.currentVersion} exactly. Regenerating afterwards leaves the new version unsigned.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="signerName">Signer name</Label>
                      <Input id="signerName" value={signerName} onChange={(e) => setSignerName(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signerRole">Capacity</Label>
                      <Input id="signerRole" placeholder="Municipal Assessor" value={signerRole} onChange={(e) => setSignerRole(e.target.value)} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={sign} disabled={signMutation.isPending}>
                      {signMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Record signature
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}

            {nextStatuses.length > 0 && (
              <Select onValueChange={(v) => changeStatus(v as DocumentStatusValue)}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Advance to..." /></SelectTrigger>
                <SelectContent>
                  {nextStatuses.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Content</CardTitle>
              <CardDescription>
                {isGenerated ? `Version ${document.currentVersion}, as issued.` : 'Nothing generated yet.'}
              </CardDescription>
            </div>
            {isGenerated && (
              <Button variant="outline" size="sm" onClick={() => setShowContent(!showContent)}>
                <Eye className="mr-2 h-4 w-4" />{showContent ? 'Hide' : 'View'}
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {!isGenerated ? (
              <p className="text-sm text-muted-foreground">Generate the document to see its content.</p>
            ) : !showContent ? (
              <p className="text-sm text-muted-foreground">Viewing is recorded in the access trail.</p>
            ) : contentLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <div
                className="rounded-md border border-border bg-muted/20 p-4 text-sm prose-sm max-w-none whitespace-pre-wrap"
                dangerouslySetInnerHTML={{ __html: content?.content ?? '' }}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center"><QrCode className="h-4 w-4 mr-2 text-muted-foreground" />Verification</CardTitle>
            <CardDescription>Public check by UUID.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground">Document UUID</p>
              <p className="font-mono text-xs break-all">{document.uuid}</p>
            </div>
            {document.contentHash && (
              <div>
                <p className="text-xs text-muted-foreground">Content hash</p>
                <p className="font-mono text-xs break-all">{document.contentHash.slice(0, 32)}…</p>
              </div>
            )}
            <Link href={verifyPath}>
              <Button variant="outline" size="sm" className="w-full">
                <ShieldCheck className="mr-2 h-4 w-4" />Open verification page
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Versions</CardTitle>
          <CardDescription>Immutable. Regenerating adds a version rather than replacing one.</CardDescription>
        </CardHeader>
        <CardContent>
          {document.versions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No versions yet.</p>
          ) : (
            <div className="space-y-2">
              {document.versions.map((v) => (
                <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-medium">Version {v.version}</span>
                    {v.version === document.currentVersion && <Badge variant="default">current</Badge>}
                    <span className="text-xs text-muted-foreground font-mono">{v.contentHash.slice(0, 12)}…</span>
                    <span className="text-xs text-muted-foreground">{v.sizeBytes ?? 0} bytes</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{format(new Date(v.createdAt), 'PPp')}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Signatures</CardTitle>
            <CardDescription>Each covers one specific version.</CardDescription>
          </CardHeader>
          <CardContent>
            {document.signatures.length === 0 ? (
              <p className="text-sm text-muted-foreground">Not signed.</p>
            ) : (
              <div className="space-y-2">
                {document.signatures.map((s) => {
                  const stale = s.signedHash !== document.contentHash;
                  return (
                    <div key={s.id} className="rounded-md border border-border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{s.signerName}</span>
                        {s.signerRole && <span className="text-xs text-muted-foreground">{s.signerRole}</span>}
                        {stale && <Badge variant="outline" className="text-[10px]">covers an earlier version</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{format(new Date(s.signedAt), 'PPp')}</p>
                    </div>
                  );
                })}
                {currentSignatures.length === 0 && document.signatures.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    No signature covers the current version — it was regenerated after signing.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center"><Paperclip className="h-4 w-4 mr-2 text-muted-foreground" />Attachments</CardTitle>
            <CardDescription>Files uploaded against this document.</CardDescription>
          </CardHeader>
          <CardContent>
            {document.attachments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No attachments.</p>
            ) : (
              <div className="space-y-2">
                {document.attachments.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-3">
                    <span className="text-sm truncate">{a.fileName}</span>
                    <span className="text-xs text-muted-foreground">{a.mimeType}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center"><History className="h-4 w-4 mr-2 text-muted-foreground" />Access trail</CardTitle>
          <CardDescription>Append-only. Every view, download, and verification is recorded.</CardDescription>
        </CardHeader>
        <CardContent>
          {!logs || logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recorded activity.</p>
          ) : (
            <div className="space-y-2">
              {logs.slice(0, 30).map((l) => (
                <div key={l.id} className="flex items-start justify-between gap-4 rounded-md border border-border p-3">
                  <div className="min-w-0">
                    <Badge variant="secondary">{l.action}</Badge>
                    {l.detail && <p className="text-xs text-muted-foreground mt-1">{l.detail}</p>}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{format(new Date(l.createdAt), 'PPp')}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
