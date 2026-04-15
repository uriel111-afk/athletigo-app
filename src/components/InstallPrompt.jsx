import React, { useState } from "react";
import { X } from "lucide-react";

export default function InstallPrompt({ onDismiss }) {
  const [show, setShow] = useState(true);

  if (!show) return null;

  const dismiss = () => {
    localStorage.setItem('install_prompt_shown', 'true');
    setShow(false);
    if (onDismiss) onDismiss();
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden">
        {/* Header */}
        <div className="p-5 pb-3 flex justify-between items-start">
          <div>
            <h2 className="text-xl font-black text-gray-900">הורד את האפליקציה</h2>
            <p className="text-sm text-gray-500 mt-1">גישה מהירה בלחיצה אחת מהמסך הבית שלך</p>
          </div>
          <button onClick={dismiss} className="p-1 rounded-full hover:bg-gray-100 text-gray-400 flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Instructions */}
        <div className="px-5 pb-4 space-y-3">
          {/* iPhone */}
          <div className="bg-gray-50 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-lg">🍎</span>
              <span className="font-bold text-sm text-gray-900">אייפון (Safari)</span>
            </div>
            <div className="text-xs text-gray-600 leading-relaxed space-y-0.5">
              <p>1. לחץ על כפתור השיתוף <span className="inline-block bg-gray-200 rounded px-1.5 py-0.5 font-mono text-[10px]">⬆</span> בתחתית המסך</p>
              <p>2. גלול למטה ובחר <strong>"הוסף למסך הבית"</strong></p>
              <p>3. לחץ <strong>"הוסף"</strong> בפינה הימנית העליונה</p>
            </div>
          </div>

          {/* Android */}
          <div className="bg-gray-50 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-lg">🤖</span>
              <span className="font-bold text-sm text-gray-900">אנדרואיד (Chrome)</span>
            </div>
            <div className="text-xs text-gray-600 leading-relaxed space-y-0.5">
              <p>1. לחץ על תפריט <span className="inline-block bg-gray-200 rounded px-1.5 py-0.5 font-mono text-[10px]">⋮</span> (3 נקודות) בפינה העליונה</p>
              <p>2. בחר <strong>"הוסף למסך הבית"</strong> או <strong>"התקן אפליקציה"</strong></p>
              <p>3. לחץ <strong>"התקן"</strong></p>
            </div>
          </div>
        </div>

        {/* Dismiss button */}
        <div className="px-5 pb-5">
          <button onClick={dismiss}
            className="w-full py-3 rounded-xl font-bold text-white text-base active:scale-[0.98] transition-transform"
            style={{ backgroundColor: '#FF6F20' }}>
            הבנתי, תודה!
          </button>
        </div>
      </div>
    </div>
  );
}
