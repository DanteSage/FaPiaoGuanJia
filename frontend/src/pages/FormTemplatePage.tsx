import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UseSettingsReturn, FormTemplate, FormTemplatePageSize } from "../hooks/useSettings";
import { defaultFormTemplate, FORM_TEMPLATE_PRESETS } from "../hooks/useSettings";
import type { ToastFn } from "../types/ui";
import { PrintDialog } from "../components/PrintDialog";

const PREVIEW_DEBOUNCE_MS = 320;

const SAMPLE_ITEMS = [
  { invoiceNumber: "SAMPLE-001", invoiceDate: "2026-03-12", category: "示例·交通费", amount: 1248.0, taxAmount: 76.42, invoiceName: "示例·高铁票" },
  { invoiceNumber: "SAMPLE-002", invoiceDate: "2026-03-13", category: "示例·住宿费", amount: 1680.0, taxAmount: 92.31, invoiceName: "示例·酒店发票" },
  { invoiceNumber: "SAMPLE-003", invoiceDate: "2026-03-14", category: "示例·餐饮费", amount: 758.5, taxAmount: 41.2, invoiceName: "示例·餐饮发票" },
  { invoiceNumber: "SAMPLE-004", invoiceDate: "2026-03-14", category: "示例·交通费", amount: 600.0, taxAmount: 37.43, invoiceName: "示例·出租车票" },
  { invoiceNumber: "SAMPLE-005", invoiceDate: "2026-03-15", category: "示例·办公费", amount: 320.0, taxAmount: 19.56, invoiceName: "示例·办公用品" },
  { invoiceNumber: "SAMPLE-006", invoiceDate: "2026-03-15", category: "示例·通讯费", amount: 150.0, taxAmount: 9.17, invoiceName: "示例·话费充值" },
  { invoiceNumber: "SAMPLE-007", invoiceDate: "2026-03-16", category: "示例·餐饮费", amount: 280.0, taxAmount: 17.11, invoiceName: "示例·工作餐" },
  { invoiceNumber: "SAMPLE-008", invoiceDate: "2026-03-16", category: "示例·交通费", amount: 95.0, taxAmount: 5.81, invoiceName: "示例·地铁票" },
  { invoiceNumber: "SAMPLE-009", invoiceDate: "2026-03-17", category: "示例·住宿费", amount: 890.0, taxAmount: 54.39, invoiceName: "示例·酒店发票" },
  { invoiceNumber: "SAMPLE-010", invoiceDate: "2026-03-17", category: "示例·交通费", amount: 460.0, taxAmount: 28.13, invoiceName: "示例·机票" },
  { invoiceNumber: "SAMPLE-011", invoiceDate: "2026-03-18", category: "示例·餐饮费", amount: 358.0, taxAmount: 21.89, invoiceName: "示例·客户宴请" },
  { invoiceNumber: "SAMPLE-012", invoiceDate: "2026-03-18", category: "示例·办公费", amount: 188.0, taxAmount: 11.49, invoiceName: "示例·打印耗材" },
  { invoiceNumber: "SAMPLE-013", invoiceDate: "2026-03-19", category: "示例·交通费", amount: 240.0, taxAmount: 14.67, invoiceName: "示例·出租车票" },
  { invoiceNumber: "SAMPLE-014", invoiceDate: "2026-03-19", category: "示例·餐饮费", amount: 420.0, taxAmount: 25.69, invoiceName: "示例·团队聚餐" },
  { invoiceNumber: "SAMPLE-015", invoiceDate: "2026-03-20", category: "示例·通讯费", amount: 100.0, taxAmount: 6.11, invoiceName: "示例·话费充值" },
  { invoiceNumber: "SAMPLE-016", invoiceDate: "2026-03-20", category: "示例·住宿费", amount: 780.0, taxAmount: 47.65, invoiceName: "示例·酒店发票" },
  { invoiceNumber: "SAMPLE-017", invoiceDate: "2026-03-21", category: "示例·交通费", amount: 520.0, taxAmount: 31.78, invoiceName: "示例·高铁票" },
  { invoiceNumber: "SAMPLE-018", invoiceDate: "2026-03-21", category: "示例·办公费", amount: 260.0, taxAmount: 15.89, invoiceName: "示例·办公用品" },
  { invoiceNumber: "SAMPLE-019", invoiceDate: "2026-03-22", category: "示例·餐饮费", amount: 198.0, taxAmount: 12.10, invoiceName: "示例·工作餐" },
  { invoiceNumber: "SAMPLE-020", invoiceDate: "2026-03-22", category: "示例·交通费", amount: 380.0, taxAmount: 23.23, invoiceName: "示例·机票" },
  { invoiceNumber: "SAMPLE-021", invoiceDate: "2026-03-23", category: "示例·住宿费", amount: 920.0, taxAmount: 56.21, invoiceName: "示例·酒店发票" },
  { invoiceNumber: "SAMPLE-022", invoiceDate: "2026-03-23", category: "示例·餐饮费", amount: 326.0, taxAmount: 19.92, invoiceName: "示例·客户宴请" },
  { invoiceNumber: "SAMPLE-023", invoiceDate: "2026-03-24", category: "示例·办公费", amount: 180.0, taxAmount: 11.00, invoiceName: "示例·办公用品" },
  { invoiceNumber: "SAMPLE-024", invoiceDate: "2026-03-24", category: "示例·交通费", amount: 350.0, taxAmount: 21.40, invoiceName: "示例·高铁票" },
  { invoiceNumber: "SAMPLE-025", invoiceDate: "2026-03-25", category: "示例·通讯费", amount: 120.0, taxAmount: 7.34, invoiceName: "示例·话费充值" },
];

function buildBlankData(): Record<string, unknown> {
  // 用单个空格占位，让后端绘制完整布局但视觉上为空（避免字段为空时整行/整块被跳过）
  const blank = " ";
  return {
    code: "",
    title: "费用报销单",
    type: "",
    applicant: "",
    department: "",
    status: "draft",
    createdAt: "",
    purpose: blank,
    endpoint: blank,
    sales: blank,
    costPerDay: blank,
    notes: blank,
    totalAmount: 0,
    totalTax: 0,
    items: [],
  };
}

function buildSampleData(rows: number): Record<string, unknown> {
  const items = SAMPLE_ITEMS.slice(0, rows);
  const totalAmount = items.reduce((s, i) => s + i.amount, 0);
  const totalTax = items.reduce((s, i) => s + i.taxAmount, 0);
  return {
    code: "BX-SAMPLE-0001",
    title: "费用报销单（示例预览）",
    type: "示例·差旅费",
    applicant: "示例·张三",
    department: "示例·技术研发部",
    status: "draft",
    createdAt: "示例·2026-03-12",
    purpose: "示例·北京",
    endpoint: "示例·上海",
    sales: "示例·李四",
    costPerDay: "（示例数据）出差期间客户洽谈与现场支持，含往返高铁、住宿与餐饮。",
    notes: "（示例数据）差旅补助按公司标准发放。",
    totalAmount,
    totalTax,
    items,
  };
}

const TEMPLATE_PRESETS = [
  { key: "general", label: "通用", desc: "所有区块全显示" },
  { key: "default", label: "标准", desc: "省略报销说明" },
  { key: "minimal", label: "简约", desc: "仅明细与签名" },
] as const;

const PAGE_SIZE_OPTIONS: { key: FormTemplatePageSize; label: string; desc: string }[] = [
  { key: "A4", label: "整页独占", desc: "" },
  { key: "half", label: "半页贴单", desc: "" },
];

type FormTemplatePageProps = {
  settingsHook: UseSettingsReturn;
  showToast: ToastFn;
};

export function FormTemplatePage({ settingsHook, showToast }: FormTemplatePageProps) {
  const template = settingsHook.settings.formTemplate;
  const setFormTemplate = settingsHook.setFormTemplate;
  const resetFormTemplate = settingsHook.resetFormTemplate;

  const [previewSrc, setPreviewSrc] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewPending, setPreviewPending] = useState(false);
  const [previewError, setPreviewError] = useState<string>("");
  const [showPrint, setShowPrint] = useState(false);
  const [printPdfPath, setPrintPdfPath] = useState<string>("");
  const [printPreviewSrc, setPrintPreviewSrc] = useState<string>("");
  const [printPreparing, setPrintPreparing] = useState(false);
  const seqRef = useRef(0);
  const debounceTimerRef = useRef<number | null>(null);
  const tempPathsRef = useRef<string[]>([]);

  const renderPreview = useCallback(async (tpl: FormTemplate) => {
    const seq = ++seqRef.current;
    setPreviewLoading(true);
    setPreviewError("");
    setPreviewSrc("");
    try {
      const templateArg = tpl as unknown as Record<string, unknown>;
      const tempPath = await window.invoiceApi.makeTempPath("preview_cover_", ".pdf");
      if (seq !== seqRef.current) return;
      const sampleData = buildSampleData(tpl.itemRows || 4);
      const outputPath = await window.invoiceApi.buildReimbursementCoverPdf(
        sampleData,
        tempPath,
        templateArg,
      );
      if (seq !== seqRef.current) return;
      if (!outputPath) throw new Error("生成预览 PDF 失败");
      tempPathsRef.current.push(outputPath);
      const rendered = await window.invoiceApi.renderPdfPage(outputPath, 1, 1.6);
      if (seq !== seqRef.current) return;
      setPreviewSrc(`data:image/png;base64,${rendered.pngBase64}`);
    } catch (err) {
      if (seq !== seqRef.current) return;
      const msg = err instanceof Error ? err.message : String(err);
      setPreviewError(msg);
    } finally {
      if (seq === seqRef.current) setPreviewLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
    }
    setPreviewPending(true);
    debounceTimerRef.current = window.setTimeout(() => {
      void renderPreview(template).finally(() => setPreviewPending(false));
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [template, renderPreview]);

  useEffect(() => {
    return () => {
      const paths = tempPathsRef.current.slice();
      tempPathsRef.current = [];
      if (paths.length === 0) return;
      window.invoiceApi.deleteFiles?.(paths).catch(() => undefined);
    };
  }, []);

  const patchTemplate = useCallback(
    (partial: Partial<FormTemplate>) => {
      setFormTemplate((prev) => ({ ...prev, ...partial }));
    },
    [setFormTemplate],
  );

  const patchSignatureColumns = useCallback(
    (cols: 1 | 2 | 3 | 4) => {
      setFormTemplate((prev) => ({ ...prev, signatures: { ...prev.signatures, columns: cols } }));
    },
    [setFormTemplate],
  );

  const patchSignatureSlot = useCallback(
    (idx: number, value: string) => {
      setFormTemplate((prev) => {
        const slots = prev.signatures.slots.slice();
        slots[idx] = value;
        return { ...prev, signatures: { ...prev.signatures, slots } };
      });
    },
    [setFormTemplate],
  );

  const addSignatureSlot = useCallback(() => {
    setFormTemplate((prev) => {
      if (prev.signatures.slots.length >= 6) return prev;
      return { ...prev, signatures: { ...prev.signatures, slots: [...prev.signatures.slots, "新签名栏"] } };
    });
  }, [setFormTemplate]);

  const removeSignatureSlot = useCallback(
    (idx: number) => {
      setFormTemplate((prev) => {
        if (prev.signatures.slots.length <= 1) return prev;
        const slots = prev.signatures.slots.filter((_, i) => i !== idx);
        return { ...prev, signatures: { ...prev.signatures, slots } };
      });
    },
    [setFormTemplate],
  );

  const applyPreset = useCallback(
    (key: string) => {
      const preset = FORM_TEMPLATE_PRESETS[key];
      if (!preset) return;
      const newTpl: FormTemplate = {
        ...preset,
        pageSize: template.pageSize,
        itemRows: template.itemRows,
        signatures: {
          ...preset.signatures,
          columns: template.signatures.columns,
          slots: [...preset.signatures.slots],
        },
      };
      setFormTemplate(newTpl);
      // 立即触发预览，跳过 debounce（确保用户能即时看到预设效果）
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      void renderPreview(newTpl);
      showToast(`已应用「${TEMPLATE_PRESETS.find((p) => p.key === key)?.label || key}」模板`, "success");
    },
    [setFormTemplate, renderPreview, showToast, template.pageSize, template.itemRows, template.signatures.columns],
  );

  const handleReset = useCallback(() => {
    resetFormTemplate();
    showToast("已恢复默认模板", "success");
  }, [resetFormTemplate, showToast]);

  const handleOpenPrint = useCallback(async () => {
    if (printPreparing) return;
    setPrintPreparing(true);
    try {
      const templateArg = template as unknown as Record<string, unknown>;
      const tempPath = await window.invoiceApi.makeTempPath("print_cover_", ".pdf");
      const outputPath = await window.invoiceApi.buildReimbursementCoverPdf(
        buildBlankData(),
        tempPath,
        templateArg,
      );
      if (!outputPath) throw new Error("生成空白模板失败");
      tempPathsRef.current.push(outputPath);
      const rendered = await window.invoiceApi.renderPdfPage(outputPath, 1, 1.6);
      setPrintPdfPath(outputPath);
      setPrintPreviewSrc(`data:image/png;base64,${rendered.pngBase64}`);
      setShowPrint(true);
    } catch (err) {
      showToast(`生成空白模板失败：${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      setPrintPreparing(false);
    }
  }, [template, printPreparing, showToast]);

  const matchedPresetKey = useMemo(() => {
    // 预设匹配仅比较"内容维度"，忽略 pageSize / signatures.columns（这两个属于模板规格维度）
    const pickPresetDims = (t: FormTemplate) => ({
      title: t.title,
      companyName: t.companyName,
      themeColor: t.themeColor,
      footerNotes: t.footerNotes,
      sections: t.sections,
      fieldLabels: t.fieldLabels,
      slots: t.signatures.slots,
    });
    const tplStr = JSON.stringify(pickPresetDims(template));
    for (const p of TEMPLATE_PRESETS) {
      if (JSON.stringify(pickPresetDims(FORM_TEMPLATE_PRESETS[p.key])) === tplStr) return p.key;
    }
    return "";
  }, [template]);

  const dirty = useMemo(() => {
    return JSON.stringify(defaultFormTemplate()) !== JSON.stringify(template);
  }, [template]);

  const maxItemRows = useMemo(() => {
    // 根据预设区块数量与纸张规格约束行数，避免内容溢出
    if (template.pageSize === "half") {
      if (matchedPresetKey === "general") return 5;
      if (matchedPresetKey === "default") return 11;
      if (matchedPresetKey === "minimal") return 15;
    } else {
      if (matchedPresetKey === "general") return 14;
      if (matchedPresetKey === "default") return 20;
      if (matchedPresetKey === "minimal") return 25;
    }
    return 25;
  }, [matchedPresetKey, template.pageSize]);

  useEffect(() => {
    if (template.itemRows > maxItemRows) {
      patchTemplate({ itemRows: maxItemRows });
      showToast(`当前模板组合行数上限为 ${maxItemRows} 行，已自动调整`, "warning");
    }
  }, [maxItemRows, template.itemRows, patchTemplate, showToast]);

  const previewAspect = 210 / 297;

  return (
    <div data-testid="form-template-page" className="formTemplatePage">
      {/* 左侧：配置面板 */}
      <div className="panel formTemplateSide">
        <div className="panelHeader">
          <div className="panelHeaderLeft">
            <div className="panelTitle">表单定制</div>
            {dirty && <span className="formTemplateDirtyBadge">已修改</span>}
          </div>
          <div className="panelHeaderRight">
            <button onClick={handleReset} disabled={!dirty} title="恢复默认模板">
              恢复默认
            </button>
            <button
              onClick={() => { void handleOpenPrint(); }}
              disabled={previewLoading || previewPending || !previewSrc || !!previewError || printPreparing}
              title={previewLoading || previewPending ? "预览渲染中，请稍候" : "打印当前模板（空白布局，不含示例数据）"}
            >
              {printPreparing ? "生成中…" : "打印报销单"}
            </button>
          </div>
        </div>

        <div className="formTemplateBody">
          {/* 模板预设快捷应用 */}
          <SectionCard title="模板预设">
            <div className="formTemplatePresetGrid">
              {TEMPLATE_PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className={`formTemplatePresetItem ${matchedPresetKey === p.key ? "active" : ""}`}
                  onClick={() => applyPreset(p.key)}
                >
                  <div className="formTemplatePresetThumb" style={{ color: FORM_TEMPLATE_PRESETS[p.key].themeColor }} />
                  <div className="formTemplatePresetMeta">
                    <div className="formTemplatePresetLabel">{p.label}</div>
                  </div>
                </button>
              ))}
            </div>
          </SectionCard>

          {/* 模板规格 */}
          <SectionCard title="模板规格">
            <div className="formTemplateRadioGroup">
              {PAGE_SIZE_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  className={`formTemplateRadioCard ${template.pageSize === opt.key ? "active" : ""}`}
                  onClick={() => {
                    const patch: Partial<FormTemplate> = {
                      pageSize: opt.key,
                      signatures: { ...template.signatures, columns: opt.key === "half" ? 4 : 1 },
                    };
                    let cap = 25;
                    if (opt.key === "half") {
                      if (matchedPresetKey === "general") cap = 5;
                      else if (matchedPresetKey === "default") cap = 11;
                      else if (matchedPresetKey === "minimal") cap = 15;
                    } else {
                      if (matchedPresetKey === "general") cap = 14;
                      else if (matchedPresetKey === "default") cap = 20;
                      else if (matchedPresetKey === "minimal") cap = 25;
                    }
                    if (template.itemRows > cap) patch.itemRows = cap;
                    patchTemplate(patch);
                  }}
                >
                  <div className="formTemplateRadioCardIcon">
                    <PageIcon ratio={1} />
                  </div>
                  <div className="formTemplateRadioCardText">
                    <div className="formTemplateRadioCardLabel">{opt.label}</div>
                  </div>
                </button>
              ))}
            </div>
          </SectionCard>

          {/* 费用明细行数 */}
          <SectionCard title="费用明细" hint={`当前组合上限 ${maxItemRows} 行`}>
            <FormField label="表格行数">
              <div className="formTemplateRadioGroup formTemplateRadioGroupRow">
                {[4, 5, 6, 7, 8, 9].map((n) => (
                  <SegBtn
                    key={n}
                    active={template.itemRows === n}
                    disabled={n > maxItemRows}
                    onClick={() => patchTemplate({ itemRows: n })}
                  >
                    {n} 行
                  </SegBtn>
                ))}
              </div>
              <CustomRowInput
                value={template.itemRows}
                max={maxItemRows}
                onChange={(v) => patchTemplate({ itemRows: v })}
                onClamped={(req, applied) =>
                  showToast(`已输入 ${req} 行，超出上限 ${applied} 行，已自动调整`, "warning")
                }
              />
            </FormField>
          </SectionCard>

          {/* 签名区 */}
          <SectionCard title="签名区" hint={`${template.signatures.slots.length}/6 栏 · ${template.signatures.columns} 列`}>
            <FormField label="布局列数">
              <div className="formTemplateRadioGroup formTemplateRadioGroupRow">
                <SegBtn active={template.signatures.columns === 1} onClick={() => patchSignatureColumns(1)}>
                  1 列
                </SegBtn>
                <SegBtn active={template.signatures.columns === 2} onClick={() => patchSignatureColumns(2)}>
                  2 列
                </SegBtn>
                <SegBtn active={template.signatures.columns === 3} onClick={() => patchSignatureColumns(3)}>
                  3 列
                </SegBtn>
                <SegBtn active={template.signatures.columns === 4} onClick={() => patchSignatureColumns(4)}>
                  4 列
                </SegBtn>
              </div>
            </FormField>
            <FormField label="签名栏">
              <div className="formTemplateSlotList">
                {template.signatures.slots.map((slot, idx) => (
                  <div key={idx} className="formTemplateSlotRow">
                    <input
                      type="text"
                      value={slot}
                      onChange={(e) => patchSignatureSlot(idx, e.target.value)}
                      placeholder={`签名栏 ${idx + 1}`}
                    />
                    <button
                      type="button"
                      onClick={() => removeSignatureSlot(idx)}
                      disabled={template.signatures.slots.length <= 1}
                      title="删除此栏"
                      className="danger formTemplateSlotDeleteBtn"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addSignatureSlot}
                  disabled={template.signatures.slots.length >= 6}
                  className="formTemplateAddSlotBtn"
                >
                  + 添加签名栏
                </button>
              </div>
            </FormField>
          </SectionCard>

          <div className="formTemplateFootHint">
            修改后会自动保存，全局生效。同一份模板配置应用于：「本页 → 打印报销单」与「报销管理 → 打印报销单」。
          </div>
        </div>
      </div>

      {/* 右侧：实时预览 */}
      <div className="panel formTemplatePreviewPanel">
        <div className="panelHeader">
          <div className="panelHeaderLeft">
            <div className="panelTitle">实时预览</div>
            {previewLoading && <span className="formTemplatePreviewBadge">渲染中…</span>}
          </div>
        </div>
        <div className="formTemplatePreviewBody">
          {previewError ? (
            <div className="formTemplatePreviewError">预览失败：{previewError}</div>
          ) : previewSrc ? (
            <div className="formTemplatePreviewCanvas" style={{ aspectRatio: `${previewAspect}` }}>
              <img src={previewSrc} alt="报销单封面预览" className="formTemplatePreviewImg" />
            </div>
          ) : (
            <div className="formTemplatePreviewError">正在生成首次预览…</div>
          )}
        </div>
      </div>

      {showPrint && printPreviewSrc && (
        <PrintDialog
          previewImages={[printPreviewSrc]}
          onClose={() => setShowPrint(false)}
          onPrint={async (printerName, copies) => {
            if (!printPdfPath) {
              showToast("PDF 尚未生成", "error");
              setShowPrint(false);
              return;
            }
            try {
              const result = await window.invoiceApi.print({ printerName, pdfPath: printPdfPath, copies });
              if (result.success) {
                showToast("已发送到打印机", "success");
              } else {
                showToast("打印失败", "error");
              }
            } catch (err) {
              showToast(`打印出错：${err instanceof Error ? err.message : String(err)}`, "error");
            }
            setShowPrint(false);
          }}
        />
      )}
    </div>
  );
}

function SectionCard({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="formTemplateCard">
      <div className="formTemplateCardHeader">
        <span className="formTemplateCardTitle">{title}</span>
        {hint && <span className="formTemplateCardHint">{hint}</span>}
      </div>
      <div className="formTemplateCardBody">{children}</div>
    </div>
  );
}

function FormField({ label, children, compact }: { label: string; children: React.ReactNode; compact?: boolean }) {
  return (
    <div className={`formTemplateField ${compact ? "compact" : ""}`}>
      <div className="formTemplateFieldLabel">{label}</div>
      {children}
    </div>
  );
}

function SegBtn({ active, onClick, children, disabled }: { active: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`formTemplateSegBtn ${active ? "active" : ""} ${disabled ? "disabled" : ""}`}
    >
      {children}
    </button>
  );
}

function CustomRowInput({
  value,
  onChange,
  max = 25,
  onClamped,
}: {
  value: number;
  onChange: (v: number) => void;
  max?: number;
  onClamped?: (requested: number, applied: number) => void;
}) {
  const [local, setLocal] = useState(String(value));
  useEffect(() => { setLocal(String(value)); }, [value]);
  const apply = () => {
    const requested = parseInt(local) || 4;
    const v = Math.max(1, Math.min(max, requested));
    setLocal(String(v));
    onChange(v);
    if (requested !== v && onClamped) onClamped(requested, v);
  };
  return (
    <div className="formTemplateCustomRowInput">
      <span>自定义：</span>
      <input
        type="number"
        min={1}
        max={max}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={apply}
        onKeyDown={(e) => { if (e.key === "Enter") apply(); }}
      />
      <span>行</span>
    </div>
  );
}

function PageIcon({ ratio }: { ratio: number }) {
  const w = 24;
  const h = w / ratio;
  const offsetY = (32 - h) / 2;
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <rect x={(32 - w) / 2} y={offsetY} width={w} height={h} rx="2" stroke="currentColor" strokeWidth="1.5" />
      <line x1={(32 - w) / 2 + 3} y1={offsetY + 6} x2={(32 + w) / 2 - 3} y2={offsetY + 6} stroke="currentColor" strokeWidth="1" />
      <line x1={(32 - w) / 2 + 3} y1={offsetY + 10} x2={(32 + w) / 2 - 3} y2={offsetY + 10} stroke="currentColor" strokeWidth="1" />
      <line x1={(32 - w) / 2 + 3} y1={offsetY + 14} x2={(32 + w) / 2 - 6} y2={offsetY + 14} stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}
