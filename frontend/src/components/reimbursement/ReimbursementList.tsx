import React, { useCallback, useRef } from "react";
import type { Reimbursement, ReimbursementSort } from "../../types/reimbursement";

type ReimbursementListProps = {
  reimbursements: Reimbursement[];
  activeId: string | null;
  selectedIds: string[];
  sort: ReimbursementSort;
  expanded?: boolean;
  onSelect: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onSelectAll: (ids: string[]) => void;
  onSortChange: (sort: ReimbursementSort) => void;
  onDelete: (id: string) => void;
  onDragStart?: (reimbIds: string[]) => void;
};

const STATUS_CONFIG = {
  draft: { label: "草稿", color: "#64748b" },
  pending_payment: { label: "待支付", color: "#f59e0b" },
  paid: { label: "已支付", color: "#10b981" }
};

const TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  travel: { label: "差旅", color: "#3b82f6" },
  transportation: { label: "交通", color: "#0ea5e9" },
  accommodation: { label: "住宿", color: "#a855f7" },
  office: { label: "办公", color: "#8b5cf6" },
  entertainment: { label: "招待", color: "#ec4899" },
  meal: { label: "餐饮", color: "#f43f5e" },
  training: { label: "培训", color: "#14b8a6" },
  communication: { label: "通讯", color: "#f97316" },
  medical: { label: "医疗", color: "#22c55e" },
  other: { label: "其他", color: "#6366f1" }
};

const SortIcon = ({ active, order }: { active: boolean; order: "asc" | "desc" }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: active ? 1 : 0.3 }}>
    {order === "asc" ? <polyline points="18 15 12 9 6 15" /> : <polyline points="6 9 12 15 18 9" />}
  </svg>
);

export function ReimbursementList({ reimbursements, activeId, selectedIds, sort, expanded = false, onSelect, onToggleSelect, onSelectAll, onSortChange, onDragStart }: ReimbursementListProps) {
  const expandedClass = expanded ? " reimbursementListExpanded" : "";
  const dragImageRef = useRef<HTMLDivElement | null>(null);

  const toggleSort = (field: ReimbursementSort["field"]) => {
    onSortChange(sort.field === field ? { field, order: sort.order === "asc" ? "desc" : "asc" } : { field, order: "desc" });
  };

  const handleDragStart = useCallback(
    (e: React.DragEvent, reimbId: string) => {
      const idsToMove = selectedIds.includes(reimbId) ? selectedIds : [reimbId];
      e.dataTransfer.setData("application/reimbursement-ids", JSON.stringify(idsToMove));
      e.dataTransfer.effectAllowed = "move";

      const dragImage = document.createElement("div");
      dragImage.textContent = `移动 ${idsToMove.length} 个报销`;
      dragImage.style.cssText = `
        position: fixed; top: -1000px; left: -1000px;
        padding: 8px 16px; background: var(--primary, #6aa6ff); color: white;
        border-radius: 8px; font-size: 13px; font-weight: 500;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 10000; pointer-events: none;
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

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    if (isToday) return `今天 ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
    if (isYesterday) return `昨天 ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  };

  return (
    <div className="archiveListBody">
      {reimbursements.length === 0 ? (
        <div className="invoiceListEmpty">
          <div className="invoiceListEmptyIcon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
          </div>
          <div className="invoiceListEmptyText">暂无报销记录</div>
          <div className="invoiceListEmptyHint">点击右上角"新建"开始创建</div>
        </div>
      ) : (
        <div className="invoiceList">
          <div className={`reimbursementListHeader${expandedClass}`}>
            <div>
              <input
                type="checkbox"
                className="reimbursementCardCheckbox"
                checked={reimbursements.length > 0 && selectedIds.length === reimbursements.length}
                ref={(el) => { if (el) el.indeterminate = selectedIds.length > 0 && selectedIds.length < reimbursements.length; }}
                onChange={() => {
                  if (selectedIds.length === reimbursements.length) {
                    onSelectAll([]);
                  } else {
                    onSelectAll(reimbursements.map(r => r.id));
                  }
                }}
              />
            </div>
            <div className="reimbursementListHeaderItem" onClick={() => toggleSort("title" as ReimbursementSort["field"])} style={{ justifyContent: "flex-start" }}>
              名称
            </div>
            {expanded && (
              <div className="reimbursementListHeaderItem" style={{ justifyContent: "flex-start" }}>报销人</div>
            )}
            {expanded && (
              <div className="reimbursementListHeaderItem" style={{ justifyContent: "flex-start" }}>部门</div>
            )}
            <div className="reimbursementListHeaderItem" onClick={() => toggleSort("type")} style={{ justifyContent: "flex-start" }}>
              类型 <SortIcon active={sort.field === "type"} order={sort.order} />
            </div>
            <div className="reimbursementListHeaderItem" onClick={() => toggleSort("status")} style={{ justifyContent: "flex-start" }}>
              状态 <SortIcon active={sort.field === "status"} order={sort.order} />
            </div>
            <div className="reimbursementListHeaderItem" onClick={() => toggleSort("totalAmount")} style={{ justifyContent: "flex-end" }}>
              金额 <SortIcon active={sort.field === "totalAmount"} order={sort.order} />
            </div>
            <div className="reimbursementListHeaderItem" onClick={() => toggleSort("createdAt")} style={{ justifyContent: "flex-end" }}>
              创建时间 <SortIcon active={sort.field === "createdAt"} order={sort.order} />
            </div>
          </div>
          <div className="invoiceListBody" style={{ paddingTop: "12px" }}>
            {reimbursements.map(reimb => {
              const statusCfg = STATUS_CONFIG[reimb.status];
              const typeCfg = TYPE_CONFIG[reimb.type];
              return (
                <div
                  key={reimb.id}
                  className={`reimbursementCard${expandedClass} ${activeId === reimb.id ? "reimbursementCardActive" : ""} ${selectedIds.includes(reimb.id) ? "reimbursementCardSelected" : ""}`}
                  onClick={() => onSelect(reimb.id)}
                  draggable
                  onDragStart={(e) => handleDragStart(e, reimb.id)}
                  onDragEnd={handleDragEnd}
                >
                  <input
                    type="checkbox"
                    className="reimbursementCardCheckbox"
                    checked={selectedIds.includes(reimb.id)}
                    onChange={(e) => {
                      e.stopPropagation();
                      onToggleSelect(reimb.id);
                    }}
                  />
                  <div title={reimb.title} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: 6, background: `${typeCfg.color}15`, color: typeCfg.color, flexShrink: 0 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {reimb.title || "-"}
                    </span>
                  </div>
                  {expanded && (
                    <div title={reimb.applicant} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: "50%", background: "linear-gradient(135deg, #6aa6ff, #4b7fd6)", color: "#fff", fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                        {(reimb.applicant || "?").trim().charAt(0).toUpperCase()}
                      </span>
                      <span style={{ fontSize: 13, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {reimb.applicant || "-"}
                      </span>
                    </div>
                  )}
                  {expanded && (
                    <div title={reimb.department} style={{ minWidth: 0 }}>
                      {reimb.department ? (
                        <span style={{ display: "inline-block", maxWidth: "100%", padding: "3px 10px", borderRadius: 12, background: "rgba(106, 166, 255, 0.10)", color: "var(--primary)", fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", border: "1px solid rgba(106, 166, 255, 0.25)" }}>
                          {reimb.department}
                        </span>
                      ) : (
                        <span style={{ fontSize: 13, color: "var(--muted)" }}>-</span>
                      )}
                    </div>
                  )}
                  <div className="reimbursementCardType" style={{ background: `${typeCfg.color}20`, color: typeCfg.color, border: `1px solid ${typeCfg.color}40` }}>
                    {typeCfg.label}
                  </div>
                  <div className="reimbursementCardStatus" style={{ background: `${statusCfg.color}20`, color: statusCfg.color, border: `1px solid ${statusCfg.color}40` }}>
                    {statusCfg.label}
                  </div>
                  <div className="reimbursementCardAmount">¥{reimb.totalAmount.toFixed(2)}</div>
                  <div className="reimbursementCardDate">{formatDate(reimb.createdAt)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
