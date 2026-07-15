import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { PreviewConfig } from "../types";

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function useSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    setSize({ w: r.width, h: r.height });
    return () => ro.disconnect();
  }, []);

  return { ref, size };
}

export function PreviewOverlay({ config }: { config: PreviewConfig }) {
  const { ref, size } = useSize<HTMLDivElement>();

  const paperMm = useMemo(() => {
    const baseW = config.paper.widthMm;
    const baseH = config.paper.heightMm;
    const isLandscape = config.paper.orientation === "landscape";
    const w = isLandscape ? baseH : baseW;
    const h = isLandscape ? baseW : baseH;
    return { w: Math.max(1, w), h: Math.max(1, h) };
  }, [config.paper.heightMm, config.paper.orientation, config.paper.widthMm]);

  const paperPx = useMemo(() => {
    const vw = size.w;
    const vh = size.h;
    if (vw <= 0 || vh <= 0) return { w: 0, h: 0 };
    const padding = 18;
    const maxW = Math.max(0, vw - padding * 2);
    const maxH = Math.max(0, vh - padding * 2);
    const aspect = paperMm.w / paperMm.h;
    let w = maxW;
    let h = w / aspect;
    if (h > maxH) {
      h = maxH;
      w = h * aspect;
    }
    return { w: Math.floor(w), h: Math.floor(h) };
  }, [paperMm.h, paperMm.w, size.h, size.w]);

  const marginPx = useMemo(() => {
    const m = config.paper.marginMm;
    if (!paperPx.w || !paperPx.h) return { top: 0, right: 0, bottom: 0, left: 0 };
    const left = (paperPx.w * clamp(m.left, 0, 200)) / paperMm.w;
    const right = (paperPx.w * clamp(m.right, 0, 200)) / paperMm.w;
    const top = (paperPx.h * clamp(m.top, 0, 200)) / paperMm.h;
    const bottom = (paperPx.h * clamp(m.bottom, 0, 200)) / paperMm.h;
    return { top, right, bottom, left };
  }, [config.paper.marginMm, paperMm.h, paperMm.w, paperPx.h, paperPx.w]);

  const inner = useMemo(() => {
    const w = Math.max(0, paperPx.w - marginPx.left - marginPx.right);
    const h = Math.max(0, paperPx.h - marginPx.top - marginPx.bottom);
    return { w, h };
  }, [marginPx.bottom, marginPx.left, marginPx.right, marginPx.top, paperPx.h, paperPx.w]);

  const nUpLines = useMemo(() => {
    const isLandscape = config.paper.orientation === "landscape";
    const forced = config.layout.grid;
    let cols = forced?.cols ?? 1;
    let rows = forced?.rows ?? 2;
    const n = config.layout.nUp;
    if (n === 2) {

      cols = 1;
      rows = 2;
    } else if (n === 3) {

      cols = 1;
      rows = 3;
    } else if (n === 4) {
      cols = 2;
      rows = 2;
    } else if (n === 6) {
      cols = isLandscape ? 3 : 2;
      rows = isLandscape ? 2 : 3;
    }
    if (forced?.cols && forced?.rows) {
      cols = forced.cols;
      rows = forced.rows;
    }
    if (cols <= 1 && rows <= 1) return [];
    const lines: Array<
      | { axis: "v"; x: number; y: number; len: number }
      | { axis: "h"; x: number; y: number; len: number }
    > = [];
    const left = marginPx.left;
    const top = marginPx.top;
    const w = inner.w;
    const h = inner.h;
    for (let c = 1; c < cols; c++) {
      const x = left + (w * c) / cols;
      lines.push({ axis: "v", x, y: top, len: h });
    }
    for (let r = 1; r < rows; r++) {
      const y = top + (h * r) / rows;
      lines.push({ axis: "h", x: left, y, len: w });
    }
    return lines;
  }, [config.layout.grid, config.layout.nUp, config.paper.orientation, inner.h, inner.w, marginPx.left, marginPx.top]);

  const paperOverlayStyle: CSSProperties & {
    "--paperW": string;
    "--paperH": string;
  } = {
    "--paperW": `${paperPx.w}px`,
    "--paperH": `${paperPx.h}px`,
  };

  return (
    <div ref={ref} className="overlayHost">
      {config.layout.showPaper ? (
        <div className="paperOverlay" style={paperOverlayStyle}>
          <div className={`paperSheet ${config.layout.paperShadow ? "paperSheetShadow" : ""}`}>
            {config.layout.showMargins ? (
              <div
                className="paperMargins"
                style={{
                  top: `${marginPx.top}px`,
                  right: `${marginPx.right}px`,
                  bottom: `${marginPx.bottom}px`,
                  left: `${marginPx.left}px`
                }}
              />
            ) : null}
            {nUpLines.length && config.splitLine.enabled ? (
              <div className="paperNup">
                {nUpLines.map((ln, idx) =>
                  ln.axis === "v" ? (
                    <div
                      key={idx}
                      className="paperNupLine paperNupLineV"
                      style={{
                        left: `${ln.x}px`,
                        top: `${ln.y}px`,
                        height: `${ln.len}px`,
                        borderLeftStyle: config.splitLine.style
                      }}
                    />
                  ) : (
                    <div
                      key={idx}
                      className="paperNupLine paperNupLineH"
                      style={{
                        left: `${ln.x}px`,
                        top: `${ln.y}px`,
                        width: `${ln.len}px`,
                        borderTopStyle: config.splitLine.style
                      }}
                    />
                  )
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
