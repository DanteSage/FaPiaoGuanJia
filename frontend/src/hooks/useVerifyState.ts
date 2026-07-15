import { useState, useCallback } from "react";

export type VerifyMode = "api" | "rpa";

export type VerifyResultData = {
  fpdm?: string;
  fphm?: string;
  kprq?: string;
  je?: string;
  jshj?: string;
  se?: string;
  gfmc?: string;
  xfmc?: string;
  delStatus?: string;
  [key: string]: string | undefined;
};

export type VerifyResult = {
  success: boolean;
  code?: number;
  data?: VerifyResultData;
  error?: string;
  description?: string;
  needConfig?: boolean;
  requestId?: string;
};

export type VerifyHistoryItem = {
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

export type VerifyFormData = {
  fpdm: string;
  fphm: string;
  kprq: string;
  checkCode: string;
  amount: string;
};

export type ApiConfig = {
  configured: boolean;
  authType: "direct" | "aliyun";
  appKey: string;
  appSecret: string;
  appCode: string;
};

export type RpaConfig = {
  configured: boolean;
  captchaAppKey: string;
};

export function useVerifyState() {

  const [verifyMode, setVerifyModeRaw] = useState<VerifyMode>(() => {
    const saved = localStorage.getItem("verifyMode");
    return saved === "rpa" ? "rpa" : "api";
  });

  const setVerifyMode = useCallback((mode: VerifyMode) => {
    setVerifyModeRaw(mode);
    localStorage.setItem("verifyMode", mode);
  }, []);

  const [configStatus, setConfigStatus] = useState<ApiConfig | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [configAuthType, setConfigAuthType] = useState<"direct" | "aliyun">("direct");
  const [configAppKey, setConfigAppKey] = useState("");
  const [configAppSecret, setConfigAppSecret] = useState("");
  const [configAppCode, setConfigAppCode] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);

  const [rpaConfigStatus, setRpaConfigStatus] = useState<RpaConfig | null>(null);
  const [showRpaConfig, setShowRpaConfig] = useState(false);
  const [rpaCaptchaAppKey, setRpaCaptchaAppKey] = useState("");
  const [savingRpaConfig, setSavingRpaConfig] = useState(false);

  const [formData, setFormData] = useState<VerifyFormData>({
    fpdm: "",
    fphm: "",
    kprq: "",
    checkCode: "",
    amount: "",
  });

  const updateFormField = useCallback((field: keyof VerifyFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }, []);

  const resetForm = useCallback(() => {
    setFormData({
      fpdm: "",
      fphm: "",
      kprq: "",
      checkCode: "",
      amount: "",
    });
  }, []);

  const [verifying, setVerifying] = useState(false);
  const [currentResult, setCurrentResult] = useState<VerifyResult | null>(null);

  const [history, setHistory] = useState<VerifyHistoryItem[]>([]);

  const addHistoryItem = useCallback((item: VerifyHistoryItem) => {
    setHistory((prev) => [item, ...prev]);
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  const removeHistoryItem = useCallback((uid: string) => {
    setHistory((prev) => prev.filter((item) => item.uid !== uid));
  }, []);

  return {

    verifyMode,
    setVerifyMode,

    configStatus,
    setConfigStatus,
    showConfig,
    setShowConfig,
    configAuthType,
    setConfigAuthType,
    configAppKey,
    setConfigAppKey,
    configAppSecret,
    setConfigAppSecret,
    configAppCode,
    setConfigAppCode,
    savingConfig,
    setSavingConfig,

    rpaConfigStatus,
    setRpaConfigStatus,
    showRpaConfig,
    setShowRpaConfig,
    rpaCaptchaAppKey,
    setRpaCaptchaAppKey,
    savingRpaConfig,
    setSavingRpaConfig,

    formData,
    updateFormField,
    resetForm,

    verifying,
    setVerifying,
    currentResult,
    setCurrentResult,

    history,
    addHistoryItem,
    clearHistory,
    removeHistoryItem,
  };
}
