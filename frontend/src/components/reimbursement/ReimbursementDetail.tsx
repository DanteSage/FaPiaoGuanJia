import { useEffect, useState } from "react";
import type {
  Reimbursement,
  ReimbursementStatus,
  ReimbursementFolder,
  ReimbursementItem,
  ReimbursementStatusUpdateExtra
} from "../../types/reimbursement";
import type { ArchivedInvoice } from "../../types";
import { AddItemDialog } from "./AddItemDialog";
import { CATEGORY_LABELS } from "../../hooks/useArchiveState";
import { DetailImagePreview, DetailPdfPreview } from "../archive/DetailPreview";
import { warmupOfdPreview, warmupOfdPreviewBatch } from "../../utils/ofdWarmup";

type ReimbursementDetailProps = {
  reimbursement: Reimbursement | null;
  onClose?: () => void;
  invoices: ArchivedInvoice[];
  folders?: ReimbursementFolder[];
  onAddItem: (reimbId: string, item: Omit<ReimbursementItem, "id">) => void;
  onRemoveItem: (reimbId: string, itemId: string) => void;
  onUpdateItem: (reimbId: string, itemId: string, updates: Partial<ReimbursementItem>) => void;
  onUpdateReimbursement: (reimbId: string, updates: Partial<Reimbursement>) => void;
  onUpdateStatus: (reimbId: string, status: ReimbursementStatus, extra?: ReimbursementStatusUpdateExtra) => void;
  showToast?: (message: string, type: "success" | "error" | "warning" | "info") => void;
  onPrintReimbursement?: (payload: Record<string, unknown>, invoiceFilePaths: string[]) => Promise<void>;
};

const STATUS_LABELS: Record<string, string> = { draft: "草稿", pending_payment: "待支付", paid: "已支付" };
const STATUS_COLORS: Record<string, string> = { draft: "#64748b", pending_payment: "#facc15", paid: "#4ade80" };
const TYPE_LABELS: Record<string, string> = { travel: "差旅费", transportation: "交通费", accommodation: "住宿费", office: "办公费", entertainment: "招待费", meal: "餐饮费", training: "培训费", communication: "通讯费", medical: "医疗费", other: "其他" };
const TYPE_COLORS: Record<string, string> = { travel: "#3b82f6", transportation: "#0ea5e9", accommodation: "#a855f7", office: "#8b5cf6", entertainment: "#ec4899", meal: "#f43f5e", training: "#14b8a6", communication: "#f97316", medical: "#22c55e", other: "#6366f1" };

const PlusIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const EditIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const TrashIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const EyeIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const REIMBURSEMENT_OFD_WARMUP_DELAY_MS = 120;

export function ReimbursementDetail({ reimbursement, onClose, invoices, folders: _folders, onAddItem, onRemoveItem, onUpdateItem, onUpdateReimbursement: _onUpdateReimbursement, onUpdateStatus, showToast, onPrintReimbursement }: ReimbursementDetailProps) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editPurpose, setEditPurpose] = useState("");
  const [previewInvoice, setPreviewInvoice] = useState<ArchivedInvoice | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!reimbursement) return;

    let cancelled = false;
    const ofdPaths = Array.from(new Set(
      reimbursement.items
        .map((item) => invoices.find((invoice) => invoice.id === item.invoiceId))
        .filter((invoice): invoice is ArchivedInvoice => Boolean(invoice && invoice.fileType === "ofd" && invoice.filePath))
        .map((invoice) => invoice.filePath)
    ));

    if (ofdPaths.length === 0) return;

    const prioritizedPath = previewInvoice?.fileType === "ofd" && previewInvoice.filePath
      ? previewInvoice.filePath
      : null;

    const timer = window.setTimeout(() => {
      const warmPreview = async () => {
        if (prioritizedPath) {
          const filePath = prioritizedPath;
          if (cancelled) return;
          try {
            await warmupOfdPreview(prioritizedPath, { hydratePreview: true });
          } catch (error) {
            if (!cancelled) {
              console.warn("[报销详情] OFD 预览预热失败:", filePath, error);
            }
          }
        }

        const remainingPaths = prioritizedPath
          ? ofdPaths.filter((filePath) => filePath !== prioritizedPath)
          : ofdPaths;

        if (cancelled || remainingPaths.length === 0) return;

        try {
          await warmupOfdPreviewBatch(remainingPaths, 1);
        } catch (error) {
          if (!cancelled) {
            console.warn("[报销详情] OFD 批量预热失败:", error);
          }
        }
      };

      void warmPreview();
    }, REIMBURSEMENT_OFD_WARMUP_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [reimbursement, invoices, previewInvoice]);

  if (!reimbursement) {
    return (
      <>
        <div className="panelHeader">
          <div className="panelHeaderLeft">
            <div className="panelTitle">报销详情</div>
          </div>
          {onClose && (
            <div className="panelHeaderRight">
              <button className="iconBtn" title="关闭详情" onClick={onClose}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          )}
        </div>
        <div className="invoiceDetail">
          <div className="invoiceDetailEmpty">
            <div className="invoiceDetailEmptyIcon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </div>
            <div className="invoiceDetailEmptyText">选择报销查看详情</div>
            <div className="invoiceDetailEmptyHint">在左侧列表中选择一个报销</div>
          </div>
        </div>
      </>
    );
  }

  const handleAddItems = (invoiceIds: string[]) => {
    let added = 0;
    for (const invoiceId of invoiceIds) {
      const invoice = invoices.find(inv => inv.id === invoiceId);
      if (!invoice) continue;
      onAddItem(reimbursement.id, {
        invoiceId: invoice.id,
        invoiceName: invoice.fileName,
        invoiceCode: invoice.invoiceCode,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        amount: invoice.totalAmount || 0,
        taxAmount: invoice.taxAmount,
        category: invoice.category
      });
      added++;
    }
    setShowAddDialog(false);
    if (added > 0) showToast?.(`已添加 ${added} 张发票`, "success");
  };

  const handleSubmit = () => {
    if (reimbursement.items.length === 0) {
      showToast?.("请先添加发票", "warning");
      return;
    }
    onUpdateStatus(reimbursement.id, "pending_payment");
  };

  const handlePay = () => {
    onUpdateStatus(reimbursement.id, "paid");
    showToast?.("报销已支付", "success");
  };

  const handlePrintReimbursement = async () => {
    if (!reimbursement) return;
    if (exporting) return;
    if (!onPrintReimbursement) {
      showToast?.("打印功能未就绪，请稍后重试", "error");
      return;
    }

    const invoiceFilePaths: string[] = [];
    for (const item of reimbursement.items) {
      const invoice = invoices.find((inv) => inv.id === item.invoiceId);
      if (invoice?.filePath) {
        invoiceFilePaths.push(invoice.filePath);
      }
    }

    setExporting(true);
    try {
      const payload: Record<string, unknown> = {
        code: reimbursement.code,
        title: reimbursement.title,
        type: reimbursement.type,
        applicant: reimbursement.applicant,
        department: reimbursement.department,
        status: reimbursement.status,
        createdAt: reimbursement.createdAt,
        purpose: reimbursement.purpose,
        sales: reimbursement.sales,
        costPerDay: reimbursement.costPerDay,
        paymentMethod: reimbursement.paymentMethod,
        bankName: reimbursement.bankName,
        bankAccount: reimbursement.bankAccount,
        notes: reimbursement.notes,
        totalAmount: reimbursement.totalAmount,
        totalTax: reimbursement.totalTax,
        items: reimbursement.items.map((item) => ({
          invoiceNumber: item.invoiceNumber || item.invoiceCode,
          invoiceDate: item.invoiceDate ? formatDate(item.invoiceDate) : "",
          category: CATEGORY_LABELS[item.category as keyof typeof CATEGORY_LABELS] || item.category || "",
          amount: item.amount,
          taxAmount: item.taxAmount,
          invoiceName: item.invoiceName,
        })),
      };

      await onPrintReimbursement(payload, invoiceFilePaths);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      showToast?.(`打印失败：${msg}`, "error");
    } finally {
      setExporting(false);
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;

    const cnMatch = dateStr.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
    if (cnMatch) return `${cnMatch[1]}-${cnMatch[2].padStart(2, '0')}-${cnMatch[3].padStart(2, '0')}`;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  return (
    <>
      <div className="panelHeader">
        <div className="panelHeaderLeft">
          <div className="panelTitle">报销详情</div>
          <span style={{ color: "rgba(255,255,255,0.62)", fontSize: 12 }}>{reimbursement.code}</span>
        </div>
        {onClose && (
          <div className="panelHeaderRight">
            <button className="iconBtn" title="关闭详情" onClick={onClose}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        )}
      </div>
      <div className="invoiceDetail">

        <div className="invoiceDetailSection">
          <div className="invoiceDetailSectionTitle">处理状态</div>
          <div className="reimbursementTimelineHorizontal">
            <div className={`reimbursementTimelineItemH ${reimbursement.status === "draft" || reimbursement.status === "pending_payment" || reimbursement.status === "paid" ? "active" : ""}`}>
              <div className="reimbursementTimelineDotH"></div>
              <div className="reimbursementTimelineTitleH">创建报销</div>
            </div>
            <div className="reimbursementTimelineLineH"></div>
            <div className={`reimbursementTimelineItemH ${reimbursement.status === "pending_payment" || reimbursement.status === "paid" ? "active" : ""}`}>
              <div className="reimbursementTimelineDotH"></div>
              <div className="reimbursementTimelineTitleH">提交待支付</div>
            </div>
            <div className="reimbursementTimelineLineH"></div>
            <div className={`reimbursementTimelineItemH ${reimbursement.status === "paid" ? "active" : ""}`}>
              <div className="reimbursementTimelineDotH"></div>
              <div className="reimbursementTimelineTitleH">已报销</div>
            </div>
          </div>
        </div>

        <div className="invoiceDetailSection">
          <div className="invoiceDetailSectionTitle">基本信息</div>

          <div className="reimbDetailInfoCard">
            <div className="reimbDetailTitle">{reimbursement.title}</div>
            <div className="reimbDetailTags">
              <span className="reimbDetailTag" style={{ background: `${TYPE_COLORS[reimbursement.type] || '#6366f1'}18`, color: TYPE_COLORS[reimbursement.type] || '#6366f1', border: `1px solid ${TYPE_COLORS[reimbursement.type] || '#6366f1'}30` }}>
                {TYPE_LABELS[reimbursement.type]}
              </span>
              <span className="reimbDetailTag" style={{ background: `${STATUS_COLORS[reimbursement.status]}18`, color: STATUS_COLORS[reimbursement.status], border: `1px solid ${STATUS_COLORS[reimbursement.status]}30` }}>
                {STATUS_LABELS[reimbursement.status]}
              </span>
            </div>
          </div>

          <div className="reimbDetailFieldRow">
            <div className="reimbDetailFieldItem">
              <span className="reimbDetailFieldLabel">申请人</span>
              <span className="reimbDetailFieldValue">{reimbursement.applicant}</span>
            </div>
            <div className="reimbDetailFieldItem">
              <span className="reimbDetailFieldLabel">部门</span>
              <span className="reimbDetailFieldValue">{reimbursement.department}</span>
            </div>
          </div>
          <div className="reimbDetailFieldRow">
            <div className="reimbDetailFieldItem">
              <span className="reimbDetailFieldLabel">销售</span>
              <span className="reimbDetailFieldValue">{reimbursement.sales || "-"}</span>
            </div>
            <div className="reimbDetailFieldItem">
              <span className="reimbDetailFieldLabel">费用/天</span>
              <span className="reimbDetailFieldValue">{reimbursement.costPerDay || "-"}</span>
            </div>
          </div>

          {reimbursement.purpose && (
            <div className="reimbDetailPurpose">
              <span className="reimbDetailFieldLabel">报销事由</span>
              <span className="reimbDetailPurposeText">{reimbursement.purpose}</span>
            </div>
          )}
        </div>

        <div className="invoiceDetailSection">
          <div className="invoiceDetailSectionTitle">金额汇总</div>
          <div className="reimbursementSummary">
            <div className="reimbursementSummaryItem">
              <span>发票数量</span>
              <span>{reimbursement.items.length} 张</span>
            </div>
            <div className="reimbursementSummaryItem">
              <span>税额合计</span>
              <span>¥{reimbursement.totalTax.toFixed(2)}</span>
            </div>
            <div className="reimbursementSummaryItem highlight">
              <span>报销总额</span>
              <span>¥{reimbursement.totalAmount.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="invoiceDetailSection">
          <div className="invoiceDetailSectionTitle">
            发票明细
            {reimbursement.status === "draft" && (
              <button className="iconBtn" onClick={() => setShowAddDialog(true)} title="添加发票" style={{ minWidth: "28px", minHeight: "28px", padding: "4px" }}>
                {PlusIcon}
              </button>
            )}
          </div>
          {reimbursement.items.length === 0 ? (
            <div className="invoiceDetailEmpty" style={{ padding: "32px 16px" }}>
              <div className="invoiceDetailEmptyText" style={{ fontSize: "13px" }}>暂无发票</div>
              <div className="invoiceDetailEmptyHint">点击右上角添加发票</div>
            </div>
          ) : (
            <div className="reimbursementItemList">
              {reimbursement.items.map((item, index) => {
                const categoryLabel = CATEGORY_LABELS[item.category as keyof typeof CATEGORY_LABELS] || "其他";
                const inv = invoices.find(i => i.id === item.invoiceId);
                const isDeleted = item.invoiceDeleted || !inv;
                return (
                  <div
                    key={item.id}
                    className="reimbursementItemCard"
                    style={isDeleted ? { opacity: 0.7 } : undefined}
                  >
                    <div className="reimbursementItemCardIndex">{index + 1}</div>
                    <div className="reimbursementItemCardBody">
                      <div className="reimbursementItemCardRow">
                        <div className="reimbursementItemCardMeta">
                          <span className="reimbursementItemCardTag">{categoryLabel}</span>
                          {item.invoiceDate && <span className="reimbursementItemCardDate">{formatDate(item.invoiceDate)}</span>}
                          {isDeleted && (
                            <span
                              className="reimbursementItemCardTag"
                              style={{
                                background: "rgba(229, 57, 53, 0.18)",
                                color: "#ff8a85",
                                border: "1px solid rgba(229, 57, 53, 0.35)",
                              }}
                              title="原发票已从发票管理中删除，无法预览"
                            >
                              原发票已删除
                            </span>
                          )}
                        </div>
                        <div className="reimbursementItemCardRight">
                          <span className="reimbursementItemCardAmount">¥{item.amount.toFixed(2)}</span>
                          <div className="reimbursementItemCardActions">
                            <button
                              className="iconBtn"
                              disabled={isDeleted}
                              style={isDeleted ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
                              onClick={() => {
                                if (isDeleted || !inv) return;
                                if (inv.fileType === "ofd") {
                                  void warmupOfdPreview(inv.filePath, { hydratePreview: true });
                                }
                                setPreviewInvoice(inv);
                              }}
                              title={isDeleted ? "原发票已删除，无法预览" : "预览发票"}
                            >
                              {EyeIcon}
                            </button>
                            {reimbursement.status === "draft" && (
                              <>
                                <button className="iconBtn" onClick={() => { setEditingItemId(item.id); setEditPurpose(item.purpose || ""); }} title="编辑">
                                  {EditIcon}
                                </button>
                                <button className="iconBtn danger" onClick={() => { onRemoveItem(reimbursement.id, item.id); showToast?.("已删除发票", "success"); }} title="删除">
                                  {TrashIcon}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      {reimbursement.status === "draft" && editingItemId === item.id ? (
                        <div className="reimbursementItemCardEdit">
                          <input
                            className="toolbarInput"
                            value={editPurpose}
                            onChange={e => setEditPurpose(e.target.value)}
                            placeholder="用途说明"
                          />
                          <div className="reimbursementItemCardEditBtns">
                            <button onClick={() => {
                              onUpdateItem(reimbursement.id, item.id, { purpose: editPurpose });
                              setEditingItemId(null);
                              showToast?.("已保存", "success");
                            }}>保存</button>
                            <button onClick={() => setEditingItemId(null)}>取消</button>
                          </div>
                        </div>
                      ) : (
                        item.purpose && <div className="reimbursementItemCardPurpose">用途: {item.purpose}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="invoiceDetailActions">
          <button
            onClick={handlePrintReimbursement}
            disabled={exporting || reimbursement.items.length === 0 || !onPrintReimbursement}
            title={reimbursement.items.length === 0 ? "请先添加发票" : "打印报销单（含封面）+ 全部发票，预览后选择打印机"}
          >
            {exporting ? "准备中…" : "打印报销单"}
          </button>
          {reimbursement.status === "draft" && (
            <button onClick={handleSubmit} className="primaryBtn">提交报销</button>
          )}
          {reimbursement.status === "pending_payment" && (
            <button onClick={handlePay} className="primaryBtn">标记为已支付</button>
          )}
        </div>
      </div>

      {showAddDialog && (
        <AddItemDialog
          invoices={invoices.filter(inv => !reimbursement.items.some(item => item.invoiceId === inv.id))}
          onConfirm={handleAddItems}
          onCancel={() => setShowAddDialog(false)}
        />
      )}

      {previewInvoice && (
        <div className="dialogOverlay" onClick={() => setPreviewInvoice(null)}>
          <div className="dialog reimbursementPreviewDialog" onClick={e => e.stopPropagation()}>
            <div className="dialogHeader">
              <div className="dialogTitle">{previewInvoice.fileName}</div>
              <button className="dialogCloseBtn" onClick={() => setPreviewInvoice(null)}>×</button>
            </div>
            <div className="dialogBody reimbursementPreviewDialogBody">
              {previewInvoice.fileType === "image" ? (
                <DetailImagePreview filePath={previewInvoice.filePath} />
              ) : previewInvoice.fileType === "pdf" || previewInvoice.fileType === "ofd" ? (
                <DetailPdfPreview filePath={previewInvoice.filePath} />
              ) : (
                <div className="detailPreviewPlaceholder">暂不支持预览此文件类型</div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
