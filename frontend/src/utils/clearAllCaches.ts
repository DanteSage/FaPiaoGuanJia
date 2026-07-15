import { clearOcrCache } from "./ocrCache";
import { clearOfdWarmup } from "./ofdWarmup";
import { clearRenderedPreviewCache } from "../cache/previewCache";
import { clearImageCache } from "../hooks/useImageCache";
import { clearImagePreviewCache } from "../components/ImagePreview";

const LOCAL_STORAGE_KEEP_KEYS: ReadonlySet<string> = new Set([
  "archive_invoices_v1",
  "archive_folders_v1",
  "archive_tags_v1",
  "reimbursement_state_v1",
  "reimbursement_folders_v1",
  "app_settings_v1",
  "fapiao:api-external-service-consent:v1",
  "fapiao:rpa-external-service-consent:v1",
  "verifyMode",
]);

export type ClearAllCachesReport = {
  localStorageRemoved: number;
  memoryEntries: {
    ocr: number;
    renderedPreview: number;
    image: number;
    imagePreview: number;
    ofdWarmup: number;
  };
  diskDeletedFiles: number;
  diskFreedBytes: number;
  errors: string[];
};

function clearLocalStorageNonReserved(): number {
  if (typeof window === "undefined" || !window.localStorage) return 0;
  const toRemove: string[] = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const k = window.localStorage.key(i);
    if (k && !LOCAL_STORAGE_KEEP_KEYS.has(k)) toRemove.push(k);
  }
  toRemove.forEach((k) => window.localStorage.removeItem(k));
  return toRemove.length;
}

export async function clearAllCaches(): Promise<ClearAllCachesReport> {
  const errors: string[] = [];

  let renderedPreviewCount = 0;
  try {
    renderedPreviewCount = clearRenderedPreviewCache().entryCount;
  } catch (e) {
    errors.push(`renderedPreview: ${e instanceof Error ? e.message : String(e)}`);
  }

  let imageCacheCount = 0;
  try {
    imageCacheCount = clearImageCache().entryCount;
  } catch (e) {
    errors.push(`image: ${e instanceof Error ? e.message : String(e)}`);
  }

  let imagePreviewCount = 0;
  try {
    imagePreviewCount = clearImagePreviewCache().entryCount;
  } catch (e) {
    errors.push(`imagePreview: ${e instanceof Error ? e.message : String(e)}`);
  }

  let ofdWarmupCount = 0;
  try {
    ofdWarmupCount = clearOfdWarmup().entryCount;
  } catch (e) {
    errors.push(`ofdWarmup: ${e instanceof Error ? e.message : String(e)}`);
  }

  const ocrCountBefore = (() => {
    if (typeof window === "undefined" || !window.localStorage) return 0;
    try {
      const raw = window.localStorage.getItem("invoice-tool:ocr-cache:v1");
      if (!raw) return 0;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return Object.keys(parsed).length;
    } catch {
      return 0;
    }
  })();

  try {
    clearOcrCache();
  } catch (e) {
    errors.push(`ocr: ${e instanceof Error ? e.message : String(e)}`);
  }

  let localStorageRemoved = 0;
  try {
    localStorageRemoved = clearLocalStorageNonReserved();
  } catch (e) {
    errors.push(`localStorage: ${e instanceof Error ? e.message : String(e)}`);
  }

  let diskDeletedFiles = 0;
  let diskFreedBytes = 0;
  try {
    if (typeof window !== "undefined" && window.invoiceApi?.clearOfdCaches) {
      const res = await window.invoiceApi.clearOfdCaches();
      diskDeletedFiles = res?.deletedFiles ?? 0;
      diskFreedBytes = res?.freedBytes ?? 0;
    }
  } catch (e) {
    errors.push(`disk: ${e instanceof Error ? e.message : String(e)}`);
  }

  return {
    localStorageRemoved,
    memoryEntries: {
      ocr: ocrCountBefore,
      renderedPreview: renderedPreviewCount,
      image: imageCacheCount,
      imagePreview: imagePreviewCount,
      ofdWarmup: ofdWarmupCount,
    },
    diskDeletedFiles,
    diskFreedBytes,
    errors,
  };
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 100 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}
