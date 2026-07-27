import { useState } from 'react';
import {
  useListTreasuryBudgets,
  useListTreasuryFunds,
  useListTreasuryAccounts,
  useCreateTreasuryBudget,
  useUpdateTreasuryBudget,
  useDeleteTreasuryBudget,
  getListTreasuryBudgetsQueryKey,
  getListTreasuryFundsQueryKey,
  getListTreasuryAccountsQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { TrendingUp, Plus, Loader2, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import type { TreasuryBudget } from '@workspace/api-client-react';

function formatPHP(val: string | number) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(val));
}

function utilization(used: string, total: string) {
  const t = Number(total);
  if (t === 0) return 0;
  return Math.min(100, (Number(used) / t) * 100);
}

function BudgetForm({
  initial,
  funds,
  accounts,
  onSave,
  onCancel,
  loading,
}: {
  initial?: Partial<TreasuryBudget>;
  funds: { id: number; name: string; code: string }[];
  accounts: { id: number; accountCode: string; accountName: string }[];
  onSave: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const currentYear = new Date().getFullYear();
  const [fundId, setFundId] = useState(String(initial?.fundId ?? ''));
  const [accountId, setAccountId] = useState(String(initial?.accountId ?? ''));
  const [fiscalYear, setFiscalYear] = useState(String(initial?.fiscalYear ?? currentYear));
  const [appropriatedAmount, setAppropriatedAmount] = useState(initial?.appropriatedAmount ?? '0');
  const [allottedAmount, setAllottedAmount] = useState(initial?.allottedAmount ?? '0');
  const [remarks, setRemarks] = useState(initial?.remarks ?? '');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Fund</Label>
          <Select value={fundId} onValueChange={(v) => setFundId(v as Parameters<typeof setFundId>[0])}>
            <SelectTrigger><SelectValue placeholder="Select fund" /></SelectTrigger>
            <SelectContent>
              {funds.map((f) => <SelectItem key={f.id} value={String(f.id)}>{f.code} — {f.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Fiscal Year</Label>
          <Input type="number" placeholder="2025" value={fiscalYear} onChange={(e) => setFiscalYear(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Account (Object of Expenditure)</Label>
        <Select value={accountId} onValueChange={(v) => setAccountId(v as Parameters<typeof setAccountId>[0])}>
          <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
          <SelectContent>
            {accounts.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.accountCode} — {a.accountName}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Appropriated Amount (₱)</Label>
          <Input type="number" placeholder="0.00" value={appropriatedAmount} onChange={(e) => setAppropriatedAmount(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Allotted Amount (₱)</Label>
          <Input type="number" placeholder="0.00" value={allottedAmount} onChange={(e) => setAllottedAmount(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Remarks</Label>
        <Input placeholder="Optional remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button
          disabled={loading || !fundId || !accountId || !fiscalYear}
          onClick={() => onSave({
            tenantId: 1, fundId: Number(fundId), accountId: Number(accountId),
            fiscalYear: Number(fiscalYear), appropriatedAmount, allottedAmount,
            obligatedAmount: initial?.obligatedAmount ?? '0',
            disbursedAmount: initial?.disbursedAmount ?? '0',
            remarks, status: initial?.status ?? 'active',
          })}
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Budget
        </Button>
      </DialogFooter>
    </div>
  );
}

export default function TreasuryBudgets() {
  const currentYear = new Date().getFullYear();
  const [yearFilter, setYearFilter] = useState(String(currentYear));
  const [createOpen, setCreateOpen] = useState(false);
  const [editBudget, setEditBudget] = useState<TreasuryBudget | null>(null);

  const params = { fiscalYear: Number(yearFilter) || undefined };
  const { data: budgets, isLoading } = useListTreasuryBudgets(params, { query: { queryKey: getListTreasuryBudgetsQueryKey(params) } });
  const { data: funds } = useListTreasuryFunds(undefined, { query: { queryKey: getListTreasuryFundsQueryKey() } });
  const { data: accounts } = useListTreasuryAccounts(undefined, { query: { queryKey: getListTreasuryAccountsQueryKey() } });
  const createMutation = useCreateTreasuryBudget();
  const updateMutation = useUpdateTreasuryBudget();
  const deleteMutation = useDeleteTreasuryBudget();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListTreasuryBudgetsQueryKey() });
  const fundMap = Object.fromEntries((funds ?? []).map((f) => [f.id, f]));
  const accountMap = Object.fromEntries((accounts ?? []).map((a) => [a.id, a]));

  const totalAppropriated = budgets?.reduce((s, b) => s + Number(b.appropriatedAmount), 0) ?? 0;
  const totalObligated = budgets?.reduce((s, b) => s + Number(b.obligatedAmount), 0) ?? 0;
  const totalDisbursed = budgets?.reduce((s, b) => s + Number(b.disbursedAmount), 0) ?? 0;

  const handleCreate = (data: Record<string, unknown>) => {
    createMutation.mutate({ data: data as unknown as Parameters<typeof createMutation.mutate>[0]['data'] }, {
      onSuccess: () => { invalidate(); setCreateOpen(false); toast({ title: 'Budget entry created' }); },
      onError: (e: unknown) => toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' }),
    });
  };

  const handleUpdate = (data: Record<string, unknown>) => {
    if (!editBudget) return;
    updateMutation.mutate({ id: editBudget.id, data: data as unknown as Parameters<typeof updateMutation.mutate>[0]['data'] }, {
      onSuccess: () => { invalidate(); setEditBudget(null); toast({ title: 'Budget updated' }); },
      onError: (e: unknown) => toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' }),
    });
  };

  const handleDelete = (b: TreasuryBudget) => {
    if (!confirm('Delete this budget entry?')) return;
    deleteMutation.mutate({ id: b.id }, {
      onSuccess: () => { invalidate(); toast({ title: 'Budget deleted' }); },
      onError: (e: unknown) => toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' }),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Budget</h1>
          <p className="text-sm text-muted-foreground mt-1">Annual appropriations, allotments, obligations, and disbursements per account.</p>
        </div>
        <div className="flex items-center gap-2">
          <Input className="w-24" type="number" value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} placeholder="Year" />
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" />New Entry</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Add Budget Entry</DialogTitle>
                <DialogDescription>Create an appropriation line for a fund and object of expenditure.</DialogDescription>
              </DialogHeader>
              <BudgetForm funds={funds ?? []} accounts={accounts ?? []} onSave={handleCreate} onCancel={() => setCreateOpen(false)} loading={createMutation.isPending} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Appropriated', value: totalAppropriated, color: 'text-foreground' },
          { label: 'Total Obligated', value: totalObligated, color: 'text-amber-600' },
          { label: 'Total Disbursed', value: totalDisbursed, color: 'text-rose-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-card border border-border rounded-md p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`text-lg font-bold mt-1 ${color}`}>{formatPHP(value)}</p>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-md shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Account</TableHead>
              <TableHead>Fund</TableHead>
              <TableHead className="text-right">Appropriated</TableHead>
              <TableHead className="text-right">Obligated</TableHead>
              <TableHead className="text-right">Disbursed</TableHead>
              <TableHead>Utilization</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></TableCell></TableRow>
            ) : budgets?.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="h-24 text-center text-muted-foreground">No budget entries for {yearFilter}.</TableCell></TableRow>
            ) : (
              budgets?.map((b) => {
                const pct = utilization(b.disbursedAmount, b.appropriatedAmount);
                const acct = accountMap[b.accountId];
                const fund = fundMap[b.fundId];
                return (
                  <TableRow key={b.id} className="hover-elevate">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div>
                          <div className="font-medium text-sm">{acct?.accountName ?? `Account #${b.accountId}`}</div>
                          <div className="text-xs text-muted-foreground font-mono">{acct?.accountCode}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fund?.code ?? b.fundId}</TableCell>
                    <TableCell className="text-right text-sm">{formatPHP(b.appropriatedAmount)}</TableCell>
                    <TableCell className="text-right text-sm text-amber-600">{formatPHP(b.obligatedAmount)}</TableCell>
                    <TableCell className="text-right text-sm text-rose-600">{formatPHP(b.disbursedAmount)}</TableCell>
                    <TableCell>
                      <div className="w-24">
                        <Progress value={pct} className="h-2" />
                        <div className="text-xs text-muted-foreground mt-1">{pct.toFixed(0)}%</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={b.status === 'active' ? 'default' : 'secondary'}>{b.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button variant="ghost" size="sm" onClick={() => setEditBudget(b)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(b)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editBudget} onOpenChange={(o) => { if (!o) setEditBudget(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Budget Entry</DialogTitle>
            <DialogDescription>Update appropriation amounts and status.</DialogDescription>
          </DialogHeader>
          {editBudget && (
            <BudgetForm
              initial={editBudget}
              funds={funds ?? []}
              accounts={accounts ?? []}
              onSave={handleUpdate}
              onCancel={() => setEditBudget(null)}
              loading={updateMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
