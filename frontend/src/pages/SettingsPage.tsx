import { useState, useCallback, useEffect } from "react";
import type { UseSettingsReturn } from "../hooks/useSettings";
import type { ThemeMode } from "../hooks/useSettings";
import type { UseArchiveStateReturn } from "../hooks/useArchiveState";
import type { UseReimbursementReturn } from "../hooks/useReimbursement";
import { LegalDocumentDialog } from "../components/LegalDocumentDialog";
import {
  API_EXTERNAL_SERVICE_CONSENT_LABEL,
  API_EXTERNAL_SERVICE_NOTICE,
  RPA_EXTERNAL_SERVICE_CONSENT_LABEL,
  RPA_EXTERNAL_SERVICE_NOTICE,
  type LegalDocumentId,
} from "../legal/documents";
import {
  getApiExternalServiceConsent,
  setApiExternalServiceConsent,
  getRpaExternalServiceConsent,
  setRpaExternalServiceConsent,
} from "../utils/legalConsent";
import {
  getVerifyModePreference,
  notifyVerifyConfigSync,
  setVerifyModePreference,
  type VerifyMode,
} from "../utils/verifyConfigSync";
import { clearAllCaches, formatBytes } from "../utils/clearAllCaches";
import alipayQr from "../assets/donate/alipay-qr.png";
import wechatQr from "../assets/donate/wechat-qr.png";
import "../archive.css";

const Icons = {
  palette: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor" /><circle cx="17.5" cy="10.5" r=".5" fill="currentColor" /><circle cx="8.5" cy="7.5" r=".5" fill="currentColor" /><circle cx="6.5" cy="12" r=".5" fill="currentColor" /><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" /></svg>,
  shield: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
  clipboard: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" ry="1" /></svg>,
  database: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></svg>,
  fileText: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>,
  folder: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>,
  check: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="3"><polyline points="20,6 9,17 4,12" /></svg>,
  x: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>,
  heart: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>,
  cpu: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="15" x2="23" y2="15"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="15" x2="4" y2="15"></line></svg>,
};

type SettingsCategory = "appearance" | "verify" | "reimbursement" | "data" | "compliance" | "donate" | "ocr";

const CATEGORIES: { id: SettingsCategory; label: string; icon: JSX.Element }[] = [
  { id: "appearance", label: "外观", icon: Icons.palette },
  { id: "verify", label: "验真配置", icon: Icons.shield },
  { id: "reimbursement", label: "报销默认", icon: Icons.clipboard },
  { id: "ocr", label: "OCR 引擎", icon: Icons.cpu },
  { id: "data", label: "存储与数据", icon: Icons.database },
  { id: "compliance", label: "合规与说明", icon: Icons.fileText },
  { id: "donate", label: "打赏与支持", icon: Icons.heart },
];

type SettingsPageProps = {
  settingsHook: UseSettingsReturn;
  archiveState: UseArchiveStateReturn;
  reimbursementState: UseReimbursementReturn;
  showToast: (msg: string, type?: "info" | "success" | "error" | "warning") => void;
  onConfirm: (opts: { title: string; message: string; confirmText?: string; danger?: boolean; onConfirm: () => void }) => void;
  defaultCategory?: SettingsCategory;
};

export function SettingsPage({
  settingsHook,
  archiveState,
  reimbursementState,
  showToast,
  onConfirm,
  defaultCategory = "appearance",
}: SettingsPageProps) {
  const [category, setCategory] = useState<SettingsCategory>(defaultCategory);
  const [legalDocumentId, setLegalDocumentId] = useState<LegalDocumentId | null>(null);

  return (
    <div
      data-testid="settings-page"
      style={{ display: "grid", gridTemplateColumns: "220px minmax(0, 1fr)", gap: "12px", height: "100%", minWidth: 0, width: "100%" }}
    >
      {          }
      <div className="panel" style={{ display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0, width: "100%" }}>
        <div className="panelHeader">
          <div className="panelHeaderLeft">
            <div className="panelTitle">设置</div>
          </div>
        </div>
        <div className="folderTree" style={{ flex: 1, overflow: "auto" }}>
          <div className="folderSection">
            {CATEGORIES.map((cat) => (
              <div
                key={cat.id}
                className={`folderItem ${category === cat.id ? "folderItemActive" : ""}`}
                onClick={() => setCategory(cat.id)}
              >
                <span className="folderIcon">{cat.icon}</span>
                <span className="folderName">{cat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="panel" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div className="panelHeader">
          <div className="panelHeaderLeft">
            <div className="panelTitle">{CATEGORIES.find((c) => c.id === category)?.label}</div>
          </div>
        </div>
        <div className="archiveListBody" style={{ flex: 1, overflow: "auto", minWidth: 0 }}>
          {category === "appearance" && <AppearanceSettings settingsHook={settingsHook} />}
          {category === "verify" && (
            <VerifySettings
              showToast={showToast}
              onConfirm={onConfirm}
              onOpenLegalDocument={setLegalDocumentId}
              settingsHook={settingsHook}
            />
          )}
          {category === "reimbursement" && <ReimbursementSettings settingsHook={settingsHook} showToast={showToast} />}
          {category === "data" && (
            <DataSettings
              archiveState={archiveState}
              reimbursementState={reimbursementState}
              showToast={showToast}
              onConfirm={onConfirm}
            />
          )}
          {category === "compliance" && (
            <ComplianceSettings onOpenLegalDocument={setLegalDocumentId} />
          )}
          {category === "donate" && <DonateSettings />}
          {category === "ocr" && <OcrSettings showToast={showToast} />}
        </div>
      </div>
      {legalDocumentId && (
        <LegalDocumentDialog
          documentId={legalDocumentId}
          onClose={() => setLegalDocumentId(null)}
          onChangeDocument={setLegalDocumentId}
        />
      )}
    </div>
  );
}

type ThemeOption = {
  value: ThemeMode;
  label: string;
  bg: string;
  topbar: string;
  primary: string;
  text: string;
};

const DARK_THEMES: ThemeOption[] = [
  { value: "dark",    label: "默认深色",  bg: "#0b1020", topbar: "#131a33", primary: "#6aa6ff", text: "#e0e0e0" },
  { value: "one-dark", label: "Atom 风格灰蓝调", bg: "#282c34", topbar: "#21252b", primary: "#61afef", text: "#abb2bf" },
  { value: "monokai",  label: "经典暖色暗调",  bg: "#272822", topbar: "#1e1f1c", primary: "#66d9ef", text: "#f8f8f2" },
  { value: "dracula",  label: "紫色调暗色",  bg: "#282a36", topbar: "#21222c", primary: "#bd93f9", text: "#f8f8f2" },
];

const LIGHT_THEMES: ThemeOption[] = [
  { value: "light",           label: "默认浅色",       bg: "#f3f3f3", topbar: "#e8e8e8", primary: "#005fb8", text: "#1e1e1e" },
  { value: "solarized-light", label: "暖黄纸质色调", bg: "#fdf6e3", topbar: "#eee8d5", primary: "#268bd2", text: "#586e75" },
  { value: "github-light",    label: "清爽白色",    bg: "#ffffff", topbar: "#f6f8fa", primary: "#0969da", text: "#1f2328" },
];

function ThemeCard({ opt, active, onClick }: { opt: ThemeOption; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "128px",
        padding: 0,
        border: active ? "2px solid var(--primary)" : "2px solid var(--line)",
        borderRadius: "10px",
        overflow: "hidden",
        cursor: "pointer",
        background: "transparent",
        textAlign: "left",
        transition: "border-color 150ms ease, box-shadow 150ms ease",
        boxShadow: active ? "0 0 0 2px rgba(106,166,255,0.25)" : "none",
      }}
    >

      <div style={{ background: opt.bg, padding: "6px 8px 10px" }}>
        <div style={{ background: opt.topbar, borderRadius: "4px", height: "10px", marginBottom: "5px" }} />
        <div style={{ display: "flex", gap: "4px" }}>
          <div style={{ background: opt.primary, borderRadius: "3px", height: "7px", width: "32px" }} />
          <div style={{ background: opt.text, opacity: 0.3, borderRadius: "3px", height: "7px", flex: 1 }} />
        </div>
        <div style={{ display: "flex", gap: "4px", marginTop: "4px" }}>
          <div style={{ background: opt.text, opacity: 0.15, borderRadius: "3px", height: "7px", flex: 1 }} />
          <div style={{ background: opt.primary, opacity: 0.5, borderRadius: "3px", height: "7px", width: "20px" }} />
        </div>
      </div>

      <div style={{ padding: "6px 8px", fontSize: "11px", color: "var(--text)", fontWeight: active ? 600 : 400 }}>
        {opt.label}
      </div>
    </button>
  );
}

function AppearanceSettings({ settingsHook }: { settingsHook: UseSettingsReturn }) {
  const { settings, setTheme } = settingsHook;

  return (
    <div className="settingsContent">
      <SettingSection title="深色主题">
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
          {DARK_THEMES.map((opt) => (
            <ThemeCard key={opt.value} opt={opt} active={settings.theme === opt.value} onClick={() => setTheme(opt.value)} />
          ))}
        </div>
      </SettingSection>
      <SettingSection title="浅色主题">
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
          {LIGHT_THEMES.map((opt) => (
            <ThemeCard key={opt.value} opt={opt} active={settings.theme === opt.value} onClick={() => setTheme(opt.value)} />
          ))}
        </div>
      </SettingSection>
    </div>
  );
}

type RpaBrowserPreference = "auto" | "edge" | "chrome";

type RpaBrowserStatus = {
  playwrightInstalled: boolean;
  browserPreference: RpaBrowserPreference;
  configuredChromePath: string;
  canLaunch: boolean;
  edge: {
    available: boolean;
    path: string;
  };
  chrome: {
    available: boolean;
    path: string;
    configured: boolean;
  };
  chromium: {
    available: boolean;
    path: string;
    configured: boolean;
  };
  componentStatus: {
    installed: boolean;
    componentRoot: string;
    pythonPath: string;
    message: string;
  };
  effectiveBrowser: {
    value: string;
    label: string;
    path: string;
  };
};

type RpaConfigStatus = {
  configured: boolean;
  captchaAppKey: string;
  browserPreference: RpaBrowserPreference;
  chromiumExecutablePath: string;
  componentStatus: {
    installed: boolean;
    componentRoot: string;
    pythonPath: string;
    message: string;
  };
  browserStatus: RpaBrowserStatus;
};

const EMPTY_RPA_BROWSER_STATUS: RpaBrowserStatus = {
  playwrightInstalled: false,
  browserPreference: "auto",
  configuredChromePath: "",
  canLaunch: false,
  edge: {
    available: false,
    path: "",
  },
  chrome: {
    available: false,
    path: "",
    configured: false,
  },
  chromium: {
    available: false,
    path: "",
    configured: false,
  },
  componentStatus: {
    installed: false,
    componentRoot: "",
    pythonPath: "",
    message: "RPA 引擎未安装",
  },
  effectiveBrowser: {
    value: "",
    label: "",
    path: "",
  },
};

function getRpaBrowserPreferenceLabel(preference: RpaBrowserPreference): string {
  if (preference === "edge") {
    return "Microsoft Edge";
  }
  if (preference === "chrome") {
    return "Chrome";
  }
  return "自动";
}

function resolveRpaBrowserStatus(
  baseStatus: RpaBrowserStatus,
  browserPreference: RpaBrowserPreference,
  chromiumExecutablePath: string,
  chromePathExists: boolean | null
): RpaBrowserStatus {
  const trimmedPath = chromiumExecutablePath.trim();
  const hasCustomChromePath = trimmedPath.length > 0;
  const isClearingSavedChromePath = !hasCustomChromePath && baseStatus.chrome.configured;
  const chromeAvailable = hasCustomChromePath
    ? chromePathExists === true
    : isClearingSavedChromePath
      ? false
      : baseStatus.chrome.available;
  const chromePath = hasCustomChromePath
    ? trimmedPath
    : isClearingSavedChromePath
      ? ""
      : baseStatus.chrome.path;

  const effectiveBrowser = { value: "", label: "", path: "" };

  if (browserPreference === "edge") {
    if (baseStatus.edge.available) {
      effectiveBrowser.value = "edge";
      effectiveBrowser.label = "Microsoft Edge";
      effectiveBrowser.path = baseStatus.edge.path;
    }
  } else if (browserPreference === "chrome") {
    if (chromeAvailable) {
      effectiveBrowser.value = "chrome";
      effectiveBrowser.label = "Chrome";
      effectiveBrowser.path = chromePath;
    }
  } else if (baseStatus.edge.available) {
    effectiveBrowser.value = "edge";
    effectiveBrowser.label = "Microsoft Edge";
    effectiveBrowser.path = baseStatus.edge.path;
  } else if (chromeAvailable) {
    effectiveBrowser.value = "chrome";
    effectiveBrowser.label = "Chrome";
    effectiveBrowser.path = chromePath;
  }

  return {
    ...baseStatus,
    browserPreference,
    configuredChromePath: hasCustomChromePath ? trimmedPath : "",
    canLaunch: Boolean(effectiveBrowser.value),
    chrome: {
      ...baseStatus.chrome,
      available: chromeAvailable,
      path: chromePath,
      configured: hasCustomChromePath,
    },
    chromium: {
      ...baseStatus.chromium,
      available: chromeAvailable,
      path: chromePath,
      configured: hasCustomChromePath,
    },
    effectiveBrowser,
  };
}

function BrowserStatusCard({
  title,
  available,
  path,
  hint,
}: {
  title: string;
  available: boolean;
  path: string;
  hint: string;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--line)",
        borderRadius: "10px",
        padding: "12px 14px",
        background: "rgba(var(--fg-rgb), 0.02)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
        {available ? Icons.check : Icons.x}
        <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>{title}</span>
      </div>
      <div style={{ fontSize: "12px", color: "var(--muted)", lineHeight: 1.6 }}>{hint}</div>
      <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "8px", wordBreak: "break-all" }}>
        {path || "未检测到路径"}
      </div>
    </div>
  );
}

function VerifySettings({
  showToast,
  onConfirm,
  onOpenLegalDocument,
  settingsHook,
}: {
  showToast: (msg: string, type?: "info" | "success" | "error" | "warning") => void;
  onConfirm: (opts: { title: string; message: string; confirmText?: string; danger?: boolean; onConfirm: () => void }) => void;
  onOpenLegalDocument: (documentId: LegalDocumentId) => void;
  settingsHook: UseSettingsReturn;
}) {

  const [verifyMode, setVerifyModeLocal] = useState<VerifyMode>(() => getVerifyModePreference());
  const setVerifyMode = useCallback((mode: VerifyMode) => {
    setVerifyModeLocal(mode);
    setVerifyModePreference(mode);
  }, []);

  const [apiStatus, setApiStatus] = useState<{ configured: boolean; authType: string } | null>(null);
  const [showApiForm, setShowApiForm] = useState(false);
  const [apiAuthType, setApiAuthType] = useState<"direct" | "aliyun">("direct");
  const [apiAppKey, setApiAppKey] = useState("");
  const [apiAppSecret, setApiAppSecret] = useState("");
  const [apiAppCode, setApiAppCode] = useState("");
  const [savingApi, setSavingApi] = useState(false);
  const [apiExternalConsent, setApiExternalConsentState] = useState(() => getApiExternalServiceConsent());

  const [rpaStatus, setRpaStatus] = useState<RpaConfigStatus | null>(null);
  const [showRpaForm, setShowRpaForm] = useState(false);
  const [rpaCaptchaKey, setRpaCaptchaKey] = useState("");
  const [savingRpa, setSavingRpa] = useState(false);
  const [installingRpaEngine, setInstallingRpaEngine] = useState(false);
  const [savingRpaBrowser, setSavingRpaBrowser] = useState(false);
  const [testingRpaBrowser, setTestingRpaBrowser] = useState(false);
  const [refreshingRpaBrowser, setRefreshingRpaBrowser] = useState(false);
  const [rpaBrowserPreference, setRpaBrowserPreference] = useState<RpaBrowserPreference>("auto");
  const [rpaChromiumExecutablePath, setRpaChromiumExecutablePath] = useState("");
  const [editingChromePathExists, setEditingChromePathExists] = useState<boolean | null>(null);
  const [rpaExternalConsent, setRpaExternalConsentState] = useState(() => getRpaExternalServiceConsent());

  const updateApiExternalConsent = useCallback((next: boolean) => {
    setApiExternalConsentState(next);
    setApiExternalServiceConsent(next);
  }, []);

  const updateRpaExternalConsent = useCallback((next: boolean) => {
    setRpaExternalConsentState(next);
    setRpaExternalServiceConsent(next);
  }, []);

  const requestVerifyModeSwitch = useCallback((mode: VerifyMode) => {
    if (mode === verifyMode) {
      return;
    }
    const targetConfigured = mode === "api"
      ? Boolean(apiStatus?.configured)
      : Boolean(rpaStatus?.configured);
    if (!targetConfigured) {
      setShowApiForm(false);
      setShowRpaForm(false);
      setVerifyMode(mode);
      return;
    }
    const nextLabel = mode === "api" ? "API" : "RPA";
    const serviceMessage = mode === "api"
      ? "后续查验只会通过外部 API 服务执行，不会同时调用 RPA。"
      : "后续查验只会通过自动化浏览器与验证码识别服务执行，不会同时调用 API。";
    onConfirm({
      title: `切换到 ${nextLabel} 查验`,
      message: `当前同一时间只启用一种验真方式。切换到 ${nextLabel} 后，手动查验、归档查验和批量查验都会只使用 ${nextLabel}。${serviceMessage}`,
      confirmText: "知悉并切换",
      danger: false,
      onConfirm: () => {
        setShowApiForm(false);
        setShowRpaForm(false);
        setVerifyMode(mode);
      },
    });
  }, [apiStatus?.configured, onConfirm, rpaStatus?.configured, setVerifyMode, verifyMode]);

  const loadRpaStatus = useCallback(async (options?: { syncEditor?: boolean }) => {
    const syncEditor = options?.syncEditor ?? true;
    const status = await window.invoiceApi.getRpaConfig();
    setRpaStatus(status);
    if (syncEditor) {
      setRpaBrowserPreference(status.browserPreference);
      setRpaChromiumExecutablePath(status.chromiumExecutablePath);
    }
    return status;
  }, []);

  useEffect(() => {
    window.invoiceApi.getVerifyConfig().then((s) => setApiStatus({ configured: s.configured, authType: s.authType })).catch(() => {});
    loadRpaStatus().catch(() => {});
  }, [loadRpaStatus]);

  useEffect(() => {
    const trimmedPath = rpaChromiumExecutablePath.trim();
    if (!trimmedPath) {
      setEditingChromePathExists(null);
      return;
    }

    let active = true;
    const timer = window.setTimeout(() => {
      void window.invoiceApi.checkFilesExist([trimmedPath])
        .then((result) => {
          if (!active) {
            return;
          }
          setEditingChromePathExists(Boolean(result[trimmedPath]));
        })
        .catch(() => {
          if (!active) {
            return;
          }
          setEditingChromePathExists(false);
        });
    }, 150);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [rpaChromiumExecutablePath]);

  const handleSaveApi = useCallback(async () => {
    if (apiAuthType === "aliyun") {
      if (!apiAppCode.trim()) { showToast("请填写 AppCode", "error"); return; }
    } else {
      if (!apiAppKey.trim() || !apiAppSecret.trim()) { showToast("请填写 AppKey 和 AppSecret", "error"); return; }
    }
    if (!apiExternalConsent) { showToast("请先确认 API 外部服务告知", "warning"); return; }
    setSavingApi(true);
    try {
      const res = await window.invoiceApi.setVerifyConfig({ authType: apiAuthType, appKey: apiAppKey.trim(), appSecret: apiAppSecret.trim(), appCode: apiAppCode.trim() });
      if (res.success) {
        showToast("API 配置已保存", "success");
        setShowApiForm(false);
        setApiAppKey(""); setApiAppSecret(""); setApiAppCode("");
        const s = await window.invoiceApi.getVerifyConfig();
        setApiStatus({ configured: s.configured, authType: s.authType });
        notifyVerifyConfigSync();
      } else {
        showToast("保存失败", "error");
      }
    } catch { showToast("保存失败", "error"); }
    finally { setSavingApi(false); }
  }, [apiAuthType, apiAppKey, apiAppSecret, apiAppCode, apiExternalConsent, showToast]);

  const handleSaveRpa = useCallback(async () => {
    if (!rpaCaptchaKey.trim()) { showToast("请填写验证码识别 AppKey", "error"); return; }
    if (!rpaExternalConsent) { showToast("请先确认 RPA 第三方识别告知", "warning"); return; }
    setSavingRpa(true);
    try {
      const res = await window.invoiceApi.setRpaConfig({ captchaAppKey: rpaCaptchaKey.trim() });
      if (res.success) {
        showToast("RPA 配置已保存", "success");
        setShowRpaForm(false);
        setRpaCaptchaKey("");
        await loadRpaStatus();
        notifyVerifyConfigSync();
      } else {
        showToast(res.error || "保存失败", "error");
      }
    } catch { showToast("保存失败", "error"); }
    finally { setSavingRpa(false); }
  }, [loadRpaStatus, rpaCaptchaKey, rpaExternalConsent, showToast]);

  const handleClearApi = useCallback(() => {
    onConfirm({ title: "退出 API 配置", message: "退出后将清除已保存的认证信息，API 验真功能将不可用。", confirmText: "退出", danger: true,
      onConfirm: async () => {
        await window.invoiceApi.clearVerifyConfig().catch(() => {});
        setApiStatus({ configured: false, authType: "direct" });
        notifyVerifyConfigSync();
        showToast("已退出 API 配置", "success");
      },
    });
  }, [showToast, onConfirm]);

  const handleClearRpa = useCallback(() => {
    onConfirm({ title: "退出 RPA 配置", message: "退出后将清除验证码识别 AppKey，RPA 验真将不可用。", confirmText: "退出", danger: true,
      onConfirm: async () => {
        await window.invoiceApi.clearRpaConfig().catch(() => {});
        await loadRpaStatus().catch(() => {});
        notifyVerifyConfigSync();
        showToast("已退出 RPA 配置", "success");
      },
    });
  }, [loadRpaStatus, showToast, onConfirm]);

  const handlePickChromeExecutable = useCallback(async () => {
    try {
      const filePath = await window.invoiceApi.pickChromeExecutable();
      if (filePath) {
        setRpaChromiumExecutablePath(filePath);
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "选择文件失败", "error");
    }
  }, [showToast]);

  const handleInstallRpaEngine = useCallback(async () => {
    let zipPath: string | null = null;
    try {
      zipPath = await window.invoiceApi.pickRpaComponentZip();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "选择插件失败", "error");
      return;
    }
    if (!zipPath) {
      return;
    }
    setInstallingRpaEngine(true);
    try {
      const result = await window.invoiceApi.installRpaComponent({ zipPath });
      if (result.success) {
        await loadRpaStatus({ syncEditor: false });
        onConfirm({
          title: "RPA 引擎已导入",
          message: "插件导入成功，需要重启应用后才能加载 RPA 引擎。是否立即重启？",
          confirmText: "立即重启",
          danger: false,
          onConfirm: async () => {
            try {
              await window.invoiceApi.relaunchApp();
            } catch (err) {
              showToast(err instanceof Error ? err.message : "重启失败", "error");
            }
          },
        });
      } else {
        showToast(result.error || "RPA 引擎安装失败", "error");
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "RPA 引擎安装失败", "error");
    } finally {
      setInstallingRpaEngine(false);
    }
  }, [loadRpaStatus, onConfirm, showToast]);

  const handleSaveRpaBrowser = useCallback(async () => {
    setSavingRpaBrowser(true);
    try {
      const res = await window.invoiceApi.setRpaConfig({
        browserPreference: rpaBrowserPreference,
        chromiumExecutablePath: rpaChromiumExecutablePath.trim(),
      });
      if (res.success) {
        await loadRpaStatus();
        showToast("RPA 浏览器环境已保存", "success");
      } else if (res.error) {
        showToast(res.error, "error");
      } else {
        showToast("保存失败", "error");
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "保存失败", "error");
    } finally {
      setSavingRpaBrowser(false);
    }
  }, [loadRpaStatus, rpaBrowserPreference, rpaChromiumExecutablePath, showToast]);

  const handleRefreshRpaBrowser = useCallback(async () => {
    setRefreshingRpaBrowser(true);
    try {
      await loadRpaStatus({ syncEditor: false });
      showToast("浏览器环境已刷新", "success");
    } catch {
      showToast("刷新失败", "error");
    } finally {
      setRefreshingRpaBrowser(false);
    }
  }, [loadRpaStatus, showToast]);

  const handleTestRpaBrowser = useCallback(async () => {
    setTestingRpaBrowser(true);
    try {
      const result = await window.invoiceApi.testRpaBrowser({
        browserPreference: rpaBrowserPreference,
        chromiumExecutablePath: rpaChromiumExecutablePath.trim(),
      });
      if (result.success) {
        const label = result.effectiveBrowser?.label || "可用浏览器";
        showToast(`测试成功：${label}`, "success");
        await loadRpaStatus({ syncEditor: false });
      } else {
        showToast(result.error || "测试失败", "error");
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "测试失败", "error");
    } finally {
      setTestingRpaBrowser(false);
    }
  }, [loadRpaStatus, rpaBrowserPreference, rpaChromiumExecutablePath, showToast]);

  const handleClearHistory = useCallback(() => {
    onConfirm({ title: "清除查验记录", message: "确定要清除所有发票查验记录吗？", confirmText: "清除", danger: true,
      onConfirm: async () => {
        await window.invoiceApi.clearVerifyHistory().catch(() => {});
        showToast("查验记录已清除", "success");
      },
    });
  }, [showToast, onConfirm]);

  const savedBrowserStatus = rpaStatus?.browserStatus ?? EMPTY_RPA_BROWSER_STATUS;
  const browserStatus = resolveRpaBrowserStatus(
    savedBrowserStatus,
    rpaBrowserPreference,
    rpaChromiumExecutablePath,
    editingChromePathExists
  );
  const componentStatus = rpaStatus?.componentStatus ?? savedBrowserStatus.componentStatus;
  const rpaEngineInstalled = componentStatus.installed;
  const effectiveBrowserText = browserStatus.effectiveBrowser.label
    ? `${browserStatus.effectiveBrowser.label}${browserStatus.effectiveBrowser.path ? ` · ${browserStatus.effectiveBrowser.path}` : ""}`
    : "未检测到可用浏览器";
  const savedBrowserPreference = rpaStatus?.browserPreference ?? "auto";
  const browserSettingsDirty = savedBrowserPreference !== rpaBrowserPreference
    || (rpaStatus?.chromiumExecutablePath ?? "") !== rpaChromiumExecutablePath.trim();
  const savedBrowserPreferenceLabel = getRpaBrowserPreferenceLabel(savedBrowserPreference);
  const editingBrowserPreferenceLabel = getRpaBrowserPreferenceLabel(rpaBrowserPreference);

  return (
    <div className="settingsContent">
      <SettingSection title="默认验真方式" description="同一时间只启用一种方式，切换后后续查验将只使用当前所选方案。">
        <div className="settingsChipGroup">
          <button className={`settingsChip ${verifyMode === "api" ? "settingsChipActive" : ""}`} onClick={() => requestVerifyModeSwitch("api")}>API 查验</button>
          <button className={`settingsChip ${verifyMode === "rpa" ? "settingsChipActive" : ""}`} onClick={() => requestVerifyModeSwitch("rpa")}>RPA 查验</button>
        </div>
      </SettingSection>

      <SettingSection title="API 验真配置">
        <div className="settingsConfigCard">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {apiStatus?.configured ? Icons.check : Icons.x}
              <span style={{ fontSize: "13px" }}>{apiStatus?.configured ? `已配置（${apiStatus.authType === "aliyun" ? "云市场 AppCode" : "AppKey + AppSecret"}）` : "未配置"}</span>
              <span style={{ fontSize: "11px", color: verifyMode === "api" ? "#1d4ed8" : "var(--muted)", padding: "2px 8px", borderRadius: "999px", border: verifyMode === "api" ? "1px solid rgba(29, 78, 216, 0.3)" : "1px solid var(--line)", background: verifyMode === "api" ? "rgba(29, 78, 216, 0.08)" : "rgba(var(--fg-rgb), 0.03)" }}>
                {verifyMode === "api" ? "当前启用" : "未启用"}
              </span>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              {apiStatus?.configured && <button style={{ fontSize: "12px", padding: "4px 10px" }} className="danger" onClick={handleClearApi}>退出</button>}
              <button style={{ fontSize: "12px", padding: "4px 10px" }} onClick={() => { setShowApiForm(!showApiForm); setApiAuthType("direct"); }}>
                {apiStatus?.configured ? "更换" : "配置"}
              </button>
            </div>
          </div>
          {showApiForm && (
            <div style={{ marginTop: "14px", borderTop: "1px solid var(--line)", paddingTop: "14px" }}>
              <div style={{ padding: "12px 14px", border: "1px solid rgba(106, 166, 255, 0.25)", borderRadius: "10px", background: "rgba(106, 166, 255, 0.08)", marginBottom: "12px" }}>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)", marginBottom: "4px" }}>API 外部服务说明</div>
                <div style={{ fontSize: "12px", color: "var(--muted)", lineHeight: 1.7 }}>
                  {API_EXTERNAL_SERVICE_NOTICE}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "10px" }}>
                  <button style={{ fontSize: "12px", padding: "6px 12px" }} onClick={() => onOpenLegalDocument("privacy")}>查看隐私说明</button>
                  <button style={{ fontSize: "12px", padding: "6px 12px" }} onClick={() => onOpenLegalDocument("agreement")}>查看用户协议</button>
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                <button className={`settingsChip ${apiAuthType === "direct" ? "settingsChipActive" : ""}`} onClick={() => setApiAuthType("direct")} style={{ padding: "5px 12px", fontSize: "12px" }}>AppKey + AppSecret</button>
                <button className={`settingsChip ${apiAuthType === "aliyun" ? "settingsChipActive" : ""}`} onClick={() => setApiAuthType("aliyun")} style={{ padding: "5px 12px", fontSize: "12px" }}>云市场 AppCode</button>
              </div>
              {apiAuthType === "direct" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div className="dialogField" style={{ marginBottom: 0 }}><label>AppKey</label><input value={apiAppKey} onChange={(e) => setApiAppKey(e.target.value)} placeholder="填写 AppKey" /></div>
                  <div className="dialogField" style={{ marginBottom: 0 }}><label>AppSecret</label><input value={apiAppSecret} onChange={(e) => setApiAppSecret(e.target.value)} placeholder="填写 AppSecret" /></div>
                </div>
              ) : (
                <div className="dialogField" style={{ marginBottom: 0 }}><label>AppCode</label><input value={apiAppCode} onChange={(e) => setApiAppCode(e.target.value)} placeholder="填写云市场 AppCode" /></div>
              )}
              <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", marginTop: "12px", padding: "12px 14px", border: "1px solid var(--line)", borderRadius: "10px", background: "rgba(var(--fg-rgb), 0.03)", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={apiExternalConsent}
                  onChange={(e) => updateApiExternalConsent(e.target.checked)}
                  style={{ marginTop: "2px" }}
                />
                <span style={{ fontSize: "12px", color: "var(--text)", lineHeight: 1.7 }}>
                  {API_EXTERNAL_SERVICE_CONSENT_LABEL}
                </span>
              </label>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "12px" }}>
                <button style={{ fontSize: "12px", padding: "6px 14px" }} onClick={() => setShowApiForm(false)}>取消</button>
                <button style={{ fontSize: "12px", padding: "6px 14px", background: "var(--primary)", color: "#fff", border: "none" }} onClick={handleSaveApi} disabled={savingApi}>保存</button>
              </div>
            </div>
          )}
        </div>
      </SettingSection>

      <SettingSection title="RPA 验真配置">
        <div className="settingsConfigCard">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {rpaStatus?.configured ? Icons.check : Icons.x}
              <span style={{ fontSize: "13px" }}>{rpaStatus?.configured ? "已配置验证码识别服务" : "未配置"}</span>
              <span style={{ fontSize: "11px", color: verifyMode === "rpa" ? "#1d4ed8" : "var(--muted)", padding: "2px 8px", borderRadius: "999px", border: verifyMode === "rpa" ? "1px solid rgba(29, 78, 216, 0.3)" : "1px solid var(--line)", background: verifyMode === "rpa" ? "rgba(29, 78, 216, 0.08)" : "rgba(var(--fg-rgb), 0.03)" }}>
                {verifyMode === "rpa" ? "当前启用" : "未启用"}
              </span>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              {rpaStatus?.configured && <button style={{ fontSize: "12px", padding: "4px 10px" }} className="danger" onClick={handleClearRpa}>退出</button>}
              <button style={{ fontSize: "12px", padding: "4px 10px" }} onClick={() => setShowRpaForm(!showRpaForm)}>
                {rpaStatus?.configured ? "更换" : "配置"}
              </button>
            </div>
          </div>
          {showRpaForm && (
            <div style={{ marginTop: "14px", borderTop: "1px solid var(--line)", paddingTop: "14px" }}>
              <div style={{ padding: "12px 14px", border: "1px solid rgba(106, 166, 255, 0.25)", borderRadius: "10px", background: "rgba(106, 166, 255, 0.08)", marginBottom: "12px" }}>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)", marginBottom: "4px" }}>RPA 外部服务说明</div>
                <div style={{ fontSize: "12px", color: "var(--muted)", lineHeight: 1.7 }}>
                  {RPA_EXTERNAL_SERVICE_NOTICE}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "10px" }}>
                  <button style={{ fontSize: "12px", padding: "6px 12px" }} onClick={() => onOpenLegalDocument("privacy")}>查看隐私说明</button>
                  <button style={{ fontSize: "12px", padding: "6px 12px" }} onClick={() => onOpenLegalDocument("third-party")}>查看第三方说明</button>
                </div>
              </div>
              <div className="dialogField" style={{ marginBottom: 0 }}><label>验证码识别 AppKey</label><input value={rpaCaptchaKey} onChange={(e) => setRpaCaptchaKey(e.target.value)} placeholder="填写验证码识别服务 AppKey" /></div>
              <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", marginTop: "12px", padding: "12px 14px", border: "1px solid var(--line)", borderRadius: "10px", background: "rgba(var(--fg-rgb), 0.03)", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={rpaExternalConsent}
                  onChange={(e) => updateRpaExternalConsent(e.target.checked)}
                  style={{ marginTop: "2px" }}
                />
                <span style={{ fontSize: "12px", color: "var(--text)", lineHeight: 1.7 }}>
                  {RPA_EXTERNAL_SERVICE_CONSENT_LABEL}
                </span>
              </label>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "12px" }}>
                <button style={{ fontSize: "12px", padding: "6px 14px" }} onClick={() => setShowRpaForm(false)}>取消</button>
                <button style={{ fontSize: "12px", padding: "6px 14px", background: "var(--primary)", color: "#fff", border: "none" }} onClick={handleSaveRpa} disabled={savingRpa}>保存</button>
              </div>
            </div>
          )}
        </div>
      </SettingSection>

      <SettingSection title="RPA 截图方式" description="RPA 查验完成后保存的结果截图风格。">
        <div className="settingsConfigCard">
          <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "10px 12px", borderRadius: "8px", cursor: "pointer", background: settingsHook.settings.rpaScreenshotMode === "dialog" ? "rgba(29, 78, 216, 0.06)" : "transparent", border: settingsHook.settings.rpaScreenshotMode === "dialog" ? "1px solid rgba(29, 78, 216, 0.3)" : "1px solid var(--line)" }}>
            <input
              type="radio"
              name="rpa-screenshot-mode"
              checked={settingsHook.settings.rpaScreenshotMode === "dialog"}
              onChange={() => { settingsHook.setRpaScreenshotMode("dialog"); showToast("已切换为：仅查验结果", "success"); }}
              style={{ marginTop: "3px" }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>仅查验结果（默认）</div>
              <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "2px", lineHeight: 1.6 }}>
                只截取查验结果弹窗区域，文件较小。
              </div>
            </div>
          </label>
          <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "10px 12px", borderRadius: "8px", marginTop: "8px", cursor: "pointer", background: settingsHook.settings.rpaScreenshotMode === "with_url" ? "rgba(29, 78, 216, 0.06)" : "transparent", border: settingsHook.settings.rpaScreenshotMode === "with_url" ? "1px solid rgba(29, 78, 216, 0.3)" : "1px solid var(--line)" }}>
            <input
              type="radio"
              name="rpa-screenshot-mode"
              checked={settingsHook.settings.rpaScreenshotMode === "with_url"}
              onChange={() => { settingsHook.setRpaScreenshotMode("with_url"); showToast("已切换为：查验结果 + 验真地址栏", "success"); }}
              style={{ marginTop: "3px" }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>查验结果 + 验真地址栏</div>
              <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "2px", lineHeight: 1.6 }}>
                在查验结果上方叠加仿真地址栏（含锁标和当前 URL），便于证明截图来源于税局官网。
              </div>
            </div>
          </label>
        </div>
      </SettingSection>

      <SettingSection title="RPA 浏览器环境">
        <div className="settingsConfigCard">
          <div style={{ padding: "12px 14px", border: "1px solid var(--line)", borderRadius: "10px", background: rpaEngineInstalled ? "rgba(76, 175, 80, 0.08)" : "rgba(245, 158, 11, 0.08)", marginBottom: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
              {rpaEngineInstalled ? Icons.check : Icons.x}
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>
                {rpaEngineInstalled ? "RPA 引擎已安装" : "RPA 引擎未安装"}
              </span>
            </div>
            <div style={{ fontSize: "12px", color: "var(--muted)", lineHeight: 1.7 }}>
              {componentStatus.message}
            </div>
            {!rpaEngineInstalled && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", marginTop: "6px" }}>
                <div style={{ fontSize: "12px", color: "var(--muted)", lineHeight: 1.7, flex: 1, minWidth: "220px" }}>
                  当前基础包不包含 RPA 引擎。浏览器环境可以先配置，但浏览器验真和测试启动需要先安装可选的 RPA 组件。
                </div>
                <button
                  style={{ fontSize: "12px", padding: "6px 12px", background: "var(--primary)", color: "#fff", border: "none" }}
                  onClick={handleInstallRpaEngine}
                  disabled={installingRpaEngine}
                >
                  {installingRpaEngine ? "安装中..." : "前往导入插件"}
                </button>
              </div>
            )}
            {componentStatus.componentRoot && (
              <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "8px", wordBreak: "break-all" }}>
                组件目录：{componentStatus.componentRoot}
              </div>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>当前生效浏览器</div>
              <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "4px", wordBreak: "break-all" }}>
                {effectiveBrowserText}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginTop: "8px" }}>
                <span style={{ fontSize: "12px", color: "var(--muted)" }}>已保存默认浏览器：{savedBrowserPreferenceLabel}</span>
                {browserSettingsDirty && (
                  <span style={{ fontSize: "11px", color: "#f59e0b", padding: "2px 8px", borderRadius: "999px", border: "1px solid rgba(245, 158, 11, 0.35)", background: "rgba(245, 158, 11, 0.08)" }}>
                    未保存更改
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
              {browserStatus.canLaunch ? Icons.check : Icons.x}
              <span style={{ fontSize: "12px", color: "var(--text)" }}>
                {browserStatus.canLaunch ? "可启动" : "当前不可用"}
              </span>
            </div>
          </div>

          <div style={{ marginTop: "14px" }}>
            <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "8px" }}>默认执行浏览器</div>
            <div className="settingsChipGroup">
              <button type="button" className={`settingsChip ${rpaBrowserPreference === "auto" ? "settingsChipActive" : ""}`} onClick={() => setRpaBrowserPreference("auto")}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  {rpaBrowserPreference === "auto" ? Icons.check : null}
                  <span>自动</span>
                </span>
              </button>
              <button type="button" className={`settingsChip ${rpaBrowserPreference === "edge" ? "settingsChipActive" : ""}`} onClick={() => setRpaBrowserPreference("edge")}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  {rpaBrowserPreference === "edge" ? Icons.check : null}
                  <span>Microsoft Edge</span>
                </span>
              </button>
              <button type="button" className={`settingsChip ${rpaBrowserPreference === "chrome" ? "settingsChipActive" : ""}`} onClick={() => setRpaBrowserPreference("chrome")}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  {rpaBrowserPreference === "chrome" ? Icons.check : null}
                  <span>Chrome</span>
                </span>
              </button>
            </div>
            <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "8px" }}>
              当前编辑：{editingBrowserPreferenceLabel}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px", marginTop: "14px" }}>
            <BrowserStatusCard title="Microsoft Edge" available={browserStatus.edge.available} path={browserStatus.edge.path} hint="自动模式下优先使用系统 Edge。" />
            <BrowserStatusCard title="Chrome" available={browserStatus.chrome.available} path={browserStatus.chrome.path} hint={browserStatus.chrome.configured ? "使用你指定的 Chrome 路径。" : "可指定本机 Chrome 可执行文件。"} />
          </div>

          <div className="dialogField" style={{ marginTop: "14px", marginBottom: 0 }}>
            <label>Chrome 可执行文件路径</label>
            <input value={rpaChromiumExecutablePath} onChange={(e) => setRpaChromiumExecutablePath(e.target.value)} placeholder="可选，选择 chrome.exe" />
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "12px" }}>
            <button style={{ fontSize: "12px", padding: "6px 12px" }} onClick={handlePickChromeExecutable}>选择文件</button>
            <button style={{ fontSize: "12px", padding: "6px 12px" }} onClick={() => setRpaChromiumExecutablePath("")} disabled={!rpaChromiumExecutablePath}>清空路径</button>
            <button style={{ fontSize: "12px", padding: "6px 12px" }} onClick={handleRefreshRpaBrowser} disabled={refreshingRpaBrowser}>重新检测</button>
            <button style={{ fontSize: "12px", padding: "6px 12px" }} onClick={handleTestRpaBrowser} disabled={testingRpaBrowser || !rpaEngineInstalled}>测试启动</button>
            <button style={{ fontSize: "12px", padding: "6px 12px", background: "var(--primary)", color: "#fff", border: "none" }} onClick={handleSaveRpaBrowser} disabled={savingRpaBrowser || !browserSettingsDirty}>保存浏览器设置</button>
          </div>
        </div>
      </SettingSection>

      <SettingSection title="查验记录">
        <DangerAction title="清除所有查验记录" description="删除 API 和 RPA 所有历史查验数据" buttonText="清除记录" onClick={handleClearHistory} />
      </SettingSection>
    </div>
  );
}

function ComplianceSettings({
  onOpenLegalDocument,
}: {
  onOpenLegalDocument: (documentId: LegalDocumentId) => void;
}) {
  const [apiExternalConsent, setApiExternalConsentState] = useState(() => getApiExternalServiceConsent());
  const [rpaExternalConsent, setRpaExternalConsentState] = useState(() => getRpaExternalServiceConsent());

  const updateApiConsent = useCallback((next: boolean) => {
    setApiExternalConsentState(next);
    setApiExternalServiceConsent(next);
  }, []);

  const updateConsent = useCallback((next: boolean) => {
    setRpaExternalConsentState(next);
    setRpaExternalServiceConsent(next);
  }, []);

  return (
    <div className="settingsContent">
      <div className="settingsHint">
        当前版本验真凭据存储已受保护
      </div>

      <SettingSection title="文档入口">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
          <div className="settingsConfigCard">
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)", marginBottom: "6px" }}>隐私与数据处理说明</div>
            <div style={{ fontSize: "12px", color: "var(--muted)", lineHeight: 1.7, marginBottom: "12px" }}>
              说明本地保存的数据、何时会向外部服务发送数据，以及用户如何清理配置、记录与缓存。
            </div>
            <button style={{ fontSize: "12px", padding: "6px 12px" }} onClick={() => onOpenLegalDocument("privacy")}>打开文档</button>
          </div>
          <div className="settingsConfigCard">
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)", marginBottom: "6px" }}>用户使用协议</div>
            <div style={{ fontSize: "12px", color: "var(--muted)", lineHeight: 1.7, marginBottom: "12px" }}>
              说明工具使用范围、用户责任、外部服务限制以及版本更新后的重新确认规则。
            </div>
            <button style={{ fontSize: "12px", padding: "6px 12px" }} onClick={() => onOpenLegalDocument("agreement")}>打开文档</button>
          </div>
          <div className="settingsConfigCard">
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)", marginBottom: "6px" }}>第三方组件与运行时说明</div>
            <div style={{ fontSize: "12px", color: "var(--muted)", lineHeight: 1.7, marginBottom: "12px" }}>
              说明为什么安装包较大、当前发行物包含哪些关键运行时，以及正式发版时需要继续维护的许可证材料。
            </div>
            <button style={{ fontSize: "12px", padding: "6px 12px" }} onClick={() => onOpenLegalDocument("third-party")}>打开文档</button>
          </div>
        </div>
      </SettingSection>

      <SettingSection title="API 外部服务告知" description="仅在使用 API 查验时生效。">
        <div className="settingsConfigCard">
          <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)", marginBottom: "6px" }}>外部验真服务</div>
          <div style={{ fontSize: "12px", color: "var(--muted)", lineHeight: 1.7 }}>
            {API_EXTERNAL_SERVICE_NOTICE}
          </div>
          <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", marginTop: "12px", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={apiExternalConsent}
              onChange={(e) => updateApiConsent(e.target.checked)}
              style={{ marginTop: "2px" }}
            />
            <span style={{ fontSize: "12px", color: "var(--text)", lineHeight: 1.7 }}>
              {API_EXTERNAL_SERVICE_CONSENT_LABEL}
            </span>
          </label>
        </div>
      </SettingSection>

      <SettingSection title="RPA 外部服务告知" description="仅在使用 RPA 验真时生效。">
        <div className="settingsConfigCard">
          <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)", marginBottom: "6px" }}>第三方验证码识别服务</div>
          <div style={{ fontSize: "12px", color: "var(--muted)", lineHeight: 1.7 }}>
            {RPA_EXTERNAL_SERVICE_NOTICE}
          </div>
          <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", marginTop: "12px", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={rpaExternalConsent}
              onChange={(e) => updateConsent(e.target.checked)}
              style={{ marginTop: "2px" }}
            />
            <span style={{ fontSize: "12px", color: "var(--text)", lineHeight: 1.7 }}>
              {RPA_EXTERNAL_SERVICE_CONSENT_LABEL}
            </span>
          </label>
        </div>
      </SettingSection>
    </div>
  );
}

function DonateSettings() {
  return (
    <div className="settingsContent">
      <div style={{
        background: "linear-gradient(135deg, rgba(251, 146, 60, 0.12) 0%, rgba(249, 115, 22, 0.06) 50%, rgba(234, 88, 12, 0.1) 100%)",
        borderRadius: "12px",
        padding: "16px 20px",
        textAlign: "center",
        marginBottom: "8px",
        border: "1px solid rgba(251, 146, 60, 0.15)",
      }}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)", marginBottom: "4px" }}>
          ☕ 请作者喝杯咖啡
        </div>
        <div style={{ fontSize: "12px", color: "var(--muted)", lineHeight: 1.6 }}>
          如果这个工具帮到了你，随手支持一下吧 · 金额随意，心意无价
        </div>
      </div>

      <SettingSection title="扫码打赏">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <div className="settingsConfigCard" style={{
            display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 16px 18px",
            transition: "box-shadow 0.2s, transform 0.2s", cursor: "default",
          }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 20px rgba(7, 193, 96, 0.12)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = ""; e.currentTarget.style.transform = ""; }}
          >
            <div style={{
              width: "168px", height: "168px", borderRadius: "12px", overflow: "hidden",
              border: "2px solid rgba(7, 193, 96, 0.2)", marginBottom: "14px",
              display: "flex", alignItems: "center", justifyContent: "center", background: "#fff",
            }}>
              <img src={wechatQr} alt="微信打赏" style={{ width: "160px", height: "160px" }} />
            </div>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: "6px",
              padding: "4px 14px", borderRadius: "999px",
              background: "rgba(7, 193, 96, 0.1)", color: "#07c160",
              fontSize: "12px", fontWeight: 600,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm3.91 4.55c-1.98 0-3.797.657-5.159 1.783-1.418 1.174-2.201 2.806-2.201 4.593 0 1.787.783 3.42 2.2 4.593 1.363 1.126 3.18 1.783 5.16 1.783a8.71 8.71 0 0 0 2.347-.32.72.72 0 0 1 .596.082l1.58.926a.272.272 0 0 0 .14.045c.133 0 .241-.11.241-.245 0-.06-.024-.12-.04-.177l-.323-1.229a.493.493 0 0 1 .177-.553C22.096 20.878 24 19.137 24 16.917c0-1.787-.783-3.42-2.201-4.593-1.362-1.126-3.18-1.783-5.16-1.783h.001zm-2.834 3.27a.98.98 0 0 1 .966.98.98.98 0 0 1-.966.98.98.98 0 0 1-.965-.98.98.98 0 0 1 .965-.98zm5.668 0a.98.98 0 0 1 .966.98.98.98 0 0 1-.966.98.98.98 0 0 1-.965-.98.98.98 0 0 1 .965-.98z"/></svg>
              微信
            </div>
          </div>
          <div className="settingsConfigCard" style={{
            display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 16px 18px",
            transition: "box-shadow 0.2s, transform 0.2s", cursor: "default",
          }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 20px rgba(0, 119, 255, 0.12)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = ""; e.currentTarget.style.transform = ""; }}
          >
            <div style={{
              width: "168px", height: "168px", borderRadius: "12px", overflow: "hidden",
              border: "2px solid rgba(0, 119, 255, 0.2)", marginBottom: "14px",
              display: "flex", alignItems: "center", justifyContent: "center", background: "#fff",
            }}>
              <img src={alipayQr} alt="支付宝打赏" style={{ width: "160px", height: "160px" }} />
            </div>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: "6px",
              padding: "4px 14px", borderRadius: "999px",
              background: "rgba(0, 119, 255, 0.1)", color: "#0077ff",
              fontSize: "12px", fontWeight: 600,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M21.422 13.477C21.035 13.29 15.07 10.553 14.2 10.14c-.274-.13-.573-.196-.872-.196-.464 0-.862.192-1.087.526-.275.41-.757 1.377-.928 1.693-.058.107-.166.234-.292.234-.108 0-.205-.055-.286-.1C9.91 11.88 8.642 10.68 7.67 9.322c-.103-.144-.11-.262-.015-.404.093-.139.37-.465.544-.673.172-.206.326-.477.326-.77 0-.215-.08-.425-.186-.597-.223-.362-1.058-2.56-1.282-3.103-.215-.523-.543-.781-.98-.781-.097 0-.204.013-.318.04C5.13 3.192 4.13 3.96 3.5 4.965 2.89 5.938 2.57 7.08 2.57 8.26c0 .363.038.725.114 1.077.143.665.416 1.293.7 1.868.625 1.264 1.476 2.448 2.444 3.477 1.81 1.926 4.108 3.438 6.65 4.378.96.355 2.034.63 3.065.737.165.017.33.026.492.026 1.13 0 2.12-.425 2.928-1.218.004-.004.013-.013.017-.017.308-.355.681-.653 1.004-.97.324-.318.545-.717.545-1.148 0-.445-.233-.836-.558-1.12l-2.55-1.873z"/></svg>
              支付宝
            </div>
          </div>
        </div>
      </SettingSection>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", alignItems: "start" }}>
        <SettingSection title="其他支持方式">
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {[
              { icon: "🐛", title: "反馈 Bug", desc: "发现问题及时反馈改进" },
              { icon: "💡", title: "功能建议", desc: "提出想法一起让它更好" },
            ].map(item => (
              <div key={item.title} className="settingsConfigCard" style={{
                padding: "12px 14px", display: "flex", alignItems: "center", gap: "12px",
                transition: "box-shadow 0.2s, transform 0.2s",
              }}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.06)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}
              >
                <div style={{ fontSize: "20px", flexShrink: 0 }}>{item.icon}</div>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)", marginBottom: "2px" }}>{item.title}</div>
                  <div style={{ fontSize: "11px", color: "var(--muted)", lineHeight: 1.5 }}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </SettingSection>

        <SettingSection title="联系与反馈">
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div className="settingsConfigCard" style={{
              padding: "12px 14px", display: "flex", alignItems: "center", gap: "12px",
              transition: "box-shadow 0.2s",
            }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.06)"; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = ""; }}
            >
              <div style={{
                width: "36px", height: "36px", borderRadius: "10px", flexShrink: 0,
                background: "rgba(59, 130, 246, 0.1)", display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)", marginBottom: "2px" }}>论坛帖子</div>
                <div style={{ fontSize: "11px", color: "var(--muted)" }}>反馈、建议、更新都在这里</div>
              </div>
              <button style={{ fontSize: "12px", padding: "5px 14px", borderRadius: "8px", flexShrink: 0 }} onClick={() => window.invoiceApi.openExternal("https://www.52pojie.cn/thread-2090026-1-1.html").catch(() => {})}>
                打开
              </button>
            </div>
            <div className="settingsConfigCard" style={{
              padding: "12px 14px", display: "flex", alignItems: "center", gap: "12px",
              transition: "box-shadow 0.2s",
            }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.06)"; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = ""; }}
            >
              <div style={{
                width: "36px", height: "36px", borderRadius: "10px", flexShrink: 0,
                background: "rgba(16, 185, 129, 0.1)", display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)", marginBottom: "2px" }}>联系邮箱</div>
                <div style={{ fontSize: "11px", color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis" }}>Danteshutao@outlook.com</div>
              </div>
              <button style={{ fontSize: "12px", padding: "5px 14px", borderRadius: "8px", flexShrink: 0 }} onClick={() => window.invoiceApi.openExternal("mailto:Danteshutao@outlook.com").catch(() => {})}>
                发邮件
              </button>
            </div>
          </div>
        </SettingSection>
      </div>
    </div>
  );
}

function ReimbursementSettings({
  settingsHook,
  showToast,
}: {
  settingsHook: UseSettingsReturn;
  showToast: (msg: string, type?: "info" | "success" | "error" | "warning") => void;
}) {
  const { settings, setReimbursementDefaults } = settingsHook;
  const d = settings.reimbursementDefaults;

  return (
    <div className="settingsContent">
      <div className="settingsHint">以下默认值将在新建报销单时自动填充。</div>

      <SettingSection title="默认申请人">
        <div className="dialogField" style={{ marginBottom: 0 }}>
          <input value={d.applicant} onChange={(e) => setReimbursementDefaults({ applicant: e.target.value })}
            onBlur={() => showToast("已保存", "success")} placeholder="请输入默认申请人" />
        </div>
      </SettingSection>

      <SettingSection title="默认部门">
        <div className="dialogField" style={{ marginBottom: 0 }}>
          <input value={d.department} onChange={(e) => setReimbursementDefaults({ department: e.target.value })}
            onBlur={() => showToast("已保存", "success")} placeholder="请输入默认部门" />
        </div>
      </SettingSection>

      <SettingSection title="默认销售">
        <div className="dialogField" style={{ marginBottom: 0 }}>
          <input value={d.sales} onChange={(e) => setReimbursementDefaults({ sales: e.target.value })}
            onBlur={() => showToast("已保存", "success")} placeholder="请输入默认销售" />
        </div>
      </SettingSection>
    </div>
  );
}

type StoragePaths = {
  database: { path: string; sizeMB: number };
  files: { path: string; count: number; sizeMB: number };
  logs: { path: string; count: number; sizeMB: number };
  config: { path: string; count: number; sizeMB: number };
  images: { path: string; count: number; sizeMB: number };
  outputs: { path: string; count: number; sizeMB: number };
};

function DataSettings({
  archiveState,
  reimbursementState,
  showToast,
  onConfirm,
}: {
  archiveState: UseArchiveStateReturn;
  reimbursementState: UseReimbursementReturn;
  showToast: (msg: string, type?: "info" | "success" | "error" | "warning") => void;
  onConfirm: (opts: { title: string; message: string; confirmText?: string; danger?: boolean; onConfirm: () => void }) => void;
}) {
  const invoiceCount = archiveState.invoices.length;
  const folderCount = archiveState.allFolders.length;
  const tagCount = archiveState.allTags.length;
  const reimbCount = reimbursementState.allReimbursements.length;

  const [paths, setPaths] = useState<StoragePaths | null>(null);

  const loadStoragePaths = useCallback(() => {
    if (typeof window.invoiceApi.getStoragePaths === "function") {
      window.invoiceApi.getStoragePaths().then(setPaths).catch(() => {});
    } else {
      Promise.all([
        window.invoiceApi.getDataPath().catch(() => null),
        window.invoiceApi.getStorageStats().catch(() => null),
      ]).then(([dataPath, stats]) => {
        if (dataPath) {
          setPaths({
            database: { path: dataPath, sizeMB: 0 },
            files: { path: dataPath, count: stats?.totalFiles ?? 0, sizeMB: stats?.totalSizeMB ?? 0 },
            logs: { path: "", count: 0, sizeMB: 0 },
            config: { path: "", count: 0, sizeMB: 0 },
            images: { path: "", count: 0, sizeMB: 0 },
            outputs: { path: "", count: 0, sizeMB: 0 },
          });
        }
      });
    }
  }, []);

  useEffect(() => {
    loadStoragePaths();
  }, [loadStoragePaths]);

  const clearCache = useCallback(() => {
    onConfirm({
      title: "清除本地缓存",
      message: "确定要清除以下缓存吗？发票、报销、合规同意状态、验真配置（API/RPA 密钥与方式偏好）不受影响。\n\n• OCR 识别结果\n• 预览渲染图与缩略图\n• OFD 转码副本（outputs/ofd_cache、outputs/ofd_render_cache）\n• 验真当日次数限制等运行时数据",
      confirmText: "清除",
      danger: true,
      onConfirm: async () => {
        try {
          const report = await clearAllCaches();
          const memoryTotal =
            report.memoryEntries.ocr +
            report.memoryEntries.renderedPreview +
            report.memoryEntries.image +
            report.memoryEntries.imagePreview +
            report.memoryEntries.ofdWarmup;
          const parts: string[] = [];
          parts.push(`本地存储 ${report.localStorageRemoved} 项`);
          parts.push(`内存 ${memoryTotal} 项`);
          if (report.diskDeletedFiles > 0 || report.diskFreedBytes > 0) {
            parts.push(`磁盘 ${report.diskDeletedFiles} 文件 / ${formatBytes(report.diskFreedBytes)}`);
          }
          const tone: "success" | "warning" = report.errors.length > 0 ? "warning" : "success";
          showToast(`已清除 ${parts.join(" · ")}${report.errors.length > 0 ? `（${report.errors.length} 项失败）` : ""}`, tone);
          if (report.errors.length > 0) {
            console.warn("[clearCache] 部分缓存清除失败", report.errors);
          }
          loadStoragePaths();
        } catch (e) {
          console.error("[clearCache] 清除失败", e);
          showToast("清除缓存失败：" + (e instanceof Error ? e.message : String(e)), "error");
        }
      },
    });
  }, [showToast, onConfirm, loadStoragePaths]);

  const openPath = useCallback((p: string) => {
    window.invoiceApi.showItemInFolder(p);
  }, []);

  const [changing, setChanging] = useState(false);

  const handleChangeStorageRoot = useCallback(async () => {
    const dir = await window.invoiceApi.pickStorageDirectory("选择新的存储位置");
    if (!dir) return;
    onConfirm({
      title: "确认迁移存储位置",
      message: `将数据迁移到以下目录，完成后应用需要重启。\n\n目标路径：${dir}\n\n请确保目标磁盘有足够空间。`,
      confirmText: "开始迁移",
      danger: false,
      onConfirm: async () => {
        setChanging(true);
        try {
          const result = await window.invoiceApi.changeStorageRoot(dir, true);
          if (result.success) {
            showToast("存储位置已迁移，即将重启应用...", "success");
            setTimeout(() => {
              window.invoiceApi.relaunchApp();
            }, 1500);
          }
        } catch (e) {
          showToast(`修改存储位置失败: ${e instanceof Error ? e.message : String(e)}`, "error");
        } finally {
          setChanging(false);
        }
      },
    });
  }, [onConfirm, showToast]);

  const STORAGE_ITEMS: { key: keyof StoragePaths; label: string; desc: string }[] = [
    { key: "database", label: "数据库", desc: "SQLite 数据库文件" },
    { key: "files", label: "发票文件", desc: "归档发票文件存储" },
    { key: "logs", label: "日志", desc: "运行日志文件" },
    { key: "config", label: "配置", desc: "API / RPA 配置文件" },
    { key: "images", label: "截图", desc: "RPA 验真截图" },
    { key: "outputs", label: "输出", desc: "导出 PDF 和 OFD 缓存目录" },
  ];

  return (
    <div className="settingsContent">
      <SettingSection title="存储位置">
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {STORAGE_ITEMS.map(({ key, label, desc }) => {
            const item = paths?.[key];
            const sizeStr = item ? `${item.sizeMB} MB` : "—";
            const countStr = item && "count" in item ? `${(item as { count: number }).count} 个文件 · ` : "";
            return (
              <div key={key} className="settingsConfigCard" style={{ padding: "10px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px" }}>
                      <span style={{ fontSize: "13px", fontWeight: 500 }}>{label}</span>
                      <span style={{ fontSize: "11px", color: "var(--muted)" }}>{desc}</span>
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--muted)", wordBreak: "break-all" }}>
                      {item?.path || "加载中..."}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "2px" }}>
                      {countStr}{sizeStr}
                    </div>
                  </div>
                  {item?.path && (
                    <button style={{ fontSize: "12px", padding: "4px 10px", flexShrink: 0 }}
                      onClick={() => openPath(item.path)}>
                      {Icons.folder} 打开
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: "10px" }}>
          <button
            style={{ fontSize: "12px", padding: "6px 14px" }}
            onClick={handleChangeStorageRoot}
            disabled={changing}
          >
            {Icons.folder} {changing ? "迁移中..." : "修改位置"}
          </button>
        </div>
      </SettingSection>

      <SettingSection title="当前数据">
        <div className="settingsConfigCard">
          <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", fontSize: "13px" }}>
            <span>发票 <b>{invoiceCount}</b> 张</span>
            <span>文件夹 <b>{folderCount}</b> 个</span>
            <span>标签 <b>{tagCount}</b> 个</span>
            <span>报销单 <b>{reimbCount}</b> 个</span>
          </div>
        </div>
      </SettingSection>

      <SettingSection title="清除数据">
        <DangerAction title="清除本地缓存" description="清除 OCR 识别、预览渲染、OFD 转码副本等缓存，不影响发票、报销与合规同意状态" buttonText="清除" onClick={clearCache} />
      </SettingSection>
    </div>
  );
}

function SettingSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="settingsSection" style={{ width: "100%", minWidth: 0 }}>
      <div className="settingsSectionHeader">
        <div className="settingsSectionTitle">{title}</div>
        {description && <div className="settingsSectionDesc">{description}</div>}
      </div>
      {children}
    </div>
  );
}

function DangerAction({ title, description, buttonText, disabled, onClick }: { title: string; description: string; buttonText: string; disabled?: boolean; onClick: () => void }) {
  return (
    <div className="settingsDangerRow">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "13px", fontWeight: 500 }}>{title}</div>
        <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "2px" }}>{description}</div>
      </div>
      <button className="danger" onClick={onClick} disabled={disabled} style={{ fontSize: "12px", padding: "6px 14px", flexShrink: 0 }}>{buttonText}</button>
    </div>
  );
}

function OcrSettings({ showToast }: { showToast: (msg: string, type?: "info" | "success" | "error" | "warning") => void }) {
  const [status, setStatus] = useState<{ active: "rapidocr" | "winrt" | "none"; rapidocr: boolean; winrt: boolean } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.invoiceApi.ocrGetEngineStatus()
      .then((res) => {
        setStatus(res);
        setLoading(false);
      })
      .catch((err) => {
        console.error("获取OCR引擎状态失败:", err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="settingsContent" style={{ display: "flex", justifyContent: "center", padding: "40px" }}>
        <span>正在读取 OCR 引擎状态...</span>
      </div>
    );
  }

  return (
    <div className="settingsContent">
      <SettingSection title="OCR 推理引擎" description="系统在处理图片和不可直接复制文本的 PDF/OFD 文件时所使用的光学字符识别推理后端。">
        <div className="settingsConfigCard" style={{ padding: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>当前活动推理后端:</span>
            {status?.active === "rapidocr" && (
              <span className="settingsChip settingsChipActive" style={{ background: "rgba(76, 175, 80, 0.12)", color: "#4caf50", border: "1px solid rgba(76, 175, 80, 0.3)", padding: "4px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: 600 }}>
                RapidOCR (ONNX Runtime 极速本地引擎)
              </span>
            )}
            {status?.active === "winrt" && (
              <span className="settingsChip settingsChipActive" style={{ background: "rgba(245, 158, 11, 0.12)", color: "#f59e0b", border: "1px solid rgba(245, 158, 11, 0.3)", padding: "4px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: 600 }}>
                Windows Media OCR (系统自带组件)
              </span>
            )}
            {status?.active === "none" && (
              <span className="settingsChip settingsChipActive" style={{ background: "rgba(239, 68, 68, 0.12)", color: "#ef4444", border: "1px solid rgba(239, 68, 68, 0.3)", padding: "4px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: 600 }}>
                暂不可用 (请检查安装环境)
              </span>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div style={{ padding: "12px 14px", border: "1px solid var(--line)", borderRadius: "10px", background: "var(--card-bg)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>RapidOCR 引擎</span>
                <span style={{ fontSize: "12px", fontWeight: 600, color: status?.rapidocr ? "#4caf50" : "var(--muted)" }}>
                  {status?.rapidocr ? "● 已就绪" : "○ 未就绪"}
                </span>
              </div>
              <div style={{ fontSize: "12px", color: "var(--muted)", lineHeight: 1.6 }}>
                本产品内置的高精度深度学习 OCR 推理器，基于 ONNX Runtime 本地加载 PP-OCRv6 预训练模型。支持中英文混排、倾斜发票精准对正，不依赖任何第三方云端接口，运行效率极高。
              </div>
            </div>

            <div style={{ padding: "12px 14px", border: "1px solid var(--line)", borderRadius: "10px", background: "var(--card-bg)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>Windows Media OCR</span>
                <span style={{ fontSize: "12px", fontWeight: 600, color: status?.winrt ? "#4caf50" : "var(--muted)" }}>
                  {status?.winrt ? "● 已就绪" : "○ 暂不可用"}
                </span>
              </div>
              <div style={{ fontSize: "12px", color: "var(--muted)", lineHeight: 1.6 }}>
                微软 Windows 10/11 系统自带的 WinRT 媒体光学字符识别接口。作为系统自带备份方案，能胜任清晰标准发票的简单提取，由于存在系统盘中转，性能开销和长句对齐精度略低于 RapidOCR。
              </div>
            </div>
          </div>
        </div>
      </SettingSection>

      <SettingSection title="隐私与安全承诺" description="发票管家软件严格恪守本地离线运行的原则。">
        <div className="settingsConfigCard" style={{ padding: "16px", background: "rgba(76, 175, 80, 0.05)", border: "1px solid rgba(76, 175, 80, 0.15)", borderRadius: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4caf50" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "#4caf50" }}>100% 本地离线处理</span>
          </div>
          <div style={{ fontSize: "12px", color: "var(--text)", lineHeight: 1.7 }}>
            无论是使用内置的 RapidOCR 引擎，还是使用系统自带的 Windows Media OCR，发票的图片识别、文字解析与报销汇总<strong>全部完全在您的本地计算机上完成</strong>，绝不会将您的发票图像、识别结果或敏感文本上传至任何外部云服务器或第三方。您的商业隐私和个人数据安全受到 100% 的严格本地保护。
          </div>
        </div>
      </SettingSection>
    </div>
  );
}
