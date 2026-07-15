import { useState } from "react";
import { LegalDocumentDialog } from "./LegalDocumentDialog";
import { LEGAL_DOCUMENTS, type LegalDocumentId } from "../legal/documents";

type InitialLegalGateProps = {
  onAccepted: () => void;
  loading?: boolean;
};

export function InitialLegalGate({ onAccepted, loading = false }: InitialLegalGateProps) {
  const [privacyChecked, setPrivacyChecked] = useState(false);
  const [agreementChecked, setAgreementChecked] = useState(false);
  const [documentId, setDocumentId] = useState<LegalDocumentId | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const canContinue = !loading && !submitting && privacyChecked && agreementChecked;

  return (
    <>
      <div
        data-testid="initial-legal-gate"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 2000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          background:
            "radial-gradient(circle at top, rgba(106,166,255,0.18), transparent 42%), rgba(6,10,18,0.72)",
          backdropFilter: "blur(8px)",
        }}
      >
        <div
          style={{
            width: "min(760px, 100%)",
            borderRadius: "20px",
            border: "1px solid rgba(255,255,255,0.1)",
            background: "var(--panel)",
            boxShadow: "0 24px 80px rgba(0,0,0,0.32)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "28px 28px 20px",
              borderBottom: "1px solid var(--line)",
              background:
                "linear-gradient(135deg, rgba(106,166,255,0.12), rgba(106,166,255,0.04) 45%, transparent 100%)",
            }}
          >
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--primary)", marginBottom: "8px" }}>
              首次启动确认
            </div>
            <div style={{ fontSize: "24px", fontWeight: 700, color: "var(--text)", marginBottom: "10px" }}>
              继续使用前请先阅读并同意相关条款
            </div>
            <div style={{ fontSize: "13px", color: "var(--muted)", lineHeight: 1.8 }}>
              {loading
                ? "正在检查协议同意状态，请稍候。"
                : "发票管家会在本地保存票据、配置、日志和查验记录；启用 API 或 RPA 验真时，还会按所选模式与外部服务交互。继续使用前，你需要先阅读《隐私与数据处理说明》和《用户使用协议》。"}
            </div>
          </div>

          <div style={{ padding: "22px 28px 12px" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: "12px",
              }}
            >
              <DocumentCard
                title={LEGAL_DOCUMENTS.privacy.title}
                updatedAt={LEGAL_DOCUMENTS.privacy.updatedAt}
                summary={LEGAL_DOCUMENTS.privacy.summary}
                testId="legal-open-privacy"
                onOpen={() => setDocumentId("privacy")}
              />
              <DocumentCard
                title={LEGAL_DOCUMENTS.agreement.title}
                updatedAt={LEGAL_DOCUMENTS.agreement.updatedAt}
                summary={LEGAL_DOCUMENTS.agreement.summary}
                testId="legal-open-agreement"
                onOpen={() => setDocumentId("agreement")}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "18px" }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                  padding: "14px 16px",
                  borderRadius: "12px",
                  border: "1px solid var(--line)",
                  background: "rgba(var(--fg-rgb), 0.03)",
                  cursor: "pointer",
                }}
              >
                <input
                  data-testid="legal-checkbox-privacy"
                  type="checkbox"
                  checked={privacyChecked}
                  disabled={loading || submitting}
                  onChange={(e) => setPrivacyChecked(e.target.checked)}
                  style={{ marginTop: "2px" }}
                />
                <span style={{ fontSize: "13px", color: "var(--text)", lineHeight: 1.7 }}>
                  我已阅读并同意《{LEGAL_DOCUMENTS.privacy.title}》
                </span>
              </label>

              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                  padding: "14px 16px",
                  borderRadius: "12px",
                  border: "1px solid var(--line)",
                  background: "rgba(var(--fg-rgb), 0.03)",
                  cursor: "pointer",
                }}
              >
                <input
                  data-testid="legal-checkbox-agreement"
                  type="checkbox"
                  checked={agreementChecked}
                  disabled={loading || submitting}
                  onChange={(e) => setAgreementChecked(e.target.checked)}
                  style={{ marginTop: "2px" }}
                />
                <span style={{ fontSize: "13px", color: "var(--text)", lineHeight: 1.7 }}>
                  我已阅读并同意《{LEGAL_DOCUMENTS.agreement.title}》
                </span>
              </label>
            </div>

            {submitError && (
              <div style={{ marginTop: "14px", fontSize: "12px", color: "#f87171" }}>
                {submitError}
              </div>
            )}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "12px",
              padding: "18px 28px 28px",
            }}
          >
            <button
              data-testid="legal-exit"
              style={{ fontSize: "13px", padding: "10px 16px" }}
              disabled={submitting}
              onClick={() => window.invoiceApi.confirmClose()}
            >
              退出应用
            </button>
            <button
              data-testid="legal-continue"
              style={{
                fontSize: "13px",
                padding: "10px 18px",
                background: canContinue ? "var(--primary)" : "rgba(106,166,255,0.3)",
                color: "#fff",
                border: "none",
                cursor: canContinue ? "pointer" : "not-allowed",
              }}
              disabled={!canContinue}
              onClick={async () => {
                if (!canContinue) {
                  return;
                }
                try {
                  setSubmitting(true);
                  setSubmitError("");
                  await window.invoiceApi.acceptLegalConsent();
                  onAccepted();
                } catch (error) {
                  console.error("保存应用协议同意状态失败:", error);
                  setSubmitError("保存同意状态失败，请重试。");
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              {loading ? "正在检查..." : submitting ? "正在保存..." : "同意并继续"}
            </button>
          </div>
        </div>
      </div>

      {documentId && (
        <LegalDocumentDialog
          documentId={documentId}
          onClose={() => setDocumentId(null)}
          onChangeDocument={setDocumentId}
        />
      )}
    </>
  );
}

type DocumentCardProps = {
  title: string;
  updatedAt: string;
  summary: string;
  testId?: string;
  onOpen: () => void;
};

function DocumentCard({ title, updatedAt, summary, testId, onOpen }: DocumentCardProps) {
  return (
    <div
      style={{
        padding: "16px",
        borderRadius: "14px",
        border: "1px solid var(--line)",
        background: "rgba(var(--fg-rgb), 0.02)",
      }}
    >
      <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)", marginBottom: "6px" }}>{title}</div>
      <div style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "10px" }}>更新日期：{updatedAt}</div>
      <div style={{ fontSize: "12px", color: "var(--muted)", lineHeight: 1.7, minHeight: "42px" }}>{summary}</div>
      <button
        data-testid={testId}
        style={{ fontSize: "12px", padding: "6px 12px", marginTop: "12px" }}
        onClick={onOpen}
      >
        打开文档
      </button>
    </div>
  );
}
