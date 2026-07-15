
const LONG_NUMERIC = /^\d{12,}$/;

function escapeField(value: string): string {

  if (LONG_NUMERIC.test(value)) {
    return `="${value}"`;
  }
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCsv(headers: string[], rows: string[][]): string {
  const BOM = "\uFEFF";
  const headerLine = headers.map(escapeField).join(",");
  const dataLines = rows.map((row) => row.map(escapeField).join(","));
  return BOM + [headerLine, ...dataLines].join("\r\n");
}

export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
