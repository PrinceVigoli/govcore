/**
 * Treasury Module API hooks
 * Hand-authored to match the orval-generated pattern used throughout this client.
 * Run `pnpm --filter @workspace/api-spec run codegen` after adding treasury
 * paths to openapi.yaml to get fully-generated equivalents.
 */
import { useQuery, useMutation, type UseQueryOptions, type UseMutationOptions } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

// ---------------------------------------------------------------------------
// Local adapter: these hooks were authored against an axios-style
// `{ params, data }` convention, but this client's shared `customFetch` is
// fetch-style (`RequestInit`) — query strings belong in the URL and the body
// must already be serialized. Rather than change the shared fetch layer (which
// every orval-generated hook depends on), translate here, at the one boundary
// that needs it.
// ---------------------------------------------------------------------------
type TreasuryFetchOptions = {
  method?: string;
  params?: Record<string, unknown>;
  data?: unknown;
};

function treasuryFetch<T>(path: string, options: TreasuryFetchOptions = {}): Promise<T> {
  const { method, params, data } = options;

  const query = params
    ? Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&")
    : "";
  const url = query ? `${path}?${query}` : path;

  return customFetch<T>(url, {
    ...(method ? { method } : {}),
    ...(data !== undefined
      ? { body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }
      : {}),
  });
}


// ─── Types ────────────────────────────────────────────────────────────────────

export interface TreasuryFund {
  id: number;
  tenantId: number;
  name: string;
  code: string;
  fundType: "general" | "sef" | "trust" | "special";
  description?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface TreasuryFundInput {
  tenantId: number;
  name: string;
  code: string;
  fundType?: "general" | "sef" | "trust" | "special";
  description?: string;
  status?: string;
}

export interface TreasuryAccount {
  id: number;
  tenantId: number;
  fundId: number;
  accountCode: string;
  accountName: string;
  accountType: "asset" | "liability" | "equity" | "revenue" | "expense";
  normalBalance: "debit" | "credit";
  parentAccountId?: number | null;
  isControlAccount: number;
  description?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface TreasuryAccountInput {
  tenantId: number;
  fundId: number;
  accountCode: string;
  accountName: string;
  accountType: "asset" | "liability" | "equity" | "revenue" | "expense";
  normalBalance?: "debit" | "credit";
  parentAccountId?: number;
  isControlAccount?: number;
  description?: string;
  status?: string;
}

export interface TreasuryBudget {
  id: number;
  tenantId: number;
  fundId: number;
  departmentId?: number | null;
  accountId: number;
  fiscalYear: number;
  appropriatedAmount: string;
  allottedAmount: string;
  obligatedAmount: string;
  disbursedAmount: string;
  status: string;
  remarks?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TreasuryBudgetInput {
  tenantId: number;
  fundId: number;
  departmentId?: number;
  accountId: number;
  fiscalYear: number;
  appropriatedAmount?: string;
  allottedAmount?: string;
  obligatedAmount?: string;
  disbursedAmount?: string;
  status?: string;
  remarks?: string;
}

export interface TreasuryVoucherItem {
  id: number;
  voucherId: number;
  accountId: number;
  description: string;
  amount: string;
  sortOrder: number;
  createdAt: string;
}

export interface TreasuryVoucherItemInput {
  accountId: number;
  description: string;
  amount: string;
  sortOrder?: number;
}

export interface TreasuryVoucher {
  id: number;
  tenantId: number;
  fundId: number;
  voucherNumber: string;
  voucherType: "disbursement" | "payroll" | "petty_cash" | "reimbursement";
  payeeName: string;
  payeeAddress?: string | null;
  tinNumber?: string | null;
  amount: string;
  description: string;
  particulars?: string | null;
  modeOfPayment: "check" | "ada" | "cash";
  checkNumber?: string | null;
  status: string;
  preparedByUserId?: number | null;
  certifiedByUserId?: number | null;
  approvedByUserId?: number | null;
  paidAt?: string | null;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
  createdAt: string;
  updatedAt: string;
  items?: TreasuryVoucherItem[];
}

export interface TreasuryVoucherInput {
  tenantId: number;
  fundId: number;
  voucherNumber: string;
  voucherType?: "disbursement" | "payroll" | "petty_cash" | "reimbursement";
  payeeName: string;
  payeeAddress?: string;
  tinNumber?: string;
  amount: string;
  description: string;
  particulars?: string;
  modeOfPayment?: "check" | "ada" | "cash";
  checkNumber?: string;
  status?: string;
  preparedByUserId?: number;
  items?: TreasuryVoucherItemInput[];
}

export interface TreasuryCollection {
  id: number;
  tenantId: number;
  fundId: number;
  accountId: number;
  orNumber: string;
  payerName: string;
  payerAddress?: string | null;
  amount: string;
  particulars: string;
  paymentMode: "cash" | "check" | "online" | "pos";
  referenceNumber?: string | null;
  collectedByUserId?: number | null;
  collectedAt: string;
  status: string;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TreasuryCollectionInput {
  tenantId: number;
  fundId: number;
  accountId: number;
  orNumber: string;
  payerName: string;
  payerAddress?: string;
  amount: string;
  particulars: string;
  paymentMode?: "cash" | "check" | "online" | "pos";
  referenceNumber?: string;
  collectedByUserId?: number;
  collectedAt?: string;
  status?: string;
}

export interface TreasuryTransaction {
  id: number;
  tenantId: number;
  fundId: number;
  accountId: number;
  referenceType: string;
  referenceId: number;
  referenceNumber: string;
  description: string;
  debit: string;
  credit: string;
  transactionDate: string;
  fiscalYear: number;
  period: number;
  postedByUserId?: number | null;
  createdAt: string;
}

export interface TreasuryStats {
  totalFunds: number;
  totalCollections: string;
  totalDisbursed: string;
  cashBalance: string;
  pendingVouchers: number;
  draftVouchers: number;
  totalVouchers: number;
  totalCollectionRecords: number;
}

// ─── Query key helpers ────────────────────────────────────────────────────────

export const getListTreasuryFundsQueryKey = (params?: Record<string, unknown>) =>
  ["treasury", "funds", ...(params ? [params] : [])] as const;

export const getGetTreasuryFundQueryKey = (id: number) =>
  ["treasury", "funds", id] as const;

export const getListTreasuryAccountsQueryKey = (params?: Record<string, unknown>) =>
  ["treasury", "accounts", ...(params ? [params] : [])] as const;

export const getGetTreasuryAccountQueryKey = (id: number) =>
  ["treasury", "accounts", id] as const;

export const getListTreasuryBudgetsQueryKey = (params?: Record<string, unknown>) =>
  ["treasury", "budgets", ...(params ? [params] : [])] as const;

export const getListTreasuryVouchersQueryKey = (params?: Record<string, unknown>) =>
  ["treasury", "vouchers", ...(params ? [params] : [])] as const;

export const getGetTreasuryVoucherQueryKey = (id: number) =>
  ["treasury", "vouchers", id] as const;

export const getListTreasuryCollectionsQueryKey = (params?: Record<string, unknown>) =>
  ["treasury", "collections", ...(params ? [params] : [])] as const;

export const getListTreasuryTransactionsQueryKey = (params?: Record<string, unknown>) =>
  ["treasury", "transactions", ...(params ? [params] : [])] as const;

export const getGetTreasuryStatsQueryKey = (params?: Record<string, unknown>) =>
  ["treasury", "stats", ...(params ? [params] : [])] as const;

// ─── Funds ────────────────────────────────────────────────────────────────────

export const useListTreasuryFunds = (
  params?: { tenantId?: number },
  options?: { query?: UseQueryOptions<TreasuryFund[]> },
) =>
  useQuery<TreasuryFund[]>({
    queryKey: getListTreasuryFundsQueryKey(params),
    queryFn: () => treasuryFetch<TreasuryFund[]>("/treasury/funds", { params }),
    ...options?.query,
  });

export const useGetTreasuryFund = (
  id: number,
  options?: { query?: UseQueryOptions<TreasuryFund> },
) =>
  useQuery<TreasuryFund>({
    queryKey: getGetTreasuryFundQueryKey(id),
    queryFn: () => treasuryFetch<TreasuryFund>(`/treasury/funds/${id}`),
    enabled: !!id,
    ...options?.query,
  });

export const useCreateTreasuryFund = (
  options?: { mutation?: UseMutationOptions<TreasuryFund, unknown, { data: TreasuryFundInput }> },
) =>
  useMutation<TreasuryFund, unknown, { data: TreasuryFundInput }>({
    mutationFn: ({ data }) => treasuryFetch<TreasuryFund>("/treasury/funds", { method: "POST", data }),
    ...options?.mutation,
  });

export const useUpdateTreasuryFund = (
  options?: { mutation?: UseMutationOptions<TreasuryFund, unknown, { id: number; data: Partial<TreasuryFundInput> }> },
) =>
  useMutation<TreasuryFund, unknown, { id: number; data: Partial<TreasuryFundInput> }>({
    mutationFn: ({ id, data }) => treasuryFetch<TreasuryFund>(`/treasury/funds/${id}`, { method: "PATCH", data }),
    ...options?.mutation,
  });

export const useDeleteTreasuryFund = (
  options?: { mutation?: UseMutationOptions<void, unknown, { id: number }> },
) =>
  useMutation<void, unknown, { id: number }>({
    mutationFn: ({ id }) => treasuryFetch<void>(`/treasury/funds/${id}`, { method: "DELETE" }),
    ...options?.mutation,
  });

// ─── Accounts ─────────────────────────────────────────────────────────────────

export const useListTreasuryAccounts = (
  params?: { tenantId?: number; fundId?: number; accountType?: string },
  options?: { query?: UseQueryOptions<TreasuryAccount[]> },
) =>
  useQuery<TreasuryAccount[]>({
    queryKey: getListTreasuryAccountsQueryKey(params),
    queryFn: () => treasuryFetch<TreasuryAccount[]>("/treasury/accounts", { params }),
    ...options?.query,
  });

export const useGetTreasuryAccount = (
  id: number,
  options?: { query?: UseQueryOptions<TreasuryAccount> },
) =>
  useQuery<TreasuryAccount>({
    queryKey: getGetTreasuryAccountQueryKey(id),
    queryFn: () => treasuryFetch<TreasuryAccount>(`/treasury/accounts/${id}`),
    enabled: !!id,
    ...options?.query,
  });

export const useCreateTreasuryAccount = (
  options?: { mutation?: UseMutationOptions<TreasuryAccount, unknown, { data: TreasuryAccountInput }> },
) =>
  useMutation<TreasuryAccount, unknown, { data: TreasuryAccountInput }>({
    mutationFn: ({ data }) => treasuryFetch<TreasuryAccount>("/treasury/accounts", { method: "POST", data }),
    ...options?.mutation,
  });

export const useUpdateTreasuryAccount = (
  options?: { mutation?: UseMutationOptions<TreasuryAccount, unknown, { id: number; data: Partial<TreasuryAccountInput> }> },
) =>
  useMutation<TreasuryAccount, unknown, { id: number; data: Partial<TreasuryAccountInput> }>({
    mutationFn: ({ id, data }) => treasuryFetch<TreasuryAccount>(`/treasury/accounts/${id}`, { method: "PATCH", data }),
    ...options?.mutation,
  });

export const useDeleteTreasuryAccount = (
  options?: { mutation?: UseMutationOptions<void, unknown, { id: number }> },
) =>
  useMutation<void, unknown, { id: number }>({
    mutationFn: ({ id }) => treasuryFetch<void>(`/treasury/accounts/${id}`, { method: "DELETE" }),
    ...options?.mutation,
  });

// ─── Budgets ──────────────────────────────────────────────────────────────────

export const useListTreasuryBudgets = (
  params?: { tenantId?: number; fundId?: number; fiscalYear?: number; departmentId?: number },
  options?: { query?: UseQueryOptions<TreasuryBudget[]> },
) =>
  useQuery<TreasuryBudget[]>({
    queryKey: getListTreasuryBudgetsQueryKey(params),
    queryFn: () => treasuryFetch<TreasuryBudget[]>("/treasury/budgets", { params }),
    ...options?.query,
  });

export const useCreateTreasuryBudget = (
  options?: { mutation?: UseMutationOptions<TreasuryBudget, unknown, { data: TreasuryBudgetInput }> },
) =>
  useMutation<TreasuryBudget, unknown, { data: TreasuryBudgetInput }>({
    mutationFn: ({ data }) => treasuryFetch<TreasuryBudget>("/treasury/budgets", { method: "POST", data }),
    ...options?.mutation,
  });

export const useUpdateTreasuryBudget = (
  options?: { mutation?: UseMutationOptions<TreasuryBudget, unknown, { id: number; data: Partial<TreasuryBudgetInput> }> },
) =>
  useMutation<TreasuryBudget, unknown, { id: number; data: Partial<TreasuryBudgetInput> }>({
    mutationFn: ({ id, data }) => treasuryFetch<TreasuryBudget>(`/treasury/budgets/${id}`, { method: "PATCH", data }),
    ...options?.mutation,
  });

export const useDeleteTreasuryBudget = (
  options?: { mutation?: UseMutationOptions<void, unknown, { id: number }> },
) =>
  useMutation<void, unknown, { id: number }>({
    mutationFn: ({ id }) => treasuryFetch<void>(`/treasury/budgets/${id}`, { method: "DELETE" }),
    ...options?.mutation,
  });

// ─── Vouchers ─────────────────────────────────────────────────────────────────

export const useListTreasuryVouchers = (
  params?: { tenantId?: number; fundId?: number; status?: string },
  options?: { query?: UseQueryOptions<TreasuryVoucher[]> },
) =>
  useQuery<TreasuryVoucher[]>({
    queryKey: getListTreasuryVouchersQueryKey(params),
    queryFn: () => treasuryFetch<TreasuryVoucher[]>("/treasury/vouchers", { params }),
    ...options?.query,
  });

export const useGetTreasuryVoucher = (
  id: number,
  options?: { query?: UseQueryOptions<TreasuryVoucher> },
) =>
  useQuery<TreasuryVoucher>({
    queryKey: getGetTreasuryVoucherQueryKey(id),
    queryFn: () => treasuryFetch<TreasuryVoucher>(`/treasury/vouchers/${id}`),
    enabled: !!id,
    ...options?.query,
  });

export const useCreateTreasuryVoucher = (
  options?: { mutation?: UseMutationOptions<TreasuryVoucher, unknown, { data: TreasuryVoucherInput }> },
) =>
  useMutation<TreasuryVoucher, unknown, { data: TreasuryVoucherInput }>({
    mutationFn: ({ data }) => treasuryFetch<TreasuryVoucher>("/treasury/vouchers", { method: "POST", data }),
    ...options?.mutation,
  });

export const useUpdateTreasuryVoucher = (
  options?: { mutation?: UseMutationOptions<TreasuryVoucher, unknown, { id: number; data: Partial<TreasuryVoucherInput> }> },
) =>
  useMutation<TreasuryVoucher, unknown, { id: number; data: Partial<TreasuryVoucherInput> }>({
    mutationFn: ({ id, data }) => treasuryFetch<TreasuryVoucher>(`/treasury/vouchers/${id}`, { method: "PATCH", data }),
    ...options?.mutation,
  });

export const useApproveTreasuryVoucher = (
  options?: { mutation?: UseMutationOptions<TreasuryVoucher, unknown, { id: number }> },
) =>
  useMutation<TreasuryVoucher, unknown, { id: number }>({
    mutationFn: ({ id }) => treasuryFetch<TreasuryVoucher>(`/treasury/vouchers/${id}/approve`, { method: "POST" }),
    ...options?.mutation,
  });

export const usePayTreasuryVoucher = (
  options?: { mutation?: UseMutationOptions<TreasuryVoucher, unknown, { id: number; checkNumber?: string }> },
) =>
  useMutation<TreasuryVoucher, unknown, { id: number; checkNumber?: string }>({
    mutationFn: ({ id, checkNumber }) =>
      treasuryFetch<TreasuryVoucher>(`/treasury/vouchers/${id}/pay`, { method: "POST", data: { checkNumber } }),
    ...options?.mutation,
  });

export const useCancelTreasuryVoucher = (
  options?: { mutation?: UseMutationOptions<TreasuryVoucher, unknown, { id: number; reason?: string }> },
) =>
  useMutation<TreasuryVoucher, unknown, { id: number; reason?: string }>({
    mutationFn: ({ id, reason }) =>
      treasuryFetch<TreasuryVoucher>(`/treasury/vouchers/${id}/cancel`, { method: "POST", data: { reason } }),
    ...options?.mutation,
  });

// ─── Collections ─────────────────────────────────────────────────────────────

export const useListTreasuryCollections = (
  params?: { tenantId?: number; fundId?: number; status?: string },
  options?: { query?: UseQueryOptions<TreasuryCollection[]> },
) =>
  useQuery<TreasuryCollection[]>({
    queryKey: getListTreasuryCollectionsQueryKey(params),
    queryFn: () => treasuryFetch<TreasuryCollection[]>("/treasury/collections", { params }),
    ...options?.query,
  });

export const useGetTreasuryCollection = (
  id: number,
  options?: { query?: UseQueryOptions<TreasuryCollection> },
) =>
  useQuery<TreasuryCollection>({
    queryKey: ["treasury", "collections", id],
    queryFn: () => treasuryFetch<TreasuryCollection>(`/treasury/collections/${id}`),
    enabled: !!id,
    ...options?.query,
  });

export const useCreateTreasuryCollection = (
  options?: { mutation?: UseMutationOptions<TreasuryCollection, unknown, { data: TreasuryCollectionInput }> },
) =>
  useMutation<TreasuryCollection, unknown, { data: TreasuryCollectionInput }>({
    mutationFn: ({ data }) => treasuryFetch<TreasuryCollection>("/treasury/collections", { method: "POST", data }),
    ...options?.mutation,
  });

export const useUpdateTreasuryCollection = (
  options?: { mutation?: UseMutationOptions<TreasuryCollection, unknown, { id: number; data: Partial<TreasuryCollectionInput> }> },
) =>
  useMutation<TreasuryCollection, unknown, { id: number; data: Partial<TreasuryCollectionInput> }>({
    mutationFn: ({ id, data }) =>
      treasuryFetch<TreasuryCollection>(`/treasury/collections/${id}`, { method: "PATCH", data }),
    ...options?.mutation,
  });

// ─── Transactions ─────────────────────────────────────────────────────────────

export const useListTreasuryTransactions = (
  params?: { tenantId?: number; fundId?: number; accountId?: number; fiscalYear?: number },
  options?: { query?: UseQueryOptions<TreasuryTransaction[]> },
) =>
  useQuery<TreasuryTransaction[]>({
    queryKey: getListTreasuryTransactionsQueryKey(params),
    queryFn: () => treasuryFetch<TreasuryTransaction[]>("/treasury/transactions", { params }),
    ...options?.query,
  });

// ─── Stats ────────────────────────────────────────────────────────────────────

export const useGetTreasuryStats = (
  params?: { tenantId?: number },
  options?: { query?: UseQueryOptions<TreasuryStats> },
) =>
  useQuery<TreasuryStats>({
    queryKey: getGetTreasuryStatsQueryKey(params),
    queryFn: () => treasuryFetch<TreasuryStats>("/treasury/stats", { params }),
    ...options?.query,
  });
