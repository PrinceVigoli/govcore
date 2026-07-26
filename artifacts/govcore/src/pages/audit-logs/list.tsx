import { useState } from 'react';
import { useListAuditLogs } from '@workspace/api-client-react';
import { format } from 'date-fns';
import { ScrollText, Search, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

const actionVariant = (action: string): 'default' | 'destructive' | 'secondary' => {
  if (action === 'delete') return 'destructive';
  if (action === 'create') return 'default';
  return 'secondary';
};

export default function AuditLogsList() {
  const [search, setSearch] = useState('');
  const { data: logs, isLoading } = useListAuditLogs({ limit: 100 });

  const filteredLogs = Array.isArray(logs)
    ? logs.filter(
        (log) =>
          log.resource.toLowerCase().includes(search.toLowerCase()) ||
          log.action.toLowerCase().includes(search.toLowerCase()) ||
          (log.userFullName ?? '').toLowerCase().includes(search.toLowerCase()) ||
          (log.resourceId ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Logs</h1>
        <p className="text-sm text-muted-foreground mt-1">
          A record of who did what, across the platform.
        </p>
      </div>

      <div className="flex items-center space-x-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search audit logs..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-card border border-border rounded-md shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Action</TableHead>
              <TableHead>Resource</TableHead>
              <TableHead>Resource ID</TableHead>
              <TableHead>User</TableHead>
              <TableHead>IP Address</TableHead>
              <TableHead>When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                </TableCell>
              </TableRow>
            ) : filteredLogs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No audit log entries found.
                </TableCell>
              </TableRow>
            ) : (
              filteredLogs.map((log) => (
                <TableRow key={log.id} className="hover-elevate">
                  <TableCell>
                    <Badge variant={actionVariant(log.action)}>{log.action}</Badge>
                  </TableCell>
                  <TableCell className="font-medium">
                    <div className="flex items-center">
                      <ScrollText className="h-4 w-4 mr-2 text-muted-foreground" />
                      {log.resource}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{log.resourceId || '-'}</TableCell>
                  <TableCell className="text-sm">{log.userFullName || '-'}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{log.ipAddress || '-'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {format(new Date(log.createdAt), 'MMM d, yyyy h:mm a')}
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
