import React from "react";

export default function AppLoader() {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center" dir="rtl"
      style={{ backgroundColor: '#FDF8F3' }}>
      <div className="text-center">
        <h1 className="text-2xl font-black tracking-[0.2em] mb-2"
          style={{ color: '#FF6F20', fontFamily: 'Barlow, sans-serif' }}>
          ATHLETIGO
        </h1>
        <div className="flex justify-center mb-4">
          <div className="w-8 h-8 border-3 border-gray-200 rounded-full animate-spin"
            style={{ borderTopColor: '#FF6F20', borderWidth: '3px' }} />
        </div>
        <p className="text-sm font-bold text-gray-400">טוען נתונים...</p>
      </div>
    </div>
  );
}
