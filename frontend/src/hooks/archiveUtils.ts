import type {
  ArchivedInvoice,
  InvoiceCategory,
  InvoiceFolder,
  OcrResult,
} from "../types";

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

export const TAG_COLORS = [
  "#6aa6ff", "#ff6a7b", "#4ade80", "#facc15", "#a78bfa",
  "#f472b6", "#22d3ee", "#fb923c", "#94a3b8", "#34d399",
];

export function inferCategory(fileName: string, ocrFields?: Record<string, string>, ocrText?: string): InvoiceCategory {
  const lower = fileName.toLowerCase();

  const isRideshare =
    lower.includes("滴滴") ||
    lower.includes("曹操") ||
    lower.includes("花小猪") ||
    lower.includes("网约车") ||
    lower.includes("打车") ||
    lower.includes("didi") ||
    lower.includes("uber");

  if (isRideshare) {
    if (lower.includes("发票") || lower.includes("invoice")) {
      return "rideshare_invoice";
    }
    return "rideshare";
  }

  if (
    lower.includes("住宿") ||
    lower.includes("酒店") ||
    lower.includes("宾馆") ||
    lower.includes("旅馆") ||
    lower.includes("民宿") ||
    lower.includes("hotel") ||
    lower.includes("客房") ||
    lower.includes("房费")
  ) {
    return "hotel";
  }

  if (lower.includes("专") || lower.includes("special")) return "vat_special";
  if (lower.includes("普") || lower.includes("normal")) return "vat_normal";
  if (lower.includes("电子") || lower.includes("electronic")) return "electronic";
  if (lower.includes("通行") || lower.includes("toll")) return "toll";
  if (
    lower.includes("火车") ||
    lower.includes("train") ||
    lower.includes("高铁") ||
    lower.includes("动车")
  ) {
    return "train";
  }
  if (lower.includes("出租") || lower.includes("taxi")) return "taxi";
  if (
    lower.includes("机票") ||
    lower.includes("flight") ||
    lower.includes("航班") ||
    lower.includes("飞机") ||
    lower.includes("登机牌") ||
    (lower.includes("行程") && (lower.includes("航空") || lower.includes("机场")))
  ) {
    return "flight";
  }

  if (ocrFields) {
    const invoiceType = ocrFields.invoice_type || "";
    if (invoiceType.includes("铁路电子客票") || invoiceType.includes("火车") || invoiceType.includes("铁路")) return "train";
    if (invoiceType.includes("增值税专用")) return "vat_special";
    if (invoiceType.includes("增值税普通")) return "vat_normal";
    if (invoiceType.includes("通行费")) return "toll";
    if (invoiceType.includes("机票") || invoiceType.includes("行程单")) return "flight";
    if (invoiceType.includes("出租车")) return "taxi";

    const sellerName = ocrFields.seller_name || "";
    const rideshareProviders = ["滴滴", "曹操", "花小猪", "网约车", "出行科技", "出行服务", "打车", "高德", "T3出行", "享道", "如祺", "首汽", "万顺", "嘀嗒"];
    if (rideshareProviders.some((k) => sellerName.includes(k))) {
      if (invoiceType.includes("电子") || invoiceType.includes("发票")) return "rideshare_invoice";
      return "rideshare";
    }
    if (sellerName.includes("出租车") || sellerName.includes("出租汽车")) return "taxi";
    if (["酒店", "宾馆", "旅馆", "住宿", "民宿", "客房"].some((k) => sellerName.includes(k))) return "hotel";
    if (["航空", "机场"].some((k) => sellerName.includes(k))) return "flight";

    if (invoiceType.includes("电子")) return "electronic";

    const text = Object.values(ocrFields).join(" ").toLowerCase();
    if (text.includes("增值税专用发票")) return "vat_special";
    if (text.includes("增值税普通发票")) return "vat_normal";
    if (text.includes("增值税电子")) return "electronic";
    if (
      ocrFields.train_no ||
      ocrFields.from_station ||
      ocrFields.to_station ||
      text.includes("铁路电子客票") ||
      text.includes("火车票") ||
      text.includes("12306")
    ) {
      return "train";
    }
  }

  if (ocrText) {
    const fullText = ocrText.toLowerCase();
    if (["滴滴", "曹操出行", "花小猪", "网约车", "出行科技"].some((k) => fullText.includes(k))) return "rideshare_invoice";
    if (fullText.includes("出租车") || fullText.includes("出租汽车")) return "taxi";
    if (["酒店", "宾馆", "住宿发票"].some((k) => fullText.includes(k))) return "hotel";
    if (fullText.includes("航空") && fullText.includes("行程")) return "flight";
    if (fullText.includes("客票行程单") || (fullText.includes("航班号") && fullText.includes("燃油附加费"))) return "flight";
    if (fullText.includes("铁路") || fullText.includes("火车") || fullText.includes("12306")) return "train";
    if (fullText.includes("通行费")) return "toll";
    if (fullText.includes("增值税专用")) return "vat_special";
    if (fullText.includes("增值税普通")) return "vat_normal";
    if (fullText.includes("电子发票")) return "electronic";
  }

  return "other";
}

export function getDescendantFolderIds(
  folderId: string,
  folders: InvoiceFolder[]
): string[] {
  const result: string[] = [folderId];
  const queue: string[] = [folderId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const folder of folders) {
      if (folder.parentId === current && !result.includes(folder.id)) {
        result.push(folder.id);
        queue.push(folder.id);
      }
    }
  }
  return result;
}

export function checkDuplicate(
  invoices: ArchivedInvoice[],
  newInvoice: Partial<ArchivedInvoice>
): ArchivedInvoice | null {
  if (newInvoice.invoiceCode && newInvoice.invoiceNumber) {
    const duplicateByNumber = invoices.find(
      (invoice) =>
        invoice.invoiceCode === newInvoice.invoiceCode &&
        invoice.invoiceNumber === newInvoice.invoiceNumber
    );
    if (duplicateByNumber) {
      return duplicateByNumber;
    }
  }

  if (newInvoice.filePath) {
    const duplicateByPath = invoices.find((invoice) => invoice.filePath === newInvoice.filePath);
    if (duplicateByPath) {
      return duplicateByPath;
    }
  }

  return null;
}

export function extractInvoiceFields(ocrResult?: OcrResult): Partial<ArchivedInvoice> {
  if (!ocrResult?.fields) {
    return {};
  }

  const fields = ocrResult.fields;
  const parseAmount = (value: string | undefined): number | undefined => {
    if (value === undefined || value === null || value === "") {
      return undefined;
    }
    const number = parseFloat(value);
    return Number.isNaN(number) ? undefined : number;
  };

  return {
    invoiceCode: fields["发票代码"] || fields.invoiceCode || fields.invoice_code,
    invoiceNumber: fields["发票号码"] || fields.invoiceNumber || fields.invoice_number,
    invoiceDate: fields["开票日期"] || fields.invoiceDate || fields.date,
    amount: parseAmount(fields["金额"] || fields.amount),
    taxAmount: parseAmount(fields["税额"] || fields.taxAmount || fields.tax),
    totalAmount: parseAmount(fields["价税合计"] || fields["合计"] || fields.totalAmount || fields.total_amount),
    sellerName: fields["销售方名称"] || fields["销方"] || fields.sellerName || fields.seller_name,
    buyerName: fields["购买方名称"] || fields["购方"] || fields.buyerName || fields.buyer_name,
  };
}
