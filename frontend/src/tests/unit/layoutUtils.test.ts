import { describe, it, expect } from "vitest";
import {
  classify,
  basename,
  newId,
  calcLayoutGrid,
  calcMergePages,
  calcExportDimensions,
} from "../../utils/layoutUtils";
import type { PreviewConfig } from "../../types";

describe("classify", () => {
  it("detects pdf", () => {
    expect(classify("C:\\docs\\invoice.pdf")).toEqual({ ext: "pdf", type: "pdf" });
  });

  it("detects ofd", () => {
    expect(classify("/home/user/file.OFD")).toEqual({ ext: "ofd", type: "ofd" });
  });

  it("detects xml", () => {
    expect(classify("data.xml")).toEqual({ ext: "xml", type: "xml" });
  });

  it("detects image extensions", () => {
    for (const ext of ["png", "jpg", "jpeg", "bmp", "webp", "tif", "tiff"]) {
      expect(classify(`photo.${ext}`).type).toBe("image");
    }
  });

  it("returns unknown for unsupported extension", () => {
    expect(classify("file.zip")).toEqual({ ext: "zip", type: "unknown" });
  });

  it("returns unknown for no extension", () => {
    expect(classify("noextfile")).toEqual({ ext: "", type: "unknown" });
  });
});

describe("basename", () => {
  it("extracts filename from Windows path", () => {
    expect(basename("C:\\Users\\docs\\invoice.pdf")).toBe("invoice.pdf");
  });

  it("extracts filename from Unix path", () => {
    expect(basename("/home/user/file.ofd")).toBe("file.ofd");
  });

  it("returns the string itself if no path separator", () => {
    expect(basename("file.txt")).toBe("file.txt");
  });
});

describe("newId", () => {
  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => newId()));
    expect(ids.size).toBe(100);
  });

  it("returns a string", () => {
    expect(typeof newId()).toBe("string");
  });
});

describe("calcLayoutGrid", () => {
  it("2-up portrait: 1 col, 2 rows", () => {
    expect(calcLayoutGrid(2, false)).toEqual({ cols: 1, rows: 2 });
  });

  it("4-up portrait: 2 cols, 2 rows", () => {
    expect(calcLayoutGrid(4, false)).toEqual({ cols: 2, rows: 2 });
  });

  it("6-up landscape: 3 cols, 2 rows", () => {
    expect(calcLayoutGrid(6, true)).toEqual({ cols: 3, rows: 2 });
  });

  it("6-up portrait: 2 cols, 3 rows", () => {
    expect(calcLayoutGrid(6, false)).toEqual({ cols: 2, rows: 3 });
  });

  it("respects forced grid", () => {
    expect(calcLayoutGrid(2, false, { cols: 3, rows: 4 })).toEqual({ cols: 3, rows: 4 });
  });
});

describe("calcMergePages", () => {
  const baseConfig: PreviewConfig = {
    version: 1,
    layout: { nUp: 2, showPaper: true, showMargins: true, paperShadow: true, mergePreview: true },
    paper: {
      preset: "A4",
      widthMm: 210,
      heightMm: 297,
      orientation: "portrait",
      marginMm: { top: 12, right: 12, bottom: 12, left: 12 },
    },
    splitLine: { enabled: false, axis: "horizontal", positionPct: 50, style: "dashed", thicknessPx: 1, opacity: 0.55 },
    punchHoles: { enabled: false, position: "left", count: 2 },
    bindingLine: { enabled: false, position: "left", style: "dashed" },
  };

  it("returns 1 page for 0 files", () => {
    expect(calcMergePages(0, baseConfig)).toBe(1);
  });

  it("returns 1 page for 2 files with 2-up", () => {
    expect(calcMergePages(2, baseConfig)).toBe(1);
  });

  it("returns 2 pages for 3 files with 2-up", () => {
    expect(calcMergePages(3, baseConfig)).toBe(2);
  });

  it("handles 4-up", () => {
    const config4 = { ...baseConfig, layout: { ...baseConfig.layout, nUp: 4 as const } };
    expect(calcMergePages(8, config4)).toBe(2);
    expect(calcMergePages(9, config4)).toBe(3);
  });
});

describe("calcExportDimensions", () => {
  const baseConfig: PreviewConfig = {
    version: 1,
    layout: { nUp: 2, showPaper: true, showMargins: true, paperShadow: true, mergePreview: true },
    paper: {
      preset: "A4",
      widthMm: 210,
      heightMm: 297,
      orientation: "portrait",
      marginMm: { top: 10, right: 10, bottom: 10, left: 10 },
    },
    splitLine: { enabled: false, axis: "horizontal", positionPct: 50, style: "dashed", thicknessPx: 1, opacity: 0.55 },
    punchHoles: { enabled: false, position: "left", count: 2 },
    bindingLine: { enabled: false, position: "left", style: "dashed" },
  };

  it("portrait A4 dimensions are correct", () => {
    const dims = calcExportDimensions(baseConfig);
    expect(dims.paperWMm).toBe(210);
    expect(dims.paperHMm).toBe(297);
    expect(dims.cols).toBe(1);
    expect(dims.rows).toBe(2);
    expect(dims.perPage).toBe(2);
  });

  it("landscape swaps dimensions", () => {
    const landscape = {
      ...baseConfig,
      paper: { ...baseConfig.paper, orientation: "landscape" as const },
    };
    const dims = calcExportDimensions(landscape);
    expect(dims.paperWMm).toBe(297);
    expect(dims.paperHMm).toBe(210);
  });

  it("export scale is 300/25.4", () => {
    const dims = calcExportDimensions(baseConfig);
    expect(dims.exportScale).toBeCloseTo(300 / 25.4);
  });
});
