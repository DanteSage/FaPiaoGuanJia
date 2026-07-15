import { describe, expect, it } from "vitest";
import { calculateStatistics } from "../../hooks/useStatistics";
import type { ArchivedInvoice } from "../../types";
import type { Reimbursement, ReimbursementItem } from "../../types/reimbursement";
import { normalizeInvoiceDate, parseInvoiceDate, toFiniteAmount } from "../../utils/statistics";

function invoice(overrides: Partial<ArchivedInvoice>): ArchivedInvoice {
  return {
    id: "inv",
    filePath: "C:/invoices/inv.pdf",
    fileName: "inv.pdf",
    fileType: "pdf",
    fileExt: "pdf",
    category: "other",
    folderId: null,
    tagIds: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function item(overrides: Partial<ReimbursementItem>): ReimbursementItem {
  return {
    id: "item",
    invoiceId: "",
    invoiceName: "invoice.pdf",
    amount: 0,
    category: "other",
    ...overrides,
  };
}

function reimbursement(overrides: Partial<Reimbursement>): Reimbursement {
  return {
    id: "reimb",
    code: "BX202604010001",
    title: "报销单",
    type: "travel",
    applicant: "张三",
    department: "财务部",
    purpose: "差旅",
    status: "draft",
    items: [],
    totalAmount: 0,
    totalTax: 0,
    createdAt: new Date(2026, 3, 1).getTime(),
    updatedAt: new Date(2026, 3, 1).getTime(),
    approvalRecords: [],
    ...overrides,
  };
}

describe("statistics utilities", () => {
  it("normalizes common invoice date and amount formats", () => {
    expect(normalizeInvoiceDate("20260403")).toBe("2026-04-03");
    expect(normalizeInvoiceDate("2026年4月3日")).toBe("2026-04-03");
    expect(parseInvoiceDate("2026/04/03")?.key).toBe("2026-04-03");
    expect(toFiniteAmount("¥1,234.50")).toBe(1234.5);
  });
});

describe("calculateStatistics", () => {
  const now = new Date(2026, 3, 15, 12);

  it("includes compact invoice dates in scoped statistics", () => {
    const stats = calculateStatistics(
      [
        invoice({ id: "a", invoiceDate: "20260401", totalAmount: 100, sellerName: "A", category: "train" }),
        invoice({ id: "b", invoiceDate: "2026年4月2日", totalAmount: "200.50" as unknown as number, sellerName: "B", category: "hotel" }),
        invoice({ id: "c", invoiceDate: "2026-03-31", totalAmount: 999, sellerName: "C", category: "taxi" }),
      ],
      "month",
      [],
      now
    );

    expect(stats.count).toBe(2);
    expect(stats.total).toBe(300.5);
    expect(stats.byMonth["2026-04"]).toEqual({ count: 2, amount: 300.5 });
    expect(stats.byCategory.train.count).toBe(1);
    expect(stats.byCategory.hotel.amount).toBe(200.5);
  });

  it("keeps undated invoices in all-time statistics", () => {
    const stats = calculateStatistics(
      [
        invoice({ id: "a", invoiceDate: undefined, totalAmount: 50 }),
        invoice({ id: "b", invoiceDate: "2026-04-01", totalAmount: 100 }),
      ],
      "all",
      [],
      now
    );

    expect(stats.count).toBe(2);
    expect(stats.total).toBe(150);
    expect(stats.byMonth["2026-04"]).toEqual({ count: 1, amount: 100 });
  });

  it("calculates totalTax from invoice taxAmount fields", () => {
    const stats = calculateStatistics(
      [
        invoice({ id: "a", invoiceDate: "2026-04-01", totalAmount: 113, taxAmount: 13 }),
        invoice({ id: "b", invoiceDate: "2026-04-02", totalAmount: 206, taxAmount: 6 }),
        invoice({ id: "c", invoiceDate: "2026-04-03", totalAmount: 50 }),
      ],
      "all",
      [],
      now
    );

    expect(stats.totalTax).toBe(19);
    expect(stats.byCategory.other.taxAmount).toBe(19);
  });

  it("calculates coverage from all reimbursement links", () => {
    const stats = calculateStatistics(
      [invoice({ id: "inv-a", invoiceDate: "2026-04-01", totalAmount: 100 })],
      "month",
      [
        reimbursement({
          id: "old-reimb",
          createdAt: new Date(2025, 0, 1).getTime(),
          items: [item({ invoiceId: "inv-a", amount: 100 })],
          totalAmount: 100,
        }),
      ],
      now
    );

    expect(stats.reimbursement.count).toBe(0);
    expect(stats.reimbursement.coverageRate).toBe(100);
  });

  it("uses reimbursement status timestamps and item amount fallback", () => {
    const stats = calculateStatistics(
      [],
      "month",
      [
        reimbursement({
          id: "paid-reimb",
          status: "paid",
          createdAt: new Date(2026, 0, 1).getTime(),
          paidAt: new Date(2026, 3, 5).getTime(),
          items: [item({ amount: 88 })],
          totalAmount: 0,
        }),
      ],
      now
    );

    expect(stats.reimbursement.count).toBe(1);
    expect(stats.reimbursement.totalAmount).toBe(88);
    expect(stats.reimbursement.paidAmount).toBe(88);
    expect(stats.reimbursement.byMonth["2026-04"]).toEqual({ count: 1, amount: 88 });
  });
});
