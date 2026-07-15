import React, { useState, useRef, useEffect } from "react";

type Option = {
  value: string;
  label: string;
};

type CustomSelectProps = {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  className?: string;
};

export function CustomSelect({ value, options, onChange, className }: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={`customSelect ${className || ""}`} ref={ref}>
      <button
        type="button"
        className="customSelectTrigger"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>{selectedOption?.label || "请选择"}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {isOpen && (
        <div className="customSelectDropdown">
          {options.map((opt) => (
            <div
              key={opt.value}
              className={`customSelectOption ${opt.value === value ? "active" : ""}`}
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
              }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
