import React from "react";

// In-app loader — visually identical to the boot splash defined in
// index.html, so the hand-off from the static splash to React's
// auth/data hydration is seamless. Single logo + progress bar on
// the cream brand background. No text wordmark, no pulsing logo
// (those competed with the new boot splash).
//
// `progress` (0-100) drives the orange fill width; `label` is
// accepted for backward compatibility but rendered as a small
// muted line below the bar when present.
export default function AppLoader({ progress, label }) {
  const pct = Math.max(0, Math.min(100, Number(progress) || 0));
  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: '#FDF8F3',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        zIndex: 9999,
        fontFamily: "'Barlow', 'Heebo', 'Assistant', sans-serif",
      }}
      dir="rtl"
    >
      <img
        src="/logoR.png"
        alt="AthletiGo"
        style={{
          width: 100, height: 'auto', objectFit: 'contain',
          marginBottom: 24,
        }}
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />
      <div style={{
        width: 200, height: 3,
        background: '#F0E4D0', borderRadius: 2,
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: '#FF6F20',
          borderRadius: 2,
          transition: 'width 0.3s ease',
        }} />
      </div>
      {label && (
        <div style={{
          fontSize: 12, color: '#888',
          marginTop: 12, textAlign: 'center',
        }}>{label}</div>
      )}
    </div>
  );
}
