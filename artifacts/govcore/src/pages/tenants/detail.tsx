import { useRoute } from 'wouter';
import { useGetTenant, useUpdateTenant, getGetTenantQueryKey } from '@workspace/api-client-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Building2, Save, Loader2, ArrowLeft } from 'lucide-react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const tenantUpdateSchema = z.object({
  name: z.string().min(2),
  contactEmail: z.string().email().optional().or(z.literal('')),
  contactPhone: z.string().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  province: z.string().optional().or(z.literal('')),
  status: z.enum(['active', 'inactive', 'suspended']),
});

type TenantUpdateForm = z.infer<typeof tenantUpdateSchema>;

export default function TenantDetail() {
  const [, params] = useRoute('/tenants/:id');
  const id = Number(params?.id);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: tenant, isLoading } = useGetTenant(id, {
    query: { enabled: !!id, queryKey: getGetTenantQueryKey(id) }
  });
  
  const updateMutation = useUpdateTenant();

  const form = useForm<TenantUpdateForm>({
    resolver: zodResolver(tenantUpdateSchema),
    defaultValues: {
      name: '',
      contactEmail: '',
      contactPhone: '',
      address: '',
      province: '',
      status: 'active',
    },
  });

  const initializedForId = useRef<number | null>(null);

  useEffect(() => {
    if (tenant && initializedForId.current !== id) {
      initializedForId.current = id;
      form.reset({
        name: tenant.name,
        contactEmail: tenant.contactEmail || '',
        contactPhone: tenant.contactPhone || '',
        address: tenant.address || '',
        province: tenant.province || '',
        status: tenant.status,
      });
    }
  }, [tenant, id, form]);

  const onSubmit = (data: TenantUpdateForm) => {
    updateMutation.mutate(
      { id, data },
      {
        onSuccess: (updated) => {
          queryClient.setQueryData(getGetTenantQueryKey(id), updated);
          toast({ title: 'Tenant updated successfully' });
        },
        onError: (err) => {
          toast({ title: 'Failed to update tenant', description: err.message, variant: 'destructive' });
        }
      }
    );
  };

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!tenant) return <div className="p-8 text-center text-muted-foreground">Tenant not found</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center space-x-4">
        <Link href="/tenants">
          <Button variant="ghost" size="icon" className="shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center">
            <Building2 className="mr-2 h-6 w-6 text-primary" />
            {tenant.name}
          </h1>
          <p className="text-sm text-muted-foreground mt-1 font-mono">{tenant.slug}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tenant Information</CardTitle>
          <CardDescription>Update LGU details and operational status.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                          <SelectItem value="suspended">Suspended</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="contactEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Email</FormLabel>
                      <FormControl><Input type="email" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="contactPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Phone</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="province"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Province</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Address</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end pt-4 border-t border-border">
                <Button type="submit" disabled={updateMutation.isPending || !form.formState.isDirty}>
                  {updateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save Changes
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
