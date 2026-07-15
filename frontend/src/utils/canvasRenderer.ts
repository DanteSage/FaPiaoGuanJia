import type { InvoiceFileItem, PreviewConfig } from "../types";
import { EXPORT_RENDER_SCALE } from "../constants/renderScales";
import { calcExportDimensions } from "./layoutUtils";

export type PageImage = {
  dataUrl: string;
  naturalW: number;
  naturalH: number;
};

export async function loadFileAsImage(file: InvoiceFileItem): Promise<PageImage | null> {
  try {
    if (file.type === "image") {
      const bytes = await window.invoiceApi.readFile(file.path);
      const blob = new Blob([new Uint8Array(bytes)]);
      const dataUrl = URL.createObjectURL(blob);
      const img = new Image();
      await new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = dataUrl;
      });
      return {
        dataUrl,
        naturalW: img.naturalWidth || 100,
        naturalH: img.naturalHeight || 100,
      };
    } else if (file.type === "pdf" || file.type === "ofd") {

      const res = await window.invoiceApi.renderPdfPage(file.path, 1, EXPORT_RENDER_SCALE);
      return {
        dataUrl: `data:image/png;base64,${res.pngBase64}`,
        naturalW: res.width,
        naturalH: res.height,
      };
    }
  } catch (error) {
    console.warn("load preview image failed", error);
  }
  return null;
}

export function drawSplitLines(
  ctx: CanvasRenderingContext2D,
  config: PreviewConfig,
  dims: ReturnType<typeof calcExportDimensions>
) {
  if (!config.splitLine.enabled) return;

  const { cols, rows, exportScale, exportMargin, exportInnerW, exportInnerH, exportCellW, exportCellH } = dims;

  ctx.strokeStyle = `rgba(128, 128, 128, ${config.splitLine.opacity})`;
  ctx.lineWidth = config.splitLine.thicknessPx * (exportScale / 4);

  if (config.splitLine.style === "dashed") {
    ctx.setLineDash([6 * (exportScale / 4), 4 * (exportScale / 4)]);
  }

  for (let c = 1; c < cols; c++) {
    const x = exportMargin.left + c * exportCellW;
    ctx.beginPath();
    ctx.moveTo(x, exportMargin.top);
    ctx.lineTo(x, exportMargin.top + exportInnerH);
    ctx.stroke();
  }

  for (let r = 1; r < rows; r++) {
    const y = exportMargin.top + r * exportCellH;
    ctx.beginPath();
    ctx.moveTo(exportMargin.left, y);
    ctx.lineTo(exportMargin.left + exportInnerW, y);
    ctx.stroke();
  }

  ctx.setLineDash([]);
}

const PUNCH_HOLE_OFFSET_MM = 8;
const PUNCH_HOLE_DIAMETER_MM = 6;
const BINDING_LINE_OFFSET_MM = 14;
const BINDING_LINE_THICKNESS_MM = 0.4;

export function drawPunchHoles(
  ctx: CanvasRenderingContext2D,
  config: PreviewConfig,
  dims: ReturnType<typeof calcExportDimensions>
) {
  if (!config.punchHoles.enabled) return;

  const { exportScale, exportPaperW, exportPaperH } = dims;
  const count = config.punchHoles.count;
  const pos = config.punchHoles.position;
  const holeRadius = (PUNCH_HOLE_DIAMETER_MM * exportScale) / 2;
  const offset = PUNCH_HOLE_OFFSET_MM * exportScale;
  const strokeWidth = 0.3 * exportScale;

  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "rgba(110, 110, 110, 0.85)";
  ctx.lineWidth = strokeWidth;
  ctx.setLineDash([2 * exportScale, 1.2 * exportScale]);

  const drawHole = (cx: number, cy: number) => {
    ctx.beginPath();
    ctx.arc(cx, cy, holeRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  };

  if (pos === "left") {
    const spacing = exportPaperH / (count + 1);
    for (let i = 1; i <= count; i++) {
      drawHole(offset, spacing * i);
    }
  } else {
    const spacing = exportPaperW / (count + 1);
    for (let i = 1; i <= count; i++) {
      drawHole(spacing * i, offset);
    }
  }

  ctx.setLineDash([]);
}

export function drawBindingLine(
  ctx: CanvasRenderingContext2D,
  config: PreviewConfig,
  dims: ReturnType<typeof calcExportDimensions>
) {
  if (!config.bindingLine.enabled) return;

  const { exportScale, exportPaperW, exportPaperH } = dims;
  const pos = config.bindingLine.position;
  const offset = BINDING_LINE_OFFSET_MM * exportScale;
  const thickness = BINDING_LINE_THICKNESS_MM * exportScale;

  ctx.strokeStyle = "rgba(80, 80, 80, 0.85)";
  ctx.lineWidth = thickness;

  if (config.bindingLine.style === "dashed") {
    ctx.setLineDash([3 * exportScale, 1.5 * exportScale]);
  }

  ctx.beginPath();
  if (pos === "left") {
    ctx.moveTo(offset, 0);
    ctx.lineTo(offset, exportPaperH);
  } else {
    ctx.moveTo(0, offset);
    ctx.lineTo(exportPaperW, offset);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

export async function drawCellImage(
  ctx: CanvasRenderingContext2D,
  imgData: PageImage,
  cellX: number,
  cellY: number,
  cellW: number,
  cellH: number,
  rotation: number,
  scale: number,
  exportScale: number
) {
  const image = new Image();
  await new Promise<void>((resolve) => {
    image.onload = () => resolve();
    image.onerror = () => resolve();
    image.src = imgData.dataUrl;
  });

  const cellPadding = 4 * (exportScale / 4);
  const innerX = cellX + cellPadding;
  const innerY = cellY + cellPadding;
  const innerW = cellW - cellPadding * 2;
  const innerH = cellH - cellPadding * 2;

  const imgW = image.naturalWidth;
  const imgH = image.naturalHeight;

  const fitScale = Math.min(innerW / imgW, innerH / imgH);

  const drawW = imgW * fitScale * scale;
  const drawH = imgH * fitScale * scale;

  ctx.save();

  ctx.beginPath();
  ctx.rect(innerX, innerY, innerW, innerH);
  ctx.clip();

  ctx.translate(innerX + innerW / 2, innerY + innerH / 2);

  ctx.rotate((rotation * Math.PI) / 180);

  ctx.drawImage(image, -drawW / 2, -drawH / 2, drawW, drawH);

  ctx.restore();
}

export type ProgressCallback = (done: number, total: number) => void;

export async function generateMergedPages(
  files: InvoiceFileItem[],
  previewConfig: PreviewConfig,
  cellRotations: Record<number, number>,
  cellScales: Record<number, number>,
  onProgress?: ProgressCallback
): Promise<string[]> {
  const dims = calcExportDimensions(previewConfig);
  const { cols, perPage, exportScale, exportPaperW, exportPaperH, exportMargin, exportCellW, exportCellH } = dims;
  const totalPages = Math.ceil(files.length / perPage);

  const pngDataUrls: string[] = [];

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {

    onProgress?.(pageIdx, totalPages);
    const start = pageIdx * perPage;
    const pageFiles = files.slice(start, start + perPage);

    const canvas = document.createElement("canvas");
    canvas.width = exportPaperW;
    canvas.height = exportPaperH;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, exportPaperW, exportPaperH);

    const pageImages = await Promise.all(pageFiles.map((file) => loadFileAsImage(file)));

    for (let i = 0; i < pageFiles.length; i++) {
      const img = pageImages[i];
      if (!img) continue;

      const c = i % cols;
      const r = Math.floor(i / cols);
      const cellX = exportMargin.left + c * exportCellW;
      const cellY = exportMargin.top + r * exportCellH;

      const globalIdx = start + i;
      const rotation = cellRotations[globalIdx] || 0;
      const scale = cellScales[globalIdx] || 1;

      await drawCellImage(ctx, img, cellX, cellY, exportCellW, exportCellH, rotation, scale, exportScale);

      if (img.dataUrl.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(img.dataUrl);
        } catch (error) {
          console.warn("revoke object url failed", error);
        }
      }
    }

    drawSplitLines(ctx, previewConfig, dims);
    drawPunchHoles(ctx, previewConfig, dims);
    drawBindingLine(ctx, previewConfig, dims);

    const dataUrl = canvas.toDataURL("image/png");
    pngDataUrls.push(dataUrl);
  }

  onProgress?.(totalPages, totalPages);
  return pngDataUrls;
}
