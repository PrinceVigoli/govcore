import { useState } from 'react';
import { Link } from 'wouter';
import {
  useListNotificationTemplates,
  useCreateNotificationTemplate,
  getListNotificationTemplatesQueryKey,
  NotificationTemplateInputChannel,
} from '@workspace/api-client-react';
import type { NotificationTemplateInputChannel as ChannelValue } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Mail, Plus, Search, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';

const CHANNELS = Object.values(NotificationTemplateInputChannel);

const templateSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  code: z.string().min(2, 'Code is required').regex(/^[A-Z0-9_]+$/, 'UPPERCASE_AND_UNDERSCORES_ONLY'),
  channel: z.enum(CHANNELS as [ChannelValue, ...ChannelValue[]]),
  locale: z.string().min(2).default('en'),
  subject: z.string().optional(),
  body: z.string().min(2, 'Body is required'),
  tenantId: z.coerce.number().min(1, 'Tenant ID is required'),
});

type TemplateFormValues = z.infer<typeof templateSchema>;

/** Placeholders are the template's contract; derive them from the body so the admin doesn't restate them. */
function placeholdersIn(text: string): string[] {
  return [...new Set([...text.matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)].map((m) => m[1]))];
}

export default function NotificationTemplatesList() {
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);

  const { data: templates, isLoading } = useListNotificationTemplates();
  const createMutation = useCreateNotificationTemplate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm<TemplateFormValues>({
    resolver: zodResolver(templateSchema),
    defaultValues: { name: '', code: '', channel: 'email', locale: 'en', subject: '', body: '', tenantId: 1 },
  });

  const bodyValue = form.watch('body') ?? '';
  const subjectValue = form.watch('subject') ?? '';
  const detected = placeholdersIn(`${subjectValue} ${bodyValue}`);

  const onSubmit = (data: TemplateFormValues) => {
    createMutation.mutate(
      {
        data: {
          ...data,
          subject: data.subject || undefined,
          variables: placeholdersIn(`${data.subject ?? ''} ${data.body}`),
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListNotificationTemplatesQueryKey() });
          setCreateOpen(false);
          form.reset();
          toast({ title: 'Draft template created', description: 'Publish it to start sending from this version.' });
        },
        onError: (err: { message?: string }) =>
          toast({ title: 'Could not create template', description: err.message, variant: 'destructive' }),
      },
    );
  };

  const filtered = templates?.filter((t) => {
    const matchesSearch =
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.code.toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (channelFilter === 'all' || t.channel === channelFilter);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notification templates</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Message templates with {'{{variable}}'} placeholders. Publishing a version keeps past messages intact.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/notifications">
            <Button variant="outline"><Send className="mr-2 h-4 w-4" />Notifications</Button>
          </Link>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" />New Template</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create draft template</DialogTitle>
                <DialogDescription>
                  Templates start as drafts. Publish activates this version and deprecates the previous one for the same code, channel, and language.
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
                        <FormControl><Input placeholder="Permit approved notice" {...field} /></FormControl>
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
                        <FormControl><Input placeholder="PERMIT_ISSUED" {...field} /></FormControl>
                        <FormDescription>Events reference this code to select the template.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="channel"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Channel</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                              {CHANNELS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="locale"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Language</FormLabel>
                          <FormControl><Input placeholder="en" {...field} /></FormControl>
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
                  </div>
                  <FormField
                    control={form.control}
                    name="subject"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Subject</FormLabel>
                        <FormControl><Input placeholder="Your permit {{reference_number}} was approved" {...field} /></FormControl>
                        <FormDescription>Used by email; ignored by SMS and in-app.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="body"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Body</FormLabel>
                        <FormControl>
                          <Textarea rows={6} placeholder="Dear {{citizen_name}}, your application {{reference_number}} is {{approval_status}}." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {detected.length > 0 && (
                    <div className="rounded-md border border-border p-3">
                      <p className="text-xs text-muted-foreground mb-2">Variables detected — a send must supply all of these:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {detected.map((v) => (
                          <Badge key={v} variant="secondary" className="font-mono text-[10px]">{v}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  <DialogFooter>
                    <Button type="submit" disabled={createMutation.isPending}>
                      {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Create draft
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
          <Input placeholder="Search templates..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={channelFilter} onValueChange={setChannelFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All channels</SelectItem>
            {CHANNELS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card border border-border rounded-md shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Template</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Language</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                </TableCell>
              </TableRow>
            ) : filtered?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  No templates match this filter.
                </TableCell>
              </TableRow>
            ) : (
              filtered?.map((t) => (
                <TableRow key={t.id} className="hover-elevate">
                  <TableCell>
                    <span className="font-medium flex items-center">
                      <Mail className="h-4 w-4 mr-2 text-muted-foreground" />
                      {t.name}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{t.code}</TableCell>
                  <TableCell><Badge variant="outline" className="font-normal">{t.channel}</Badge></TableCell>
                  <TableCell className="text-xs font-mono">{t.locale}</TableCell>
                  <TableCell className="text-xs">v{t.version}</TableCell>
                  <TableCell>
                    <Badge variant={t.status === 'active' ? 'default' : 'secondary'}>{t.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/notification-templates/${t.id}`}>
                      <Button variant="ghost" size="sm">Open</Button>
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
