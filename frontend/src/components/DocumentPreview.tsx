import React, { useEffect, useRef, useState } from "react";
import { PREVIEW_RENDER_SCALE } from "../constants/renderScales";
import type { PreviewConfig } from "../types";
import { Icon, icons } from "./Icons";
import { PreviewOverlay } from "./PreviewOverlay";
import {
  getRenderedPreviewPage,
  loadRenderedPreviewPage,
  prefetchRenderedPreviewPages,
} from "../utils/renderedPreviewCache";
import {
  clampPreviewPage,
  getAdjacentPreviewPages,
  getDocumentKindLabel,
} from "../utils/documentPreview";

type DocumentPreviewProps = {
  filePath: string;
  previewConfig?: PreviewConfig;
  compact?: boolean;
};

const MIN_VIEW_SCALE = 0.5;
const MAX_VIEW_SCALE = 4;
const VIEW_SCALE_STEP = 0.25;

function stepViewScale(value: number, direction: "in" | "out"): number {
  const nextValue = direction === "in" ? value + VIEW_SCALE_STEP : value - VIEW_SCALE_STEP;
  const boundedValue = Math.max(MIN_VIEW_SCALE, Math.min(MAX_VIEW_SCALE, nextValue));
  return Math.round(boundedValue * 100) / 100;
}

export function DocumentPreview({ filePath, previewConfig, compact = false }: DocumentPreviewProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("loading");
  const [pageIndex, setPageIndex] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [viewScale, setViewScale] = useState(1);
  const [dataUrl, setDataUrl] = useState("");
  const [fit, setFit] = useState<"width" | "contain">("contain");
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [errorMessage, setErrorMessage] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const renderScale = PREVIEW_RENDER_SCALE;
  const kindLabel = getDocumentKindLabel(filePath);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ on: boolean; sx: number; sy: number; px: number; py: number }>({
    on: false,
    sx: 0,
    sy: 0,
    px: 0,
    py: 0,
  });

  const canPan = Boolean(dataUrl) && (viewScale > 1 || fit === "width");
  const canGoPrev = pageIndex > 1;
  const canGoNext = pageIndex < pageCount;

  useEffect(() => {
    setStatus("loading");
    setPageIndex(1);
    setPageCount(1);
    setPageInput("1");
    setViewScale(1);
    setDataUrl("");
    setFit("contain");
    setPan({ x: 0, y: 0 });
    setErrorMessage("");
    setIsDragging(false);
    dragRef.current = { on: false, sx: 0, sy: 0, px: 0, py: 0 };
  }, [filePath]);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      const cached = getRenderedPreviewPage(filePath, pageIndex, renderScale);
      if (cached) {
        if (cancelled) {
          return;
        }
        setDataUrl(cached.dataUrl);
        setPageCount(cached.pageCount);
        setPageIndex(cached.pageIndex);
        setErrorMessage("");
        setStatus("idle");
        return;
      }

      setStatus("loading");
      try {
        const rendered = await loadRenderedPreviewPage(filePath, pageIndex, renderScale);
        if (cancelled) {
          return;
        }
        setDataUrl(rendered.dataUrl);
        setPageCount(rendered.pageCount);
        setPageIndex(rendered.pageIndex);
        setErrorMessage("");
        setStatus("idle");
      } catch (error) {
        if (cancelled) {
          return;
        }
        setStatus("error");
        setErrorMessage(error instanceof Error ? error.message : `${kindLabel} 预览失败`);
      }
    }

    void render();
    return () => {
      cancelled = true;
    };
  }, [filePath, kindLabel, pageIndex, renderScale]);

  useEffect(() => {
    setPageInput(String(pageIndex));
  }, [pageIndex]);

  useEffect(() => {
    if (status !== "idle" || pageCount <= 1) {
      return;
    }

    const adjacentPages = getAdjacentPreviewPages(pageIndex, pageCount);
    if (adjacentPages.length === 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      void prefetchRenderedPreviewPages(filePath, adjacentPages, renderScale);
    }, 80);

    return () => {
      window.clearTimeout(timer);
    };
  }, [filePath, pageCount, pageIndex, renderScale, status]);

  function goToPage(targetPage: number) {
    const nextPage = clampPreviewPage(targetPage, pageCount);
    if (nextPage === pageIndex) {
      setPageInput(String(pageIndex));
      return;
    }
    setPageIndex(nextPage);
    setPan({ x: 0, y: 0 });
  }

  function zoomIn() {
    setViewScale((value) => stepViewScale(value, "in"));
  }

  function zoomOut() {
    setViewScale((value) => stepViewScale(value, "out"));
    setPan({ x: 0, y: 0 });
  }

  function toggleFitMode() {
    setFit((value) => (value === "contain" ? "width" : "contain"));
    setPan({ x: 0, y: 0 });
  }

  function resetView() {
    setFit("contain");
    setViewScale(1);
    setPan({ x: 0, y: 0 });
  }

  function onMouseDown(event: React.MouseEvent<HTMLDivElement>) {
    if (event.button !== 0 || !canPan) {
      return;
    }
    event.preventDefault();
    event.currentTarget.focus();
    dragRef.current = { on: true, sx: event.clientX, sy: event.clientY, px: pan.x, py: pan.y };
    setIsDragging(true);
  }

  function onMouseMove(event: React.MouseEvent<HTMLDivElement>) {
    if (!dragRef.current.on) {
      return;
    }
    const dx = event.clientX - dragRef.current.sx;
    const dy = event.clientY - dragRef.current.sy;
    setPan({ x: dragRef.current.px + dx, y: dragRef.current.py + dy });
  }

  function endDrag() {
    dragRef.current.on = false;
    setIsDragging(false);
  }

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const handler = (event: WheelEvent) => {
      event.preventDefault();
      if (event.deltaY < 0) {
        zoomIn();
      } else {
        zoomOut();
      }
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => {
      el.removeEventListener("wheel", handler);
    };
  }, []);

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.tagName === "INPUT") {
      return;
    }

    if (event.key === "ArrowLeft" || event.key === "PageUp") {
      event.preventDefault();
      goToPage(pageIndex - 1);
      return;
    }

    if (event.key === "ArrowRight" || event.key === "PageDown") {
      event.preventDefault();
      goToPage(pageIndex + 1);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      goToPage(1);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      goToPage(pageCount);
      return;
    }

    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoomIn();
      return;
    }

    if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      zoomOut();
      return;
    }

    if (event.key === "0") {
      event.preventDefault();
      resetView();
    }
  }

  function commitPageInput() {
    const nextPage = Number.parseInt(pageInput.trim(), 10);
    if (Number.isNaN(nextPage)) {
      setPageInput(String(pageIndex));
      return;
    }
    goToPage(nextPage);
  }

  return (
    <div className={`documentPreview ${compact ? "documentPreviewCompact" : ""}`}>
      <div className="documentPreviewHeader">
        <div className="documentPreviewHeaderLeft">
          <span className="documentPreviewBadge">{kindLabel}</span>
          <div className="documentPreviewPager">
            <button
              className="documentPreviewPagerBtn"
              onClick={() => goToPage(pageIndex - 1)}
              disabled={!canGoPrev || status === "loading"}
              title="上一页"
              aria-label="上一页"
            >
              <Icon d={icons.prev} />
            </button>
            <input
              className="documentPreviewPageInput"
              value={pageInput}
              onChange={(event) => setPageInput(event.target.value.replace(/[^\d]/g, ""))}
              onBlur={commitPageInput}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  commitPageInput();
                  event.currentTarget.blur();
                  return;
                }
                if (event.key === "Escape") {
                  setPageInput(String(pageIndex));
                  event.currentTarget.blur();
                }
              }}
              inputMode="numeric"
              aria-label="页码"
            />
            <span className="toolbarMeta">/ {pageCount}</span>
            <button
              className="documentPreviewPagerBtn"
              onClick={() => goToPage(pageIndex + 1)}
              disabled={!canGoNext || status === "loading"}
              title="下一页"
              aria-label="下一页"
            >
              <Icon d={icons.next} />
            </button>
          </div>
        </div>
        <div className="documentPreviewHeaderRight">
          <span className="toolbarMeta">
            {status === "loading"
              ? dataUrl
                ? `正在切换到第 ${pageIndex} 页`
                : `正在加载${kindLabel}`
              : status === "error"
                ? "预览异常"
                : `${Math.round(viewScale * 100)}% · ${fit === "width" ? "适宽" : "整页"}`}
          </span>
        </div>
      </div>
      <div className="previewStage">
        <div
          ref={viewportRef}
          className="previewViewport documentPreviewViewport"
          role="button"
          tabIndex={0}
          aria-label={`${kindLabel} 预览区域`}
          onKeyDown={onKeyDown}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
          onDoubleClick={toggleFitMode}
          onDragOver={(event) => event.stopPropagation()}
          onDragEnter={(event) => event.stopPropagation()}
          onDrop={(event) => event.stopPropagation()}
        >
          {dataUrl ? (
            <img
              className="previewImg"
              src={dataUrl}
              alt={kindLabel.toLowerCase()}
              style={
                fit === "width"
                  ? {
                      width: "100%",
                      height: "auto",
                      transform: `translate(${pan.x}px, ${pan.y}px) scale(${viewScale})`,
                      transformOrigin: "center center",
                      cursor: canPan ? (isDragging ? "grabbing" : "grab") : "default",
                      userSelect: "none",
                    }
                  : {
                      maxWidth: "100%",
                      maxHeight: "100%",
                      width: "auto",
                      height: "auto",
                      transform: `translate(${pan.x}px, ${pan.y}px) scale(${viewScale})`,
                      transformOrigin: "center center",
                      cursor: canPan ? (isDragging ? "grabbing" : "grab") : "default",
                      userSelect: "none",
                    }
              }
            />
          ) : null}
          {previewConfig?.layout.mergePreview ? <PreviewOverlay config={previewConfig} /> : null}
          {status === "loading" && !dataUrl ? <div className="placeholder">正在加载{kindLabel}…</div> : null}
          {status === "error" && !dataUrl ? (
            <div className="placeholder">{errorMessage || `${kindLabel} 预览失败。`}</div>
          ) : null}
          {dataUrl && status === "loading" ? (
            <div className="documentPreviewOverlay">正在加载第 {pageIndex} 页…</div>
          ) : null}
          {dataUrl && status === "error" ? (
            <div className="documentPreviewOverlay documentPreviewOverlayError">
              {errorMessage || `${kindLabel} 预览失败。`}
            </div>
          ) : null}
        </div>

      </div>
    </div>
  );
}
