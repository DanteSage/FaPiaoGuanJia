import React, { useCallback, useRef } from "react";
import type { ArchivedInvoice, ArchiveSortOption } from "../../types";
import type { ReimbursementStatus } from "../../types/reimbursement";
import { CATEGORY_LABELS } from "../../hooks/useArchiveState";
import { warmupOfdPreview } from "../../utils/ofdWarmup";

const REIMB_STATUS_LABEL: Record<ReimbursementStatus, string> = {
  draft: "草稿",
  pending_payment: "待支付",
  paid: "已支付",
};

type InvoiceListProps = {
  invoices: ArchivedInvoice[];
  selectedIds: string[];
  activeId: string | null;
  sort: ArchiveSortOption;
  invoiceReimbursementMap?: Map<string, ReimbursementStatus>;
  duplicateAttemptedIds?: string[];
  onLocateReimbursement?: (invoiceId: string) => void;
  onSelect: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onSetActive: (id: string) => void;
  onSortChange: (sort: ArchiveSortOption) => void;
  onDelete: (id: string) => void;

  onDragStart?: (invoiceIds: string[]) => void;
};

const CheckIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const MinusIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const SortAscIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="18 15 12 9 6 15" />
  </svg>
);

const SortDescIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

function formatAmount(amount?: number): string {
  if (amount === undefined || amount === null) return "-";
  return `¥${amount.toFixed(2)}`;
}

function formatDate(date?: string): string {
  if (!date) return "-";
  return date;
}

export function InvoiceList({
  invoices,
  selectedIds,
  activeId,
  sort,
  invoiceReimbursementMap,
  duplicateAttemptedIds = [],
  onLocateReimbursement,

  onSelect: _onSelect,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onSetActive,
  onSortChange,
  onDelete: _onDelete,
  onDragStart,
}: InvoiceListProps) {
  const allSelected = invoices.length > 0 && selectedIds.length === invoices.length;
  const someSelected = selectedIds.length > 0 && selectedIds.length < invoices.length;
  const dragImageRef = useRef<HTMLDivElement | null>(null);

  const handleDragStart = useCallback(
    (e: React.DragEvent, invoiceId: string) => {

      const idsToMove = selectedIds.includes(invoiceId) ? selectedIds : [invoiceId];

      e.dataTransfer.setData("application/invoice-ids", JSON.stringify(idsToMove));
      e.dataTransfer.effectAllowed = "move";

      const dragImage = document.createElement("div");
      dragImage.className = "dragImage";
      dragImage.textContent = `移动 ${idsToMove.length} 张发票`;
      dragImage.style.cssText = `
        position: fixed;
        top: -1000px;
        left: -1000px;
        padding: 8px 16px;
        background: var(--primary, #6aa6ff);
        color: white;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        z-index: 10000;
        pointer-events: none;
      `;
      document.body.appendChild(dragImage);
      dragImageRef.current = dragImage;
      e.dataTransfer.setDragImage(dragImage, 50, 20);

      onDragStart?.(idsToMove);
    },
    [selectedIds, onDragStart]
  );

  const handleDragEnd = useCallback(() => {

    if (dragImageRef.current) {
      document.body.removeChild(dragImageRef.current);
      dragImageRef.current = null;
    }
  }, []);

  const handleHeaderCheckbox = useCallback(() => {
    if (allSelected || someSelected) {
      onClearSelection();
    } else {
      onSelectAll();
    }
  }, [allSelected, someSelected, onSelectAll, onClearSelection]);

  const handleSort = useCallback(
    (field: ArchiveSortOption["field"]) => {
      if (sort.field === field) {
        onSortChange({ field, order: sort.order === "asc" ? "desc" : "asc" });
      } else {
        onSortChange({ field, order: "desc" });
      }
    },
    [sort, onSortChange]
  );

  const SortIndicator = ({ field }: { field: ArchiveSortOption["field"] }) => {
    if (sort.field !== field) return null;
    return <span className="sortIndicator">{sort.order === "asc" ? SortAscIcon : SortDescIcon}</span>;
  };

  if (invoices.length === 0) {
    return (
      <div className="invoiceListEmpty">
        <div className="invoiceListEmptyIcon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        </div>
        <div className="invoiceListEmptyText">暂无发票</div>
        <div className="invoiceListEmptyHint">点击"导入发票"添加发票到此分类</div>
      </div>
    );
  }

  return (
    <div className="invoiceList">
      <div className="invoiceListHeader">
        <div
          className={`tableCheckbox ${allSelected ? "checked" : ""} ${someSelected ? "indeterminate" : ""}`}
          onClick={handleHeaderCheckbox}
        >
          {allSelected ? CheckIcon : someSelected ? MinusIcon : null}
        </div>
        <span className="invoiceListHeaderText" onClick={() => handleSort("fileName")}>
          文件 <SortIndicator field="fileName" />
        </span>
        <span className="invoiceListHeaderText invoiceListHeaderRight" onClick={() => handleSort("totalAmount")}>
          金额 <SortIndicator field="totalAmount" />
        </span>
      </div>
      <div className="invoiceListBody">
      {invoices.map((invoice) => {
        const isDuplicate = duplicateAttemptedIds.includes(invoice.id);
        return (
          <div
            key={invoice.id}
            className={`invoiceListItem ${activeId === invoice.id ? "invoiceListItemActive" : ""} ${
              selectedIds.includes(invoice.id) ? "invoiceListItemSelected" : ""
            } ${isDuplicate ? "invoiceListItemDuplicate" : ""}`}
            onClick={() => {
              if (invoice.fileType === "ofd") {
                void warmupOfdPreview(invoice.filePath, { hydratePreview: true });
              }
              onSetActive(invoice.id);
            }}
            onMouseEnter={() => {
              if (invoice.fileType === "ofd") {
                void warmupOfdPreview(invoice.filePath);
              }
            }}
            draggable
            onDragStart={(e) => handleDragStart(e, invoice.id)}
            onDragEnd={handleDragEnd}
          >
            <div
              className={`tableCheckbox ${selectedIds.includes(invoice.id) ? "checked" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelect(invoice.id);
              }}
            >
              {selectedIds.includes(invoice.id) && CheckIcon}
            </div>
            <div className="invoiceListItemMain">
              <div className="invoiceListItemTop">
                <span className="invoiceListItemName" title={invoice.fileName}>
                  {invoice.fileName}
                </span>
                <span className="invoiceListItemAmount">{formatAmount(invoice.totalAmount)}</span>
              </div>
              <div className="invoiceListItemBottom">
                <span className="invoiceListItemType">{CATEGORY_LABELS[invoice.category]}</span>
                {invoiceReimbursementMap?.has(invoice.id) && (
                  <span className={`invoiceListItemReimb invoiceListItemReimb--${invoiceReimbursementMap.get(invoice.id)}`}>
                    {REIMB_STATUS_LABEL[invoiceReimbursementMap.get(invoice.id)!]}
                  </span>
                )}
                {isDuplicate && (
                  <span className="invoiceListItemDuplicateTag">[重复导入]</span>
                )}
                {isDuplicate && invoiceReimbursementMap?.has(invoice.id) && onLocateReimbursement && (
                  <button
                    className="invoiceListItemLocateReimbBtn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onLocateReimbursement(invoice.id);
                    }}
                  >
                    一键定位上次报销历史
                  </button>
                )}
                <span className="invoiceListItemDate">{formatDate(invoice.invoiceDate)}</span>
              </div>
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}
