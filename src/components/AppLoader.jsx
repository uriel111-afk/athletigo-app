import React from "react";

export default function AppLoader({ progress = 0, label = "טוען נתונים..." }) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center z-[9999]" dir="rtl"
      style={{ backgroundColor: '#FDF8F3' }}>
      <div className="text-center w-64">
        <h1 className="text-2xl font-black tracking-[0.2em] mb-6"
          style={{ color: '#FF6F20', fontFamily: 'Barlow, sans-serif' }}>
          ATHLETIGO
        </h1>

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
