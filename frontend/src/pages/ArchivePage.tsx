import React, { useState, useCallback, useMemo } from "react";
import type { InvoiceFolder, InvoiceTag, ArchivedInvoice, InvoiceCategory, InvoiceFileType, OcrResult } from "../types";
import type { UseArchiveStateReturn } from "../hooks/useArchiveState";
import type { ReimbursementStatus } from "../types/reimbursement";
import { useDebounce } from "../hooks/useDebounce";
import { CATEGORY_LABELS, getDescendantFolderIds } from "../hooks/archiveUtils";
import { ocrFileWithCache } from "../utils/ocrCache";
import {
  FolderTree,
  InvoiceList,
  InvoiceDetail,
  FilterPanel,
  FolderDialog,
  TagDialog,
  TagList,
  MoveToFolderDialog,
  PostImportClassifyDialog,
  FolderStatsDialog,
} from "../components/archive";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DeleteInvoiceWithRefsDialog, type ReimbursementRefSummary } from "../components/DeleteInvoiceWithRefsDialog";
import { warmupOfdPreview, warmupOfdPreviewBatch } from "../utils/ofdWarmup";
import { classify, basename } from "../utils/layoutUtils";
import "../archive-import-progress.css";

const ImportIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const FolderPlusIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    <line x1="12" y1="11" x2="12" y2="17" />
    <line x1="9" y1="14" x2="15" y2="14" />
  </svg>
);

type ArchivePageProps = {
  archiveState: UseArchiveStateReturn;
  invoiceReimbursementMap?: Map<string, ReimbursementStatus>;
  reimbursementState?: any;
  onNavigate?: (section: any) => void;
  onSendToWorkspace?: (invoices: ArchivedInvoice[]) => void;
  onAddToReimbursement?: (invoiceIds: string[]) => void;
  onReimbursementsChanged?: () => void | Promise<void>;
  showToast?: (message: string, type: "success" | "error" | "warning" | "info") => void;
};

const ARCHIVE_OFD_WARMUP_LIMIT = 8;

type ImportProgressState = {
  active: boolean;
  processed: number;
  total: number;
  currentFile: string;
  added: number;
  skipped: number;
};

const EMPTY_IMPORT_PROGRESS: ImportProgressState = {
  active: false,
  processed: 0,
  total: 0,
  currentFile: "",
  added: 0,
  skipped: 0,
};

export function ArchivePage({
  archiveState,
  invoiceReimbursementMap,
  reimbursementState,
  onNavigate,
  onSendToWorkspace,
  onAddToReimbursement,
  onReimbursementsChanged,
  showToast,
}: ArchivePageProps) {
  const {
    invoices,
    folders,
    tags,
    filter,
    sort,
    selectedIds,
    activeId,
    allFolders,
    sortedInvoices,
    activeInvoice,
    addInvoiceWithStorage,
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
    toggleSelect,
    selectAll,
    clearSelection,
    setActive,
    moveToFolder,
    addTagsToInvoices,
    removeTagsFromInvoices,
    duplicateAttemptedIds = [],
    clearDuplicateAttemptedIds,
  } = archiveState;

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState<string>("__all__");
  const [showFolderDialog, setShowFolderDialog] = useState(false);
  const [editingFolder, setEditingFolder] = useState<InvoiceFolder | null>(null);
  const [newFolderParentId, setNewFolderParentId] = useState<string | null>(null);
  const [showTagDialog, setShowTagDialog] = useState(false);
  const [editingTag, setEditingTag] = useState<InvoiceTag | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const [refsDialog, setRefsDialog] = useState<{
    invoiceIds: string[];
    refs: ReimbursementRefSummary[];
  } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<ImportProgressState>(EMPTY_IMPORT_PROGRESS);

  const handleLocateReimbursement = useCallback(
    (invoiceId: string) => {
      if (!reimbursementState || !onNavigate) return;
      const allReimbs = reimbursementState.allReimbursements || [];
      const found = allReimbs.find((r: any) =>
        r.items?.some((item: any) => item.invoiceId === invoiceId)
      );
      if (found) {
        reimbursementState.setActiveId(found.id);
        onNavigate("reimbursement");
        showToast?.(`已定位至报销单: ${found.title}`, "success");
      } else {
        showToast?.("未找到该发票关联的报销单", "warning");
      }
    },
    [reimbursementState, onNavigate, showToast]
  );
  const [classifyDialog, setClassifyDialog] = useState<{ invoiceIds: string[] } | null>(null);
  const [classifyMoveOpen, setClassifyMoveOpen] = useState(false);
  const [folderStatsId, setFolderStatsId] = useState<string | null>(null);

  const importProgressPercent = importProgress.total > 0
    ? Math.round((importProgress.processed / importProgress.total) * 100)
    : 0;

  const debouncedSearch = useDebounce(searchQuery, 300);
  const filterRef = React.useRef(filter);

  const hasArchiveActiveFilters = Boolean(
    filter.categories?.length ||
    filter.dateRange?.start ||
    filter.dateRange?.end ||
    filter.amountRange?.min !== undefined ||
    filter.amountRange?.max !== undefined ||
    filter.isVerified !== undefined ||
    filter.isReimbursed !== undefined ||
    filter.sellerName
  );

  React.useEffect(() => {
    filterRef.current = filter;
  }, [filter]);

  const updateFilter = useCallback(
    (updates: Partial<typeof filter>) => {
      setFilter({ ...filterRef.current, ...updates });
    },
    [setFilter]
  );

  const handleSelectFolder = useCallback(
    (folderId: string) => {
      setSelectedFolderId(folderId);
      setFilter({ ...filter, folderIds: [folderId] });
      setActive(null);
      clearSelection();
    },
    [filter, setFilter, setActive, clearSelection]
  );

  React.useEffect(() => {
    updateFilter({ search: debouncedSearch || undefined });

  }, [debouncedSearch, updateFilter]);

  React.useEffect(() => {
    const candidatePaths: string[] = [];

    if (activeInvoice?.fileType === "ofd" && activeInvoice.filePath) {
      candidatePaths.push(activeInvoice.filePath);
    }

    for (const invoice of sortedInvoices) {
      if (invoice.fileType !== "ofd" || !invoice.filePath) continue;
      candidatePaths.push(invoice.filePath);
      if (candidatePaths.length >= ARCHIVE_OFD_WARMUP_LIMIT + (activeInvoice?.fileType === "ofd" ? 1 : 0)) {
        break;
      }
    }

    if (candidatePaths.length === 0) return;

    const timer = window.setTimeout(() => {
      const prioritizedPath = activeInvoice?.fileType === "ofd" && activeInvoice.filePath
        ? activeInvoice.filePath
        : null;

      if (prioritizedPath) {
        void warmupOfdPreview(prioritizedPath, { hydratePreview: true });
      }

      const remainingPaths = prioritizedPath
        ? candidatePaths.filter((filePath) => filePath !== prioritizedPath)
        : candidatePaths;

      if (remainingPaths.length > 0) {
        void warmupOfdPreviewBatch(remainingPaths, 2);
      }
    }, 80);

    return () => {
      window.clearTimeout(timer);
    };
  }, [sortedInvoices, activeInvoice]);

  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = {
      __all__: invoices.length,
      __uncategorized__: invoices.filter((inv) => inv.folderId === null).length,
      __recent__: invoices.filter((inv) => inv.createdAt >= Date.now() - 7 * 24 * 60 * 60 * 1000).length,
    };
    folders.forEach((f) => {
      counts[f.id] = invoices.filter((inv) => inv.folderId === f.id).length;
    });
    return counts;
  }, [invoices, folders]);

  const availableCategories = useMemo(() => {
    const categoryCount: Record<string, number> = {};
    invoices.forEach((inv) => {
      if (inv.category) {
        categoryCount[inv.category] = (categoryCount[inv.category] || 0) + 1;
      }
    });
    return categoryCount;
  }, [invoices]);

  const extractImportOcrResult = useCallback(async (filePath: string, type: InvoiceFileType): Promise<OcrResult | undefined> => {
    if (type === "pdf" || type === "image") {
      try {
        return await ocrFileWithCache(filePath);
      } catch (error) {
        console.warn(`${type.toUpperCase()} OCR 失败:`, error);
        return undefined;
      }
    }

    if (type !== "ofd") {
      return undefined;
    }

    try {
      const extracted = await window.invoiceApi.extractOfdData(filePath);
      if (extracted.success && extracted.labeledFields && Object.keys(extracted.labeledFields).length > 0) {
        return { text: extracted.text || "", fields: extracted.labeledFields };
      }

      const fallback = await window.invoiceApi.ocrOfdFallback(filePath);
      if (fallback.success && fallback.labeledFields && Object.keys(fallback.labeledFields).length > 0) {
        return { text: fallback.text || "", fields: fallback.labeledFields };
      }

      return undefined;
    } catch (error) {
      console.warn("OFD 数据提取失败:", error);
      return undefined;
    }
  }, []);

  const importInvoicePaths = useCallback(async (
    paths: string[],
    options: { authorizePaths?: boolean } = {}
  ) => {
    const normalizedPaths = paths.filter((filePath): filePath is string => Boolean(filePath));
    if (!normalizedPaths.length || importProgress.active) {
      return;
    }

    const targetFolderId = selectedFolderId.startsWith("__") ? null : selectedFolderId;

    if (options.authorizePaths) {
      try {
        await window.invoiceApi.authorizePaths(normalizedPaths);
      } catch (error) {
        console.error("授权拖拽导入路径失败:", error);
      }
    }

    let added = 0;
    let skipped = 0;
    const addedInvoiceIds: string[] = [];
    setImportProgress({
      active: true,
      processed: 0,
      total: normalizedPaths.length,
      currentFile: basename(normalizedPaths[0]),
      added: 0,
      skipped: 0,
    });

    try {
      for (const [index, filePath] of normalizedPaths.entries()) {
        setImportProgress((prev) => ({
          ...prev,
          processed: index,
          currentFile: basename(filePath),
          added,
          skipped,
        }));

        try {
          const { ext, type } = classify(filePath);
          const ocrResult = await extractImportOcrResult(filePath, type);
          const result = await addInvoiceWithStorage({
            filePath,
            fileName: basename(filePath),
            fileType: type,
            fileExt: ext,
            folderId: targetFolderId,
            ocrResult,
          });

          if (result.success) {
            if (type === "ofd") {
              void warmupOfdPreview(result.storedPath || result.invoice?.filePath || filePath);
            }
            if (result.invoice?.id) {
              addedInvoiceIds.push(result.invoice.id);
            }
            added += 1;
          } else {
            skipped += 1;
          }
        } catch (error) {
          skipped += 1;
          console.error("导入单个文件失败:", filePath, error);
        }

        setImportProgress((prev) => ({
          ...prev,
          processed: index + 1,
          currentFile: basename(filePath),
          added,
          skipped,
        }));
      }

      if (added > 0 && skipped > 0) {
        showToast?.(`导入完成：${added} 个成功，${skipped} 个跳过或失败`, "success");
      } else if (added > 0) {
        showToast?.(`成功导入 ${added} 个发票`, "success");
      } else if (skipped > 0) {
        showToast?.(`${skipped} 个发票已跳过或导入失败`, "warning");
      }

      if (added > 0 && targetFolderId === null && addedInvoiceIds.length > 0) {
        setClassifyDialog({ invoiceIds: addedInvoiceIds });
      }
    } catch (error) {
      console.error("导入失败:", error);
      showToast?.("导入失败", "error");
    } finally {
      window.setTimeout(() => {
        setImportProgress({ ...EMPTY_IMPORT_PROGRESS });
      }, 600);
    }
  }, [addInvoiceWithStorage, extractImportOcrResult, importProgress.active, selectedFolderId, showToast]);

  const handleImport = useCallback(async () => {
    try {
      if (importProgress.active) return;
      const picked = await window.invoiceApi.pickFiles();
      if (!picked.length) return;
      await importInvoicePaths(picked);
    } catch (error) {
      console.error("选择导入文件失败:", error);
      showToast?.("选择导入文件失败", "error");
    }
  }, [importInvoicePaths, importProgress.active, showToast]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (importProgress.active) return;
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragOver(true);
    }
  }, [importProgress.active]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      if (importProgress.active) return;

      const files = e.dataTransfer.files;
      if (files.length === 0) return;

      const droppedPaths: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const filePath = (files[i] as File & { path?: string }).path;
        if (filePath) droppedPaths.push(filePath);
      }

      if (!droppedPaths.length) return;
      await importInvoicePaths(droppedPaths, { authorizePaths: true });
    },
    [importInvoicePaths, importProgress.active]
  );

  const checkRefsAndConfirm = useCallback(
    async (
      ids: string[],
      noRefMessage: string,
      noRefTitle: string,
      onProceed: (cascadeMode: "keep" | "remove") => Promise<void>
    ) => {
      let refsResult: Record<string, ReimbursementRefSummary[]> = {};
      try {
        const res = await window.invoiceApi.checkReimbursementRefs(ids);
        refsResult = res?.refs ?? {};
      } catch (e) {
        console.warn("查询报销引用失败，按无引用处理:", e);
      }

      const allRefs: ReimbursementRefSummary[] = [];
      for (const id of ids) {
        const list = refsResult[id];
        if (Array.isArray(list)) allRefs.push(...list);
      }

      if (allRefs.length === 0) {
        setConfirmDialog({
          title: noRefTitle,
          message: noRefMessage,
          onConfirm: async () => {
            setConfirmDialog(null);
            await onProceed("remove");
          },
        });
        return;
      }

      setRefsDialog({ invoiceIds: ids, refs: allRefs });
    },
    []
  );

  const handleDeleteInvoice = useCallback(
    (id: string) => {
      const invoice = invoices.find((inv) => inv.id === id);
      if (!invoice) return;

      void checkRefsAndConfirm(
        [id],
        `确定要删除发票「${invoice.fileName}」吗？`,
        "删除发票",
        async (cascadeMode) => {
          try {
            await deleteInvoice(id, true, cascadeMode);
            showToast?.("删除成功", "success");
            await onReimbursementsChanged?.();
          } catch {
            showToast?.("删除失败", "error");
          }
        }
      );
    },
    [invoices, deleteInvoice, showToast, checkRefsAndConfirm, onReimbursementsChanged]
  );

  const handleBatchDelete = useCallback(() => {
    if (selectedIds.length === 0) return;
    const ids = [...selectedIds];

    void checkRefsAndConfirm(
      ids,
      `确定要删除选中的 ${ids.length} 个发票吗？`,
      "批量删除",
      async (cascadeMode) => {
        try {
          await deleteInvoices(ids, true, cascadeMode);
          showToast?.(`成功删除 ${ids.length} 个发票`, "success");
          await onReimbursementsChanged?.();
        } catch {
          showToast?.("批量删除失败", "error");
        }
      }
    );
  }, [selectedIds, deleteInvoices, showToast, checkRefsAndConfirm, onReimbursementsChanged]);

  const handleRefsDialogConfirm = useCallback(
    async (cascadeMode: "keep" | "remove") => {
      if (!refsDialog) return;
      const ids = refsDialog.invoiceIds;
      setRefsDialog(null);
      try {
        if (ids.length === 1) {
          await deleteInvoice(ids[0], true, cascadeMode);
        } else {
          await deleteInvoices(ids, true, cascadeMode);
        }
        const tip =
          cascadeMode === "keep"
            ? `已删除 ${ids.length} 张发票，报销单条目已标记为失效`
            : `已删除 ${ids.length} 张发票，并清理报销单引用`;
        showToast?.(tip, "success");
        await onReimbursementsChanged?.();
      } catch {
        showToast?.("删除失败", "error");
      }
    },
    [refsDialog, deleteInvoice, deleteInvoices, showToast, onReimbursementsChanged]
  );

  const handleCreateFolder = useCallback((parentId?: string | null) => {
    setEditingFolder(null);
    setNewFolderParentId(parentId ?? null);
    setShowFolderDialog(true);
  }, []);

  const handleEditFolder = useCallback((folder: InvoiceFolder) => {
    setEditingFolder(folder);
    setShowFolderDialog(true);
  }, []);

  const handleFolderDialogConfirm = useCallback(
    async (name: string, color?: string, parentId?: string | null) => {
      if (editingFolder) {
        await updateFolder(editingFolder.id, { name, color, parentId });
      } else {
        await addFolder(name, parentId ?? null, color);
      }
      setShowFolderDialog(false);
      setEditingFolder(null);
      setNewFolderParentId(null);
    },
    [editingFolder, addFolder, updateFolder]
  );

  const handleDeleteFolder = useCallback(
    (folderId: string) => {
      const folder = folders.find((f) => f.id === folderId);
      if (!folder) return;

      setConfirmDialog({
        title: "删除分类",
        message: `确定要删除分类「${folder.name}」吗？该分类下的发票将移至未分类。`,
        onConfirm: async () => {
          setConfirmDialog(null);
          await deleteFolder(folderId);
          if (selectedFolderId === folderId) {
            setSelectedFolderId("__all__");
            setFilter({ ...filter, folderIds: ["__all__"] });
          }
        },
      });
    },
    [folders, selectedFolderId, filter, deleteFolder, setFilter]
  );

  const handleCreateTag = useCallback(() => {
    setEditingTag(null);
    setShowTagDialog(true);
  }, []);

  const handleEditTag = useCallback((tag: InvoiceTag) => {
    setEditingTag(tag);
    setShowTagDialog(true);
  }, []);

  const handleTagDialogConfirm = useCallback(
    async (name: string, color: string) => {
      if (editingTag) {
        await updateTag(editingTag.id, { name, color });
      } else {
        await addTag(name, color);
      }
      setShowTagDialog(false);
      setEditingTag(null);
    },
    [editingTag, addTag, updateTag]
  );

  const handleDeleteEditingTag = useCallback(() => {
    if (!editingTag) return;
    setConfirmDialog({
      title: "删除标签",
      message: `确定要删除标签「${editingTag.name}」吗？`,
      onConfirm: async () => {
        setConfirmDialog(null);
        await deleteTag(editingTag.id);
        setShowTagDialog(false);
        setEditingTag(null);
      },
    });
  }, [editingTag, deleteTag]);

  const handleDeleteTag = useCallback(
    (tagId: string) => {
      const tag = tags.find((t) => t.id === tagId);
      if (!tag) return;
      setConfirmDialog({
        title: "删除标签",
        message: `确定要删除标签「${tag.name}」吗？`,
        onConfirm: async () => {
          setConfirmDialog(null);
          await deleteTag(tagId);

          if (filter.tagIds?.includes(tagId)) {
            const newTagIds = filter.tagIds.filter((id) => id !== tagId);
            setFilter({ ...filter, tagIds: newTagIds.length > 0 ? newTagIds : undefined });
          }
        },
      });
    },
    [tags, filter, deleteTag, setFilter]
  );

  const handleToggleTagFilter = useCallback(
    (tagId: string) => {
      const current = filter.tagIds || [];
      const newTagIds = current.includes(tagId)
        ? current.filter((id) => id !== tagId)
        : [...current, tagId];
      setFilter({ ...filter, tagIds: newTagIds.length > 0 ? newTagIds : undefined });
      setActive(null);
      clearSelection();
    },
    [filter, setFilter, setActive, clearSelection]
  );

  const handleDeleteEditingFolder = useCallback(() => {
    if (!editingFolder) return;
    setConfirmDialog({
      title: "删除分类",
      message: `确定要删除分类「${editingFolder.name}」吗？该分类下的发票将移至未分类。`,
      onConfirm: async () => {
        setConfirmDialog(null);
        await deleteFolder(editingFolder.id);
        if (selectedFolderId === editingFolder.id) {
          setSelectedFolderId("__all__");
          setFilter({ ...filter, folderIds: ["__all__"] });
        }
        setShowFolderDialog(false);
        setEditingFolder(null);
      },
    });
  }, [editingFolder, selectedFolderId, filter, deleteFolder, setFilter]);

  const handleAddTagToInvoice = useCallback(
    async (invoiceId: string, tagId: string) => {
      await addTagsToInvoices([invoiceId], [tagId]);
    },
    [addTagsToInvoices]
  );

  const handleRemoveTagFromInvoice = useCallback(
    async (invoiceId: string, tagId: string) => {
      await removeTagsFromInvoices([invoiceId], [tagId]);
    },
    [removeTagsFromInvoices]
  );

  const handleMoveInvoiceToFolder = useCallback(
    async (invoiceId: string, folderId: string | null) => {
      await moveToFolder([invoiceId], folderId);
    },
    [moveToFolder]
  );

  const handleBatchMove = useCallback(() => {
    if (selectedIds.length === 0) return;
    setShowMoveDialog(true);
  }, [selectedIds]);

  const handleSendToWorkspace = useCallback(() => {
    if (!onSendToWorkspace || selectedIds.length === 0) return;
    const selectedInvoices = invoices.filter(inv => selectedIds.includes(inv.id));
    onSendToWorkspace(selectedInvoices);
    clearSelection();
  }, [onSendToWorkspace, selectedIds, invoices, clearSelection]);

  const handleSendCurrentToWorkspace = useCallback(() => {
    if (!onSendToWorkspace || !activeInvoice) return;
    onSendToWorkspace([activeInvoice]);
  }, [onSendToWorkspace, activeInvoice]);

  const handleMoveDialogConfirm = useCallback(
    async (folderId: string | null) => {
      await moveToFolder(selectedIds, folderId);
      setShowMoveDialog(false);
      clearSelection();
    },
    [selectedIds, moveToFolder, clearSelection]
  );

  const handleClassifyByCategory = useCallback(async () => {
    if (!classifyDialog) return;
    const ids = classifyDialog.invoiceIds;
    const targets = invoices.filter((inv) => ids.includes(inv.id));
    if (targets.length === 0) {
      setClassifyDialog(null);
      return;
    }

    const groups = new Map<InvoiceCategory, string[]>();
    for (const inv of targets) {
      const arr = groups.get(inv.category) ?? [];
      arr.push(inv.id);
      groups.set(inv.category, arr);
    }

    const folderByName = new Map<string, InvoiceFolder>();
    for (const folder of folders) {
      folderByName.set(folder.name, folder);
    }

    let createdCount = 0;
    let assignedCount = 0;
    for (const [category, invoiceIds] of groups) {
      const label = CATEGORY_LABELS[category];
      let folder = folderByName.get(label) ?? null;
      if (!folder) {
        folder = await addFolder(label, null);
        if (folder) {
          folderByName.set(label, folder);
          createdCount += 1;
        }
      }
      if (folder) {
        await moveToFolder(invoiceIds, folder.id);
        assignedCount += invoiceIds.length;
      }
    }

    setClassifyDialog(null);
    setClassifyMoveOpen(false);
    if (assignedCount > 0) {
      const suffix = createdCount > 0 ? `（新建 ${createdCount} 个分类）` : "";
      showToast?.(`已为 ${assignedCount} 张发票自动归档${suffix}`, "success");
    }
  }, [classifyDialog, invoices, folders, addFolder, moveToFolder, showToast]);

  const handleClassifyChooseExisting = useCallback(() => {
    setClassifyMoveOpen(true);
  }, []);

  const handleClassifySkip = useCallback(() => {
    setClassifyDialog(null);
    setClassifyMoveOpen(false);
  }, []);

  const handleClassifyMoveConfirm = useCallback(
    async (folderId: string | null) => {
      if (!classifyDialog) return;
      const ids = classifyDialog.invoiceIds;
      await moveToFolder(ids, folderId);
      const folderName = folderId
        ? folders.find((f) => f.id === folderId)?.name ?? "选中分类"
        : "未分类";
      showToast?.(`已将 ${ids.length} 张发票归入「${folderName}」`, "success");
      setClassifyMoveOpen(false);
      setClassifyDialog(null);
    },
    [classifyDialog, folders, moveToFolder, showToast]
  );

  const handleFolderStats = useCallback(
    (folderId: string) => {
      if (folderId.startsWith("__")) return;
      setFolderStatsId(folderId);
    },
    []
  );

  const folderStatsData = useMemo(() => {
    if (!folderStatsId) return null;
    const folder = folders.find((f) => f.id === folderStatsId);
    if (!folder) return null;
    const targetIds = new Set(getDescendantFolderIds(folderStatsId, folders));
    const matched = invoices.filter((inv) => inv.folderId && targetIds.has(inv.folderId));
    return { folder, invoices: matched };
  }, [folderStatsId, folders, invoices]);

  const handleSubmitFolderToReimbursement = useCallback(
    (folderId: string) => {
      if (!onAddToReimbursement) return;
      if (folderId.startsWith("__")) return;
      const targetIds = new Set(getDescendantFolderIds(folderId, folders));
      const candidate = invoices.filter((inv) => inv.folderId && targetIds.has(inv.folderId));
      if (candidate.length === 0) {
        showToast?.("该分类下没有可提交的发票", "warning");
        return;
      }
      const unreimbursed = candidate.filter((inv) => !invoiceReimbursementMap?.has(inv.id));
      if (unreimbursed.length === 0) {
        showToast?.("该分类下的发票均已绑定报销单", "warning");
        return;
      }
      const skipped = candidate.length - unreimbursed.length;
      if (skipped > 0) {
        showToast?.(`将提交 ${unreimbursed.length} 张发票，已绑定报销的 ${skipped} 张已自动过滤`, "info");
      }
      onAddToReimbursement(unreimbursed.map((inv) => inv.id));
    },
    [folders, invoices, invoiceReimbursementMap, onAddToReimbursement, showToast]
  );

  const handleFolderDragOver = useCallback((e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes("application/invoice-ids")) {
      setDragOverFolderId(folderId);
    }
  }, []);

  const handleFolderDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOverFolderId(null);
  }, []);

  const handleFolderDrop = useCallback(
    async (e: React.DragEvent, folderId: string) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOverFolderId(null);

      const idsJson = e.dataTransfer.getData("application/invoice-ids");
      if (idsJson) {
        try {
          const ids = JSON.parse(idsJson) as string[];
          const targetFolderId = folderId.startsWith("__") ? null : folderId;
          await moveToFolder(ids, targetFolderId);
          clearSelection();
        } catch (error) {
          console.warn("archive folder drop parse failed", error);
        }
      }
    },
    [moveToFolder, clearSelection]
  );

  const [, setShowDetail] = useState(false);

  const handleSetActiveAndShowDetail = useCallback(
    (id: string) => {
      setActive(id);
      setShowDetail(true);
    },
    [setActive]
  );

  return (
    <div
      className="archivePage"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >

      {isDragOver && (
        <div className="dropOverlay">
          <div className="dropOverlayContent">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <div>松开以导入发票</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>支持 PDF、OFD、图片、XML</div>
          </div>
        </div>
      )}

      <div className="panel archiveFilterPanel">
        <div className="panelHeader">
          <div className="panelHeaderLeft">
            <div className="panelTitle">筛选条件</div>
            <span className="archiveCount">
              {sortedInvoices.length} 张发票
              {selectedIds.length > 0 && ` · 已选 ${selectedIds.length}`}
            </span>
            {hasArchiveActiveFilters && (
              <span className="filterBadge filterBadgeRemovable">
                已启用筛选
                <button
                  type="button"
                  className="filterBadgeClose"
                  onClick={() =>
                    setFilter({
                      search: filter.search,
                      folderIds: filter.folderIds,
                      tagIds: filter.tagIds,
                    })
                  }
                  title="清除全部筛选条件"
                  aria-label="清除全部筛选条件"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </span>
            )}
          </div>
          <div className="panelHeaderRight">
            <input
              className="toolbarInput"
              placeholder="搜索发票..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button onClick={handleImport} disabled={importProgress.active}>
              {ImportIcon}
              {importProgress.active ? "导入中..." : "导入发票"}
            </button>
          </div>
        </div>
        {importProgress.active && (
          <div className="archiveImportProgress" role="status" aria-live="polite">
            <div className="archiveImportProgressTop">
              <span className="archiveImportProgressLabel">导入进度</span>
              <span className="archiveImportProgressStats">
                已处理 {importProgress.processed}/{importProgress.total} · 成功 {importProgress.added} · 跳过 {importProgress.skipped}
              </span>
            </div>
            <div className="archiveImportProgressBar" aria-hidden="true">
              <div
                className="archiveImportProgressFill"
                style={{ width: `${importProgressPercent}%` }}
              />
            </div>
            <div className="archiveImportProgressFile">{importProgress.currentFile}</div>
          </div>
        )}
        <FilterPanel
          filter={filter}
          onFilterChange={setFilter}
          onClearFilter={() => setFilter({
            search: filter.search,
            folderIds: filter.folderIds,
            tagIds: filter.tagIds,
          })}
          availableCategories={availableCategories}
        />
      </div>

      <div className="archiveMain">

        <div className="panel archiveFolderPanel">
          <div className="panelHeader">
            <div className="panelHeaderLeft">
              <div className="panelTitle">分类管理</div>
            </div>
            <div className="panelHeaderRight">
              <button className="iconBtn" onClick={() => handleCreateFolder(null)} title="新建分类">
                {FolderPlusIcon}
              </button>
            </div>
          </div>
          <FolderTree
            folders={allFolders}
            selectedFolderId={selectedFolderId}
            invoiceCounts={folderCounts}
            onSelect={handleSelectFolder}
            onCreateFolder={handleCreateFolder}
            onEditFolder={handleEditFolder}
            onDeleteFolder={handleDeleteFolder}
            onSubmitFolderToReimbursement={onAddToReimbursement ? handleSubmitFolderToReimbursement : undefined}
            onFolderStats={handleFolderStats}
            dragOverFolderId={dragOverFolderId}
            onFolderDragOver={handleFolderDragOver}
            onFolderDragLeave={handleFolderDragLeave}
            onFolderDrop={handleFolderDrop}
          />
          <TagList
            tags={tags}
            selectedTagIds={filter.tagIds || []}
            onToggleTag={handleToggleTagFilter}
            onCreateTag={handleCreateTag}
            onEditTag={handleEditTag}
            onDeleteTag={handleDeleteTag}
          />
        </div>

        <div className="panel archiveListPanel">
          <div className="panelHeader">
            <div className="panelHeaderLeft">
              <div className="panelTitle">发票列表</div>
            </div>
            <div className="panelHeaderRight">
              {selectedIds.length > 0 && (
                <>
                  {onAddToReimbursement && (
                    <button onClick={() => {
                      const unreimbursed = selectedIds.filter(id => !invoiceReimbursementMap?.has(id));
                      if (unreimbursed.length === 0) {
                        showToast?.("所选发票均已绑定报销单", "warning");
                        return;
                      }
                      onAddToReimbursement(unreimbursed);
                    }} title="添加到报销">
                      添加报销
                    </button>
                  )}
                  {onSendToWorkspace && (
                    <button onClick={handleSendToWorkspace} title="发送到发票合并">
                      发送合并
                    </button>
                  )}
                  <button onClick={handleBatchMove}>移动到</button>
                  <button className="danger" onClick={handleBatchDelete}>删除选中</button>
                </>
              )}
            </div>
          </div>
          <div className="archiveListBody">
            {duplicateAttemptedIds.length > 0 && (
              <div className="duplicate-alert-bar" style={{
                background: "rgba(239, 68, 68, 0.08)",
                borderBottom: "1px solid rgba(239, 68, 68, 0.15)",
                padding: "8px 12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: "12px",
                color: "#ef4444",
                gap: "8px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <span>检测到 {duplicateAttemptedIds.length} 张重复导入的发票，已在列表中标红。</span>
                </div>
                <button
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--primary, #6aa6ff)",
                    cursor: "pointer",
                    textDecoration: "underline",
                    fontSize: "12px",
                    padding: 0,
                  }}
                  onClick={() => clearDuplicateAttemptedIds?.()}
                >
                  清除标记
                </button>
              </div>
            )}
            <InvoiceList
              invoices={sortedInvoices}
              selectedIds={selectedIds}
              activeId={activeId}
              sort={sort}
              invoiceReimbursementMap={invoiceReimbursementMap}
              duplicateAttemptedIds={duplicateAttemptedIds}
              onLocateReimbursement={handleLocateReimbursement}
              onSelect={handleSetActiveAndShowDetail}
              onToggleSelect={toggleSelect}
              onSelectAll={() => selectAll(sortedInvoices.map((inv) => inv.id))}
              onClearSelection={clearSelection}
              onSetActive={handleSetActiveAndShowDetail}
              onSortChange={setSort}
              onDelete={handleDeleteInvoice}
            />
          </div>
        </div>
      </div>

      <div className="panel archiveRightPanel previewPanel">
        <div className="panelHeader">
          <div className="panelHeaderLeft">
            <div className="panelTitle">发票详情</div>
            {activeInvoice && (
              <span style={{ color: "rgba(255,255,255,0.62)", fontSize: 12 }}>
                {activeInvoice.fileName}
              </span>
            )}
          </div>
          {activeInvoice && (
            <div className="panelHeaderRight">
              {onAddToReimbursement && !invoiceReimbursementMap?.has(activeInvoice.id) && (
                <button onClick={() => onAddToReimbursement([activeInvoice.id])} title="添加到报销">
                  报销
                </button>
              )}
              {onSendToWorkspace && (
                <button onClick={handleSendCurrentToWorkspace} title="发送到发票合并">
                  发送合并
                </button>
              )}
            </div>
          )}
        </div>
        <InvoiceDetail
          invoice={activeInvoice}
          tags={tags}
          folders={allFolders}
          onUpdate={updateInvoice}
          onAddTag={handleAddTagToInvoice}
          onRemoveTag={handleRemoveTagFromInvoice}
          onMoveToFolder={handleMoveInvoiceToFolder}
        />
      </div>

      {showFolderDialog && (
        <FolderDialog
          folder={editingFolder}
          folders={folders}
          defaultParentId={newFolderParentId}
          onConfirm={handleFolderDialogConfirm}
          onDelete={editingFolder ? handleDeleteEditingFolder : undefined}
          onCancel={() => {
            setShowFolderDialog(false);
            setEditingFolder(null);
            setNewFolderParentId(null);
          }}
        />
      )}

      {showTagDialog && (
        <TagDialog
          tag={editingTag}
          onConfirm={handleTagDialogConfirm}
          onDelete={editingTag ? handleDeleteEditingTag : undefined}
          onCancel={() => {
            setShowTagDialog(false);
            setEditingTag(null);
          }}
        />
      )}

      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmText="确定"
          danger
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}

      {refsDialog && (
        <DeleteInvoiceWithRefsDialog
          invoiceCount={refsDialog.invoiceIds.length}
          refs={refsDialog.refs}
          onCancel={() => setRefsDialog(null)}
          onConfirm={handleRefsDialogConfirm}
        />
      )}

      {showMoveDialog && (
        <MoveToFolderDialog
          folders={allFolders}
          currentFolderId={null}
          invoiceCount={selectedIds.length}
          onConfirm={handleMoveDialogConfirm}
          onCreateFolder={() => {
            setShowMoveDialog(false);
            handleCreateFolder();
          }}
          onCancel={() => setShowMoveDialog(false)}
        />
      )}

      {classifyDialog && !classifyMoveOpen && (
        <PostImportClassifyDialog
          importedInvoices={invoices.filter((inv) => classifyDialog.invoiceIds.includes(inv.id))}
          userFolders={folders}
          onCreateByCategory={handleClassifyByCategory}
          onChooseExisting={handleClassifyChooseExisting}
          onSkip={handleClassifySkip}
        />
      )}

      {classifyDialog && classifyMoveOpen && (
        <MoveToFolderDialog
          folders={allFolders}
          currentFolderId={null}
          invoiceCount={classifyDialog.invoiceIds.length}
          onConfirm={handleClassifyMoveConfirm}
          onCreateFolder={() => {
            setClassifyMoveOpen(false);
            setClassifyDialog(null);
            handleCreateFolder();
          }}
          onCancel={() => setClassifyMoveOpen(false)}
        />
      )}

      {folderStatsData && (
        <FolderStatsDialog
          folder={folderStatsData.folder}
          invoices={folderStatsData.invoices}
          onClose={() => setFolderStatsId(null)}
        />
      )}
    </div>
  );
}
