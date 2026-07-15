import { useCallback } from "react";
import type { InvoiceFileItem } from "../types";

const MAX_PRELOAD_CONCURRENCY = 1;

async function preloadWorker(queue: string[]): Promise<void> {
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < queue.length) {
      const idx = nextIndex;
      nextIndex += 1;
      try {
        const result = await window.invoiceApi.preloadOfd(queue[idx]);
        if (!result.success) {
          console.warn(`[预加载] OFD 预加载失败: ${queue[idx]} - ${result.error}`);
        }
      } catch (err) {
        console.error(`[预加载] OFD 预加载异常: ${queue[idx]}`, err);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(MAX_PRELOAD_CONCURRENCY, queue.length) }, () => worker())
  );
}

export function useOfdPreload() {
  const preloadOfdFiles = useCallback((files: InvoiceFileItem[]) => {
    const ofdPaths = files
      .filter((file) => file.type === "ofd")
      .map((file) => file.path);

    if (ofdPaths.length === 0) return;

    window.setTimeout(() => {
      preloadWorker(ofdPaths);
    }, 100);
  }, []);

  return { preloadOfdFiles };
}
