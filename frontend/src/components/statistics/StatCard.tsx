export function StatCard({ title, value, unit }: { title: string; value: string | number; unit: string }) {
  return (
    <div style={{
      background: "var(--panel)",
      borderRadius: "12px",
      padding: "20px",
      border: "1px solid var(--line)"
    }}>
      <div style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "8px" }}>{title}</div>
      <div style={{ fontSize: "28px", fontWeight: 600, color: "var(--text)" }}>
        {value} <span style={{ fontSize: "14px", fontWeight: 400, color: "var(--muted)" }}>{unit}</span>
      </div>
    </div>
  );
}
