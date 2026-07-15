import { useState, useCallback } from "react";
import type { UseArchiveStateReturn } from "../hooks/useArchiveState";
import { CATEGORY_LABELS } from "../hooks/useArchiveState";
import { useStatistics, type TimeRange, type SellerInfo, type CategoryStat } from "../hooks/useStatistics";
import type { UseReimbursementReturn } from "../hooks/useReimbursement";
import type { SectionId } from "../components/Sidebar";
import type { InvoiceCategory, ArchiveFilterOptions } from "../types";
import type { ReimbursementStatus, ReimbursementType, ReimbursementFilter } from "../types/reimbursement";
import {
  monthToArchiveDateRange,
  timeRangeToArchiveDateRange,
  timeRangeToTimestampRange,
} from "../utils/statistics";
import "../archive.css";

const STATUS_LABELS: Record<ReimbursementStatus, string> = { draft: "草稿", pending_payment: "待支付", paid: "已支付" };
const STATUS_COLORS: Record<ReimbursementStatus, string> = { draft: "#64748b", pending_payment: "#facc15", paid: "#4ade80" };
const REIMB_TYPE_LABELS: Record<string, string> = { travel: "差旅费", transportation: "交通费", accommodation: "住宿费", office: "办公费", entertainment: "招待费", meal: "餐饮费", training: "培训费", communication: "通讯费", medical: "医疗费", other: "其他" };

type StatisticsPageProps = {
  archiveState: UseArchiveStateReturn;
  reimbursementState: UseReimbursementReturn;
  onNavigate?: (section: SectionId) => void;
};

export function StatisticsPage({ archiveState, reimbursementState, onNavigate }: StatisticsPageProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const { invoices } = archiveState;
  const stats = useStatistics(invoices, timeRange, reimbursementState.allReimbursements);
  const rs = stats.reimbursement;

  const drillToArchive = useCallback((filter: ArchiveFilterOptions) => {
    const scopedRange = timeRangeToArchiveDateRange(timeRange);
    archiveState.setFilter(scopedRange && !filter.dateRange ? { ...filter, dateRange: scopedRange } : filter);
    onNavigate?.("archive");
  }, [archiveState, onNavigate, timeRange]);

  const drillToReimbursement = useCallback((filter: ReimbursementFilter) => {
    const scopedRange = timeRangeToTimestampRange(timeRange);
    reimbursementState.setFilter(scopedRange && !filter.dateRange ? { ...filter, dateRange: scopedRange } : filter);
    onNavigate?.("reimbursement");
  }, [reimbursementState, onNavigate, timeRange]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 220px) minmax(0, 1fr)", gap: "12px", height: "100%" }}>

      <div className="panel" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div className="panelHeader">
          <div className="panelHeaderLeft">
            <div className="panelTitle">统计周期</div>
          </div>
        </div>
        <div className="folderTree" style={{ flex: 1, overflow: "auto" }}>
          <div className="folderSection">
            {([
              { value: "all", label: "全部时间" },
              { value: "year", label: "本年" },
              { value: "quarter", label: "本季度" },
              { value: "month", label: "本月" }
            ] as { value: TimeRange; label: string }[]).map(({ value, label }) => (
              <div
                key={value}
                className={`folderItem ${timeRange === value ? "folderItemActive" : ""}`}
                onClick={() => setTimeRange(value)}
              >
                <span className="folderName">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="tagList">
          <div className="tagListHeader">
            <div className="tagListHeaderLeft">
              <span className="tagListTitle">发票指标</span>
            </div>
          </div>
          <div className="tagListBody">
            <QuickMetric label="发票数" value={stats.count} unit="张" />
            <QuickMetric label="总金额" value={`¥${stats.total.toFixed(2)}`} />
            <QuickMetric label="总税额" value={`¥${stats.totalTax.toFixed(2)}`} />
            <QuickMetric label="已验真" value={stats.verifiedCount} unit="张" />
          </div>
        </div>

        <div className="tagList">
          <div className="tagListHeader">
            <div className="tagListHeaderLeft">
              <span className="tagListTitle">报销指标</span>
            </div>
          </div>
          <div className="tagListBody">
            <QuickMetric label="报销单" value={rs.count} unit="单" />
            <QuickMetric label="待支付" value={`¥${rs.pendingAmount.toFixed(2)}`} />
            <QuickMetric label="覆盖率" value={`${rs.coverageRate.toFixed(1)}%`} />
          </div>
        </div>
      </div>

      <div className="panel" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div className="panelHeader">
          <div className="panelHeaderLeft">
            <div className="panelTitle">统计分析</div>
          </div>
        </div>
        <div className="archiveListBody" style={{ flex: 1, overflow: "auto" }}>
          {stats.count === 0 && rs.count === 0 ? (
            <EmptyState />
          ) : (
            <>

              <SectionLabel text="发票概览" />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px", marginBottom: "20px" }}>
                <MetricCard label="发票总数" value={stats.count} unit="张" />
                <MetricCard label="总金额" value={`¥${stats.total.toFixed(2)}`} highlight />
                <MetricCard label="总税额" value={`¥${stats.totalTax.toFixed(2)}`} />
                <MetricCard label="平均金额" value={`¥${stats.avgAmount.toFixed(2)}`} />
                <MetricCard label="验真率" value={`${stats.count > 0 ? ((stats.verifiedCount / stats.count) * 100).toFixed(1) : 0}%`} />
              </div>

              <SectionLabel text="报销概览" />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px", marginBottom: "20px" }}>
                <MetricCard label="报销单数" value={rs.count} unit="单" />
                <MetricCard label="报销总额" value={`¥${rs.totalAmount.toFixed(2)}`} highlight />
                <MetricCard label="待支付" value={`¥${rs.pendingAmount.toFixed(2)}`} />
                <MetricCard label="报销覆盖率" value={`${rs.coverageRate.toFixed(1)}%`} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "12px", marginBottom: "20px" }}>
                <ChartCard title="月度趋势">
                  <MonthlyChart data={stats.byMonth} onMonthClick={(month) => drillToArchive({ dateRange: monthToArchiveDateRange(month) })} />
                </ChartCard>
                <ChartCard title="发票类型分布">
                  <CategoryList data={stats.byCategory} total={stats.total} onItemClick={(cat) => drillToArchive({ categories: [cat] })} />
                </ChartCard>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px", marginBottom: "20px" }}>
                <ChartCard title="销方排行 Top5">
                  <TopSellerList data={stats.topSellers} total={stats.total} onItemClick={(name) => drillToArchive({ sellerName: name })} />
                </ChartCard>
                <ChartCard title="报销状态分布">
                  <ReimbStatusChart data={rs.byStatus} total={rs.count} onItemClick={(status) => drillToReimbursement({ status: [status] })} />
                </ChartCard>
                <ChartCard title="报销类型分布">
                  <ReimbTypeList data={rs.byType} total={rs.totalAmount} onItemClick={(type) => drillToReimbursement({ type: [type as ReimbursementType] })} />
                </ChartCard>
              </div>

              <ChartCard title="发票类型明细">
                <CategoryTable data={stats.byCategory} total={stats.total} onRowClick={(cat) => drillToArchive({ categories: [cat] })} />
              </ChartCard>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function QuickMetric({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <div className="tagListItem" style={{ cursor: "default", padding: "8px 12px" }}>
      <span className="tagListItemName" style={{ fontSize: "12px", color: "var(--muted)" }}>{label}</span>
      <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>
        {value}{unit && <span style={{ fontSize: "11px", marginLeft: "2px" }}>{unit}</span>}
      </span>
    </div>
  );
}

function MetricCard({ label, value, unit, highlight }: { label: string; value: string | number; unit?: string; highlight?: boolean }) {
  return (
    <div className="invoiceCard" style={{ cursor: "default", padding: "16px" }}>
      <div style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "8px" }}>{label}</div>
      <div style={{ fontSize: "24px", fontWeight: 700, color: highlight ? "var(--primary)" : "var(--text)" }}>
        {value}{unit && <span style={{ fontSize: "12px", marginLeft: "4px", color: "var(--muted)" }}>{unit}</span>}
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="invoiceCard" style={{ cursor: "default", padding: "16px" }}>
      <div className="invoiceDetailSectionTitle" style={{ marginBottom: "16px" }}>{title}</div>
      {children}
    </div>
  );
}

function MonthlyChart({ data, onMonthClick }: { data: Record<string, { count: number; amount: number }>; onMonthClick?: (month: string) => void }) {

  const rawMonths = Object.keys(data).sort();
  if (rawMonths.length === 0) {
    return <div style={{ textAlign: "center", color: "var(--muted)", padding: "40px 0", fontSize: "13px" }}>暂无数据</div>;
  }

  const allMonths: string[] = [];
  if (rawMonths.length >= 2) {
    const [startY, startM] = rawMonths[0].split("-").map(Number);
    const [endY, endM] = rawMonths[rawMonths.length - 1].split("-").map(Number);
    let y = startY, m = startM;
    while (y < endY || (y === endY && m <= endM)) {
      allMonths.push(`${y}-${String(m).padStart(2, "0")}`);
      m++;
      if (m > 12) { m = 1; y++; }
    }
  } else {
    allMonths.push(...rawMonths);
  }
  const months = allMonths.slice(-12);
  const maxAmount = Math.max(...months.map(m => data[m]?.amount ?? 0), 1);

  const gridLines = [0.25, 0.5, 0.75, 1].map(r => ({
    ratio: r,
    label: `¥${(maxAmount * r) >= 1000 ? `${(maxAmount * r / 1000).toFixed(1)}k` : Math.round(maxAmount * r)}`,
  }));

  return (
    <div style={{ position: "relative", height: "180px", paddingLeft: "40px" }}>
      {                }
      {gridLines.map(({ ratio, label }) => (
        <div key={ratio} style={{ position: "absolute", left: 0, right: 0, bottom: `${ratio * 140 + 28}px` }}>
          <div style={{ position: "absolute", left: 0, width: "36px", fontSize: "9px", color: "var(--muted)", textAlign: "right", transform: "translateY(50%)" }}>{label}</div>
          <div style={{ marginLeft: "40px", borderTop: "1px solid var(--bar-track)" }} />
        </div>
      ))}

      <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", height: "140px", marginBottom: "4px" }}>
        {months.map((month) => {
          const { count = 0, amount = 0 } = data[month] || {};
          const height = amount > 0 ? (amount / maxAmount) * 100 : 2;
          const hasData = count > 0;
          return (
            <div key={month} style={{ flex: 1, display: "flex", alignItems: "flex-end", height: "100%" }}>
              <div
                onClick={hasData && onMonthClick ? () => onMonthClick(month) : undefined}
                style={{
                  width: "100%",
                  height: hasData ? `${Math.max(height, 2)}%` : "2px",
                  background: hasData
                    ? "linear-gradient(180deg, var(--primary), #4a8fff)"
                    : "var(--bar-track)",
                  borderRadius: "3px 3px 0 0",
                  transition: "height 0.3s ease",
                  cursor: hasData && onMonthClick ? "pointer" : "default",
                }}
                title={hasData ? `${month}: ${count}张, ¥${amount.toFixed(2)}（点击查看）` : `${month}: 无数据`}
              />
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: "4px" }}>
        {months.map((month) => (
          <div key={month} style={{ flex: 1, textAlign: "center", fontSize: "10px", color: "var(--muted)" }}>
            {month.substring(2, 4)}.{month.substring(5)}
          </div>
        ))}
      </div>
    </div>
  );
}

function CategoryList({ data, total, onItemClick }: { data: Record<InvoiceCategory, CategoryStat>; total: number; onItemClick?: (cat: InvoiceCategory) => void }) {
  const sorted = Object.entries(data)
    .filter(([, item]) => item.count > 0)
    .sort((a, b) => b[1].amount - a[1].amount || b[1].count - a[1].count)
    .slice(0, 5);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {sorted.map(([cat, { amount }]) => {
        const percent = total > 0 ? (amount / total) * 100 : 0;
        return (
          <div key={cat} onClick={() => onItemClick?.(cat as InvoiceCategory)} style={{ cursor: onItemClick ? "pointer" : "default" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", fontSize: "12px" }}>
              <span style={{ color: "var(--text)" }}>{CATEGORY_LABELS[cat as InvoiceCategory]}</span>
              <span style={{ color: "var(--primary)", fontWeight: 600 }}>{percent.toFixed(1)}%</span>
            </div>
            <div style={{ height: "4px", background: "var(--bar-track)", borderRadius: "2px", overflow: "hidden" }}>
              <div style={{ width: `${percent}%`, height: "100%", background: "var(--primary)", transition: "width 0.3s ease" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CategoryTable({ data, total, onRowClick }: { data: Record<InvoiceCategory, CategoryStat>; total: number; onRowClick?: (cat: InvoiceCategory) => void }) {
  const sorted = Object.entries(data)
    .filter(([, item]) => item.count > 0)
    .sort((a, b) => b[1].amount - a[1].amount || b[1].count - a[1].count);

  const colStyle = {
    count: { width: "60px", textAlign: "right" as const },
    money: { width: "100px", textAlign: "right" as const },
    moneySm: { width: "85px", textAlign: "right" as const },
    rateCount: { width: "90px", textAlign: "right" as const },
    percent: { width: "70px", textAlign: "right" as const },
  };

  return (
    <div className="invoiceList">
      <div className="invoiceListHeader">
        <span style={{ flex: 1, minWidth: "120px" }}>类型</span>
        <span style={colStyle.count}>张数</span>
        <span style={colStyle.money}>不含税</span>
        <span style={colStyle.moneySm}>税额</span>
        <span style={colStyle.money}>价税合计</span>
        <span style={colStyle.moneySm}>平均</span>
        <span style={colStyle.rateCount}>已验真</span>
        <span style={colStyle.rateCount}>已报销</span>
        <span style={colStyle.percent}>占比</span>
      </div>
      <div className="invoiceListBody">
        {sorted.map(([cat, stat]) => {
          const { count, amount, netAmount, taxAmount, verifiedCount, reimbursedCount } = stat;
          const percent = total > 0 ? (amount / total) * 100 : 0;
          const avg = count > 0 ? amount / count : 0;
          const verifiedPct = count > 0 ? (verifiedCount / count) * 100 : 0;
          const reimbursedPct = count > 0 ? (reimbursedCount / count) * 100 : 0;
          return (
            <div key={cat} className="invoiceListItem" style={{ cursor: onRowClick ? "pointer" : "default" }} onClick={() => onRowClick?.(cat as InvoiceCategory)}>
              <span style={{ flex: 1, minWidth: "120px", fontSize: "13px" }}>{CATEGORY_LABELS[cat as InvoiceCategory]}</span>
              <span style={{ ...colStyle.count, fontSize: "13px" }}>{count}</span>
              <span style={{ ...colStyle.money, fontSize: "13px", color: "var(--muted)" }}>¥{netAmount.toFixed(2)}</span>
              <span style={{ ...colStyle.moneySm, fontSize: "13px", color: "var(--muted)" }}>¥{taxAmount.toFixed(2)}</span>
              <span style={{ ...colStyle.money, fontSize: "13px", fontWeight: 600 }}>¥{amount.toFixed(2)}</span>
              <span style={{ ...colStyle.moneySm, fontSize: "13px", color: "var(--muted)" }}>¥{avg.toFixed(2)}</span>
              <span style={{ ...colStyle.rateCount, fontSize: "12px" }}>
                <span style={{ color: "var(--text)" }}>{verifiedCount}</span>
                <span style={{ color: "var(--muted)", marginLeft: "4px", fontSize: "11px" }}>{verifiedPct.toFixed(0)}%</span>
              </span>
              <span style={{ ...colStyle.rateCount, fontSize: "12px" }}>
                <span style={{ color: "var(--text)" }}>{reimbursedCount}</span>
                <span style={{ color: "var(--muted)", marginLeft: "4px", fontSize: "11px" }}>{reimbursedPct.toFixed(0)}%</span>
              </span>
              <span style={{ ...colStyle.percent, fontSize: "13px", color: "var(--primary)", fontWeight: 600 }}>{percent.toFixed(1)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", marginBottom: "8px", letterSpacing: "0.5px" }}>
      {text}
    </div>
  );
}

function ReimbStatusChart({ data, total, onItemClick }: { data: Record<ReimbursementStatus, { count: number; amount: number }>; total: number; onItemClick?: (status: ReimbursementStatus) => void }) {
  const statuses: ReimbursementStatus[] = ["paid", "pending_payment", "draft"];
  if (total === 0) {
    return <div style={{ textAlign: "center", color: "var(--muted)", padding: "40px 0", fontSize: "13px" }}>暂无数据</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {statuses.map((status) => {
        const { count, amount } = data[status];
        const percent = total > 0 ? (count / total) * 100 : 0;
        return (
          <div key={status} onClick={() => onItemClick?.(status)} style={{ cursor: onItemClick ? "pointer" : "default" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontSize: "12px" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: STATUS_COLORS[status], display: "inline-block" }} />
                <span style={{ color: "var(--text)" }}>{STATUS_LABELS[status]}</span>
              </span>
              <span style={{ color: "var(--muted)", fontSize: "11px" }}>{count}单 · ¥{amount.toFixed(2)}</span>
            </div>
            <div style={{ height: "6px", background: "var(--bar-track)", borderRadius: "3px", overflow: "hidden" }}>
              <div style={{ width: `${percent}%`, height: "100%", background: STATUS_COLORS[status], transition: "width 0.3s ease", borderRadius: "3px" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TopSellerList({ data, total: _total, onItemClick }: { data: SellerInfo[]; total: number; onItemClick?: (name: string) => void }) {
  if (data.length === 0) {
    return <div style={{ textAlign: "center", color: "var(--muted)", padding: "40px 0", fontSize: "13px" }}>暂无数据</div>;
  }
  const maxAmount = data[0]?.amount || 1;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {data.map(({ name, count, amount }, i) => {
        const barWidth = (amount / maxAmount) * 100;
        return (
          <div key={name} onClick={() => onItemClick?.(name)} style={{ cursor: onItemClick ? "pointer" : "default" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", fontSize: "12px" }}>
              <span style={{ color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "60%" }} title={name}>
                <span style={{ color: "var(--muted)", marginRight: "4px", fontSize: "10px" }}>{i + 1}.</span>{name}
              </span>
              <span style={{ color: "var(--muted)", fontSize: "11px", flexShrink: 0 }}>{count}张 · ¥{amount.toFixed(2)}</span>
            </div>
            <div style={{ height: "4px", background: "var(--bar-track)", borderRadius: "2px", overflow: "hidden" }}>
              <div style={{ width: `${barWidth}%`, height: "100%", background: "linear-gradient(90deg, var(--primary), #4a8fff)", transition: "width 0.3s ease" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ReimbTypeList({ data, total, onItemClick }: { data: Record<string, { count: number; amount: number }>; total: number; onItemClick?: (type: string) => void }) {
  const sorted = Object.entries(data)
    .filter(([, item]) => item.count > 0)
    .sort((a, b) => b[1].amount - a[1].amount || b[1].count - a[1].count)
    .slice(0, 5);
  if (sorted.length === 0) {
    return <div style={{ textAlign: "center", color: "var(--muted)", padding: "40px 0", fontSize: "13px" }}>暂无数据</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {sorted.map(([type, { count: _count, amount }]) => {
        const percent = total > 0 ? (amount / total) * 100 : 0;
        return (
          <div key={type} onClick={() => onItemClick?.(type)} style={{ cursor: onItemClick ? "pointer" : "default" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", fontSize: "12px" }}>
              <span style={{ color: "var(--text)" }}>{REIMB_TYPE_LABELS[type] || type}</span>
              <span style={{ color: "var(--primary)", fontWeight: 600 }}>{percent.toFixed(1)}%</span>
            </div>
            <div style={{ height: "4px", background: "var(--bar-track)", borderRadius: "2px", overflow: "hidden" }}>
              <div style={{ width: `${percent}%`, height: "100%", background: "var(--primary)", transition: "width 0.3s ease" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="invoiceListEmpty">
      <div className="invoiceListEmptyIcon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      </div>
      <div className="invoiceListEmptyText">暂无统计数据</div>
      <div className="invoiceListEmptyHint">请先在发票管理中添加发票</div>
    </div>
  );
}
