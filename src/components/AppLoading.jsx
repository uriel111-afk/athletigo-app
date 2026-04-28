import React from "react";

// Full-screen loading splash — same brand treatment as the boot
// splash in index.html, AppLoader (auth/data hydration), and
// PageLoader fullHeight. Drop this into any page that needs a
// 100vh "the app is working" screen.
//
// Visual: cream #FDF8F3 bg, solid-black logoR via filter:brightness(0),
// 200×3 progress bar with an indeterminate orange strip looping
// 0% → 50% → 100% over 1.5s. No wordmark, no spinner, no caption.
export default function AppLoading() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        width: "100%",
        background: "#FDF8F3",
      }}
    >
      <img
        src="/logoR.png"
        alt="AthletiGo"
        style={{
          width: 80,
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
