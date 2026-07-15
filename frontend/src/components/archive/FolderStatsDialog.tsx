import { useEffect, useMemo } from "react";
import type { ArchivedInvoice, InvoiceCategory, InvoiceFolder } from "../../types";
import { CATEGORY_LABELS } from "../../hooks/useArchiveState";

function toFinite(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[^\d.\-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

type FolderStats = {
  count: number;
  totalAmount: number;
  totalTax: number;
  avgAmount: number;
  verifiedCount: number;
  reimbursedCount: number;
  byCategory: { category: InvoiceCategory; label: string; count: number; amount: number; taxAmount: number }[];
};

function computeFolderStats(invoices: ArchivedInvoice[]): FolderStats {
  const count = invoices.length;
  const totalAmount = invoices.reduce((s, inv) => s + toFinite(inv.totalAmount), 0);
  const totalTax = invoices.reduce((s, inv) => s + toFinite(inv.taxAmount), 0);
  const avgAmount = count > 0 ? totalAmount / count : 0;
  const verifiedCount = invoices.filter((inv) => inv.isVerified).length;
  const reimbursedCount = invoices.filter((inv) => inv.isReimbursed).length;

  const catMap: Record<string, { count: number; amount: number; taxAmount: number }> = {};
  invoices.forEach((inv) => {
    const cat = inv.category || "other";
    if (!catMap[cat]) catMap[cat] = { count: 0, amount: 0, taxAmount: 0 };
    catMap[cat].count++;
    catMap[cat].amount += toFinite(inv.totalAmount);
    catMap[cat].taxAmount += toFinite(inv.taxAmount);
  });

  const byCategory = Object.entries(catMap)
    .map(([category, data]) => ({
      category: category as InvoiceCategory,
      label: CATEGORY_LABELS[category as InvoiceCategory] || category,
      ...data,
    }))
    .sort((a, b) => b.amount - a.amount || b.count - a.count);

  return { count, totalAmount, totalTax, avgAmount, verifiedCount, reimbursedCount, byCategory };
}

const BAR_COLORS = [
  "var(--primary)",
  "#34d399",
  "#fbbf24",
  "#f472b6",
  "#a78bfa",
  "#fb923c",
  "#38bdf8",
  "#f87171",
  "#4ade80",
  "#c084fc",
  "#94a3b8",
];

type FolderStatsDialogProps = {
  folder: InvoiceFolder;
  invoices: ArchivedInvoice[];
  onClose: () => void;
};

export function FolderStatsDialog({ folder, invoices, onClose }: FolderStatsDialogProps) {
  const stats = useMemo(() => computeFolderStats(invoices), [invoices]);
  const verifiedPct = stats.count > 0 ? (stats.verifiedCount / stats.count) * 100 : 0;
  const reimbursedPct = stats.count > 0 ? (stats.reimbursedCount / stats.count) * 100 : 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="dialogOverlay" onClick={onClose}>
      <div
        className="dialog"
        style={{ maxWidth: "580px", width: "92vw", borderRadius: "14px", overflow: "hidden" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: "20px 24px 16px",
            background: "linear-gradient(135deg, rgba(106,166,255,0.12) 0%, transparent 60%)",
            borderBottom: "1px solid var(--line)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              width: "32px", height: "32px", borderRadius: "8px",
              background: folder.color || "var(--primary)", opacity: 0.85,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontSize: "15px", fontWeight: 700,
            }}>
              {folder.name.charAt(0)}
            </div>
            <div>
              <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--text)" }}>{folder.name}</div>
              <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "1px" }}>
                共 {stats.count} 张发票 · {stats.byCategory.length} 种类型
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--muted)", fontSize: "20px", lineHeight: 1,
              padding: "4px 8px", borderRadius: "6px",
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: "20px 24px", maxHeight: "65vh", overflow: "auto" }}>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "20px" }}>
            <MetricTile
              label="总金额"
              value={`¥${stats.totalAmount.toFixed(2)}`}
              accent="var(--primary)"
              accentBg="rgba(106,166,255,0.08)"
              accentBorder="rgba(106,166,255,0.22)"
              large
            />
            <MetricTile
              label="总税额"
              value={`¥${stats.totalTax.toFixed(2)}`}
              accent="#34d399"
              accentBg="rgba(52,211,153,0.08)"
              accentBorder="rgba(52,211,153,0.22)"
              large
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px", marginBottom: "24px" }}>
            <MetricTile label="发票数" value={`${stats.count}`} suffix="张" />
            <MetricTile label="均价" value={`¥${stats.avgAmount.toFixed(2)}`} />
            <MetricTile label="验真率" value={`${verifiedPct.toFixed(0)}%`} sub={`${stats.verifiedCount}/${stats.count}`} accent="#34d399" accentBg="rgba(52,211,153,0.08)" accentBorder="rgba(52,211,153,0.22)" />
            <MetricTile label="报销率" value={`${reimbursedPct.toFixed(0)}%`} sub={`${stats.reimbursedCount}/${stats.count}`} accent="#fbbf24" accentBg="rgba(251,191,36,0.08)" accentBorder="rgba(251,191,36,0.22)" />
          </div>

          {stats.byCategory.length > 0 && (
            <>
              <div style={{
                fontSize: "12px", fontWeight: 600, color: "var(--muted)",
                marginBottom: "12px", letterSpacing: "0.5px",
                textTransform: "uppercase",
              }}>
                类型分布
              </div>

              <div style={{ display: "flex", height: "6px", borderRadius: "3px", overflow: "hidden", marginBottom: "16px", background: "var(--bar-track)" }}>
                {stats.byCategory.map(({ category, amount }, i) => {
                  const pct = stats.totalAmount > 0 ? (amount / stats.totalAmount) * 100 : 0;
                  return (
                    <div
                      key={category}
                      style={{
                        width: `${pct}%`,
                        background: BAR_COLORS[i % BAR_COLORS.length],
                        transition: "width 0.4s ease",
                      }}
                    />
                  );
                })}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {stats.byCategory.map(({ category, label, count, amount, taxAmount }, i) => {
                  const percent = stats.totalAmount > 0 ? (amount / stats.totalAmount) * 100 : 0;
                  const maxAmt = stats.byCategory[0]?.amount || 1;
                  const barWidth = (amount / maxAmt) * 100;
                  const color = BAR_COLORS[i % BAR_COLORS.length];
                  return (
                    <div
                      key={category}
                      style={{
                        padding: "10px 14px",
                        borderRadius: "8px",
                        background: "var(--panel)",
                        border: "1px solid var(--line)",
                        transition: "background 0.15s",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{
                            width: "8px", height: "8px", borderRadius: "50%",
                            background: color, display: "inline-block", flexShrink: 0,
                          }} />
                          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>{label}</span>
                          <span style={{
                            fontSize: "11px", color: "var(--muted)",
                            background: "var(--bar-track)", borderRadius: "4px",
                            padding: "1px 6px",
                          }}>
                            {count}张
                          </span>
                        </div>
                        <span style={{ fontSize: "13px", fontWeight: 700, color: color }}>{percent.toFixed(1)}%</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <div style={{ flex: 1, height: "4px", borderRadius: "2px", background: "var(--bar-track)", overflow: "hidden" }}>
                          <div style={{
                            width: `${Math.max(barWidth, 2)}%`,
                            height: "100%",
                            background: `linear-gradient(90deg, ${color}, ${color}88)`,
                            borderRadius: "2px",
                            transition: "width 0.4s ease",
                          }} />
                        </div>
                        <div style={{ display: "flex", gap: "12px", flexShrink: 0 }}>
                          <span style={{ fontSize: "12px", color: "var(--text)", fontWeight: 600, minWidth: "70px", textAlign: "right" }}>
                            ¥{amount.toFixed(2)}
                          </span>
                          <span style={{ fontSize: "11px", color: "var(--muted)", minWidth: "60px", textAlign: "right" }}>
                            税 ¥{taxAmount.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {stats.count === 0 && (
            <div style={{
              textAlign: "center", color: "var(--muted)", padding: "48px 0", fontSize: "13px",
            }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.3, marginBottom: "12px" }}>
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
              <div>该分类下暂无发票</div>
            </div>
          )}
        </div>

        <div style={{
          padding: "12px 24px 16px",
          display: "flex", justifyContent: "flex-end",
          borderTop: "1px solid var(--line)",
        }}>
          <button
            type="button"
            className="primary"
            onClick={onClose}
            style={{ borderRadius: "8px", padding: "6px 20px" }}
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

function MetricTile({
  label, value, suffix, sub, accent, accentBg, accentBorder, large,
}: {
  label: string;
  value: string;
  suffix?: string;
  sub?: string;
  accent?: string;
  accentBg?: string;
  accentBorder?: string;
  large?: boolean;
}) {
  const bg = accentBg
    ? `linear-gradient(135deg, ${accentBg} 0%, transparent 70%)`
    : "var(--panel)";
  const border = accentBorder || "var(--line)";

  return (
    <div style={{
      borderRadius: "10px",
      padding: large ? "14px 16px" : "10px 12px",
      background: bg,
      border: `1px solid ${border}`,
      transition: "border-color 0.15s",
    }}>
      <div style={{ fontSize: "11px", color: "var(--muted)", marginBottom: large ? "6px" : "3px" }}>{label}</div>
      <div style={{
        fontSize: large ? "22px" : "16px",
        fontWeight: 700,
        color: accent || "var(--text)",
        lineHeight: 1.2,
      }}>
        {value}
        {suffix && <span style={{ fontSize: "11px", marginLeft: "2px", fontWeight: 500, color: "var(--muted)" }}>{suffix}</span>}
      </div>
      {sub && <div style={{ fontSize: "10px", color: "var(--muted)", marginTop: "2px" }}>{sub}</div>}
    </div>
  );
}
