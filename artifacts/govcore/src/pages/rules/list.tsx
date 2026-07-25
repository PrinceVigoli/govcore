import { useState } from 'react';
import { Link } from 'wouter';
import {
  useListRules,
  useCreateRule,
  getListRulesQueryKey,
  RuleInputRuleType,
} from '@workspace/api-client-react';
import type { RuleInputRuleType as RuleTypeValue } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Scale, Plus, Search, Loader2, FlaskConical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';

const RULE_TYPES = Object.values(RuleInputRuleType);

const ruleSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  code: z.string().min(2, 'Code is required').regex(/^[A-Z0-9_]+$/, 'UPPERCASE_AND_UNDERSCORES_ONLY'),
  module: z.string().min(2, 'Module is required'),
  ruleType: z.enum(RULE_TYPES as [RuleTypeValue, ...RuleTypeValue[]]),
  resourceType: z.string().min(2, 'Resource type is required'),
  description: z.string().optional(),
  tenantId: z.coerce.number().min(1, 'Tenant ID is required'),
});

type RuleFormValues = z.infer<typeof ruleSchema>;

export default function RulesList() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [createOpen, setCreateOpen] = useState(false);

  const { data: rules, isLoading } = useListRules();
  const createMutation = useCreateRule();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm<RuleFormValues>({
    resolver: zodResolver(ruleSchema),
    defaultValues: { name: '', code: '', module: '', ruleType: 'validation', resourceType: '', description: '', tenantId: 1 },
  });

  const onSubmit = (data: RuleFormValues) => {
    createMutation.mutate(
      { data },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListRulesQueryKey() });
          setCreateOpen(false);
          form.reset();
          toast({ title: 'Rule created' });
        },
        onError: (err: { message?: string }) =>
          toast({ title: 'Could not create rule', description: err.message, variant: 'destructive' }),
      },
    );
  };

  const filtered = rules?.filter((r) => {
    const matchesSearch =
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.code.toLowerCase().includes(search.toLowerCase()) ||
      r.resourceType.toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (typeFilter === 'all' || r.ruleType === typeFilter);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Rules</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Business policy as configuration. Rules decide eligibility, approvals, calculations, and validation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/rules/evaluate">
            <Button variant="outline"><FlaskConical className="mr-2 h-4 w-4" />Test rules</Button>
          </Link>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" />New Rule</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Define New Rule</DialogTitle>
                <DialogDescription>
                  Create a container for versioned policy logic. Build its conditions and actions from the detail page.
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
                        <FormControl><Input placeholder="Senior Citizen Discount Eligibility" {...field} /></FormControl>
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
                        <FormControl><Input placeholder="SENIOR_DISCOUNT_ELIGIBLE" {...field} /></FormControl>
                        <FormDescription>Forms reference this code for conditional visibility and calculations.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="ruleType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Rule Type</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            {RULE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
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
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl><Input placeholder="Applies the statutory discount to qualifying applicants" {...field} /></FormControl>
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
                      Create Rule
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search rules..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {RULE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card border border-border rounded-md shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Rule</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Type</TableHead>
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
                  No rules match this filter.
                </TableCell>
              </TableRow>
            ) : (
              filtered?.map((r) => (
                <TableRow key={r.id} className="hover-elevate">
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium flex items-center">
                        <Scale className="h-4 w-4 mr-2 text-muted-foreground" />
                        {r.name}
                      </span>
                      {r.description && <span className="text-xs text-muted-foreground mt-1 line-clamp-1">{r.description}</span>}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{r.code}</TableCell>
                  <TableCell><Badge variant="outline" className="font-normal">{r.ruleType}</Badge></TableCell>
                  <TableCell className="font-mono text-xs">{r.resourceType}</TableCell>
                  <TableCell>
                    <Badge variant={r.status === 'active' ? 'default' : 'secondary'}>{r.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/rules/${r.id}`}>
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
