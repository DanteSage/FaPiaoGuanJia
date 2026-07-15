import { useState, useCallback } from "react";
import type { PreviewConfig } from "../types";

const STORAGE_CURRENT = "preview_config_current_v1";

type UnknownRecord = Record<string, unknown>;

export function defaultPreviewConfig(): PreviewConfig {
  return {
    version: 1,
    layout: { nUp: 2, showPaper: true, showMargins: true, paperShadow: true, mergePreview: true },
    paper: {
      preset: "A4",
      widthMm: 210,
      heightMm: 297,
      orientation: "portrait",
      marginMm: { top: 12, right: 12, bottom: 12, left: 12 },
    },
    splitLine: {
      enabled: true,
      axis: "horizontal",
      positionPct: 50,
      style: "dashed",
      thicknessPx: 1,
      opacity: 0.55,
    },
    punchHoles: { enabled: false, position: "left", count: 2 },
    bindingLine: { enabled: false, position: "left", style: "dashed" },
    extras: { exportMode: "preview" },
  };
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function mergeConfig(input: unknown): PreviewConfig {
  const base = defaultPreviewConfig();
  if (!input || typeof input !== "object") return base;
  const data = input as UnknownRecord;
  if (data.version !== 1) return base;

  const layoutData = (data.layout as UnknownRecord) || {};
  const paperData = (data.paper as UnknownRecord) || {};
  const paperMarginData = ((data.paper as UnknownRecord)?.marginMm as UnknownRecord) || {};
  const splitLineData = (data.splitLine as UnknownRecord) || {};
  const punchHolesData = (data.punchHoles as UnknownRecord) || {};
  const bindingLineData = (data.bindingLine as UnknownRecord) || {};
  const extrasData = (data.extras as UnknownRecord) || {};

  const next: PreviewConfig = {
    ...base,
    ...data,
    layout: { ...base.layout, ...layoutData },
    paper: {
      ...base.paper,
      ...paperData,
      marginMm: {
        ...base.paper.marginMm,
        ...paperMarginData,
      },
    },
    splitLine: { ...base.splitLine, ...splitLineData },
    punchHoles: { ...base.punchHoles, ...punchHolesData },
    bindingLine: { ...base.bindingLine, ...bindingLineData },
    extras: { ...(base.extras || {}), ...extrasData },
  } as PreviewConfig;

  const n = next.layout.nUp;
  if (![1, 2, 3, 4, 6].includes(n)) next.layout.nUp = base.layout.nUp;

  if (next.layout.grid) {
    if (!Number.isFinite(next.layout.grid.cols) || !Number.isFinite(next.layout.grid.rows)) {
      next.layout.grid = undefined;
    } else {
      const cols = clamp(Number(next.layout.grid.cols || 0), 1, 6);
      const rows = clamp(Number(next.layout.grid.rows || 0), 1, 10);
      next.layout.grid = { cols, rows };
    }
  }

  return next;
}

export function loadCurrentPreviewConfig(): PreviewConfig {
  try {
    const raw = localStorage.getItem(STORAGE_CURRENT);
    if (!raw) return defaultPreviewConfig();
    return mergeConfig(JSON.parse(raw));
  } catch {
    return defaultPreviewConfig();
  }
}

function saveCurrent(cfg: PreviewConfig) {
  localStorage.setItem(STORAGE_CURRENT, JSON.stringify(cfg));
}

export function usePreviewConfig() {
  const [previewConfig, setPreviewConfigState] = useState<PreviewConfig>(() => {
    try {
      return loadCurrentPreviewConfig();
    } catch {
      return defaultPreviewConfig();
    }
  });

  const setPreviewConfig = useCallback((config: PreviewConfig | ((prev: PreviewConfig) => PreviewConfig)) => {
    setPreviewConfigState((prev) => {
      const next = typeof config === "function" ? config(prev) : config;

      setTimeout(() => saveCurrent(next), 250);
      return next;
    });
  }, []);

  const resetPreviewConfig = useCallback(() => {
    const defaultConfig = defaultPreviewConfig();
    setPreviewConfigState(defaultConfig);
    saveCurrent(defaultConfig);
  }, []);

  const patchPreviewConfig = useCallback((patch: Partial<PreviewConfig>) => {
    setPreviewConfig((prev) => ({ ...prev, ...patch }));
  }, [setPreviewConfig]);

  return {
    previewConfig,
    setPreviewConfig,
    resetPreviewConfig,
    patchPreviewConfig,
  };
}

export type UsePreviewConfigReturn = ReturnType<typeof usePreviewConfig>;
