import React, { useState, useEffect } from "react";

// App-wide loader. Visually identical to the boot splash in
// index.html — same bg, logo size + opacity, bar, percent text, and
// message — so the swap when React takes over is invisible. Renders
// as a full-viewport overlay so it covers transient page content
// during route transitions or auth handshakes.
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
        background: "#FFFFFF",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 99998,
        fontFamily: "'Rubik', system-ui, sans-serif",
        direction: "rtl",
        padding: 20,
        // Extra bottom padding pulls the vertically-centered cluster
        // upward so the logo sits ~40% from the top instead of dead
        // center (50%).
        paddingBottom: "18vh",
      }}
    >
      <img
        src="/logoR-black.png"
        alt="AthletiGo"
        style={{
          width: 208,
          maxWidth: "60vw",
          height: "auto",
          opacity: 0.5,
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
            background: "var(--ag-accent)",
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
          color: "var(--ag-text-soft)",
          textAlign: "center",
        }}
      >
        {message}
      </div>
    </div>
  );
}
