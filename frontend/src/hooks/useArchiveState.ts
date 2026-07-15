import { useReducer, useCallback, useMemo, useEffect, useRef, useState } from "react";
import type {
  ArchivedInvoice,
  InvoiceFolder,
  InvoiceTag,
  InvoiceCategory,
  ArchiveFilterOptions,
  ArchiveSortOption,
  ArchiveState,
  InvoiceFileType,
  OcrResult,
} from "../types";
import { normalizeInvoiceDate } from "../utils/statistics";

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

const SYSTEM_FOLDERS: InvoiceFolder[] = [
  { id: "__all__", name: "全部发票", parentId: null, icon: "folder", createdAt: 0, updatedAt: 0 },
  { id: "__uncategorized__", name: "未分类", parentId: null, icon: "folder", createdAt: 0, updatedAt: 0 },
  { id: "__recent__", name: "最近添加", parentId: null, icon: "clock", createdAt: 0, updatedAt: 0 },
];

export function newId(): string {
  return `${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
}

export function inferCategory(fileName: string, ocrFields?: Record<string, string>, ocrText?: string): InvoiceCategory {
  const lower = fileName.toLowerCase();

  const isRideshare = lower.includes("滴滴") || lower.includes("曹操") || lower.includes("花小猪") ||
                      lower.includes("网约车") || lower.includes("打车") ||
                      lower.includes("didi") || lower.includes("uber");
  if (isRideshare) {
    if (lower.includes("发票") || lower.includes("invoice")) return "rideshare_invoice";
    return "rideshare";
  }

  if (lower.includes("住宿") || lower.includes("酒店") || lower.includes("宾馆") ||
      lower.includes("旅馆") || lower.includes("民宿") || lower.includes("hotel") ||
      lower.includes("客房") || lower.includes("房费")) return "hotel";

  if (lower.includes("专") || lower.includes("special")) return "vat_special";
  if (lower.includes("普") || lower.includes("normal")) return "vat_normal";
  if (lower.includes("电子") || lower.includes("electronic")) return "electronic";
  if (lower.includes("通行") || lower.includes("toll")) return "toll";
  if (lower.includes("火车") || lower.includes("train") || lower.includes("高铁") || lower.includes("动车")) return "train";

  if (lower.includes("出租") || lower.includes("taxi")) return "taxi";

  if (lower.includes("机票") || lower.includes("flight") || lower.includes("航班") ||
      lower.includes("飞机") || lower.includes("登机牌") ||
      (lower.includes("行程") && (lower.includes("航空") || lower.includes("机场")))) return "flight";

  if (ocrFields) {
    const invoiceType = ocrFields["invoice_type"] || "";
    if (invoiceType.includes("铁路电子客票") || invoiceType.includes("火车") || invoiceType.includes("铁路")) return "train";
    if (invoiceType.includes("增值税专用")) return "vat_special";
    if (invoiceType.includes("增值税普通")) return "vat_normal";
    if (invoiceType.includes("通行费")) return "toll";
    if (invoiceType.includes("机票") || invoiceType.includes("行程单")) return "flight";
    if (invoiceType.includes("出租车")) return "taxi";

    const sellerName = ocrFields["seller_name"] || "";
    const rideshareProviders = ["滴滴", "曹操", "花小猪", "网约车", "出行科技", "出行服务", "打车", "高德", "T3出行", "享道", "如祁", "首汽", "万顺", "嘀嗒"];
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

    if (ocrFields["train_no"] || ocrFields["from_station"] || ocrFields["to_station"] ||
        text.includes("铁路电子客票") || text.includes("火车票") || text.includes("12306")) return "train";
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

export function checkDuplicate(
  invoices: ArchivedInvoice[],
  newInvoice: Partial<ArchivedInvoice>
): ArchivedInvoice | null {

  if (newInvoice.invoiceCode && newInvoice.invoiceNumber) {
    const dup = invoices.find(
      (inv) =>
        inv.invoiceCode === newInvoice.invoiceCode &&
        inv.invoiceNumber === newInvoice.invoiceNumber
    );
    if (dup) return dup;
  }

  if (newInvoice.filePath) {
    const dup = invoices.find((inv) => inv.filePath === newInvoice.filePath);
    if (dup) return dup;
  }
  return null;
}

export function extractInvoiceFields(ocrResult?: OcrResult): Partial<ArchivedInvoice> {
  if (!ocrResult?.fields) return {};
  const f = ocrResult.fields;

  const parseAmount = (value: string | undefined): number | undefined => {
    if (value === undefined || value === null || value === "") return undefined;
    const num = parseFloat(value);
    return isNaN(num) ? undefined : num;
  };

  return {
    invoiceCode: f["发票代码"] || f["invoiceCode"] || f["invoice_code"],
    invoiceNumber: f["发票号码"] || f["invoiceNumber"] || f["invoice_number"],
    invoiceDate: f["开票日期"] || f["invoiceDate"] || f["date"],
    amount: parseAmount(f["金额"] || f["amount"]),
    taxAmount: parseAmount(f["税额"] || f["taxAmount"] || f["tax"]),
    totalAmount: parseAmount(f["价税合计"] || f["合计"] || f["totalAmount"] || f["total_amount"]),
    sellerName: f["销售方名称"] || f["销方"] || f["sellerName"] || f["seller_name"],
    buyerName: f["购买方名称"] || f["购方"] || f["buyerName"] || f["buyer_name"],
  };
}

type ArchiveAction =
  | { type: "LOAD_DATA"; payload: Partial<ArchiveState> }
  | { type: "ADD_INVOICE"; payload: ArchivedInvoice }
  | { type: "ADD_INVOICES"; payload: ArchivedInvoice[] }
  | { type: "UPDATE_INVOICE"; payload: { id: string; updates: Partial<ArchivedInvoice> } }
  | { type: "DELETE_INVOICE"; payload: string }
  | { type: "DELETE_INVOICES"; payload: string[] }
  | { type: "ADD_FOLDER"; payload: InvoiceFolder }
  | { type: "UPDATE_FOLDER"; payload: { id: string; updates: Partial<InvoiceFolder> } }
  | { type: "DELETE_FOLDER"; payload: string }
  | { type: "ADD_TAG"; payload: InvoiceTag }
  | { type: "UPDATE_TAG"; payload: { id: string; updates: Partial<InvoiceTag> } }
  | { type: "DELETE_TAG"; payload: string }
  | { type: "SET_FILTER"; payload: ArchiveFilterOptions }
  | { type: "SET_SORT"; payload: ArchiveSortOption }
  | { type: "SET_SELECTED"; payload: string[] }
  | { type: "TOGGLE_SELECT"; payload: string }
  | { type: "SELECT_ALL"; payload: string[] }
  | { type: "CLEAR_SELECTION" }
  | { type: "SET_ACTIVE"; payload: string | null }
  | { type: "MOVE_TO_FOLDER"; payload: { invoiceIds: string[]; folderId: string | null } }
  | { type: "ADD_TAGS_TO_INVOICES"; payload: { invoiceIds: string[]; tagIds: string[] } }
  | { type: "REMOVE_TAGS_FROM_INVOICES"; payload: { invoiceIds: string[]; tagIds: string[] } };

const initialState: ArchiveState = {
  invoices: [],
  folders: [],
  tags: [],
  filter: {},
  sort: { field: "createdAt", order: "desc" },
  selectedIds: [],
  activeId: null,
};

function archiveReducer(state: ArchiveState, action: ArchiveAction): ArchiveState {
  switch (action.type) {
    case "LOAD_DATA":
      return {
        ...state,
        ...action.payload,
      };

    case "ADD_INVOICE":
      return {
        ...state,
        invoices: [...state.invoices, action.payload],
      };

    case "ADD_INVOICES":
      return {
        ...state,
        invoices: [...state.invoices, ...action.payload],
      };

    case "UPDATE_INVOICE":
      return {
        ...state,
        invoices: state.invoices.map((inv) =>
          inv.id === action.payload.id
            ? { ...inv, ...action.payload.updates, updatedAt: Date.now() }
            : inv
        ),
      };

    case "DELETE_INVOICE":
      return {
        ...state,
        invoices: state.invoices.filter((inv) => inv.id !== action.payload),
        selectedIds: state.selectedIds.filter((id) => id !== action.payload),
        activeId: state.activeId === action.payload ? null : state.activeId,
      };

    case "DELETE_INVOICES":
      return {
        ...state,
        invoices: state.invoices.filter((inv) => !action.payload.includes(inv.id)),
        selectedIds: state.selectedIds.filter((id) => !action.payload.includes(id)),
        activeId: action.payload.includes(state.activeId || "") ? null : state.activeId,
      };

    case "ADD_FOLDER":
      return {
        ...state,
        folders: [...state.folders, action.payload],
      };

    case "UPDATE_FOLDER":
      return {
        ...state,
        folders: state.folders.map((f) =>
          f.id === action.payload.id
            ? { ...f, ...action.payload.updates, updatedAt: Date.now() }
            : f
        ),
      };

    case "DELETE_FOLDER": {
      const deletedFolderId = action.payload;
      return {
        ...state,
        folders: state.folders.filter((f) => f.id !== deletedFolderId),

        invoices: state.invoices.map((inv) =>
          inv.folderId === deletedFolderId ? { ...inv, folderId: null } : inv
        ),
      };
    }

    case "ADD_TAG":
      return {
        ...state,
        tags: [...state.tags, action.payload],
      };

    case "UPDATE_TAG":
      return {
        ...state,
        tags: state.tags.map((t) =>
          t.id === action.payload.id ? { ...t, ...action.payload.updates } : t
        ),
      };

    case "DELETE_TAG": {
      const deletedTagId = action.payload;
      return {
        ...state,
        tags: state.tags.filter((t) => t.id !== deletedTagId),

        invoices: state.invoices.map((inv) => ({
          ...inv,
          tagIds: inv.tagIds.filter((tid) => tid !== deletedTagId),
        })),
      };
    }

    case "SET_FILTER":
      return {
        ...state,
        filter: action.payload,
      };

    case "SET_SORT":
      return {
        ...state,
        sort: action.payload,
      };

    case "SET_SELECTED":
      return {
        ...state,
        selectedIds: action.payload,
      };

    case "TOGGLE_SELECT": {
      const id = action.payload;
      const isSelected = state.selectedIds.includes(id);
      return {
        ...state,
        selectedIds: isSelected
          ? state.selectedIds.filter((sid) => sid !== id)
          : [...state.selectedIds, id],
      };
    }

    case "SELECT_ALL":
      return {
        ...state,
        selectedIds: action.payload,
      };

    case "CLEAR_SELECTION":
      return {
        ...state,
        selectedIds: [],
      };

    case "SET_ACTIVE":
      return {
        ...state,
        activeId: action.payload,
      };

    case "MOVE_TO_FOLDER":
      return {
        ...state,
        invoices: state.invoices.map((inv) =>
          action.payload.invoiceIds.includes(inv.id)
            ? { ...inv, folderId: action.payload.folderId, updatedAt: Date.now() }
            : inv
        ),
      };

    case "ADD_TAGS_TO_INVOICES":
      return {
        ...state,
        invoices: state.invoices.map((inv) =>
          action.payload.invoiceIds.includes(inv.id)
            ? {
                ...inv,
                tagIds: [...new Set([...inv.tagIds, ...action.payload.tagIds])],
                updatedAt: Date.now(),
              }
            : inv
        ),
      };

    case "REMOVE_TAGS_FROM_INVOICES":
      return {
        ...state,
        invoices: state.invoices.map((inv) =>
          action.payload.invoiceIds.includes(inv.id)
            ? {
                ...inv,
                tagIds: inv.tagIds.filter((tid) => !action.payload.tagIds.includes(tid)),
                updatedAt: Date.now(),
              }
            : inv
        ),
      };

    default:
      return state;
  }
}

export function useArchiveState(onError?: (msg: string) => void) {
  const [state, dispatch] = useReducer(archiveReducer, initialState);
  const [duplicateAttemptedIds, setDuplicateAttemptedIds] = useState<string[]>([]);
  const isLoadedRef = useRef(false);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    const loadData = async () => {
      if (isLoadedRef.current) return;
      try {
        const data = await window.invoiceApi.loadArchiveData();
        if (data) {
          dispatch({ type: "LOAD_DATA", payload: data });
        }
        isLoadedRef.current = true;
      } catch (e) {
        console.error("Failed to load archive data:", e);
        onErrorRef.current?.("加载归档数据失败");
      }
    };
    loadData();
  }, []);

  const saveDataImmediately = useCallback(async () => {

    return;
  }, []);

  const addInvoice = useCallback(
    async (data: {
      filePath: string;
      fileName: string;
      fileType: InvoiceFileType;
      fileExt: string;
      fileSize?: number;
      ocrResult?: OcrResult;
      folderId?: string | null;
      tagIds?: string[];
    }): Promise<{ success: boolean; duplicate: ArchivedInvoice | null; invoice: ArchivedInvoice | null }> => {
      try {
        const extracted = extractInvoiceFields(data.ocrResult);
        const invoiceData: Partial<ArchivedInvoice> = {
          id: newId(),
          filePath: data.filePath,
          fileName: data.fileName,
          fileType: data.fileType,
          fileExt: data.fileExt,
          fileSize: data.fileSize,
          category: inferCategory(data.fileName, data.ocrResult?.fields, data.ocrResult?.text),
          folderId: data.folderId ?? null,
          tagIds: data.tagIds ?? [],
          ocrResult: data.ocrResult,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          ...extracted,
        };

        const result = await window.invoiceApi.addArchivedInvoice(invoiceData);

        if (result.success && result.invoice) {
          dispatch({ type: "ADD_INVOICE", payload: result.invoice });
          return { success: true, duplicate: null, invoice: result.invoice };
        } else if (result.duplicate) {
          return { success: false, duplicate: result.duplicate, invoice: null };
        }
        return { success: false, duplicate: null, invoice: null };
      } catch (e) {
        console.error("添加发票失败:", e);
        onErrorRef.current?.("添加发票失败");
        return { success: false, duplicate: null, invoice: null };
      }
    },
    []
  );

  const addInvoiceWithStorage = useCallback(
    async (data: {
      filePath: string;
      fileName: string;
      fileType: InvoiceFileType;
      fileExt: string;
      fileSize?: number;
      ocrResult?: OcrResult;
      folderId?: string | null;
      tagIds?: string[];
    }): Promise<{
      success: boolean;
      duplicate: ArchivedInvoice | null;
      invoice: ArchivedInvoice | null;
      storedPath?: string;
      error?: string;
    }> => {
      try {

        const extracted = extractInvoiceFields(data.ocrResult);
        let storedPath = data.filePath;

        if (typeof window.invoiceApi.storeFile === "function") {
          try {
            const storeResult = await window.invoiceApi.storeFile(data.filePath, false);
            storedPath = storeResult.storedPath;
          } catch (e) {
            console.warn("文件存储失败，使用原始路径:", e);
          }
        }

        const invoiceData: Partial<ArchivedInvoice> = {
          id: newId(),
          filePath: storedPath,
          fileName: data.fileName,
          fileType: data.fileType,
          fileExt: data.fileExt,
          fileSize: data.fileSize,
          category: inferCategory(data.fileName, data.ocrResult?.fields, data.ocrResult?.text),
          folderId: data.folderId ?? null,
          tagIds: data.tagIds ?? [],
          ocrResult: data.ocrResult,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          ...extracted,
        };

        const result = await window.invoiceApi.addArchivedInvoice(invoiceData);

        if (result.success && result.invoice) {
          dispatch({ type: "ADD_INVOICE", payload: result.invoice });
          return { success: true, duplicate: null, invoice: result.invoice, storedPath };
        } else if (result.duplicate) {
          const dupId = result.duplicate.id;
          if (dupId) {
            setDuplicateAttemptedIds((prev) => {
              if (prev.includes(dupId)) return prev;
              return [...prev, dupId];
            });
          }
          return { success: false, duplicate: result.duplicate, invoice: null };
        }
        return { success: false, duplicate: null, invoice: null, error: "保存失败" };
      } catch (e) {
        return {
          success: false,
          duplicate: null,
          invoice: null,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    },
    []
  );

  const addInvoices = useCallback((invoices: ArchivedInvoice[]) => {
    dispatch({ type: "ADD_INVOICES", payload: invoices });
  }, []);

  const updateInvoice = useCallback(async (id: string, updates: Partial<ArchivedInvoice>) => {
    try {
      const result = await window.invoiceApi.updateArchivedInvoice(id, updates);
      if (result.success) {
        dispatch({ type: "UPDATE_INVOICE", payload: { id, updates } });
      }
    } catch (e) {
      console.error("更新发票失败:", e);
      onErrorRef.current?.("更新发票失败");
    }
  }, []);

  const deleteInvoice = useCallback(
    async (
      id: string,
      deleteFile: boolean = true,
      cascadeMode: "keep" | "remove" = "remove"
    ) => {
      try {
        const result = await window.invoiceApi.deleteArchivedInvoice(id, deleteFile, cascadeMode);
        if (result.success) {
          dispatch({ type: "DELETE_INVOICE", payload: id });
        }
      } catch (e) {
        console.error("删除发票失败:", e);
        onErrorRef.current?.("删除发票失败");
      }
    },
    []
  );

  const deleteInvoices = useCallback(
    async (
      ids: string[],
      deleteFiles: boolean = true,
      cascadeMode: "keep" | "remove" = "remove"
    ) => {
      try {
        await window.invoiceApi.deleteArchivedInvoices(ids, deleteFiles, cascadeMode);
        dispatch({ type: "DELETE_INVOICES", payload: ids });
      } catch (e) {
        console.error("批量删除发票失败:", e);
        onErrorRef.current?.("批量删除发票失败");
      }
    },
    []
  );

  const addFolder = useCallback(async (name: string, parentId: string | null = null, color?: string): Promise<InvoiceFolder | null> => {
    try {
      const folderData = {
        id: newId(),
        name,
        parentId,
        color,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const result = await window.invoiceApi.addFolder(folderData);
      if (result.folder) {
        dispatch({ type: "ADD_FOLDER", payload: result.folder });
        return result.folder;
      }
      return null;
    } catch (e) {
      console.error("添加文件夹失败:", e);
      onErrorRef.current?.("添加文件夹失败");
      return null;
    }
  }, []);

  const updateFolder = useCallback(async (id: string, updates: Partial<InvoiceFolder>) => {
    try {
      const result = await window.invoiceApi.updateFolder(id, updates);
      if (result.success) {
        dispatch({ type: "UPDATE_FOLDER", payload: { id, updates } });
      }
    } catch (e) {
      console.error("更新文件夹失败:", e);
      onErrorRef.current?.("更新文件夹失败");
    }
  }, []);

  const deleteFolder = useCallback(async (id: string) => {
    try {
      const result = await window.invoiceApi.deleteFolder(id);
      if (result.success) {
        dispatch({ type: "DELETE_FOLDER", payload: id });
      }
    } catch (e) {
      console.error("删除文件夹失败:", e);
      onErrorRef.current?.("删除文件夹失败");
    }
  }, []);

  const addTag = useCallback(async (name: string, color?: string): Promise<InvoiceTag | null> => {
    try {
      const tagData = {
        id: newId(),
        name,
        color: color || TAG_COLORS[state.tags.length % TAG_COLORS.length],
      };
      const result = await window.invoiceApi.addTag(tagData);
      if (result.tag) {
        dispatch({ type: "ADD_TAG", payload: result.tag });
        return result.tag;
      }
      return null;
    } catch (e) {
      console.error("添加标签失败:", e);
      onErrorRef.current?.("添加标签失败");
      return null;
    }
  }, [state.tags.length]);

  const updateTag = useCallback(async (id: string, updates: Partial<InvoiceTag>) => {
    try {
      const result = await window.invoiceApi.updateTag(id, updates);
      if (result.success) {
        dispatch({ type: "UPDATE_TAG", payload: { id, updates } });
      }
    } catch (e) {
      console.error("更新标签失败:", e);
      onErrorRef.current?.("更新标签失败");
    }
  }, []);

  const deleteTag = useCallback(async (id: string) => {
    try {
      const result = await window.invoiceApi.deleteTag(id);
      if (result.success) {
        dispatch({ type: "DELETE_TAG", payload: id });
      }
    } catch (e) {
      console.error("删除标签失败:", e);
      onErrorRef.current?.("删除标签失败");
    }
  }, []);

  const setFilter = useCallback((filter: ArchiveFilterOptions) => {
    dispatch({ type: "SET_FILTER", payload: filter });
  }, []);

  const setSort = useCallback((sort: ArchiveSortOption) => {
    dispatch({ type: "SET_SORT", payload: sort });
  }, []);

  const setSelected = useCallback((ids: string[]) => {
    dispatch({ type: "SET_SELECTED", payload: ids });
  }, []);

  const toggleSelect = useCallback((id: string) => {
    dispatch({ type: "TOGGLE_SELECT", payload: id });
  }, []);

  const selectAll = useCallback((ids: string[]) => {
    dispatch({ type: "SELECT_ALL", payload: ids });
  }, []);

  const clearSelection = useCallback(() => {
    dispatch({ type: "CLEAR_SELECTION" });
  }, []);

  const setActive = useCallback((id: string | null) => {
    dispatch({ type: "SET_ACTIVE", payload: id });
  }, []);

  const moveToFolder = useCallback(async (invoiceIds: string[], folderId: string | null) => {
    try {
      await window.invoiceApi.moveInvoicesToFolder(invoiceIds, folderId);
      dispatch({ type: "MOVE_TO_FOLDER", payload: { invoiceIds, folderId } });
    } catch (e) {
      console.error("移动发票失败:", e);
      onErrorRef.current?.("移动发票失败");
    }
  }, []);

  const addTagsToInvoices = useCallback(async (invoiceIds: string[], tagIds: string[]) => {
    try {
      await window.invoiceApi.addTagsToInvoices(invoiceIds, tagIds);
      dispatch({ type: "ADD_TAGS_TO_INVOICES", payload: { invoiceIds, tagIds } });
    } catch (e) {
      console.error("添加标签失败:", e);
      onErrorRef.current?.("添加标签失败");
    }
  }, []);

  const removeTagsFromInvoices = useCallback(async (invoiceIds: string[], tagIds: string[]) => {
    try {
      await window.invoiceApi.removeTagsFromInvoices(invoiceIds, tagIds);
      dispatch({ type: "REMOVE_TAGS_FROM_INVOICES", payload: { invoiceIds, tagIds } });
    } catch (e) {
      console.error("移除标签失败:", e);
      onErrorRef.current?.("移除标签失败");
    }
  }, []);

  const allFolders = useMemo(() => [...SYSTEM_FOLDERS, ...state.folders], [state.folders]);

  const filteredInvoices = useMemo(() => {
    let result = state.invoices;
    const f = state.filter;

    if (f.folderIds && f.folderIds.length > 0 && !f.folderIds.includes("__all__")) {
      if (f.folderIds.includes("__uncategorized__")) {
        result = result.filter((inv) => inv.folderId === null);
      } else if (f.folderIds.includes("__recent__")) {
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        result = result.filter((inv) => inv.createdAt >= sevenDaysAgo);
      } else {
        result = result.filter((inv) => f.folderIds!.includes(inv.folderId || ""));
      }
    }

    if (f.search) {
      const q = f.search.toLowerCase();
      result = result.filter(
        (inv) =>
          inv.fileName.toLowerCase().includes(q) ||
          inv.invoiceNumber?.toLowerCase().includes(q) ||
          inv.sellerName?.toLowerCase().includes(q) ||
          inv.buyerName?.toLowerCase().includes(q) ||
          inv.notes?.toLowerCase().includes(q)
      );
    }

    if (f.categories && f.categories.length > 0) {
      result = result.filter((inv) => f.categories!.includes(inv.category));
    }

    if (f.sellerName) {
      const seller = f.sellerName;
      if (seller === "未知销方") {
        result = result.filter((inv) => !inv.sellerName?.trim());
      } else {
        result = result.filter((inv) => inv.sellerName?.trim() === seller);
      }
    }

    if (f.tagIds && f.tagIds.length > 0) {
      result = result.filter((inv) => f.tagIds!.some((tid) => inv.tagIds.includes(tid)));
    }

    if (f.dateRange) {
      if (f.dateRange.start) {
        result = result.filter((inv) => {
          if (!inv.invoiceDate) return false;
          const normalized = normalizeInvoiceDate(inv.invoiceDate);
          return normalized >= f.dateRange!.start!;
        });
      }
      if (f.dateRange.end) {
        result = result.filter((inv) => {
          if (!inv.invoiceDate) return false;
          const normalized = normalizeInvoiceDate(inv.invoiceDate);
          return normalized <= f.dateRange!.end!;
        });
      }
    }

    if (f.amountRange) {
      if (f.amountRange.min !== undefined) {
        result = result.filter((inv) => (inv.totalAmount || 0) >= f.amountRange!.min!);
      }
      if (f.amountRange.max !== undefined) {
        result = result.filter((inv) => (inv.totalAmount || 0) <= f.amountRange!.max!);
      }
    }

    if (f.isVerified !== undefined) {
      result = result.filter((inv) => inv.isVerified === f.isVerified);
    }

    if (f.isReimbursed !== undefined) {
      result = result.filter((inv) => inv.isReimbursed === f.isReimbursed);
    }

    return result;
  }, [state.invoices, state.filter]);

  const sortedInvoices = useMemo(() => {
    const sorted = [...filteredInvoices];
    const { field, order } = state.sort;

    sorted.sort((a, b) => {
      let cmp = 0;
      switch (field) {
        case "invoiceDate":
          cmp = (a.invoiceDate || "").localeCompare(b.invoiceDate || "");
          break;
        case "totalAmount":
          cmp = (a.totalAmount || 0) - (b.totalAmount || 0);
          break;
        case "createdAt":
          cmp = a.createdAt - b.createdAt;
          break;
        case "fileName":
          cmp = a.fileName.localeCompare(b.fileName);
          break;
      }
      return order === "asc" ? cmp : -cmp;
    });

    return sorted;
  }, [filteredInvoices, state.sort]);

  const clearAll = useCallback(async () => {
    try {

      const allIds = state.invoices.map((inv) => inv.id);
      if (allIds.length > 0) {
        await window.invoiceApi.deleteArchivedInvoices(allIds, false);
      }

      for (const f of state.folders) {
        await window.invoiceApi.deleteFolder(f.id).catch(() => {});
      }
      for (const t of state.tags) {
        await window.invoiceApi.deleteTag(t.id).catch(() => {});
      }
      dispatch({ type: "LOAD_DATA", payload: { invoices: [], folders: [], tags: [], selectedIds: [], activeId: null } });
    } catch (e) {
      console.error("清除数据失败:", e);
      onErrorRef.current?.("清除数据失败");
    }
  }, [state.invoices, state.folders, state.tags]);

  const activeInvoice = useMemo(
    () => state.invoices.find((inv) => inv.id === state.activeId) ?? null,
    [state.invoices, state.activeId]
  );

  const statistics = useMemo(() => {
    const total = state.invoices.length;
    const totalAmount = state.invoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
    const verifiedCount = state.invoices.filter((inv) => inv.isVerified).length;
    const reimbursedCount = state.invoices.filter((inv) => inv.isReimbursed).length;
    const categoryStats = state.invoices.reduce((acc, inv) => {
      acc[inv.category] = (acc[inv.category] || 0) + 1;
      return acc;
    }, {} as Record<InvoiceCategory, number>);

    return {
      total,
      totalAmount,
      verifiedCount,
      reimbursedCount,
      categoryStats,
    };
  }, [state.invoices]);

  return {

    invoices: state.invoices,
    folders: state.folders,
    tags: state.tags,
    filter: state.filter,
    sort: state.sort,
    selectedIds: state.selectedIds,
    activeId: state.activeId,
    duplicateAttemptedIds,
    clearDuplicateAttemptedIds: useCallback(() => setDuplicateAttemptedIds([]), []),

    allFolders,
    filteredInvoices,
    sortedInvoices,
    activeInvoice,
    statistics,

    addInvoice,
    addInvoiceWithStorage,
    addInvoices,
    updateInvoice,
    deleteInvoice,
    deleteInvoices,

    addFolder,
    updateFolder,
    deleteFolder,

    addTag,
    updateTag,
    deleteTag,

    setFilter,
    setSort,

    setSelected,
    toggleSelect,
    selectAll,
    clearSelection,
    setActive,

    moveToFolder,
    addTagsToInvoices,
    removeTagsFromInvoices,

    saveDataImmediately,

    clearAll,

    allTags: state.tags,
  };
}

export type UseArchiveStateReturn = ReturnType<typeof useArchiveState>;
