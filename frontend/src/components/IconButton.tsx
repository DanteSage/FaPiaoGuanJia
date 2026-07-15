import React from "react";

export function IconButton({
  title,
  label,
  onClick,
  disabled,
  children
}: {
  title: string;
  label?: string;
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button className="iconBtn" onClick={onClick} disabled={disabled} title={title} aria-label={title}>
      {children}
      {label && <span className="iconBtnLabel">{label}</span>}
    </button>
  );
}

