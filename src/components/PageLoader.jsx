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
  // Default 90px to match the boot splash in index.html exactly.
  // Callers that need a larger logo (Layout.jsx → 120, etc) still
  // pass `size` explicitly and override.
  // eslint-disable-next-line no-unused-vars
  const _w = width; // kept for callers that may rely on responsive sizing later
  const resolvedSize = typeof size === 'number' ? size : 90;

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
        background: fullHeight ? "#FFF9F0" : "transparent",
        fontFamily: "'Barlow', 'Heebo', 'Assistant', system-ui, sans-serif",
        gap: 0,
      }}
    >
      {/* Pulse keyframes injected once — kept inline so the loader
          renders correctly even before any Tailwind/PostCSS layer is
          ready (e.g. test environments, error boundaries). */}
      <style>{`
        @keyframes athletigo-loader-pulse {
          0%, 100% { transform: scale(1);    opacity: 1;   }
          50%      { transform: scale(1.05); opacity: 0.8; }
        }
      `}</style>
      <img
        src="/logo-transparent.png"
        alt=""
        style={{
          width: resolvedSize,
          height: "auto",
          objectFit: "contain",
          marginBottom: 20,
          animation: "athletigo-loader-pulse 1.5s ease-in-out infinite",
        }}
        onError={(e) => {
          // Fallback to the silhouette logo if logo-transparent isn't
          // there on legacy installs.
          if (e.currentTarget.src.endsWith('/logo-transparent.png')) {
            e.currentTarget.src = '/logoR.png';
            return;
          }
          e.currentTarget.style.display = "none";
        }}
      />

      <div style={{
        fontFamily: "'Barlow Condensed', 'Barlow', 'Heebo', system-ui, sans-serif",
        fontSize: 22, fontWeight: 800, letterSpacing: 2,
        color: '#1a1a1a', marginBottom: 24,
      }}>
        ATHLETIGO
      </div>

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
        marginTop: 8, fontSize: 11, fontWeight: 600, color: "#888", textAlign: "center",
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
