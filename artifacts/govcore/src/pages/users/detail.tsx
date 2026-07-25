import { useRoute } from 'wouter';
import { useGetUser, useUpdateUser, useUpdateUserStatus, useGetUserRoles, useAssignUserRole, useRemoveUserRole, useListRoles, getGetUserQueryKey, getGetUserRolesQueryKey } from '@workspace/api-client-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Users, Save, Loader2, ArrowLeft, ShieldCheck, X, ShieldAlert } from 'lucide-react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const userUpdateSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  username: z.string().min(3),
  status: z.enum(['active', 'inactive', 'suspended']),
});

type UserUpdateForm = z.infer<typeof userUpdateSchema>;

export default function UserDetail() {
  const [, params] = useRoute('/users/:id');
  const id = Number(params?.id);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: user, isLoading: userLoading } = useGetUser(id, {
    query: { enabled: !!id, queryKey: getGetUserQueryKey(id) }
  });
  
  const { data: userRoles, isLoading: rolesLoading } = useGetUserRoles(id, {
    query: { enabled: !!id, queryKey: getGetUserRolesQueryKey(id) }
  });

  const { data: allRoles } = useListRoles();

  const updateMutation = useUpdateUser();
  const updateStatusMutation = useUpdateUserStatus();
  const assignRoleMutation = useAssignUserRole();
  const removeRoleMutation = useRemoveUserRole();

  const form = useForm<UserUpdateForm>({
    resolver: zodResolver(userUpdateSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      username: '',
      status: 'active',
    },
  });

  const initializedForId = useRef<number | null>(null);

  useEffect(() => {
    if (user && initializedForId.current !== id) {
      initializedForId.current = id;
      form.reset({
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        username: user.username,
        status: user.status,
      });
    }
  }, [user, id, form]);

  const onSubmit = (data: UserUpdateForm) => {
    if (!user) return;
    
    // Check if status changed
    if (data.status !== user.status) {
      updateStatusMutation.mutate(
        { id, data: { status: data.status } },
        {
          onSuccess: (updatedUser) => {
            queryClient.setQueryData(getGetUserQueryKey(id), updatedUser);
          }
        }
      );
    }

    updateMutation.mutate(
      { id, data: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        username: data.username,
      }},
      {
        onSuccess: (updated) => {
          queryClient.setQueryData(getGetUserQueryKey(id), updated);
          toast({ title: 'User profile updated successfully' });
        },
        onError: (err) => {
          toast({ title: 'Failed to update user', description: err.message, variant: 'destructive' });
        }
      }
    );
  };

  const handleAssignRole = (roleId: string) => {
    if (!roleId) return;
    assignRoleMutation.mutate(
      { id, data: { roleId: Number(roleId) } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetUserRolesQueryKey(id) });
          toast({ title: 'Role assigned' });
        },
        onError: (err) => {
          toast({ title: 'Failed to assign role', description: err.message, variant: 'destructive' });
        }
      }
    );
  };

  const handleRemoveRole = (roleId: number) => {
    removeRoleMutation.mutate(
      { id, roleId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetUserRolesQueryKey(id) });
          toast({ title: 'Role removed' });
        },
        onError: (err) => {
          toast({ title: 'Failed to remove role', description: err.message, variant: 'destructive' });
        }
      }
    );
  };

  if (userLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <div className="p-8 text-center text-muted-foreground">User not found</div>;

  const availableRoles = allRoles?.filter(r => !userRoles?.find(ur => ur.id === r.id));

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/users">
            <Button variant="ghost" size="icon" className="shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center">
              <Users className="mr-2 h-6 w-6 text-primary" />
              {user.firstName} {user.lastName}
            </h1>
            <p className="text-sm text-muted-foreground mt-1 font-mono">{user.email}</p>
          </div>
        </div>
        <Badge variant={user.status === 'active' ? 'default' : user.status === 'suspended' ? 'destructive' : 'secondary'} className="text-sm px-3 py-1">
          {user.status.toUpperCase()}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Identity Information</CardTitle>
              <CardDescription>Core personnel data and access status.</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First Name</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Last Name</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email Address</FormLabel>
                          <FormControl><Input type="email" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Username</FormLabel>
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
                  </div>

                  <div className="flex justify-end pt-4 border-t border-border">
                    <Button type="submit" disabled={updateMutation.isPending || updateStatusMutation.isPending || !form.formState.isDirty}>
                      {(updateMutation.isPending || updateStatusMutation.isPending) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      Save Profile
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <ShieldCheck className="mr-2 h-5 w-5 text-primary" />
                Assigned Roles
              </CardTitle>
              <CardDescription>RBAC nodes attached to this identity.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {rolesLoading ? (
                <div className="flex justify-center p-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : (
                <div className="space-y-2">
                  {userRoles?.length === 0 && <p className="text-sm text-muted-foreground">No roles assigned.</p>}
                  {userRoles?.map(role => (
                    <div key={role.id} className="flex items-center justify-between bg-muted/50 p-2 rounded-md border border-border">
                      <div className="flex items-center min-w-0">
                        {role.isSystem && <ShieldAlert className="h-3.5 w-3.5 text-primary mr-2 shrink-0" />}
                        <span className="text-sm font-medium truncate">{role.name}</span>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => handleRemoveRole(role.id)}
                        disabled={removeRoleMutation.isPending}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-4 border-t border-border">
                <Select onValueChange={handleAssignRole} disabled={assignRoleMutation.isPending || !availableRoles?.length}>
                  <SelectTrigger>
                    <SelectValue placeholder={availableRoles?.length ? "Assign new role..." : "No roles available"} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableRoles?.map(role => (
                      <SelectItem key={role.id} value={role.id.toString()}>{role.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
