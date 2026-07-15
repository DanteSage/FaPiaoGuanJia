import type { Reimbursement } from "../types/reimbursement";

export type TimeRange = "month" | "quarter" | "year" | "all";

export type ParsedInvoiceDate = {
  year: number;
  month: number;
  day: number;
  key: string;
  timestamp: number;
};

export type TimeRangeBounds = {
  start: Date;
  end: Date;
  startMs: number;
  endMs: number;
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function buildParsedDate(year: number, month: number, day: number): ParsedInvoiceDate | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  date.setHours(0, 0, 0, 0);
  return {
    year,
    month,
    day,
    key: `${year}-${pad2(month)}-${pad2(day)}`,
    timestamp: date.getTime(),
  };
}

export function parseInvoiceDate(dateStr?: string | null): ParsedInvoiceDate | null {
  const raw = typeof dateStr === "string" ? dateStr.trim() : "";
  if (!raw) return null;

  const compactMatch = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactMatch) {
    return buildParsedDate(Number(compactMatch[1]), Number(compactMatch[2]), Number(compactMatch[3]));
  }

  const separatedMatch = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (separatedMatch) {
    return buildParsedDate(Number(separatedMatch[1]), Number(separatedMatch[2]), Number(separatedMatch[3]));
  }

  const cnMatch = raw.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);
  if (cnMatch) {
    return buildParsedDate(Number(cnMatch[1]), Number(cnMatch[2]), Number(cnMatch[3]));
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return buildParsedDate(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
  }

  return null;
}

export function normalizeInvoiceDate(dateStr?: string | null): string {
  return parseInvoiceDate(dateStr)?.key ?? "";
}

export function toFiniteAmount(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const cleaned = value.trim().replace(/[,，￥¥\s]/g, "");
  if (!cleaned) return 0;
  const direct = Number(cleaned);
  if (Number.isFinite(direct)) return direct;
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getTimeRangeBounds(timeRange: TimeRange, now: Date = new Date()): TimeRangeBounds | null {
  if (timeRange === "all") return null;

  const year = now.getFullYear();
  const month = now.getMonth();
  let start: Date;
  let end: Date;

  if (timeRange === "month") {
    start = new Date(year, month, 1);
    end = new Date(year, month + 1, 1);
  } else if (timeRange === "quarter") {
    const quarterStartMonth = Math.floor(month / 3) * 3;
    start = new Date(year, quarterStartMonth, 1);
    end = new Date(year, quarterStartMonth + 3, 1);
  } else {
    start = new Date(year, 0, 1);
    end = new Date(year + 1, 0, 1);
  }

  start.setHours(0, 0, 0, 0);
  const endMs = end.getTime() - 1;
  return {
    start,
    end: new Date(endMs),
    startMs: start.getTime(),
    endMs,
  };
}

export function isParsedInvoiceDateInBounds(parsed: ParsedInvoiceDate, bounds: TimeRangeBounds | null): boolean {
  if (!bounds) return true;
  return parsed.timestamp >= bounds.startMs && parsed.timestamp <= bounds.endMs;
}

export function isTimestampInBounds(timestamp: number | null | undefined, bounds: TimeRangeBounds | null): boolean {
  if (!bounds) return true;
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) return false;
  return timestamp >= bounds.startMs && timestamp <= bounds.endMs;
}

function firstFiniteTimestamp(...values: Array<number | undefined>): number {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  }
  return 0;
}

export function getReimbursementStatTimestamp(reimbursement: Reimbursement): number {
  if (reimbursement.status === "paid") {
    return firstFiniteTimestamp(
      reimbursement.paidAt,
      reimbursement.approvedAt,
      reimbursement.submittedAt,
      reimbursement.createdAt,
      reimbursement.updatedAt
    );
  }
  if (reimbursement.status === "pending_payment") {
    return firstFiniteTimestamp(
      reimbursement.submittedAt,
      reimbursement.approvedAt,
      reimbursement.createdAt,
      reimbursement.updatedAt
    );
  }
  return firstFiniteTimestamp(reimbursement.createdAt, reimbursement.updatedAt);
}

export function timestampMonthKey(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

export function timeRangeToArchiveDateRange(
  timeRange: TimeRange,
  now: Date = new Date()
): { start: string; end: string } | undefined {
  const bounds = getTimeRangeBounds(timeRange, now);
  if (!bounds) return undefined;
  return {
    start: `${bounds.start.getFullYear()}-${pad2(bounds.start.getMonth() + 1)}-${pad2(bounds.start.getDate())}`,
    end: `${bounds.end.getFullYear()}-${pad2(bounds.end.getMonth() + 1)}-${pad2(bounds.end.getDate())}`,
  };
}

export function timeRangeToTimestampRange(
  timeRange: TimeRange,
  now: Date = new Date()
): { start: number; end: number } | undefined {
  const bounds = getTimeRangeBounds(timeRange, now);
  if (!bounds) return undefined;
  return { start: bounds.startMs, end: bounds.endMs };
}

export function monthToArchiveDateRange(month: string): { start: string; end: string } {
  const [year, monthNumber] = month.split("-").map(Number);
  const start = `${year}-${pad2(monthNumber)}-01`;
  const lastDay = new Date(year, monthNumber, 0).getDate();
  const end = `${year}-${pad2(monthNumber)}-${pad2(lastDay)}`;
  return { start, end };
}
