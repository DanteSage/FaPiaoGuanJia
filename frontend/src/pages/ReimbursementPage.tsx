import React, { useState, useCallback, useEffect } from "react";
import type { UseReimbursementReturn } from "../hooks/useReimbursement";
import type { UseArchiveStateReturn } from "../hooks/useArchiveState";
import type { ReimbursementFolder, ReimbursementStatusUpdateExtra, ReimbursementType } from "../types/reimbursement";
import { ReimbursementList } from "../components/reimbursement/ReimbursementList";
import { ReimbursementDetail } from "../components/reimbursement/ReimbursementDetail";
import { CreateDialog } from "../components/reimbursement/CreateDialog";
import { FilterPanel } from "../components/reimbursement/FilterPanel";
import { FolderDialog } from "../components/reimbursement/FolderDialog";
import { MoveToFolderDialog } from "../components/reimbursement/MoveToFolderDialog";
import { ConfirmDialog } from "../components/ConfirmDialog";
import "../archive.css";

const ExportIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

type ReimbursementPageProps = {
  archiveState: UseArchiveStateReturn;
  reimbursementState: UseReimbursementReturn;
  pendingInvoiceIds?: string[] | null;
  onClearPendingInvoiceIds?: () => void;
  showToast?: (message: string, type: "success" | "error" | "warning" | "info") => void;
  reimbursementDefaults?: { applicant?: string; department?: string; sales?: string };
  onPrintReimbursement?: (payload: Record<string, unknown>, invoiceFilePaths: string[]) => Promise<void>;
};

export function ReimbursementPage({ archiveState, reimbursementState: reimbursement, pendingInvoiceIds, onClearPendingInvoiceIds, showToast, reimbursementDefaults, onPrintReimbursement }: ReimbursementPageProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    danger?: boolean;
    confirmText?: string;
  } | null>(null);
  const [folderDialog, setFolderDialog] = useState<{ folder?: ReimbursementFolder | null; defaultParentId?: string | null } | null>(null);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedIds([]);
  }, [reimbursement.filter]);

  const hasReimbActiveFilters = Boolean(
    reimbursement.filter.status?.length ||
    reimbursement.filter.type?.length ||
    reimbursement.filter.applicant ||
    reimbursement.filter.department ||
    reimbursement.filter.dateRange ||
    reimbursement.filter.amountRange ||
    reimbursement.filter.search
  );

  useEffect(() => {
    if (pendingInvoiceIds && pendingInvoiceIds.length > 0) {
      setShowCreateDialog(true);
    }
  }, [pendingInvoiceIds]);

  const handleCreate = useCallback((title: string, applicant: string, department: string, purpose: string, type: ReimbursementType, sales?: string, costPerDay?: string, folderId?: string | null) => {
    setConfirmDialog({
      title: "确认创建报销",
message: "报销单创建后将进入草稿状态，表单内容不可修改，请确认信息填写无误。",
      danger: false,
      confirmText: "确认创建",
      onConfirm: () => {
        const r = reimbursement.createReimbursement(title, applicant, department, purpose, type, sales, costPerDay);
        if (folderId) {
          reimbursement.updateReimbursement(r.id, { folderId });
        }

        if (pendingInvoiceIds && pendingInvoiceIds.length > 0) {
          let added = 0;
          for (const invoiceId of pendingInvoiceIds) {
            const invoice = archiveState.invoices.find(inv => inv.id === invoiceId);
            if (!invoice) continue;
            reimbursement.addItem(r.id, {
              invoiceId: invoice.id,
              invoiceName: invoice.fileName,
              invoiceCode: invoice.invoiceCode,
              invoiceNumber: invoice.invoiceNumber,
              invoiceDate: invoice.invoiceDate,
              amount: invoice.totalAmount || 0,
              taxAmount: invoice.taxAmount,
              category: invoice.category,
            });
            added++;
          }
          onClearPendingInvoiceIds?.();
          if (added > 0) {
            showToast?.(`报销创建成功，已添加 ${added} 张发票`, "success");
          } else {
            showToast?.("报销创建成功", "success");
          }
        } else {
          showToast?.("报销创建成功", "success");
        }
        setShowCreateDialog(false);
        setConfirmDialog(null);
      }
    });
  }, [reimbursement, archiveState.invoices, pendingInvoiceIds, onClearPendingInvoiceIds, showToast]);

  const handleDelete = useCallback((id: string) => {
    const reimb = reimbursement.reimbursements.find(r => r.id === id);
    if (!reimb) return;
    setConfirmDialog({
      title: "删除报销",
      message: `确定要删除报销「${reimb.title}」吗？`,
      onConfirm: () => {
        reimbursement.deleteReimbursement(id);
        setConfirmDialog(null);
        showToast?.("删除成功", "success");
      }
    });
  }, [reimbursement, showToast]);

  const handleBatchDelete = useCallback(() => {
    if (selectedIds.length === 0) return;
    setConfirmDialog({
      title: "批量删除",
      message: `确定要删除选中的 ${selectedIds.length} 个报销吗？`,
      onConfirm: () => {
        selectedIds.forEach(id => reimbursement.deleteReimbursement(id));
        setSelectedIds([]);
        setConfirmDialog(null);
        showToast?.(`成功删除 ${selectedIds.length} 个报销`, "success");
      }
    });
  }, [selectedIds, reimbursement, showToast]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  }, []);

  const handleFolderDragOver = useCallback((e: React.DragEvent, folderId: string) => {
    if (e.dataTransfer.types.includes("application/reimbursement-ids")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOverFolderId(folderId);
    }
  }, []);

  const handleFolderDragLeave = useCallback(() => {
    setDragOverFolderId(null);
  }, []);

  const handleFolderDrop = useCallback((e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    setDragOverFolderId(null);
    const raw = e.dataTransfer.getData("application/reimbursement-ids");
    if (!raw) return;
    try {
      const ids: string[] = JSON.parse(raw);
      const targetId = folderId === "__uncategorized__" ? null : folderId;
      reimbursement.moveToFolder(ids, targetId);
      const folderName = targetId
        ? reimbursement.folders.find(f => f.id === targetId)?.name || "文件夹"
        : "未分类";
      setSelectedIds([]);
      showToast?.(`已移动 ${ids.length} 个报销到「${folderName}」`, "success");
    } catch (error) {
      console.warn("reimbursement folder drop parse failed", error);
    }
  }, [reimbursement, showToast]);

  const handleMoveToFolder = useCallback((folderId: string | null) => {
    reimbursement.moveToFolder(selectedIds, folderId);
    const folderName = folderId
      ? reimbursement.folders.find(f => f.id === folderId)?.name || "文件夹"
      : "未分类";
    setShowMoveDialog(false);
    setSelectedIds([]);
    showToast?.(`已移动 ${selectedIds.length} 个报销到「${folderName}」`, "success");
  }, [selectedIds, reimbursement, showToast]);

  return (
    <div className="reimbursementPage">

      <div className="reimbursementTopBar">
        <div className="reimbursementStatCards">
          <div className="reimbursementStatCard">
            <div className="reimbursementStatLabel">报销总数</div>
            <div className="reimbursementStatValue">{reimbursement.stats.count}</div>
            <div className="reimbursementStatSub">全部报销记录</div>
          </div>
          <div className="reimbursementStatCard">
            <div className="reimbursementStatLabel">总金额</div>
            <div className="reimbursementStatValue primary">¥{reimbursement.stats.total.toFixed(2)}</div>
            <div className="reimbursementStatSub">累计报销金额</div>
          </div>
          <div className="reimbursementStatCard">
            <div className="reimbursementStatLabel">待支付</div>
            <div className="reimbursementStatValue warning">{reimbursement.stats.pendingCount}</div>
            <div className="reimbursementStatSub">¥{reimbursement.stats.pendingAmount.toFixed(2)}</div>
          </div>
          <div className="reimbursementStatCard">
            <div className="reimbursementStatLabel">平均金额</div>
            <div className="reimbursementStatValue">¥{reimbursement.stats.avgAmount.toFixed(2)}</div>
            <div className="reimbursementStatSub">单笔平均报销</div>
          </div>
        </div>
      </div>

      <div className={`reimbursementMainContent${detailOpen ? "" : " noDetail"}`}>

        <div className="panel reimbursementFilterPanel">
          <div className="panelHeader">
            <div className="panelHeaderLeft">
              <div className="panelTitle">管理</div>
              {hasReimbActiveFilters && (
                <span className="filterBadge filterBadgeRemovable">
                  已启用筛选
                  <button
                    type="button"
                    className="filterBadgeClose"
                    onClick={() =>
                      reimbursement.setFilter({ folderId: reimbursement.filter.folderId })
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
          </div>
          <FilterPanel
            filter={reimbursement.filter}
            stats={reimbursement.stats}
            folders={reimbursement.folders}
            folderCounts={reimbursement.folderCounts}
            onFilterChange={reimbursement.setFilter}
            dragOverFolderId={dragOverFolderId}
            onFolderDragOver={handleFolderDragOver}
            onFolderDragLeave={handleFolderDragLeave}
            onFolderDrop={handleFolderDrop}
            onCreateFolder={(parentId) => setFolderDialog({ folder: null, defaultParentId: parentId })}
            onEditFolder={(folder) => setFolderDialog({ folder })}
            onDeleteFolder={(folderId) => {
              const folder = reimbursement.folders.find(f => f.id === folderId);
              setConfirmDialog({
                title: "删除文件夹",
                message: `确定要删除文件夹「${folder?.name}」吗？其中的报销将移至未分类。`,
                onConfirm: () => {
                  reimbursement.deleteFolder(folderId);
                  setConfirmDialog(null);
                  showToast?.("文件夹已删除", "success");
                }
              });
            }}
          />
        </div>

        <div className="panel reimbursementListPanel">
          <div className="panelHeader">
            <div className="panelHeaderLeft">
              <div className="panelTitle">报销列表</div>
              <span className="archiveCount">
                {reimbursement.reimbursements.length} 个
                {selectedIds.length > 0 && ` · 已选 ${selectedIds.length}`}
              </span>
            </div>
            <div className="panelHeaderRight">
              {selectedIds.length > 0 && (
                <>
                  <button onClick={() => setShowMoveDialog(true)}>移动到</button>
                  <button className="iconBtn" title="导出选中">
                    {ExportIcon}
                  </button>
                  <button className="danger" onClick={handleBatchDelete}>删除</button>
                </>
              )}
              <button onClick={() => setShowCreateDialog(true)}>
                新建
              </button>
            </div>
          </div>
          <ReimbursementList
            reimbursements={reimbursement.reimbursements}
            activeId={reimbursement.activeId}
            selectedIds={selectedIds}
            sort={reimbursement.sort}
            expanded={!detailOpen}
            onSelect={(id) => { reimbursement.setActiveId(id); setDetailOpen(true); }}
            onToggleSelect={toggleSelect}
            onSelectAll={setSelectedIds}
            onSortChange={reimbursement.setSort}
            onDelete={handleDelete}
          />
        </div>

        {detailOpen && (
        <div className="panel reimbursementDetailPanel previewPanel">
          <ReimbursementDetail
            reimbursement={reimbursement.activeReimbursement}
            onClose={() => setDetailOpen(false)}
            invoices={archiveState.invoices}
            folders={reimbursement.folders}
            onAddItem={reimbursement.addItem}
            onRemoveItem={reimbursement.removeItem}
            onUpdateItem={reimbursement.updateItem}
            onUpdateReimbursement={reimbursement.updateReimbursement}
            onUpdateStatus={(reimbId, status, extra?: ReimbursementStatusUpdateExtra) => {
              if (status === "pending_payment") {
                setConfirmDialog({
                  title: "确认提交报销",
message: "提交后发票明细将无法添加、编辑，请确认内容是否无误。",
                  danger: false,
                  confirmText: "确认提交",
                  onConfirm: () => {
                    reimbursement.updateStatus(reimbId, status, extra);
                    setConfirmDialog(null);
                    showToast?.("报销已提交，等待支付", "success");
                  }
                });
                return;
              }
              reimbursement.updateStatus(reimbId, status, extra);
            }}
            showToast={showToast}
            onPrintReimbursement={onPrintReimbursement}
          />
        </div>
        )}
      </div>

      {showCreateDialog && (
        <CreateDialog
          folders={reimbursement.folders}
          defaultValues={reimbursementDefaults}
          onConfirm={handleCreate}
          onCancel={() => { setShowCreateDialog(false); onClearPendingInvoiceIds?.(); }}
        />
      )}

      {folderDialog && (
        <FolderDialog
          folder={folderDialog.folder}
          folders={reimbursement.folders}
          defaultParentId={folderDialog.defaultParentId}
          onConfirm={(name, color, parentId) => {
            if (folderDialog.folder) {
              reimbursement.updateFolder(folderDialog.folder.id, { name, color, parentId });
              showToast?.("文件夹已更新", "success");
            } else {
              reimbursement.createFolder(name, color, parentId);
              showToast?.("文件夹已创建", "success");
            }
            setFolderDialog(null);
          }}
          onDelete={folderDialog.folder ? () => {
            reimbursement.deleteFolder(folderDialog.folder!.id);
            setFolderDialog(null);
            showToast?.("文件夹已删除", "success");
          } : undefined}
          onCancel={() => setFolderDialog(null)}
        />
      )}

      {showMoveDialog && (
        <MoveToFolderDialog
          folders={reimbursement.folders}
          folderCounts={reimbursement.folderCounts}
          selectedCount={selectedIds.length}
          onConfirm={handleMoveToFolder}
          onCancel={() => setShowMoveDialog(false)}
        />
      )}

      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmText={confirmDialog.confirmText || "确定"}
          danger={confirmDialog.danger !== false}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
  );
}
