import { useGetIdentityStats, useGetRecentActivity } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Building2, Users, Shield, Landmark, Activity, UserX, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetIdentityStats();
  const { data: activity, isLoading: activityLoading } = useGetRecentActivity({ limit: 10 });

  if (statsLoading || activityLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Identity Engine Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">System-wide metrics and recent access logs.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="hover-elevate">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tenants</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalTenants}</div>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">{stats.activeTenants}</span> active
            </p>
          </CardContent>
        </Card>
        
        <Card className="hover-elevate">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalUsers}</div>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">{stats.activeUsers}</span> active
              {stats.suspendedUsers ? (
                <span className="ml-2 text-destructive font-medium">{stats.suspendedUsers} suspended</span>
              ) : null}
            </p>
          </CardContent>
        </Card>

        <Card className="hover-elevate">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Departments</CardTitle>
            <Landmark className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalDepartments || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Across all LGUs</p>
          </CardContent>
        </Card>

        <Card className="hover-elevate">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">RBAC Nodes</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalRoles}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Mapping {stats.totalPermissions} distinct permissions
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>System Activity</CardTitle>
            <CardDescription>Recent actions across the platform</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {activity?.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-4">No recent activity.</div>
              )}
              {activity?.map((log) => (
                <div key={log.id} className="flex items-center">
                  <div className="w-2 h-2 rounded-full bg-primary/40 mr-4 shrink-0" />
                  <div className="space-y-1 flex-1 min-w-0">
                    <p className="text-sm font-medium leading-none truncate">
                      {log.userFullName || 'System'} <span className="text-muted-foreground font-normal">performed</span> {log.action} <span className="text-muted-foreground font-normal">on</span> {log.resource}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {format(new Date(log.createdAt), 'MMM d, yyyy HH:mm:ss')} • {log.ipAddress || 'Internal'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Security Posture</CardTitle>
            <CardDescription>Identity engine health</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="flex items-center">
                <div className="w-10 h-10 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mr-4">
                  <Activity className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium">Recent Logins</p>
                  <p className="text-2xl font-bold">{stats.recentLogins}</p>
                </div>
              </div>
              
              <div className="flex items-center">
                <div className="w-10 h-10 rounded bg-destructive/10 text-destructive flex items-center justify-center mr-4">
                  <UserX className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium">Suspended Accounts</p>
                  <p className="text-2xl font-bold">{stats.suspendedUsers || 0}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
