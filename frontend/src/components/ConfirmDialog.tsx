import { useEffect } from "react";

export function ConfirmDialog({
  title,
  message,
  confirmText = "确定",
  cancelText = "取消",
  danger = false,
  onConfirm,
  onCancel
}: {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onCancel();
      } else if (e.key === "Enter") {
        onConfirm();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onConfirm, onCancel]);

  return (
    <div className="confirmDialogOverlay" onClick={onCancel}>
      <div className="confirmDialog" onClick={(e) => e.stopPropagation()}>
        <div className="confirmDialogTitle">{title}</div>
        <div className="confirmDialogMessage">{message}</div>
        <div className="confirmDialogActions">
          <button className="confirmDialogBtn confirmDialogBtnCancel" onClick={onCancel}>
            {cancelText}
          </button>
          <button
            className={`confirmDialogBtn ${danger ? "confirmDialogBtnDanger" : "confirmDialogBtnConfirm"}`}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
