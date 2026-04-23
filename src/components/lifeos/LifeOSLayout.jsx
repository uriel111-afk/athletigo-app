import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import LifeOSNav from './LifeOSNav';
import { LIFEOS_COLORS } from '@/lib/lifeos/lifeos-constants';

// Shell around every Life OS screen. Fixed top bar with back-to-hub,
// scrollable content area, fixed bottom nav. Uses inline styles to
// stay consistent with the rest of the app.
export default function LifeOSLayout({ title, children, rightSlot = null }) {
  const navigate = useNavigate();

  return (
    <div
      dir="rtl"
      style={{
        minHeight: '100dvh',
        backgroundColor: LIFEOS_COLORS.bg,
        fontFamily: "'Heebo', 'Assistant', sans-serif",
      }}
    >
      {/* Top bar */}
      <div
        className="safe-area-top"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          backgroundColor: '#FFFFFF',
          borderBottom: `0.5px solid ${LIFEOS_COLORS.border}`,
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <button
          onClick={() => navigate('/hub')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            background: 'transparent',
            border: 'none',
            padding: '6px 8px',
            borderRadius: 10,
            color: LIFEOS_COLORS.textPrimary,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <ChevronRight size={18} />
          <span>Hub</span>
        </button>

        <div
          style={{
            flex: 1,
            textAlign: 'center',
            fontSize: 16,
            fontWeight: 700,
            color: LIFEOS_COLORS.textPrimary,
          }}
        >
          {title}
        </div>

        <div style={{ minWidth: 60, display: 'flex', justifyContent: 'flex-end' }}>
          {rightSlot}
        </div>
      </div>

      {/* Content */}
      <div
        style={{
          padding: '16px 14px 100px',
          maxWidth: 560,
          margin: '0 auto',
        }}
      >
        {children}
      </div>

      <LifeOSNav />
    </div>
  );
}
