import { useState } from 'react';
import {
  useListTreasuryAccounts,
  useListTreasuryFunds,
  useCreateTreasuryAccount,
  useUpdateTreasuryAccount,
  useDeleteTreasuryAccount,
  getListTreasuryAccountsQueryKey,
  getListTreasuryFundsQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Wallet, Plus, Loader2, Pencil, Trash2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import type { TreasuryAccount } from '@workspace/api-client-react';

const ACCOUNT_TYPE_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  asset: 'default',
  liability: 'secondary',
  equity: 'secondary',
  revenue: 'outline',
  expense: 'outline',
};

function AccountForm({
  initial,
  funds,
  onSave,
  onCancel,
  loading,
}: {
  initial?: Partial<TreasuryAccount>;
  funds: { id: number; name: string; code: string }[];
  onSave: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [fundId, setFundId] = useState(String(initial?.fundId ?? ''));
  const [accountCode, setAccountCode] = useState(initial?.accountCode ?? '');
  const [accountName, setAccountName] = useState(initial?.accountName ?? '');
  const [accountType, setAccountType] = useState(initial?.accountType ?? 'asset');
  const [normalBalance, setNormalBalance] = useState(initial?.normalBalance ?? 'debit');
  const [description, setDescription] = useState(initial?.description ?? '');

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Fund</Label>
        <Select value={fundId} onValueChange={(v) => setFundId(v as Parameters<typeof setFundId>[0])}>
          <SelectTrigger><SelectValue placeholder="Select fund" /></SelectTrigger>
          <SelectContent>
            {funds.map((f) => (
              <SelectItem key={f.id} value={String(f.id)}>{f.code} — {f.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Account Code</Label>
          <Input placeholder="1-01-01-010" value={accountCode} onChange={(e) => setAccountCode(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Account Name</Label>
          <Input placeholder="Cash in Vault" value={accountName} onChange={(e) => setAccountName(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Account Type</Label>
          <Select value={accountType} onValueChange={(v) => setAccountType(v as Parameters<typeof setAccountType>[0])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="asset">Asset</SelectItem>
              <SelectItem value="liability">Liability</SelectItem>
              <SelectItem value="equity">Equity</SelectItem>
              <SelectItem value="revenue">Revenue</SelectItem>
              <SelectItem value="expense">Expense</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Normal Balance</Label>
          <Select value={normalBalance} onValueChange={(v) => setNormalBalance(v as Parameters<typeof setNormalBalance>[0])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="debit">Debit</SelectItem>
              <SelectItem value="credit">Credit</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label>Description</Label>
        <Input placeholder="Optional description" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button
          disabled={loading || !fundId || !accountCode || !accountName}
          onClick={() => onSave({ tenantId: 1, fundId: Number(fundId), accountCode, accountName, accountType, normalBalance, description, status: 'active' })}
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Account
        </Button>
      </DialogFooter>
    </div>
  );
}

export default function TreasuryAccounts() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<TreasuryAccount | null>(null);

  const { data: accounts, isLoading } = useListTreasuryAccounts(undefined, { query: { queryKey: getListTreasuryAccountsQueryKey() } });
  const { data: funds } = useListTreasuryFunds(undefined, { query: { queryKey: getListTreasuryFundsQueryKey() } });
  const createMutation = useCreateTreasuryAccount();
  const updateMutation = useUpdateTreasuryAccount();
  const deleteMutation = useDeleteTreasuryAccount();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListTreasuryAccountsQueryKey() });

  const filtered = accounts?.filter((a) => {
    const matchSearch = a.accountCode.toLowerCase().includes(search.toLowerCase()) || a.accountName.toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === 'all' || a.accountType === typeFilter;
    return matchSearch && matchType;
  });

  const fundMap = Object.fromEntries((funds ?? []).map((f) => [f.id, f]));

  const handleCreate = (data: Record<string, unknown>) => {
    createMutation.mutate({ data: data as unknown as Parameters<typeof createMutation.mutate>[0]['data'] }, {
      onSuccess: () => { invalidate(); setCreateOpen(false); toast({ title: 'Account created' }); },
      onError: (e: unknown) => toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' }),
    });
  };

  const handleUpdate = (data: Record<string, unknown>) => {
    if (!editAccount) return;
    updateMutation.mutate({ id: editAccount.id, data: data as unknown as Parameters<typeof updateMutation.mutate>[0]['data'] }, {
      onSuccess: () => { invalidate(); setEditAccount(null); toast({ title: 'Account updated' }); },
      onError: (e: unknown) => toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' }),
    });
  };

  const handleDelete = (a: TreasuryAccount) => {
    if (!confirm(`Delete account "${a.accountCode} — ${a.accountName}"?`)) return;
    deleteMutation.mutate({ id: a.id }, {
      onSuccess: () => { invalidate(); toast({ title: 'Account deleted' }); },
      onError: (e: unknown) => toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' }),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Chart of Accounts</h1>
          <p className="text-sm text-muted-foreground mt-1">NGAS account codes for assets, liabilities, equity, revenue, and expenses.</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />New Account</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Account</DialogTitle>
              <DialogDescription>Create a new COA entry following NGAS account coding.</DialogDescription>
            </DialogHeader>
            <AccountForm funds={funds ?? []} onSave={handleCreate} onCancel={() => setCreateOpen(false)} loading={createMutation.isPending} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search accounts..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as Parameters<typeof setTypeFilter>[0])}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Filter by type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="asset">Asset</SelectItem>
            <SelectItem value="liability">Liability</SelectItem>
            <SelectItem value="equity">Equity</SelectItem>
            <SelectItem value="revenue">Revenue</SelectItem>
            <SelectItem value="expense">Expense</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card border border-border rounded-md shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Account Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Normal Balance</TableHead>
              <TableHead>Fund</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></TableCell></TableRow>
            ) : filtered?.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">No accounts found.</TableCell></TableRow>
            ) : (
              filtered?.map((a) => (
                <TableRow key={a.id} className="hover-elevate">
                  <TableCell className="font-mono text-sm font-medium">{a.accountCode}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Wallet className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div>
                        <div className="font-medium">{a.accountName}</div>
                        {a.description && <div className="text-xs text-muted-foreground">{a.description}</div>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={ACCOUNT_TYPE_VARIANT[a.accountType] ?? 'outline'} className="capitalize">{a.accountType}</Badge>
                  </TableCell>
                  <TableCell className="capitalize text-sm">{a.normalBalance}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {fundMap[a.fundId] ? `${fundMap[a.fundId].code} — ${fundMap[a.fundId].name}` : a.fundId}
                  </TableCell>
                  <TableCell>
                    <Badge variant={a.status === 'active' ? 'default' : 'secondary'}>{a.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button variant="ghost" size="sm" onClick={() => setEditAccount(a)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(a)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editAccount} onOpenChange={(o) => { if (!o) setEditAccount(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Account</DialogTitle>
            <DialogDescription>Update COA entry details.</DialogDescription>
          </DialogHeader>
          {editAccount && (
            <AccountForm
              initial={editAccount}
              funds={funds ?? []}
              onSave={handleUpdate}
              onCancel={() => setEditAccount(null)}
              loading={updateMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
