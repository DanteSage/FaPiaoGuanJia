import { useState, useMemo, useCallback } from "react";
import type { ArchivedInvoice, InvoiceCategory, InvoiceFolder } from "../../types";
import {
  INVOICE_FIELDS,
  CATEGORY_LABELS,
  getInvoiceValue,
  type InvoiceFieldKey,
} from "./exportTypes";
import { toCsv, downloadCsv } from "./csvUtils";
import "../../archive.css";

type Props = {
  invoices: ArchivedInvoice[];
  folders: InvoiceFolder[];
  showToast: (msg: string, type?: "info" | "success" | "error" | "warning") => void;
};

const ALL_CATEGORIES = Object.entries(CATEGORY_LABELS) as [InvoiceCategory, string][];

type DatePreset = "all" | "month" | "quarter" | "year";

function getDateRange(preset: DatePreset): { start: string; end: string } {
  if (preset === "all") return { start: "", end: "" };
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  const end = `${y}-${pad(m + 1)}-${pad(now.getDate())}`;
  if (preset === "month") return { start: `${y}-${pad(m + 1)}-01`, end };
  if (preset === "quarter") {
    const qStart = Math.floor(m / 3) * 3;
    return { start: `${y}-${pad(qStart + 1)}-01`, end };
  }
  return { start: `${y}-01-01`, end };
}

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "month", label: "本月" },
  { value: "quarter", label: "本季度" },
  { value: "year", label: "本年" },
];

const SYSTEM_FOLDER_IDS = new Set(["__all__", "__uncategorized__", "__recent__"]);

export function InvoiceExport({ invoices, folders, showToast }: Props) {

  const [fields, setFields] = useState<Set<InvoiceFieldKey>>(
    () => new Set(INVOICE_FIELDS.filter((f) => f.defaultOn).map((f) => f.key))
  );

  const [filterCategory, setFilterCategory] = useState<InvoiceCategory | "">("");
  const [filterFolder, setFilterFolder] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [search, setSearch] = useState("");
  const [filterVerified, setFilterVerified] = useState<"" | "yes" | "no">("");
  const [filterReimbursed, setFilterReimbursed] = useState<"" | "yes" | "no">("");

  const userFolders = useMemo(() => folders.filter((f) => !SYSTEM_FOLDER_IDS.has(f.id)), [folders]);

  const applyPreset = useCallback((preset: DatePreset) => {
    setDatePreset(preset);
    const { start, end } = getDateRange(preset);
    setDateStart(start);
    setDateEnd(end);
  }, []);

  const handleDateStartChange = useCallback((v: string) => { setDateStart(v); setDatePreset("all"); }, []);
  const handleDateEndChange = useCallback((v: string) => { setDateEnd(v); setDatePreset("all"); }, []);

  const hasFilter = filterCategory !== "" || filterFolder !== "" || dateStart !== "" || dateEnd !== "" || search !== "" || filterVerified !== "" || filterReimbursed !== "";

  const resetFilters = useCallback(() => {
    setFilterCategory("");
    setFilterFolder("");
    setDatePreset("all");
    setDateStart("");
    setDateEnd("");
    setSearch("");
    setFilterVerified("");
    setFilterReimbursed("");
  }, []);

  const toggleField = useCallback((key: InvoiceFieldKey) => {
    setFields((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const selectAllFields = useCallback(() => setFields(new Set(INVOICE_FIELDS.map((f) => f.key))), []);
  const deselectAllFields = useCallback(() => setFields(new Set()), []);

  const normalizeDateForCompare = (raw: string | undefined): string => {
    if (!raw) return "";
    const cn = raw.match(/(\d{4})\u5e74(\d{1,2})\u6708(\d{1,2})\u65e5/);
    if (cn) return `${cn[1]}-${cn[2].padStart(2, "0")}-${cn[3].padStart(2, "0")}`;
    const std = raw.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (std) return `${std[1]}-${std[2].padStart(2, "0")}-${std[3].padStart(2, "0")}`;
    return raw;
  };

  const filtered = useMemo(() => {
    let data = invoices;
    if (filterCategory) data = data.filter((inv) => inv.category === filterCategory);
    if (filterFolder === "__uncategorized__") {
      data = data.filter((inv) => !inv.folderId);
    } else if (filterFolder) {
      data = data.filter((inv) => inv.folderId === filterFolder);
    }
    if (dateStart) data = data.filter((inv) => normalizeDateForCompare(inv.invoiceDate) >= dateStart);
    if (dateEnd) data = data.filter((inv) => normalizeDateForCompare(inv.invoiceDate) <= dateEnd);
    if (filterVerified === "yes") data = data.filter((inv) => inv.isVerified);
    if (filterVerified === "no") data = data.filter((inv) => !inv.isVerified);
    if (filterReimbursed === "yes") data = data.filter((inv) => inv.isReimbursed);
    if (filterReimbursed === "no") data = data.filter((inv) => !inv.isReimbursed);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      data = data.filter((inv) =>
        (inv.sellerName ?? "").toLowerCase().includes(q) ||
        (inv.buyerName ?? "").toLowerCase().includes(q) ||
        (inv.invoiceNumber ?? "").includes(q) ||
        (inv.invoiceCode ?? "").includes(q) ||
        (inv.notes ?? "").toLowerCase().includes(q)
      );
    }
    return data;
  }, [invoices, filterCategory, filterFolder, dateStart, dateEnd, filterVerified, filterReimbursed, search]);

  const activeFields = useMemo(
    () => INVOICE_FIELDS.filter((f) => fields.has(f.key)),
    [fields]
  );

  const previewRows = useMemo(
    () => filtered.slice(0, 4).map((inv) => activeFields.map((f) => getInvoiceValue(inv, f.key))),
    [filtered, activeFields]
  );

  const handleExport = useCallback(() => {
    if (activeFields.length === 0) {
      showToast("请至少选择一个导出字段", "error");
      return;
    }
    if (filtered.length === 0) {
      showToast("没有符合条件的发票数据", "error");
      return;
    }
    const headers = activeFields.map((f) => f.label);
    const rows = filtered.map((inv) => activeFields.map((f) => getInvoiceValue(inv, f.key)));
    const csv = toCsv(headers, rows);
    const date = new Date().toISOString().slice(0, 10);
    downloadCsv(csv, `发票明细_${date}.csv`);
    showToast(`已导出 ${filtered.length} 条发票数据`, "success");
  }, [activeFields, filtered, showToast]);

  return (
    <div className="settingsContent" style={{ maxWidth: "none" }}>

      <SectionLabel text="筛选条件" />
      <div className="invoiceCard exportFilterCard" style={{ cursor: "default", padding: "16px", marginBottom: "20px" }}>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
          <span style={{ fontSize: "11px", color: "var(--muted)", flexShrink: 0 }}>时间范围</span>
          <div style={{ display: "flex", gap: "4px" }}>
            {DATE_PRESETS.map((p) => (
              <button
                key={p.value}
                className={`settingsChip ${datePreset === p.value && !dateStart && p.value === "all" ? "settingsChipActive" : datePreset === p.value && p.value !== "all" ? "settingsChipActive" : ""}`}
                style={{ padding: "4px 12px", fontSize: "11px" }}
                onClick={() => applyPreset(p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          <input
            className="configSelect"
            placeholder="搜索销方/购方/号码/备注"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "200px", fontSize: "12px" }}
          />
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "flex-end" }}>
          <FilterField label="所属文件夹">
            <select
              className="configSelect"
              value={filterFolder}
              onChange={(e) => setFilterFolder(e.target.value)}
              style={{ width: "100px" }}
            >
              <option value="">全部</option>
              <option value="__uncategorized__">未分类</option>
              {userFolders.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </FilterField>
          <FilterField label="发票类型">
            <select
              className="configSelect"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value as InvoiceCategory | "")}
              style={{ width: "110px" }}
            >
              <option value="">全部</option>
              {ALL_CATEGORIES.map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </FilterField>
          <FilterField label="开始日期">
            <input
              type="date"
              className="configSelect"
              value={dateStart}
              onChange={(e) => handleDateStartChange(e.target.value)}
              style={{ width: "128px" }}
            />
          </FilterField>
          <FilterField label="结束日期">
            <input
              type="date"
              className="configSelect"
              value={dateEnd}
              onChange={(e) => handleDateEndChange(e.target.value)}
              style={{ width: "128px" }}
            />
          </FilterField>
          <FilterField label="验真状态">
            <select
              className="configSelect"
              value={filterVerified}
              onChange={(e) => setFilterVerified(e.target.value as "" | "yes" | "no")}
              style={{ width: "76px" }}
            >
              <option value="">全部</option>
              <option value="yes">已验真</option>
              <option value="no">未验真</option>
            </select>
          </FilterField>
          <FilterField label="报销状态">
            <select
              className="configSelect"
              value={filterReimbursed}
              onChange={(e) => setFilterReimbursed(e.target.value as "" | "yes" | "no")}
              style={{ width: "76px" }}
            >
              <option value="">全部</option>
              <option value="yes">已报销</option>
              <option value="no">未报销</option>
            </select>
          </FilterField>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "12px", paddingTop: "10px", borderTop: "1px solid var(--line)" }}>
          <div style={{ fontSize: "12px", color: "var(--muted)" }}>
            共 <b style={{ color: "var(--text)" }}>{filtered.length}</b> / {invoices.length} 条记录
          </div>
          {hasFilter && (
            <button
              style={{ fontSize: "11px", padding: "3px 12px", color: "var(--danger)", borderColor: "rgba(199,34,34,0.3)" }}
              onClick={resetFilters}
            >
              重置筛选
            </button>
          )}
        </div>
      </div>

      <SectionLabel text="导出字段" />
      <div className="invoiceCard" style={{ cursor: "default", padding: "16px", marginBottom: "20px" }}>
        <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
          <button style={{ fontSize: "11px", padding: "3px 10px" }} onClick={selectAllFields}>全选</button>
          <button style={{ fontSize: "11px", padding: "3px 10px" }} onClick={deselectAllFields}>全不选</button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {INVOICE_FIELDS.map((f) => (
            <label
              key={f.key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "5px",
                fontSize: "12px",
                padding: "5px 10px",
                borderRadius: "8px",
                border: "1px solid var(--line)",
                background: fields.has(f.key) ? "rgba(106,166,255,0.1)" : "transparent",
                cursor: "pointer",
                color: fields.has(f.key) ? "var(--primary)" : "var(--muted)",
                transition: "all 150ms ease",
              }}
            >
              <input
                type="checkbox"
                checked={fields.has(f.key)}
                onChange={() => toggleField(f.key)}
                style={{ accentColor: "var(--primary)", width: "13px", height: "13px" }}
              />
              {f.label}
            </label>
          ))}
        </div>
      </div>

      <SectionLabel text={`数据预览（前 ${Math.min(4, filtered.length)} 条）`} />
      <div className="invoiceCard" style={{ cursor: "default", padding: "0", marginBottom: "20px", overflow: "auto" }}>
        {activeFields.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "var(--muted)", fontSize: "13px" }}>请选择导出字段</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <thead>
                <tr>
                  {activeFields.map((f) => (
                    <th
                      key={f.key}
                      style={{
                        padding: "10px 12px",
                        textAlign: "left",
                        borderBottom: "1px solid var(--line)",
                        color: "var(--muted)",
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {f.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={activeFields.length}
                      style={{ padding: "30px", textAlign: "center", color: "var(--muted)" }}
                    >
                      暂无数据
                    </td>
                  </tr>
                ) : (
                  previewRows.map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        <td
                          key={j}
                          style={{
                            padding: "8px 12px",
                            borderBottom: "1px solid var(--line)",
                            color: "var(--text)",
                            whiteSpace: "nowrap",
                            maxWidth: "200px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {cell || "—"}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
        <button
          onClick={handleExport}
          disabled={activeFields.length === 0 || filtered.length === 0}
          style={{
            padding: "8px 24px",
            fontSize: "13px",
            background: "var(--primary)",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            cursor: activeFields.length === 0 || filtered.length === 0 ? "not-allowed" : "pointer",
            opacity: activeFields.length === 0 || filtered.length === 0 ? 0.5 : 1,
          }}
        >
          导出 CSV（{filtered.length} 条）
        </button>
        <span style={{ fontSize: "12px", color: "var(--muted)" }}>文件将直接下载到默认位置</span>
      </div>
    </div>
  );
}

function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", marginBottom: "8px", letterSpacing: "0.5px" }}>
      {text}
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <span style={{ fontSize: "11px", color: "var(--muted)" }}>{label}</span>
      {children}
    </div>
  );
}
