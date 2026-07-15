import { useState, useMemo } from "react";
import type { ArchivedInvoice, InvoiceCategory } from "../../types";
import type { ReimbursementStatus } from "../../types/reimbursement";
import { CATEGORY_LABELS } from "../../hooks/useArchiveState";

type AddItemDialogProps = {
  invoices: ArchivedInvoice[];
  invoiceReimbursementMap?: Map<string, ReimbursementStatus>;
  onConfirm: (invoiceIds: string[]) => void;
  onCancel: () => void;
};

export function AddItemDialog({ invoices, invoiceReimbursementMap, onConfirm, onCancel }: AddItemDialogProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<InvoiceCategory | null>(null);

  const availableCategories = useMemo(() => {
    const cats = new Set<InvoiceCategory>();
    invoices.forEach(inv => cats.add(inv.category));
    return Array.from(cats);
  }, [invoices]);

  const filtered = useMemo(() => {
    let list = invoices;
    if (activeCategory) {
      list = list.filter(inv => inv.category === activeCategory);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(inv =>
        inv.fileName.toLowerCase().includes(q) ||
        (inv.sellerName || "").toLowerCase().includes(q) ||
        (inv.invoiceNumber || "").includes(q) ||
        CATEGORY_LABELS[inv.category].includes(q)
      );
    }
    return list;
  }, [invoices, search, activeCategory]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (filtered.length === 0) return;
    const allSelected = filtered.every(inv => selectedIds.has(inv.id));
    if (allSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filtered.forEach(inv => next.delete(inv.id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filtered.forEach(inv => next.add(inv.id));
        return next;
      });
    }
  };

  return (
    <div className="dialogOverlay" onClick={onCancel}>
      <div className="dialog" onClick={e => e.stopPropagation()} style={{ width: "560px", maxWidth: "90%" }}>
        <div className="dialogHeader">
          <div className="dialogTitle">添加发票{selectedIds.size > 0 && ` (${selectedIds.size})`}</div>
          <button className="dialogCloseBtn" onClick={onCancel}>×</button>
        </div>
        <div className="dialogBody" style={{ padding: "0" }}>

          <div style={{ padding: "12px 16px 8px" }}>
            <input
              className="toolbarInput"
              placeholder="搜索发票名称、销方、号码…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: "100%" }}
            />
          </div>

          {availableCategories.length > 1 && (
            <div className="addItemCategoryChips">
              <button
                className={`addItemChip ${activeCategory === null ? "active" : ""}`}
                onClick={() => setActiveCategory(null)}
              >全部</button>
              {availableCategories.map(cat => (
                <button
                  key={cat}
                  className={`addItemChip ${activeCategory === cat ? "active" : ""}`}
                  onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                >{CATEGORY_LABELS[cat]}</button>
              ))}
            </div>
          )}

          {filtered.length > 0 && (
            <div className="addItemSelectAll">
              <button className="addItemSelectAllBtn" onClick={toggleAll}>
                {filtered.every(inv => selectedIds.has(inv.id)) ? "取消全选" : "全选当前"}
              </button>
              <span className="addItemCount">{filtered.length} 张发票</span>
            </div>
          )}

          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--muted)", padding: "32px 20px" }}>
              {invoices.length === 0 ? "暂无可用发票" : "无匹配结果"}
            </div>
          ) : (
            <div style={{ maxHeight: "360px", overflow: "auto", padding: "0 8px 8px" }}>
              {filtered.map(inv => {
                const isReimbursed = invoiceReimbursementMap?.has(inv.id);
                return (
                  <div
                    key={inv.id}
                    className={`folderSelectItem ${selectedIds.has(inv.id) ? "active" : ""}`}
                    onClick={() => toggleSelect(inv.id)}
                  >
                    <div className="addItemCheckbox">
                      {selectedIds.has(inv.id) ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : (
                        <div className="addItemCheckboxEmpty" />
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "13px", marginBottom: "4px", display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inv.fileName}</span>
                        {isReimbursed && <span className="addItemReimbursedTag">已关联报销</span>}
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--muted)" }}>
                        {CATEGORY_LABELS[inv.category]} · {inv.invoiceDate || "-"} · ¥{(inv.totalAmount || 0).toFixed(2)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="dialogFooter">
          <button onClick={onCancel}>取消</button>
          <button className="primary" onClick={() => onConfirm(Array.from(selectedIds))} disabled={selectedIds.size === 0}>
            添加{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
