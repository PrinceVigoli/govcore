import { useState } from 'react';
import { Link } from 'wouter';
import { useListWorkflowDefinitions, useCreateWorkflowDefinition, getListWorkflowDefinitionsQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { GitBranch, Plus, Search, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';

const definitionSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  code: z.string().min(2, 'Code is required').regex(/^[A-Z_]+$/, 'UPPERCASE_AND_UNDERSCORES_ONLY'),
  resourceType: z.string().min(2, 'Resource type is required'),
  description: z.string().optional(),
  tenantId: z.coerce.number().min(1, 'Tenant ID is required'),
});

type DefinitionForm = z.infer<typeof definitionSchema>;

export default function WorkflowsList() {
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const { data: definitions, isLoading } = useListWorkflowDefinitions();
  const createMutation = useCreateWorkflowDefinition();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm<DefinitionForm>({
    resolver: zodResolver(definitionSchema),
    defaultValues: { name: '', code: '', resourceType: '', description: '', tenantId: 1 },
  });

  const onSubmit = (data: DefinitionForm) => {
    createMutation.mutate(
      { data },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListWorkflowDefinitionsQueryKey() });
          setCreateOpen(false);
          form.reset();
          toast({ title: 'Workflow definition created' });
        },
        onError: (err) => {
          toast({ title: 'Error creating workflow', description: err.message, variant: 'destructive' });
        },
      }
    );
  };

  const filtered = definitions?.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    d.code.toLowerCase().includes(search.toLowerCase()) ||
    d.resourceType.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Workflows</h1>
          <p className="text-sm text-muted-foreground mt-1">Metadata-driven approval processes for business records.</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Workflow
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Define New Workflow</DialogTitle>
              <DialogDescription>Create a container for a versioned approval process. Add states and transitions from its detail page.</DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl><Input placeholder="Business Permit Approval" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Code</FormLabel>
                      <FormControl><Input placeholder="BPLO_PERMIT_APPROVAL" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="resourceType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Resource Type</FormLabel>
                      <FormControl><Input placeholder="permit_application" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl><Input placeholder="Routes new permit applications through review and approval" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="tenantId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tenant ID</FormLabel>
                      <FormControl><Input type="number" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Workflow
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center space-x-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search workflows..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="bg-card border border-border rounded-md shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Workflow</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Resource Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                </TableCell>
              </TableRow>
            ) : filtered?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  No workflows found.
                </TableCell>
              </TableRow>
            ) : (
              filtered?.map((def) => (
                <TableRow key={def.id} className="hover-elevate">
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium flex items-center">
                        <GitBranch className="h-4 w-4 mr-2 text-muted-foreground" />
                        {def.name}
                      </span>
                      {def.description && <span className="text-xs text-muted-foreground mt-1 line-clamp-1">{def.description}</span>}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{def.code}</TableCell>
                  <TableCell className="font-mono text-xs">{def.resourceType}</TableCell>
                  <TableCell>
                    <Badge variant={def.status === 'active' ? 'default' : 'secondary'}>{def.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/workflows/${def.id}`}>
                      <Button variant="ghost" size="sm">Configure</Button>
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
