import React, { useEffect, useState } from "react";

const LOGO_MAIN = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69131bbfcdbb9bf74bf68119/f4582ad21_Untitleddesign1.png";

export default function SplashScreen({ onComplete }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      if (onComplete) onComplete();
    }, 2000);

    return () => clearTimeout(timer);
  }, [onComplete]);

  if (!visible) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: '#FFFFFF' }}
    >
      <div className="text-center">
        <img 
          src={LOGO_MAIN} 
          alt="AthletiGo" 
          className="splash-logo mx-auto mb-6"
          style={{ width: '280px', height: 'auto' }}
        />
        <div className="athletigo-spinner mx-auto"></div>
      </div>
    </div>
  );
}