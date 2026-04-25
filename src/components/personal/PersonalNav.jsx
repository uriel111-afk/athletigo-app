import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { PERSONAL_COLORS } from '@/lib/personal/personal-constants';

const TABS = [
  { to: '/personal',         emoji: '🏠', label: 'בית' },
  { to: '/personal/week',    emoji: '📅', label: 'שבוע' },
  { to: '/personal/habits',  emoji: '✅', label: 'הרגלים' },
  { to: '/personal/people',  emoji: '👥', label: 'קשרים' },
];

const MORE_LINKS = [
  { to: '/personal/growth', emoji: '🎯', label: 'התפתחות' },
  { to: '/personal/home',   emoji: '🍳', label: 'משק בית' },
];

export default function PersonalNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);

  const isActive = (to) =>
    to === '/personal'
      ? location.pathname === '/personal'
      : location.pathname === to || location.pathname.startsWith(to + '/');

  const moreActive = MORE_LINKS.some(l => isActive(l.to));

  return (
    <>
      {/* Sheet over the page */}
      {moreOpen && (
        <div
          onClick={() => setMoreOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1049,
            backgroundColor: 'rgba(0,0,0,0.4)',
          }}
        />
      )}
      {moreOpen && (
        <div
          dir="rtl"
          style={{
            position: 'fixed', left: 12, right: 12, bottom: 90,
            zIndex: 1051,
            backgroundColor: '#FFFFFF',
            borderRadius: 14,
            border: `1px solid ${PERSONAL_COLORS.border}`,
            boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
            padding: 8,
          }}
        >
          {MORE_LINKS.map(l => (
            <button
              key={l.to}
              onClick={() => { setMoreOpen(false); navigate(l.to); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                width: '100%', textAlign: 'right',
                padding: '12px 14px', borderRadius: 10,
                border: 'none', backgroundColor: 'transparent',
                cursor: 'pointer',
                color: PERSONAL_COLORS.textPrimary,
                fontSize: 14, fontWeight: 700,
                fontFamily: "'Heebo', 'Assistant', sans-serif",
              }}
            >
              <span style={{ fontSize: 22 }}>{l.emoji}</span>
              <span>{l.label}</span>
            </button>
          ))}
        </div>
      )}

      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        zIndex: 1050,
        backgroundColor: '#FFFFFF',
        borderTop: `0.5px solid ${PERSONAL_COLORS.border}`,
        boxShadow: '0 -2px 10px rgba(0,0,0,0.04)',
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        padding: '10px 8px 18px',
        direction: 'rtl',
      }}>
        {TABS.map(t => {
          const active = isActive(t.to);
          return (
            <Link key={t.to} to={t.to} style={tabLink}>
              <span style={tabEmoji}>{t.emoji}</span>
              <span style={tabLabel(active)}>{t.label}</span>
            </Link>
          );
        })}
        <button
          onClick={() => setMoreOpen(v => !v)}
          style={{ ...tabLink, border: 'none', background: 'transparent', cursor: 'pointer' }}
          aria-label="עוד"
        >
          <span style={tabEmoji}>🎯</span>
          <span style={tabLabel(moreActive || moreOpen)}>עוד</span>
        </button>
      </div>
    </>
  );
}

const tabLink = {
  display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center', gap: 2,
  minWidth: 56, textDecoration: 'none',
};

const tabEmoji = {
  fontSize: 26, lineHeight: 1, height: 32,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const tabLabel = (active) => ({
  fontSize: 12, marginTop: 3,
  color: active ? PERSONAL_COLORS.primary : PERSONAL_COLORS.textSecondary,
  fontWeight: active ? 700 : 500,
});
