export function clampPreviewPage(pageIndex: number, pageCount: number): number {
  const normalizedPageIndex = Number.isFinite(pageIndex) ? Math.round(pageIndex) : 1;
  const safePageIndex = Math.max(1, normalizedPageIndex);
  if (!Number.isFinite(pageCount) || pageCount < 1) {
    return safePageIndex;
  }
  return Math.min(pageCount, safePageIndex);
}

export function getAdjacentPreviewPages(pageIndex: number, pageCount: number): number[] {
  const currentPage = clampPreviewPage(pageIndex, pageCount);
  const candidates = [currentPage - 1, currentPage + 1];
  return candidates.filter((candidate) => candidate >= 1 && candidate <= pageCount);
}

export function isOfdFilePath(filePath: string): boolean {
  return filePath.trim().toLowerCase().endsWith(".ofd");
}

export function getDocumentKindLabel(filePath: string): "OFD" | "PDF" {
  return isOfdFilePath(filePath) ? "OFD" : "PDF";
}
