import { useState } from 'react';
import {
  useListTreasuryCollections,
  useListTreasuryFunds,
  useListTreasuryAccounts,
  useCreateTreasuryCollection,
  getListTreasuryCollectionsQueryKey,
  getListTreasuryFundsQueryKey,
  getListTreasuryAccountsQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Receipt, Plus, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

function formatPHP(val: string | number) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(val));
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive'> = {
  draft: 'secondary',
  posted: 'default',
  cancelled: 'destructive',
};

const PAYMENT_MODE_LABELS: Record<string, string> = {
  cash: 'Cash',
  check: 'Check',
  online: 'Online Transfer',
  pos: 'POS / Card',
};

export default function TreasuryCollections() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);

  // Form state
  const [fundId, setFundId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [orNumber, setOrNumber] = useState('');
  const [payerName, setPayerName] = useState('');
  const [payerAddress, setPayerAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [particulars, setParticulars] = useState('');
  const [paymentMode, setPaymentMode] = useState('cash');
  const [referenceNumber, setReferenceNumber] = useState('');

  const queryParams = statusFilter !== 'all' ? { status: statusFilter } : undefined;
  const { data: collections, isLoading } = useListTreasuryCollections(queryParams, {
    query: { queryKey: getListTreasuryCollectionsQueryKey(queryParams) },
  });
  const { data: funds } = useListTreasuryFunds(undefined, { query: { queryKey: getListTreasuryFundsQueryKey() } });
  const { data: accounts } = useListTreasuryAccounts(undefined, { query: { queryKey: getListTreasuryAccountsQueryKey() } });
  const createMutation = useCreateTreasuryCollection();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListTreasuryCollectionsQueryKey() });

  const filtered = collections?.filter((c) =>
    c.orNumber.toLowerCase().includes(search.toLowerCase()) ||
    c.payerName.toLowerCase().includes(search.toLowerCase()) ||
    c.particulars.toLowerCase().includes(search.toLowerCase())
  );

  const totalPosted = collections?.filter((c) => c.status === 'posted').reduce((s, c) => s + Number(c.amount), 0) ?? 0;

  const fundMap = Object.fromEntries((funds ?? []).map((f) => [f.id, f]));
  const accountMap = Object.fromEntries((accounts ?? []).map((a) => [a.id, a]));

  // Only revenue accounts for collections
  const revenueAccounts = (accounts ?? []).filter((a) => a.accountType === 'revenue');

  const resetForm = () => {
    setFundId(''); setAccountId(''); setOrNumber(''); setPayerName('');
    setPayerAddress(''); setAmount(''); setParticulars('');
    setPaymentMode('cash'); setReferenceNumber('');
  };

  const handleCreate = () => {
    if (!fundId || !accountId || !orNumber || !payerName || !amount || !particulars) {
      toast({ title: 'All required fields must be filled', variant: 'destructive' });
      return;
    }
    createMutation.mutate(
      {
        data: {
          tenantId: 1,
          fundId: Number(fundId),
          accountId: Number(accountId),
          orNumber,
          payerName,
          payerAddress: payerAddress || undefined,
          amount,
          particulars,
          paymentMode: paymentMode as 'cash' | 'check' | 'online' | 'pos',
          referenceNumber: referenceNumber || undefined,
          status: 'posted',
        },
      },
      {
        onSuccess: () => { invalidate(); setCreateOpen(false); resetForm(); toast({ title: 'Collection recorded and GL entry posted.' }); },
        onError: (e: unknown) => toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' }),
      }
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Collections</h1>
          <p className="text-sm text-muted-foreground mt-1">Official receipts for revenue collections. Each posted record automatically generates a GL entry.</p>
        </div>
        <Dialog open={createOpen} onOpenChange={(o) => { if (!o) resetForm(); setCreateOpen(o); }}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Issue Receipt</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Issue Official Receipt</DialogTitle>
              <DialogDescription>Record a revenue collection. The GL credit entry will be posted automatically upon saving.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Fund <span className="text-destructive">*</span></Label>
                  <Select value={fundId} onValueChange={(v) => setFundId(v as Parameters<typeof setFundId>[0])}>
                    <SelectTrigger><SelectValue placeholder="Select fund" /></SelectTrigger>
                    <SelectContent>
                      {(funds ?? []).map((f) => <SelectItem key={f.id} value={String(f.id)}>{f.code} — {f.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>OR Number <span className="text-destructive">*</span></Label>
                  <Input placeholder="2025-0001" value={orNumber} onChange={(e) => setOrNumber(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Revenue Account <span className="text-destructive">*</span></Label>
                <Select value={accountId} onValueChange={(v) => setAccountId(v as Parameters<typeof setAccountId>[0])}>
                  <SelectTrigger><SelectValue placeholder="Select revenue account" /></SelectTrigger>
                  <SelectContent>
                    {revenueAccounts.length === 0 ? (
                      <SelectItem value="_" disabled>No revenue accounts — add them in Chart of Accounts</SelectItem>
                    ) : (
                      revenueAccounts.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.accountCode} — {a.accountName}</SelectItem>)
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Payer Name <span className="text-destructive">*</span></Label>
                  <Input placeholder="Juan dela Cruz" value={payerName} onChange={(e) => setPayerName(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Amount (₱) <span className="text-destructive">*</span></Label>
                  <Input type="number" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Payer Address</Label>
                <Input placeholder="Address (optional)" value={payerAddress} onChange={(e) => setPayerAddress(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Particulars <span className="text-destructive">*</span></Label>
                <Input placeholder="Nature of payment, e.g. Business Permit Fee" value={particulars} onChange={(e) => setParticulars(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Payment Mode</Label>
                  <Select value={paymentMode} onValueChange={(v) => setPaymentMode(v as Parameters<typeof setPaymentMode>[0])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="check">Check</SelectItem>
                      <SelectItem value="online">Online Transfer</SelectItem>
                      <SelectItem value="pos">POS / Card</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Reference Number</Label>
                  <Input placeholder="Check / txn ref" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { resetForm(); setCreateOpen(false); }}>Cancel</Button>
              <Button disabled={createMutation.isPending} onClick={handleCreate}>
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Post Receipt
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground bg-card border border-border rounded-md px-4 py-3">
        <Receipt className="h-4 w-4 text-emerald-500" />
        <span>Total posted collections: <strong className="text-emerald-600 text-base">{formatPHP(totalPosted)}</strong></span>
        <span>•</span>
        <span>{filtered?.filter((c) => c.status === 'posted').length ?? 0} official receipts</span>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by OR#, payer, or particulars..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as Parameters<typeof setStatusFilter>[0])}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Filter by status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="posted">Posted</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card border border-border rounded-md shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>OR Number</TableHead>
              <TableHead>Payer</TableHead>
              <TableHead>Particulars</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Fund</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={9} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></TableCell></TableRow>
            ) : filtered?.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="h-24 text-center text-muted-foreground">No collections found.</TableCell></TableRow>
            ) : (
              filtered?.map((c) => (
                <TableRow key={c.id} className="hover-elevate">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Receipt className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-mono font-medium text-sm">{c.orNumber}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">{c.payerName}</div>
                    {c.payerAddress && <div className="text-xs text-muted-foreground">{c.payerAddress}</div>}
                  </TableCell>
                  <TableCell className="text-sm max-w-[180px] truncate">{c.particulars}</TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">
                    {accountMap[c.accountId]?.accountCode ?? c.accountId}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {fundMap[c.fundId]?.code ?? c.fundId}
                  </TableCell>
                  <TableCell className="text-xs">{PAYMENT_MODE_LABELS[c.paymentMode] ?? c.paymentMode}</TableCell>
                  <TableCell className="text-right font-medium text-emerald-600">{formatPHP(c.amount)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{format(new Date(c.collectedAt), 'PP')}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[c.status] ?? 'secondary'}>{c.status}</Badge>
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
