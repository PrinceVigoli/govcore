import { useState } from 'react';
import { Link } from 'wouter';
import { useListForms, useCreateForm, getListFormsQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { FileText, Plus, Search, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';

const formSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  code: z.string().min(2, 'Code is required').regex(/^[A-Z0-9_]+$/, 'UPPERCASE_AND_UNDERSCORES_ONLY'),
  module: z.string().min(2, 'Module is required'),
  resourceType: z.string().min(2, 'Resource type is required'),
  description: z.string().optional(),
  tenantId: z.coerce.number().min(1, 'Tenant ID is required'),
  workflowDefinitionId: z.coerce.number().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function FormsList() {
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const { data: forms, isLoading } = useListForms();
  const createMutation = useCreateForm();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '', code: '', module: '', resourceType: '', description: '', tenantId: 1 },
  });

  const onSubmit = (data: FormValues) => {
    createMutation.mutate(
      {
        data: {
          ...data,
          workflowDefinitionId: data.workflowDefinitionId ? data.workflowDefinitionId : undefined,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListFormsQueryKey() });
          setCreateOpen(false);
          form.reset();
          toast({ title: 'Form created' });
        },
        onError: (err: { message?: string }) => {
          toast({ title: 'Could not create form', description: err.message, variant: 'destructive' });
        },
      },
    );
  };

  const filtered = forms?.filter(
    (f) =>
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      f.code.toLowerCase().includes(search.toLowerCase()) ||
      f.module.toLowerCase().includes(search.toLowerCase()) ||
      f.resourceType.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Forms</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Metadata-driven data capture. Fields, validations, and layout are configured per version — no code changes.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Form
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Define New Form</DialogTitle>
              <DialogDescription>
                Create a container for a versioned form. Build its sections and fields from the detail page.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl><Input placeholder="Business Permit Application" {...field} /></FormControl>
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
                      <FormControl><Input placeholder="BPLO_PERMIT_APPLICATION" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="module"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Module</FormLabel>
                      <FormControl><Input placeholder="permits" {...field} /></FormControl>
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
                      <FormDescription>
                        Also the resource type the Rules Engine consults for visibility, validation, and calculations.
                      </FormDescription>
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
                      <FormControl><Input placeholder="Collects new business permit applications" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
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
                  <FormField
                    control={form.control}
                    name="workflowDefinitionId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Workflow ID</FormLabel>
                        <FormControl><Input type="number" placeholder="Optional" {...field} /></FormControl>
                        <FormDescription>Starts on submit.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Form
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
          <Input placeholder="Search forms..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="bg-card border border-border rounded-md shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Form</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Module</TableHead>
              <TableHead>Resource Type</TableHead>
              <TableHead>Status</TableHead>
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
            ) : filtered?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No forms yet. Create one to start collecting data.
                </TableCell>
              </TableRow>
            ) : (
              filtered?.map((f) => (
                <TableRow key={f.id} className="hover-elevate">
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium flex items-center">
                        <FileText className="h-4 w-4 mr-2 text-muted-foreground" />
                        {f.name}
                      </span>
                      {f.description && <span className="text-xs text-muted-foreground mt-1 line-clamp-1">{f.description}</span>}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{f.code}</TableCell>
                  <TableCell className="text-xs">{f.module}</TableCell>
                  <TableCell className="font-mono text-xs">{f.resourceType}</TableCell>
                  <TableCell>
                    <Badge variant={f.status === 'active' ? 'default' : 'secondary'}>{f.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/forms/${f.id}`}>
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
