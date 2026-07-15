import type { OcrResult } from "../types";

const STORAGE_KEY = "invoice-tool:ocr-cache:v1";
const MAX_ENTRIES = 200;

type Entry = {
  ocr: OcrResult;
  savedAt: number;
};

let memoryCache: Map<string, Entry> | null = null;
let persistScheduled = false;

function ensureInit(): Map<string, Entry> {
  if (memoryCache) return memoryCache;
  memoryCache = new Map<string, Entry>();
  if (typeof window === "undefined" || !window.localStorage) return memoryCache;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, Entry>;
      for (const [path, entry] of Object.entries(parsed)) {
        if (entry && entry.ocr && typeof entry.savedAt === "number") {
          memoryCache.set(path, entry);
        }
      }
    }
  } catch (error) {
    console.warn("[ocrCache] 加载持久化缓存失败", error);
  }
  return memoryCache;
}

function schedulePersist(): void {
  if (persistScheduled) return;
  persistScheduled = true;
  const run = () => {
    persistScheduled = false;
    if (!memoryCache) return;
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
      const obj: Record<string, Entry> = {};
      for (const [path, entry] of memoryCache.entries()) obj[path] = entry;
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch (error) {
      console.warn("[ocrCache] 持久化缓存失败", error);
    }
  };
  if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(run, { timeout: 1000 });
  } else if (typeof window !== "undefined") {
    window.setTimeout(run, 200);
  } else {
    run();
  }
}

function trimLru(cache: Map<string, Entry>): void {
  if (cache.size <= MAX_ENTRIES) return;
  const overflow = cache.size - MAX_ENTRIES;
  const sorted = [...cache.entries()].sort((a, b) => a[1].savedAt - b[1].savedAt);
  for (let i = 0; i < overflow; i += 1) {
    cache.delete(sorted[i][0]);
  }
}

export function getCachedOcr(path: string): OcrResult | null {
  if (!path) return null;
  const cache = ensureInit();
  const entry = cache.get(path);
  if (!entry) return null;
  entry.savedAt = Date.now();
  schedulePersist();
  return entry.ocr;
}

export function setCachedOcr(path: string, ocr: OcrResult): void {
  if (!path || !ocr) return;
  const cache = ensureInit();
  cache.set(path, { ocr, savedAt: Date.now() });
  trimLru(cache);
  schedulePersist();
}

export function invalidateOcrCache(path: string): void {
  if (!path) return;
  const cache = ensureInit();
  if (cache.delete(path)) schedulePersist();
}

export function clearOcrCache(): void {
  memoryCache = new Map<string, Entry>();
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.warn("[ocrCache] 清空缓存失败", error);
    }
  }
}

export async function ocrFileWithCache(
  path: string,
  options?: { force?: boolean }
): Promise<OcrResult> {
  if (!options?.force) {
    const cached = getCachedOcr(path);
    if (cached && (cached.text || (cached.fields && Object.keys(cached.fields).length > 0))) {
      return cached;
    }
  }
  const result = await window.invoiceApi.ocrFile(path);
  setCachedOcr(path, result);
  return result;
}
