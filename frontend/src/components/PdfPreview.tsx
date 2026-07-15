import React from "react";
import type { PreviewConfig } from "../types";
import { DocumentPreview } from "./DocumentPreview";

export function PdfPreview({ filePath, previewConfig }: { filePath: string; previewConfig?: PreviewConfig }) {
  return <DocumentPreview filePath={filePath} previewConfig={previewConfig} />;
}
