import "../archive.css";

const FEATURES = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
    title: "多格式识别",
    desc: "支持 PDF / OFD / 图片",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
        <line x1="8" y1="11" x2="14" y2="11" />
        <line x1="11" y1="8" x2="11" y2="14" />
      </svg>
    ),
    title: "智能 OCR",
    desc: "自动识别与信息提取",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
      </svg>
    ),
    title: "合并打印",
    desc: "N-up 多票合并排版打印",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
    ),
    title: "归档管理",
    desc: "文件夹分类与发票管理",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
        <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
        <path d="M9 14l2 2 4-4" />
      </svg>
    ),
    title: "报销管理",
    desc: "报销单创建与审批流程",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
    title: "发票验真",
    desc: "在线查验发票真伪",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
    title: "统计分析",
    desc: "可视化图表与数据洞察",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
    ),
    title: "导出中心",
    desc: "发票明细与报销汇总导出",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
      </svg>
    ),
    title: "多主题切换",
    desc: "7 套深浅主题自由选择",
  },
];

export function AboutPage() {

  return (
    <div
      className="panel"
      data-testid="about-page"
      style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}
    >
      <div className="panelHeader">
        <div className="panelHeaderLeft">
          <div className="panelTitle">关于</div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto", display: "flex", justifyContent: "center" }}>
        <div style={{ maxWidth: "680px", width: "100%", padding: "40px 24px 48px" }}>

          {          }
          <div style={{ textAlign: "center", marginBottom: "40px" }}>
            <div style={{
              width: "64px", height: "64px", margin: "0 auto 16px",
              borderRadius: "16px",
              background: "linear-gradient(135deg, var(--primary), rgba(106,166,255,0.6))",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 8px 24px rgba(106,166,255,0.25)",
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </div>
            <div style={{ fontSize: "22px", fontWeight: 700, color: "var(--text)", marginBottom: "6px" }}>
              发票管家
            </div>
            <div style={{
              display: "inline-block",
              padding: "3px 14px",
              borderRadius: "999px",
              background: "rgba(106,166,255,0.12)",
              color: "var(--primary)",
              fontSize: "12px",
              fontWeight: 600,
              letterSpacing: "0.5px",
              marginBottom: "12px",
            }}>
              V1.0.3
            </div>
            <div style={{ fontSize: "13px", color: "var(--muted)", lineHeight: 1.6 }}>
              一站式发票管理工具
              <br />
              识别 · 归档 · 报销 · 统计 · 验真 · 导出
            </div>
          </div>

          {                  }
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "12px",
            marginBottom: "36px",
          }}>
            {FEATURES.map((f, i) => (
              <div
                key={i}
                className="invoiceCard"
                style={{
                  cursor: "default",
                  padding: "16px 14px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  transition: "border-color 200ms ease, box-shadow 200ms ease",
                }}
              >
                <div style={{ color: "var(--primary)", lineHeight: 0 }}>
                  {f.icon}
                </div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>
                  {f.title}
                </div>
                <div style={{ fontSize: "11px", color: "var(--muted)", lineHeight: 1.5 }}>
                  {f.desc}
                </div>
              </div>
            ))}
          </div>


        </div>
      </div>
    </div>
  );
}
