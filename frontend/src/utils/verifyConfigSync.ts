export type VerifyMode = "api" | "rpa";

const VERIFY_MODE_KEY = "verifyMode";
const VERIFY_CONFIG_SYNC_EVENT = "invoice:verify-config-sync";

export function getVerifyModePreference(): VerifyMode {
  try {
    return localStorage.getItem(VERIFY_MODE_KEY) === "rpa" ? "rpa" : "api";
  } catch {
    return "api";
  }
}

export function notifyVerifyConfigSync(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent(VERIFY_CONFIG_SYNC_EVENT));
}

export function setVerifyModePreference(mode: VerifyMode): void {
  try {
    localStorage.setItem(VERIFY_MODE_KEY, mode);
  } catch {
    return;
  }
  notifyVerifyConfigSync();
}

export function subscribeVerifyConfigSync(listener: () => void): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleSync = () => {
    listener();
  };
  const handleStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === VERIFY_MODE_KEY) {
      listener();
    }
  };

  window.addEventListener(VERIFY_CONFIG_SYNC_EVENT, handleSync);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(VERIFY_CONFIG_SYNC_EVENT, handleSync);
    window.removeEventListener("storage", handleStorage);
  };
}
