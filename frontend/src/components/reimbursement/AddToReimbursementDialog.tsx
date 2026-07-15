import { useState, useMemo } from "react";
import type { Reimbursement } from "../../types/reimbursement";

type AddToReimbursementDialogProps = {
  reimbursements: Reimbursement[];
  invoiceCount: number;
  onSelectReimbursement: (reimbId: string) => void;
  onCreateNew: () => void;
  onCancel: () => void;
};

const PlusIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const STATUS_LABELS: Record<string, string> = { draft: "草稿", pending_payment: "待支付", paid: "已支付" };

export function AddToReimbursementDialog({
  reimbursements,
  invoiceCount,
  onSelectReimbursement,
  onCreateNew,
  onCancel,
}: AddToReimbursementDialogProps) {
  const [selectedId, setSelectedId] = useState<string>("");

  const draftReimbursements = useMemo(
    () => reimbursements.filter(r => r.status === "draft"),
    [reimbursements]
  );

  return (
    <div className="dialogOverlay" onClick={onCancel}>
      <div className="dialog" onClick={e => e.stopPropagation()} style={{ width: "480px", maxWidth: "90%" }}>
        <div className="dialogHeader">
          <div className="dialogTitle">添加到报销</div>
          <button className="dialogCloseBtn" onClick={onCancel}>×</button>
        </div>
        <div className="dialogBody" style={{ padding: 0 }}>
          <div style={{ padding: "12px 16px 8px", fontSize: "13px", color: "var(--muted)" }}>
            将 {invoiceCount} 张发票添加到报销单
          </div>

          {            }
          <div
            className={`folderSelectItem ${selectedId === "__new__" ? "active" : ""}`}
            onClick={() => setSelectedId("__new__")}
            style={{ margin: "0 8px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--primary)" }}>
              {PlusIcon}
              <span style={{ fontSize: "13px", fontWeight: 500 }}>新建报销单</span>
            </div>
          </div>

          {draftReimbursements.length > 0 ? (
            <div style={{ maxHeight: "320px", overflow: "auto", padding: "4px 8px 8px" }}>
              {draftReimbursements.map(r => (
                <div
                  key={r.id}
                  className={`folderSelectItem ${selectedId === r.id ? "active" : ""}`}
                  onClick={() => setSelectedId(r.id)}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "13px", marginBottom: "4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.title}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--muted)", display: "flex", gap: "8px" }}>
                      <span>{STATUS_LABELS[r.status]}</span>
                      <span>{r.code}</span>
                      <span>{r.items.length} 张发票</span>
                      <span>¥{r.totalAmount.toFixed(2)}</span>
                    </div>
                  </div>
                  {selectedId === r.id && (
                    <div className="folderSelectCheck">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: "center", color: "var(--muted)", padding: "24px 16px", fontSize: "13px" }}>
              暂无草稿报销单，请新建
            </div>
          )}
        </div>
        <div className="dialogFooter">
          <button onClick={onCancel}>取消</button>
          <button
            className="primary"
            disabled={!selectedId}
            onClick={() => {
              if (selectedId === "__new__") {
                onCreateNew();
              } else {
                onSelectReimbursement(selectedId);
              }
            }}
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}
