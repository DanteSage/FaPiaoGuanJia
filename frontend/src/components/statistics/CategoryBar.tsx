export function CategoryBar({ label, count, amount, total }: {
  label: string;
  count: number;
  amount: number;
  total: number
}) {
  const percent = total > 0 ? (amount / total) * 100 : 0;

  return (
    <div style={{ marginBottom: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontSize: "13px" }}>
        <span style={{ color: "var(--text)" }}>{label}</span>
        <span style={{ color: "var(--muted)" }}>{count}张 · ¥{amount.toFixed(2)}</span>
      </div>
      <div style={{ height: "6px", background: "rgba(255,255,255,0.08)", borderRadius: "3px", overflow: "hidden" }}>
        <div style={{
          height: "100%",
          width: `${percent}%`,
          background: "linear-gradient(90deg, var(--primary), #4a8fff)",
          transition: "width 0.3s ease"
        }} />
      </div>
    </div>
  );
}
