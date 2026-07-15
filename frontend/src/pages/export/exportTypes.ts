import type { ArchivedInvoice, InvoiceCategory } from "../../types";
import type { Reimbursement, ReimbursementStatus, ReimbursementType } from "../../types/reimbursement";

export type ExportMode = "invoice" | "reimbursement";

export type InvoiceFieldKey =
  | "invoiceCode"
  | "invoiceNumber"
  | "invoiceDate"
  | "amount"
  | "taxAmount"
  | "totalAmount"
  | "sellerName"
  | "buyerName"
  | "category"
  | "isVerified"
  | "isReimbursed"
  | "notes";

export type FieldDef<K extends string = string> = {
  key: K;
  label: string;
  defaultOn: boolean;
};

export const INVOICE_FIELDS: FieldDef<InvoiceFieldKey>[] = [
  { key: "invoiceCode", label: "发票代码", defaultOn: false },
  { key: "invoiceNumber", label: "发票号码", defaultOn: true },
  { key: "invoiceDate", label: "开票日期", defaultOn: true },
  { key: "amount", label: "金额(不含税)", defaultOn: true },
  { key: "taxAmount", label: "税额", defaultOn: true },
  { key: "totalAmount", label: "价税合计", defaultOn: true },
  { key: "sellerName", label: "销方名称", defaultOn: true },
  { key: "buyerName", label: "购方名称", defaultOn: true },
  { key: "category", label: "发票类型", defaultOn: true },
  { key: "isVerified", label: "验真状态", defaultOn: false },
  { key: "isReimbursed", label: "报销状态", defaultOn: false },
  { key: "notes", label: "备注", defaultOn: false },
];

export type ReimbFieldKey =
  | "code"
  | "title"
  | "applicant"
  | "department"
  | "type"
  | "status"
  | "totalAmount"
  | "totalTax"
  | "createdAt"
  | "itemCount";

export const REIMB_FIELDS: FieldDef<ReimbFieldKey>[] = [
  { key: "code", label: "报销编号", defaultOn: true },
  { key: "title", label: "标题", defaultOn: true },
  { key: "applicant", label: "申请人", defaultOn: true },
  { key: "department", label: "部门", defaultOn: true },
  { key: "type", label: "报销类型", defaultOn: true },
  { key: "status", label: "状态", defaultOn: true },
  { key: "totalAmount", label: "总金额", defaultOn: true },
  { key: "totalTax", label: "税额", defaultOn: true },
  { key: "createdAt", label: "创建日期", defaultOn: true },
  { key: "itemCount", label: "发票数量", defaultOn: false },
];

export const CATEGORY_LABELS: Record<InvoiceCategory, string> = {
  vat_special: "增值税专票",
  vat_normal: "增值税普票",
  electronic: "电子发票",
  toll: "通行费发票",
  train: "火车票",
  flight: "机票行程单",
  rideshare: "网约车行程单",
  rideshare_invoice: "网约车发票",
  hotel: "住宿发票",
  taxi: "出租车票",
  other: "其他",
};

export const STATUS_LABELS: Record<ReimbursementStatus, string> = {
  draft: "草稿",
  pending_payment: "待支付",
  paid: "已支付",
};

export const REIMB_TYPE_LABELS: Record<ReimbursementType, string> = {
  travel: "差旅费",
  transportation: "交通费",
  accommodation: "住宿费",
  office: "办公费",
  entertainment: "招待费",
  meal: "餐饮费",
  training: "培训费",
  communication: "通讯费",
  medical: "医疗费",
  other: "其他",
};

function normalizeDate(raw: string | undefined): string {
  if (!raw) return "";

  const cn = raw.match(/(\d{4})\u5e74(\d{1,2})\u6708(\d{1,2})\u65e5/);
  if (cn) return `${cn[1]}/${Number(cn[2])}/${Number(cn[3])}`;

  const std = raw.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (std) return `${std[1]}/${Number(std[2])}/${Number(std[3])}`;
  return raw;
}

export function getInvoiceValue(inv: ArchivedInvoice, key: InvoiceFieldKey): string {
  switch (key) {
    case "invoiceCode": return inv.invoiceCode ?? "";
    case "invoiceNumber": return inv.invoiceNumber ?? "";
    case "invoiceDate": return normalizeDate(inv.invoiceDate);
    case "amount": return inv.amount != null ? String(inv.amount) : "";
    case "taxAmount": return inv.taxAmount != null ? String(inv.taxAmount) : "";
    case "totalAmount": return inv.totalAmount != null ? String(inv.totalAmount) : "";
    case "sellerName": return inv.sellerName ?? "";
    case "buyerName": return inv.buyerName ?? "";
    case "category": return CATEGORY_LABELS[inv.category] ?? inv.category;
    case "isVerified": return inv.isVerified ? "已验真" : "未验真";
    case "isReimbursed": return inv.isReimbursed ? "已报销" : "未报销";
    case "notes": return inv.notes ?? "";
    default: return "";
  }
}

export function getReimbValue(r: Reimbursement, key: ReimbFieldKey): string {
  switch (key) {
    case "code": return r.code;
    case "title": return r.title;
    case "applicant": return r.applicant;
    case "department": return r.department;
    case "type": return REIMB_TYPE_LABELS[r.type] ?? r.type;
    case "status": return STATUS_LABELS[r.status] ?? r.status;
    case "totalAmount": return String(r.totalAmount);
    case "totalTax": return String(r.totalTax);
    case "createdAt": return new Date(r.createdAt).toLocaleDateString("zh-CN");
    case "itemCount": return String(r.items.length);
    default: return "";
  }
}
