import React from "react";

// ── Inline first-fetch skeleton ────────────────────────────────────
// Replaces the full-viewport PageLoader overlay on data screens. It
// renders INSIDE the page's normal content flow (not fixed), so the
// app chrome — header + bottom nav — stays put and navigation feels
// instant. Cached revisits skip this entirely: the TanStack query
// serves data with isLoading=false, so this only shows on a genuine
// first fetch, exactly where the cards will appear.
//
// Matches the Lumen surface (white card + hairline over the cream bg)
// and uses Tailwind's animate-pulse for a soft shimmer.
export default function PageSkeleton({ rows = 5, header = true }) {
  return (
    <div dir="rtl" style={{ padding: "16px 14px", display: "flex", flexDirection: "column", gap: 14 }}>
      {header && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 4 }}>
          <div className="animate-pulse" style={{ width: "45%", height: 22, borderRadius: 8, background: "rgba(120,90,60,0.12)" }} />
          <div className="animate-pulse" style={{ width: "72%", height: 12, borderRadius: 6, background: "rgba(120,90,60,0.08)" }} />
        </div>
      )}
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse"
          style={{
            background: "var(--ag-surface, #ffffff)",
            border: "1px solid var(--ag-line, #F0E4D0)",
            borderRadius: 16,
            padding: 14,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(120,90,60,0.10)", flexShrink: 0 }} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ width: "55%", height: 13, borderRadius: 7, background: "rgba(120,90,60,0.12)" }} />
            <div style={{ width: "35%", height: 11, borderRadius: 6, background: "rgba(120,90,60,0.08)" }} />
          </div>
        </div>
      ))}
    </div>
  );
}
