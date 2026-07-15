import { describe, expect, it } from "vitest";
import {
  clampPreviewPage,
  getAdjacentPreviewPages,
  getDocumentKindLabel,
  isOfdFilePath,
} from "../../utils/documentPreview";

describe("clampPreviewPage", () => {
  it("clamps page index into the available range", () => {
    expect(clampPreviewPage(0, 5)).toBe(1);
    expect(clampPreviewPage(3, 5)).toBe(3);
    expect(clampPreviewPage(8, 5)).toBe(5);
  });

  it("falls back to at least page 1 when page count is unknown", () => {
    expect(clampPreviewPage(Number.NaN, 0)).toBe(1);
    expect(clampPreviewPage(4, 0)).toBe(4);
  });
});

describe("getAdjacentPreviewPages", () => {
  it("returns both neighbors for middle pages", () => {
    expect(getAdjacentPreviewPages(3, 5)).toEqual([2, 4]);
  });

  it("skips out-of-range pages at the edges", () => {
    expect(getAdjacentPreviewPages(1, 5)).toEqual([2]);
    expect(getAdjacentPreviewPages(5, 5)).toEqual([4]);
  });
});

describe("document preview file helpers", () => {
  it("detects ofd paths case-insensitively", () => {
    expect(isOfdFilePath("C:/demo/test.OFD")).toBe(true);
    expect(isOfdFilePath("C:/demo/test.pdf")).toBe(false);
  });

  it("maps file paths to display labels", () => {
    expect(getDocumentKindLabel("C:/demo/test.ofd")).toBe("OFD");
    expect(getDocumentKindLabel("C:/demo/test.pdf")).toBe("PDF");
  });
});
