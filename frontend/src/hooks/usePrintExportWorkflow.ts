import { useCallback, useState } from "react";
import type { InvoiceFileItem } from "../types";
import type { ToastFn } from "../types/ui";
import { calcExportDimensions } from "../utils/layoutUtils";
import { generateMergedPages } from "../utils/canvasRenderer";
import type { BusyState } from "./useAppState";
import type { PreviewConfig } from "../types";
import type { FormTemplate } from "./useSettings";

type Params = {
  files: InvoiceFileItem[];
  previewConfig: PreviewConfig;
  cellRotations: Record<number, number>;
  cellScales: Record<number, number>;
  setBusy: (busy: BusyState) => void;
  showToast: ToastFn;
  formTemplate?: FormTemplate;
};

export type PrintJob = {
  previewImages: string[];
  pdfPath: string;
};

async function safeDeleteTempFile(filePath: string) {
  try {
    await window.invoiceApi.deleteFiles([filePath]);
  } catch (err) {
    console.warn("清理临时打印 PDF 失败:", err);
  }
}

export function usePrintExportWorkflow(params: Params) {
  const { files, previewConfig, cellRotations, cellScales, setBusy, showToast, formTemplate } = params;
  const [printJob, setPrintJob] = useState<PrintJob | null>(null);

  const handlePrint = useCallback(async () => {
    if (files.length === 0) return;
    const totalPages = Math.ceil(files.length / previewConfig.layout.nUp);
    setBusy({ kind: "printing", step: "正在生成页面...", done: 0, total: totalPages + 1 });
    try {
      const previewImages = await generateMergedPages(files, previewConfig, cellRotations, cellScales, (done, total) =>
        setBusy({ kind: "printing", step: `正在生成页面 ${done + 1}/${total}`, done, total: total + 1 })
      );
      setBusy({ kind: "printing", step: "正在生成 PDF...", done: totalPages, total: totalPages + 1 });
      const tempPath = await window.invoiceApi.makeTempPath("print_", ".pdf");
      const dims = calcExportDimensions(previewConfig);
      const pdfPath = await window.invoiceApi.mergePngsToPdf(previewImages, tempPath, dims.paperWMm, dims.paperHMm);
      if (pdfPath) {
        setPrintJob({ previewImages, pdfPath });
      } else {
        showToast("生成打印 PDF 失败", "error");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(msg.includes("用户取消") ? "已取消打印" : "打印准备失败", msg.includes("用户取消") ? "info" : "error");
    } finally {
      setBusy({ kind: "idle" });
    }
  }, [cellRotations, cellScales, files, previewConfig, setBusy, showToast]);

  const executePrint = useCallback(async (printerName: string, copies: number) => {
    if (!printJob) return;
    const { pdfPath } = printJob;
    const safeCopies = Math.max(1, Math.min(99, Math.floor(copies) || 1));
    setBusy({ kind: "printing", step: "正在打印...", done: 0, total: 1 });
    try {
      const result = await window.invoiceApi.print({ printerName, pdfPath, copies: safeCopies });
      setPrintJob(null);
      if (result?.fallback) {
        showToast(result.message || "已打开 PDF，请在打开的程序中打印", "info");
      } else {
        showToast("已发送到打印机", "success");
        await safeDeleteTempFile(pdfPath);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("用户取消")) {
        showToast("已取消打印", "info");
      } else {
        showToast(`打印失败：${msg}`, "error");
      }
    } finally {
      setBusy({ kind: "idle" });
    }
  }, [printJob, setBusy, showToast]);

  const cancelPrint = useCallback(async () => {
    if (!printJob) return;
    const { pdfPath } = printJob;
    setPrintJob(null);
    await safeDeleteTempFile(pdfPath);
  }, [printJob]);

  const printReimbursement = useCallback(async (
    payload: Record<string, unknown>,
    invoiceFilePaths: string[]
  ) => {
    setBusy({ kind: "printing", step: "正在生成报销单 PDF...", done: 0, total: 2 });
    try {
      const templateArg = formTemplate as unknown as Record<string, unknown> | undefined;
      const result = await window.invoiceApi.buildReimbursementPdf(
        payload,
        invoiceFilePaths,
        undefined,
        undefined,
        templateArg
      );
      const pdfPath = result?.outputPath;
      if (!pdfPath) {
        showToast("生成报销单 PDF 失败", "error");
        return;
      }
      setBusy({ kind: "printing", step: "正在渲染预览...", done: 1, total: 2 });
      const firstPage = await window.invoiceApi.renderPdfPage(pdfPath, 1, 1.5);
      const pageCount = firstPage.pageCount || 1;
      const previewImages: string[] = [`data:image/png;base64,${firstPage.pngBase64}`];
      for (let i = 2; i <= pageCount; i++) {
        try {
          const r = await window.invoiceApi.renderPdfPage(pdfPath, i, 1.5);
          previewImages.push(`data:image/png;base64,${r.pngBase64}`);
        } catch (err) {
          console.warn(`渲染第 ${i} 页预览失败:`, err);
        }
      }
      setPrintJob({ previewImages, pdfPath });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`打印准备失败：${msg}`, "error");
    } finally {
      setBusy({ kind: "idle" });
    }
  }, [setBusy, showToast, formTemplate]);

  const handleExport = useCallback(async () => {
    if (files.length === 0) return;
    const savePath = await window.invoiceApi.chooseSavePath("merged.pdf");
    if (!savePath) return;
    const totalPages = Math.ceil(files.length / previewConfig.layout.nUp);
    setBusy({ kind: "exporting", step: "正在生成页面...", done: 0, total: totalPages + 1 });
    try {
      const previewImages = await generateMergedPages(files, previewConfig, cellRotations, cellScales, (done, total) =>
        setBusy({ kind: "exporting", step: `正在生成页面 ${done + 1}/${total}`, done, total: total + 1 })
      );
      setBusy({ kind: "exporting", step: "正在生成 PDF...", done: totalPages, total: totalPages + 1 });
      const dims = calcExportDimensions(previewConfig);
      const out = await window.invoiceApi.mergePngsToPdf(previewImages, savePath, dims.paperWMm, dims.paperHMm);
      if (out) {
        showToast("导出成功", "success");
      }
    } catch {
      showToast("导出失败，请重试", "error");
    } finally {
      setBusy({ kind: "idle" });
    }
  }, [cellRotations, cellScales, files, previewConfig, setBusy, showToast]);

  return { handlePrint, handleExport, printJob, executePrint, cancelPrint, printReimbursement };
}
