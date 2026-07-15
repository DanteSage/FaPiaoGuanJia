import { useEffect, useState } from "react";

export type ReimbursementRefSummary = {
  id: string;
  code: string;
  title: string;
  status: string;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  pending_payment: "待支付",
  paid: "已支付",
};

const STATUS_CLASS: Record<string, string> = {
  draft: "draft",
  pending_payment: "pending",
  paid: "paid",
};

const WarningIcon = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const KeepIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const RemoveIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
  </svg>
);

export function DeleteInvoiceWithRefsDialog({
  invoiceCount,
  refs,
  onCancel,
  onConfirm,
}: {
  invoiceCount: number;
  refs: ReimbursementRefSummary[];
  onCancel: () => void;
  onConfirm: (cascadeMode: "keep" | "remove") => void;
}) {
  const [mode, setMode] = useState<"keep" | "remove">("keep");

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
      else if (e.key === "Enter") onConfirm(mode);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel, onConfirm, mode]);

  const refsByReimb = new Map<string, ReimbursementRefSummary>();
  for (const r of refs) {
    if (!refsByReimb.has(r.id)) refsByReimb.set(r.id, r);
  }
  const uniqueRefs = Array.from(refsByReimb.values());

  const confirmBtnClass =
    mode === "remove"
      ? "confirmDialogBtn confirmDialogBtnDanger"
      : "confirmDialogBtn confirmDialogBtnConfirm";
  const confirmBtnText = mode === "remove" ? "删除并移除引用" : "仅删除发票";

  return (
    <div className="confirmDialogOverlay" onClick={onCancel}>
      <div
        className="confirmDialog deleteRefsDialog"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="deleteRefsHeader">
          <div className="deleteRefsHeaderIcon">{WarningIcon}</div>
          <div className="deleteRefsHeaderText">
            <div className="deleteRefsHeaderTitle">删除发票需要确认</div>
            <div className="deleteRefsHeaderDesc">
              所选 <strong>{invoiceCount}</strong> 张发票已被{" "}
              <strong>{uniqueRefs.length}</strong> 个报销单引用，请选择处理方式。
            </div>
          </div>
        </div>

        <div className="deleteRefsBody">
          <div className="deleteRefsSectionLabel">受影响的报销单</div>
          <div className="deleteRefsList">
            {uniqueRefs.map((r) => (
              <div key={r.id} className="deleteRefsListItem">
                <span className="deleteRefsItemCode">{r.code}</span>
                <span className="deleteRefsItemTitle">{r.title || "（未命名）"}</span>
                <span
                  className={`deleteRefsItemStatus ${STATUS_CLASS[r.status] ?? ""}`}
                >
                  {STATUS_LABEL[r.status] ?? r.status}
                </span>
              </div>
            ))}
          </div>

          <div className="deleteRefsSectionLabel">处理方式</div>
          <div className="deleteRefsOptions">
            <button
              type="button"
              className={`deleteRefsOption keep${mode === "keep" ? " active" : ""}`}
              onClick={() => setMode("keep")}
            >
              <div className="deleteRefsOptionHead">
                <span className="deleteRefsOptionIcon">{KeepIcon}</span>
                <span className="deleteRefsOptionTitle">保留报销条目</span>
                <span className="deleteRefsOptionRadio">
                  <span className="deleteRefsOptionRadioDot" />
                </span>
              </div>
              <div className="deleteRefsOptionDesc">
                删除发票文件，报销单条目保留并标记「原发票已删除」，金额与总额不变。
              </div>
            </button>

            <button
              type="button"
              className={`deleteRefsOption remove${mode === "remove" ? " active" : ""}`}
              onClick={() => setMode("remove")}
            >
              <div className="deleteRefsOptionHead">
                <span className="deleteRefsOptionIcon">{RemoveIcon}</span>
                <span className="deleteRefsOptionTitle">移除报销引用</span>
                <span className="deleteRefsOptionRadio">
                  <span className="deleteRefsOptionRadioDot" />
                </span>
              </div>
              <div className="deleteRefsOptionDesc">
                删除发票文件，同时从报销单中移除条目，自动重算总额（不可恢复）。
              </div>
            </button>
          </div>
        </div>

        <div className="deleteRefsFooter">
          <button
            type="button"
            className="confirmDialogBtn confirmDialogBtnCancel"
            onClick={onCancel}
          >
            取消
          </button>
          <button
            type="button"
            className={confirmBtnClass}
            onClick={() => onConfirm(mode)}
          >
            {confirmBtnText}
          </button>
        </div>
      </div>
    </div>
  );
}
