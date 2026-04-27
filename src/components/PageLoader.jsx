import React from "react";

// Unified loading indicator — same brand mark + cream background as
// the boot splash in index.html and AppLoader. Keeps the API stable
// for every consumer (just <PageLoader /> or <PageLoader fullHeight />)
// so we don't have to touch the dozens of pages that use it.
//
// Visual: solid-black logoR via filter:brightness(0) on the brand
// cream, with a soft pulse so the user sees motion. No competing
// pulsing-triangle / wordmark assets — the splash is the single
// source of truth for the brand treatment.
export default function PageLoader({ size = 80, fullHeight = false, message = "" }) {
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
        background: fullHeight ? "#FDF8F3" : "transparent",
        gap: 12,
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
          animation: "athletigo-page-loader-pulse 1.5s ease-in-out infinite",
        }}
        onError={(e) => { e.currentTarget.style.display = "none"; }}
      />
      {message && (
        <div style={{
          fontSize: 13, color: "#888",
          fontFamily: "'Heebo', 'Assistant', sans-serif",
        }}>
          {message}
        </div>
      )}
      <style>{`
        @keyframes athletigo-page-loader-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.6; transform: scale(0.95); }
        }
      `}</style>
    </div>
  );
}
