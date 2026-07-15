import React, { useEffect, useMemo, useState } from "react";
import type { PreviewConfig, PreviewPaperPreset } from "../types";

const STORAGE_CURRENT = "preview_config_current_v1";

function LayoutGridIcon({ cols, rows }: { cols: number; rows: number }) {
  const cells: React.ReactNode[] = [];
  const w = 18;
  const h = 22;
  const cellW = w / cols;
  const cellH = h / rows;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      cells.push(
        <rect
          key={`${r}-${c}`}
          x={c * cellW + 0.6}
          y={r * cellH + 0.6}
          width={cellW - 1.2}
          height={cellH - 1.2}
          rx={1}
          fill="currentColor"
          opacity={0.18}
          stroke="currentColor"
          strokeWidth={0.6}
          strokeOpacity={0.55}
        />
      );
    }
  }
  return (
    <svg width="20" height="24" viewBox="0 0 20 24" fill="none" aria-hidden="true">
      <rect x="0.5" y="0.5" width={19} height={23} rx={2} stroke="currentColor" strokeOpacity={0.45} />
      {cells}
    </svg>
  );
}

const LAYOUT_OPTIONS: { key: string; label: string; icon: React.ReactNode }[] = [
  { key: "n1", label: "每页1张", icon: <LayoutGridIcon cols={1} rows={1} /> },
  { key: "n2", label: "每页2张", icon: <LayoutGridIcon cols={1} rows={2} /> },
  { key: "n3", label: "每页3张", icon: <LayoutGridIcon cols={1} rows={3} /> },
  { key: "n4", label: "每页4张", icon: <LayoutGridIcon cols={2} rows={2} /> },
  { key: "n6", label: "每页6张", icon: <LayoutGridIcon cols={2} rows={3} /> },
  { key: "train", label: "高铁票据", icon: <LayoutGridIcon cols={2} rows={4} /> },
];

const ResetIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="1 4 1 10 7 10" />
    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
  </svg>
);

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function presetSizeMm(preset: PreviewPaperPreset): { w: number; h: number } {
  if (preset === "A4") return { w: 210, h: 297 };
  if (preset === "A5") return { w: 148, h: 210 };
  if (preset === "Letter") return { w: 216, h: 279 };
  return { w: 210, h: 297 };
}

function isTrainGrid(layout: PreviewConfig["layout"]) {
  return layout.grid?.cols === 2 && layout.grid?.rows === 4;
}

export function defaultPreviewConfig(): PreviewConfig {
  return {
    version: 1,
    layout: { nUp: 2, showPaper: true, showMargins: true, paperShadow: true, mergePreview: true },
    paper: {
      preset: "A4",
      widthMm: 210,
      heightMm: 297,
      orientation: "portrait",
      marginMm: { top: 12, right: 12, bottom: 12, left: 12 }
    },
    splitLine: { enabled: true, axis: "horizontal", positionPct: 50, style: "dashed", thicknessPx: 1, opacity: 0.55 },
    punchHoles: { enabled: false, position: "left", count: 2 },
    bindingLine: { enabled: false, position: "left", style: "dashed" },
    extras: { exportMode: "preview" }
  };
}

function mergeConfig(input: unknown): PreviewConfig {
  const base = defaultPreviewConfig();
  if (!input || typeof input !== "object") return base;
  const parsed = input as Partial<PreviewConfig> & {
    version?: number;
    layout?: Partial<PreviewConfig["layout"]>;
    paper?: Partial<PreviewConfig["paper"]> & {
      marginMm?: Partial<PreviewConfig["paper"]["marginMm"]>;
    };
    splitLine?: Partial<PreviewConfig["splitLine"]>;
    punchHoles?: Partial<PreviewConfig["punchHoles"]>;
    bindingLine?: Partial<PreviewConfig["bindingLine"]>;
    extras?: Record<string, unknown>;
  };
  if (parsed.version !== 1) return base;
  const next: PreviewConfig = {
    ...base,
    ...parsed,
    layout: { ...base.layout, ...(parsed.layout || {}) },
    paper: {
      ...base.paper,
      ...(parsed.paper || {}),
      marginMm: { ...base.paper.marginMm, ...((parsed.paper || {}).marginMm || {}) }
    },
    splitLine: { ...base.splitLine, ...(parsed.splitLine || {}) },
    punchHoles: { ...base.punchHoles, ...(parsed.punchHoles || {}) },
    bindingLine: { ...base.bindingLine, ...(parsed.bindingLine || {}) },
    extras: { ...(base.extras || {}), ...(parsed.extras || {}) }
  };
  const n = Number(next.layout.nUp);
  if (n === 1 || n === 2 || n === 3 || n === 4 || n === 6) {
    next.layout.nUp = n;
  } else {
    next.layout.nUp = base.layout.nUp;
  }
  if (next.layout.grid && (!Number.isFinite(next.layout.grid.cols) || !Number.isFinite(next.layout.grid.rows))) next.layout.grid = undefined;
  if (next.layout.grid) {
    const cols = clamp(Number(next.layout.grid.cols || 0), 1, 6);
    const rows = clamp(Number(next.layout.grid.rows || 0), 1, 10);
    next.layout.grid = { cols, rows };
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

export function PreviewConfigPanel({
  value,
  onChange,
  onResetRequest,
}: {
  value: PreviewConfig;
  onChange: (next: PreviewConfig) => void;
  onResetRequest?: () => void;
}) {
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const t = window.setTimeout(() => {
      saveCurrent(value);
    }, 250);
    return () => window.clearTimeout(t);
  }, [value]);

  const paperMm = useMemo(() => {
    const { w, h } = presetSizeMm(value.paper.preset);
    const isLandscape = value.paper.orientation === "landscape";
    return isLandscape ? { w: h, h: w } : { w, h };
  }, [value.paper.orientation, value.paper.preset]);

  useEffect(() => {
    const m = value.paper.marginMm;
    const sumH = m.left + m.right;
    const sumV = m.top + m.bottom;
    if (sumH >= paperMm.w || sumV >= paperMm.h) {
      setError("边距之和不能大于等于纸张尺寸，请调小边距或调大纸张。");
    } else {
      setError("");
    }
  }, [paperMm.h, paperMm.w, value.paper.marginMm]);

  function patch(next: Partial<PreviewConfig>) {
    onChange({ ...value, ...next });
  }

  function patchPaper(next: Partial<PreviewConfig["paper"]>) {
    patch({ paper: { ...value.paper, ...next } });
  }

  function patchMargins(next: Partial<PreviewConfig["paper"]["marginMm"]>) {
    patchPaper({ marginMm: { ...value.paper.marginMm, ...next } });
  }

  function patchLayout(next: Partial<PreviewConfig["layout"]>) {
    patch({ layout: { ...value.layout, ...next } });
  }

  function patchSplit(next: Partial<PreviewConfig["splitLine"]>) {
    patch({ splitLine: { ...value.splitLine, ...next } });
  }

  function patchPunchHoles(next: Partial<PreviewConfig["punchHoles"]>) {
    patch({ punchHoles: { ...value.punchHoles, ...next } });
  }

  function patchBindingLine(next: Partial<PreviewConfig["bindingLine"]>) {
    patch({ bindingLine: { ...value.bindingLine, ...next } });
  }

  function applyPreset(p: PreviewPaperPreset) {
    const { w, h } = presetSizeMm(p);
    patchPaper({ preset: p, widthMm: w, heightMm: h });
  }

  const layoutChoice = useMemo(() => {
    if (isTrainGrid(value.layout)) return "train";
    return `n${value.layout.nUp}`;
  }, [value.layout]);

  function setLayoutChoice(key: string) {
    if (key === "train") {
      patchLayout({ nUp: 6, grid: { cols: 2, rows: 4 } });
      return;
    }
    const n = Number(key.slice(1));
    if ([1, 2, 3, 4, 6].includes(n)) patchLayout({ nUp: n as 1 | 2 | 3 | 4 | 6, grid: undefined });
  }

  function resetConfig() {
    if (onResetRequest) {
      onResetRequest();
    } else {
      onChange(defaultPreviewConfig());
    }
  }

  return (
    <div className="configRoot">
      <div className="configGrid">
        <div className="configSection">
          <div className="configSectionTitle">布局选项</div>
          <div className="layoutSegmented" role="radiogroup" aria-label="布局选项">
            {LAYOUT_OPTIONS.map((opt) => (
              <button
                type="button"
                key={opt.key}
                role="radio"
                aria-checked={layoutChoice === opt.key}
                className={`layoutSegmentItem ${layoutChoice === opt.key ? "layoutSegmentItemActive" : ""}`}
                onClick={() => setLayoutChoice(opt.key)}
              >
                <span className="layoutSegmentIcon" aria-hidden="true">
                  {opt.icon}
                </span>
                <span className="layoutSegmentLabel">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="configSection">
          <div className="configSectionTitle">纸张设置</div>
          <div className="paperFieldsRow">
            <label className="paperField">
              <span className="paperFieldLabel">尺寸</span>
              <select
                className="configSelect configSelectSm"
                value={value.paper.preset}
                onChange={(e) => applyPreset(e.target.value as PreviewPaperPreset)}
              >
                <option value="A4">A4</option>
                <option value="A5">A5</option>
                <option value="Letter">Letter</option>
              </select>
            </label>
            <label className="paperField">
              <span className="paperFieldLabel">方向</span>
              <select
                className="configSelect configSelectSm"
                value={value.paper.orientation}
                onChange={(e) => patchPaper({ orientation: e.target.value as PreviewConfig["paper"]["orientation"] })}
              >
                <option value="portrait">纵向</option>
                <option value="landscape">横向</option>
              </select>
            </label>
          </div>

          <div className="paperMarginsBlock">
            <div className="paperMarginsHead">
              <span className="paperFieldLabel">边距</span>
              <span className="paperMarginsUnit">mm</span>
            </div>
            <div className="paperMarginsGrid">
              {(
                [
                  { key: "top", label: "上" },
                  { key: "right", label: "右" },
                  { key: "bottom", label: "下" },
                  { key: "left", label: "左" },
                ] as const
              ).map(({ key, label }) => (
                <label className="paperMarginCell" key={key}>
                  <span className="paperMarginCellLabel">{label}</span>
                  <input
                    className="configNum configNumSm"
                    type="number"
                    value={value.paper.marginMm[key]}
                    min={0}
                    max={100}
                    onChange={(e) => patchMargins({ [key]: clamp(Number(e.target.value || 0), 0, 100) })}
                  />
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="configSection">
          <div className="configSectionHeader">
            <div className="configSectionTitle">其他选项</div>
            <button className="configResetIconBtn" type="button" onClick={resetConfig} title="重置配置">
              {ResetIcon}
              <span>重置</span>
            </button>
          </div>

          <div className="featureList">
            <div className="featureRow">
              <span className="featureRowLabel">合并预览</span>
              <label className="toggleSwitch">
                <input
                  type="checkbox"
                  checked={value.layout.mergePreview}
                  onChange={(e) => patchLayout({ mergePreview: e.target.checked })}
                />
                <span className="toggleSlider"></span>
              </label>
            </div>

            <div className="featureRow">
              <span className="featureRowLabel">裁剪线</span>
              <label className="toggleSwitch">
                <input
                  type="checkbox"
                  checked={value.splitLine.enabled}
                  onChange={(e) => patchSplit({ enabled: e.target.checked })}
                />
                <span className="toggleSlider"></span>
              </label>
            </div>

            <div className={`featureRow featureRowExpandable ${value.punchHoles.enabled ? "featureRowOpen" : ""}`}>
              <div className="featureRowMain">
                <span className="featureRowLabel">装订孔位</span>
                <label className="toggleSwitch">
                  <input
                    type="checkbox"
                    checked={value.punchHoles.enabled}
                    onChange={(e) => patchPunchHoles({ enabled: e.target.checked })}
                  />
                  <span className="toggleSlider"></span>
                </label>
              </div>
              {value.punchHoles.enabled && (
                <div className="featureRowControls">
                  <select
                    className="configSelect configSelectSm"
                    value={value.punchHoles.position}
                    onChange={(e) => patchPunchHoles({ position: e.target.value as "left" | "top" })}
                  >
                    <option value="left">左侧</option>
                    <option value="top">顶部</option>
                  </select>
                  <select
                    className="configSelect configSelectSm"
                    value={value.punchHoles.count}
                    onChange={(e) => patchPunchHoles({ count: Number(e.target.value) as 2 | 4 })}
                  >
                    <option value={2}>2孔</option>
                    <option value={4}>4孔</option>
                  </select>
                </div>
              )}
            </div>

            <div className={`featureRow featureRowExpandable ${value.bindingLine.enabled ? "featureRowOpen" : ""}`}>
              <div className="featureRowMain">
                <span className="featureRowLabel">装订线条</span>
                <label className="toggleSwitch">
                  <input
                    type="checkbox"
                    checked={value.bindingLine.enabled}
                    onChange={(e) => patchBindingLine({ enabled: e.target.checked })}
                  />
                  <span className="toggleSlider"></span>
                </label>
              </div>
              {value.bindingLine.enabled && (
                <div className="featureRowControls">
                  <select
                    className="configSelect configSelectSm"
                    value={value.bindingLine.position}
                    onChange={(e) => patchBindingLine({ position: e.target.value as "left" | "top" })}
                  >
                    <option value="left">左侧</option>
                    <option value="top">顶部</option>
                  </select>
                  <select
                    className="configSelect configSelectSm"
                    value={value.bindingLine.style}
                    onChange={(e) => patchBindingLine({ style: e.target.value as "dashed" | "solid" })}
                  >
                    <option value="dashed">虚线</option>
                    <option value="solid">实线</option>
                  </select>
                </div>
              )}
            </div>

          </div>

          {error ? <div className="configError">{error}</div> : null}
        </div>
      </div>
    </div>
  );
}

