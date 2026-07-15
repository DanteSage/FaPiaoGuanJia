import { useCallback } from "react";
import { PREVIEW_RENDER_SCALE } from "../constants/renderScales";
import { loadRenderedPreviewPage } from "../cache/previewCache";

export type CachedImage = {
  dataUrl: string;
  naturalW: number;
  naturalH: number;
  timestamp: number;
};

type ImageCache = Map<string, CachedImage>;

const globalCache: ImageCache = new Map();
const inflightLoads = new Map<string, Promise<CachedImage | null>>();
const MAX_CACHE_SIZE = 100;

function getCached(key: string): CachedImage | undefined {
  const cached = globalCache.get(key);
  if (cached) {
    cached.timestamp = Date.now();
  }
  return cached;
}

function setCached(key: string, value: Omit<CachedImage, "timestamp">) {
  globalCache.set(key, { ...value, timestamp: Date.now() });

  if (globalCache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(globalCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toDelete = entries.slice(0, globalCache.size - MAX_CACHE_SIZE);
    for (const [k] of toDelete) {
      globalCache.delete(k);
    }
  }
}

export function clearImageCache(): { entryCount: number } {
  const entryCount = globalCache.size;
  for (const value of globalCache.values()) {
    if (value.dataUrl.startsWith("blob:")) {
      URL.revokeObjectURL(value.dataUrl);
    }
  }
  globalCache.clear();
  inflightLoads.clear();
  return { entryCount };
}

export function loadImageStandalone(
  filePath: string,
  fileType: "image" | "pdf" | "ofd"
): Promise<CachedImage | null> {
  const previewKey = fileType === "image" ? "preview" : `preview-${PREVIEW_RENDER_SCALE}`;
  const cacheKey = `${filePath}::${previewKey}`;

  const cached = getCached(cacheKey);
  if (cached) return Promise.resolve(cached);

  const existing = inflightLoads.get(cacheKey);
  if (existing) return existing;

  const task = (async (): Promise<CachedImage | null> => {
    try {
      let result: CachedImage | null = null;

      if (fileType === "image") {
        const bytes = await window.invoiceApi.readFile(filePath);
        const blob = new Blob([new Uint8Array(bytes)]);
        const dataUrl = URL.createObjectURL(blob);
        const img = new Image();
        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = dataUrl;
        });
        result = {
          dataUrl,
          naturalW: img.naturalWidth || 100,
          naturalH: img.naturalHeight || 100,
          timestamp: Date.now(),
        };
      } else {
        const res = await loadRenderedPreviewPage(filePath, 1, PREVIEW_RENDER_SCALE);
        result = {
          dataUrl: res.dataUrl,
          naturalW: res.width,
          naturalH: res.height,
          timestamp: Date.now(),
        };
      }

      if (result) {
        setCached(cacheKey, result);
      }
      return result;
    } catch {
      return null;
    } finally {
      inflightLoads.delete(cacheKey);
    }
  })();

  inflightLoads.set(cacheKey, task);
  return task;
}

export function useImageCache() {

  const loadImage = useCallback(async (
    _fileId: string,
    filePath: string,
    fileType: string
  ): Promise<CachedImage | null> => {
    if (fileType !== "image" && fileType !== "pdf" && fileType !== "ofd") {
      return null;
    }
    return loadImageStandalone(filePath, fileType);
  }, []);

  const preloadImages = useCallback(async (
    files: Array<{ id: string; path: string; type: string }>
  ): Promise<Map<string, CachedImage>> => {
    const results = new Map<string, CachedImage>();

    await Promise.all(
      files.map(async (file) => {
        const image = await loadImage(file.id, file.path, file.type);
        if (image) {
          results.set(file.id, image);
        }
      })
    );

    return results;
  }, [loadImage]);

  const clear = useCallback(() => {
    for (const value of globalCache.values()) {
      if (value.dataUrl.startsWith("blob:")) {
        URL.revokeObjectURL(value.dataUrl);
      }
    }
    globalCache.clear();
  }, []);

  return {
    loadImage,
    preloadImages,
    clear,
    cacheSize: globalCache.size
  };
}
