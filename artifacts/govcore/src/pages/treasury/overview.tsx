import { Link } from 'wouter';
import {
  useGetTreasuryStats,
  getGetTreasuryStatsQueryKey,
  useListTreasuryVouchers,
  getListTreasuryVouchersQueryKey,
  useListTreasuryCollections,
  getListTreasuryCollectionsQueryKey,
} from '@workspace/api-client-react';
import { format } from 'date-fns';
import {
  Banknote,
  TrendingUp,
  TrendingDown,
  Wallet,
  FileText,
  Receipt,
  AlertCircle,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'secondary',
  for_approval: 'default',
  approved: 'default',
  paid: 'outline',
  cancelled: 'destructive',
  posted: 'default',
};

function formatPHP(val: string | number) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(val));
}

export default function TreasuryOverview() {
  const { data: stats, isLoading: statsLoading } = useGetTreasuryStats(undefined, {
    query: { queryKey: getGetTreasuryStatsQueryKey() },
  });

  const { data: vouchers, isLoading: vouchersLoading } = useListTreasuryVouchers(undefined, {
    query: { queryKey: getListTreasuryVouchersQueryKey() },
  });

  const { data: collections, isLoading: collectionsLoading } = useListTreasuryCollections(undefined, {
    query: { queryKey: getListTreasuryCollectionsQueryKey() },
  });

  const recentVouchers = vouchers?.slice(0, 5) ?? [];
  const recentCollections = collections?.slice(0, 5) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Treasury</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Fund management, disbursements, collections, and the general ledger.
        </p>
      </div>

      {/* Stats */}
      {statsLoading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Cash Balance</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatPHP(stats?.cashBalance ?? '0')}</div>
              <p className="text-xs text-muted-foreground mt-1">Collections minus disbursements</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Collections</CardTitle>
              <TrendingUp className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600">{formatPHP(stats?.totalCollections ?? '0')}</div>
              <p className="text-xs text-muted-foreground mt-1">{stats?.totalCollectionRecords ?? 0} official receipts</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Disbursed</CardTitle>
              <TrendingDown className="h-4 w-4 text-rose-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-rose-600">{formatPHP(stats?.totalDisbursed ?? '0')}</div>
              <p className="text-xs text-muted-foreground mt-1">{stats?.totalVouchers ?? 0} vouchers total</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pending Approval</CardTitle>
              <AlertCircle className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">{stats?.pendingVouchers ?? 0}</div>
              <p className="text-xs text-muted-foreground mt-1">{stats?.draftVouchers ?? 0} in draft</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Quick Links */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: 'Funds', href: '/treasury/funds', icon: Banknote },
          { label: 'Accounts', href: '/treasury/accounts', icon: Wallet },
          { label: 'Budgets', href: '/treasury/budgets', icon: TrendingUp },
          { label: 'Vouchers', href: '/treasury/vouchers', icon: FileText },
          { label: 'Collections', href: '/treasury/collections', icon: Receipt },
        ].map(({ label, href, icon: Icon }) => (
          <Link key={href} href={href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
              <CardContent className="p-4 flex flex-col items-center gap-2 text-center">
                <Icon className="h-6 w-6 text-primary" />
                <span className="text-sm font-medium">{label}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Vouchers */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Recent Vouchers</CardTitle>
              <CardDescription>Latest disbursement vouchers</CardDescription>
            </div>
            <Link href="/treasury/vouchers">
              <Button variant="ghost" size="sm">
                View all <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {vouchersLoading ? (
              <div className="flex items-center justify-center h-24">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : recentVouchers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No vouchers yet.</p>
            ) : (
              <Table>
                <TableBody>
                  {recentVouchers.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell>
                        <div className="font-medium text-sm">{v.voucherNumber}</div>
                        <div className="text-xs text-muted-foreground truncate max-w-[140px]">{v.payeeName}</div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="text-sm font-medium">{formatPHP(v.amount)}</div>
                        <div className="mt-0.5">
                          <Badge variant={STATUS_VARIANT[v.status] ?? 'secondary'} className="text-xs">{v.status}</Badge>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Recent Collections */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Recent Collections</CardTitle>
              <CardDescription>Latest official receipts</CardDescription>
            </div>
            <Link href="/treasury/collections">
              <Button variant="ghost" size="sm">
                View all <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {collectionsLoading ? (
              <div className="flex items-center justify-center h-24">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : recentCollections.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No collections yet.</p>
            ) : (
              <Table>
                <TableBody>
                  {recentCollections.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="font-medium text-sm">OR #{c.orNumber}</div>
                        <div className="text-xs text-muted-foreground truncate max-w-[140px]">{c.payerName}</div>
                        <div className="text-xs text-muted-foreground">{format(new Date(c.collectedAt), 'PP')}</div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="text-sm font-medium text-emerald-600">{formatPHP(c.amount)}</div>
                        <Badge variant={STATUS_VARIANT[c.status] ?? 'secondary'} className="text-xs mt-0.5">{c.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
