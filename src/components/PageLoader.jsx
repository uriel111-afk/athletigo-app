import React from "react";

/**
 * Unified loading indicator — same triangle logo + pulse everywhere.
 * Pages pass default (80px). The app-level loader in Layout uses 120px.
 */
export default function PageLoader({ size = 80, fullHeight = false }) {
  return (
    <div
      dir="rtl"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: fullHeight ? "100vh" : "60vh",
        width: "100%",
      }}
    >
      <img
        src="/logo-transparent.png"
        alt=""
        style={{
          width: size,
          height: size,
          objectFit: "contain",
          animation: "athletigo-page-loader-pulse 1.5s ease-in-out infinite",
        }}
      />
      <style>{`
        @keyframes athletigo-page-loader-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.6; transform: scale(0.95); }
        }
      `}</style>
    </div>
  );
}
