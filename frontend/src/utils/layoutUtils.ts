import type { InvoiceFileItem, PreviewConfig } from "../types";

export function classify(path: string): { ext: string; type: InvoiceFileItem["type"] } {
  const normalized = path.toLowerCase();
  const dot = normalized.lastIndexOf(".");
  const ext = dot >= 0 ? normalized.slice(dot + 1) : "";
  if (ext === "pdf") return { ext, type: "pdf" };
  if (ext === "ofd") return { ext, type: "ofd" };
  if (ext === "xml") return { ext, type: "xml" };
  if (["png", "jpg", "jpeg", "bmp", "webp", "tif", "tiff"].includes(ext)) return { ext, type: "image" };
  return { ext, type: "unknown" };
}

export function basename(path: string): string {
  const p = path.replaceAll("\\", "/");
  const idx = p.lastIndexOf("/");
  return idx >= 0 ? p.slice(idx + 1) : p;
}

export function newId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function calcLayoutGrid(
  nUp: number,
  isLandscape: boolean,
  forced?: { cols: number; rows: number }
): { cols: number; rows: number } {
  let cols = 1;
  let rows = 1;

  if (nUp === 1) {
    cols = 1;
    rows = 1;
  } else if (nUp === 2) {
    cols = 1;
    rows = 2;
  } else if (nUp === 3) {
    cols = 1;
    rows = 3;
  } else if (nUp === 4) {
    cols = 2;
    rows = 2;
  } else if (nUp === 6) {
    cols = isLandscape ? 3 : 2;
    rows = isLandscape ? 2 : 3;
  }

  if (forced?.cols && forced?.rows) {
    cols = forced.cols;
    rows = forced.rows;
  }

  return { cols, rows };
}

export function calcMergePages(filesCount: number, previewConfig: PreviewConfig): number {
  const isLandscape = previewConfig.paper.orientation === "landscape";
  const { cols, rows } = calcLayoutGrid(
    previewConfig.layout.nUp,
    isLandscape,
    previewConfig.layout.grid
  );
  const perPage = cols * rows;
  return Math.max(1, Math.ceil(filesCount / perPage));
}

export function calcExportDimensions(previewConfig: PreviewConfig) {
  const isLandscape = previewConfig.paper.orientation === "landscape";
  const { cols, rows } = calcLayoutGrid(
    previewConfig.layout.nUp,
    isLandscape,
    previewConfig.layout.grid
  );

  const paperWMm = isLandscape ? previewConfig.paper.heightMm : previewConfig.paper.widthMm;
  const paperHMm = isLandscape ? previewConfig.paper.widthMm : previewConfig.paper.heightMm;

  const exportScale = 300 / 25.4;
  const exportPaperW = Math.round(paperWMm * exportScale);
  const exportPaperH = Math.round(paperHMm * exportScale);

  const exportMargin = {
    top: Math.round(previewConfig.paper.marginMm.top * exportScale),
    right: Math.round(previewConfig.paper.marginMm.right * exportScale),
    bottom: Math.round(previewConfig.paper.marginMm.bottom * exportScale),
    left: Math.round(previewConfig.paper.marginMm.left * exportScale),
  };

  const exportInnerW = exportPaperW - exportMargin.left - exportMargin.right;
  const exportInnerH = exportPaperH - exportMargin.top - exportMargin.bottom;
  const exportCellW = exportInnerW / cols;
  const exportCellH = exportInnerH / rows;

  return {
    cols,
    rows,
    perPage: cols * rows,
    paperWMm,
    paperHMm,
    exportScale,
    exportPaperW,
    exportPaperH,
    exportMargin,
    exportInnerW,
    exportInnerH,
    exportCellW,
    exportCellH,
  };
}
