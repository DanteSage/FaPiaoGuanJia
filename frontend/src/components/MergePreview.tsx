import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { PreviewConfig, InvoiceFileItem } from "../types";
import { IconButton } from "./IconButton";
import { Icon, icons } from "./Icons";
import { calcMergePages, calcLayoutGrid } from "../utils/layoutUtils";
import { useImageCache } from "../hooks/useImageCache";

export { calcMergePages };

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function useSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      setSize({ w: r.width, h: r.height });
    }

    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setSize({ w: rect.width, h: rect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const setRef = useCallback((el: T | null) => {
    ref.current = el;
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        setSize({ w: r.width, h: r.height });
      }
    }
  }, []);

  return { ref: setRef, size };
}

type CellImage = {
  fileId: string;
  dataUrl: string;
  naturalW: number;
  naturalH: number;
};

export function MergePreview({
  files,
  previewConfig,
  currentPage,
  onPageChange,
  exporting,
  onVisibleCountChange,
  cellRotations,
  cellScales,
  onCellRotationsChange,
  onCellScalesChange
}: {
  files: InvoiceFileItem[];
  previewConfig: PreviewConfig;
  currentPage: number;
  onPageChange: (page: number) => void;
  exporting?: boolean;
  onVisibleCountChange?: (count: number) => void;
  cellRotations: Record<number, number>;
  cellScales: Record<number, number>;
  onCellRotationsChange: (rotations: Record<number, number>) => void;
  onCellScalesChange: (scales: Record<number, number>) => void;
}) {
  const { ref: containerRef, size } = useSize<HTMLDivElement>();
  const [cellImagesMap, setCellImagesMap] = useState<Map<string, CellImage>>(new Map());
  const imageCache = useImageCache();
  const [viewScale, setViewScale] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [selectedCell, setSelectedCell] = useState<number | null>(null);

  const [focusedPageIndex, setFocusedPageIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ on: boolean; sx: number; sy: number; px: number; py: number }>({
    on: false,
    sx: 0,
    sy: 0,
    px: 0,
    py: 0
  });

  const layout = useMemo(() => {
    const isLandscape = previewConfig.paper.orientation === "landscape";
    const { cols, rows } = calcLayoutGrid(
      previewConfig.layout.nUp,
      isLandscape,
      previewConfig.layout.grid
    );
    return { cols, rows, total: cols * rows };
  }, [previewConfig.layout.grid, previewConfig.layout.nUp, previewConfig.paper.orientation]);

  const pagination = useMemo(() => {
    const perPage = layout.total;
    const totalPages = Math.ceil(files.length / perPage);
    return { perPage, totalPages };
  }, [layout.total, files.length]);

  useEffect(() => {
    if (currentPage >= pagination.totalPages && pagination.totalPages > 0) {
      onPageChange(pagination.totalPages - 1);
    }
  }, [currentPage, pagination.totalPages, onPageChange]);

  const paperMm = useMemo(() => {
    const baseW = previewConfig.paper.widthMm;
    const baseH = previewConfig.paper.heightMm;
    const isLandscape = previewConfig.paper.orientation === "landscape";
    const w = isLandscape ? baseH : baseW;
    const h = isLandscape ? baseW : baseH;
    return { w: Math.max(1, w), h: Math.max(1, h) };
  }, [previewConfig.paper.heightMm, previewConfig.paper.orientation, previewConfig.paper.widthMm]);

  const visiblePaperCount = 2;

  const displayPaperCount = focusedPageIndex !== null ? 1 : visiblePaperCount;

  useEffect(() => {
    onVisibleCountChange?.(displayPaperCount);
  }, [displayPaperCount, onVisibleCountChange]);

  const paperPx = useMemo(() => {
    const vw = size.w;
    const vh = size.h;
    if (vw <= 0 || vh <= 0) return { w: 0, h: 0 };
    const padding = 18;
    const sidebarWidth = 62;
    const minGap = 16;
    const pageIndicatorHeight = 24;

    const maxH = Math.max(0, vh - padding * 2 - pageIndicatorHeight);
    const aspect = paperMm.w / paperMm.h;
    let h = maxH;
    let w = h * aspect;

    const availableW = vw - sidebarWidth - padding * 2;
    const totalPapersW = w * displayPaperCount + minGap * (displayPaperCount - 1);

    if (totalPapersW > availableW) {

      w = (availableW - minGap * (displayPaperCount - 1)) / displayPaperCount;
      h = w / aspect;
    }

    return { w: Math.floor(w), h: Math.floor(h) };
  }, [paperMm.h, paperMm.w, size.h, size.w, displayPaperCount]);

  const paperGap = useMemo(() => {
    if (paperPx.w <= 0 || displayPaperCount <= 1) return 16;
    const padding = 18;
    const sidebarWidth = 62;
    const availableW = size.w - sidebarWidth - padding * 2;
    const totalPapersW = paperPx.w * displayPaperCount;
    const remainingSpace = availableW - totalPapersW;

    return clamp(remainingSpace / (displayPaperCount - 1 || 1), 16, 80);
  }, [paperPx.w, size.w, displayPaperCount]);

  const marginPx = useMemo(() => {
    const m = previewConfig.paper.marginMm;
    if (!paperPx.w || !paperPx.h) return { top: 0, right: 0, bottom: 0, left: 0 };
    const left = (paperPx.w * clamp(m.left, 0, 200)) / paperMm.w;
    const right = (paperPx.w * clamp(m.right, 0, 200)) / paperMm.w;
    const top = (paperPx.h * clamp(m.top, 0, 200)) / paperMm.h;
    const bottom = (paperPx.h * clamp(m.bottom, 0, 200)) / paperMm.h;
    return { top, right, bottom, left };
  }, [previewConfig.paper.marginMm, paperMm.h, paperMm.w, paperPx.h, paperPx.w]);

  const inner = useMemo(() => {
    const w = Math.max(0, paperPx.w - marginPx.left - marginPx.right);
    const h = Math.max(0, paperPx.h - marginPx.top - marginPx.bottom);
    return { w, h };
  }, [marginPx, paperPx]);

  const cellSize = useMemo(() => {
    return {
      w: inner.w / layout.cols,
      h: inner.h / layout.rows
    };
  }, [inner, layout]);

  const visiblePagesFiles = useMemo(() => {

    if (focusedPageIndex !== null) {
      const pageIdx = currentPage;
      const start = pageIdx * pagination.perPage;
      return [{
        pageIndex: pageIdx,
        files: files.slice(start, start + pagination.perPage)
      }];
    }

    const startPage = currentPage;
    const endPage = Math.min(currentPage + visiblePaperCount, pagination.totalPages);
    const result: { pageIndex: number; files: InvoiceFileItem[] }[] = [];
    for (let p = startPage; p < endPage; p++) {
      const start = p * pagination.perPage;
      result.push({
        pageIndex: p,
        files: files.slice(start, start + pagination.perPage)
      });
    }
    return result;
  }, [currentPage, visiblePaperCount, pagination.totalPages, pagination.perPage, files, focusedPageIndex]);

  const { loadImage } = imageCache;

  useEffect(() => {
    let cancelled = false;
    const allFilesToLoad = visiblePagesFiles.flatMap(p => p.files);

    if (allFilesToLoad.length === 0) {
      return;
    }

    allFilesToLoad.forEach((file) => {
      loadImage(file.id, file.path, file.type)
        .then((cached) => {
          if (cancelled || !cached) return;
          setCellImagesMap((prev) => {
            const existing = prev.get(file.id);
            if (existing && existing.dataUrl === cached.dataUrl) {
              return prev;
            }
            const next = new Map(prev);
            next.set(file.id, {
              fileId: file.id,
              dataUrl: cached.dataUrl,
              naturalW: cached.naturalW,
              naturalH: cached.naturalH
            });
            return next;
          });
        })
        .catch((error) => {
          console.warn("merge preview preload failed", error);
        });
    });

    return () => {
      cancelled = true;
    };
  }, [visiblePagesFiles, loadImage]);

  useEffect(() => {
    if (!exporting) return;
    setSelectedCell(null);
    setViewScale(1);
    setPan({ x: 0, y: 0 });
  }, [exporting]);

  const pagesCells = useMemo(() => {
    return visiblePagesFiles.map((pageData) => {
      const cells: Array<{
        idx: number;
        globalIdx: number;
        x: number;
        y: number;
        w: number;
        h: number;
        image?: CellImage;
        file?: InvoiceFileItem;
      }> = [];

      for (let r = 0; r < layout.rows; r++) {
        for (let c = 0; c < layout.cols; c++) {
          const idx = r * layout.cols + c;
          const globalIdx = pageData.pageIndex * layout.total + idx;
          const x = marginPx.left + c * cellSize.w;
          const y = marginPx.top + r * cellSize.h;
          const file = idx < pageData.files.length ? pageData.files[idx] : undefined;
          const image = file ? cellImagesMap.get(file.id) : undefined;
          cells.push({
            idx,
            globalIdx,
            x,
            y,
            w: cellSize.w,
            h: cellSize.h,
            image,
            file
          });
        }
      }
      return { pageIndex: pageData.pageIndex, cells };
    });
  }, [visiblePagesFiles, layout, marginPx, cellSize, cellImagesMap]);

  const displayedPagesCells = useMemo(() => {
    return pagesCells.map((p, i) => ({ ...p, localIndex: i }));
  }, [pagesCells]);

  const cutLines = useMemo(() => {
    if (!previewConfig.splitLine.enabled) return [];
    const lines: Array<{ axis: "h" | "v"; x: number; y: number; len: number }> = [];
    for (let c = 1; c < layout.cols; c++) {
      const x = marginPx.left + (inner.w * c) / layout.cols;
      lines.push({ axis: "v", x, y: marginPx.top, len: inner.h });
    }
    for (let r = 1; r < layout.rows; r++) {
      const y = marginPx.top + (inner.h * r) / layout.rows;
      lines.push({ axis: "h", x: marginPx.left, y, len: inner.w });
    }
    return lines;
  }, [previewConfig.splitLine.enabled, layout, marginPx, inner]);

  const mmToPx = useMemo(() => (paperMm.w > 0 ? paperPx.w / paperMm.w : 0), [paperMm.w, paperPx.w]);

  const punchHoles = useMemo(() => {
    if (!previewConfig.punchHoles.enabled || mmToPx <= 0) return [];
    const holes: Array<{ x: number; y: number; size: number }> = [];
    const count = previewConfig.punchHoles.count;
    const pos = previewConfig.punchHoles.position;
    const offset = 8 * mmToPx;
    const size = 6 * mmToPx;

    if (pos === "left") {
      const spacing = paperPx.h / (count + 1);
      for (let i = 1; i <= count; i++) {
        holes.push({ x: offset, y: spacing * i, size });
      }
    } else {
      const spacing = paperPx.w / (count + 1);
      for (let i = 1; i <= count; i++) {
        holes.push({ x: spacing * i, y: offset, size });
      }
    }
    return holes;
  }, [previewConfig.punchHoles, paperPx, mmToPx]);

  const bindingLine = useMemo(() => {
    if (!previewConfig.bindingLine.enabled || mmToPx <= 0) return null;
    const pos = previewConfig.bindingLine.position;
    const offset = 14 * mmToPx;
    if (pos === "left") {
      return { axis: "v" as const, x: offset, y: 0, len: paperPx.h };
    } else {
      return { axis: "h" as const, x: 0, y: offset, len: paperPx.w };
    }
  }, [previewConfig.bindingLine, paperPx, mmToPx]);

  function zoomIn() {
    if (focusedPageIndex === null) return;
    setViewScale((s) => Math.min(3, Math.round((s + 0.25) * 100) / 100));
  }

  function zoomOut() {
    if (focusedPageIndex === null) return;
    setViewScale((s) => {
      const newScale = Math.max(0.5, Math.round((s - 0.25) * 100) / 100);
      if (newScale <= 1) setPan({ x: 0, y: 0 });
      return newScale;
    });
  }

  function exitFocus() {
    setFocusedPageIndex(null);
    setSelectedCell(null);
    setViewScale(1);
    setPan({ x: 0, y: 0 });
  }

  function onWheel(e: React.WheelEvent) {
    if (focusedPageIndex === null) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setViewScale((s) => {
      const newScale = Math.round(clamp(s + delta, 0.5, 3) * 100) / 100;
      if (newScale <= 1) setPan({ x: 0, y: 0 });
      return newScale;
    });
  }

  function onPaperClick(pageIndex: number) {
    if (focusedPageIndex === null) {

      onPageChange(pageIndex);
      setFocusedPageIndex(pageIndex);
      setViewScale(1);
      setPan({ x: 0, y: 0 });
    }
  }

  function onPaperDoubleClick() {
    if (focusedPageIndex === null) return;
    if (viewScale > 1) {
      setViewScale(1);
      setPan({ x: 0, y: 0 });
    } else {
      setViewScale(1.5);
    }
  }

  function rotateCellLeft() {
    if (selectedCell === null) return;
    onCellRotationsChange({
      ...cellRotations,
      [selectedCell]: ((cellRotations[selectedCell] || 0) + 270) % 360
    });
  }

  function rotateCellRight() {
    if (selectedCell === null) return;
    onCellRotationsChange({
      ...cellRotations,
      [selectedCell]: ((cellRotations[selectedCell] || 0) + 90) % 360
    });
  }

  function zoomCellIn() {
    if (selectedCell === null) return;
    onCellScalesChange({
      ...cellScales,
      [selectedCell]: Math.min(2, (cellScales[selectedCell] || 1) + 0.1)
    });
  }

  function zoomCellOut() {
    if (selectedCell === null) return;
    onCellScalesChange({
      ...cellScales,
      [selectedCell]: Math.max(0.5, (cellScales[selectedCell] || 1) - 0.1)
    });
  }

  function selectCell(globalIdx: number, e: React.MouseEvent) {
    e.stopPropagation();
    setSelectedCell(selectedCell === globalIdx ? null : globalIdx);
  }

  function onMouseDown(e: React.MouseEvent) {

    if (focusedPageIndex === null) return;
    if (viewScale <= 1) return;
    if (e.button !== 0) return;
    e.preventDefault();
    setIsDragging(true);
    dragRef.current = { on: true, sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y };
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!dragRef.current.on) return;
    const dx = e.clientX - dragRef.current.sx;
    const dy = e.clientY - dragRef.current.sy;
    setPan({ x: dragRef.current.px + dx, y: dragRef.current.py + dy });
  }

  function endDrag() {
    dragRef.current.on = false;
    setIsDragging(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, height: "100%" }}>
      <div className="previewStage">
        <div
          ref={containerRef}
          className="mergePreviewHost"
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
          onWheel={onWheel}
          style={{ gap: paperGap }}
        >
      {paperPx.w > 0 && paperPx.h > 0 ? (
        displayedPagesCells.map((pageData) => (
          <div
            key={pageData.pageIndex}
            className={`mergePreviewPaper ${focusedPageIndex === null ? "mergePreviewPaperClickable" : ""}`}
            onClick={() => onPaperClick(pageData.pageIndex)}
            onDoubleClick={onPaperDoubleClick}
            style={{
              width: paperPx.w,
              height: paperPx.h,
              transform: focusedPageIndex !== null ? `translate(${pan.x}px, ${pan.y}px) scale(${viewScale})` : undefined,
              transformOrigin: "center center",
              cursor: focusedPageIndex !== null ? (isDragging ? "grabbing" : viewScale > 1 ? "grab" : "default") : "pointer",
              flexShrink: 0
            }}
          >

            <div className="pageIndicator" style={{ position: "absolute", top: -20, left: 0, right: 0 }}>
              第 {pageData.pageIndex + 1} 页 {focusedPageIndex !== null ? "(聚焦中)" : ""}
            </div>

            {previewConfig.layout.showMargins ? (
              <div
                className="paperMargins"
                style={{
                  top: marginPx.top,
                  right: marginPx.right,
                  bottom: marginPx.bottom,
                  left: marginPx.left
                }}
              />
            ) : null}

            {pageData.cells.map((cell) => (
              <div
                key={cell.idx}
                className={`mergePreviewCell ${cell.image ? "mergePreviewCellClickable" : ""} ${selectedCell === cell.globalIdx ? "mergePreviewCellSelected" : ""}`}
                style={{
                  left: cell.x,
                  top: cell.y,
                  width: cell.w,
                  height: cell.h
                }}
                onClick={(e) => cell.image && selectCell(cell.globalIdx, e)}
              >
                {cell.image ? (
                  <img
                    src={cell.image.dataUrl}
                    alt=""
                    className="mergePreviewImg"
                    style={{
                      maxWidth: "100%",
                      maxHeight: "100%",
                      objectFit: "contain",
                      transform: `rotate(${cellRotations[cell.globalIdx] || 0}deg) scale(${cellScales[cell.globalIdx] || 1})`,
                      transition: "transform 0.2s ease"
                    }}
                  />
                ) : (
                  <div className="mergePreviewEmpty">
                    {cell.file ? `加载中... (${cell.file.type.toUpperCase()})` : ""}
                  </div>
                )}
              </div>
            ))}

            {cutLines.map((ln, idx) =>
              ln.axis === "v" ? (
                <div
                  key={idx}
                  className="paperNupLine paperNupLineV"
                  style={{
                    left: ln.x,
                    top: ln.y,
                    height: ln.len,
                    borderLeftStyle: previewConfig.splitLine.style
                  }}
                />
              ) : (
                <div
                  key={idx}
                  className="paperNupLine paperNupLineH"
                  style={{
                    left: ln.x,
                    top: ln.y,
                    width: ln.len,
                    borderTopStyle: previewConfig.splitLine.style
                  }}
                />
              )
            )}

            {punchHoles.map((hole, idx) => (
              <div
                key={`hole-${idx}`}
                className="punchHole"
                style={{
                  left: hole.x,
                  top: hole.y,
                  width: hole.size,
                  height: hole.size
                }}
              />
            ))}

            {bindingLine ? (
              bindingLine.axis === "v" ? (
                <div
                  className="bindingLine bindingLineV"
                  style={{
                    left: bindingLine.x,
                    top: bindingLine.y,
                    height: bindingLine.len,
                    borderLeftStyle: previewConfig.bindingLine.style
                  }}
                />
              ) : (
                <div
                  className="bindingLine bindingLineH"
                  style={{
                    left: bindingLine.x,
                    top: bindingLine.y,
                    width: bindingLine.len,
                    borderTopStyle: previewConfig.bindingLine.style
                  }}
                />
              )
            ) : null}
          </div>
        ))
      ) : null}

        </div>

        <div className="previewSideBar">
          <IconButton title="缩小视图" label="缩小" onClick={zoomOut} disabled={focusedPageIndex === null || viewScale <= 0.5}>
            <Icon d={icons.zoomOut} />
          </IconButton>
          <IconButton title="放大视图" label="放大" onClick={zoomIn} disabled={focusedPageIndex === null || viewScale >= 3}>
            <Icon d={icons.zoomIn} />
          </IconButton>
          <IconButton title={focusedPageIndex !== null ? "重置并返回所有纸张" : "重置视图"} label="重置" onClick={exitFocus}>
            <Icon d={icons.reset} />
          </IconButton>
          <div style={{ height: 1, background: "rgba(255,255,255,0.1)", margin: "4px 0" }} />
          <IconButton title="左转选中" label="左转" onClick={rotateCellLeft} disabled={selectedCell === null}>
            <Icon d={icons.rotateL} />
          </IconButton>
          <IconButton title="右转选中" label="右转" onClick={rotateCellRight} disabled={selectedCell === null}>
            <Icon d={icons.rotateR} />
          </IconButton>
          <IconButton title="放大选中" label="放大" onClick={zoomCellIn} disabled={selectedCell === null}>
            <Icon d={icons.zoomIn} />
          </IconButton>
          <IconButton title="缩小选中" label="缩小" onClick={zoomCellOut} disabled={selectedCell === null}>
            <Icon d={icons.zoomOut} />
          </IconButton>
        </div>
      </div>
    </div>
  );
}
