import { invoiceApi } from "../api/invoiceApi";

export type RenderedPreviewPage = {
  dataUrl: string;
  pageCount: number;
  pageIndex: number;
  width: number;
  height: number;
  timestamp: number;
};

const renderedPreviewCache = new Map<string, RenderedPreviewPage>();
const inflightRenderedPreviewLoads = new Map<string, Promise<RenderedPreviewPage>>();
const MAX_RENDERED_PREVIEW_CACHE_SIZE = 40;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function getCacheKey(filePath: string, pageIndex: number, scale: number): string {
  return `${filePath}::${pageIndex}::${scale}`;
}

function revokeIfBlob(value: RenderedPreviewPage): void {
  if (value.dataUrl.startsWith("blob:")) {
    URL.revokeObjectURL(value.dataUrl);
  }
}

function removeExpiredEntries(): void {
  const now = Date.now();
  for (const [key, value] of renderedPreviewCache.entries()) {
    if (now - value.timestamp > CACHE_TTL_MS) {
      renderedPreviewCache.delete(key);
    }
  }
}

function trimCacheIfNeeded(): void {
  removeExpiredEntries();
  if (renderedPreviewCache.size <= MAX_RENDERED_PREVIEW_CACHE_SIZE) {
    return;
  }

  const keysToDelete = Array.from(renderedPreviewCache.entries())
    .sort((a, b) => a[1].timestamp - b[1].timestamp)
    .slice(0, renderedPreviewCache.size - MAX_RENDERED_PREVIEW_CACHE_SIZE)
    .map(([key]) => key);

  for (const key of keysToDelete) {
    renderedPreviewCache.delete(key);
  }
}

async function base64PngToBlobUrl(pngBase64: string): Promise<string> {
  try {
    const response = await fetch(`data:image/png;base64,${pngBase64}`);
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch {
    return `data:image/png;base64,${pngBase64}`;
  }
}

export function getRenderedPreviewPage(
  filePath: string,
  pageIndex: number,
  scale: number
): RenderedPreviewPage | undefined {
  removeExpiredEntries();

  const cacheKey = getCacheKey(filePath, pageIndex, scale);
  const cached = renderedPreviewCache.get(cacheKey);
  if (!cached) {
    return undefined;
  }

  cached.timestamp = Date.now();
  return cached;
}

export async function loadRenderedPreviewPage(
  filePath: string,
  pageIndex: number,
  scale: number
): Promise<RenderedPreviewPage> {
  const cached = getRenderedPreviewPage(filePath, pageIndex, scale);
  if (cached) {
    return cached;
  }

  const cacheKey = getCacheKey(filePath, pageIndex, scale);
  const inflight = inflightRenderedPreviewLoads.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  const task = invoiceApi
    .renderPdfPage(filePath, pageIndex, scale)
    .then(async (result) => {
      const dataUrl = await base64PngToBlobUrl(result.pngBase64);
      const rendered: RenderedPreviewPage = {
        dataUrl,
        pageCount: result.pageCount,
        pageIndex: result.pageIndex,
        width: result.width,
        height: result.height,
        timestamp: Date.now(),
      };

      renderedPreviewCache.set(cacheKey, rendered);
      trimCacheIfNeeded();
      return rendered;
    })
    .finally(() => {
      inflightRenderedPreviewLoads.delete(cacheKey);
    });

  inflightRenderedPreviewLoads.set(cacheKey, task);
  return task;
}

export async function warmRenderedPreviewPage(
  filePath: string,
  pageIndex: number,
  scale: number
): Promise<boolean> {
  try {
    await loadRenderedPreviewPage(filePath, pageIndex, scale);
    return true;
  } catch {
    return false;
  }
}

export function clearRenderedPreviewCache(): { entryCount: number } {
  const entryCount = renderedPreviewCache.size;
  for (const value of renderedPreviewCache.values()) {
    revokeIfBlob(value);
  }
  renderedPreviewCache.clear();
  inflightRenderedPreviewLoads.clear();
  return { entryCount };
}

export async function prefetchRenderedPreviewPages(
  filePath: string,
  pageIndexes: number[],
  scale: number
): Promise<void> {
  const uniquePageIndexes = Array.from(
    new Set(
      pageIndexes
        .map((pageIndex) => Math.trunc(pageIndex))
        .filter((pageIndex) => Number.isFinite(pageIndex) && pageIndex > 0)
    )
  );

  if (uniquePageIndexes.length === 0) {
    return;
  }

  await Promise.all(
    uniquePageIndexes.map(async (pageIndex) => {
      try {
        await loadRenderedPreviewPage(filePath, pageIndex, scale);
      } catch {
        return;
      }
    })
  );
}
