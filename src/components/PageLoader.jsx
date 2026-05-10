import React, { useState, useEffect } from "react";

// Unified app-wide loading screen. Renders as a full-viewport overlay
// (`position: fixed; inset: 0`) so the design is identical whether
// it's gating page-level data hydration, the auth handshake, or the
// boot splash itself. Three visual layers, in order:
//
//   1. ATHLETIGO black wordmark logo (logoR-black.png), 240px
//   2. 260×3px progress bar — orange #FF6F20 on cream #F5E6D3
//   3. Two text rows — percent (15px #999) + per-page message
//
// Per-page callers pass a Hebrew `message` prop ("טוען דשבורד" /
// "טוען פרופיל מתאמן" / "מתחבר..." etc). The default "טוען..." is
// also what the index.html boot splash shows, so the transition
// between the pre-React splash and the React-mounted PageLoader is
// visually seamless.
//
// Inline tab-internal loading (e.g. accordion sections inside
// PackageDetailsDialog) does NOT route through this — those callers
// use the smaller <InlineLoader/> component, which renders as a
// regular flex block and doesn't cover the host dialog.
export default function PageLoader({ message = "טוען..." }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 95) return p;
        return p + Math.random() * 8;
      });
    }, 250);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#FFF9F0",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 99998,
        fontFamily: "'Barlow', system-ui, sans-serif",
        direction: "rtl",
        padding: 20,
      }}
    >
      <img
        src="/logoR-black.png"
        alt="AthletiGo"
        style={{
          width: 240,
          maxWidth: "70vw",
          height: "auto",
          marginBottom: 40,
        }}
        onError={(e) => { e.currentTarget.style.display = "none"; }}
      />

      <div
        style={{
          width: 260,
          maxWidth: "75vw",
          height: 3,
          background: "#F5E6D3",
          borderRadius: 2,
          overflow: "hidden",
          marginBottom: 14,
        }}
      >
        <div
          style={{
            height: "100%",
            background: "#FF6F20",
            borderRadius: 2,
            width: `${Math.min(progress, 100)}%`,
            transition: "width 0.3s ease",
          }}
        />
      </div>

      <div
        style={{
          fontSize: 15,
          fontWeight: 500,
          color: "#999",
          marginBottom: 18,
        }}
      >
        {Math.round(Math.min(progress, 100))}%
      </div>

      <div
        style={{
          fontSize: 15,
          fontWeight: 400,
          color: "#888",
          textAlign: "center",
        }}
      >
        {message}
      </div>
    </div>
  );
}
