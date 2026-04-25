import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import PersonalNav from './PersonalNav';
import AppSwitcher from '@/components/lifeos/AppSwitcher';
import GlobalSearch from '@/components/lifeos/GlobalSearch';
import { PERSONAL_COLORS } from '@/lib/personal/personal-constants';

export default function PersonalLayout({ title, children, rightSlot = null }) {
  const navigate = useNavigate();

  return (
    <div
      dir="rtl"
      style={{
        minHeight: '100dvh',
        backgroundColor: PERSONAL_COLORS.bg,
        fontFamily: "'Heebo', 'Assistant', sans-serif",
      }}
    >
      <AppSwitcher />

      {/* Top bar */}
      <div
        className="safe-area-top"
        style={{
          position: 'sticky', top: 0, zIndex: 100,
          backgroundColor: '#FFFFFF',
          borderBottom: `0.5px solid ${PERSONAL_COLORS.border}`,
          padding: '10px 14px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <button
          onClick={() => navigate('/hub')}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: 'transparent', border: 'none',
            padding: '6px 8px', borderRadius: 10,
            color: PERSONAL_COLORS.textPrimary,
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <ChevronRight size={18} />
          <span>Hub</span>
        </button>
        <div style={{
          flex: 1, textAlign: 'center',
          fontSize: 16, fontWeight: 700, color: PERSONAL_COLORS.textPrimary,
        }}>
          {title}
        </div>
        <div style={{ minWidth: 60, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4 }}>
          {rightSlot}
          <GlobalSearch iconColor={PERSONAL_COLORS.textSecondary} />
        </div>
      </div>

      <div style={{ padding: '16px 14px 100px', maxWidth: 560, margin: '0 auto' }}>
        {children}
      </div>

      <PersonalNav />
    </div>
  );
}
