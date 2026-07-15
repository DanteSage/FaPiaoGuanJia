import React, { useEffect, useMemo, useRef, useState } from "react";
import { DocumentPreview } from "../DocumentPreview";

export function DetailImagePreview({ filePath }: { filePath: string }) {
  const [url, setUrl] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragRef = useRef<{ on: boolean; sx: number; sy: number; px: number; py: number }>({
    on: false,
    sx: 0,
    sy: 0,
    px: 0,
    py: 0,
  });
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const cacheKey = useMemo(() => filePath, [filePath]);

  useEffect(() => {
    let active = true;
    let objectUrl = "";

    async function load() {
      setError("");
      try {
        const bytes = await window.invoiceApi.readFile(filePath);
        const blob = new Blob([new Uint8Array(bytes)]);
        objectUrl = URL.createObjectURL(blob);
        if (active) {
          setUrl(objectUrl);
        }
      } catch (error) {
        if (!active) {
          return;
        }
        setError(error instanceof Error ? error.message : "图片加载失败");
        setUrl("");
      }
    }

    void load();
    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [cacheKey, filePath]);

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [filePath]);

  function zoomIn() {
    setZoom((value) => Math.min(5, Math.round((value + 0.25) * 100) / 100));
  }

  function zoomOut() {
    setZoom((value) => {
      const next = Math.max(0.5, Math.round((value - 0.25) * 100) / 100);
      if (next <= 1) {
        setPan({ x: 0, y: 0 });
      }
      return next;
    });
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

  function onMouseDown(event: React.MouseEvent) {
    if (event.button !== 0 || !url || zoom <= 1) {
      return;
    }
    event.preventDefault();
    dragRef.current = { on: true, sx: event.clientX, sy: event.clientY, px: pan.x, py: pan.y };
  }

  function onMouseMove(event: React.MouseEvent) {
    if (!dragRef.current.on) {
      return;
    }
    const dx = event.clientX - dragRef.current.sx;
    const dy = event.clientY - dragRef.current.sy;
    setPan({ x: dragRef.current.px + dx, y: dragRef.current.py + dy });
  }

  function endDrag() {
    dragRef.current.on = false;
  }

  const kindLabel = useMemo(() => {
    const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
    if (!ext) return "图片";
    if (ext === "jpg" || ext === "jpeg") return "JPG";
    return ext.toUpperCase();
  }, [filePath]);

  return (
    <div className="documentPreview documentPreviewCompact">
      <div className="documentPreviewHeader">
        <div className="documentPreviewHeaderLeft">
          <span className="documentPreviewBadge">{kindLabel}</span>
        </div>
        <div className="documentPreviewHeaderRight">
          <span className="toolbarMeta">
            {error ? "预览异常" : !url ? "正在加载" : `${Math.round(zoom * 100)}% · 整页`}
          </span>
        </div>
      </div>
      <div className="previewStage">
        <div
          ref={viewportRef}
          className="previewViewport detailPreviewViewport"
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
          onDragOver={(event) => event.stopPropagation()}
          onDragEnter={(event) => event.stopPropagation()}
          onDrop={(event) => event.stopPropagation()}
        >
          {url ? (
            <img
              src={url}
              alt="preview"
              style={{
                maxWidth: "100%",
                maxHeight: "100%",
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "center center",
                cursor: zoom > 1 ? "grab" : "default",
                userSelect: "none",
              }}
            />
          ) : null}
          {error ? (
            <div className="placeholder">{error}</div>
          ) : !url ? (
            <div className="placeholder">正在加载{kindLabel}…</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function DetailPdfPreview({ filePath }: { filePath: string }) {
  return <DocumentPreview filePath={filePath} compact />;
}

