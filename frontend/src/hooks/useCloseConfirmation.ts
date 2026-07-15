import { useEffect } from "react";
import type { ConfirmDialogOptions } from "./useAppConfirmations";

type Params = {
  setConfirmDialog: (dialog: ConfirmDialogOptions | null) => void;
};

export function useCloseConfirmation(params: Params) {
  const { setConfirmDialog } = params;

  useEffect(() => {
    const handleConfirmClose = () => {
      setConfirmDialog({
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
  }, [setConfirmDialog]);
}
