import { useEffect, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { InvoiceFileItem, OcrResult } from "./types";
import { useAppState } from "./hooks/useAppState";
import { useArchiveState } from "./hooks/useArchiveState";
import { useReimbursement } from "./hooks/useReimbursement";
import { extractInvoiceFields } from "./hooks/archiveUtils";
import { setCachedOcr } from "./utils/ocrCache";
import { usePreviewConfig } from "./hooks/usePreviewConfig";
import { useSettings } from "./hooks/useSettings";
import { useToast } from "./contexts/ToastContext";
import { classify, basename, newId } from "./utils/layoutUtils";
import { Sidebar } from "./components/Sidebar";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { InitialLegalGate } from "./components/InitialLegalGate";
import { AddToReimbursementDialog } from "./components/reimbursement/AddToReimbursementDialog";
import { PrintDialog } from "./components/PrintDialog";
import { getPathBySection, getSectionByPath, type SectionId } from "./routes";
import {
  WorkspacePage,
  ArchivePage,
  ReimbursementPage,
  FormTemplatePage,
  StatisticsPage,
  VerifyPage,
  ExportPage,
  SettingsPage,
  AboutPage,
} from "./pages";
import { usePrintExportWorkflow } from "./hooks/usePrintExportWorkflow";
import { useInvoiceTransferWorkflow } from "./hooks/useInvoiceTransferWorkflow";
import { useAppConfirmations } from "./hooks/useAppConfirmations";

const SUPPORTED_EXTENSIONS = new Set(["pdf", "ofd", "xml", "png", "jpg", "jpeg", "bmp", "webp", "tif", "tiff"]);

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    files,
    activeId,
    ocr,
    busy,
    cellRotations,
    cellScales,
    canRun,
    addFiles,
    removeFile,
    clearFiles,
    setActive,
    setFiles,
    setOcr,
    setBusy,
    setCellRotations,
    setCellScales,
  } = useAppState();
  const { previewConfig, setPreviewConfig, resetPreviewConfig } = usePreviewConfig();
  const settingsHook = useSettings();
  const { showToast } = useToast();
  const archiveState = useArchiveState((msg) => showToast(msg, "error"));
  const reimbursementState = useReimbursement((msg) => showToast(msg, "error"));
  const section = getSectionByPath(location.pathname);
  const currentSection = section ?? "workspace";
  const [appLegalAccepted, setAppLegalAccepted] = useState<boolean | null>(null);

  const navigateToSection = useCallback(
    (nextSection: SectionId) => {
      navigate(getPathBySection(nextSection));
    },
    [navigate]
  );

  useEffect(() => {
    let cancelled = false;
    window.invoiceApi
      .getLegalConsentStatus()
      .then((status) => {
        if (!cancelled) {
          setAppLegalAccepted(status.accepted);
        }
      })
      .catch((error) => {
        console.error("加载应用协议同意状态失败:", error);
        if (!cancelled) {
          setAppLegalAccepted(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (section) return;
    navigate(getPathBySection("workspace"), { replace: true });
  }, [navigate, section]);

  const transferWorkflow = useInvoiceTransferWorkflow({
    files,
    ocr,
    addFiles,
    setOcr,
    setBusy,
    navigateToSection,
    showToast,
    archiveState,
    reimbursementState,
  });

  const printExport = usePrintExportWorkflow({
    files,
    previewConfig,
    cellRotations,
    cellScales,
    setBusy,
    showToast,
    formTemplate: settingsHook.settings.formTemplate,
  });

  const confirmations = useAppConfirmations(showToast);

  useEffect(() => {
    const handleConfirmClose = () => {
      if (appLegalAccepted !== true) {
        window.invoiceApi.confirmClose();
        return;
      }
      confirmations.setConfirmDialog({
        title: "确认关闭",
        message: "确定要关闭票据管理工具吗？未保存的更改将会丢失。",
        confirmText: "关闭",
        danger: true,
        onConfirm: () => {
          window.invoiceApi.confirmClose();
        },
      });
    };
    const cleanup = window.invoiceApi.onConfirmClose(handleConfirmClose);
    return () => {
      if (typeof cleanup === "function") cleanup();
    };
  }, [confirmations, appLegalAccepted]);

  const pickFiles = useCallback(async () => {
    setBusy({ kind: "picking" });
    try {
      const picked = await window.invoiceApi.pickFiles();
      if (!picked.length) return;
      const newItems: InvoiceFileItem[] = picked.map((p) => {
        const { ext, type } = classify(p);
        return { id: newId(), path: p, name: basename(p), ext, type };
      });
      addFiles(newItems);
      showToast(`已添加 ${newItems.length} 个文件`, "success");
    } finally {
      setBusy({ kind: "idle" });
    }
  }, [addFiles, setBusy, showToast]);

  const handleDropFiles = useCallback(
    async (filePaths: string[]) => {
      if (!canRun || filePaths.length === 0) return;
      const validPaths = filePaths.filter((p) => {
        const ext = p.split(".").pop()?.toLowerCase() || "";
        return SUPPORTED_EXTENSIONS.has(ext);
      });
      if (validPaths.length === 0) {
        showToast("没有支持的文件格式", "error");
        return;
      }
      try {
        await window.invoiceApi.authorizePaths(validPaths);
      } catch (err) {
        console.error("授权拖拽文件路径失败:", err);
        showToast("无法访问拖拽文件，请重试", "error");
        return;
      }
      const newItems: InvoiceFileItem[] = validPaths.map((p) => {
        const { ext, type } = classify(p);
        return { id: newId(), path: p, name: basename(p), ext, type };
      });
      addFiles(newItems);
      const skipped = filePaths.length - validPaths.length;
      showToast(skipped > 0 ? `已添加 ${validPaths.length} 个文件，跳过 ${skipped} 个不支持的文件` : `已添加 ${validPaths.length} 个文件`, skipped > 0 ? "info" : "success");
    },
    [canRun, addFiles, showToast]
  );

  const handleRemoveFile = useCallback(
    (fileId: string) => {
      const file = files.find((f) => f.id === fileId);
      removeFile(fileId);
      if (file) showToast(`已移除: ${file.name}`, "info");
    },
    [files, removeFile, showToast]
  );

  const handleResetPreviewConfig = useCallback(() => {
    confirmations.handleResetPreviewConfig(resetPreviewConfig);
  }, [confirmations, resetPreviewConfig]);

  const handleSyncOcrToArchive = useCallback(
    (file: InvoiceFileItem, ocrResult: OcrResult) => {
      const invoice = archiveState.invoices.find((inv) => inv.filePath === file.path);
      if (!invoice) return;
      setCachedOcr(file.path, ocrResult);
      const fieldUpdates = extractInvoiceFields(ocrResult);
      archiveState.updateInvoice(invoice.id, { ...fieldUpdates, ocrResult });
    },
    [archiveState]
  );

  const renderContent = () => {
    switch (currentSection) {
      case "workspace":
        return (
          <ErrorBoundary name="发票合并" key="workspace">
            <WorkspacePage
              files={files}
              activeId={activeId}
              ocr={ocr}
              busy={busy}
              canRun={canRun}
              previewConfig={previewConfig}
              cellRotations={cellRotations}
              cellScales={cellScales}
              onSetActive={setActive}
              onSetFiles={setFiles}
              onSetOcr={setOcr}
              onSetPreviewConfig={setPreviewConfig}
              onSetCellRotations={setCellRotations}
              onSetCellScales={setCellScales}
              onPickFiles={pickFiles}
              onDropFiles={handleDropFiles}
              onRunOcrAll={transferWorkflow.handleRunOcrAll}
              onRetryOcrFile={transferWorkflow.handleRetryOcrFile}
              onClearAll={() => confirmations.handleClearAll(files.length, () => { clearFiles(); showToast("已清空所有文件", "success"); })}
              onRemoveFile={handleRemoveFile}
              onResetPreviewConfig={handleResetPreviewConfig}
              onSaveToArchive={transferWorkflow.handleSaveToArchive}
              onSyncOcrToArchive={handleSyncOcrToArchive}
              onPrint={printExport.handlePrint}
              onExport={printExport.handleExport}
              canPrintExport={busy.kind === "idle"}
              showToast={showToast}
            />
          </ErrorBoundary>
        );
      case "archive":
        return (
          <ErrorBoundary name="发票管理" key="archive">
            <ArchivePage
              archiveState={archiveState}
              invoiceReimbursementMap={reimbursementState.invoiceReimbursementMap}
              reimbursementState={reimbursementState}
              onNavigate={navigateToSection}
              onSendToWorkspace={transferWorkflow.handleSendToWorkspace}
              onAddToReimbursement={transferWorkflow.handleAddToReimbursement}
              onReimbursementsChanged={reimbursementState.reloadReimbursements}
              showToast={showToast}
            />
          </ErrorBoundary>
        );
      case "reimbursement":
        return (
          <ErrorBoundary name="报销管理" key="reimbursement">
            <ReimbursementPage
              archiveState={archiveState}
              reimbursementState={reimbursementState}
              pendingInvoiceIds={transferWorkflow.pendingReimbInvoiceIds}
              onClearPendingInvoiceIds={() => transferWorkflow.setPendingReimbInvoiceIds(null)}
              showToast={showToast}
              reimbursementDefaults={settingsHook.settings.reimbursementDefaults}
              onPrintReimbursement={printExport.printReimbursement}
            />
          </ErrorBoundary>
        );
      case "form-template":
        return (
          <ErrorBoundary name="表单定制" key="form-template">
            <FormTemplatePage settingsHook={settingsHook} showToast={showToast} />
          </ErrorBoundary>
        );
      case "statistics":
        return (
          <ErrorBoundary name="统计分析" key="statistics">
            <StatisticsPage archiveState={archiveState} reimbursementState={reimbursementState} onNavigate={navigateToSection} />
          </ErrorBoundary>
        );
      case "export":
        return (
          <ErrorBoundary name="导出中心" key="export">
            <ExportPage archiveState={archiveState} reimbursementState={reimbursementState} showToast={showToast} />
          </ErrorBoundary>
        );
      case "settings":
        return (
          <ErrorBoundary name="设置" key="settings">
            <SettingsPage
              settingsHook={settingsHook}
              archiveState={archiveState}
              reimbursementState={reimbursementState}
              showToast={showToast}
              onConfirm={(opts) => confirmations.setConfirmDialog(opts)}
            />
          </ErrorBoundary>
        );
      case "about":
        return (
          <ErrorBoundary name="关于" key="about">
            <AboutPage />
          </ErrorBoundary>
        );
      case "donate":
        return (
          <ErrorBoundary name="打赏与支持" key="donate">
            <SettingsPage
              settingsHook={settingsHook}
              archiveState={archiveState}
              reimbursementState={reimbursementState}
              showToast={showToast}
              onConfirm={(opts) => confirmations.setConfirmDialog(opts)}
              defaultCategory="donate"
            />
          </ErrorBoundary>
        );
      default:
        return null;
    }
  };

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <div className="brandTitle">发票管家</div>
          <div className="brandDesc">一站式发票管理 · 识别 · 归档 · 统计 · 验真</div>
        </div>
        {busy.kind === "printing" || busy.kind === "exporting" ? (
          <div className="topbarProgress">
            <span className="topbarProgressText">{busy.step}</span>
            <div className="topbarProgressBar">
              <div className="topbarProgressFill" style={{ width: `${Math.round((busy.done / busy.total) * 100)}%` }} />
            </div>
          </div>
        ) : null}
      </div>

      {confirmations.confirmDialog && (
        <ConfirmDialog
          title={confirmations.confirmDialog.title}
          message={confirmations.confirmDialog.message}
          confirmText={confirmations.confirmDialog.confirmText}
          danger={confirmations.confirmDialog.danger}
          onConfirm={() => {
            confirmations.confirmDialog?.onConfirm();
            confirmations.setConfirmDialog(null);
          }}
          onCancel={() => confirmations.setConfirmDialog(null)}
        />
      )}

      {transferWorkflow.pendingReimbInvoiceIds && (
        <AddToReimbursementDialog
          reimbursements={reimbursementState.allReimbursements}
          invoiceCount={transferWorkflow.pendingReimbInvoiceIds.length}
          onSelectReimbursement={transferWorkflow.handleConfirmAddToReimbursement}
          onCreateNew={transferWorkflow.handleCreateNewForReimbursement}
          onCancel={() => transferWorkflow.setPendingReimbInvoiceIds(null)}
        />
      )}

      {printExport.printJob && (
        <PrintDialog
          previewImages={printExport.printJob.previewImages}
          onClose={() => { void printExport.cancelPrint(); }}
          onPrint={(printerName, copies) => { void printExport.executePrint(printerName, copies); }}
        />
      )}

      <div className="layout">
        <Sidebar activeSection={currentSection} />
        <div className="mainCol">
          <div style={{ display: currentSection === "verify" ? "contents" : "none" }}>
            <ErrorBoundary name="发票验真">
              <VerifyPage
                archiveInvoices={archiveState.invoices}
                allFolders={archiveState.allFolders}
                folders={archiveState.folders}
                onUpdateInvoice={archiveState.updateInvoice}
                showToast={showToast}
              />
            </ErrorBoundary>
          </div>
          {currentSection !== "verify" && renderContent()}
        </div>
      </div>
      {appLegalAccepted !== true && <InitialLegalGate loading={appLegalAccepted === null} onAccepted={() => setAppLegalAccepted(true)} />}
    </div>
  );
}
