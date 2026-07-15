import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import type { ArchivedInvoice, InvoiceFolder } from "../types";
import { CATEGORY_LABELS } from "../hooks/useArchiveState";
import { FolderTree } from "../components/archive/FolderTree";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { LegalDocumentDialog } from "../components/LegalDocumentDialog";
import { VerifyIcons } from "../components/icons/VerifyIcons";
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
  subscribeVerifyConfigSync,
  type VerifyMode,
} from "../utils/verifyConfigSync";

type VerifyResultData = {
  fpdm?: string;
  fphm?: string;
  kprq?: string;
  je?: string;
  jshj?: string;
  se?: string;
  gfmc?: string;
  xfmc?: string;
  delStatus?: string;
  del?: string;
  fpzt?: string;
  fplx?: string;
  fplxName?: string;
  code?: string;
  eTicketNo?: string;
  businessType?: string;
  goodsamount?: string;
  taxamount?: string;
  sumamount?: string;
  passenger?: string;
  idNumber?: string;
  departure?: string;
  arrival?: string;
  trainNo?: string;
  travelDate?: string;
  departureTime?: string;
  seatType?: string;
  seatNo?: string;
  carriage?: string;
  acFeature?: string;
  ticketType?: string;
  xfMc?: string;
  xfNsrsbh?: string;
  xfContact?: string;
  xfBank?: string;
  gfMc?: string;
  gfNsrsbh?: string;
  gfContact?: string;
  gfBank?: string;
  queryCount?: string;
  updateTime?: string;
  remark?: string;
  goodsData?: Array<Record<string, string>>;
};

type RpaComponentStatus = {
  installed: boolean;
  componentRoot: string;
  pythonPath: string;
  message: string;
};

function toVerifyResult(raw: { success: boolean; [key: string]: unknown }): VerifyResult {
  return raw as unknown as VerifyResult;
}

type VerifyResult = {
  success: boolean;
  code?: number;
  data?: VerifyResultData;
  error?: string;
  description?: string;
  needConfig?: boolean;
  requestId?: string;
  componentStatus?: RpaComponentStatus;
};

type VerifyHistoryItem = {
  uid: string;
  fphm: string;
  fpdm?: string;
  kprq: string;
  checkCode?: string;
  amount?: string;
  result: VerifyResult;
  timestamp: number;
  invoiceUid?: string;
  screenshotPath?: string;
};

type VerifyPageProps = {
  archiveInvoices: ArchivedInvoice[];
  allFolders: InvoiceFolder[];
  folders: InvoiceFolder[];
  onUpdateInvoice?: (id: string, data: Partial<ArchivedInvoice>) => void;
  showToast: (message: string, type: "info" | "success" | "error" | "warning") => void;
};

const DEL_STATUS_MAP: Record<string, { label: string; color: string }> = {
  "0": { label: "正常", color: "#22c55e" },
  "2": { label: "已作废", color: "#ef4444" },
  "3": { label: "红冲发票", color: "#f59e0b" },
  "7": { label: "部分冲红", color: "#f59e0b" },
  "8": { label: "全额冲红", color: "#ef4444" },
};

type HistoryFolderType = "all" | "success" | "fail" | "today" | "linked";
const HISTORY_FOLDERS: { id: HistoryFolderType; name: string; icon: JSX.Element; color?: string }[] = [
  { id: "all", name: "全部记录", icon: VerifyIcons.List },
  { id: "success", name: "验真成功", icon: VerifyIcons.Check, color: "#22c55e" },
  { id: "fail", name: "验真失败", icon: VerifyIcons.X, color: "#ef4444" },
  { id: "today", name: "今日查验", icon: VerifyIcons.Clock },
  { id: "linked", name: "关联归档", icon: VerifyIcons.Link },
];

function formatAmount(v?: number): string {
  if (v === undefined || v === null) return "-";
  return `¥${v.toFixed(2)}`;
}

function getRpaScreenshotMode(): "dialog" | "with_url" {
  try {
    const raw = localStorage.getItem("app_settings_v1");
    if (!raw) return "dialog";
    const parsed = JSON.parse(raw);
    return parsed?.rpaScreenshotMode === "with_url" ? "with_url" : "dialog";
  } catch {
    return "dialog";
  }
}

export function VerifyPage({ archiveInvoices, allFolders, folders, onUpdateInvoice, showToast }: VerifyPageProps) {

  const [verifyMode, setVerifyModeRaw] = useState<VerifyMode>(() => getVerifyModePreference());
  const setVerifyMode = useCallback((mode: VerifyMode) => {
    setVerifyModeRaw(mode);
    setVerifyModePreference(mode);
  }, []);

  const [configStatus, setConfigStatus] = useState<{
    configured: boolean; authType: "direct" | "aliyun";
    appKey: string; appSecret: string; appCode: string;
  } | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [configAuthType, setConfigAuthType] = useState<"direct" | "aliyun">("direct");
  const [configAppKey, setConfigAppKey] = useState("");
  const [configAppSecret, setConfigAppSecret] = useState("");
  const [configAppCode, setConfigAppCode] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);
  const [apiExternalConsent, setApiExternalConsentState] = useState(() => getApiExternalServiceConsent());

  const [rpaConfigStatus, setRpaConfigStatus] = useState<{
    configured: boolean; captchaAppKey: string; componentStatus?: RpaComponentStatus;
  } | null>(null);
  const [showRpaConfig, setShowRpaConfig] = useState(false);
  const [rpaCaptchaAppKey, setRpaCaptchaAppKey] = useState("");
  const [savingRpaConfig, setSavingRpaConfig] = useState(false);
  const [installingRpaEngine, setInstallingRpaEngine] = useState(false);
  const [rpaExternalConsent, setRpaExternalConsentState] = useState(() => getRpaExternalServiceConsent());

  const [fpdm, setFpdm] = useState("");
  const [fphm, setFphm] = useState("");
  const [kprq, setKprq] = useState("");
  const [checkCode, setCheckCode] = useState("");
  const [amount, setAmount] = useState("");
  const [verifying, setVerifying] = useState(false);

  const [rpaProgress, setRpaProgress] = useState<{
    stage: string;
    message: string;
    attempt?: number;
    pollAttempt?: number;
    pollTotal?: number;
  } | null>(null);

  const [currentResult, setCurrentResult] = useState<VerifyResult | null>(null);

  const [history, setHistory] = useState<VerifyHistoryItem[]>([]);

  const [activeTab, setActiveTab] = useState<"manual" | "archive" | "history">("manual");

  const [isManualVerifying, setIsManualVerifying] = useState(false);

  const [isBatchVerifying, setIsBatchVerifying] = useState(false);
  const [isBatchVerifyStopping, setIsBatchVerifyStopping] = useState(false);
  const [batchVerifyProgress, setBatchVerifyProgress] = useState({ current: 0, total: 0 });
  const batchVerifyAbortedRef = useRef(false);

  const [verifyingIds, setVerifyingIds] = useState<Set<string>>(new Set());
  const [archiveResults, setArchiveResults] = useState<Map<string, VerifyResult>>(new Map());

  const [verifyLimitedIds, setVerifyLimitedIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem("verifyLimitedIds");
      if (!stored) return new Set();
      const data = JSON.parse(stored);

      if (data.expireTime && Date.now() < data.expireTime) {
        return new Set(data.ids);
      }

      localStorage.removeItem("verifyLimitedIds");
    } catch {

      try {
        localStorage.removeItem("verifyLimitedIds");
      } catch (error) {
        console.warn("verify limited ids cleanup failed", error);
      }
    }
    return new Set();
  });

  const addVerifyLimitedId = useCallback((id: string) => {
    const today = new Date();
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const expireTime = tomorrow.getTime();

    setVerifyLimitedIds((prev) => {
      const newSet = new Set(prev);
      newSet.add(id);
      try {
        localStorage.setItem("verifyLimitedIds", JSON.stringify({
          ids: Array.from(newSet),
          expireTime,
        }));
      } catch (e) {
        console.warn("无法保存查验限制记录到 localStorage:", e);
      }
      return newSet;
    });
  }, []);

  const [archiveFilter, setArchiveFilter] = useState<"all" | "unverified" | "verified">("unverified");
  const [archiveSelectedIds, setArchiveSelectedIds] = useState<string[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>("__all__");

  const [historyFolder, setHistoryFolder] = useState<HistoryFolderType>("all");
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; message: string; confirmText?: string; danger?: boolean; onConfirm: () => void } | null>(null);

  const [screenshotCache, setScreenshotCache] = useState<Record<string, string>>({});

  const [screenshotModal, setScreenshotModal] = useState<{ uid: string; path: string } | null>(null);

  const [showUsageTip, setShowUsageTip] = useState<{ mode: VerifyMode; action: "switch" } | null>(null);
  const [legalDocumentId, setLegalDocumentId] = useState<LegalDocumentId | null>(null);

  const refreshVerifyConfigStatus = useCallback(async () => {
    const [apiResult, rpaResult] = await Promise.allSettled([
      window.invoiceApi.getVerifyConfig(),
      window.invoiceApi.getRpaConfig(),
    ]);

    if (apiResult.status === "fulfilled") {
      setConfigStatus(apiResult.value);
    }

    if (rpaResult.status === "fulfilled") {
      setRpaConfigStatus(rpaResult.value);
    }
  }, []);

  const loadHistory = useCallback(async (mode?: VerifyMode) => {
    try {
      const res = await window.invoiceApi.getVerifyHistory(500, 0, mode);
      const records = res.records || [];
      setHistory(records.map((r) => ({
        uid: r.uid,
        fphm: r.fphm,
        fpdm: r.fpdm,
        kprq: r.kprq,
        checkCode: r.checkCode,
        amount: r.amount,
        result: {
          success: r.success,
          data: r.resultData as VerifyResultData | undefined,
          error: r.errorMessage,
        },
        timestamp: r.createdAt,
        invoiceUid: r.invoiceUid,
        screenshotPath: r.screenshotPath,
      })));
    } catch (e) {
      console.warn("loadHistory failed:", e);
    }
  }, []);

  const persistVerifyHistory = useCallback(async (data: {
    fpdm?: string;
    fphm: string;
    kprq: string;
    checkCode?: string;
    amount?: string;
    success: boolean;
    errorMessage?: string;
    resultData?: Record<string, unknown>;
    invoiceUid?: string;
    verifyMode?: "api" | "rpa";
    screenshotPath?: string;
    createdAt: number;
  }) => {
    try {
      await window.invoiceApi.addVerifyHistory(data);
      await loadHistory(data.verifyMode);
    } catch (e) {
      console.warn("persistVerifyHistory failed:", e);
    }
  }, [loadHistory]);

  useEffect(() => {
    if (!screenshotModal) return;
    const { uid, path } = screenshotModal;
    if (screenshotCache[uid]) return;
    let cancelled = false;
    (async () => {
      try {
        const bytes = await window.invoiceApi.readFile(path);
        if (cancelled) return;
        const ext = (path.split(".").pop() || "png").toLowerCase();
        const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";
        const blob = new Blob([bytes as BlobPart], { type: mime });
        const url = URL.createObjectURL(blob);
        setScreenshotCache((prev) => (prev[uid] ? prev : { ...prev, [uid]: url }));
      } catch (e) {
        console.warn("加载查验截图失败:", e);
      }
    })();
    return () => { cancelled = true; };
  }, [screenshotModal, screenshotCache]);

  useEffect(() => {
    return () => {
      Object.values(screenshotCache).forEach((url) => {
        if (url.startsWith("blob:")) URL.revokeObjectURL(url);
      });
    };
  }, [screenshotCache]);

  useEffect(() => {
    const syncVerifyConfig = () => {
      const nextMode = getVerifyModePreference();
      setVerifyModeRaw((currentMode) => {
        if (currentMode !== nextMode) {
          setCurrentResult(null);
          setArchiveResults(new Map());
          setExpandedHistoryId(null);
        }
        return nextMode;
      });
      void refreshVerifyConfigStatus();
    };

    syncVerifyConfig();
    return subscribeVerifyConfigSync(syncVerifyConfig);
  }, [refreshVerifyConfigStatus]);

  useEffect(() => {
    const off = window.invoiceApi.onRpaVerifyProgress((payload) => {
      setRpaProgress(payload);
    });
    return () => {
      try {
        off();
      } catch {
        // ignore
      }
    };
  }, []);

  const updateApiExternalConsent = useCallback((next: boolean) => {
    setApiExternalConsentState(next);
    setApiExternalServiceConsent(next);
  }, []);

  const updateRpaExternalConsent = useCallback((next: boolean) => {
    setRpaExternalConsentState(next);
    setRpaExternalServiceConsent(next);
  }, []);

  const resetVerifyModeView = useCallback(() => {
    setCurrentResult(null);
    setArchiveResults(new Map());
    setExpandedHistoryId(null);
  }, []);

  const switchVerifyMode = useCallback((mode: VerifyMode) => {
    setShowConfig(false);
    setShowRpaConfig(false);
    setVerifyMode(mode);
    resetVerifyModeView();
  }, [resetVerifyModeView, setVerifyMode]);

  const requestVerifyModeSwitch = useCallback((mode: VerifyMode) => {
    if (mode === verifyMode) {
      return;
    }
    const targetConfigured = mode === "api"
      ? Boolean(configStatus?.configured)
      : Boolean(rpaConfigStatus?.configured);
    if (!targetConfigured) {
      switchVerifyMode(mode);
      return;
    }
    setShowUsageTip({ mode, action: "switch" });
  }, [configStatus?.configured, rpaConfigStatus?.configured, switchVerifyMode, verifyMode]);

  const ensureApiExternalConsent = useCallback(() => {
    if (apiExternalConsent) return true;
    showToast("请先确认 API 外部服务告知", "warning");
    setShowConfig(true);
    return false;
  }, [apiExternalConsent, showToast]);

  const ensureRpaExternalConsent = useCallback(() => {
    if (rpaExternalConsent) return true;
    showToast("请先确认 RPA 第三方识别告知", "warning");
    setShowRpaConfig(true);
    return false;
  }, [rpaExternalConsent, showToast]);

  const handleSaveConfig = useCallback(async () => {
    if (configAuthType === "aliyun") {
      if (!configAppCode.trim()) {
        showToast("请填写 AppCode", "error");
        return;
      }
      if (!/^[a-zA-Z0-9]+$/.test(configAppCode.trim())) {
        showToast("AppCode 格式错误：只能包含字母和数字", "error");
        return;
      }
    } else {
      if (!configAppKey.trim() || !configAppSecret.trim()) {
        showToast("请填写完整的 AppKey 和 AppSecret", "error");
        return;
      }
    }
    if (!apiExternalConsent) {
      showToast("请先确认 API 外部服务告知", "warning");
      return;
    }
    setSavingConfig(true);
    try {
      const res = await window.invoiceApi.setVerifyConfig({
        authType: configAuthType,
        appKey: configAppKey.trim(),
        appSecret: configAppSecret.trim(),
        appCode: configAppCode.trim(),
      });
      if (res.success) {
        showToast("API 配置保存成功", "success");
        setShowConfig(false);
        setConfigAppKey("");
        setConfigAppSecret("");
        setConfigAppCode("");
        const status = await window.invoiceApi.getVerifyConfig();
        setConfigStatus(status);
        notifyVerifyConfigSync();
      } else {
        showToast("保存失败，请重试", "error");
      }
    } catch (e) {
      showToast("保存失败: " + (e instanceof Error ? e.message : String(e)), "error");
    } finally {
      setSavingConfig(false);
    }
  }, [apiExternalConsent, configAuthType, configAppKey, configAppSecret, configAppCode, showToast]);

  const handleSaveRpaConfig = useCallback(async () => {
    if (!rpaCaptchaAppKey.trim()) {
      showToast("请填写验证码识别 AppKey", "error");
      return;
    }
    if (!rpaExternalConsent) {
      showToast("请先确认 RPA 第三方识别告知", "warning");
      return;
    }
    setSavingRpaConfig(true);
    try {
      const res = await window.invoiceApi.setRpaConfig({ captchaAppKey: rpaCaptchaAppKey.trim() });
      if (res.success) {
        showToast("RPA 配置保存成功", "success");
        setShowRpaConfig(false);
        setRpaCaptchaAppKey("");
        const status = await window.invoiceApi.getRpaConfig();
        setRpaConfigStatus(status);
        notifyVerifyConfigSync();
      } else {
        showToast(res.error || "保存失败，请重试", "error");
      }
    } catch (e) {
      showToast("保存失败: " + (e instanceof Error ? e.message : String(e)), "error");
    } finally {
      setSavingRpaConfig(false);
    }
  }, [rpaCaptchaAppKey, rpaExternalConsent, showToast]);

  const handleInstallRpaEngine = useCallback(async () => {
    let zipPath: string | null = null;
    try {
      zipPath = await window.invoiceApi.pickRpaComponentZip();
    } catch (e) {
      showToast("选择插件失败: " + (e instanceof Error ? e.message : String(e)), "error");
      return;
    }
    if (!zipPath) {
      return;
    }
    setInstallingRpaEngine(true);
    try {
      const result = await window.invoiceApi.installRpaComponent({ zipPath });
      if (result.success) {
        const status = await window.invoiceApi.getRpaConfig();
        setRpaConfigStatus(status);
        setConfirmDialog({
          title: "RPA 引擎已导入",
          message: "插件导入成功，需要重启应用后才能加载 RPA 引擎。是否立即重启？",
          confirmText: "立即重启",
          danger: false,
          onConfirm: async () => {
            setConfirmDialog(null);
            try {
              await window.invoiceApi.relaunchApp();
            } catch (err) {
              showToast("重启失败: " + (err instanceof Error ? err.message : String(err)), "error");
            }
          },
        });
      } else {
        showToast(result.error || "RPA 引擎安装失败", "error");
      }
    } catch (e) {
      showToast("安装失败: " + (e instanceof Error ? e.message : String(e)), "error");
    } finally {
      setInstallingRpaEngine(false);
    }
  }, [showToast]);

  const handleClearRpaConfig = useCallback(() => {
    setConfirmDialog({
      title: "退出 RPA 配置",
      message: "退出后将清除验证码识别 AppKey，RPA 验真功能将不可用。确定退出吗？",
      onConfirm: async () => {
        try {
          await window.invoiceApi.clearRpaConfig();
          setRpaConfigStatus({ configured: false, captchaAppKey: "" });
          notifyVerifyConfigSync();
          showToast("已退出 RPA 配置", "success");
        } catch {
          showToast("退出失败", "error");
        }
        setConfirmDialog(null);
      },
    });
  }, [showToast]);

  const handleClearConfig = useCallback(() => {
    setConfirmDialog({
      title: "退出 API 配置",
      message: "退出后将清除已保存的认证信息，发票验真功能将不可用。确定退出吗？",
      onConfirm: async () => {
        try {
          await window.invoiceApi.clearVerifyConfig();
          setConfigStatus({ configured: false, authType: "direct", appKey: "", appSecret: "", appCode: "" });
          setConfigAppKey("");
          setConfigAppSecret("");
          setConfigAppCode("");
          notifyVerifyConfigSync();
          showToast("已退出 API 配置", "success");
        } catch {
          showToast("退出失败", "error");
        }
        setConfirmDialog(null);
      },
    });
  }, [showToast]);

  const handleChangeConfig = useCallback(() => {
    setConfigAuthType(configStatus?.authType || "direct");
    setConfigAppKey("");
    setConfigAppSecret("");
    setConfigAppCode("");
    setShowConfig(true);
  }, [configStatus?.authType]);

  const handleVerify = useCallback(async () => {
    if (isBatchVerifying || verifyingIds.size > 0) {
      showToast("正在进行归档查验，请结束后再进行手动查验", "warning");
      return;
    }

    if (!fphm.trim()) {
      showToast("请输入发票号码", "error");
      return;
    }
    if (!kprq.trim()) {
      showToast("请输入开票日期", "error");
      return;
    }
    if (verifyMode === "api" && !ensureApiExternalConsent()) {
      return;
    }
    if (verifyMode === "rpa" && !ensureRpaExternalConsent()) {
      return;
    }

    setVerifying(true);
    setIsManualVerifying(true);
    setCurrentResult(null);
    setRpaProgress(null);
    try {
      const dateStr = kprq.replace(/-/g, "");
      let res: VerifyResult;
      if (verifyMode === "rpa") {
        res = toVerifyResult(await window.invoiceApi.rpaVerifyInvoice({
          fpdm: fpdm.trim(),
          fphm: fphm.trim(),
          kprq: dateStr,
          checkCode: checkCode.trim() || undefined,
          amount: amount.trim() || undefined,
          screenshotMode: getRpaScreenshotMode(),
        }));
      } else {
        res = toVerifyResult(await window.invoiceApi.verifyInvoice({
          fpdm: fpdm.trim(),
          fphm: fphm.trim(),
          kprq: dateStr,
          checkCode: checkCode.trim() || undefined,
          amount: amount.trim() || undefined,
        }));
      }
      setCurrentResult(res);

      if (res.needConfig) {
        if (verifyMode === "rpa") {
          setShowRpaConfig(true);
        } else {
          setShowConfig(true);
        }
        return;
      }

      persistVerifyHistory({
        fpdm: fpdm.trim(),
        fphm: fphm.trim(),
        kprq: dateStr,
        checkCode: checkCode.trim() || undefined,
        amount: amount || undefined,
        success: res.success,
        errorMessage: res.success ? undefined : (res.error || "查验失败"),
        resultData: res.success ? res.data : undefined,
        verifyMode,

        screenshotPath: (res as { screenshotPath?: string }).screenshotPath,
        createdAt: Date.now(),
      });

      if (res.success) {
        showToast("查验成功", "success");
      } else {
        showToast(res.error || "查验失败", "error");
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      setCurrentResult({ success: false, error: errMsg });
      showToast("查验请求失败: " + errMsg, "error");
    } finally {
      setVerifying(false);
      setIsManualVerifying(false);
      setRpaProgress(null);
    }
  }, [fpdm, fphm, kprq, checkCode, amount, showToast, verifyMode, isBatchVerifying, verifyingIds, persistVerifyHistory, ensureApiExternalConsent, ensureRpaExternalConsent]);

  const handleVerifyArchiveInvoice = useCallback(
    async (invoice: ArchivedInvoice) => {
      if (isManualVerifying) {
        showToast("正在进行手动查验，请结束后再进行归档查验", "warning");
        return;
      }
      if (verifyMode === "api" && !ensureApiExternalConsent()) {
        return;
      }
      if (verifyMode === "rpa" && !ensureRpaExternalConsent()) {
        return;
      }

      setVerifyingIds((prev) => new Set(prev).add(invoice.id));
      setArchiveResults((prev) => {
        if (!prev.has(invoice.id)) return prev;
        const next = new Map(prev);
        next.delete(invoice.id);
        return next;
      });
      setRpaProgress(null);
      try {

        const fields = invoice.ocrResult?.fields || {};
        const invFpdm = invoice.invoiceCode || fields["发票代码"] || "";
        const invFphm = invoice.invoiceNumber || fields["发票号码"] || "";
        const invKprq = (invoice.invoiceDate || fields["开票日期"] || "").replace(/-/g, "").replace(/年|月/g, "").replace(/日/, "");
        const invCheckCode = fields["校验码"] || "";

        const isFullElectronic = invFphm.length === 20 && /^\d{20}$/.test(invFphm);
        const canUseElectronicFileVerify = Boolean(invoice.filePath)
          && (invoice.fileExt === "pdf" || invoice.fileExt === "ofd")
          && isFullElectronic;
        const invAmount = isFullElectronic
          ? (invoice.totalAmount?.toString() || fields["价税合计"] || fields["金额"] || "")
          : (invoice.amount?.toString() || fields["金额"] || "");

        let res: VerifyResult;

        const runBasicApiVerify = async () => {
          if (!invFphm || !invKprq) {
            return null;
          }
          return toVerifyResult(await window.invoiceApi.verifyInvoice({
            fpdm: isFullElectronic ? undefined : invFpdm,
            fphm: invFphm,
            kprq: invKprq,
            checkCode: isFullElectronic ? undefined : (invCheckCode || undefined),
            amount: invAmount || undefined,
          }));
        };

        if (verifyMode === "rpa") {

          if (invFphm && invKprq) {
            res = toVerifyResult(await window.invoiceApi.rpaVerifyInvoice({
              fpdm: isFullElectronic ? undefined : invFpdm,
              fphm: invFphm,
              kprq: invKprq,
              checkCode: isFullElectronic ? undefined : (invCheckCode || undefined),
              amount: invAmount || undefined,
              screenshotMode: getRpaScreenshotMode(),
            }));
          } else {
            const missing: string[] = [];
            if (!invFphm) missing.push("发票号码");
            if (!invKprq) missing.push("开票日期");
            res = { success: false, error: `缺少关键字段：${missing.join("、")}\nRPA 验真需要发票号码和开票日期` };
          }
        } else {
          if (canUseElectronicFileVerify) {
            res = toVerifyResult(await window.invoiceApi.verifyInvoiceByFile(invoice.filePath));
            if (!res.success && !res.needConfig) {
              const basicVerifyResult = await runBasicApiVerify();
              if (basicVerifyResult) {
                res = basicVerifyResult;
              }
            }
          } else if (invFphm && invKprq) {
            res = (await runBasicApiVerify())!;
          } else if (invoice.filePath && (invoice.fileExt === "pdf" || invoice.fileExt === "ofd")) {
            res = toVerifyResult(await window.invoiceApi.verifyInvoiceByFile(invoice.filePath));
          } else {
            const missing: string[] = [];
            if (!invFphm) missing.push("发票号码");
            if (!invKprq) missing.push("开票日期");
            const isImageOnly = invoice.fileExt && !["pdf", "ofd"].includes(invoice.fileExt);
            const hint = isImageOnly
              ? "图片格式不支持文件查验，请确保 OCR 已识别发票信息"
              : "请在发票管理中补充完整信息后重试";
            res = { success: false, error: `缺少关键字段：${missing.join("、")}\n${hint}` };
          }
        }

        setArchiveResults((prev) => new Map(prev).set(invoice.id, res));

        if (verifyMode === "rpa" && !res.success && res.error && (
          res.error.includes("超过该张发票当日查验次数") ||
          res.error.includes("请于次日再次查验")
        )) {
          addVerifyLimitedId(invoice.id);
        }

        if (res.needConfig) {
          if (verifyMode === "rpa") {
            setShowRpaConfig(true);
          } else {
            setShowConfig(true);
          }
          return;
        }

        if (res.success && onUpdateInvoice) {
          onUpdateInvoice(invoice.id, { isVerified: true });
        }

        persistVerifyHistory({
          fpdm: invFpdm || undefined,
          fphm: invFphm || invoice.fileName,
          kprq: invKprq,
          checkCode: invCheckCode || undefined,
          amount: invAmount || undefined,
          success: res.success,
          errorMessage: res.success ? undefined : (res.error || "查验失败"),
          resultData: res.success ? res.data : undefined,
          invoiceUid: invoice.id,
          verifyMode,

          screenshotPath: (res as { screenshotPath?: string }).screenshotPath,
          createdAt: Date.now(),
        });

        if (res.success) {
          showToast(`${invoice.fileName} 查验成功`, "success");
        } else {
          showToast(`${invoice.fileName}: ${res.error || "查验失败"}`, "error");
        }
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        setArchiveResults((prev) =>
          new Map(prev).set(invoice.id, { success: false, error: errMsg })
        );
        showToast("查验请求失败: " + errMsg, "error");
      } finally {
        setVerifyingIds((prev) => {
          const next = new Set(prev);
          next.delete(invoice.id);
          return next;
        });
        setRpaProgress(null);
      }
    },
    [onUpdateInvoice, showToast, verifyMode, addVerifyLimitedId, isManualVerifying, persistVerifyHistory, ensureApiExternalConsent, ensureRpaExternalConsent]
  );

  const configLoading = verifyMode === "rpa" ? rpaConfigStatus === null : configStatus === null;
  const isApiConfigured = configStatus?.configured ?? false;
  const isRpaConfigured = rpaConfigStatus?.configured ?? false;
  const isConfigured = verifyMode === "rpa" ? isRpaConfigured : isApiConfigured;

  const showSetup = !configLoading && !isConfigured && !showConfig && !showRpaConfig;

  const isAnyVerifying = verifying || isBatchVerifying || verifyingIds.size > 0;

  const renderVerifyResult = (result: VerifyResult) => {
    if (!result) return null;

    if (!result.success) {
      return (
        <div className="verify-result verify-result-error">
          <div className="verify-result-header">
            <span className="verify-result-icon fail">{VerifyIcons.X}</span>
            <span className="verify-result-title">查验失败</span>
            {result.code && (
              <span className="verify-result-code">错误码: {result.code}</span>
            )}
          </div>
          <div className="verify-result-msg">{result.error || "未知错误"}</div>
          {result.description && (
            <div className="verify-result-desc">{result.description}</div>
          )}
          {result.componentStatus?.installed === false && (
            <div style={{ display: "flex", justifyContent: "flex-start", marginTop: "12px" }}>
              <button
                className="verify-btn-primary"
                onClick={handleInstallRpaEngine}
                disabled={installingRpaEngine}
              >
                {installingRpaEngine ? "安装中..." : "前往导入插件"}
              </button>
            </div>
          )}
        </div>
      );
    }

    const d = result.data || {};

    const fpztMap: Record<string, { label: string; color: string }> = {
      "正常": { label: "正常", color: "#22c55e" },
      "已作废": { label: "已作废", color: "#ef4444" },
      "红冲": { label: "红冲发票", color: "#f59e0b" },
    };
    const delStatus = d.del
      ? (DEL_STATUS_MAP[d.del] || { label: `未知(${d.del})`, color: "#6b7280" })
      : d.fpzt
        ? (fpztMap[d.fpzt] || { label: d.fpzt, color: "#6b7280" })
        : { label: "正常", color: "#22c55e" };

    const isTransport = !!(d.departure || d.arrival || d.trainNo || d.passenger || d.eTicketNo);

    return (
      <div className="verify-result verify-result-ok">
        <div className="verify-result-header">
          <span className="verify-result-icon ok">{VerifyIcons.Check}</span>
          <span className="verify-result-title">查验通过</span>
          <span
            className="verify-result-status"
            style={{ backgroundColor: delStatus.color + "22", color: delStatus.color }}
          >
            {delStatus.label}
          </span>
          {(d.fplx || d.fplxName) && <span className="verify-result-type">{d.fplxName || `类型 ${d.fplx}`}</span>}
        </div>

        <div className="verify-result-grid">
          <div className="verify-result-section">
            <h4>基本信息</h4>
            <div className="verify-result-fields">
              {d.fpdm && <div className="verify-field"><label>发票代码</label><span>{d.fpdm}</span></div>}
              {d.fphm && <div className="verify-field"><label>发票号码</label><span>{d.fphm}</span></div>}
              {d.kprq && <div className="verify-field"><label>开票日期</label><span>{d.kprq}</span></div>}
              {d.code && <div className="verify-field"><label>校验码</label><span>{d.code}</span></div>}
              {d.eTicketNo && <div className="verify-field"><label>电子客票号</label><span>{d.eTicketNo}</span></div>}
              {d.businessType && <div className="verify-field"><label>业务类型</label><span>{d.businessType}</span></div>}
            </div>
          </div>

          <div className="verify-result-section">
            <h4>金额信息</h4>
            <div className="verify-result-fields">
              {d.goodsamount && <div className="verify-field"><label>不含税金额</label><span className="verify-field-amount">¥{d.goodsamount}</span></div>}
              {d.taxamount && <div className="verify-field"><label>税额</label><span className="verify-field-amount">¥{d.taxamount}</span></div>}
              {d.sumamount && <div className="verify-field"><label>{isTransport ? "票价" : "价税合计"}</label><span className="verify-field-amount verify-field-total">¥{d.sumamount}</span></div>}
            </div>
          </div>

          {isTransport && (
            <div className="verify-result-section">
              <h4>出行信息</h4>
              <div className="verify-result-fields">
                {d.passenger && <div className="verify-field"><label>姓名</label><span>{d.passenger}</span></div>}
                {d.idNumber && <div className="verify-field"><label>证件号</label><span>{d.idNumber}</span></div>}
                {d.departure && <div className="verify-field"><label>出发站</label><span>{d.departure}</span></div>}
                {d.arrival && <div className="verify-field"><label>到达站</label><span>{d.arrival}</span></div>}
                {d.trainNo && <div className="verify-field"><label>车次</label><span>{d.trainNo}</span></div>}
                {d.travelDate && <div className="verify-field"><label>乘车日期</label><span>{d.travelDate}</span></div>}
                {d.departureTime && <div className="verify-field"><label>出发时间</label><span>{d.departureTime}</span></div>}
                {d.seatType && <div className="verify-field"><label>席别</label><span>{d.seatType}</span></div>}
                {d.seatNo && <div className="verify-field"><label>席位</label><span>{d.seatNo}</span></div>}
                {d.carriage && <div className="verify-field"><label>车厢</label><span>{d.carriage}</span></div>}
                {d.acFeature && <div className="verify-field"><label>空调特征</label><span>{d.acFeature}</span></div>}
                {d.ticketType && <div className="verify-field"><label>票种</label><span>{d.ticketType}</span></div>}
              </div>
            </div>
          )}

          {(d.xfMc || d.xfNsrsbh) && (
            <div className="verify-result-section">
              <h4>销售方</h4>
              <div className="verify-result-fields">
                {d.xfMc && <div className="verify-field"><label>名称</label><span>{d.xfMc}</span></div>}
                {d.xfNsrsbh && <div className="verify-field"><label>纳税人识别号</label><span>{d.xfNsrsbh}</span></div>}
                {d.xfContact && <div className="verify-field"><label>联系方式</label><span>{d.xfContact}</span></div>}
                {d.xfBank && <div className="verify-field"><label>开户行</label><span>{d.xfBank}</span></div>}
              </div>
            </div>
          )}

          {(d.gfMc || d.gfNsrsbh) && (
            <div className="verify-result-section">
              <h4>购买方</h4>
              <div className="verify-result-fields">
                {d.gfMc && <div className="verify-field"><label>名称</label><span>{d.gfMc}</span></div>}
                {d.gfNsrsbh && <div className="verify-field"><label>纳税人识别号</label><span>{d.gfNsrsbh}</span></div>}
                {d.gfContact && <div className="verify-field"><label>联系方式</label><span>{d.gfContact}</span></div>}
                {d.gfBank && <div className="verify-field"><label>开户行</label><span>{d.gfBank}</span></div>}
              </div>
            </div>
          )}
        </div>

        {Array.isArray(d.goodsData) && d.goodsData.length > 0 && (
          <div className="verify-result-section" style={{ marginTop: 16 }}>
            <h4>商品明细</h4>
            <div className="verify-goods-table-wrap">
              <table className="verify-goods-table">
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>规格</th>
                    <th>单位</th>
                    <th>数量</th>
                    <th>单价</th>
                    <th>金额</th>
                    <th>税率</th>
                    <th>税额</th>
                  </tr>
                </thead>
                <tbody>
                  {d.goodsData.map((item: Record<string, string>, idx: number) => (
                    <tr key={idx}>
                      <td>{item.name || "-"}</td>
                      <td>{item.spec || "-"}</td>
                      <td>{item.unit || "-"}</td>
                      <td>{item.amount || "-"}</td>
                      <td>{item.priceUnit || "-"}</td>
                      <td>{item.priceSum || "-"}</td>
                      <td>{item.taxRate || "-"}</td>
                      <td>{item.taxSum || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="verify-result-meta">
          {d.queryCount && <span>税局查验次数: {d.queryCount}</span>}
          {d.updateTime && <span>更新时间: {d.updateTime}</span>}
          {d.remark && <span>备注: {d.remark}</span>}
        </div>
      </div>
    );
  };

  const handleDeleteHistory = useCallback((uid: string, fphm: string) => {
    setConfirmDialog({
      title: "删除查验记录",
      message: `确定要删除发票「${fphm}」的查验记录吗？`,
      onConfirm: async () => {
        try {
          await window.invoiceApi.deleteVerifyHistory(uid);
          if (expandedHistoryId === uid) setExpandedHistoryId(null);
          loadHistory();
          showToast("已删除", "success");
        } catch {
          showToast("删除失败", "error");
        }
        setConfirmDialog(null);
      },
    });
  }, [loadHistory, showToast, expandedHistoryId]);

  const filteredHistory = useMemo(() => {
    switch (historyFolder) {
      case "success": return history.filter((h) => h.result.success);
      case "fail": return history.filter((h) => !h.result.success);
      case "today": {
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
        return history.filter((h) => h.timestamp >= startOfDay);
      }
      case "linked": return history.filter((h) => h.invoiceUid);
      default: return history;
    }
  }, [history, historyFolder]);

  const handleClearHistory = useCallback(() => {
    const modeLabel = verifyMode === "rpa" ? "RPA" : "API";
    const targetRecords = filteredHistory;
    const count = targetRecords.length;

    if (count === 0) {
      showToast("没有可清空的记录", "warning");
      return;
    }

    const folderLabel = historyFolder === "success" ? "成功" : historyFolder === "fail" ? "失败" : historyFolder === "today" ? "今日" : "全部";
    setConfirmDialog({
      title: `清空${modeLabel}查验记录`,
      message: `确定要清空 ${folderLabel} 分类下的 ${count} 条${modeLabel}查验记录吗？此操作不可撤销。`,
      onConfirm: async () => {
        try {
          const uids = targetRecords.map(r => r.uid);
          await window.invoiceApi.batchDeleteVerifyHistory(uids);
          setExpandedHistoryId(null);
          loadHistory();
          showToast(`已清空 ${count} 条${modeLabel}查验记录`, "success");
        } catch {
          showToast("清空失败", "error");
        }
        setConfirmDialog(null);
      },
    });
  }, [filteredHistory, historyFolder, loadHistory, showToast, verifyMode]);

  const historyFolderCounts = useMemo(() => {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    return {
      all: history.length,
      success: history.filter((h) => h.result.success).length,
      fail: history.filter((h) => !h.result.success).length,
      today: history.filter((h) => h.timestamp >= startOfDay).length,
      linked: history.filter((h) => h.invoiceUid).length,
    };
  }, [history]);

  const handleSelectFolder = useCallback((folderId: string) => {
    setSelectedFolderId(folderId);
    setArchiveSelectedIds([]);
  }, []);

  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = {
      __all__: archiveInvoices.length,
      __uncategorized__: archiveInvoices.filter((inv) => inv.folderId === null).length,
      __recent__: archiveInvoices.filter((inv) => inv.createdAt >= Date.now() - 7 * 24 * 60 * 60 * 1000).length,
    };
    folders.forEach((f) => {
      counts[f.id] = archiveInvoices.filter((inv) => inv.folderId === f.id).length;
    });
    return counts;
  }, [archiveInvoices, folders]);

  const filteredArchiveInvoices = useMemo(() => {
    let result = archiveInvoices;

    if (selectedFolderId === "__uncategorized__") {
      result = result.filter((inv) => inv.folderId === null);
    } else if (selectedFolderId === "__recent__") {
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      result = result.filter((inv) => inv.createdAt >= sevenDaysAgo);
    } else if (!selectedFolderId.startsWith("__")) {
      result = result.filter((inv) => inv.folderId === selectedFolderId);
    }

    if (archiveFilter === "unverified") return result.filter((inv) => !inv.isVerified);
    if (archiveFilter === "verified") return result.filter((inv) => inv.isVerified);
    return result;
  }, [archiveInvoices, archiveFilter, selectedFolderId]);

  const unverifiedCount = useMemo(() => archiveInvoices.filter((inv) => !inv.isVerified).length, [archiveInvoices]);

  const archiveAllSelected = filteredArchiveInvoices.length > 0 && archiveSelectedIds.length === filteredArchiveInvoices.length;
  const archiveSomeSelected = archiveSelectedIds.length > 0 && archiveSelectedIds.length < filteredArchiveInvoices.length;

  const handleArchiveToggleSelect = useCallback((id: string) => {
    setArchiveSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }, []);

  const handleArchiveSelectAll = useCallback(() => {
    if (archiveAllSelected || archiveSomeSelected) {
      setArchiveSelectedIds([]);
    } else {
      setArchiveSelectedIds(filteredArchiveInvoices.map((inv) => inv.id));
    }
  }, [archiveAllSelected, archiveSomeSelected, filteredArchiveInvoices]);

  const handleBatchVerify = useCallback(async () => {
    const toVerify = archiveInvoices.filter((inv) =>
      archiveSelectedIds.includes(inv.id) &&
      !inv.isVerified &&
      !verifyLimitedIds.has(inv.id)
    );
    if (toVerify.length === 0) {
      showToast("选中的发票均已查验或已达查验次数上限", "info");
      return;
    }
    if (verifyMode === "api" && !ensureApiExternalConsent()) {
      return;
    }
    if (verifyMode === "rpa" && !ensureRpaExternalConsent()) {
      return;
    }

    const estimatedTime = verifyMode === "api"
      ? Math.ceil(toVerify.length * 2.5)
      : (toVerify.length === 1 ? 12 : 12 + (toVerify.length - 1) * 7);
    const minutes = Math.floor(estimatedTime / 60);
    const seconds = estimatedTime % 60;
    const timeStr = minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`;

    setConfirmDialog({
      title: "批量查验确认",
      message: `即将查验 ${toVerify.length} 张发票，预计需要 ${timeStr}。查验过程中可点击"停止查验"按钮中止。`,
      confirmText: "确认",
      danger: false,
      onConfirm: async () => {
        setConfirmDialog(null);
        setIsBatchVerifying(true);
        setBatchVerifyProgress({ current: 0, total: toVerify.length });
        batchVerifyAbortedRef.current = false;

        for (let i = 0; i < toVerify.length; i++) {
          if (batchVerifyAbortedRef.current) {
            showToast(`已停止查验，完成 ${i}/${toVerify.length}`, "warning");
            break;
          }
          setBatchVerifyProgress({ current: i + 1, total: toVerify.length });
          await handleVerifyArchiveInvoice(toVerify[i]);
        }

        setIsBatchVerifying(false);
        setIsBatchVerifyStopping(false);
        setBatchVerifyProgress({ current: 0, total: 0 });
        setArchiveSelectedIds([]);
      },
    });
  }, [archiveInvoices, archiveSelectedIds, handleVerifyArchiveInvoice, showToast, verifyLimitedIds, verifyMode, ensureApiExternalConsent, ensureRpaExternalConsent]);

  return (
    <div className="panel verify-page">

      {showRpaConfig && (
        <div className="verify-config-overlay" onClick={() => setShowRpaConfig(false)}>
          <div className="verify-config-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>{rpaConfigStatus?.configured ? "更换 RPA 配置" : "RPA 验证码配置"}</h3>
            <p className="verify-config-tip">
              RPA 验真通过自动化浏览器访问国税查验平台完成查验，需配置验证码识别服务。
              <br />
              <a href="https://amam.easysu.cn/#/register?inviteCode=XIfmi9M3" target="_blank" rel="noopener noreferrer">
                前往 amam 平台获取 AppKey
              </a>
            </p>
            <div className="verify-config-current" style={{ display: "block", fontFamily: "inherit", marginBottom: "14px" }}>
              <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: "6px" }}>第三方服务说明</div>
              <div style={{ lineHeight: 1.7 }}>{RPA_EXTERNAL_SERVICE_NOTICE}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "10px" }}>
                <button style={{ fontSize: "12px", padding: "6px 12px" }} onClick={() => setLegalDocumentId("privacy")}>查看隐私说明</button>
                <button style={{ fontSize: "12px", padding: "6px 12px" }} onClick={() => setLegalDocumentId("third-party")}>查看第三方说明</button>
              </div>
            </div>
            {rpaConfigStatus?.componentStatus?.installed === false && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                  flexWrap: "wrap",
                  padding: "12px 14px",
                  border: "1px solid rgba(245, 158, 11, 0.35)",
                  background: "rgba(245, 158, 11, 0.08)",
                  borderRadius: "8px",
                  marginBottom: "14px",
                }}
              >
                <div style={{ flex: 1, minWidth: "180px" }}>
                  <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: "4px" }}>RPA 引擎未安装</div>
                  <div style={{ fontSize: "12px", color: "var(--muted)", lineHeight: 1.6 }}>
                    {rpaConfigStatus.componentStatus.message === "RPA 引擎未安装"
                      ? "请导入 RPA 插件包后启用浏览器查验。"
                      : rpaConfigStatus.componentStatus.message}
                  </div>
                </div>
                <button
                  className="verify-btn-primary"
                  style={{ flexShrink: 0, alignSelf: "center" }}
                  onClick={handleInstallRpaEngine}
                  disabled={installingRpaEngine}
                >
                  {installingRpaEngine ? "安装中..." : "前往导入插件"}
                </button>
              </div>
            )}
            {rpaConfigStatus?.configured && (
              <div className="verify-config-current">
                <span className="verify-config-current-label">当前</span>
                <span>AppKey: {rpaConfigStatus.captchaAppKey}</span>
              </div>
            )}
            <div className="verify-config-field">
              <label>验证码 AppKey</label>
              <input
                type="text"
                value={rpaCaptchaAppKey}
                onChange={(e) => setRpaCaptchaAppKey(e.target.value)}
                placeholder="请输入 amam 平台 AppKey"
              />
            </div>
            <label className="verify-config-current" style={{ alignItems: "flex-start", fontFamily: "inherit", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={rpaExternalConsent}
                onChange={(e) => updateRpaExternalConsent(e.target.checked)}
                style={{ marginTop: "2px" }}
              />
              <span style={{ lineHeight: 1.7 }}>{RPA_EXTERNAL_SERVICE_CONSENT_LABEL}</span>
            </label>
            <div className="verify-config-actions">
              <button onClick={() => setShowRpaConfig(false)}>取消</button>
              <button
                className="verify-btn-primary"
                onClick={handleSaveRpaConfig}
                disabled={savingRpaConfig}
              >
                {savingRpaConfig ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showConfig && (
        <div className="verify-config-overlay" onClick={() => setShowConfig(false)}>
          <div className="verify-config-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>{configStatus?.configured ? "更换 API 配置" : "API 配置"}</h3>
            <div className="verify-config-current" style={{ display: "block", fontFamily: "inherit", marginBottom: "14px" }}>
              <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: "6px" }}>外部服务说明</div>
              <div style={{ lineHeight: 1.7 }}>{API_EXTERNAL_SERVICE_NOTICE}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "10px" }}>
                <button style={{ fontSize: "12px", padding: "6px 12px" }} onClick={() => setLegalDocumentId("privacy")}>查看隐私说明</button>
                <button style={{ fontSize: "12px", padding: "6px 12px" }} onClick={() => setLegalDocumentId("agreement")}>查看用户协议</button>
              </div>
            </div>

            <div className="verify-config-auth-tabs">
              <button
                className={configAuthType === "direct" ? "active" : ""}
                onClick={() => setConfigAuthType("direct")}
              >八戒财税直连</button>
              <button
                className={configAuthType === "aliyun" ? "active" : ""}
                onClick={() => setConfigAuthType("aliyun")}
              >阿里云市场</button>
            </div>
            {configAuthType === "direct" ? (
              <>
                <p className="verify-config-tip">
                  请输入八戒财税开放平台的 AppKey 和 AppSecret。
                  <br />
                  <a href="https://open.cs.zbj.com/admin" target="_blank" rel="noopener noreferrer">
                    前往八戒应用中心获取
                  </a>
                </p>
                {configStatus?.configured && configStatus.authType === "direct" && (
                  <div className="verify-config-current">
                    <span className="verify-config-current-label">当前</span>
                    <span>AppKey: {configStatus.appKey}</span>
                  </div>
                )}
                <div className="verify-config-field">
                  <label>AppKey</label>
                  <input
                    type="text"
                    value={configAppKey}
                    onChange={(e) => setConfigAppKey(e.target.value)}
                    placeholder="请输入 AppKey"
                  />
                </div>
                <div className="verify-config-field">
                  <label>AppSecret</label>
                  <input
                    type="password"
                    value={configAppSecret}
                    onChange={(e) => setConfigAppSecret(e.target.value)}
                    placeholder="请输入 AppSecret"
                  />
                </div>
              </>
            ) : (
              <>
                <p className="verify-config-tip">
                  请输入阿里云市场购买后获取的 AppCode。
                  <br />
                  <a href="https://market.aliyun.com/detail/cmapi025075#sku=yuncode1907500008" target="_blank" rel="noopener noreferrer">
                    前往阿里云市场获取
                  </a>
                </p>
                {configStatus?.configured && configStatus.authType === "aliyun" && (
                  <div className="verify-config-current">
                    <span className="verify-config-current-label">当前</span>
                    <span>AppCode: {configStatus.appCode}</span>
                  </div>
                )}
                <div className="verify-config-field">
                  <label>AppCode</label>
                  <input
                    type="password"
                    value={configAppCode}
                    onChange={(e) => setConfigAppCode(e.target.value)}
                    placeholder="请输入 AppCode"
                  />
                </div>
              </>
            )}
            <label className="verify-config-current" style={{ alignItems: "flex-start", fontFamily: "inherit", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={apiExternalConsent}
                onChange={(e) => updateApiExternalConsent(e.target.checked)}
                style={{ marginTop: "2px" }}
              />
              <span style={{ lineHeight: 1.7 }}>{API_EXTERNAL_SERVICE_CONSENT_LABEL}</span>
            </label>
            <div className="verify-config-actions">
              <button onClick={() => setShowConfig(false)}>取消</button>
              <button
                className="verify-btn-primary"
                onClick={handleSaveConfig}
                disabled={savingConfig}
              >
                {savingConfig ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showUsageTip && (
        <div className="verify-config-overlay" onClick={() => setShowUsageTip(null)}>
          <div className="verify-config-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <h3>{showUsageTip.mode === "api" ? "API 查验说明" : "RPA 查验说明"}</h3>
            {showUsageTip.mode === "api" ? (
              <div className="verify-usage-tip">
                <ul>
                  <li>切换到 <strong>API</strong> 后，当前页面后续的手动查验、归档查验和批量查验都只会使用 API，不会再同时调用 RPA。</li>
                  <li>API 查验会向外部验真服务发送当前查验所需的发票字段；文件查验场景下可能发送 <strong>PDF/OFD</strong> 文件内容。</li>
                  <li>本功能调用的 API 接口均为<strong>付费接口</strong>，新注册用户可获得 <strong>100 次免费</strong>验真额度。</li>
                  <li>优点：查验速度快，且不受“每张发票每天只能查验 5 次”的限制。</li>
                </ul>
              </div>
            ) : (
              <div className="verify-usage-tip">
                <ul>
                  <li>切换到 <strong>RPA</strong> 后，当前页面后续的手动查验、归档查验和批量查验都只会使用 RPA，不会再同时调用 API。</li>
                  <li>本功能通过自动化浏览器访问<strong>国税官网</strong>进行验真，每张发票每天最多查验 <strong>5 次</strong>。</li>
                  <li>查验速度较慢，验证码图片会发送至第三方识别平台，每次调用费用为 <strong>0.017 元</strong>。</li>
                  <li>新注册用户赠送 <strong>500 积分</strong>，可免费调用验证码约 <strong>8 次</strong>。</li>
                </ul>
              </div>
            )}
            <div className="verify-config-actions">
              <button onClick={() => setShowUsageTip(null)}>取消</button>
              <button
                className="verify-btn-primary"
                onClick={() => {
                  const nextTip = showUsageTip;
                  if (!nextTip) {
                    return;
                  }
                  setShowUsageTip(null);
                  if (nextTip.action === "switch") {
                    switchVerifyMode(nextTip.mode);
                    return;
                  }
                  if (nextTip.mode === "rpa") setShowRpaConfig(true);
                  else setShowConfig(true);
                }}
              >
                知悉并切换
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="panelHeader">
        <div className="panelHeaderLeft">
          <div className="panelTitle">发票验真</div>

          <div className={`verify-mode-switch ${verifyMode === "rpa" ? "mode-rpa" : ""}`}>
            <button
              className={`verify-mode-btn ${verifyMode === "api" ? "active" : ""}`}
              onClick={() => requestVerifyModeSwitch("api")}
              title="通过八戒财税 API 查验"
            >
              {VerifyIcons.Api} API
            </button>
            <button
              className={`verify-mode-btn ${verifyMode === "rpa" ? "active" : ""}`}
              onClick={() => requestVerifyModeSwitch("rpa")}
              title="通过 RPA 自动化浏览器查验（国税官网）"
            >
              {VerifyIcons.Robot} RPA
            </button>
          </div>
        </div>
        <div className="panelHeaderRight">
          {verifyMode === "rpa" ? (

            rpaConfigStatus?.configured ? (
              <div className="verify-config-status">
                <span className="verify-config-status-dot configured" />
                <span className="verify-config-status-info">
                  <span className="verify-config-status-label">RPA</span> {rpaConfigStatus.captchaAppKey}
                </span>
                <button className="verify-config-action-btn" onClick={() => { setRpaCaptchaAppKey(""); setShowRpaConfig(true); }}>更换</button>
                <button className="verify-config-action-btn danger" onClick={handleClearRpaConfig}>退出</button>
              </div>
            ) : (
              <div className="verify-config-status">
                <span className="verify-config-status-dot" />
                <span className="verify-config-status-info unconfigured">未配置</span>
                <button className="verify-config-action-btn primary" onClick={() => setShowRpaConfig(true)}>配置 RPA</button>
              </div>
            )
          ) : (

            configStatus?.configured ? (
              <div className="verify-config-status">
                <span className="verify-config-status-dot configured" />
                <span className="verify-config-status-info">
                  {configStatus.authType === "aliyun" ? (
                    <><span className="verify-config-status-label">阿里云</span> {configStatus.appCode}</>
                  ) : (
                    <><span className="verify-config-status-label">直连</span> {configStatus.appKey}</>
                  )}
                </span>
                <button className="verify-config-action-btn" onClick={handleChangeConfig}>更换</button>
                <button className="verify-config-action-btn danger" onClick={handleClearConfig}>退出</button>
              </div>
            ) : (
              <div className="verify-config-status">
                <span className="verify-config-status-dot" />
                <span className="verify-config-status-info unconfigured">未配置</span>
                <button className="verify-config-action-btn primary" onClick={() => setShowConfig(true)}>配置 API</button>
              </div>
            )
          )}
        </div>
      </div>

      {showSetup ? (

        <div className="verify-content">
          <div className="verify-setup">
            <div className="verify-setup-icon">{verifyMode === "rpa" ? VerifyIcons.Robot : VerifyIcons.Key}</div>
            <h2>{verifyMode === "rpa" ? "配置 RPA 验真" : "配置 API"}</h2>
            {verifyMode === "rpa" ? (
              <p>
                RPA 验真通过自动化浏览器访问国税查验平台，需先配置验证码识别服务。
              </p>
            ) : (
              <p>
                支持八戒财税直连或阿里云市场两种接入方式。
              </p>
            )}
            <button className="verify-btn-primary verify-btn-lg" onClick={() => { if (verifyMode === "rpa") setShowRpaConfig(true); else setShowConfig(true); }}>
              {verifyMode === "rpa" ? VerifyIcons.Robot : VerifyIcons.Key} 开始配置
            </button>
          </div>
        </div>
      ) : (

        <>

      <div className="verify-tabs">
        <button
          className={`verify-tab ${activeTab === "manual" ? "active" : ""}`}
          onClick={() => setActiveTab("manual")}
        >
          手动查验
        </button>
        <button
          className={`verify-tab ${activeTab === "archive" ? "active" : ""}`}
          onClick={() => setActiveTab("archive")}
        >
          归档发票 {unverifiedCount > 0 && <span className="verify-tab-badge">{unverifiedCount}</span>}
        </button>
        <button
          className={`verify-tab ${activeTab === "history" ? "active" : ""}`}
          onClick={() => setActiveTab("history")}
        >
          查验记录 {history.length > 0 && <span className="verify-tab-badge">{history.length}</span>}
        </button>
      </div>

      <div className="verify-content">
        {activeTab === "manual" && (
          <div className="verify-manual">
            <div className="verify-form">
              <div className="verify-form-row">
                <div className="verify-form-field">
                  <label>发票代码 <span className="verify-form-optional">（全电发票可留空）</span></label>
                  <input
                    type="text"
                    value={fpdm}
                    onChange={(e) => setFpdm(e.target.value)}
                    placeholder="如 051001900111"
                    maxLength={20}
                  />
                </div>
                <div className="verify-form-field">
                  <label>发票号码 <span className="verify-form-required">*</span></label>
                  <input
                    type="text"
                    value={fphm}
                    onChange={(e) => setFphm(e.target.value)}
                    placeholder="如 51096586"
                    maxLength={20}
                  />
                </div>
              </div>
              <div className="verify-form-row">
                <div className="verify-form-field">
                  <label>开票日期 <span className="verify-form-required">*</span></label>
                  <input
                    type="date"
                    value={kprq}
                    onChange={(e) => setKprq(e.target.value)}
                  />
                </div>
                <div className="verify-form-field">
                  <label>校验码（后6位）</label>
                  <input
                    type="text"
                    value={checkCode}
                    onChange={(e) => setCheckCode(e.target.value)}
                    placeholder="如 769875"
                    maxLength={6}
                  />
                </div>
              </div>
              <div className="verify-form-row">
                <div className="verify-form-field">
                  <label>金额 <span className="verify-form-optional">（专票填不含税金额，全电发票填价税合计）</span></label>
                  <input
                    type="text"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="如 100.00"
                  />
                </div>
                {verifying && verifyMode === "rpa" && rpaProgress && (
                  <div className="verify-form-field verify-form-progress">
                    <div className="verify-rpa-progress-stage">{rpaProgress.message || "RPA 查验中..."}</div>
                    <div className="verify-rpa-progress-realtime">
                      <span className="verify-spinner" />
                      <span>
                        {rpaProgress.pollAttempt && rpaProgress.pollTotal
                          ? `轮询查验结果 ${rpaProgress.pollAttempt}/${rpaProgress.pollTotal}`
                          : rpaProgress.attempt && rpaProgress.attempt > 1
                            ? `第 ${rpaProgress.attempt} 次重试`
                            : "请稍候，正在自动化处理"}
                      </span>
                    </div>
                  </div>
                )}
                <div className="verify-form-field verify-form-submit">
                  <button
                    className="verify-btn-primary verify-btn-lg"
                    onClick={handleVerify}
                    disabled={isAnyVerifying || !fphm.trim() || !kprq.trim()}
                    title={isAnyVerifying && !verifying ? "请等待当前查验任务完成" : ""}
                  >
                    {verifying ? (
                      <><span className="verify-spinner" /> 查验中...</>
                    ) : (
                      <>{VerifyIcons.Search} 查验</>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {currentResult && (
              <div className="verify-result-wrap">
                {renderVerifyResult(currentResult)}
              </div>
            )}
          </div>
        )}

        {activeTab === "archive" && (
          <div className="verify-archive">
            {archiveInvoices.length === 0 ? (
              <div className="verify-empty">
                <div className="verify-empty-icon">{VerifyIcons.File}</div>
                <p>暂无归档发票</p>
                <p className="verify-empty-hint">请先在发票管理页面添加发票</p>
              </div>
            ) : (
              <div className="verify-archive-layout">

                <div className="verify-archive-folder-panel">
                  <FolderTree
                    folders={allFolders}
                    selectedFolderId={selectedFolderId}
                    invoiceCounts={folderCounts}
                    onSelect={handleSelectFolder}
                    readOnly
                  />
                </div>

                <div className="verify-archive-list-panel">

                <div className="verify-archive-toolbar">
                  <div className="verify-archive-filters">
                    <button className={archiveFilter === "all" ? "active" : ""} onClick={() => { setArchiveFilter("all"); setArchiveSelectedIds([]); }}>
                      全部 ({archiveInvoices.length})
                    </button>
                    <button className={archiveFilter === "unverified" ? "active" : ""} onClick={() => { setArchiveFilter("unverified"); setArchiveSelectedIds([]); }}>
                      未查验 ({unverifiedCount})
                    </button>
                    <button className={archiveFilter === "verified" ? "active" : ""} onClick={() => { setArchiveFilter("verified"); setArchiveSelectedIds([]); }}>
                      已查验 ({archiveInvoices.length - unverifiedCount})
                    </button>
                  </div>
                  {archiveSelectedIds.length > 0 && !isBatchVerifying && (
                    <button
                      className="verify-btn-primary"
                      style={{ fontSize: 12, padding: "4px 12px" }}
                      onClick={handleBatchVerify}
                      disabled={isAnyVerifying}
                      title={isAnyVerifying ? "请等待当前查验任务完成" : ""}
                    >
                      批量查验 ({archiveSelectedIds.filter((id) => !archiveInvoices.find((inv) => inv.id === id)?.isVerified).length})
                    </button>
                  )}
                  {isBatchVerifying && (
                    <button
                      className="verify-btn-danger"
                      style={{ fontSize: 12, padding: "4px 12px" }}
                      disabled={isBatchVerifyStopping}
                      onClick={() => {
                        setConfirmDialog({
                          title: "停止批量查验",
                          message: "确定要停止批量查验吗？将停止后续未查验的发票，当前正在查验的发票无法中止。",
                          confirmText: "确认",
                          onConfirm: () => {
                            batchVerifyAbortedRef.current = true;
                            setIsBatchVerifyStopping(true);
                            showToast("正在停止批量查验...", "info");
                            setConfirmDialog(null);
                          },
                        });
                      }}
                    >
                      {isBatchVerifyStopping ? "正在停止..." : `停止查验 (${batchVerifyProgress.current}/${batchVerifyProgress.total})`}
                    </button>
                  )}
                </div>

                <div className="invoiceList" style={{ flex: 1, minHeight: 0 }}>
                  <div className="invoiceListHeader">
                    <div
                      className={`tableCheckbox ${archiveAllSelected ? "checked" : ""} ${archiveSomeSelected ? "indeterminate" : ""}`}
                      onClick={handleArchiveSelectAll}
                    >
                      {(archiveAllSelected || archiveSomeSelected) && VerifyIcons.Check}
                    </div>
                    <span className="invoiceListHeaderText" style={{ flex: 1 }}>文件</span>
                    <span className="invoiceListHeaderText" style={{ width: 56, textAlign: "center" }}>状态</span>
                    <span className="invoiceListHeaderText" style={{ width: 80, textAlign: "right" }}>金额</span>
                    <span className="invoiceListHeaderText" style={{ width: 56, textAlign: "center" }}>操作</span>
                  </div>
                  <div className="invoiceListBody">
                    {filteredArchiveInvoices.length === 0 ? (
                      <div className="verify-empty" style={{ padding: "32px 20px" }}>
                        <p>当前筛选无结果</p>
                      </div>
                    ) : (
                      filteredArchiveInvoices.map((inv) => {
                        const isSelected = archiveSelectedIds.includes(inv.id);
                        const isVerifyingThis = verifyingIds.has(inv.id);
                        const result = archiveResults.get(inv.id);
                        return (
                          <div
                            key={inv.id}
                            className={`invoiceListItem ${isSelected ? "invoiceListItemSelected" : ""}`}
                          >
                            <div
                              className={`tableCheckbox ${isSelected ? "checked" : ""}`}
                              onClick={() => handleArchiveToggleSelect(inv.id)}
                            >
                              {isSelected && VerifyIcons.Check}
                            </div>
                            <div className="invoiceListItemMain">
                              <div className="invoiceListItemTop">
                                <span className="invoiceListItemName" title={inv.fileName}>
                                  {inv.fileName}
                                </span>
                              </div>
                              <div className="invoiceListItemBottom">
                                <span className="invoiceListItemType">{CATEGORY_LABELS[inv.category]}</span>
                                {inv.invoiceDate && <span className="invoiceListItemDate">{inv.invoiceDate}</span>}
                                {inv.sellerName && <span className="invoiceListItemDate">{inv.sellerName}</span>}
                              </div>
                              {result && !result.success && (
                                <div className="verify-invoice-result-inline fail" style={{ marginTop: 3 }}>
                                  <span className="verify-inline-icon">{VerifyIcons.X}</span> {result.error || "查验失败"}
                                </div>
                              )}
                            </div>
                            {isVerifyingThis && verifyMode === "rpa" && rpaProgress && (
                              <div className="verify-rpa-progress-card">
                                <div className="verify-rpa-progress-stage">{rpaProgress.message || "查验中..."}</div>
                                <div className="verify-rpa-progress-realtime">
                                  <span className="verify-spinner" />
                                  <span>
                                    {rpaProgress.pollAttempt && rpaProgress.pollTotal
                                      ? `轮询 ${rpaProgress.pollAttempt}/${rpaProgress.pollTotal}`
                                      : rpaProgress.attempt && rpaProgress.attempt > 1
                                        ? `第 ${rpaProgress.attempt} 次重试`
                                        : "自动化处理中"}
                                  </span>
                                </div>
                              </div>
                            )}
                            <div className="invoiceListItemActions">
                                  <span className="verify-status-badge" style={{ width: 56, textAlign: "center", boxSizing: "border-box" }}>
                                    {inv.isVerified ? (
                                      <span className="verify-status-badge ok">已查验</span>
                                    ) : (
                                      <span className="verify-status-badge pending">未查验</span>
                                    )}
                                  </span>
                                  <span className="invoiceListItemAmount" style={{ width: 80, textAlign: "right" }}>{formatAmount(inv.totalAmount)}</span>
                                  <span style={{ width: 56, textAlign: "center", flexShrink: 0 }}>
                                    {!inv.isVerified ? (
                                      <button
                                        className="verify-btn-primary"
                                        style={{ padding: "3px 10px", fontSize: 12 }}
                                        onClick={(e) => { e.stopPropagation(); handleVerifyArchiveInvoice(inv); }}
                                        disabled={isAnyVerifying || (verifyMode === "rpa" && verifyLimitedIds.has(inv.id))}
                                        title={
                                          verifyMode === "rpa" && verifyLimitedIds.has(inv.id)
                                            ? "今日查验次数已达上限，请明日再试"
                                            : isAnyVerifying && !isVerifyingThis
                                              ? "请等待当前查验任务完成"
                                              : ""
                                        }
                                      >
                                        {isVerifyingThis ? <span className="verify-spinner" /> : (verifyMode === "rpa" && verifyLimitedIds.has(inv.id)) ? "次日可查" : "查验"}
                                      </button>
                                    ) : (
                                      <span style={{ display: "inline-block", width: 56 }} />
                                    )}
                                  </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "history" && (
          <div className="verify-history">
            {history.length === 0 ? (
              <div className="verify-empty">
                <div className="verify-empty-icon">{VerifyIcons.Clock}</div>
                <p>暂无查验记录</p>
                <p className="verify-empty-hint">查验发票后记录将显示在这里</p>
              </div>
            ) : (
              <div className="verify-archive-layout">

                <div className="verify-archive-folder-panel">
                  <div className="verify-history-folders">
                    {HISTORY_FOLDERS.map((f) => (
                      <div
                        key={f.id}
                        className={`folderItem ${historyFolder === f.id ? "folderItemActive" : ""}`}
                        onClick={() => setHistoryFolder(f.id)}
                      >
                        <span className="folderExpandPlaceholder" />
                        <span className="folderIcon" style={f.color ? { color: f.color } : undefined}>{f.icon}</span>
                        <span className="folderName">{f.name}</span>
                        <span className="folderCount">{historyFolderCounts[f.id]}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="verify-archive-list-panel">
                  <div className="verify-archive-toolbar">
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>{filteredHistory.length} 条记录</span>
                    {history.length > 0 && (
                      <button className="verify-history-clear-btn" onClick={handleClearHistory}>
                        {VerifyIcons.Trash} 清空记录
                      </button>
                    )}
                  </div>
                  <div className="verify-history-list">
                    {filteredHistory.length === 0 ? (
                      <div className="verify-empty" style={{ padding: "32px 20px" }}>
                        <p>当前分类无记录</p>
                      </div>
                    ) : (
                      filteredHistory.map((item) => {
                        const isExpanded = expandedHistoryId === item.uid;
                        const linkedInvoice = item.invoiceUid ? archiveInvoices.find((inv) => inv.id === item.invoiceUid) : null;
                        return (
                          <div key={item.uid} className={`verify-history-entry ${item.result.success ? "ok" : "fail"}`}>
                            <div
                              className={`verify-history-item ${isExpanded ? "expanded" : ""}`}
                              onClick={() => setExpandedHistoryId(isExpanded ? null : item.uid)}
                            >
                              <div className="verify-history-left">
                                <span className={`verify-history-status ${item.result.success ? "ok" : "fail"}`}>
                                  {item.result.success ? VerifyIcons.Check : VerifyIcons.X}
                                </span>
                                <div>
                                  <div className="verify-history-fphm">
                                    {item.fphm}
                                    <span className={`verify-history-source ${item.invoiceUid ? "archive" : "manual"}`}>
                                      {item.invoiceUid ? "归档查验" : "手动查验"}
                                    </span>
                                  </div>
                                  <div className="verify-history-time">
                                    {new Date(item.timestamp).toLocaleString("zh-CN")}
                                    {item.kprq && ` · 开票: ${item.kprq}`}
                                    {linkedInvoice && ` · ${linkedInvoice.fileName}`}
                                  </div>
                                </div>
                              </div>
                              <div className="verify-history-right">
                                {item.result.success && item.result.data ? (
                                  <span className="verify-history-amount">¥{item.result.data.sumamount || "-"}</span>
                                ) : (
                                <span className="verify-history-error" title={item.result.error || "失败"}>{item.result.error || "失败"}</span>
                                )}
                                <button
                                  className="verify-history-delete-btn"
                                  title="删除记录"
                                  onClick={(e) => { e.stopPropagation(); handleDeleteHistory(item.uid, item.fphm); }}
                                >
                                  {VerifyIcons.Trash}
                                </button>
                                <span className={`verify-history-expand ${isExpanded ? "expanded" : ""}`}>{VerifyIcons.ChevronDown}</span>
                              </div>
                            </div>
                            {isExpanded && (
                              <div className="verify-history-detail">

                                {item.screenshotPath && (
                                  <button
                                    className="verify-screenshot-btn"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setScreenshotModal({ uid: item.uid, path: item.screenshotPath! });
                                    }}
                                    title="查看查验截图"
                                  >
                                    {VerifyIcons.Eye}
                                    <span>查看截图</span>
                                  </button>
                                )}
                                {item.result.success ? (
                                  renderVerifyResult(item.result)
                                ) : (
                                  (item.result.code || item.result.description) ? (
                                    <div className="verify-history-detail-fail">
                                      {item.result.code !== undefined && item.result.code !== null && (
                                        <span className="verify-history-detail-code">错误码 {item.result.code}</span>
                                      )}
                                      {item.result.description && (
                                        <p className="verify-history-detail-desc">{item.result.description}</p>
                                      )}
                                    </div>
                                  ) : !item.screenshotPath && (
                                    <div className="verify-history-detail-empty">暂无更多信息</div>
                                  )
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      </>
      )}

      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmText={confirmDialog.confirmText || "删除"}
          danger={confirmDialog.danger !== false}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
      {legalDocumentId && (
        <LegalDocumentDialog
          documentId={legalDocumentId}
          onClose={() => setLegalDocumentId(null)}
          onChangeDocument={setLegalDocumentId}
        />
      )}

      {screenshotModal && (
        <div className="screenshot-modal-overlay" onClick={() => setScreenshotModal(null)}>
          <div className="screenshot-modal" onClick={(e) => e.stopPropagation()}>
            <div className="screenshot-modal-header">
              <button className="screenshot-modal-back" onClick={() => setScreenshotModal(null)}>
                {VerifyIcons.Back}
                <span>返回</span>
              </button>
              <span>查验截图</span>
              <span style={{ width: 60 }} />
            </div>
            <div className="screenshot-modal-body">
              {screenshotCache[screenshotModal.uid] ? (
                <img
                  src={screenshotCache[screenshotModal.uid]}
                  alt="查验截图"
                />
              ) : (
                <div className="screenshot-loading">加载截图中...</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

