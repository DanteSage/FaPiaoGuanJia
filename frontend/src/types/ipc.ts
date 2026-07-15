import type { ArchivedInvoice, InvoiceFolder, InvoiceTag } from "../types";
import type { ApprovalRecord, Reimbursement, ReimbursementItem } from "./reimbursement";
import type { RpcData, RpcResult } from "./rpc";

export interface LegalConsentStatus {
  accepted: boolean;
  version: string;
  acceptedAt?: string;
}

export interface AcceptLegalConsentResult extends LegalConsentStatus {
  success: boolean;
}

export type ApiVerifyConfigStatus = {
  success: boolean;
  configured: boolean;
  authType: "direct" | "aliyun";
  appKey: string;
  appSecret: string;
  appCode: string;
  error?: string;
};

export type VerifyInvoiceResult = {
  success: boolean;
  code?: number;
  data?: Record<string, unknown>;
  error?: string;
  description?: string;
  needConfig?: boolean;
  requestId?: string;
  screenshotPath?: string;
  componentStatus?: RpaComponentStatus;
};

export type RpaComponentStatus = {
  installed: boolean;
  componentRoot: string;
  pythonPath: string;
  message: string;
};

export type RpaBrowserPreference = "auto" | "edge" | "chrome";

export type RpaEffectiveBrowser = {
  value: string;
  label: string;
  path: string;
};

export type RpaBrowserStatus = {
  playwrightInstalled: boolean;
  browserPreference: RpaBrowserPreference;
  configuredChromePath: string;
  canLaunch: boolean;
  edge: { available: boolean; path: string };
  chrome: { available: boolean; path: string; configured: boolean };
  chromium: { available: boolean; path: string; configured: boolean };
  componentStatus: RpaComponentStatus;
  effectiveBrowser: RpaEffectiveBrowser;
};

export type RpaConfigStatus = {
  success: boolean;
  configured: boolean;
  captchaAppKey: string;
  browserPreference: RpaBrowserPreference;
  chromiumExecutablePath: string;
  componentStatus: RpaComponentStatus;
  browserStatus: RpaBrowserStatus;
  error?: string;
};

export type RpaBrowserTestResult = {
  success: boolean;
  error?: string;
  pageTitle?: string;
  componentStatus?: RpaComponentStatus;
  browserStatus?: RpaBrowserStatus;
  effectiveBrowser?: RpaEffectiveBrowser;
};

export type RpaComponentInstallResult = {
  success: boolean;
  installed: boolean;
  componentRoot?: string;
  pythonPath?: string;
  message?: string;
  error?: string;
};

export interface InvoiceApi {
  pickFiles: () => Promise<string[]>;
  pickChromeExecutable: () => Promise<string | null>;
  pickChromiumExecutable: () => Promise<string | null>;
  pickRpaComponentZip: () => Promise<string | null>;
  authorizePaths: (filePaths: string[]) => Promise<string[]>;
  readFile: (filePath: string) => Promise<Uint8Array>;
  checkFilesExist: (filePaths: string[]) => Promise<Record<string, boolean>>;
  deleteFiles: (filePaths: string[]) => Promise<boolean>;
  makeTempPath: (prefix: string, suffix: string) => Promise<string>;
  ocrFile: (filePath: string) => Promise<{ text: string; fields?: Record<string, string> }>;
  ocrGetEngineStatus: () => Promise<{ active: "rapidocr" | "winrt" | "none"; rapidocr: boolean; winrt: boolean }>;
  mergeFiles: (
    filePaths: string[],
    config?: {
      nUp?: number;
      cols?: number;
      rows?: number;
      orientation?: "portrait" | "landscape";
      paperSize?: string;
      marginMm?: { top: number; right: number; bottom: number; left: number };
      outputPath?: string;
    }
  ) => Promise<string>;
  mergePngsToPdf: (
    pngDataUrls: string[],
    outputPath: string,
    paperWidthMm?: number,
    paperHeightMm?: number
  ) => Promise<string>;
  buildReimbursementCoverPdf: (
    data: Record<string, unknown>,
    outputPath?: string,
    template?: Record<string, unknown>
  ) => Promise<string>;
  buildReimbursementPdf: (
    data: Record<string, unknown>,
    invoiceFilePaths: string[],
    config?: {
      nUp?: number;
      cols?: number;
      rows?: number;
      orientation?: "portrait" | "landscape";
      paperSize?: string;
      marginMm?: { top: number; right: number; bottom: number; left: number };
    },
    outputPath?: string,
    template?: Record<string, unknown>
  ) => Promise<{ outputPath: string; coverPath: string }>;
  showItemInFolder: (filePath: string) => Promise<void>;
  renderPdfPage: (
    filePath: string,
    pageIndex: number,
    scale: number
  ) => Promise<{
    pageCount: number;
    pageIndex: number;
    width: number;
    height: number;
    pngBase64: string;
  }>;
  captureRectPng: (rect: { x: number; y: number; width: number; height: number }) => Promise<Uint8Array>;
  chooseSavePath: (defaultName: string) => Promise<string | null>;
  saveText: (filePath: string, content: string) => Promise<boolean>;
  saveBase64: (filePath: string, base64: string) => Promise<boolean>;
  saveBytes: (filePath: string, bytes: Uint8Array) => Promise<boolean>;
  openPath: (filePath: string) => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  getPrinters: () => Promise<Array<{ name: string; isDefault: boolean }>>;
  print: (options: { printerName: string; pdfPath: string; copies?: number }) => Promise<{
    success: boolean;
    fallback?: boolean;
    cancelled?: boolean;
    message?: string;
  }>;
  saveTheme: (theme: string) => Promise<void>;
  getLegalConsentStatus: () => Promise<LegalConsentStatus>;
  acceptLegalConsent: () => Promise<AcceptLegalConsentResult>;
  relaunchApp: () => Promise<void>;
  pickStorageDirectory: (title?: string) => Promise<string | null>;
  changeStorageRoot: (newPath: string, migrate: boolean) => Promise<{ success: boolean; newPath: string; needRestart: boolean }>;
  onConfirmClose: (callback: () => void) => (() => void);
  confirmClose: () => void;
  cancelClose: () => void;
  loadArchiveData: () => Promise<RpcData<{ invoices: ArchivedInvoice[]; folders: InvoiceFolder[]; tags: InvoiceTag[] }> | null>;
  saveArchiveData: () => Promise<RpcResult>;
  getDataPath: () => Promise<string>;
  getStoragePaths: () => Promise<RpcData<{
    database: { path: string; sizeMB: number };
    files: { path: string; count: number; sizeMB: number };
    logs: { path: string; count: number; sizeMB: number };
    config: { path: string; count: number; sizeMB: number };
    images: { path: string; count: number; sizeMB: number };
    outputs: { path: string; count: number; sizeMB: number };
  }> | null>;
  addArchivedInvoice: (data: Partial<ArchivedInvoice>) => Promise<RpcData<{ invoice?: ArchivedInvoice; duplicate?: ArchivedInvoice }>>;
  updateArchivedInvoice: (id: string, data: Partial<ArchivedInvoice>) => Promise<RpcResult>;
  deleteArchivedInvoice: (
    id: string,
    deleteFile?: boolean,
    cascadeMode?: "keep" | "remove"
  ) => Promise<RpcResult>;
  deleteArchivedInvoices: (
    ids: string[],
    deleteFiles?: boolean,
    cascadeMode?: "keep" | "remove"
  ) => Promise<RpcData<{ deletedCount: number }>>;
  checkReimbursementRefs: (
    ids: string[]
  ) => Promise<
    RpcData<{
      refs: Record<
        string,
        Array<{ id: string; code: string; title: string; status: string }>
      >;
    }>
  >;
  checkInvoiceDuplicate: (
    filePath?: string,
    invoiceCode?: string,
    invoiceNumber?: string
  ) => Promise<RpcData<{ duplicate: ArchivedInvoice | null }>>;
  getArchiveStatistics: () => Promise<RpcData<{
    total: number;
    totalAmount: number;
    verifiedCount: number;
    reimbursedCount: number;
    categoryStats: Record<string, number>;
  }>>;
  moveInvoicesToFolder: (invoiceIds: string[], folderId: string | null) => Promise<RpcData<{ updatedCount: number }>>;
  addTagsToInvoices: (invoiceIds: string[], tagIds: string[]) => Promise<RpcData<{ updatedCount: number }>>;
  removeTagsFromInvoices: (invoiceIds: string[], tagIds: string[]) => Promise<RpcData<{ updatedCount: number }>>;
  addFolder: (data: Partial<InvoiceFolder>) => Promise<RpcData<{ folder: InvoiceFolder }>>;
  updateFolder: (id: string, data: Partial<InvoiceFolder>) => Promise<RpcResult>;
  deleteFolder: (id: string) => Promise<RpcResult>;
  listFolders: () => Promise<RpcData<{ folders: InvoiceFolder[] }>>;
  addTag: (data: Partial<InvoiceTag>) => Promise<RpcData<{ tag: InvoiceTag }>>;
  updateTag: (id: string, data: Partial<InvoiceTag>) => Promise<RpcResult>;
  deleteTag: (id: string) => Promise<RpcResult>;
  listTags: () => Promise<RpcData<{ tags: InvoiceTag[] }>>;
  loadReimbursements: () => Promise<RpcData<{ reimbursements: Reimbursement[] }>>;
  createReimbursement: (data: Partial<Reimbursement>) => Promise<RpcData<{ reimbursement?: Reimbursement }>>;
  updateReimbursement: (id: string, data: Partial<Reimbursement>) => Promise<RpcResult>;
  deleteReimbursement: (id: string) => Promise<RpcResult>;
  batchDeleteReimbursements: (ids: string[]) => Promise<RpcData<{ deletedCount: number }>>;
  addReimbursementItem: (reimbursementId: string, item: Partial<ReimbursementItem>) => Promise<RpcData<{ itemId?: string }>>;
  updateReimbursementItem: (
    itemId: string,
    reimbursementId: string,
    item: Partial<ReimbursementItem>
  ) => Promise<RpcResult>;
  removeReimbursementItem: (itemId: string, reimbursementId: string) => Promise<RpcResult>;
  addReimbursementApproval: (
    reimbursementId: string,
    record: Partial<ApprovalRecord>
  ) => Promise<RpcData<{ recordId?: string }>>;
  getReimbursementStatistics: () => Promise<RpcData<{
    total: number;
    count: number;
    byStatus: Record<string, { count: number; amount: number }>;
    byType: Record<string, number>;
    avgAmount: number;
    pendingCount: number;
    pendingAmount: number;
  }>>;
  storeFile: (filePath: string, move?: boolean) => Promise<RpcData<{ storedPath: string; fileHash: string; isNew: boolean }>>;
  storeFileAndSave: (
    filePath: string,
    data: {
      invoice_code?: string;
      invoice_number?: string;
      invoice_date?: string;
      amount?: number;
      tax_amount?: number;
      total_amount?: number;
      buyer_name?: string;
      seller_name?: string;
      ocr_text?: string;
      extra_data?: Record<string, unknown>;
    },
    move?: boolean
  ) => Promise<RpcData<{ id: number; storedPath: string; fileHash: string; isNew: boolean }>>;
  getStorageStats: () => Promise<RpcData<{ storagePath: string; totalFiles: number; totalSizeBytes: number; totalSizeMB: number }>>;
  deleteStoredFile: (filePath: string) => Promise<RpcResult>;
  extractOfdData: (filePath: string) => Promise<RpcData<{ data?: Record<string, string>; labeledFields?: Record<string, string>; text?: string }>>;
  ocrOfdFallback: (filePath: string) => Promise<RpcData<{ text?: string; fields?: Record<string, string>; labeledFields?: Record<string, string>; blocks?: Array<{ text: string; confidence?: number | null }> }>>;
  preloadOfd: (filePath: string) => Promise<RpcData<{ pdfPath?: string }>>;
  verifyInvoice: (params: {
    fpdm?: string;
    fphm: string;
    kprq: string;
    checkCode?: string;
    amount?: string;
  }) => Promise<VerifyInvoiceResult>;
  verifyInvoiceByFile: (filePath: string) => Promise<VerifyInvoiceResult>;
  setVerifyConfig: (params: {
    authType: "direct" | "aliyun";
    appKey?: string;
    appSecret?: string;
    appCode?: string;
  }) => Promise<RpcResult>;
  getVerifyConfig: () => Promise<ApiVerifyConfigStatus>;
  clearVerifyConfig: () => Promise<RpcResult>;
  rpaVerifyInvoice: (params: {
    fpdm?: string;
    fphm: string;
    kprq: string;
    checkCode?: string;
    amount?: string;
    captchaAppKey?: string;
    screenshotMode?: "dialog" | "with_url";
  }) => Promise<VerifyInvoiceResult>;
  onRpaVerifyProgress: (
    callback: (payload: {
      stage: string;
      message: string;
      attempt?: number;
      pollAttempt?: number;
      pollTotal?: number;
    }) => void
  ) => () => void;
  setRpaConfig: (params: {
    captchaAppKey?: string;
    browserPreference?: RpaBrowserPreference;
    chromiumExecutablePath?: string;
  }) => Promise<RpcResult>;
  getRpaConfig: () => Promise<RpaConfigStatus>;
  clearRpaConfig: () => Promise<RpcResult>;
  testRpaBrowser: (params?: {
    browserPreference?: RpaBrowserPreference;
    chromiumExecutablePath?: string;
  }) => Promise<RpaBrowserTestResult>;
  installRpaComponent: (options?: { zipPath?: string }) => Promise<RpaComponentInstallResult>;
  getVerifyHistory: (limit: number, offset: number, verifyMode?: "api" | "rpa") => Promise<RpcData<{ records: Array<{ uid: string; fpdm?: string; fphm: string; kprq: string; checkCode?: string; amount?: string; success: boolean; errorMessage?: string; resultData?: Record<string, unknown>; invoiceUid?: string; verifyMode?: "api" | "rpa"; screenshotPath?: string; createdAt: number }> }>>;
  addVerifyHistory: (data: {
    fpdm?: string;
    fphm: string;
    kprq: string;
    checkCode?: string;
    amount?: string;
    success: boolean;
    errorMessage?: string;
    resultData?: Record<string, unknown>;
    invoiceUid?: string;
    verifyMode?: "api" | "rpa";
    screenshotPath?: string;
    createdAt: number;
  }) => Promise<RpcResult>;
  deleteVerifyHistory: (uid: string) => Promise<RpcResult>;
  batchDeleteVerifyHistory: (uids: string[]) => Promise<RpcData<{ deletedCount: number }>>;
  clearVerifyHistory: (verifyMode?: "api" | "rpa") => Promise<RpcResult>;
  clearOfdCaches: () => Promise<{ deletedFiles: number; freedBytes: number }>;
}
