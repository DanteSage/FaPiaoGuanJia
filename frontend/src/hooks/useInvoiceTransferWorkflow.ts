import { useCallback, useState } from "react";
import type { ArchivedInvoice, InvoiceFileItem, OcrResult } from "../types";
import type { ToastFn } from "../types/ui";
import type { SectionId } from "../routes";
import type { BusyState } from "./useAppState";
import type { UseArchiveStateReturn } from "./useArchiveState";
import type { UseReimbursementReturn } from "./useReimbursement";
import { pMap } from "../utils/concurrency";
import { invalidateOcrCache, ocrFileWithCache, setCachedOcr } from "../utils/ocrCache";

const OCR_CONCURRENCY = 3;

export type ConfirmDialogOptions = {
  title: string;
  message: string;
  confirmText?: string;
  danger?: boolean;
  onConfirm: () => void;
};

type Params = {
  files: InvoiceFileItem[];
  ocr: Record<string, OcrResult>;
  addFiles: (files: InvoiceFileItem[]) => void;
  setOcr: (id: string, result: OcrResult) => void;
  setBusy: (busy: BusyState) => void;
  navigateToSection: (nextSection: SectionId) => void;
  showToast: ToastFn;
  archiveState: UseArchiveStateReturn;
  reimbursementState: UseReimbursementReturn;
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "未知错误";
}

export function useInvoiceTransferWorkflow(params: Params) {
  const { files, ocr, addFiles, setOcr, setBusy, navigateToSection, showToast, archiveState, reimbursementState } = params;
  const [pendingReimbInvoiceIds, setPendingReimbInvoiceIds] = useState<string[] | null>(null);

  const handleRunOcrAll = useCallback(async (fileIds?: string[]) => {
    const filesToRun = fileIds ? files.filter((f) => fileIds.includes(f.id)) : files;
    if (filesToRun.length === 0) {
      showToast("没有可识别的文件", "error");
      return;
    }
    const total = filesToRun.length;
    let done = 0;
    let succeeded = 0;
    let cached = 0;
    const failures: string[] = [];
    setBusy({ kind: "batchOcr", done: 0, total });
    try {
      await pMap(filesToRun, async (file) => {
        if (ocr[file.id]?.text) {
          cached += 1;
          done += 1;
          setBusy({ kind: "batchOcr", done, total });
          return;
        }
        try {
          const ocrResult = await ocrFileWithCache(file.path);
          setOcr(file.id, ocrResult);
          succeeded += 1;
        } catch (error) {
          console.error("OCR 失败:", file.path, error);
          failures.push(`${file.name}: ${toErrorMessage(error)}`);
        } finally {
          done += 1;
          setBusy({ kind: "batchOcr", done, total });
        }
      }, OCR_CONCURRENCY);
    } finally {
      setBusy({ kind: "idle" });
    }
    if (failures.length > 0) {
      const summary = failures.slice(0, 3).join("、");
      const more = failures.length > 3 ? `，另有 ${failures.length - 3} 个` : "";
      showToast(`${failures.length} 个文件识别失败：${summary}${more}`, "error");
    }
    if (succeeded > 0 || cached > 0) {
      const cachedHint = cached > 0 ? `，${cached} 个复用已识别结果` : "";
      showToast(`识别完成：${succeeded} 个成功${cachedHint}`, succeeded > 0 ? "success" : "info");
    }
  }, [files, ocr, setBusy, setOcr, showToast]);

  const handleSaveToArchive = useCallback(async (fileIds?: string[]) => {
    const filesToSave = fileIds ? files.filter((f) => fileIds.includes(f.id)) : files;
    if (filesToSave.length === 0) {
      showToast("没有可保存的文件", "error");
      return;
    }
    const total = filesToSave.length;
    let ocrDone = 0;
    let added = 0;
    let skipped = 0;
    const failures: string[] = [];
    const ocrResults = new Map<string, OcrResult | undefined>();
    setBusy({ kind: "batchOcr", done: 0, total });
    try {
      await pMap(filesToSave, async (file) => {
        let ocrResult: OcrResult | undefined = ocr[file.id];
        if (!ocrResult?.text) {
          try {
            ocrResult = await ocrFileWithCache(file.path);
            setOcr(file.id, ocrResult);
          } catch (error) {
            console.error("OCR 失败:", file.path, error);
            failures.push(`${file.name}: ${toErrorMessage(error)}`);
            ocrResult = undefined;
          }
        }
        ocrResults.set(file.id, ocrResult);
        ocrDone += 1;
        setBusy({ kind: "batchOcr", done: ocrDone, total });
      }, OCR_CONCURRENCY);

      for (const file of filesToSave) {
        try {
          const result = await archiveState.addInvoiceWithStorage({
            filePath: file.path,
            fileName: file.name,
            fileType: file.type,
            fileExt: file.ext,
            ocrResult: ocrResults.get(file.id),
          });
          if (result.success) added += 1; else skipped += 1;
        } catch (error) {
          console.error("归档失败:", file.path, error);
          failures.push(`${file.name}: ${toErrorMessage(error)}`);
        }
      }
    } finally {
      setBusy({ kind: "idle" });
    }
    if (failures.length > 0) {
      const summary = failures.slice(0, 3).join("、");
      const more = failures.length > 3 ? `，另有 ${failures.length - 3} 个` : "";
      showToast(`${failures.length} 个文件处理失败：${summary}${more}`, "error");
    }
    if (added > 0) {
      showToast(`已保存 ${added} 张发票到发票管理${skipped > 0 ? `，${skipped} 张重复跳过` : ""}`, "success", { label: "前往发票管理 →", onClick: () => navigateToSection("archive") });
    } else if (skipped > 0 && failures.length === 0) {
      showToast("所有发票均已存在，无需重复保存", "info");
    }
  }, [archiveState, files, navigateToSection, ocr, setBusy, setOcr, showToast]);

  const handleRetryOcrFile = useCallback(async (fileId: string) => {
    const file = files.find((f) => f.id === fileId);
    if (!file) return;
    setBusy({ kind: "ocr", fileId });
    try {
      invalidateOcrCache(file.path);
      const ocrResult = await ocrFileWithCache(file.path, { force: true });
      setOcr(fileId, ocrResult);
      showToast(`已重新识别：${file.name}`, "success");
    } catch (error) {
      console.error("单文件识别失败:", file.path, error);
      showToast(`识别失败：${file.name} - ${toErrorMessage(error)}`, "error");
    } finally {
      setBusy({ kind: "idle" });
    }
  }, [files, setBusy, setOcr, showToast]);

  const handleAddToReimbursement = useCallback((invoiceIds: string[]) => {
    if (invoiceIds.length === 0) {
      showToast("没有选中的发票", "error");
      return;
    }
    setPendingReimbInvoiceIds(invoiceIds);
  }, [showToast]);

  const handleConfirmAddToReimbursement = useCallback((reimbId: string) => {
    if (!pendingReimbInvoiceIds) return;
    let added = 0;
    for (const invoiceId of pendingReimbInvoiceIds) {
      const invoice = archiveState.invoices.find((inv) => inv.id === invoiceId);
      if (!invoice) continue;
      const reimb = reimbursementState.allReimbursements.find((r) => r.id === reimbId);
      if (reimb?.items.some((item) => item.invoiceId === invoiceId)) continue;
      reimbursementState.addItem(reimbId, {
        invoiceId: invoice.id,
        invoiceName: invoice.fileName,
        invoiceCode: invoice.invoiceCode,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        amount: invoice.totalAmount || 0,
        taxAmount: invoice.taxAmount,
        category: invoice.category,
      });
      added += 1;
    }
    setPendingReimbInvoiceIds(null);
    reimbursementState.setActiveId(reimbId);
    navigateToSection("reimbursement");
    showToast(added > 0 ? `已添加 ${added} 张发票到报销单` : "发票均已在报销单中", added > 0 ? "success" : "info");
  }, [archiveState.invoices, navigateToSection, pendingReimbInvoiceIds, reimbursementState, showToast]);

  const handleCreateNewForReimbursement = useCallback(() => {
    navigateToSection("reimbursement");
  }, [navigateToSection]);

  const handleSendToWorkspace = useCallback(async (invoices: ArchivedInvoice[]) => {
    if (invoices.length === 0) {
      showToast("没有选中的发票", "error");
      return;
    }
    const existingPaths = new Set(files.map((f) => f.path));
    let candidates = invoices.filter((inv) => !existingPaths.has(inv.filePath));
    const duplicateCount = invoices.length - candidates.length;
    if (candidates.length === 0) {
      showToast("所有发票已在合并列表中", "info");
      return;
    }
    const existsMap = await window.invoiceApi.checkFilesExist(candidates.map((inv) => inv.filePath));
    candidates = candidates.filter((inv) => existsMap[inv.filePath]);
    const newItems: InvoiceFileItem[] = candidates.map((inv) => ({ id: crypto.randomUUID(), path: inv.filePath, name: inv.fileName, ext: inv.fileExt, type: inv.fileType }));
    addFiles(newItems);
    candidates.forEach((inv, idx) => {
      if (inv.ocrResult) {
        setOcr(newItems[idx].id, inv.ocrResult);
        setCachedOcr(inv.filePath, inv.ocrResult);
      }
    });
    showToast(duplicateCount > 0 ? `已发送 ${candidates.length} 张发票，${duplicateCount} 张已存在跳过` : `已发送 ${candidates.length} 张发票到发票合并`, "success");
    navigateToSection("workspace");
  }, [addFiles, files, navigateToSection, setOcr, showToast]);

  return {
    pendingReimbInvoiceIds,
    setPendingReimbInvoiceIds,
    handleRunOcrAll,
    handleRetryOcrFile,
    handleSaveToArchive,
    handleAddToReimbursement,
    handleConfirmAddToReimbursement,
    handleCreateNewForReimbursement,
    handleSendToWorkspace,
  };
}
