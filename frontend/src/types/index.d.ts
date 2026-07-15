export type InvoiceFileType = "pdf" | "ofd" | "image" | "xml" | "unknown";

export type InvoiceFileItem = {
  id: string;
  path: string;
  name: string;
  ext: string;
  type: InvoiceFileType;
};

export type OcrResult = {
  text: string;
  blocks?: Array<{
    text: string;
    confidence?: number;
  }>;
  fields?: Record<string, string>;
};

export type PreviewPaperPreset = "A4" | "A5" | "Letter";
export type PreviewOrientation = "portrait" | "landscape";

export type PreviewConfig = {
  version: 1;
  layout: {
    nUp: 1 | 2 | 3 | 4 | 6;
    grid?: { cols: number; rows: number };
    showPaper: boolean;
    showMargins: boolean;
    paperShadow: boolean;
    mergePreview: boolean;
  };
  paper: {
    preset: PreviewPaperPreset;
    widthMm: number;
    heightMm: number;
    orientation: PreviewOrientation;
    marginMm: { top: number; right: number; bottom: number; left: number };
  };
  splitLine: {
    enabled: boolean;
    axis: "horizontal" | "vertical";
    positionPct: number;
    style: "dashed" | "solid";
    thicknessPx: number;
    opacity: number;
  };
  punchHoles: {
    enabled: boolean;
    position: "left" | "top";
    count: 2 | 4;
  };
  bindingLine: {
    enabled: boolean;
    position: "left" | "top";
    style: "dashed" | "solid";
  };
  extras?: Record<string, unknown>;
};

export type InvoiceCategory =
  | "vat_special"
  | "vat_normal"
  | "electronic"
  | "toll"
  | "train"
  | "flight"
  | "rideshare"
  | "rideshare_invoice"
  | "hotel"
  | "taxi"
  | "other";

export type InvoiceTag = {
  id: string;
  name: string;
  color: string;
};

export type InvoiceFolder = {
  id: string;
  name: string;
  parentId: string | null;
  icon?: string;
  color?: string;
  createdAt: number;
  updatedAt: number;
};

export type ArchivedInvoice = {
  id: string;
  filePath: string;
  fileName: string;
  fileType: InvoiceFileType;
  fileExt: string;
  fileSize?: number;
  invoiceCode?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  amount?: number;
  taxAmount?: number;
  totalAmount?: number;
  sellerName?: string;
  buyerName?: string;
  category: InvoiceCategory;
  folderId: string | null;
  tagIds: string[];
  isVerified?: boolean;
  isReimbursed?: boolean;
  isExpired?: boolean;
  ocrResult?: OcrResult;
  notes?: string;
  createdAt: number;
  updatedAt: number;
};

export type ArchiveFilterOptions = {
  search?: string;
  categories?: InvoiceCategory[];
  folderIds?: string[];
  tagIds?: string[];
  sellerName?: string;
  dateRange?: {
    start?: string;
    end?: string;
  };
  amountRange?: {
    min?: number;
    max?: number;
  };
  isVerified?: boolean;
  isReimbursed?: boolean;
};

export type ArchiveSortOption = {
  field: "invoiceDate" | "totalAmount" | "createdAt" | "fileName";
  order: "asc" | "desc";
};

export type ArchiveState = {
  invoices: ArchivedInvoice[];
  folders: InvoiceFolder[];
  tags: InvoiceTag[];
  filter: ArchiveFilterOptions;
  sort: ArchiveSortOption;
  selectedIds: string[];
  activeId: string | null;
};
