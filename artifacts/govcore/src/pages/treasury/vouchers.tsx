import { useState } from 'react';
import { Link } from 'wouter';
import {
  useListTreasuryVouchers,
  useListTreasuryFunds,
  useCreateTreasuryVoucher,
  useApproveTreasuryVoucher,
  useCancelTreasuryVoucher,
  getListTreasuryVouchersQueryKey,
  getListTreasuryFundsQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { FileText, Plus, Loader2, Search, CheckCircle, XCircle } from 'lucide-react';
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

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'secondary',
  for_approval: 'default',
  approved: 'default',
  paid: 'outline',
  cancelled: 'destructive',
};

const STATUS_OPTIONS = ['draft', 'for_approval', 'approved', 'paid', 'cancelled'];

export default function TreasuryVouchers() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);

  // Form state
  const [fundId, setFundId] = useState('');
  const [voucherNumber, setVoucherNumber] = useState('');
  const [voucherType, setVoucherType] = useState('disbursement');
  const [payeeName, setPayeeName] = useState('');
  const [payeeAddress, setPayeeAddress] = useState('');
  const [tinNumber, setTinNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [modeOfPayment, setModeOfPayment] = useState('check');

  const queryParams = statusFilter !== 'all' ? { status: statusFilter } : undefined;
  const { data: vouchers, isLoading } = useListTreasuryVouchers(queryParams, {
    query: { queryKey: getListTreasuryVouchersQueryKey(queryParams) },
  });
  const { data: funds } = useListTreasuryFunds(undefined, { query: { queryKey: getListTreasuryFundsQueryKey() } });
  const createMutation = useCreateTreasuryVoucher();
  const approveMutation = useApproveTreasuryVoucher();
  const cancelMutation = useCancelTreasuryVoucher();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListTreasuryVouchersQueryKey() });

  const filtered = vouchers?.filter((v) =>
    v.voucherNumber.toLowerCase().includes(search.toLowerCase()) ||
    v.payeeName.toLowerCase().includes(search.toLowerCase()) ||
    v.description.toLowerCase().includes(search.toLowerCase())
  );

  const resetForm = () => {
    setFundId(''); setVoucherNumber(''); setVoucherType('disbursement');
    setPayeeName(''); setPayeeAddress(''); setTinNumber('');
    setAmount(''); setDescription(''); setModeOfPayment('check');
  };

  const handleCreate = () => {
    if (!fundId || !voucherNumber || !payeeName || !amount || !description) {
      toast({ title: 'All required fields must be filled', variant: 'destructive' });
      return;
    }
    createMutation.mutate(
      { data: { tenantId: 1, fundId: Number(fundId), voucherNumber, voucherType: voucherType as 'disbursement' | 'payroll' | 'petty_cash' | 'reimbursement', payeeName, payeeAddress: payeeAddress || undefined, tinNumber: tinNumber || undefined, amount, description, modeOfPayment: modeOfPayment as 'check' | 'ada' | 'cash', status: 'draft' } },
      {
        onSuccess: () => { invalidate(); setCreateOpen(false); resetForm(); toast({ title: 'Voucher created' }); },
        onError: (e: unknown) => toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' }),
      }
    );
  };

  const handleApprove = (id: number, num: string) => {
    if (!confirm(`Approve voucher ${num}?`)) return;
    approveMutation.mutate({ id }, {
      onSuccess: () => { invalidate(); toast({ title: `Voucher ${num} approved` }); },
      onError: (e: unknown) => toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' }),
    });
  };

  const handleCancel = (id: number, num: string) => {
    const reason = prompt(`Reason for cancelling ${num}:`);
    if (reason === null) return;
    cancelMutation.mutate({ id, reason }, {
      onSuccess: () => { invalidate(); toast({ title: `Voucher ${num} cancelled` }); },
      onError: (e: unknown) => toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' }),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Disbursement Vouchers</h1>
          <p className="text-sm text-muted-foreground mt-1">All government payments must be covered by an approved DV before cash is released.</p>
        </div>
        <Dialog open={createOpen} onOpenChange={(o) => { if (!o) resetForm(); setCreateOpen(o); }}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />New Voucher</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Disbursement Voucher</DialogTitle>
              <DialogDescription>A DV will be created in draft status. Submit for approval from the detail view.</DialogDescription>
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
                  <Label>Voucher Type</Label>
                  <Select value={voucherType} onValueChange={(v) => setVoucherType(v as Parameters<typeof setVoucherType>[0])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="disbursement">Disbursement</SelectItem>
                      <SelectItem value="payroll">Payroll</SelectItem>
                      <SelectItem value="petty_cash">Petty Cash</SelectItem>
                      <SelectItem value="reimbursement">Reimbursement</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Voucher Number <span className="text-destructive">*</span></Label>
                <Input placeholder="DV-2025-00001" value={voucherNumber} onChange={(e) => setVoucherNumber(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Payee Name <span className="text-destructive">*</span></Label>
                  <Input placeholder="Juan dela Cruz" value={payeeName} onChange={(e) => setPayeeName(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>TIN Number</Label>
                  <Input placeholder="123-456-789" value={tinNumber} onChange={(e) => setTinNumber(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Payee Address</Label>
                <Input placeholder="Address" value={payeeAddress} onChange={(e) => setPayeeAddress(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Amount (₱) <span className="text-destructive">*</span></Label>
                  <Input type="number" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Mode of Payment</Label>
                  <Select value={modeOfPayment} onValueChange={(v) => setModeOfPayment(v as Parameters<typeof setModeOfPayment>[0])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="check">Check</SelectItem>
                      <SelectItem value="ada">ADA (Bank Transfer)</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Description / Nature of Payment <span className="text-destructive">*</span></Label>
                <Input placeholder="Payment for office supplies" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { resetForm(); setCreateOpen(false); }}>Cancel</Button>
              <Button disabled={createMutation.isPending} onClick={handleCreate}>
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Draft
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search vouchers..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as Parameters<typeof setStatusFilter>[0])}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Filter by status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card border border-border rounded-md shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Voucher No.</TableHead>
              <TableHead>Payee</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></TableCell></TableRow>
            ) : filtered?.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">No vouchers found.</TableCell></TableRow>
            ) : (
              filtered?.map((v) => (
                <TableRow key={v.id} className="hover-elevate">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div>
                        <div className="font-mono font-medium text-sm">{v.voucherNumber}</div>
                        <div className="text-xs text-muted-foreground line-clamp-1">{v.description}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">{v.payeeName}</div>
                    {v.tinNumber && <div className="text-xs text-muted-foreground">TIN: {v.tinNumber}</div>}
                  </TableCell>
                  <TableCell className="text-sm capitalize">{v.voucherType.replace('_', ' ')}</TableCell>
                  <TableCell className="text-right font-medium">{formatPHP(v.amount)}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[v.status] ?? 'secondary'}>{v.status.replace('_', ' ')}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{format(new Date(v.createdAt), 'PP')}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Link href={`/treasury/vouchers/${v.id}`}>
                      <Button variant="ghost" size="sm">Open</Button>
                    </Link>
                    {v.status === 'for_approval' && (
                      <Button variant="ghost" size="sm" onClick={() => handleApprove(v.id, v.voucherNumber)}>
                        <CheckCircle className="h-4 w-4 text-emerald-600" />
                      </Button>
                    )}
                    {(v.status === 'draft' || v.status === 'for_approval') && (
                      <Button variant="ghost" size="sm" onClick={() => handleCancel(v.id, v.voucherNumber)}>
                        <XCircle className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
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
