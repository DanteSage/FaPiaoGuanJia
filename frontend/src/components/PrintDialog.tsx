import { useEffect, useState, useCallback } from "react";

type Printer = {
  name: string;
  isDefault: boolean;
};

export function PrintDialog({
  previewImages,
  onClose,
  onPrint
}: {
  previewImages: string[];
  onClose: () => void;
  onPrint: (printerName: string, copies: number) => void;
}) {
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>("");
  const [copies, setCopies] = useState(1);
  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    async function loadPrinters() {
      try {
        const list = await window.invoiceApi.getPrinters();
        setPrinters(list || []);
        const defaultPrinter = list?.find((p) => p.isDefault);
        if (defaultPrinter) {
          setSelectedPrinter(defaultPrinter.name);
        } else if (list && list.length > 0) {
          setSelectedPrinter(list[0].name);
        }
      } catch (err) {
        console.error("获取打印机列表失败:", err);
        setPrinters([]);
      } finally {
        setLoading(false);
      }
    }
    loadPrinters();
  }, []);

  const handlePrint = useCallback(() => {
    if (!selectedPrinter || printing) return;
    setPrinting(true);
    onPrint(selectedPrinter, copies);
  }, [selectedPrinter, copies, onPrint, printing]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "Enter" && selectedPrinter && !loading && !printing) {
        handlePrint();
      } else if (e.key === "ArrowLeft" && currentPage > 0) {
        setCurrentPage((p) => p - 1);
      } else if (e.key === "ArrowRight" && currentPage < previewImages.length - 1) {
        setCurrentPage((p) => p + 1);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, selectedPrinter, loading, printing, currentPage, previewImages.length, handlePrint]);

  return (
    <div className="printDialogOverlay" onClick={onClose}>
      <div className="printDialog" onClick={(e) => e.stopPropagation()}>
        <div className="printDialogHeader">
          <div className="printDialogTitle">打印</div>
          <button className="printDialogClose" onClick={onClose} disabled={printing}>×</button>
        </div>

        <div className="printDialogBody">
          {             }
          <div className="printSettings">
            <div className="printSettingsSection">
              <div className="printSettingsLabel">打印机</div>
              {loading ? (
                <div className="printSettingsLoading">加载打印机...</div>
              ) : printers.length === 0 ? (
                <div className="printSettingsEmpty">未找到打印机</div>
              ) : (
                <select
                  className="printSelect"
                  value={selectedPrinter}
                  onChange={(e) => setSelectedPrinter(e.target.value)}
                  disabled={printing}
                >
                  {printers.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name} {p.isDefault ? "(默认)" : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="printSettingsSection">
              <div className="printSettingsLabel">份数</div>
              <input
                type="number"
                className="printInput"
                value={copies}
                min={1}
                max={99}
                onChange={(e) => setCopies(Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
                disabled={printing}
              />
            </div>

            <div className="printSettingsSection">
              <div className="printSettingsLabel">页面</div>
              <div className="printPageInfo">
                共 {previewImages.length} 页
              </div>
            </div>

            <div className="printSettingsHint">
              <span>提示：← → 翻页，Enter 打印，Esc 关闭</span>
            </div>
          </div>

          {             }
          <div className="printPreview">
            <div className="printPreviewHeader">
              <button
                className="printPreviewNav"
                disabled={currentPage <= 0}
                onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
              >
                ‹
              </button>
              <span className="printPreviewPageInfo">
                {currentPage + 1} / {previewImages.length}
              </span>
              <button
                className="printPreviewNav"
                disabled={currentPage >= previewImages.length - 1}
                onClick={() => setCurrentPage((p) => Math.min(previewImages.length - 1, p + 1))}
              >
                ›
              </button>
            </div>
            <div className="printPreviewContent">
              {previewImages[currentPage] ? (
                <img
                  src={previewImages[currentPage]}
                  alt={`第 ${currentPage + 1} 页`}
                  className="printPreviewImage"
                />
              ) : (
                <div className="printPreviewEmpty">无预览</div>
              )}
            </div>
          </div>
        </div>

        <div className="printDialogFooter">
          <button className="printDialogBtn printDialogBtnCancel" onClick={onClose} disabled={printing}>
            取消
          </button>
          <button
            className="printDialogBtn printDialogBtnPrint"
            onClick={handlePrint}
            disabled={!selectedPrinter || loading || printing}
          >
            {printing ? "打印中..." : "打印"}
          </button>
        </div>
      </div>
    </div>
  );
}
