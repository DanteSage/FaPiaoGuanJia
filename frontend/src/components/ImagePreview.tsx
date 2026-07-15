import React, { useEffect, useRef, useState } from "react";
import type { PreviewConfig } from "../types";
import { PreviewOverlay } from "./PreviewOverlay";
import { loadImageStandalone } from "../hooks/useImageCache";

export function clearImagePreviewCache(): { entryCount: number } {
  return { entryCount: 0 };
}

export function ImagePreview({ filePath, previewConfig }: { filePath: string; previewConfig?: PreviewConfig }) {
  const [url, setUrl] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [fit, setFit] = useState<"width" | "contain">("contain");
  const [zoom, setZoom] = useState<number>(1);
  const [rotate, setRotate] = useState<number>(0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragRef = useRef<{ on: boolean; sx: number; sy: number; px: number; py: number }>({
    on: false,
    sx: 0,
    sy: 0,
    px: 0,
    py: 0
  });
  const viewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    setError("");

    loadImageStandalone(filePath, "image")
      .then((cached) => {
        if (!active) return;
        if (cached) {
          setUrl(cached.dataUrl);
        } else {
          setError("图片加载失败");
          setUrl("");
        }
      })
      .catch((e: unknown) => {
        if (!active) return;
        setError(e instanceof Error ? e.message : "图片加载失败");
        setUrl("");
      });

    return () => {
      active = false;
    };
  }, [filePath]);

  useEffect(() => {
    setFit("contain");
    setZoom(1);
    setRotate(0);
    setPan({ x: 0, y: 0 });
  }, [filePath]);

  function zoomIn() {
    setZoom((z) => Math.min(5, Math.round((z + 0.25) * 100) / 100));
  }

  function zoomOut() {
    setZoom((z) => {
      const next = Math.max(0.5, Math.round((z - 0.25) * 100) / 100);
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

  if (error) return <div className="placeholder">{error}</div>;
  if (!url) return <div className="placeholder">正在加载图片…</div>;

  function onMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    if (!url) return;
    if (zoom <= 1 && fit === "contain") return;
    e.preventDefault();
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
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, height: "100%" }}>
      <div className="previewStage">
        <div
          ref={viewportRef}
          className="previewViewport"
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
          onDragOver={(e) => e.stopPropagation()}
          onDragEnter={(e) => e.stopPropagation()}
          onDrop={(e) => e.stopPropagation()}
        >
          <img
            className="previewImg"
            src={url}
            alt="preview"
            style={
              fit === "width"
                ? {
                    width: "100%",
                    height: "auto",
                    transform: `translate(${pan.x}px, ${pan.y}px) rotate(${rotate}deg) scale(${zoom})`,
                    transformOrigin: "center center",
                    cursor: zoom > 1 ? "grab" : "default",
                    userSelect: "none"
                  }
                : {
                    maxWidth: "100%",
                    maxHeight: "100%",
                    width: "auto",
                    height: "auto",
                    transform: `translate(${pan.x}px, ${pan.y}px) rotate(${rotate}deg) scale(${zoom})`,
                    transformOrigin: "center center",
                    cursor: zoom > 1 ? "grab" : "default",
                    userSelect: "none"
                  }
            }
          />
          {previewConfig?.layout.mergePreview ? <PreviewOverlay config={previewConfig} /> : null}
        </div>
      </div>
    </div>
  );
}
