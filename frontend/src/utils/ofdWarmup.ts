import { PREVIEW_RENDER_SCALE } from "../constants/renderScales";
import { warmRenderedPreviewPage } from "../cache/previewCache";

const warmedOfdPaths = new Set<string>();
const inflightOfdWarmups = new Map<string, Promise<boolean>>();
const MAX_WARMED_PATHS = 200;

type OfdWarmupOptions = {
  hydratePreview?: boolean;
  pageIndex?: number;
  scale?: number;
};

function normalizeOfdPath(filePath: string): string {
  return filePath.trim();
}

function isOfdPath(filePath: string): boolean {
  return normalizeOfdPath(filePath).toLowerCase().endsWith(".ofd");
}

function trimWarmedPaths(): void {
  if (warmedOfdPaths.size <= MAX_WARMED_PATHS) return;
  const toDelete = Array.from(warmedOfdPaths).slice(0, warmedOfdPaths.size - MAX_WARMED_PATHS);
  for (const path of toDelete) {
    warmedOfdPaths.delete(path);
  }
}

export function clearOfdWarmup(): { entryCount: number } {
  const entryCount = warmedOfdPaths.size;
  warmedOfdPaths.clear();
  inflightOfdWarmups.clear();
  return { entryCount };
}

export async function warmupOfdPreview(filePath: string, options: OfdWarmupOptions = {}): Promise<boolean> {
  const normalizedPath = normalizeOfdPath(filePath);
  if (!normalizedPath || !isOfdPath(normalizedPath)) return false;

  const pageIndex = options.pageIndex ?? 1;
  const scale = options.scale ?? PREVIEW_RENDER_SCALE;
  const hydratePreview = options.hydratePreview === true;

  if (warmedOfdPaths.has(normalizedPath)) {
    if (!hydratePreview) return true;
    return warmRenderedPreviewPage(normalizedPath, pageIndex, scale);
  }

  const inflight = inflightOfdWarmups.get(normalizedPath);
  if (inflight) {
    const warmed = await inflight;
    if (!warmed || !hydratePreview) return warmed;
    return warmRenderedPreviewPage(normalizedPath, pageIndex, scale);
  }

  const task = window.invoiceApi.preloadOfd(normalizedPath)
    .then((result) => {
      if (!result.success) {
        console.warn("[OFD 预热] 失败:", normalizedPath, result.error);
        return false;
      }
      warmedOfdPaths.add(normalizedPath);
      trimWarmedPaths();
      return true;
    })
    .catch((error) => {
      console.warn("[OFD 预热] 异常:", normalizedPath, error);
      return false;
    })
    .finally(() => {
      inflightOfdWarmups.delete(normalizedPath);
    });

  inflightOfdWarmups.set(normalizedPath, task);
  const warmed = await task;
  if (!warmed || !hydratePreview) return warmed;
  return warmRenderedPreviewPage(normalizedPath, pageIndex, scale);
}

export async function warmupOfdPreviewBatch(filePaths: string[], concurrency: number = 2): Promise<void> {
  const queue = Array.from(
    new Set(
      filePaths
        .map(normalizeOfdPath)
        .filter((filePath) => filePath && isOfdPath(filePath) && !warmedOfdPaths.has(filePath))
    )
  );

  if (queue.length === 0) return;

  const workerCount = Math.min(Math.max(1, concurrency), queue.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < queue.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      await warmupOfdPreview(queue[currentIndex]);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
}
