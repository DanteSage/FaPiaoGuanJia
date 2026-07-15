export type ToastKind = "success" | "error" | "info" | "warning";

export type ToastAction = {
  label: string;
  onClick: () => void;
};

export type ToastFn = (message: string, kind?: ToastKind, action?: ToastAction) => void;
