import React, { useState } from "react";
import type { InvoiceCategory, ArchiveFilterOptions } from "../../types";
import { CATEGORY_LABELS } from "../../hooks/useArchiveState";

type FilterPanelProps = {
  filter: ArchiveFilterOptions;
  onFilterChange: (filter: ArchiveFilterOptions) => void;
  onClearFilter: () => void;
  availableCategories?: Record<string, number>;
};

const FilterIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
  </svg>
);

const CategoryIcons: Record<InvoiceCategory, JSX.Element> = {
  vat_special: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M9 15l2 2 4-4" />
    </svg>
  ),
  vat_normal: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  electronic: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  ),
  toll: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  ),
  train: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="3" width="16" height="16" rx="2" />
      <path d="M4 11h16" />
      <path d="M12 3v8" />
      <circle cx="8" cy="15" r="1" />
      <circle cx="16" cy="15" r="1" />
      <path d="M8 19l-2 3" />
      <path d="M16 19l2 3" />
    </svg>
  ),
  flight: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
    </svg>
  ),
  rideshare: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
      <path d="M16 16l2 2" />
    </svg>
  ),
  rideshare_invoice: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <circle cx="12" cy="14" r="3" />
      <path d="M12 11v3l1.5 1" />
    </svg>
  ),
  hotel: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 21h18" />
      <path d="M5 21V7l8-4v18" />
      <path d="M19 21V11l-6-4" />
      <path d="M9 9h1" />
      <path d="M9 13h1" />
      <path d="M9 17h1" />
    </svg>
  ),
  taxi: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 17h14v-5H5v5z" />
      <path d="M19 12V9a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3" />
      <path d="M8 7V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <circle cx="7" cy="15" r="1" />
      <circle cx="17" cy="15" r="1" />
      <path d="M5 17l-1 2" />
      <path d="M19 17l1 2" />
    </svg>
  ),
  other: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
};

const CATEGORY_ORDER: InvoiceCategory[] = [
  "vat_special",
  "vat_normal",
  "electronic",
  "toll",
  "train",
  "flight",
  "rideshare",
  "rideshare_invoice",
  "hotel",
  "taxi",
  "other",
];

export function FilterPanel({ filter, onFilterChange, onClearFilter, availableCategories }: FilterPanelProps) {
  const [expanded, setExpanded] = useState(true);

  const displayCategories = availableCategories
    ? CATEGORY_ORDER.filter((cat) => cat in availableCategories)
    : CATEGORY_ORDER;

  const hasActiveFilters = Boolean(
    filter.categories?.length ||
    filter.dateRange?.start ||
    filter.dateRange?.end ||
    filter.amountRange?.min !== undefined ||
    filter.amountRange?.max !== undefined ||
    filter.isVerified !== undefined ||
    filter.isReimbursed !== undefined ||
    filter.sellerName
  );

  const toggleCategory = (category: InvoiceCategory) => {
    const current = filter.categories || [];
    const newCategories = current.includes(category)
      ? current.filter((c) => c !== category)
      : [...current, category];
    onFilterChange({ ...filter, categories: newCategories.length > 0 ? newCategories : undefined });
  };

  const setDateRange = (start?: string, end?: string) => {
    const dateRange = start || end ? { start, end } : undefined;
    onFilterChange({ ...filter, dateRange });
  };

  const setAmountRange = (min?: number, max?: number) => {
    const amountRange = min !== undefined || max !== undefined ? { min, max } : undefined;
    onFilterChange({ ...filter, amountRange });
  };

  const toggleVerified = () => {
    const newValue = filter.isVerified === undefined ? true : filter.isVerified === true ? false : undefined;
    onFilterChange({ ...filter, isVerified: newValue });
  };

  const toggleReimbursed = () => {
    const newValue = filter.isReimbursed === undefined ? true : filter.isReimbursed === true ? false : undefined;
    onFilterChange({ ...filter, isReimbursed: newValue });
  };

  return (
    <div className="filterPanel">
      <div className="filterPanelHeader" onClick={() => setExpanded(!expanded)}>
        <div className="filterPanelTitle">
          {FilterIcon}
          <span>筛选条件</span>
          {hasActiveFilters && <span className="filterBadge">已启用</span>}
        </div>
        <div className="filterPanelHeaderActions">
          {hasActiveFilters && (
            <button
              type="button"
              className="filterClearLink"
              onClick={(e) => {
                e.stopPropagation();
                onClearFilter();
              }}
              title="清除全部筛选条件"
            >
              清除
            </button>
          )}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </div>

      {expanded && (
        <div className="filterPanelBody">
          {                      }
          <div className="filterRowGroup">
            {          }
            <div className="filterSection">
              <div className="filterSectionTitle">开票日期</div>
              <div className="filterDateRange">
                <input
                  type="date"
                  value={filter.dateRange?.start || ""}
                  onChange={(e) => setDateRange(e.target.value || undefined, filter.dateRange?.end)}
                  placeholder="开始日期"
                />
                <span className="filterDateSeparator">至</span>
                <input
                  type="date"
                  value={filter.dateRange?.end || ""}
                  onChange={(e) => setDateRange(filter.dateRange?.start, e.target.value || undefined)}
                  placeholder="结束日期"
                />
              </div>
            </div>

            {          }
            <div className="filterSection">
              <div className="filterSectionTitle">金额范围</div>
              <div className="filterAmountRange">
                <input
                  type="number"
                  value={filter.amountRange?.min ?? ""}
                  onChange={(e) =>
                    setAmountRange(
                      e.target.value ? parseFloat(e.target.value) : undefined,
                      filter.amountRange?.max
                    )
                  }
                  placeholder="最小金额"
                  min="0"
                  step="0.01"
                />
                <span className="filterAmountSeparator">-</span>
                <input
                  type="number"
                  value={filter.amountRange?.max ?? ""}
                  onChange={(e) =>
                    setAmountRange(
                      filter.amountRange?.min,
                      e.target.value ? parseFloat(e.target.value) : undefined
                    )
                  }
                  placeholder="最大金额"
                  min="0"
                  step="0.01"
                />
              </div>
            </div>

            {          }
            <div className="filterSection">
              <div className="filterSectionTitle">状态</div>
              <div className="filterStatusBtns">
                <button
                  className={`filterStatusBtn ${filter.isVerified === true ? "active" : ""} ${
                    filter.isVerified === false ? "inactive" : ""
                  }`}
                  onClick={toggleVerified}
                >
                  {filter.isVerified === true ? "✓ " : filter.isVerified === false ? "✗ " : ""}
                  已验
                </button>
                <button
                  className={`filterStatusBtn ${filter.isReimbursed === true ? "active" : ""} ${
                    filter.isReimbursed === false ? "inactive" : ""
                  }`}
                  onClick={toggleReimbursed}
                >
                  {filter.isReimbursed === true ? "✓ " : filter.isReimbursed === false ? "✗ " : ""}
                  已报
                </button>
              </div>
            </div>
          </div>

          <div className="filterSection filterSectionTypes">
            <div className="filterSectionHeader">
              <div className="filterSectionTitle">发票类型</div>
            </div>
            <div className="filterTypeChips">
              {displayCategories.map((category) => (
                <button
                  key={category}
                  className={`filterTypeChip ${filter.categories?.includes(category) ? "active" : ""}`}
                  onClick={() => toggleCategory(category)}
                >
                  <span className="filterTypeIcon">{CategoryIcons[category]}</span>
                  <span className="filterTypeLabel">{CATEGORY_LABELS[category]}</span>
                  {availableCategories && (
                    <span className="filterTypeCount">{availableCategories[category]}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
