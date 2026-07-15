import React, { useEffect, useMemo, useState } from "react";
import type { OcrResult, InvoiceFileItem, InvoiceCategory } from "../types";
import { IconButton } from "./IconButton";
import { Icon, icons } from "./Icons";
import {
  CRITICAL_FIELD_LABELS,
  getFieldDefsByCategory,
  getMissingCriticalFields,
} from "../utils/ocrFieldDefs";

function safe(val?: string) {
  return typeof val === "string" ? val : "";
}

export function OcrFields({
  file,
  value,
  category,
  onChange,

  onCompare: _onCompare
}: {
  file: InvoiceFileItem;
  value?: OcrResult;
  category?: InvoiceCategory;
  onChange: (res: OcrResult) => void;
  onCompare: (q: string) => void;
}) {
  void _onCompare;
  const [fields, setFields] = useState<Record<string, string>>(() => ({ ...(value?.fields || {}) }));
  const fieldDefs = useMemo(() => getFieldDefsByCategory(category), [category]);
  const defaultOrder = useMemo(() => fieldDefs.map((d) => d.key), [fieldDefs]);
  const defMap = useMemo(() => new Map(fieldDefs.map((d) => [d.key, d])), [fieldDefs]);
  const order = useMemo(() => {
    const keys = Object.keys(fields);
    const ordered = [...defaultOrder.filter((k) => keys.includes(k)), ...keys.filter((k) => !defaultOrder.includes(k))];
    return ordered;
  }, [fields, defaultOrder]);
  const missingCritical = useMemo(() => getMissingCriticalFields(fields), [fields]);

  useEffect(() => {
    setFields({ ...(value?.fields || {}) });
  }, [file.id, value?.fields]);

  function setField(k: string, v: string) {
    const next = { ...fields, [k]: v };
    setFields(next);
    const updated: OcrResult = { text: value?.text || "", blocks: value?.blocks, fields: next };
    onChange(updated);
  }

  function removeField(k: string) {
    const next = { ...fields };
    delete next[k];
    setFields(next);
    const updated: OcrResult = { text: value?.text || "", blocks: value?.blocks, fields: next };
    onChange(updated);
  }

  async function copyField(k: string) {
    await navigator.clipboard.writeText(safe(fields[k]));
  }

  return (
    <div style={{ padding: 10 }}>
      {missingCritical.length > 0 && order.length > 0 && (
        <div className="ocrFieldsWarning" role="alert">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>
            缺失关键字段：
            <strong>{missingCritical.map((k) => CRITICAL_FIELD_LABELS[k]).join("、")}</strong>
            ，可能影响归档与验真。
          </span>
        </div>
      )}
      {order.length === 0 ? (
        <div className="placeholder">暂无字段，请先进行识别。</div>
      ) : (
        <div className="fieldsGrid">
          {order.map((k) => {
            const val = safe(fields[k]);
            const def = defMap.get(k);
            const ok = def?.validate ? def.validate(val) : true;
            return (
              <React.Fragment key={k}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: "rgba(255,255,255,0.72)", fontSize: 12 }} title={def?.label || k}>
                    {def?.label || k}
                  </span>
                  {!ok ? <span style={{ color: "rgba(255,106,123,0.85)", fontSize: 12 }}>格式</span> : null}
                </div>
                <input
                  value={val}
                  onChange={(e) => setField(k, e.target.value)}
                  className="searchInput"
                  placeholder={def?.placeholder || "填写或校正"}
                  style={{ borderColor: ok ? "rgba(255,255,255,0.12)" : "rgba(255,106,123,0.55)" }}
                />
                <div className="rowButtons">
                  <IconButton title="复制字段" onClick={() => copyField(k)} disabled={!val}>
                    <Icon d={icons.copy} />
                  </IconButton>
                  <IconButton title="删除字段" onClick={() => removeField(k)}>
                    <Icon d={icons.trash} />
                  </IconButton>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
