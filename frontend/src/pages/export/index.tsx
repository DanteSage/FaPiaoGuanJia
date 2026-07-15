import { useState } from "react";
import type { UseArchiveStateReturn } from "../../hooks/useArchiveState";
import type { UseReimbursementReturn } from "../../hooks/useReimbursement";
import type { ExportMode } from "./exportTypes";
import { InvoiceExport } from "./InvoiceExport";
import { ReimbExport } from "./ReimbExport";
import "../../archive.css";

const Icons = {
  table: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
  ),
  clipboard: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    </svg>
  ),
};

const MODES: { id: ExportMode; label: string; icon: JSX.Element; desc: string }[] = [
  { id: "invoice", label: "发票明细", icon: Icons.table, desc: "导出发票数据为 CSV" },
  { id: "reimbursement", label: "报销汇总", icon: Icons.clipboard, desc: "导出报销单数据为 CSV" },
];

type ExportPageProps = {
  archiveState: UseArchiveStateReturn;
  reimbursementState: UseReimbursementReturn;
  showToast: (msg: string, type?: "info" | "success" | "error" | "warning") => void;
};

export function ExportPage({ archiveState, reimbursementState, showToast }: ExportPageProps) {
  const [mode, setMode] = useState<ExportMode>("invoice");

  const invoiceCount = archiveState.invoices.length;
  const reimbCount = reimbursementState.allReimbursements.length;
  const totalAmount = archiveState.invoices.reduce((s, inv) => s + (inv.totalAmount || 0), 0);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: "12px", height: "100%" }}>
      {          }
      <div className="panel" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div className="panelHeader">
          <div className="panelHeaderLeft">
            <div className="panelTitle">导出中心</div>
          </div>
        </div>
        <div className="folderTree" style={{ flex: 1, overflow: "auto" }}>
          <div className="folderSection">
            {MODES.map((m) => (
              <div
                key={m.id}
                className={`folderItem ${mode === m.id ? "folderItemActive" : ""}`}
                onClick={() => setMode(m.id)}
              >
                <span className="folderIcon">{m.icon}</span>
                <span className="folderName">{m.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="tagList">
          <div className="tagListHeader">
            <div className="tagListHeaderLeft">
              <span className="tagListTitle">数据概览</span>
            </div>
          </div>
          <div className="tagListBody">
            <QuickMetric label="发票总数" value={invoiceCount} unit="张" />
            <QuickMetric label="总金额" value={`¥${totalAmount.toFixed(2)}`} />
            <QuickMetric label="报销单" value={reimbCount} unit="单" />
          </div>
        </div>
      </div>

      <div className="panel" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div className="panelHeader">
          <div className="panelHeaderLeft">
            <div className="panelTitle">{MODES.find((m) => m.id === mode)?.label}</div>
          </div>
          <div className="panelHeaderRight">
            <span style={{ fontSize: "11px", color: "var(--muted)" }}>
              {MODES.find((m) => m.id === mode)?.desc}
            </span>
          </div>
        </div>
        <div className="archiveListBody" style={{ flex: 1, overflow: "auto" }}>
          {mode === "invoice" && (
            <InvoiceExport invoices={archiveState.invoices} folders={archiveState.allFolders} showToast={showToast} />
          )}
          {mode === "reimbursement" && (
            <ReimbExport reimbursements={reimbursementState.allReimbursements} folders={reimbursementState.folders} showToast={showToast} />
          )}
        </div>
      </div>
    </div>
  );
}

function QuickMetric({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <div className="tagListItem" style={{ cursor: "default", padding: "8px 12px" }}>
      <span className="tagListItemName" style={{ fontSize: "12px", color: "var(--muted)" }}>{label}</span>
      <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>
        {value}{unit && <span style={{ fontSize: "11px", marginLeft: "2px" }}>{unit}</span>}
      </span>
    </div>
  );
}
