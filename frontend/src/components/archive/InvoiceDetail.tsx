import React, { useState, useEffect } from "react";
import type { ArchivedInvoice, InvoiceCategory, InvoiceTag, InvoiceFolder } from "../../types";
import { CATEGORY_LABELS } from "../../hooks/useArchiveState";
import { DetailImagePreview, DetailPdfPreview } from "./DetailPreview";
import { warmupOfdPreview } from "../../utils/ofdWarmup";

type InvoiceDetailProps = {
  invoice: ArchivedInvoice | null;
  tags: InvoiceTag[];
  folders: InvoiceFolder[];
  onUpdate: (id: string, updates: Partial<ArchivedInvoice>) => void;
  onAddTag: (invoiceId: string, tagId: string) => void;
  onRemoveTag: (invoiceId: string, tagId: string) => void;
  onMoveToFolder: (invoiceId: string, folderId: string | null) => void;
};

const FileIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

const EditIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const FolderIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

const TagIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
    <line x1="7" y1="7" x2="7.01" y2="7" />
  </svg>
);

const CloseIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

function formatAmount(amount?: number): string {
  if (amount === undefined || amount === null) return "-";
  return `¥${amount.toFixed(2)}`;
}

const FIELD_LABELS: Record<string, string> = {

  train_no: "车次",
  from_station: "出发站",
  to_station: "到达站",
  travel_date: "乘车日期",
  depart: "发车时间",
  depart_time: "发车时间",
  seat_level: "席别",
  seat_class: "席别",
  seat: "座位号",
  seat_number: "座位号",
  carriage: "车厢",
  passenger_name: "乘客姓名",
  id_number: "身份证号",
  id_card: "身份证号",
  e_ticket_no: "电子客票号",
  tax_rate: "税率",
  invoice_type: "发票类型",

  buyer_tax_id: "购方税号",
  seller_tax_id: "销方税号",
  buyer_name: "购方名称",
  seller_name: "销方名称",
  check_code: "校验码",
  machine_code: "机器编号",
  remark: "备注",

  car_type: "车型",
  start_time: "上车时间",
  end_time: "下车时间",
  mileage: "里程",
  start_location: "上车地点",
  end_location: "下车地点",
};

function getFieldLabel(key: string): string {
  return FIELD_LABELS[key] || key;
}

export function InvoiceDetail({
  invoice,
  tags,
  folders,
  onUpdate,
  onAddTag,
  onRemoveTag,
  onMoveToFolder,
}: InvoiceDetailProps) {
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notes, setNotes] = useState("");
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [showFolderDropdown, setShowFolderDropdown] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [isOtherInfoExpanded, setIsOtherInfoExpanded] = useState(false);
  const [editingField, setEditingField] = useState<keyof ArchivedInvoice | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editingOcrKey, setEditingOcrKey] = useState<string | null>(null);

  const NUMERIC_FIELDS: ReadonlyArray<keyof ArchivedInvoice> = ["totalAmount", "amount", "taxAmount"];

  const startEdit = (field: keyof ArchivedInvoice, currentValue: string | number | undefined | null) => {
    setEditingField(field);
    setEditValue(currentValue !== undefined && currentValue !== null ? String(currentValue) : "");
  };

  const commitEdit = () => {
    if (!invoice || !editingField) return;
    const trimmed = editValue.trim();

    if (NUMERIC_FIELDS.includes(editingField)) {
      if (trimmed === "") {
        if (invoice[editingField] !== undefined) {
          onUpdate(invoice.id, { [editingField]: undefined } as Partial<ArchivedInvoice>);
        }
      } else {
        const num = parseFloat(trimmed);
        if (Number.isNaN(num) || num < 0) {
          setEditingField(null);
          return;
        }
        const rounded = Math.round(num * 100) / 100;
        if (rounded !== invoice[editingField]) {
          const updates: Partial<ArchivedInvoice> = { [editingField]: rounded } as Partial<ArchivedInvoice>;

          if (editingField === "totalAmount") {
            const oldAmount = invoice.amount;
            const oldTax = invoice.taxAmount;
            if (typeof oldAmount === "number" && typeof oldTax === "number" && oldAmount > 0) {
              const taxRate = oldTax / oldAmount;
              const newAmount = Math.round((rounded / (1 + taxRate)) * 100) / 100;
              const newTax = Math.round((rounded - newAmount) * 100) / 100;
              updates.amount = newAmount;
              updates.taxAmount = newTax;
            } else if (typeof oldTax === "number" && rounded >= oldTax) {
              updates.amount = Math.round((rounded - oldTax) * 100) / 100;
            } else if (typeof oldAmount === "number" && rounded >= oldAmount) {
              updates.taxAmount = Math.round((rounded - oldAmount) * 100) / 100;
            }
          }

          onUpdate(invoice.id, updates);
        }
      }
    } else {
      let finalValue: string | undefined = trimmed || undefined;

      if (editingField === "invoiceDate" && finalValue) {
        const digits = finalValue.replace(/[^\d]/g, "");
        if (digits.length === 8) {
          const y = digits.slice(0, 4);
          const m = digits.slice(4, 6);
          const d = digits.slice(6, 8);
          finalValue = `${y}年${parseInt(m)}月${parseInt(d)}日`;
        } else if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(finalValue)) {
          const parts = finalValue.split(/[-/]/);
          finalValue = `${parts[0]}年${parseInt(parts[1])}月${parseInt(parts[2])}日`;
        } else if (!finalValue.includes("年")) {
          finalValue = undefined;
        }
      }

      const original = (invoice[editingField] as string | undefined) ?? "";
      if ((finalValue ?? "") !== original) {
        onUpdate(invoice.id, { [editingField]: finalValue } as Partial<ArchivedInvoice>);
      }
    }

    setEditingField(null);
  };

  const cancelEdit = () => {
    setEditingField(null);
  };

  const startOcrEdit = (key: string, currentValue: string | undefined) => {
    setEditingOcrKey(key);
    setEditValue(currentValue ?? "");
  };

  const commitOcrEdit = () => {
    if (!invoice || !editingOcrKey || !invoice.ocrResult?.fields) {
      setEditingOcrKey(null);
      return;
    }
    const trimmed = editValue.trim();
    const original = invoice.ocrResult.fields[editingOcrKey] ?? "";
    if (trimmed !== original) {
      const updatedFields = { ...invoice.ocrResult.fields };
      if (trimmed) {
        updatedFields[editingOcrKey] = trimmed;
      } else {
        delete updatedFields[editingOcrKey];
      }
      onUpdate(invoice.id, { ocrResult: { ...invoice.ocrResult, fields: updatedFields } });
    }
    setEditingOcrKey(null);
  };

  const cancelOcrEdit = () => {
    setEditingOcrKey(null);
  };

  useEffect(() => {
    if (invoice) {
      setNotes(invoice.notes || "");
      setIsEditingNotes(false);
    }
  }, [invoice?.id, invoice]);

  useEffect(() => {
    if (!invoice) return;
    const ext = invoice.fileExt?.toLowerCase() || invoice.filePath.split('.').pop()?.toLowerCase();
    if (ext === 'ofd') {
      void warmupOfdPreview(invoice.filePath, { hydratePreview: true });
    }
  }, [invoice?.id, invoice?.filePath, invoice?.fileExt]);

  const renderPreview = () => {
    if (!invoice) return null;

    const ext = invoice.fileExt?.toLowerCase() || invoice.filePath.split('.').pop()?.toLowerCase();

    if (ext === 'pdf' || ext === 'ofd') {
      return <DetailPdfPreview filePath={invoice.filePath} />;
    }

    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tiff', 'tif'].includes(ext || '')) {
      return <DetailImagePreview filePath={invoice.filePath} />;
    }

    return (
      <div className="invoiceDetailPreviewPlaceholder">
        {FileIcon}
        <span>暂不支持预览此文件类型</span>
      </div>
    );
  };

  const handleSaveNotes = () => {
    if (invoice) {
      onUpdate(invoice.id, { notes });
      setIsEditingNotes(false);
    }
  };

  if (!invoice) {
    return (
      <div className="invoiceDetailEmpty">
        <div className="invoiceDetailEmptyIcon">{FileIcon}</div>
        <div className="invoiceDetailEmptyText">选择发票查看详情</div>
      </div>
    );
  }

  const userFolders = folders.filter((f) => !f.id.startsWith("__"));
  const currentFolder = folders.find((f) => f.id === invoice.folderId);
  const invoiceTags = invoice.tagIds.map((id) => tags.find((t) => t.id === id)).filter(Boolean) as InvoiceTag[];
  const availableTags = tags.filter((t) => !invoice.tagIds.includes(t.id));

  return (
    <div className="invoiceDetail">

      <div className="invoiceDetailPreview">
        {renderPreview()}
      </div>

      <div className="invoiceDetailSection">
        <div className="invoiceDetailSectionTitle">基本信息</div>
        <div className="invoiceDetailGrid">
          <div className="invoiceDetailField">
            <label>文件名</label>
            <span title={invoice.fileName}>{invoice.fileName}</span>
          </div>
          <div className="invoiceDetailField invoiceDetailFieldCategory">
            <label>类型</label>
            <div className="invoiceDetailCategorySelect">
              <button
                className="invoiceDetailCategoryBtn"
                onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                title="点击手动修正识别错误的类别"
              >
                <span>{CATEGORY_LABELS[invoice.category]}</span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {showCategoryDropdown && (
                <div className="invoiceDetailDropdown invoiceDetailCategoryDropdown">
                  {(Object.keys(CATEGORY_LABELS) as InvoiceCategory[]).map((cat) => (
                    <div
                      key={cat}
                      className={`invoiceDetailDropdownItem ${invoice.category === cat ? "active" : ""}`}
                      onClick={() => {
                        if (invoice.category !== cat) {
                          onUpdate(invoice.id, { category: cat });
                        }
                        setShowCategoryDropdown(false);
                      }}
                    >
                      {CATEGORY_LABELS[cat]}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="invoiceDetailField">
            <label>发票代码</label>
            <span>{invoice.invoiceCode || "-"}</span>
          </div>
          <div className="invoiceDetailField">
            <label>发票号码</label>
            {editingField === "invoiceNumber" ? (
              <input
                type="text"
                className="invoiceDetailInlineInput"
                value={editValue}
                autoFocus
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitEdit();
                  else if (e.key === "Escape") cancelEdit();
                }}
                onBlur={commitEdit}
              />
            ) : (
              <span
                className="invoiceDetailEditableSpan"
                title="双击手动修正发票号码"
                onDoubleClick={() => startEdit("invoiceNumber", invoice.invoiceNumber)}
              >
                {invoice.invoiceNumber || "-"}
              </span>
            )}
          </div>
          <div className="invoiceDetailField">
            <label>开票日期</label>
            {editingField === "invoiceDate" ? (
              <input
                type="text"
                className="invoiceDetailInlineInput"
                value={editValue}
                autoFocus
                placeholder="如 2025-12-25"
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitEdit();
                  else if (e.key === "Escape") cancelEdit();
                }}
                onBlur={commitEdit}
              />
            ) : (
              <span
                className="invoiceDetailEditableSpan"
                title="双击手动修正开票日期"
                onDoubleClick={() => startEdit("invoiceDate", invoice.invoiceDate)}
              >
                {invoice.invoiceDate || "-"}
              </span>
            )}
          </div>
          <div className="invoiceDetailField">
            <label>税率</label>
            {editingOcrKey === "tax_rate" ? (
              <input
                type="text"
                className="invoiceDetailInlineInput"
                value={editValue}
                autoFocus
                placeholder="如 9%"
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitOcrEdit();
                  else if (e.key === "Escape") cancelOcrEdit();
                }}
                onBlur={commitOcrEdit}
              />
            ) : (
              <span
                className="invoiceDetailEditableSpan"
                title="双击手动修正税率"
                onDoubleClick={() => startOcrEdit("tax_rate", invoice.ocrResult?.fields?.tax_rate || invoice.ocrResult?.fields?.["税率"])}
              >
                {invoice.ocrResult?.fields?.tax_rate || invoice.ocrResult?.fields?.["税率"] || "-"}
              </span>
            )}
          </div>
          <div className="invoiceDetailField">
            <label>金额</label>
            <span>{formatAmount(invoice.amount)}</span>
          </div>
          <div className="invoiceDetailField">
            <label>税额</label>
            <span>{formatAmount(invoice.taxAmount)}</span>
          </div>
          <div className="invoiceDetailField">
            <label>价税合计</label>
            {editingField === "totalAmount" ? (
              <input
                type="number"
                step="0.01"
                min="0"
                className="invoiceDetailInlineInput invoiceDetailInlineInputAmount"
                value={editValue}
                autoFocus
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitEdit();
                  else if (e.key === "Escape") cancelEdit();
                }}
                onBlur={commitEdit}
              />
            ) : (
              <span
                className="invoiceDetailAmount invoiceDetailEditableSpan"
                title="双击手动修正价税合计"
                onDoubleClick={() => startEdit("totalAmount", invoice.totalAmount)}
              >
                {formatAmount(invoice.totalAmount)}
              </span>
            )}
          </div>
          <div className="invoiceDetailField invoiceDetailFieldFull">
            <label>销方名称</label>
            {editingField === "sellerName" ? (
              <input
                type="text"
                className="invoiceDetailInlineInput"
                value={editValue}
                autoFocus
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitEdit();
                  else if (e.key === "Escape") cancelEdit();
                }}
                onBlur={commitEdit}
              />
            ) : (
              <span
                className="invoiceDetailEditableSpan"
                title="双击手动修正销方名称"
                onDoubleClick={() => startEdit("sellerName", invoice.sellerName)}
              >
                {invoice.sellerName || "-"}
              </span>
            )}
          </div>
          <div className="invoiceDetailField invoiceDetailFieldFull">
            <label>购方名称</label>
            {editingField === "buyerName" ? (
              <input
                type="text"
                className="invoiceDetailInlineInput"
                value={editValue}
                autoFocus
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitEdit();
                  else if (e.key === "Escape") cancelEdit();
                }}
                onBlur={commitEdit}
              />
            ) : (
              <span
                className="invoiceDetailEditableSpan"
                title="双击手动修正购方名称"
                onDoubleClick={() => startEdit("buyerName", invoice.buyerName)}
              >
                {invoice.buyerName || "-"}
              </span>
            )}
          </div>
        </div>
      </div>

      {invoice.ocrResult?.fields && Object.keys(invoice.ocrResult.fields).filter(key =>
        !["发票代码", "发票号码", "开票日期", "价税合计", "金额", "税额", "销售方名称", "购买方名称",
          "invoice_code", "invoice_number", "date", "amount", "tax", "seller_name", "buyer_name", "total_amount",
          "invoiceCode", "invoiceNumber", "invoiceDate", "totalAmount", "taxAmount", "sellerName", "buyerName",
          "tax_rate"
        ].includes(key)
      ).length > 0 && (
        <div className="invoiceDetailSection">
          <div
            className="invoiceDetailSectionTitle invoiceDetailCollapsible"
            onClick={() => setIsOtherInfoExpanded(!isOtherInfoExpanded)}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ transform: isOtherInfoExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <span>其他信息</span>
          </div>
          {isOtherInfoExpanded && (
            <div className="invoiceDetailGrid">
              {Object.entries(invoice.ocrResult.fields)
                .filter(([key]) => !["发票代码", "发票号码", "开票日期", "价税合计", "金额", "税额", "销售方名称", "购买方名称",
                  "invoice_code", "invoice_number", "date", "amount", "tax", "seller_name", "buyer_name", "total_amount",
                  "invoiceCode", "invoiceNumber", "invoiceDate", "totalAmount", "taxAmount", "sellerName", "buyerName",
                  "tax_rate"
                ].includes(key))
                .map(([key, value]) => (
                  <div key={key} className="invoiceDetailField">
                    <label>{getFieldLabel(key)}</label>
                    {key === "tax_rate" && editingOcrKey === "tax_rate" ? (
                      <input
                        type="text"
                        className="invoiceDetailInlineInput"
                        value={editValue}
                        autoFocus
                        placeholder="如 0.09"
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitOcrEdit();
                          else if (e.key === "Escape") cancelOcrEdit();
                        }}
                        onBlur={commitOcrEdit}
                      />
                    ) : key === "tax_rate" ? (
                      <span
                        className="invoiceDetailEditableSpan"
                        title="双击手动修正税率"
                        onDoubleClick={() => startOcrEdit("tax_rate", value)}
                      >
                        {value || "-"}
                      </span>
                    ) : (
                      <span>{value || "-"}</span>
                    )}
                  </div>
                ))
              }
            </div>
          )}
        </div>
      )}

      <div className="invoiceDetailSection">
        <div className="invoiceDetailSectionTitle">状态</div>
        <div className="invoiceDetailStatus">
          <label className="invoiceDetailCheckbox">
            <input
              type="checkbox"
              checked={invoice.isVerified || false}
              onChange={(e) => onUpdate(invoice.id, { isVerified: e.target.checked })}
            />
            <span>已验真</span>
          </label>
          <label className="invoiceDetailCheckbox">
            <input
              type="checkbox"
              checked={invoice.isReimbursed || false}
              onChange={(e) => onUpdate(invoice.id, { isReimbursed: e.target.checked })}
            />
            <span>已报销</span>
          </label>
        </div>
      </div>

      <div className="invoiceDetailSection">
        <div className="invoiceDetailSectionTitle">
          {FolderIcon}
          <span>所属分类</span>
        </div>
        <div className="invoiceDetailFolderSelect">
          <button
            className="invoiceDetailDropdownBtn"
            onClick={() => setShowFolderDropdown(!showFolderDropdown)}
          >
            {currentFolder ? currentFolder.name : "未分类"}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {showFolderDropdown && (
            <div className="invoiceDetailDropdown">
              <div
                className={`invoiceDetailDropdownItem ${!invoice.folderId ? "active" : ""}`}
                onClick={() => {
                  onMoveToFolder(invoice.id, null);
                  setShowFolderDropdown(false);
                }}
              >
                未分类
              </div>
              {userFolders.map((folder) => (
                <div
                  key={folder.id}
                  className={`invoiceDetailDropdownItem ${invoice.folderId === folder.id ? "active" : ""}`}
                  onClick={() => {
                    onMoveToFolder(invoice.id, folder.id);
                    setShowFolderDropdown(false);
                  }}
                >
                  {folder.name}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="invoiceDetailSection">
        <div className="invoiceDetailSectionTitle">
          {TagIcon}
          <span>标签</span>
        </div>
        <div className="invoiceDetailTags">
          {invoiceTags.map((tag) => (
            <span key={tag.id} className="invoiceDetailTag" style={{ backgroundColor: tag.color }}>
              {tag.name}
              <button
                className="invoiceDetailTagRemove"
                onClick={() => onRemoveTag(invoice.id, tag.id)}
              >
                {CloseIcon}
              </button>
            </span>
          ))}
          <div className="invoiceDetailTagAdd">
            <button
              className="invoiceDetailTagAddBtn"
              onClick={() => setShowTagDropdown(!showTagDropdown)}
            >
              + 添加标签
            </button>
            {showTagDropdown && (
              <div className="invoiceDetailDropdown">
                {availableTags.length > 0 ? (
                  availableTags.map((tag) => (
                    <div
                      key={tag.id}
                      className="invoiceDetailDropdownItem"
                      onClick={() => {
                        onAddTag(invoice.id, tag.id);
                        setShowTagDropdown(false);
                      }}
                    >
                      <span className="invoiceDetailDropdownTagColor" style={{ backgroundColor: tag.color }} />
                      {tag.name}
                    </div>
                  ))
                ) : (
                  <div className="invoiceDetailDropdownEmpty">暂无可用标签</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="invoiceDetailSection">
        <div className="invoiceDetailSectionTitle">
          <span>备注</span>
          {!isEditingNotes && (
            <button className="invoiceDetailEditBtn" onClick={() => setIsEditingNotes(true)}>
              {EditIcon}
            </button>
          )}
        </div>
        {isEditingNotes ? (
          <div className="invoiceDetailNotesEdit">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="添加备注..."
              rows={3}
            />
            <div className="invoiceDetailNotesActions">
              <button onClick={() => setIsEditingNotes(false)}>取消</button>
              <button className="primary" onClick={handleSaveNotes}>
                保存
              </button>
            </div>
          </div>
        ) : (
          <div className="invoiceDetailNotes">
            {invoice.notes || <span className="muted">暂无备注</span>}
          </div>
        )}
      </div>

      <div className="invoiceDetailMeta">
        <span>添加时间：{new Date(invoice.createdAt).toLocaleString()}</span>
        <span>更新时间：{new Date(invoice.updatedAt).toLocaleString()}</span>
      </div>
    </div>
  );
}
