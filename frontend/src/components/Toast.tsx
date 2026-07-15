import { useEffect, useState } from "react";

export type ToastType = "info" | "success" | "warning" | "error";

const icons: Record<ToastType, string> = {
  info: "ℹ",
  success: "✓",
  warning: "⚠",
  error: "✕"
};

export function Toast({
  message,
  type = "info",
  duration = 3000,
  action,
  onClose
}: {
  message: string;
  type?: ToastType;
  duration?: number;
  action?: { label: string; onClick: () => void };
  onClose: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {

    requestAnimationFrame(() => setVisible(true));

    const timer = setTimeout(() => {
      setExiting(true);
      setTimeout(onClose, 200);
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  return (
    <div
      className={`toastContainer ${visible ? "toastVisible" : ""} ${exiting ? "toastExiting" : ""}`}
      onClick={() => {
        setExiting(true);
        setTimeout(onClose, 200);
      }}
    >
      <div className={`toastIcon toastIcon-${type}`}>
        {icons[type]}
      </div>
      <div className="toastContent">
        <span className="toastMessage">{message}</span>
        {action && (
          <button className="toastAction" onClick={(e) => { e.stopPropagation(); action.onClick(); onClose(); }}>
            {action.label}
          </button>
        )}
      </div>
      <div className="toastProgress">
        <div
          className={`toastProgressBar toastProgressBar-${type}`}
          style={{ animationDuration: `${duration}ms` }}
        />
      </div>
    </div>
  );
}
