import { useState } from 'react';
import {
  useListTreasuryFunds,
  useCreateTreasuryFund,
  useUpdateTreasuryFund,
  useDeleteTreasuryFund,
  getListTreasuryFundsQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Banknote, Plus, Loader2, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import type { TreasuryFund } from '@workspace/api-client-react';

const FUND_TYPE_LABELS: Record<string, string> = {
  general: 'General Fund (101)',
  sef: 'Special Education Fund (164)',
  trust: 'Trust Fund (151)',
  special: 'Special Fund',
};

const FUND_TYPE_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  general: 'default',
  sef: 'secondary',
  trust: 'outline',
  special: 'outline',
};

function FundForm({
  initial,
  onSave,
  onCancel,
  loading,
}: {
  initial?: Partial<TreasuryFund>;
  onSave: (data: { name: string; code: string; fundType: string; description: string; tenantId: number; status: string }) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [code, setCode] = useState(initial?.code ?? '');
  const [fundType, setFundType] = useState(initial?.fundType ?? 'general');
  const [description, setDescription] = useState(initial?.description ?? '');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Fund Name</Label>
          <Input placeholder="General Fund" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Fund Code</Label>
          <Input placeholder="101" value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Fund Type</Label>
        <Select value={fundType} onValueChange={(v) => setFundType(v as Parameters<typeof setFundType>[0])}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="general">General Fund</SelectItem>
            <SelectItem value="sef">Special Education Fund</SelectItem>
            <SelectItem value="trust">Trust Fund</SelectItem>
            <SelectItem value="special">Special Fund</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>Description</Label>
        <Input placeholder="Optional description" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSave({ name, code, fundType, description, tenantId: 1, status: 'active' })} disabled={loading || !name || !code}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Fund
        </Button>
      </DialogFooter>
    </div>
  );
}

export default function TreasuryFunds() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editFund, setEditFund] = useState<TreasuryFund | null>(null);
  const { data: funds, isLoading } = useListTreasuryFunds(undefined, { query: { queryKey: getListTreasuryFundsQueryKey() } });
  const createMutation = useCreateTreasuryFund();
  const updateMutation = useUpdateTreasuryFund();
  const deleteMutation = useDeleteTreasuryFund();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListTreasuryFundsQueryKey() });

  const handleCreate = (data: Record<string, unknown>) => {
    createMutation.mutate({ data: data as unknown as Parameters<typeof createMutation.mutate>[0]['data'] }, {
      onSuccess: () => { invalidate(); setCreateOpen(false); toast({ title: 'Fund created' }); },
      onError: (e: unknown) => toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' }),
    });
  };

  const handleUpdate = (data: Record<string, unknown>) => {
    if (!editFund) return;
    updateMutation.mutate({ id: editFund.id, data: data as unknown as Parameters<typeof updateMutation.mutate>[0]['data'] }, {
      onSuccess: () => { invalidate(); setEditFund(null); toast({ title: 'Fund updated' }); },
      onError: (e: unknown) => toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' }),
    });
  };

  const handleDelete = (fund: TreasuryFund) => {
    if (!confirm(`Delete fund "${fund.name}"? This cannot be undone.`)) return;
    deleteMutation.mutate({ id: fund.id }, {
      onSuccess: () => { invalidate(); toast({ title: 'Fund deleted' }); },
      onError: (e: unknown) => toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' }),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Treasury Funds</h1>
          <p className="text-sm text-muted-foreground mt-1">Statutory fund accounts (General Fund, SEF, Trust Fund, etc.)</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />New Fund</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Treasury Fund</DialogTitle>
              <DialogDescription>Define a statutory or special fund for this LGU.</DialogDescription>
            </DialogHeader>
            <FundForm onSave={handleCreate} onCancel={() => setCreateOpen(false)} loading={createMutation.isPending} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-card border border-border rounded-md shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Fund</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></TableCell></TableRow>
            ) : funds?.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No funds configured. Add the General Fund to get started.</TableCell></TableRow>
            ) : (
              funds?.map((fund) => (
                <TableRow key={fund.id} className="hover-elevate">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Banknote className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="font-medium">{fund.name}</div>
                        {fund.description && <div className="text-xs text-muted-foreground">{fund.description}</div>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{fund.code}</TableCell>
                  <TableCell>
                    <Badge variant={FUND_TYPE_VARIANT[fund.fundType] ?? 'outline'}>
                      {FUND_TYPE_LABELS[fund.fundType] ?? fund.fundType}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={fund.status === 'active' ? 'default' : 'secondary'}>{fund.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button variant="ghost" size="sm" onClick={() => setEditFund(fund)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(fund)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editFund} onOpenChange={(o) => { if (!o) setEditFund(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Fund</DialogTitle>
            <DialogDescription>Update fund details.</DialogDescription>
          </DialogHeader>
          {editFund && (
            <FundForm
              initial={editFund}
              onSave={handleUpdate}
              onCancel={() => setEditFund(null)}
              loading={updateMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
