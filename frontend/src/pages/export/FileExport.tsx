import { useState, useMemo, useCallback } from "react";
import type { ArchivedInvoice, InvoiceCategory, InvoiceFolder } from "../../types";
import { CATEGORY_LABELS } from "./exportTypes";
import "../../archive.css";

type Props = {
  invoices: ArchivedInvoice[];
  folders: InvoiceFolder[];
  showToast: (msg: string, type?: "info" | "success" | "error" | "warning") => void;
};

const ALL_CATEGORIES = Object.entries(CATEGORY_LABELS) as [InvoiceCategory, string][];

const SYSTEM_FOLDER_IDS = new Set(["__all__", "__uncategorized__", "__recent__"]);

export function FileExport({ invoices, folders, showToast }: Props) {
  const [filterCategory, setFilterCategory] = useState<InvoiceCategory | "">("");
  const [filterFolder, setFilterFolder] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const userFolders = useMemo(() => folders.filter((f) => !SYSTEM_FOLDER_IDS.has(f.id)), [folders]);

  const withFiles = useMemo(() => invoices.filter((inv) => inv.filePath), [invoices]);

  const filtered = useMemo(() => {
    let data = withFiles;
    if (filterCategory) data = data.filter((inv) => inv.category === filterCategory);
    if (filterFolder === "__uncategorized__") {
      data = data.filter((inv) => !inv.folderId);
    } else if (filterFolder) {
      data = data.filter((inv) => inv.folderId === filterFolder);
    }
    return data;
  }, [withFiles, filterCategory, filterFolder]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filtered.map((inv) => inv.id)));
  }, [filtered]);

  const deselectAll = useCallback(() => setSelectedIds(new Set()), []);

  const handleExport = useCallback(async () => {
    const toExport = filtered.filter((inv) => selectedIds.has(inv.id));
    if (toExport.length === 0) {
      showToast("请选择要导出的文件", "error");
      return;
    }

    const savePath = await window.invoiceApi.chooseSavePath("发票文件导出");
    if (!savePath) return;

    const sep = savePath.includes("/") ? "/" : "\\";
    const dir = savePath.substring(0, savePath.lastIndexOf(sep));

    setExporting(true);
    setProgress({ done: 0, total: toExport.length });

    let success = 0;
    let failed = 0;

    for (let i = 0; i < toExport.length; i++) {
      const inv = toExport[i];
      try {
        const bytes = await window.invoiceApi.readFile(inv.filePath);
        const targetPath = `${dir}${sep}${inv.fileName}`;
        await window.invoiceApi.saveBytes(targetPath, bytes);
        success++;
      } catch {
        failed++;
      }
      setProgress({ done: i + 1, total: toExport.length });
    }

    setExporting(false);

    if (failed === 0) {
      showToast(`成功导出 ${success} 个文件`, "success");
    } else {
      showToast(`导出完成：${success} 成功，${failed} 失败`, "warning");
    }

    try {
      await window.invoiceApi.showItemInFolder(dir);
    } catch (error) {
      console.warn("open export directory failed", error);
    }
  }, [filtered, selectedIds, showToast]);

  return (
    <div className="settingsContent" style={{ maxWidth: "none" }}>

      <SectionLabel text="筛选与选择" />
      <div className="invoiceCard" style={{ cursor: "default", padding: "16px", marginBottom: "20px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center" }}>
          <FilterField label="所属文件夹">
            <select
              className="configSelect"
              value={filterFolder}
              onChange={(e) => { setFilterFolder(e.target.value); setSelectedIds(new Set()); }}
              style={{ width: "140px" }}
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
              onChange={(e) => { setFilterCategory(e.target.value as InvoiceCategory | ""); setSelectedIds(new Set()); }}
              style={{ width: "140px" }}
            >
              <option value="">全部</option>
              {ALL_CATEGORIES.map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </FilterField>
          <div style={{ display: "flex", gap: "8px", marginLeft: "auto" }}>
            <button style={{ fontSize: "11px", padding: "4px 12px" }} onClick={selectAll}>全选</button>
            <button style={{ fontSize: "11px", padding: "4px 12px" }} onClick={deselectAll}>全不选</button>
          </div>
        </div>
        <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "10px" }}>
          共 <b style={{ color: "var(--text)" }}>{filtered.length}</b> 个文件，
          已选 <b style={{ color: "var(--primary)" }}>{selectedIds.size}</b> 个
        </div>
      </div>

      <SectionLabel text="文件列表" />
      <div className="invoiceCard" style={{ cursor: "default", padding: "0", marginBottom: "20px", maxHeight: "360px", overflow: "auto" }}>
        {filtered.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "var(--muted)", fontSize: "13px" }}>暂无可导出的文件</div>
        ) : (
          <div>
            {filtered.map((inv) => (
              <label
                key={inv.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "8px 14px",
                  borderBottom: "1px solid var(--line)",
                  cursor: "pointer",
                  background: selectedIds.has(inv.id) ? "rgba(106,166,255,0.06)" : "transparent",
                  transition: "background 100ms ease",
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(inv.id)}
                  onChange={() => toggleSelect(inv.id)}
                  style={{ accentColor: "var(--primary)", width: "14px", height: "14px", flexShrink: 0 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "12px", color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {inv.fileName}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "1px" }}>
                    {CATEGORY_LABELS[inv.category]} · {inv.fileExt.toUpperCase()}
                    {inv.totalAmount != null && ` · ¥${inv.totalAmount}`}
                  </div>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      {exporting ? (
        <div className="invoiceCard" style={{ cursor: "default", padding: "16px" }}>
          <div style={{ fontSize: "13px", color: "var(--text)", marginBottom: "8px" }}>
            正在导出文件 {progress.done}/{progress.total}
          </div>
          <div style={{ height: "6px", background: "var(--bar-track)", borderRadius: "3px", overflow: "hidden" }}>
            <div
              style={{
                width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%`,
                height: "100%",
                background: "var(--primary)",
                transition: "width 200ms ease",
                borderRadius: "3px",
              }}
            />
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <button
            onClick={handleExport}
            disabled={selectedIds.size === 0}
            style={{
              padding: "8px 24px",
              fontSize: "13px",
              background: "var(--primary)",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              cursor: selectedIds.size === 0 ? "not-allowed" : "pointer",
              opacity: selectedIds.size === 0 ? 0.5 : 1,
            }}
          >
            导出文件（{selectedIds.size} 个）
          </button>
          <span style={{ fontSize: "12px", color: "var(--muted)" }}>选择保存位置后批量复制文件</span>
        </div>
      )}
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
