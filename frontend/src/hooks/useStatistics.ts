import { useMemo } from "react";
import type { ArchivedInvoice, InvoiceCategory } from "../types";
import type { Reimbursement, ReimbursementStatus } from "../types/reimbursement";
import {
  getReimbursementStatTimestamp,
  getTimeRangeBounds,
  isParsedInvoiceDateInBounds,
  isTimestampInBounds,
  parseInvoiceDate,
  timestampMonthKey,
  toFiniteAmount,
  type TimeRange,
} from "../utils/statistics";

export type { TimeRange } from "../utils/statistics";

export type ReimbursementStatsData = {
  count: number;
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  draftAmount: number;
  byStatus: Record<ReimbursementStatus, { count: number; amount: number }>;
  byType: Record<string, { count: number; amount: number }>;
  byMonth: Record<string, { count: number; amount: number }>;
  coverageRate: number;
};

export type SellerInfo = { name: string; count: number; amount: number };

export type CategoryStat = {
  count: number;
  amount: number;
  netAmount: number;
  taxAmount: number;
  verifiedCount: number;
  reimbursedCount: number;
};

export type StatisticsData = {
  total: number;
  totalTax: number;
  count: number;
  avgAmount: number;
  verifiedCount: number;
  byCategory: Record<InvoiceCategory, CategoryStat>;
  byMonth: Record<string, { count: number; amount: number }>;
  filtered: ArchivedInvoice[];
  reimbursement: ReimbursementStatsData;
  topSellers: SellerInfo[];
};

function createEmptyCategoryStat(): CategoryStat {
  return { count: 0, amount: 0, netAmount: 0, taxAmount: 0, verifiedCount: 0, reimbursedCount: 0 };
}

function createEmptyCategoryStats(): Record<InvoiceCategory, CategoryStat> {
  return {
    vat_special: createEmptyCategoryStat(),
    vat_normal: createEmptyCategoryStat(),
    electronic: createEmptyCategoryStat(),
    toll: createEmptyCategoryStat(),
    train: createEmptyCategoryStat(),
    flight: createEmptyCategoryStat(),
    rideshare: createEmptyCategoryStat(),
    rideshare_invoice: createEmptyCategoryStat(),
    hotel: createEmptyCategoryStat(),
    taxi: createEmptyCategoryStat(),
    other: createEmptyCategoryStat(),
  };
}

function getInvoiceAmount(invoice: ArchivedInvoice): number {
  return toFiniteAmount(invoice.totalAmount);
}

function getReimbursementAmount(reimbursement: Reimbursement): number {
  const itemTotal = reimbursement.items.reduce((sum, item) => sum + toFiniteAmount(item.amount), 0);
  const total = toFiniteAmount(reimbursement.totalAmount);
  return reimbursement.items.length > 0 ? itemTotal : total;
}

export function calculateStatistics(
  invoices: ArchivedInvoice[],
  timeRange: TimeRange,
  reimbursements: Reimbursement[] = [],
  now: Date = new Date()
): StatisticsData {
  const bounds = getTimeRangeBounds(timeRange, now);

  const filtered = invoices.filter((invoice) => {
    if (timeRange === "all") return true;
    const parsed = parseInvoiceDate(invoice.invoiceDate);
    return parsed ? isParsedInvoiceDateInBounds(parsed, bounds) : false;
  });

  const total = filtered.reduce((sum, invoice) => sum + getInvoiceAmount(invoice), 0);
  const totalTax = filtered.reduce((sum, invoice) => sum + toFiniteAmount(invoice.taxAmount), 0);
  const count = filtered.length;
  const avgAmount = count > 0 ? total / count : 0;
  const verifiedCount = filtered.filter((invoice) => invoice.isVerified).length;

  const reimbInvoiceIds = new Set<string>();
  reimbursements.forEach((reimbursement) => {
    reimbursement.items.forEach((item) => {
      if (item.invoiceId) reimbInvoiceIds.add(item.invoiceId);
    });
  });

  const byCategory = createEmptyCategoryStats();
  filtered.forEach((invoice) => {
    const category = invoice.category || "other";
    if (!byCategory[category]) byCategory[category] = createEmptyCategoryStat();
    const stat = byCategory[category];
    stat.count++;
    stat.amount += getInvoiceAmount(invoice);
    stat.netAmount += toFiniteAmount(invoice.amount);
    stat.taxAmount += toFiniteAmount(invoice.taxAmount);
    if (invoice.isVerified) stat.verifiedCount++;
    if (reimbInvoiceIds.has(invoice.id)) stat.reimbursedCount++;
  });

  const byMonth: Record<string, { count: number; amount: number }> = {};
  filtered.forEach((invoice) => {
    const parsed = parseInvoiceDate(invoice.invoiceDate);
    if (!parsed) return;
    const key = `${parsed.year}-${String(parsed.month).padStart(2, "0")}`;
    if (!byMonth[key]) byMonth[key] = { count: 0, amount: 0 };
    byMonth[key].count++;
    byMonth[key].amount += getInvoiceAmount(invoice);
  });

  const sellerMap: Record<string, { count: number; amount: number }> = {};
  filtered.forEach((invoice) => {
    const name = invoice.sellerName?.trim() || "未知销方";
    if (!sellerMap[name]) sellerMap[name] = { count: 0, amount: 0 };
    sellerMap[name].count++;
    sellerMap[name].amount += getInvoiceAmount(invoice);
  });
  const topSellers: SellerInfo[] = Object.entries(sellerMap)
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.amount - a.amount || b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 5);

  const filteredReimbs = reimbursements.filter((reimbursement) =>
    isTimestampInBounds(getReimbursementStatTimestamp(reimbursement), bounds)
  );

  const allStatuses: ReimbursementStatus[] = ["draft", "pending_payment", "paid"];
  const reimbByStatus = Object.fromEntries(
    allStatuses.map((status) => [status, { count: 0, amount: 0 }])
  ) as Record<ReimbursementStatus, { count: number; amount: number }>;
  filteredReimbs.forEach((reimbursement) => {
    if (!reimbByStatus[reimbursement.status]) {
      reimbByStatus[reimbursement.status] = { count: 0, amount: 0 };
    }
    reimbByStatus[reimbursement.status].count++;
    reimbByStatus[reimbursement.status].amount += getReimbursementAmount(reimbursement);
  });

  const reimbByType: Record<string, { count: number; amount: number }> = {};
  filteredReimbs.forEach((reimbursement) => {
    if (!reimbByType[reimbursement.type]) reimbByType[reimbursement.type] = { count: 0, amount: 0 };
    reimbByType[reimbursement.type].count++;
    reimbByType[reimbursement.type].amount += getReimbursementAmount(reimbursement);
  });

  const reimbByMonth: Record<string, { count: number; amount: number }> = {};
  filteredReimbs.forEach((reimbursement) => {
    const timestamp = getReimbursementStatTimestamp(reimbursement);
    if (!timestamp) return;
    const key = timestampMonthKey(timestamp);
    if (!reimbByMonth[key]) reimbByMonth[key] = { count: 0, amount: 0 };
    reimbByMonth[key].count++;
    reimbByMonth[key].amount += getReimbursementAmount(reimbursement);
  });

  const coveredInFiltered = filtered.filter((invoice) => reimbInvoiceIds.has(invoice.id)).length;
  const coverageRate = count > 0 ? (coveredInFiltered / count) * 100 : 0;

  const reimbursement: ReimbursementStatsData = {
    count: filteredReimbs.length,
    totalAmount: filteredReimbs.reduce((sum, item) => sum + getReimbursementAmount(item), 0),
    paidAmount: reimbByStatus.paid.amount,
    pendingAmount: reimbByStatus.pending_payment.amount,
    draftAmount: reimbByStatus.draft.amount,
    byStatus: reimbByStatus,
    byType: reimbByType,
    byMonth: reimbByMonth,
    coverageRate,
  };

  return { total, totalTax, count, avgAmount, verifiedCount, byCategory, byMonth, filtered, reimbursement, topSellers };
}

export function useStatistics(
  invoices: ArchivedInvoice[],
  timeRange: TimeRange,
  reimbursements: Reimbursement[] = []
): StatisticsData {
  return useMemo(() => calculateStatistics(invoices, timeRange, reimbursements), [invoices, timeRange, reimbursements]);
}
