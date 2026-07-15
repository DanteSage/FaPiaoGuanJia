import { useEffect, useMemo, useState, useCallback } from "react";
import type { InvoiceFileItem, OcrResult, PreviewConfig } from "../types";
import type { BusyState } from "../hooks/useAppState";
import { PdfPreview } from "../components/PdfPreview";
import { ImagePreview } from "../components/ImagePreview";
import { XmlPreview } from "../components/XmlPreview";
import { MergePreview } from "../components/MergePreview";
import { OcrFields } from "../components/OcrFields";
import { OcrText } from "../components/OcrText";
import { PreviewConfigPanel } from "../components/PreviewConfigPanel";
import { calcMergePages } from "../utils/layoutUtils";
import { useDebounce } from "../hooks/useDebounce";
import { inferCategory } from "../hooks/archiveUtils";

type WorkspacePageProps = {
  files: InvoiceFileItem[];
  activeId: string | null;
  ocr: Record<string, OcrResult>;
  busy: BusyState;
  canRun: boolean;
  previewConfig: PreviewConfig;
  cellRotations: Record<number, number>;
  cellScales: Record<number, number>;
  onSetActive: (id: string | null) => void;
  onSetFiles: (files: InvoiceFileItem[]) => void;
  onSetOcr: (id: string, result: OcrResult) => void;
  onSetPreviewConfig: (config: PreviewConfig) => void;
  onSetCellRotations: (rotations: Record<number, number>) => void;
  onSetCellScales: (scales: Record<number, number>) => void;
  onPickFiles: () => void;
  onDropFiles: (filePaths: string[]) => void;
  onRunOcrAll: () => void;
  onRetryOcrFile?: (fileId: string) => void;
  onClearAll: () => void;
  onRemoveFile: (fileId: string) => void;
  onResetPreviewConfig: () => void;
  onSaveToArchive?: (fileIds?: string[]) => void;
  onSyncOcrToArchive?: (file: InvoiceFileItem, ocr: OcrResult) => void;
  onPrint?: () => void;
  onExport?: () => void;
  canPrintExport?: boolean;
  showToast?: (message: string, type: "success" | "error" | "warning" | "info") => void;
};

export function WorkspacePage({
  files,
  activeId,
  ocr,
  busy,
  canRun,
  previewConfig,
  cellRotations,
  cellScales,
  onSetActive,
  onSetFiles,
  onSetOcr,
  onSetPreviewConfig,
  onSetCellRotations,
  onSetCellScales,
  onPickFiles,
  onDropFiles,
  onRunOcrAll,
  onRetryOcrFile,
  onClearAll,
  onRemoveFile,
  onResetPreviewConfig,
  onSaveToArchive,
  onSyncOcrToArchive,
  onPrint,
  onExport,
  canPrintExport = true,
  showToast: _showToast,
}: WorkspacePageProps) {
  const [query, setQuery] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"fields" | "text">("fields");
  const [compareQuery, setCompareQuery] = useState("");
  const [bottomTab, setBottomTab] = useState<"preview" | "ocr">("preview");
  const [mergeCurrentPage, setMergeCurrentPage] = useState(0);
  const [visiblePaperCount, setVisiblePaperCount] = useState(2);
  const [isDragOver, setIsDragOver] = useState(false);

  const active = useMemo(() => files.find((f) => f.id === activeId) ?? null, [files, activeId]);
  const activeOcr = active ? ocr[active.id] : undefined;
  const mergeTotalPages = useMemo(
    () => calcMergePages(files.length, previewConfig),
    [files.length, previewConfig]
  );

  const debouncedQuery = useDebounce(query, 200);

  const filteredFiles = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return files;
    return files.filter((f) => (f.name + " " + f.path).toLowerCase().includes(q));
  }, [files, debouncedQuery]);

  useEffect(() => {
    setCompareQuery("");
  }, [activeId]);

  const onDropReorder = useCallback(
    (targetId: string) => {
      if (!dragId || dragId === targetId) return;
      const from = files.findIndex((x) => x.id === dragId);
      const to = files.findIndex((x) => x.id === targetId);
      if (from < 0 || to < 0) return;
      const next = files.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      onSetFiles(next);
    },
    [dragId, files, onSetFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.dataTransfer.types.includes("Files")) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = e.dataTransfer.files;
    if (files.length === 0) return;

    const filePaths: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      const filePath = (file as File & { path?: string }).path;
      if (filePath) {
        filePaths.push(filePath);
      }
    }

    if (filePaths.length > 0) {
      onDropFiles(filePaths);
    }
  }, [onDropFiles]);

  return (
    <div className="workspace" data-testid="workspace-page">
      {            }
      <div
        className={`panel workspaceFilePanel ${isDragOver ? "panelDragOver" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >

          {isDragOver && (
            <div className="dropOverlay">
              <div className="dropOverlayContent">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <div>松开以添加文件</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>支持 PDF、OFD、图片、XML</div>
              </div>
            </div>
          )}
          <div className="panelHeader">
            <div className="panelHeaderLeft">
              <div className="panelTitle">文件</div>
              <span style={{ color: "rgba(255,255,255,0.62)", fontSize: 12 }}>{files.length}</span>
            </div>
            <div className="panelHeaderRight">
              <button onClick={onPickFiles} disabled={!canRun}>
                添加
              </button>
              <button onClick={onRunOcrAll} disabled={!canRun || files.length === 0}>
                识别
              </button>
              <button onClick={onClearAll} disabled={!canRun || files.length === 0} className="danger">
                清空
              </button>
              {onSaveToArchive && (
                <button
                  onClick={() => onSaveToArchive()}
                  disabled={!canRun || files.length === 0}
                  title="保存到发票管理"
                >
                  归档
                </button>
              )}
            </div>
          </div>
          <div className="searchBox">
            <input
              className="searchInput"
              placeholder="搜索文件名或路径 · 拖放文件到此处添加"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={!canRun && busy.kind !== "batchOcr"}
            />
          </div>
          <div className="fileList">
            {filteredFiles.length === 0 ? (
              <div className="placeholder">点击"添加"或拖放文件到此处导入</div>
            ) : (
              filteredFiles.map((f) => (
                <div
                  key={f.id}
                  className={`fileItem ${activeId === f.id ? "fileItemActive" : ""} ${
                    dragId === f.id ? "fileItemDragging" : ""
                  } ${dropId === f.id ? "fileItemDropTarget" : ""}`}
                  onClick={() => onSetActive(f.id)}
                  draggable
                  onDragStart={() => setDragId(f.id)}
                  onDragEnd={() => {
                    setDragId(null);
                    setDropId(null);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragId && dragId !== f.id) setDropId(f.id);
                  }}
                  onDragLeave={() => {
                    if (dropId === f.id) setDropId(null);
                  }}
                  onDrop={() => {
                    onDropReorder(f.id);
                    setDropId(null);
                  }}
                >
                  <div className="fileItemHeader">
                    <div className="fileName">{f.name}</div>
                    <div className="fileItemActions">
                      {onRetryOcrFile && (
                        <button
                          className="fileRetryBtn"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRetryOcrFile(f.id);
                          }}
                          disabled={!canRun}
                          title={ocr[f.id]?.text ? "重新识别" : "识别此文件"}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="23 4 23 10 17 10" />
                            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                          </svg>
                        </button>
                      )}
                      <button
                        className="fileDeleteBtn"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveFile(f.id);
                        }}
                        disabled={!canRun}
                        title="删除文件"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  <div className="fileMeta">
                    <span>{f.type.toUpperCase()}</span>
                    <span>·</span>
                    <span>{f.ext || "未知格式"}</span>
                    <span>·</span>
                    {ocr[f.id]?.text ? (
                      <span className="fileBadge fileBadgeOk">已识别</span>
                    ) : (
                      <span className="fileBadge fileBadgeIdle">未识别</span>
                    )}
                    <span>·</span>
                    <span className="fileMetaPath" title={f.path}>{f.path}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      <div className="panel previewPanel workspacePreviewPanel">
          <div className="panelHeader">
            <div className="panelHeaderLeft">
              <div className="panelTitle">预览</div>
              {previewConfig.layout.mergePreview ? (
                <span style={{ color: "rgba(255,255,255,0.62)", fontSize: 12 }}>合并预览</span>
              ) : active ? (
                <span style={{ color: "rgba(255,255,255,0.62)", fontSize: 12 }}>{active.type.toUpperCase()}</span>
              ) : null}
            </div>
            <div className="panelHeaderCenter">
              {previewConfig.layout.mergePreview && files.length > 0 ? (
                <div className="paginationControls">
                  <button
                    className="paginationBtn"
                    onClick={() => setMergeCurrentPage((p) => Math.max(0, p - visiblePaperCount))}
                    disabled={mergeCurrentPage <= 0}
                    title="上一组"
                  >
                    ‹
                  </button>
                  <span className="paginationText">
                    {mergeCurrentPage + 1}-{Math.min(mergeCurrentPage + visiblePaperCount, mergeTotalPages)} / {mergeTotalPages}
                  </span>
                  <button
                    className="paginationBtn"
                    onClick={() => setMergeCurrentPage((p) => Math.min(mergeTotalPages - visiblePaperCount, p + visiblePaperCount))}
                    disabled={mergeCurrentPage + visiblePaperCount >= mergeTotalPages}
                    title="下一组"
                  >
                    ›
                  </button>
                </div>
              ) : null}
            </div>
            <div className="panelHeaderRight panelHeaderActions">
              <button onClick={onPrint} disabled={!canPrintExport || files.length === 0}>
                打印
              </button>
              <button onClick={onExport} disabled={!canPrintExport || files.length === 0}>
                导出
              </button>
            </div>
          </div>
          <div className="previewBody">
            {previewConfig.layout.mergePreview && files.length > 0 ? (
              <MergePreview
                files={files}
                previewConfig={previewConfig}
                currentPage={mergeCurrentPage}
                onPageChange={setMergeCurrentPage}
                onVisibleCountChange={setVisiblePaperCount}
                cellRotations={cellRotations}
                cellScales={cellScales}
                onCellRotationsChange={onSetCellRotations}
                onCellScalesChange={onSetCellScales}
              />
            ) : !active ? (
              <div className="placeholder">从左侧选择文件开始。</div>
            ) : active.type === "pdf" || active.type === "ofd" ? (
              <PdfPreview filePath={active.path} previewConfig={previewConfig} />
            ) : active.type === "image" ? (
              <ImagePreview filePath={active.path} previewConfig={previewConfig} />
            ) : active.type === "xml" ? (
              <XmlPreview filePath={active.path} />
            ) : (
              <div className="placeholder">暂不支持该格式预览。</div>
            )}
          </div>
      </div>

      <div className="panel resultPanel workspaceBottom">
        <div className="panelHeader">
          <div className="panelHeaderLeft">
            <div className="panelTitle">{bottomTab === "preview" ? "预览配置" : "识别结果"}</div>
            {bottomTab === "ocr" && busy.kind === "ocr" ? (
              <span style={{ color: "rgba(255,255,255,0.62)", fontSize: 12 }}>识别中</span>
            ) : null}
            {bottomTab === "ocr" && busy.kind === "batchOcr" ? (
              <span style={{ color: "rgba(255,255,255,0.62)", fontSize: 12 }}>
                批量 {busy.done}/{busy.total}
              </span>
            ) : null}
            {busy.kind === "exporting" ? (
              <span style={{ color: "rgba(255,255,255,0.62)", fontSize: 12 }}>
                {busy.step} ({Math.round((busy.done / busy.total) * 100)}%)
              </span>
            ) : null}
            {busy.kind === "printing" ? (
              <span style={{ color: "rgba(255,255,255,0.62)", fontSize: 12 }}>
                {busy.step} ({Math.round((busy.done / busy.total) * 100)}%)
              </span>
            ) : null}
            {busy.kind === "merge" ? (
              <span style={{ color: "rgba(255,255,255,0.62)", fontSize: 12 }}>合并中</span>
            ) : null}
          </div>
          <div className="panelHeaderRight">
            <div className="toolbarGroup">
              <button
                className={`tabBtn ${bottomTab === "preview" ? "tabBtnActive" : ""}`}
                onClick={() => setBottomTab("preview")}
              >
                配置
              </button>
              <button
                className={`tabBtn ${bottomTab === "ocr" ? "tabBtnActive" : ""}`}
                onClick={() => setBottomTab("ocr")}
              >
                识别
              </button>
            </div>
          </div>
        </div>
        <div className="ocrBody">
          {bottomTab === "preview" ? (
            <PreviewConfigPanel
              value={previewConfig}
              onChange={onSetPreviewConfig}
              onResetRequest={onResetPreviewConfig}
            />
          ) : !active ? (
            <div className="placeholder">选择文件后点击"识别当前"。</div>
          ) : viewMode === "fields" ? (
            <OcrFields
              file={active}
              value={activeOcr}
              category={inferCategory(active.name, activeOcr?.fields, activeOcr?.text)}
              onChange={(res) => {
                onSetOcr(active.id, res);
                onSyncOcrToArchive?.(active, res);
              }}
              onCompare={(q) => {
                setCompareQuery(q);
                setViewMode("text");
              }}
            />
          ) : activeOcr?.text ? (
            <OcrText text={activeOcr.text} query={compareQuery} />
          ) : (
            <div className="placeholder">尚未识别该文件。</div>
          )}
        </div>
      </div>
    </div>
  );
}
