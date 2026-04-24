import React from "react";

// Unified first-paint loader — same design as index.html's boot loader
// and PageLoader. No progress bar, no "טוען..." text — just the
// triangle logo + ATHLETIGO wordmark with a soft pulse.
// `progress` and `label` props are accepted for backward compatibility
// but ignored on purpose (the visual is intentionally minimal).
// eslint-disable-next-line no-unused-vars
export default function AppLoader({ progress, label }) {
  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center z-[9999]"
      dir="rtl"
      style={{ backgroundColor: "#FFF9F0" }}
    >
      <style>{`
        @keyframes athletigo-app-loader-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.6; transform: scale(0.95); }
        }
      `}</style>
      <img
        src="/logo-transparent.png"
        alt=""
        style={{
          width: 120,
          height: 120,
          objectFit: "contain",
          animation: "athletigo-app-loader-pulse 1.5s ease-in-out infinite",
        }}
      />
      <img
        src="/athletigo-text.png"
        alt="ATHLETIGO"
        style={{
          height: 22,
          objectFit: "contain",
          marginTop: 8,
        }}
      />
    </div>
  );
}
