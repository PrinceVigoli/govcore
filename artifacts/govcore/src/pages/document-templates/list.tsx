import { useState } from 'react';
import { Link } from 'wouter';
import {
  useListDocumentTemplates,
  useCreateDocumentTemplate,
  usePublishDocumentTemplate,
  getListDocumentTemplatesQueryKey,
  DocumentTemplateInputDocumentType,
} from '@workspace/api-client-react';
import type { DocumentTemplateInputDocumentType as DocTypeValue } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { LayoutTemplate, Plus, Loader2, Rocket, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

const DOC_TYPES = Object.values(DocumentTemplateInputDocumentType);

function placeholdersIn(text: string): string[] {
  return [...new Set([...text.matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)].map((m) => m[1]))];
}

export default function DocumentTemplatesList() {
  const [createOpen, setCreateOpen] = useState(false);
  const [tenantId, setTenantId] = useState('1');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [module, setModule] = useState('');
  const [documentType, setDocumentType] = useState<DocTypeValue>('certificate');
  const [body, setBody] = useState('');

  const { data: templates, isLoading } = useListDocumentTemplates();
  const createMutation = useCreateDocumentTemplate();
  const publishMutation = usePublishDocumentTemplate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const detected = placeholdersIn(body);
  const refresh = () => queryClient.invalidateQueries({ queryKey: getListDocumentTemplatesQueryKey() });

  const create = () => {
    if (!name.trim() || !code.trim() || !module.trim() || !body.trim()) {
      toast({ title: 'Name, code, module, and body are required', variant: 'destructive' });
      return;
    }
    createMutation.mutate(
      {
        data: {
          tenantId: Number(tenantId) || 1,
          name: name.trim(),
          code: code.trim(),
          module: module.trim(),
          documentType,
          body,
          variables: detected,
        },
      },
      {
        onSuccess: () => {
          refresh();
          setCreateOpen(false);
          setName(''); setCode(''); setBody('');
          toast({ title: 'Draft template created' });
        },
        onError: (err: { message?: string }) =>
          toast({ title: 'Could not create template', description: err.message, variant: 'destructive' }),
      },
    );
  };

  const publish = (id: number) =>
    publishMutation.mutate(
      { id },
      {
        onSuccess: () => {
          refresh();
          toast({ title: 'Template published', description: 'New documents with this code use this version.' });
        },
        onError: (err: { message?: string }) =>
          toast({ title: 'Could not publish', description: err.message, variant: 'destructive' }),
      },
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Document templates</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Reusable layouts for certificates, permits, and receipts. Publishing keeps previously issued documents unchanged.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/documents"><Button variant="outline"><FileText className="mr-2 h-4 w-4" />Documents</Button></Link>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />New Template</Button></DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create draft template</DialogTitle>
                <DialogDescription>Use {'{{variable}}'} placeholders for values filled in at generation time.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" placeholder="Business permit certificate" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="code">Code</Label>
                    <Input id="code" placeholder="BUSINESS_PERMIT" value={code} onChange={(e) => setCode(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="module">Module</Label>
                    <Input id="module" placeholder="permits" value={module} onChange={(e) => setModule(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Document type</Label>
                    <Select value={documentType} onValueChange={(v) => setDocumentType(v as DocTypeValue)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{DOC_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tenantId">Tenant ID</Label>
                    <Input id="tenantId" type="number" value={tenantId} onChange={(e) => setTenantId(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="body">Body</Label>
                  <Textarea id="body" rows={8} placeholder={'<h1>Certificate No. {{reference_number}}</h1>\n<p>Issued to {{citizen_name}}</p>'} value={body} onChange={(e) => setBody(e.target.value)} />
                </div>
                {detected.length > 0 && (
                  <div className="rounded-md border border-border p-3">
                    <p className="text-xs text-muted-foreground mb-2">Variables detected — generation must supply all of these:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {detected.map((v) => <Badge key={v} variant="secondary" className="font-mono text-[10px]">{v}</Badge>)}
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button onClick={create} disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create draft
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="bg-card border border-border rounded-md shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Template</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></TableCell></TableRow>
            ) : templates?.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No templates yet.</TableCell></TableRow>
            ) : (
              templates?.map((t) => (
                <TableRow key={t.id} className="hover-elevate">
                  <TableCell>
                    <span className="font-medium flex items-center">
                      <LayoutTemplate className="h-4 w-4 mr-2 text-muted-foreground" />{t.name}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{t.code}</TableCell>
                  <TableCell className="text-xs">{t.documentType}</TableCell>
                  <TableCell className="text-xs">v{t.version}</TableCell>
                  <TableCell><Badge variant={t.status === 'active' ? 'default' : 'secondary'}>{t.status}</Badge></TableCell>
                  <TableCell className="text-right">
                    {t.status === 'draft' && (
                      <Button variant="ghost" size="sm" onClick={() => publish(t.id)} disabled={publishMutation.isPending}>
                        <Rocket className="mr-2 h-4 w-4" />Publish
                      </Button>
                    )}
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
