import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { Toast, type ToastType } from "../components/Toast";

type ToastAction = { label: string; onClick: () => void };

type ToastContextValue = {
  showToast: (message: string, type?: ToastType, action?: ToastAction) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; type: ToastType; action?: ToastAction } | null>(null);

  const showToast = useCallback((message: string, type: ToastType = "info", action?: ToastAction) => {
    setToast({ message, type, action });
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && <Toast message={toast.message} type={toast.type} action={toast.action} onClose={() => setToast(null)} />}
    </ToastContext.Provider>
  );
}
