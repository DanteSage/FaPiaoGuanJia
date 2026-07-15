import { useState, useMemo, useCallback } from "react";
import type { Reimbursement, ReimbursementStatus, ReimbursementType, ReimbursementFolder } from "../../types/reimbursement";
import {
  REIMB_FIELDS,
  STATUS_LABELS,
  REIMB_TYPE_LABELS,
  getReimbValue,
  type ReimbFieldKey,
} from "./exportTypes";
import { toCsv, downloadCsv } from "./csvUtils";
import "../../archive.css";

type Props = {
  reimbursements: Reimbursement[];
  folders: ReimbursementFolder[];
  showToast: (msg: string, type?: "info" | "success" | "error" | "warning") => void;
};

const ALL_STATUSES = Object.entries(STATUS_LABELS) as [ReimbursementStatus, string][];
const ALL_TYPES = Object.entries(REIMB_TYPE_LABELS) as [ReimbursementType, string][];

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

export function ReimbExport({ reimbursements, folders, showToast }: Props) {

  const [fields, setFields] = useState<Set<ReimbFieldKey>>(
    () => new Set(REIMB_FIELDS.filter((f) => f.defaultOn).map((f) => f.key))
  );

  const [filterStatus, setFilterStatus] = useState<ReimbursementStatus | "">("");
  const [filterType, setFilterType] = useState<ReimbursementType | "">("");
  const [filterFolder, setFilterFolder] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [search, setSearch] = useState("");

  const applyPreset = useCallback((preset: DatePreset) => {
    setDatePreset(preset);
    const { start, end } = getDateRange(preset);
    setDateStart(start);
    setDateEnd(end);
  }, []);

  const handleDateStartChange = useCallback((v: string) => { setDateStart(v); setDatePreset("all"); }, []);
  const handleDateEndChange = useCallback((v: string) => { setDateEnd(v); setDatePreset("all"); }, []);

  const hasFilter = filterStatus !== "" || filterType !== "" || filterFolder !== "" || dateStart !== "" || dateEnd !== "" || search !== "";

  const resetFilters = useCallback(() => {
    setFilterStatus("");
    setFilterType("");
    setFilterFolder("");
    setDatePreset("all");
    setDateStart("");
    setDateEnd("");
    setSearch("");
  }, []);

  const toggleField = useCallback((key: ReimbFieldKey) => {
    setFields((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const selectAllFields = useCallback(() => setFields(new Set(REIMB_FIELDS.map((f) => f.key))), []);
  const deselectAllFields = useCallback(() => setFields(new Set()), []);

  const tsToDate = (ts: number | undefined): string => {
    if (!ts) return "";
    const d = new Date(ts);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  const filtered = useMemo(() => {
    let data = reimbursements;
    if (filterStatus) data = data.filter((r) => r.status === filterStatus);
    if (filterType) data = data.filter((r) => r.type === filterType);
    if (filterFolder === "__uncategorized__") {
      data = data.filter((r) => !r.folderId);
    } else if (filterFolder) {
      data = data.filter((r) => r.folderId === filterFolder);
    }
    if (dateStart) data = data.filter((r) => tsToDate(r.createdAt) >= dateStart);
    if (dateEnd) data = data.filter((r) => tsToDate(r.createdAt) <= dateEnd);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      data = data.filter((r) =>
        r.code.toLowerCase().includes(q) ||
        r.title.toLowerCase().includes(q) ||
        r.applicant.toLowerCase().includes(q) ||
        r.department.toLowerCase().includes(q) ||
        (r.notes ?? "").toLowerCase().includes(q)
      );
    }
    return data;
  }, [reimbursements, filterStatus, filterType, filterFolder, dateStart, dateEnd, search]);

  const activeFields = useMemo(
    () => REIMB_FIELDS.filter((f) => fields.has(f.key)),
    [fields]
  );

  const previewRows = useMemo(
    () => filtered.slice(0, 5).map((r) => activeFields.map((f) => getReimbValue(r, f.key))),
    [filtered, activeFields]
  );

  const handleExport = useCallback(() => {
    if (activeFields.length === 0) {
      showToast("请至少选择一个导出字段", "error");
      return;
    }
    if (filtered.length === 0) {
      showToast("没有符合条件的报销数据", "error");
      return;
    }
    const headers = activeFields.map((f) => f.label);
    const rows = filtered.map((r) => activeFields.map((f) => getReimbValue(r, f.key)));
    const csv = toCsv(headers, rows);
    const date = new Date().toISOString().slice(0, 10);
    downloadCsv(csv, `报销汇总_${date}.csv`);
    showToast(`已导出 ${filtered.length} 条报销数据`, "success");
  }, [activeFields, filtered, showToast]);

  return (
    <div className="settingsContent" style={{ maxWidth: "none" }}>

      <SectionLabel text="筛选条件" />
      <div className="invoiceCard exportFilterCard" style={{ cursor: "default", padding: "16px", marginBottom: "20px" }}>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
          <span style={{ fontSize: "11px", color: "var(--muted)", flexShrink: 0 }}>创建时间</span>
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
            placeholder="搜索编号/标题/申请人/部门/备注"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "220px", fontSize: "12px" }}
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
              {folders.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
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
          <FilterField label="报销状态">
            <select
              className="configSelect"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as ReimbursementStatus | "")}
              style={{ width: "76px" }}
            >
              <option value="">全部</option>
              {ALL_STATUSES.map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </FilterField>
          <FilterField label="报销类型">
            <select
              className="configSelect"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as ReimbursementType | "")}
              style={{ width: "76px" }}
            >
              <option value="">全部</option>
              {ALL_TYPES.map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </FilterField>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "12px", paddingTop: "10px", borderTop: "1px solid var(--line)" }}>
          <div style={{ fontSize: "12px", color: "var(--muted)" }}>
            共 <b style={{ color: "var(--text)" }}>{filtered.length}</b> / {reimbursements.length} 条记录
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
          {REIMB_FIELDS.map((f) => (
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

      <SectionLabel text={`数据预览（前 ${Math.min(5, filtered.length)} 条）`} />
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
