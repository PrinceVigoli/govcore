import { useRoute, Link } from 'wouter';
import { useGetRole, useUpdateRole, useGetRolePermissions, useAssignRolePermission, useRemoveRolePermission, useListPermissions, getGetRoleQueryKey, getGetRolePermissionsQueryKey } from '@workspace/api-client-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Shield, Save, Loader2, ArrowLeft, Key, X, Search, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const roleUpdateSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2),
  description: z.string().optional().or(z.literal('')),
});

type RoleUpdateForm = z.infer<typeof roleUpdateSchema>;

export default function RoleDetail() {
  const [, params] = useRoute('/roles/:id');
  const id = Number(params?.id);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  const { data: role, isLoading: roleLoading } = useGetRole(id, {
    query: { enabled: !!id, queryKey: getGetRoleQueryKey(id) }
  });
  
  const { data: rolePermissions, isLoading: permissionsLoading } = useGetRolePermissions(id, {
    query: { enabled: !!id, queryKey: getGetRolePermissionsQueryKey(id) }
  });

  const { data: allPermissions, isLoading: allPermissionsLoading } = useListPermissions();

  const updateMutation = useUpdateRole();
  const assignPermMutation = useAssignRolePermission();
  const removePermMutation = useRemoveRolePermission();

  const form = useForm<RoleUpdateForm>({
    resolver: zodResolver(roleUpdateSchema),
    defaultValues: {
      name: '',
      code: '',
      description: '',
    },
  });

  const initializedForId = useRef<number | null>(null);

  useEffect(() => {
    if (role && initializedForId.current !== id) {
      initializedForId.current = id;
      form.reset({
        name: role.name,
        code: role.code,
        description: role.description || '',
      });
    }
  }, [role, id, form]);

  const onSubmit = (data: RoleUpdateForm) => {
    updateMutation.mutate(
      { id, data },
      {
        onSuccess: (updated) => {
          queryClient.setQueryData(getGetRoleQueryKey(id), updated);
          toast({ title: 'Role updated successfully' });
        },
        onError: (err) => {
          toast({ title: 'Failed to update role', description: err.message, variant: 'destructive' });
        }
      }
    );
  };

  const togglePermission = (permissionId: number, isAssigned: boolean) => {
    if (role?.isSystem) {
      toast({ title: 'Cannot modify system role', variant: 'destructive' });
      return;
    }

    if (isAssigned) {
      removePermMutation.mutate(
        { id, permissionId },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetRolePermissionsQueryKey(id) });
          },
          onError: (err) => {
            toast({ title: 'Error removing permission', description: err.message, variant: 'destructive' });
          }
        }
      );
    } else {
      assignPermMutation.mutate(
        { id, data: { permissionId } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetRolePermissionsQueryKey(id) });
          },
          onError: (err) => {
            toast({ title: 'Error assigning permission', description: err.message, variant: 'destructive' });
          }
        }
      );
    }
  };

  if (roleLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!role) return <div className="p-8 text-center text-muted-foreground">Role not found</div>;

  const filteredPermissions = allPermissions?.filter(p => 
    p.action.toLowerCase().includes(search.toLowerCase()) || 
    p.resource.toLowerCase().includes(search.toLowerCase()) ||
    p.module.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center space-x-4">
        <Link href="/roles">
          <Button variant="ghost" size="icon" className="shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center">
            <Shield className="mr-2 h-6 w-6 text-primary" />
            {role.name}
          </h1>
          <p className="text-sm text-muted-foreground mt-1 font-mono">{role.code}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Role Definition</CardTitle>
              <CardDescription>Core identifiers and metadata.</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Role Name</FormLabel>
                        <FormControl><Input {...field} disabled={role.isSystem} /></FormControl>
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
                        <FormControl><Input {...field} disabled={role.isSystem} /></FormControl>
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
                        <FormControl><Input {...field} disabled={role.isSystem} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {!role.isSystem && (
                    <div className="flex justify-end pt-4 border-t border-border">
                      <Button type="submit" disabled={updateMutation.isPending || !form.formState.isDirty}>
                        {updateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Save Details
                      </Button>
                    </div>
                  )}
                  {role.isSystem && (
                    <div className="p-3 bg-primary/10 border border-primary/20 rounded text-sm text-primary">
                      This is a system role. Core attributes cannot be modified.
                    </div>
                  )}
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <Card className="h-full flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Key className="mr-2 h-5 w-5 text-primary" />
                Permission Matrix
              </CardTitle>
              <CardDescription>Select operations permitted by this role.</CardDescription>
              <div className="pt-4">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search permissions by action, resource, or module..."
                    className="pl-9"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto min-h-[400px]">
              {(permissionsLoading || allPermissionsLoading) ? (
                <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredPermissions?.map(perm => {
                    const isAssigned = !!rolePermissions?.find(rp => rp.id === perm.id);
                    return (
                      <div 
                        key={perm.id} 
                        className={`flex items-start p-3 rounded-lg border transition-colors cursor-pointer select-none
                          ${isAssigned ? 'bg-primary/5 border-primary/30' : 'bg-card border-border hover:bg-muted'}
                          ${role.isSystem ? 'opacity-70 cursor-not-allowed' : ''}
                        `}
                        onClick={() => togglePermission(perm.id, isAssigned)}
                      >
                        <div className={`mt-0.5 mr-3 shrink-0 rounded-full h-5 w-5 flex items-center justify-center border
                          ${isAssigned ? 'bg-primary border-primary text-primary-foreground' : 'border-input'}
                        `}>
                          {isAssigned && <CheckCircle2 className="h-3 w-3" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium leading-none ${isAssigned ? 'text-primary' : 'text-foreground'}`}>
                            {perm.action} <span className="font-normal opacity-70">on</span> {perm.resource}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1.5 font-mono">
                            Mod: {perm.module}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  {filteredPermissions?.length === 0 && (
                    <div className="col-span-full py-8 text-center text-muted-foreground">
                      No permissions match your search.
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
