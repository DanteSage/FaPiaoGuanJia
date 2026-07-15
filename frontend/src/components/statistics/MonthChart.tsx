export function MonthChart({ data }: { data: Record<string, { count: number; amount: number }> }) {
  const months = Object.keys(data).sort();
  const maxAmount = Math.max(...Object.values(data).map(d => d.amount), 1);

  if (months.length === 0) {
    return <div style={{ textAlign: "center", color: "var(--muted)", padding: "40px" }}>暂无数据</div>;
  }

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "12px", height: "200px" }}>
      {months.map((month) => {
        const { count, amount } = data[month];
        const height = (amount / maxAmount) * 100;

        return (
          <div key={month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ flex: 1, display: "flex", alignItems: "flex-end", width: "100%" }}>
              <div
                style={{
                  width: "100%",
                  height: `${height}%`,
                  background: "linear-gradient(180deg, var(--primary), #4a8fff)",
                  borderRadius: "4px 4px 0 0",
                  transition: "height 0.3s ease",
                  minHeight: "4px"
                }}
                title={`${month}: ${count}张, ¥${amount.toFixed(2)}`}
              />
            </div>
            <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "8px" }}>
              {month.substring(5)}月
            </div>
          </div>
        );
      })}
    </div>
  );
}
