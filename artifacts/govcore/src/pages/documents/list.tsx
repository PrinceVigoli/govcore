import { useState } from 'react';
import { Link } from 'wouter';
import {
  useListDocuments,
  useCreateDocument,
  getListDocumentsQueryKey,
  DocumentStatus,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { FileText, Plus, Search, Loader2, LayoutTemplate } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

const STATUSES = ['all', ...Object.values(DocumentStatus)];

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  signed: 'default',
  approved: 'default',
  disposed: 'destructive',
  archived: 'outline',
};

export default function DocumentsList() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);

  const [tenantId, setTenantId] = useState('1');
  const [title, setTitle] = useState('');
  const [module, setModule] = useState('');
  const [templateCode, setTemplateCode] = useState('');
  const [payloadText, setPayloadText] = useState('{}');

  const query = status === 'all' ? {} : { status: status as never };
  const { data: documents, isLoading } = useListDocuments(query, {
    query: { queryKey: getListDocumentsQueryKey(query) },
  });

  const createMutation = useCreateDocument();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const create = () => {
    if (!title.trim() || !module.trim()) {
      toast({ title: 'Title and module are required', variant: 'destructive' });
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

    createMutation.mutate(
      {
        data: {
          tenantId: Number(tenantId) || 1,
          title: title.trim(),
          module: module.trim(),
          templateCode: templateCode.trim() || undefined,
          payload,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey(query) });
          setCreateOpen(false);
          setTitle('');
          toast({ title: 'Document created' });
        },
        onError: (err: unknown) => {
          const data = (err as { data?: { error?: string; missingVariables?: string[] } })?.data;
          toast({
            title: 'Could not create document',
            description: data?.missingVariables?.length
              ? `Missing variables: ${data.missingVariables.join(', ')}`
              : data?.error ?? (err as { message?: string })?.message,
            variant: 'destructive',
          });
        },
      },
    );
  };

  const filtered = documents?.filter(
    (d) =>
      d.title.toLowerCase().includes(search.toLowerCase()) ||
      (d.referenceNumber ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Documents</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Certificates, permits, and receipts generated from templates. Every version is kept, and each one is verifiable.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/document-templates">
            <Button variant="outline"><LayoutTemplate className="mr-2 h-4 w-4" />Templates</Button>
          </Link>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" />New Document</Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create document</DialogTitle>
                <DialogDescription>
                  Supplying a template code and its variables generates the first version immediately.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  <Input id="title" placeholder="Business Permit — Dela Cruz Sari-Sari Store" value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="module">Module</Label>
                    <Input id="module" placeholder="permits" value={module} onChange={(e) => setModule(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="templateCode">Template code</Label>
                    <Input id="templateCode" placeholder="BUSINESS_PERMIT" value={templateCode} onChange={(e) => setTemplateCode(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tenantId">Tenant ID</Label>
                    <Input id="tenantId" type="number" value={tenantId} onChange={(e) => setTenantId(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payload">Variables (JSON)</Label>
                  <Textarea id="payload" rows={5} className="font-mono text-xs" value={payloadText} onChange={(e) => setPayloadText(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={create} disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create document
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by title or reference..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={status} onValueChange={setStatus}>
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
              <TableHead>Document</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></TableCell></TableRow>
            ) : filtered?.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">No documents match this filter.</TableCell></TableRow>
            ) : (
              filtered?.map((d) => (
                <TableRow key={d.id} className="hover-elevate">
                  <TableCell>
                    <span className="font-medium flex items-center">
                      <FileText className="h-4 w-4 mr-2 text-muted-foreground" />
                      {d.title}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{d.referenceNumber ?? '—'}</TableCell>
                  <TableCell className="text-xs">{d.documentType}</TableCell>
                  <TableCell className="text-xs">{d.currentVersion === 0 ? '—' : `v${d.currentVersion}`}</TableCell>
                  <TableCell><Badge variant={STATUS_VARIANT[d.status] ?? 'secondary'}>{d.status}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{format(new Date(d.createdAt), 'PP')}</TableCell>
                  <TableCell className="text-right">
                    <Link href={`/documents/${d.id}`}><Button variant="ghost" size="sm">Open</Button></Link>
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
