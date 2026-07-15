import React, { useEffect, useMemo, useState } from "react";

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function OcrText({ text, query }: { text: string; query?: string }) {
  const [q, setQ] = useState<string>("");
  useEffect(() => {
    if (typeof query === "string") setQ(query);
  }, [query]);
  const parts = useMemo(() => {
    const query = q.trim();
    if (!query) return [text];
    try {
      const re = new RegExp(escapeRegExp(query), "gi");
      const out: Array<string | { m: string }> = [];
      let last = 0;
      for (const match of text.matchAll(re)) {
        const idx = match.index ?? -1;
        if (idx < 0) continue;
        if (idx > last) out.push(text.slice(last, idx));
        out.push({ m: text.slice(idx, idx + match[0].length) });
        last = idx + match[0].length;
      }
      if (last < text.length) out.push(text.slice(last));
      return out.length ? out : [text];
    } catch {
      return [text];
    }
  }, [q, text]);

  return (
    <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
      <input
        className="searchInput"
        placeholder="在原文中搜索"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="ocrText" style={{ overflow: "auto", minHeight: 0 }}>
        {parts.map((p, i) =>
          typeof p === "string" ? (
            <React.Fragment key={i}>{p}</React.Fragment>
          ) : (
            <mark key={i} style={{ background: "rgba(106,166,255,0.35)", color: "rgba(255,255,255,0.95)" }}>
              {p.m}
            </mark>
          )
        )}
      </div>
    </div>
  );
}
