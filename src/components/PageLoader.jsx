import React from "react";

// Unified page-level loading screen. Every page-scope loading state
// in the app (Layout boot, ProtectedCoachPage gate, individual
// page-level data hydration) routes through this — same brand
// treatment as the boot splash in index.html and AppLoader.
//
// Visual:
//   - cream #FDF8F3 background (transparent when used inline so it
//     doesn't fight a parent's bg)
//   - solid-black logoR via filter:brightness(0)
//   - indeterminate orange progress bar that loops, on a beige rail
//
// Inline button spinners (Loader2 in save buttons etc.) are NOT
// page-level loaders and intentionally stay as-is — full-screen
// splash treatment for a save-click would be terrible UX.
export default function PageLoader({ size = 80, fullHeight = false, message = "" }) {
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
          width: size,
          height: "auto",
          objectFit: "contain",
          filter: "brightness(0)",
          marginBottom: 24,
        }}
        onError={(e) => { e.currentTarget.style.display = "none"; }}
      />

      <div style={{
        width: 200, height: 3,
        background: "#F0E4D0",
        borderRadius: 2,
        overflow: "hidden",
        position: "relative",
      }}>
        <div style={{
          position: "absolute", top: 0, height: "100%",
          background: "#FF6F20",
          borderRadius: 2,
          animation: "athletigo-loading-bar 1.5s ease-in-out infinite",
        }} />
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

      <style>{`
        @keyframes athletigo-loading-bar {
          0%   { left: 0;    width: 20%; }
          50%  { left: 20%;  width: 60%; }
          100% { left: 80%;  width: 20%; }
        }
      `}</style>
    </div>
  );
}
