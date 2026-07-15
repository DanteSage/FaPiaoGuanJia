import { describe, it, expect } from "vitest";
import {
  inferCategory,
  checkDuplicate,
  extractInvoiceFields,
} from "../../hooks/archiveUtils";
import type { ArchivedInvoice, OcrResult } from "../../types";

describe("inferCategory", () => {
  it("detects VAT special invoice from filename", () => {
    expect(inferCategory("增值税专用发票.pdf")).toBe("vat_special");
    expect(inferCategory("专票_2024.pdf")).toBe("vat_special");
  });

  it("detects VAT normal invoice from filename", () => {
    expect(inferCategory("增值税普通发票.pdf")).toBe("vat_normal");
  });

  it("detects electronic invoice", () => {
    expect(inferCategory("电子发票_001.pdf")).toBe("electronic");
  });

  it("detects train ticket", () => {
    expect(inferCategory("火车票.ofd")).toBe("train");
    expect(inferCategory("高铁票据.pdf")).toBe("train");
  });

  it("detects rideshare invoice vs trip", () => {
    expect(inferCategory("滴滴出行行程单.pdf")).toBe("rideshare");
    expect(inferCategory("滴滴发票.pdf")).toBe("rideshare_invoice");
  });

  it("detects hotel invoice", () => {
    expect(inferCategory("住宿发票.pdf")).toBe("hotel");
    expect(inferCategory("酒店发票.pdf")).toBe("hotel");
  });

  it("detects taxi", () => {
    expect(inferCategory("出租车票.pdf")).toBe("taxi");
  });

  it("detects flight", () => {
    expect(inferCategory("机票行程单.pdf")).toBe("flight");
  });

  it("falls back to other for generic filename", () => {
    expect(inferCategory("document.pdf")).toBe("other");
  });

  it("uses OCR fields when filename is generic", () => {
    expect(inferCategory("scan.pdf", { invoice_type: "铁路电子客票" })).toBe("train");
    expect(inferCategory("scan.pdf", { invoice_type: "增值税专用" })).toBe("vat_special");
  });

  it("uses OCR text content as fallback", () => {
    expect(inferCategory("scan.pdf", { content: "增值税专用发票" })).toBe("vat_special");
  });
});

describe("checkDuplicate", () => {
  const existing: ArchivedInvoice[] = [
    {
      id: "1",
      filePath: "C:\\invoices\\a.pdf",
      fileName: "a.pdf",
      fileType: "pdf",
      fileExt: "pdf",
      category: "other",
      folderId: null,
      tagIds: [],
      invoiceCode: "001",
      invoiceNumber: "12345",
      createdAt: 0,
      updatedAt: 0,
    },
  ];

  it("finds duplicate by invoice code + number", () => {
    const dup = checkDuplicate(existing, { invoiceCode: "001", invoiceNumber: "12345" });
    expect(dup).not.toBeNull();
    expect(dup!.id).toBe("1");
  });

  it("finds duplicate by file path", () => {
    const dup = checkDuplicate(existing, { filePath: "C:\\invoices\\a.pdf" });
    expect(dup).not.toBeNull();
  });

  it("returns null for non-duplicate", () => {
    const dup = checkDuplicate(existing, { filePath: "C:\\invoices\\b.pdf", invoiceCode: "002", invoiceNumber: "99999" });
    expect(dup).toBeNull();
  });

  it("returns null when no identifying info", () => {
    const dup = checkDuplicate(existing, {});
    expect(dup).toBeNull();
  });
});

describe("extractInvoiceFields", () => {
  it("returns empty object for undefined OCR result", () => {
    expect(extractInvoiceFields(undefined)).toEqual({});
  });

  it("returns empty object for OCR result without fields", () => {
    const ocr: OcrResult = { text: "some text" };
    expect(extractInvoiceFields(ocr)).toEqual({});
  });

  it("extracts Chinese field names", () => {
    const ocr: OcrResult = {
      text: "",
      fields: {
        "发票代码": "044001",
        "发票号码": "12345678",
        "开票日期": "2025-01-15",
        "价税合计": "1180.00",
        "税额": "180.00",
        "销售方名称": "测试公司",
        "购买方名称": "买方公司",
      },
    };
    const result = extractInvoiceFields(ocr);
    expect(result.invoiceCode).toBe("044001");
    expect(result.invoiceNumber).toBe("12345678");
    expect(result.invoiceDate).toBe("2025-01-15");
    expect(result.totalAmount).toBe(1180);
    expect(result.taxAmount).toBe(180);
    expect(result.sellerName).toBe("测试公司");
    expect(result.buyerName).toBe("买方公司");
  });

  it("extracts English field names", () => {
    const ocr: OcrResult = {
      text: "",
      fields: {
        invoiceCode: "044001",
        invoiceNumber: "9999",
        totalAmount: "500.50",
      },
    };
    const result = extractInvoiceFields(ocr);
    expect(result.invoiceCode).toBe("044001");
    expect(result.totalAmount).toBe(500.5);
  });

  it("handles invalid amount gracefully", () => {
    const ocr: OcrResult = {
      text: "",
      fields: { "金额": "not-a-number" },
    };
    const result = extractInvoiceFields(ocr);
    expect(result.amount).toBeUndefined();
  });

  it("handles empty amount string", () => {
    const ocr: OcrResult = {
      text: "",
      fields: { "金额": "" },
    };
    const result = extractInvoiceFields(ocr);
    expect(result.amount).toBeUndefined();
  });
});
