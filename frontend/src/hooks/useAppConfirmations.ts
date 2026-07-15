import { useCallback, useState } from "react";
import type { ToastFn } from "../types/ui";

export type ConfirmDialogOptions = {
  title: string;
  message: string;
  confirmText?: string;
  danger?: boolean;
  onConfirm: () => void;
};

export function useAppConfirmations(showToast: ToastFn) {
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogOptions | null>(null);

  const handleClearAll = useCallback((count: number, onConfirm: () => void) => {
    if (count === 0) return;
    setConfirmDialog({
      title: "清空文件",
      message: `确定要清空所有 ${count} 个文件吗？此操作不可撤销。`,
      confirmText: "清空",
      danger: true,
      onConfirm,
    });
  }, []);

  const handleResetPreviewConfig = useCallback((resetPreviewConfig: () => void) => {
    setConfirmDialog({
      title: "重置配置",
      message: "确定要将所有配置恢复为默认值吗？",
      confirmText: "重置",
      danger: true,
      onConfirm: () => {
        resetPreviewConfig();
        showToast("配置已重置", "success");
      },
    });
  }, [showToast]);

  return { confirmDialog, setConfirmDialog, handleClearAll, handleResetPreviewConfig };
}
