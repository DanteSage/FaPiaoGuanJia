import React, { useState, useRef, useEffect } from "react";

interface Option {
  value: string;
  label: string;
}

interface CustomSelectProps {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  className?: string;
}

export function CustomSelect({ value, options, onChange, className = "" }: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(opt => opt.value === value);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={`customSelect ${className}`} ref={containerRef}>
      <div className="customSelectTrigger" onClick={() => setIsOpen(!isOpen)}>
        <span className="customSelectValue">{selectedOption?.label || ""}</span>
        <span className="customSelectArrow">▾</span>
      </div>
      {isOpen && (
        <div className="customSelectDropdown">
          {options.map(opt => (
            <div
              key={opt.value}
              className={`customSelectOption ${opt.value === value ? "customSelectOptionActive" : ""}`}
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
