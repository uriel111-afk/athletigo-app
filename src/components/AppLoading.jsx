import React, { useEffect, useState } from "react";

// Full-screen loading splash — same brand treatment as the boot
// splash in index.html, AppLoader (auth/data hydration), and
// PageLoader fullHeight. Drop this into any page that needs a
// 100vh "the app is working" screen.
//
// Visual: cream #FDF8F3 bg, solid-black logoR via filter:brightness(0),
// 200×3 progress bar staged 0 → 30 → 60 → 85 with a numeric percent
// line beneath, matching the boot-splash choreography. No wordmark,
// no spinner, no caption.
export default function AppLoading() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const t1 = setTimeout(() => setProgress(30), 100);
    const t2 = setTimeout(() => setProgress(60), 400);
    const t3 = setTimeout(() => setProgress(85), 800);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

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
          width: 110,
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
    </div>
  );
}
