import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import type {
  Reimbursement,
  ReimbursementItem,
  ReimbursementStatus,
  ReimbursementFilter,
  ReimbursementSort,
  ReimbursementType,
  ReimbursementStats,
  ReimbursementFolder,
  ApprovalRecord,
  ReimbursementStatusUpdateExtra,
} from "../types/reimbursement";
import { getReimbursementStatTimestamp } from "../utils/statistics";

const LEGACY_STORAGE_KEY = "reimbursement_state_v1";
const FOLDERS_STORAGE_KEY = "reimbursement_folders_v1";
const DEFAULT_SORT: ReimbursementSort = { field: "createdAt", order: "desc" };

export const FOLDER_COLORS = [
  "#6aa6ff", "#f59e0b", "#10b981", "#ec4899", "#8b5cf6",
  "#f97316", "#14b8a6", "#6366f1", "#ef4444", "#84cc16",
];

type PersistedReimbursementState = {
  reimbursements: Reimbursement[];
  activeId: string | null;
  filter: ReimbursementFilter;
  sort: ReimbursementSort;
};

function loadFolders(): ReimbursementFolder[] {
  try {
    const raw = localStorage.getItem(FOLDERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveFolders(folders: ReimbursementFolder[]) {
  try {
    localStorage.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(folders));
  } catch (e) {
    console.warn("保存文件夹数据失败:", e);
  }
}

function loadLegacyState(): PersistedReimbursementState {
  const fallback: PersistedReimbursementState = {
    reimbursements: [],
    activeId: null,
    filter: {},
    sort: DEFAULT_SORT,
  };

  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return fallback;

    const parsed = JSON.parse(raw) as Partial<PersistedReimbursementState>;
    const reimbursements = Array.isArray(parsed.reimbursements) ? parsed.reimbursements : [];
    const activeId =
      typeof parsed.activeId === "string" || parsed.activeId === null
        ? parsed.activeId
        : null;
    const filter =
      parsed.filter && typeof parsed.filter === "object"
        ? (parsed.filter as ReimbursementFilter)
        : {};

    const sort =
      parsed.sort &&
      typeof parsed.sort === "object" &&
      typeof (parsed.sort as ReimbursementSort).field === "string" &&
      (((parsed.sort as ReimbursementSort).order === "asc") ||
        (parsed.sort as ReimbursementSort).order === "desc")
        ? (parsed.sort as ReimbursementSort)
        : DEFAULT_SORT;

    return { reimbursements, activeId, filter, sort };
  } catch {
    return fallback;
  }
}

function saveLegacyState(state: PersistedReimbursementState) {
  try {
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("保存报销本地备份失败:", e);
  }
}

function generateReimbursementCode(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `BX${year}${month}${day}${random}`;
}

function generateItemId(): string {
  return `item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function deduplicateItemIds(reimbursements: Reimbursement[]): { fixed: Reimbursement[]; changed: boolean } {
  let changed = false;
  const fixed = reimbursements.map(r => {
    const seen = new Set<string>();
    let itemsChanged = false;
    const items = r.items.map(item => {
      if (seen.has(item.id)) {
        itemsChanged = true;
        return { ...item, id: generateItemId() };
      }
      seen.add(item.id);
      return item;
    });
    if (itemsChanged) {
      changed = true;
      return { ...r, items, updatedAt: Date.now() };
    }
    return r;
  });
  return { fixed, changed };
}

export function useReimbursement(onError?: (msg: string) => void) {
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const initialState = useMemo(() => loadLegacyState(), []);
  const [reimbursements, setReimbursements] = useState<Reimbursement[]>(() => initialState.reimbursements);
  const [activeId, setActiveId] = useState<string | null>(() => {
    if (!initialState.activeId) return null;
    return initialState.reimbursements.some((r) => r.id === initialState.activeId)
      ? initialState.activeId
      : null;
  });
  const [filter, setFilter] = useState<ReimbursementFilter>(() => initialState.filter);
  const [sort, setSort] = useState<ReimbursementSort>(() => initialState.sort);
  const [folders, setFolders] = useState<ReimbursementFolder[]>(() => loadFolders());
  const [backendReady, setBackendReady] = useState(false);
  const migratingRef = useRef(false);
  const migrationDoneRef = useRef(false);

  const reimbursementsRef = useRef<Reimbursement[]>(reimbursements);
  useEffect(() => {
    reimbursementsRef.current = reimbursements;
  }, [reimbursements]);

  useEffect(() => {
    if (migrationDoneRef.current) return;
    saveLegacyState({ reimbursements, activeId, filter, sort });
  }, [reimbursements, activeId, filter, sort]);

  useEffect(() => {
    saveFolders(folders);
  }, [folders]);

  const syncOneReimbursementToBackend = useCallback(async (reimbursement: Reimbursement) => {
    const baseData: Reimbursement = {
      ...reimbursement,
      items: [],
      approvalRecords: [],
    };

    await window.invoiceApi.createReimbursement(baseData);

    for (const item of reimbursement.items || []) {
      await window.invoiceApi.addReimbursementItem(reimbursement.id, item);
    }

    for (const record of reimbursement.approvalRecords || []) {
      await window.invoiceApi.addReimbursementApproval(reimbursement.id, record);
    }
  }, []);

  const reloadReimbursements = useCallback(async () => {
    if (!window.invoiceApi || typeof window.invoiceApi.loadReimbursements !== "function") {
      return;
    }
    try {
      const result = await window.invoiceApi.loadReimbursements();
      const loaded = Array.isArray(result?.reimbursements) ? result.reimbursements : [];
      const { fixed } = deduplicateItemIds(loaded);
      setReimbursements(fixed);
      setActiveId((prev) => {
        if (prev && fixed.some((r) => r.id === prev)) return prev;
        return fixed[0]?.id ?? null;
      });
    } catch (e) {
      console.warn("重新加载报销数据失败:", e);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadFromBackend = async () => {
      if (!window.invoiceApi || typeof window.invoiceApi.loadReimbursements !== "function") {
        setBackendReady(false);
        return;
      }

      try {
        const result = await window.invoiceApi.loadReimbursements();
        if (cancelled) return;

        const loaded = Array.isArray(result?.reimbursements)
          ? result.reimbursements
          : [];

        if (loaded.length > 0) {

          const { fixed, changed } = deduplicateItemIds(loaded);
          setReimbursements(fixed);
          if (changed) {
            console.warn("检测到重复 item ID，已自动修复");

            for (const r of fixed) {
              void window.invoiceApi.updateReimbursement(r.id, { items: r.items, updatedAt: r.updatedAt }).catch(() => {});
            }
          }
          setActiveId((prev) => {
            if (prev && fixed.some((r) => r.id === prev)) {
              return prev;
            }
            return fixed[0]?.id ?? null;
          });
          migrationDoneRef.current = true;
          try { localStorage.removeItem(LEGACY_STORAGE_KEY); } catch { /* noop */ }
        } else {
          const legacyReimbursements = reimbursementsRef.current;
          if (legacyReimbursements.length > 0) {
            migratingRef.current = true;
            let allSucceeded = true;
            for (const reimbursement of legacyReimbursements) {
              if (cancelled) { allSucceeded = false; break; }
              try {
                await syncOneReimbursementToBackend(reimbursement);
              } catch (e) {
                console.warn("迁移报销数据到 SQLite 失败:", reimbursement.id, e);
                allSucceeded = false;
              }
            }
            if (!cancelled && allSucceeded) {
              migrationDoneRef.current = true;
              try { localStorage.removeItem(LEGACY_STORAGE_KEY); } catch { /* noop */ }
            }
            migratingRef.current = false;
          }
        }

        if (!cancelled) setBackendReady(true);
      } catch (e) {
        console.warn("加载报销 SQLite 数据失败，继续使用本地备份:", e);
        if (!cancelled) setBackendReady(false);
      }
    };

    loadFromBackend();

    return () => {
      cancelled = true;
    };
  }, [syncOneReimbursementToBackend]);

  const createReimbursement = useCallback((
    title: string,
    applicant: string,
    department: string,
    purpose: string,
    type: ReimbursementType = "other",
    sales?: string,
    costPerDay?: string
  ) => {
    const newReimbursement: Reimbursement = {
      id: `reimb_${Date.now()}`,
      code: generateReimbursementCode(),
      title,
      type,
      applicant,
      department,
      sales,
      costPerDay,
      purpose,
      status: "draft",
      items: [],
      totalAmount: 0,
      totalTax: 0,
      approvalRecords: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    setReimbursements((prev) => [newReimbursement, ...prev]);
    setActiveId(newReimbursement.id);

    if (backendReady) {
      void window.invoiceApi.createReimbursement({
        ...newReimbursement,
        items: [],
        approvalRecords: [],
      }).catch((e) => {
        console.error("创建报销落库失败:", e);
        onErrorRef.current?.("报销单创建保存失败，数据可能未持久化");
      });
    }

    return newReimbursement;
  }, [backendReady]);

  const addItem = useCallback((reimbId: string, item: Omit<ReimbursementItem, "id">) => {
    const newItem: ReimbursementItem = { ...item, id: generateItemId() };

    setReimbursements((prev) => prev.map((r) => {
      if (r.id !== reimbId) return r;
      const items = [...r.items, newItem];
      const totalAmount = items.reduce((sum, i) => sum + i.amount, 0);
      const totalTax = items.reduce((sum, i) => sum + (i.taxAmount || 0), 0);
      return { ...r, items, totalAmount, totalTax, updatedAt: Date.now() };
    }));

    if (backendReady) {
      void window.invoiceApi.addReimbursementItem(reimbId, newItem).catch((e) => {
        const msg = e?.message || String(e);
        console.error("添加报销项目落库失败:", { reimbId, itemId: newItem.id, error: msg, item: newItem });
        onErrorRef.current?.(`报销项目保存失败: ${msg}`);
      });
    }
  }, [backendReady]);

  const removeItem = useCallback((reimbId: string, itemId: string) => {
    setReimbursements((prev) => prev.map((r) => {
      if (r.id !== reimbId) return r;
      const items = r.items.filter((i) => i.id !== itemId);
      const totalAmount = items.reduce((sum, i) => sum + i.amount, 0);
      const totalTax = items.reduce((sum, i) => sum + (i.taxAmount || 0), 0);
      return { ...r, items, totalAmount, totalTax, updatedAt: Date.now() };
    }));

    if (backendReady) {
      void window.invoiceApi.removeReimbursementItem(itemId, reimbId).catch((e) => {
        console.error("删除报销项目落库失败:", e);
        onErrorRef.current?.("报销项目删除保存失败");
      });
    }
  }, [backendReady]);

  const updateItem = useCallback((reimbId: string, itemId: string, updates: Partial<ReimbursementItem>) => {
    setReimbursements((prev) => prev.map((r) => {
      if (r.id !== reimbId) return r;
      const items = r.items.map((i) => i.id === itemId ? { ...i, ...updates } : i);
      const totalAmount = items.reduce((sum, i) => sum + i.amount, 0);
      const totalTax = items.reduce((sum, i) => sum + (i.taxAmount || 0), 0);
      return { ...r, items, totalAmount, totalTax, updatedAt: Date.now() };
    }));

    if (backendReady) {
      void window.invoiceApi.updateReimbursementItem(itemId, reimbId, updates).catch((e) => {
        console.error("更新报销项目落库失败:", e);
        onErrorRef.current?.("报销项目更新保存失败");
      });
    }
  }, [backendReady]);

  const updateReimbursement = useCallback((reimbId: string, updates: Partial<Reimbursement>) => {
    setReimbursements((prev) => prev.map((r) =>
      r.id === reimbId ? { ...r, ...updates, updatedAt: Date.now() } : r
    ));

    if (backendReady) {
      void window.invoiceApi.updateReimbursement(reimbId, updates).catch((e) => {
        console.error("更新报销落库失败:", e);
        onErrorRef.current?.("报销单更新保存失败");
      });
    }
  }, [backendReady]);

  const updateStatus = useCallback((reimbId: string, status: ReimbursementStatus, extra?: ReimbursementStatusUpdateExtra) => {
    const now = Date.now();

    const actionMap: Record<ReimbursementStatus, ApprovalRecord["action"]> = {
      draft: "submit",
      pending_payment: "approve",
      paid: "approve",
    };

    const newRecord: ApprovalRecord = {
      id: `record_${now}`,
      approver: extra?.approver || "系统",
      action: actionMap[status],
      comment: extra?.comment || extra?.rejectReason,
      timestamp: now,
    };

    setReimbursements((prev) => prev.map((r) => {
      if (r.id !== reimbId) return r;

      const updates: Partial<Reimbursement> = { status, updatedAt: now, ...extra };
      updates.approvalRecords = [...r.approvalRecords, newRecord];

      if (status === "pending_payment") updates.submittedAt = now;
      if (status === "pending_payment") updates.approvedAt = now;
      if (status === "paid") updates.paidAt = now;

      return { ...r, ...updates };
    }));

    if (backendReady) {
      const payload: Partial<Reimbursement> = { status, ...extra };
      if (status === "pending_payment") payload.submittedAt = now;
      if (status === "pending_payment") payload.approvedAt = now;
      if (status === "paid") payload.paidAt = now;

      void window.invoiceApi.updateReimbursement(reimbId, payload).catch((e) => {
        console.error("更新报销状态落库失败:", e);
        onErrorRef.current?.("报销状态更新保存失败");
      });

      void window.invoiceApi.addReimbursementApproval(reimbId, newRecord).catch((e) => {
        console.error("新增审批记录落库失败:", e);
        onErrorRef.current?.("审批记录保存失败");
      });
    }
  }, [backendReady]);

  const deleteReimbursement = useCallback((reimbId: string) => {
    setReimbursements((prev) => prev.filter((r) => r.id !== reimbId));
    if (activeId === reimbId) setActiveId(null);

    if (backendReady) {
      void window.invoiceApi.deleteReimbursement(reimbId).catch((e) => {
        console.error("删除报销落库失败:", e);
        onErrorRef.current?.("报销单删除保存失败");
      });
    }
  }, [activeId, backendReady]);

  const getDescendantIds = useCallback((folderId: string, allFolders: ReimbursementFolder[]): string[] => {
    const ids: string[] = [folderId];
    const children = allFolders.filter((f) => f.parentId === folderId);
    children.forEach((child) => ids.push(...getDescendantIds(child.id, allFolders)));
    return ids;
  }, []);

  const createFolder = useCallback((name: string, color?: string, parentId?: string | null) => {
    const newFolder: ReimbursementFolder = {
      id: `rfolder_${Date.now()}`,
      name,
      color: color || FOLDER_COLORS[Math.floor(Math.random() * FOLDER_COLORS.length)],
      parentId: parentId ?? null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setFolders((prev) => [...prev, newFolder]);
    return newFolder;
  }, []);

  const updateFolder = useCallback((folderId: string, updates: Partial<Pick<ReimbursementFolder, "name" | "color" | "parentId">>) => {
    setFolders((prev) => prev.map((f) =>
      f.id === folderId ? { ...f, ...updates, updatedAt: Date.now() } : f
    ));
  }, []);

  const deleteFolder = useCallback((folderId: string) => {
    setFolders((prev) => {
      const descendantIds = getDescendantIds(folderId, prev);

      return prev.filter((f) => !descendantIds.includes(f.id));
    });

    setReimbursements((prev) => {
      const allFolders = folders;
      const descendantIds = getDescendantIds(folderId, allFolders);
      return prev.map((r) =>
        r.folderId && descendantIds.includes(r.folderId)
          ? { ...r, folderId: null, updatedAt: Date.now() }
          : r
      );
    });

    setFilter((prev) => {
      if (!prev.folderId) return prev;
      const descendantIds = getDescendantIds(folderId, folders);
      return descendantIds.includes(prev.folderId) ? { ...prev, folderId: undefined } : prev;
    });
  }, [folders, getDescendantIds]);

  const moveToFolder = useCallback((reimbIds: string[], targetFolderId: string | null) => {
    setReimbursements((prev) => prev.map((r) =>
      reimbIds.includes(r.id) ? { ...r, folderId: targetFolderId, updatedAt: Date.now() } : r
    ));
    if (backendReady) {
      reimbIds.forEach((id) => {
        void window.invoiceApi.updateReimbursement(id, { folderId: targetFolderId }).catch((e) => {
          console.error("移动报销到文件夹失败:", e);
          onErrorRef.current?.("移动报销到文件夹保存失败");
        });
      });
    }
  }, [backendReady]);

  const batchUpdateStatus = useCallback((ids: string[], status: ReimbursementStatus, extra?: ReimbursementStatusUpdateExtra) => {
    ids.forEach((id) => updateStatus(id, status, extra));
  }, [updateStatus]);

  const filteredReimbursements = useMemo(() => {
    const result = reimbursements.filter((r) => {

      if (filter.folderId !== undefined) {
        if (filter.folderId === "__uncategorized__") {
          if (r.folderId) return false;
        } else if (filter.folderId !== null) {
          const matchIds = getDescendantIds(filter.folderId, folders);
          if (!r.folderId || !matchIds.includes(r.folderId)) return false;
        }
      }
      if (filter.status && filter.status.length > 0 && !filter.status.includes(r.status)) return false;
      if (filter.type && filter.type.length > 0 && !filter.type.includes(r.type)) return false;
      if (filter.applicant && !r.applicant.includes(filter.applicant)) return false;
      if (filter.department && !r.department.includes(filter.department)) return false;
      if (filter.dateRange) {
        const statTimestamp = getReimbursementStatTimestamp(r);
        if (statTimestamp < filter.dateRange.start || statTimestamp > filter.dateRange.end) return false;
      }
      if (filter.amountRange) {
        if (r.totalAmount < filter.amountRange.min || r.totalAmount > filter.amountRange.max) return false;
      }
      if (filter.search) {
        const query = filter.search.toLowerCase();
        if (!r.title.toLowerCase().includes(query) &&
            !r.code.toLowerCase().includes(query) &&
            !r.applicant.toLowerCase().includes(query) &&
            !r.department.toLowerCase().includes(query)) return false;
      }
      return true;
    });

    result.sort((a, b) => {
      const aVal = a[sort.field];
      const bVal = b[sort.field];
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sort.order === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sort.order === "asc" ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });

    return result;
  }, [reimbursements, filter, sort, folders, getDescendantIds]);

  const activeReimbursement = reimbursements.find((r) => r.id === activeId) || null;

  const stats: ReimbursementStats = useMemo(() => {
    const total = reimbursements.reduce((sum, r) => sum + r.totalAmount, 0);
    const byStatus = reimbursements.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {} as Record<ReimbursementStatus, number>);
    const byType = reimbursements.reduce((acc, r) => {
      acc[r.type] = (acc[r.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const pendingReimbs = reimbursements.filter((r) => r.status === "pending_payment");
    const pendingCount = pendingReimbs.length;
    const pendingAmount = pendingReimbs.reduce((sum, r) => sum + r.totalAmount, 0);
    const avgAmount = reimbursements.length > 0 ? total / reimbursements.length : 0;

    return {
      total,
      count: reimbursements.length,
      byStatus,
      byType,
      avgAmount,
      pendingCount,
      pendingAmount
    };
  }, [reimbursements]);

  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = { __all__: reimbursements.length, __uncategorized__: 0 };
    for (const r of reimbursements) {
      if (!r.folderId) {
        counts.__uncategorized__++;
      } else {
        counts[r.folderId] = (counts[r.folderId] || 0) + 1;
      }
    }
    return counts;
  }, [reimbursements]);

  const invoiceReimbursementMap = useMemo(() => {
    const statusPriority: Record<string, number> = { paid: 2, pending_payment: 1, draft: 0 };
    const map = new Map<string, ReimbursementStatus>();
    for (const r of reimbursements) {
      for (const item of r.items) {
        if (!item.invoiceId) continue;
        const existing = map.get(item.invoiceId);
        if (!existing || (statusPriority[r.status] ?? 0) > (statusPriority[existing] ?? 0)) {
          map.set(item.invoiceId, r.status);
        }
      }
    }
    return map;
  }, [reimbursements]);

  const clearAll = useCallback(async () => {
    const allIds = reimbursements.map((r) => r.id);
    if (backendReady && allIds.length > 0) {
      await window.invoiceApi.batchDeleteReimbursements(allIds).catch((e) => {
        console.warn("批量删除报销落库失败:", e);
      });
    }
    setReimbursements([]);
    setActiveId(null);
    setFolders([]);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    localStorage.removeItem(FOLDERS_STORAGE_KEY);
  }, [reimbursements, backendReady]);

  return {
    reimbursements: filteredReimbursements,
    allReimbursements: reimbursements,
    activeId,
    activeReimbursement,
    filter,
    sort,
    stats,
    folders,
    folderCounts,
    invoiceReimbursementMap,
    setActiveId,
    setFilter,
    setSort,
    createReimbursement,
    addItem,
    removeItem,
    updateItem,
    updateReimbursement,
    updateStatus,
    deleteReimbursement,
    batchUpdateStatus,
    createFolder,
    updateFolder,
    deleteFolder,
    moveToFolder,
    clearAll,
    reloadReimbursements,
  };
}

export type UseReimbursementReturn = ReturnType<typeof useReimbursement>;
