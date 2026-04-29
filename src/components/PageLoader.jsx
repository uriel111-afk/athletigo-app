import React, { useEffect, useState } from "react";
import { useWindowSize } from "@/hooks/useWindowSize";

// Unified page-level loading screen. Every page-scope loading state
// in the app (Layout boot, ProtectedCoachPage gate, individual
// page-level data hydration) routes through this — same brand
// treatment as the boot splash in index.html and AppLoader.
//
// Visual:
//   - cream #FDF8F3 background (transparent when used inline so it
//     doesn't fight a parent's bg)
//   - solid-black logoR via filter:brightness(0) at 50% opacity —
//     reads as a watermark behind the activity, not a logo wall
//   - logo defaults to 160 mobile / 200 desktop (callers can still
//     pass `size` to override for niche use)
//   - staged 0 → 30 → 60 → 85 progress bar (matches boot splash)
//   - numeric percent line under the bar
//
// Inline button spinners (Loader2 in save buttons etc.) are NOT
// page-level loaders and intentionally stay as-is — full-screen
// splash treatment for a save-click would be terrible UX.
export default function PageLoader({ size, fullHeight = false, message = "" }) {
  const [progress, setProgress] = useState(0);
  const { width } = useWindowSize();
  // Responsive default — only applied when the caller didn't
  // pass an explicit `size` (Layout.jsx still passes 120, etc).
  const resolvedSize = typeof size === 'number' ? size : (width < 480 ? 160 : 200);

  useEffect(() => {
    const t1 = setTimeout(() => setProgress(30), 100);
    const t2 = setTimeout(() => setProgress(60), 400);
    const t3 = setTimeout(() => setProgress(85), 800);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  return (
    <div
      dir="rtl"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: fullHeight ? "100vh" : "60vh",
        width: "100%",
        background: fullHeight ? "#FDF8F3" : "transparent",
        gap: 0,
      }}
    >
      <img
        src="/logoR.png"
        alt=""
        style={{
          width: resolvedSize,
          height: "auto",
          objectFit: "contain",
          filter: "brightness(0)",
          opacity: 0.5,
          marginBottom: 24,
        }}
        onError={(e) => { e.currentTarget.style.display = "none"; }}
      />

      <div style={{
        width: 200, height: 3,
        background: "#F0E4D0",
        borderRadius: 2,
        overflow: "hidden",
      }}>
        <div style={{
          height: "100%",
          width: `${progress}%`,
          background: "#FF6F20",
          borderRadius: 2,
          transition: "width 0.3s ease",
        }} />
      </div>

      <div style={{
        marginTop: 8, fontSize: 13, color: "#888", textAlign: "center",
      }}>
        {progress}%
      </div>

      {message && (
        <div style={{
          fontSize: 13, color: "#888",
          marginTop: 16,
          fontFamily: "'Heebo', 'Assistant', sans-serif",
        }}>
          {message}
        </div>
      )}
    </div>
  );
}
