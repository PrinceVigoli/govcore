import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import {
  db,
  treasuryFundsTable,
  treasuryAccountsTable,
  treasuryBudgetsTable,
  treasuryVouchersTable,
  treasuryVoucherItemsTable,
  treasuryCollectionsTable,
  treasuryTransactionsTable,
} from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { logAudit } from "../lib/audit";
import type { JwtPayload } from "../lib/auth";
import { z } from "zod/v4";

const router = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function actor(req: Parameters<typeof requireAuth>[0]) {
  return (req as typeof req & { user: JwtPayload }).user;
}

function numericStr(v: unknown) {
  return typeof v === "string" ? v : String(v ?? "0");
}

// ─── FUNDS ───────────────────────────────────────────────────────────────────

const CreateFundBody = z.object({
  tenantId: z.number().int(),
  name: z.string().min(1),
  code: z.string().min(1),
  fundType: z.enum(["general", "sef", "trust", "special"]).default("general"),
  description: z.string().optional(),
  status: z.string().default("active"),
});

const UpdateFundBody = CreateFundBody.partial().omit({ tenantId: true });

router.get("/treasury/funds", requireAuth, async (req, res): Promise<void> => {
  const tenantId = req.query.tenantId ? Number(req.query.tenantId) : undefined;
  const funds = tenantId
    ? await db.select().from(treasuryFundsTable).where(eq(treasuryFundsTable.tenantId, tenantId)).orderBy(treasuryFundsTable.code)
    : await db.select().from(treasuryFundsTable).orderBy(treasuryFundsTable.code);
  res.json(funds);
});

router.post("/treasury/funds", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateFundBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [fund] = await db.insert(treasuryFundsTable).values(parsed.data).returning();
  await logAudit({ actor: actor(req), action: "create", resource: "treasury_fund", resourceId: fund.id });
  res.status(201).json(fund);
});

router.get("/treasury/funds/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [fund] = await db.select().from(treasuryFundsTable).where(eq(treasuryFundsTable.id, id));
  if (!fund) { res.status(404).json({ error: "Fund not found" }); return; }
  res.json(fund);
});

router.patch("/treasury/funds/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = UpdateFundBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [fund] = await db.update(treasuryFundsTable).set(parsed.data).where(eq(treasuryFundsTable.id, id)).returning();
  if (!fund) { res.status(404).json({ error: "Fund not found" }); return; }
  await logAudit({ actor: actor(req), action: "update", resource: "treasury_fund", resourceId: fund.id });
  res.json(fund);
});

router.delete("/treasury/funds/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [fund] = await db.delete(treasuryFundsTable).where(eq(treasuryFundsTable.id, id)).returning();
  if (!fund) { res.status(404).json({ error: "Fund not found" }); return; }
  await logAudit({ actor: actor(req), action: "delete", resource: "treasury_fund", resourceId: id });
  res.sendStatus(204);
});

// ─── ACCOUNTS (Chart of Accounts) ────────────────────────────────────────────

const CreateAccountBody = z.object({
  tenantId: z.number().int(),
  fundId: z.number().int(),
  accountCode: z.string().min(1),
  accountName: z.string().min(1),
  accountType: z.enum(["asset", "liability", "equity", "revenue", "expense"]),
  normalBalance: z.enum(["debit", "credit"]).default("debit"),
  parentAccountId: z.number().int().optional(),
  isControlAccount: z.number().int().default(0),
  description: z.string().optional(),
  status: z.string().default("active"),
});

const UpdateAccountBody = CreateAccountBody.partial().omit({ tenantId: true });

router.get("/treasury/accounts", requireAuth, async (req, res): Promise<void> => {
  const conditions = [];
  if (req.query.tenantId) conditions.push(eq(treasuryAccountsTable.tenantId, Number(req.query.tenantId)));
  if (req.query.fundId) conditions.push(eq(treasuryAccountsTable.fundId, Number(req.query.fundId)));
  if (req.query.accountType) conditions.push(eq(treasuryAccountsTable.accountType, String(req.query.accountType)));
  const accounts = conditions.length
    ? await db.select().from(treasuryAccountsTable).where(and(...conditions)).orderBy(treasuryAccountsTable.accountCode)
    : await db.select().from(treasuryAccountsTable).orderBy(treasuryAccountsTable.accountCode);
  res.json(accounts);
});

router.post("/treasury/accounts", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateAccountBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [account] = await db.insert(treasuryAccountsTable).values(parsed.data).returning();
  await logAudit({ actor: actor(req), action: "create", resource: "treasury_account", resourceId: account.id });
  res.status(201).json(account);
});

router.get("/treasury/accounts/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [account] = await db.select().from(treasuryAccountsTable).where(eq(treasuryAccountsTable.id, id));
  if (!account) { res.status(404).json({ error: "Account not found" }); return; }
  res.json(account);
});

router.patch("/treasury/accounts/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = UpdateAccountBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [account] = await db.update(treasuryAccountsTable).set(parsed.data).where(eq(treasuryAccountsTable.id, id)).returning();
  if (!account) { res.status(404).json({ error: "Account not found" }); return; }
  await logAudit({ actor: actor(req), action: "update", resource: "treasury_account", resourceId: account.id });
  res.json(account);
});

router.delete("/treasury/accounts/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [account] = await db.delete(treasuryAccountsTable).where(eq(treasuryAccountsTable.id, id)).returning();
  if (!account) { res.status(404).json({ error: "Account not found" }); return; }
  await logAudit({ actor: actor(req), action: "delete", resource: "treasury_account", resourceId: id });
  res.sendStatus(204);
});

// ─── BUDGETS ─────────────────────────────────────────────────────────────────

const CreateBudgetBody = z.object({
  tenantId: z.number().int(),
  fundId: z.number().int(),
  departmentId: z.number().int().optional(),
  accountId: z.number().int(),
  fiscalYear: z.number().int(),
  appropriatedAmount: z.string().default("0"),
  allottedAmount: z.string().default("0"),
  obligatedAmount: z.string().default("0"),
  disbursedAmount: z.string().default("0"),
  status: z.string().default("active"),
  remarks: z.string().optional(),
});

const UpdateBudgetBody = CreateBudgetBody.partial().omit({ tenantId: true });

router.get("/treasury/budgets", requireAuth, async (req, res): Promise<void> => {
  const conditions = [];
  if (req.query.tenantId) conditions.push(eq(treasuryBudgetsTable.tenantId, Number(req.query.tenantId)));
  if (req.query.fundId) conditions.push(eq(treasuryBudgetsTable.fundId, Number(req.query.fundId)));
  if (req.query.fiscalYear) conditions.push(eq(treasuryBudgetsTable.fiscalYear, Number(req.query.fiscalYear)));
  if (req.query.departmentId) conditions.push(eq(treasuryBudgetsTable.departmentId, Number(req.query.departmentId)));
  const budgets = conditions.length
    ? await db.select().from(treasuryBudgetsTable).where(and(...conditions)).orderBy(treasuryBudgetsTable.fiscalYear)
    : await db.select().from(treasuryBudgetsTable).orderBy(treasuryBudgetsTable.fiscalYear);
  res.json(budgets);
});

router.post("/treasury/budgets", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateBudgetBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [budget] = await db.insert(treasuryBudgetsTable).values(parsed.data).returning();
  await logAudit({ actor: actor(req), action: "create", resource: "treasury_budget", resourceId: budget.id });
  res.status(201).json(budget);
});

router.get("/treasury/budgets/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [budget] = await db.select().from(treasuryBudgetsTable).where(eq(treasuryBudgetsTable.id, id));
  if (!budget) { res.status(404).json({ error: "Budget not found" }); return; }
  res.json(budget);
});

router.patch("/treasury/budgets/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = UpdateBudgetBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [budget] = await db.update(treasuryBudgetsTable).set(parsed.data).where(eq(treasuryBudgetsTable.id, id)).returning();
  if (!budget) { res.status(404).json({ error: "Budget not found" }); return; }
  await logAudit({ actor: actor(req), action: "update", resource: "treasury_budget", resourceId: budget.id });
  res.json(budget);
});

router.delete("/treasury/budgets/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [budget] = await db.delete(treasuryBudgetsTable).where(eq(treasuryBudgetsTable.id, id)).returning();
  if (!budget) { res.status(404).json({ error: "Budget not found" }); return; }
  await logAudit({ actor: actor(req), action: "delete", resource: "treasury_budget", resourceId: id });
  res.sendStatus(204);
});

// ─── VOUCHERS ────────────────────────────────────────────────────────────────

const CreateVoucherBody = z.object({
  tenantId: z.number().int(),
  fundId: z.number().int(),
  voucherNumber: z.string().min(1),
  voucherType: z.enum(["disbursement", "payroll", "petty_cash", "reimbursement"]).default("disbursement"),
  payeeName: z.string().min(1),
  payeeAddress: z.string().optional(),
  tinNumber: z.string().optional(),
  amount: z.string(),
  description: z.string().min(1),
  particulars: z.string().optional(),
  modeOfPayment: z.enum(["check", "ada", "cash"]).default("check"),
  checkNumber: z.string().optional(),
  status: z.string().default("draft"),
  preparedByUserId: z.number().int().optional(),
  items: z.array(z.object({
    accountId: z.number().int(),
    description: z.string(),
    amount: z.string(),
    sortOrder: z.number().int().default(0),
  })).default([]),
});

const UpdateVoucherBody = CreateVoucherBody.partial().omit({ tenantId: true, items: true });

router.get("/treasury/vouchers", requireAuth, async (req, res): Promise<void> => {
  const conditions = [];
  if (req.query.tenantId) conditions.push(eq(treasuryVouchersTable.tenantId, Number(req.query.tenantId)));
  if (req.query.fundId) conditions.push(eq(treasuryVouchersTable.fundId, Number(req.query.fundId)));
  if (req.query.status) conditions.push(eq(treasuryVouchersTable.status, String(req.query.status)));
  const vouchers = conditions.length
    ? await db.select().from(treasuryVouchersTable).where(and(...conditions)).orderBy(desc(treasuryVouchersTable.createdAt))
    : await db.select().from(treasuryVouchersTable).orderBy(desc(treasuryVouchersTable.createdAt));
  res.json(vouchers);
});

router.post("/treasury/vouchers", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateVoucherBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { items, ...voucherData } = parsed.data;
  const result = await db.transaction(async (tx) => {
    const [voucher] = await tx.insert(treasuryVouchersTable).values(voucherData).returning();
    const insertedItems = items.length
      ? await tx.insert(treasuryVoucherItemsTable).values(items.map((item) => ({ ...item, voucherId: voucher.id }))).returning()
      : [];
    return { voucher, items: insertedItems };
  });
  await logAudit({ actor: actor(req), action: "create", resource: "treasury_voucher", resourceId: result.voucher.id });
  res.status(201).json(result);
});

router.get("/treasury/vouchers/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [voucher] = await db.select().from(treasuryVouchersTable).where(eq(treasuryVouchersTable.id, id));
  if (!voucher) { res.status(404).json({ error: "Voucher not found" }); return; }
  const items = await db.select().from(treasuryVoucherItemsTable).where(eq(treasuryVoucherItemsTable.voucherId, id)).orderBy(treasuryVoucherItemsTable.sortOrder);
  res.json({ ...voucher, items });
});

router.patch("/treasury/vouchers/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = UpdateVoucherBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [voucher] = await db.update(treasuryVouchersTable).set(parsed.data).where(eq(treasuryVouchersTable.id, id)).returning();
  if (!voucher) { res.status(404).json({ error: "Voucher not found" }); return; }
  await logAudit({ actor: actor(req), action: "update", resource: "treasury_voucher", resourceId: voucher.id });
  res.json(voucher);
});

// Approve a voucher
router.post("/treasury/vouchers/:id/approve", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const a = actor(req);
  const [voucher] = await db.select().from(treasuryVouchersTable).where(eq(treasuryVouchersTable.id, id));
  if (!voucher) { res.status(404).json({ error: "Voucher not found" }); return; }
  if (voucher.status !== "for_approval") { res.status(400).json({ error: "Only vouchers in for_approval status can be approved" }); return; }
  const [updated] = await db.update(treasuryVouchersTable)
    .set({ status: "approved", approvedByUserId: a.userId })
    .where(eq(treasuryVouchersTable.id, id))
    .returning();
  await logAudit({ actor: a, action: "approve", resource: "treasury_voucher", resourceId: id });
  res.json(updated);
});

// Mark a voucher as paid
router.post("/treasury/vouchers/:id/pay", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const a = actor(req);
  const [voucher] = await db.select().from(treasuryVouchersTable).where(eq(treasuryVouchersTable.id, id));
  if (!voucher) { res.status(404).json({ error: "Voucher not found" }); return; }
  if (voucher.status !== "approved") { res.status(400).json({ error: "Only approved vouchers can be paid" }); return; }
  const checkNumber = req.body?.checkNumber as string | undefined;
  const [updated] = await db.update(treasuryVouchersTable)
    .set({ status: "paid", paidAt: new Date(), checkNumber: checkNumber ?? voucher.checkNumber })
    .where(eq(treasuryVouchersTable.id, id))
    .returning();
  // Post GL transactions for each line item
  const items = await db.select().from(treasuryVoucherItemsTable).where(eq(treasuryVoucherItemsTable.voucherId, id));
  const now = new Date();
  const fiscalYear = now.getFullYear();
  const period = now.getMonth() + 1;
  if (items.length) {
    await db.insert(treasuryTransactionsTable).values(
      items.map((item) => ({
        tenantId: voucher.tenantId,
        fundId: voucher.fundId,
        accountId: item.accountId,
        referenceType: "voucher" as const,
        referenceId: voucher.id,
        referenceNumber: voucher.voucherNumber,
        description: item.description,
        debit: numericStr(item.amount),
        credit: "0",
        transactionDate: now,
        fiscalYear,
        period,
        postedByUserId: a.userId,
      })),
    );
  }
  await logAudit({ actor: a, action: "pay", resource: "treasury_voucher", resourceId: id });
  res.json(updated);
});

// Cancel a voucher
router.post("/treasury/vouchers/:id/cancel", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const a = actor(req);
  const [voucher] = await db.select().from(treasuryVouchersTable).where(eq(treasuryVouchersTable.id, id));
  if (!voucher) { res.status(404).json({ error: "Voucher not found" }); return; }
  if (voucher.status === "paid" || voucher.status === "cancelled") {
    res.status(400).json({ error: "Cannot cancel a paid or already cancelled voucher" }); return;
  }
  const reason = req.body?.reason as string | undefined;
  const [updated] = await db.update(treasuryVouchersTable)
    .set({ status: "cancelled", cancelledAt: new Date(), cancellationReason: reason })
    .where(eq(treasuryVouchersTable.id, id))
    .returning();
  await logAudit({ actor: a, action: "cancel", resource: "treasury_voucher", resourceId: id });
  res.json(updated);
});

// ─── COLLECTIONS ─────────────────────────────────────────────────────────────

const CreateCollectionBody = z.object({
  tenantId: z.number().int(),
  fundId: z.number().int(),
  accountId: z.number().int(),
  orNumber: z.string().min(1),
  payerName: z.string().min(1),
  payerAddress: z.string().optional(),
  amount: z.string(),
  particulars: z.string().min(1),
  paymentMode: z.enum(["cash", "check", "online", "pos"]).default("cash"),
  referenceNumber: z.string().optional(),
  collectedByUserId: z.number().int().optional(),
  collectedAt: z.string().optional(),
  status: z.string().default("posted"),
});

const UpdateCollectionBody = CreateCollectionBody.partial().omit({ tenantId: true });

router.get("/treasury/collections", requireAuth, async (req, res): Promise<void> => {
  const conditions = [];
  if (req.query.tenantId) conditions.push(eq(treasuryCollectionsTable.tenantId, Number(req.query.tenantId)));
  if (req.query.fundId) conditions.push(eq(treasuryCollectionsTable.fundId, Number(req.query.fundId)));
  if (req.query.status) conditions.push(eq(treasuryCollectionsTable.status, String(req.query.status)));
  const collections = conditions.length
    ? await db.select().from(treasuryCollectionsTable).where(and(...conditions)).orderBy(desc(treasuryCollectionsTable.collectedAt))
    : await db.select().from(treasuryCollectionsTable).orderBy(desc(treasuryCollectionsTable.collectedAt));
  res.json(collections);
});

router.post("/treasury/collections", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateCollectionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const a = actor(req);
  const data = {
    ...parsed.data,
    collectedAt: parsed.data.collectedAt ? new Date(parsed.data.collectedAt) : new Date(),
  };
  const [collection] = await db.insert(treasuryCollectionsTable).values(data).returning();
  // Auto-post GL entry for posted collections
  if (collection.status === "posted") {
    const now = new Date();
    await db.insert(treasuryTransactionsTable).values({
      tenantId: collection.tenantId,
      fundId: collection.fundId,
      accountId: collection.accountId,
      referenceType: "collection",
      referenceId: collection.id,
      referenceNumber: collection.orNumber,
      description: collection.particulars,
      debit: "0",
      credit: numericStr(collection.amount),
      transactionDate: now,
      fiscalYear: now.getFullYear(),
      period: now.getMonth() + 1,
      postedByUserId: a.userId,
    });
  }
  await logAudit({ actor: a, action: "create", resource: "treasury_collection", resourceId: collection.id });
  res.status(201).json(collection);
});

router.get("/treasury/collections/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [collection] = await db.select().from(treasuryCollectionsTable).where(eq(treasuryCollectionsTable.id, id));
  if (!collection) { res.status(404).json({ error: "Collection not found" }); return; }
  res.json(collection);
});

router.patch("/treasury/collections/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = UpdateCollectionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  // collectedAt arrives as an ISO string from the wire; the column is a
  // timestamp, so convert rather than passing the string through.
  const { collectedAt, ...rest } = parsed.data;
  const [collection] = await db
    .update(treasuryCollectionsTable)
    .set({ ...rest, ...(collectedAt !== undefined ? { collectedAt: new Date(collectedAt) } : {}) })
    .where(eq(treasuryCollectionsTable.id, id))
    .returning();
  if (!collection) { res.status(404).json({ error: "Collection not found" }); return; }
  await logAudit({ actor: actor(req), action: "update", resource: "treasury_collection", resourceId: collection.id });
  res.json(collection);
});

// ─── TRANSACTIONS (GL) ───────────────────────────────────────────────────────

router.get("/treasury/transactions", requireAuth, async (req, res): Promise<void> => {
  const conditions = [];
  if (req.query.tenantId) conditions.push(eq(treasuryTransactionsTable.tenantId, Number(req.query.tenantId)));
  if (req.query.fundId) conditions.push(eq(treasuryTransactionsTable.fundId, Number(req.query.fundId)));
  if (req.query.accountId) conditions.push(eq(treasuryTransactionsTable.accountId, Number(req.query.accountId)));
  if (req.query.fiscalYear) conditions.push(eq(treasuryTransactionsTable.fiscalYear, Number(req.query.fiscalYear)));
  const txns = conditions.length
    ? await db.select().from(treasuryTransactionsTable).where(and(...conditions)).orderBy(desc(treasuryTransactionsTable.transactionDate))
    : await db.select().from(treasuryTransactionsTable).orderBy(desc(treasuryTransactionsTable.transactionDate));
  res.json(txns);
});

// ─── DASHBOARD STATS ─────────────────────────────────────────────────────────

router.get("/treasury/stats", requireAuth, async (req, res): Promise<void> => {
  const tenantId = req.query.tenantId ? Number(req.query.tenantId) : undefined;

  const [fundsResult, vouchersResult, collectionsResult] = await Promise.all([
    tenantId
      ? db.select().from(treasuryFundsTable).where(eq(treasuryFundsTable.tenantId, tenantId))
      : db.select().from(treasuryFundsTable),
    tenantId
      ? db.select().from(treasuryVouchersTable).where(eq(treasuryVouchersTable.tenantId, tenantId))
      : db.select().from(treasuryVouchersTable),
    tenantId
      ? db.select().from(treasuryCollectionsTable).where(eq(treasuryCollectionsTable.tenantId, tenantId))
      : db.select().from(treasuryCollectionsTable),
  ]);

  const totalCollections = collectionsResult
    .filter((c) => c.status === "posted")
    .reduce((sum, c) => sum + parseFloat(numericStr(c.amount)), 0);

  const totalDisbursed = vouchersResult
    .filter((v) => v.status === "paid")
    .reduce((sum, v) => sum + parseFloat(numericStr(v.amount)), 0);

  const pendingVouchers = vouchersResult.filter((v) => v.status === "for_approval").length;
  const draftVouchers = vouchersResult.filter((v) => v.status === "draft").length;

  res.json({
    totalFunds: fundsResult.length,
    totalCollections: totalCollections.toFixed(2),
    totalDisbursed: totalDisbursed.toFixed(2),
    cashBalance: (totalCollections - totalDisbursed).toFixed(2),
    pendingVouchers,
    draftVouchers,
    totalVouchers: vouchersResult.length,
    totalCollectionRecords: collectionsResult.length,
  });
});

export default router;
