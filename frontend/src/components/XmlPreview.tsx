import { useEffect, useState } from "react";
import type { OcrResult } from "../types";
import { ocrFileWithCache } from "../utils/ocrCache";

interface XmlPreviewProps {
  filePath: string;
}

export function XmlPreview({ filePath }: XmlPreviewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OcrResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setResult(null);

    (async () => {
      try {
        const res = await ocrFileWithCache(filePath);
        if (cancelled) return;
        setResult(res);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "解析失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [filePath]);

  if (loading) {
    return (
      <div className="xmlPreview">
        <div className="xmlPreviewLoading">正在解析 XML 发票...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="xmlPreview">
        <div className="xmlPreviewError">解析失败: {error}</div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="xmlPreview">
        <div className="xmlPreviewEmpty">无内容</div>
      </div>
    );
  }

  const fields = result.fields || {};
  const fieldLabels: Record<string, string> = {
    invoice_code: "发票代码",
    invoice_number: "发票号码",
    date: "开票日期",
    amount: "金额",
    tax: "税额",
    buyer_name: "购买方名称",
    buyer_tax_id: "购买方识别号",
    seller_name: "销售方名称",
    seller_tax_id: "销售方识别号",
    items: "商品明细",
    remark: "备注"
  };

  return (
    <div className="xmlPreview">
      <div className="xmlPreviewContent">
        <div className="xmlPreviewHeader">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14,2 14,8 20,8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10,9 9,9 8,9" />
          </svg>
          <span>XML 电子发票</span>
        </div>
        <div className="xmlPreviewFields">
          {Object.entries(fields).map(([key, value]) => (
            <div key={key} className="xmlPreviewField">
              <div className="xmlPreviewFieldLabel">{fieldLabels[key] || key}</div>
              <div className="xmlPreviewFieldValue">{value}</div>
            </div>
          ))}
          {Object.keys(fields).length === 0 && (
            <div className="xmlPreviewEmpty">未提取到字段信息</div>
          )}
        </div>
        {result.text && (
          <div className="xmlPreviewRaw">
            <div className="xmlPreviewRawLabel">原始内容</div>
            <pre className="xmlPreviewRawContent">{result.text}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
