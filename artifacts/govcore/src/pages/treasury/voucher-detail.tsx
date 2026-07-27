import { useState } from 'react';
import { useRoute, Link } from 'wouter';
import {
  useGetTreasuryVoucher,
  useListTreasuryAccounts,
  useApproveTreasuryVoucher,
  usePayTreasuryVoucher,
  useCancelTreasuryVoucher,
  useUpdateTreasuryVoucher,
  getGetTreasuryVoucherQueryKey,
  getListTreasuryAccountsQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ChevronLeft, Loader2, CheckCircle, Banknote, XCircle, FileText, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
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

export default function VoucherDetail() {
  const [, params] = useRoute('/treasury/vouchers/:id');
  const id = Number(params?.id);

  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [checkNumber, setCheckNumber] = useState('');

  const qk = getGetTreasuryVoucherQueryKey(id);
  const { data: voucher, isLoading } = useGetTreasuryVoucher(id, { query: { queryKey: qk } });
  const { data: accounts } = useListTreasuryAccounts(undefined, { query: { queryKey: getListTreasuryAccountsQueryKey() } });

  const approveMutation = useApproveTreasuryVoucher();
  const payMutation = usePayTreasuryVoucher();
  const cancelMutation = useCancelTreasuryVoucher();
  const updateMutation = useUpdateTreasuryVoucher();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: qk });

  const accountMap = Object.fromEntries((accounts ?? []).map((a) => [a.id, a]));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!voucher) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <FileText className="h-10 w-10 mx-auto mb-4 opacity-30" />
        <p>Voucher not found.</p>
        <Link href="/treasury/vouchers"><Button variant="outline" className="mt-4">Back to Vouchers</Button></Link>
      </div>
    );
  }

  const handleSubmitForApproval = () => {
    updateMutation.mutate({ id, data: { status: 'for_approval' } }, {
      onSuccess: () => { invalidate(); toast({ title: 'Voucher submitted for approval' }); },
      onError: (e: unknown) => toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' }),
    });
  };

  const handleApprove = () => {
    if (!confirm(`Approve voucher ${voucher.voucherNumber}?`)) return;
    approveMutation.mutate({ id }, {
      onSuccess: () => { invalidate(); toast({ title: 'Voucher approved' }); },
      onError: (e: unknown) => toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' }),
    });
  };

  const handlePay = () => {
    payMutation.mutate({ id, checkNumber: checkNumber || undefined }, {
      onSuccess: () => { invalidate(); setPayDialogOpen(false); setCheckNumber(''); toast({ title: 'Voucher marked as paid. GL entries posted.' }); },
      onError: (e: unknown) => toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' }),
    });
  };

  const handleCancel = () => {
    const reason = prompt('Reason for cancellation:');
    if (reason === null) return;
    cancelMutation.mutate({ id, reason }, {
      onSuccess: () => { invalidate(); toast({ title: 'Voucher cancelled' }); },
      onError: (e: unknown) => toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' }),
    });
  };

  const totalItems = (voucher.items ?? []).reduce((s, i) => s + Number(i.amount), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/treasury/vouchers">
            <Button variant="ghost" size="icon"><ChevronLeft className="h-5 w-5" /></Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight font-mono">{voucher.voucherNumber}</h1>
              <Badge variant={STATUS_VARIANT[voucher.status] ?? 'secondary'}>{voucher.status.replace('_', ' ')}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">{voucher.description}</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 shrink-0">
          {voucher.status === 'draft' && (
            <Button variant="outline" onClick={handleSubmitForApproval} disabled={updateMutation.isPending}>
              <Send className="mr-2 h-4 w-4" /> Submit for Approval
            </Button>
          )}
          {voucher.status === 'for_approval' && (
            <Button onClick={handleApprove} disabled={approveMutation.isPending}>
              <CheckCircle className="mr-2 h-4 w-4" /> Approve
            </Button>
          )}
          {voucher.status === 'approved' && (
            <Button onClick={() => setPayDialogOpen(true)} disabled={payMutation.isPending}>
              <Banknote className="mr-2 h-4 w-4" /> Mark as Paid
            </Button>
          )}
          {(voucher.status === 'draft' || voucher.status === 'for_approval') && (
            <Button variant="outline" onClick={handleCancel} disabled={cancelMutation.isPending}>
              <XCircle className="mr-2 h-4 w-4 text-destructive" /> Cancel
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Payee & Payment Details */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Payee Information</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground text-xs mb-0.5">Payee Name</p>
                <p className="font-medium">{voucher.payeeName}</p>
              </div>
              {voucher.payeeAddress && (
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">Address</p>
                  <p>{voucher.payeeAddress}</p>
                </div>
              )}
              {voucher.tinNumber && (
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">TIN Number</p>
                  <p className="font-mono">{voucher.tinNumber}</p>
                </div>
              )}
              <div>
                <p className="text-muted-foreground text-xs mb-0.5">Mode of Payment</p>
                <p className="capitalize">{voucher.modeOfPayment}</p>
              </div>
              {voucher.checkNumber && (
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">Check Number</p>
                  <p className="font-mono">{voucher.checkNumber}</p>
                </div>
              )}
              {voucher.paidAt && (
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">Paid At</p>
                  <p>{format(new Date(voucher.paidAt), 'PPpp')}</p>
                </div>
              )}
              {voucher.cancellationReason && (
                <div className="col-span-2">
                  <p className="text-muted-foreground text-xs mb-0.5">Cancellation Reason</p>
                  <p className="text-destructive">{voucher.cancellationReason}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Line Items */}
          <Card>
            <CardHeader><CardTitle className="text-base">Line Items</CardTitle></CardHeader>
            <CardContent className="p-0">
              {(voucher.items ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No line items. Add them by updating this voucher.</p>
              ) : (
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(voucher.items ?? []).map((item) => {
                      const acct = accountMap[item.accountId];
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="text-xs">
                            <div className="font-mono">{acct?.accountCode ?? item.accountId}</div>
                            <div className="text-muted-foreground">{acct?.accountName}</div>
                          </TableCell>
                          <TableCell className="text-sm">{item.description}</TableCell>
                          <TableCell className="text-right font-medium">{formatPHP(item.amount)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={2} className="font-semibold">Total</TableCell>
                      <TableCell className="text-right font-bold">{formatPHP(totalItems)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Summary Card */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Voucher Summary</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Voucher No.</span>
                <span className="font-mono font-medium">{voucher.voucherNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Type</span>
                <span className="capitalize">{voucher.voucherType.replace('_', ' ')}</span>
              </div>
              <Separator />
              <div className="flex justify-between text-base">
                <span className="font-semibold">Total Amount</span>
                <span className="font-bold">{formatPHP(voucher.amount)}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span>{format(new Date(voucher.createdAt), 'PP')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Updated</span>
                <span>{format(new Date(voucher.updatedAt), 'PP')}</span>
              </div>
            </CardContent>
          </Card>

          {/* Certification Block */}
          <Card>
            <CardHeader><CardTitle className="text-base">Certification</CardTitle></CardHeader>
            <CardContent className="space-y-4 text-xs text-muted-foreground">
              <div className="border-b border-dashed pb-3">
                <p className="font-semibold text-foreground mb-1">A — Availability of Cash</p>
                <p>Cash available in the amount stated above.</p>
                <div className="mt-3 border-t border-border pt-2 text-center">
                  <p>Treasurer</p>
                </div>
              </div>
              <div>
                <p className="font-semibold text-foreground mb-1">B — Legality / Propriety</p>
                <p>Supporting documents complete and proper; lawful expenditure charged to proper accounts.</p>
                <div className="mt-3 border-t border-border pt-2 text-center">
                  <p>Accountant</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Pay Dialog */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Voucher as Paid</DialogTitle>
            <DialogDescription>
              This will post GL transactions for all line items and lock the voucher. Amount: <strong>{formatPHP(voucher.amount)}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Check / Reference Number</Label>
            <Input placeholder="Optional — e.g. check number" value={checkNumber} onChange={(e) => setCheckNumber(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialogOpen(false)}>Cancel</Button>
            <Button onClick={handlePay} disabled={payMutation.isPending}>
              {payMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
