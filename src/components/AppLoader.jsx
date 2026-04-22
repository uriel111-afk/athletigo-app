import React from "react";

export default function AppLoader({ progress = 0, label = "טוען נתונים..." }) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center z-[9999]" dir="rtl"
      style={{ backgroundColor: '#FDF8F3' }}>
      <style>{`
        @keyframes athletigo-loader-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.7; transform: scale(0.95); }
        }
      `}</style>
      <div className="text-center w-64">
        <img
          src="/icon-192.png"
          alt="AthletiGo"
          style={{
            width: 96,
            height: 96,
            objectFit: 'contain',
            display: 'block',
            margin: '0 auto 20px',
            animation: 'athletigo-loader-pulse 1.5s ease-in-out infinite',
          }}
        />

        {/* Progress bar */}
        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden mb-3">
          <div className="h-full rounded-full transition-all duration-300 ease-out"
            style={{ width: `${progress}%`, backgroundColor: '#FF6F20' }} />
        </div>

        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-bold text-gray-400">{label}</p>
          <p className="text-xs font-black text-[#FF6F20]">{progress}%</p>
        </div>
      </div>
    </div>
  );
}
