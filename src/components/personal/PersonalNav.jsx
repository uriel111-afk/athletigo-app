import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { PERSONAL_COLORS } from '@/lib/personal/personal-constants';

const TABS = [
  { to: '/personal',          emoji: '🏠', label: 'בית' },
  { to: '/personal/habits',   emoji: '✅', label: 'הרגלים' },
  { to: '/personal/people',   emoji: '👥', label: 'קשרים' },
  { to: '/personal/growth',   emoji: '🎯', label: 'התפתחות' },
  { to: '/personal/home',     emoji: '🍳', label: 'משק בית' },
];

export default function PersonalNav() {
  const location = useLocation();
  const isActive = (to) =>
    to === '/personal' ? location.pathname === '/personal'
                       : location.pathname === to || location.pathname.startsWith(to + '/');
  return (
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
          <Link key={t.to} to={t.to} style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 2,
            minWidth: 56, textDecoration: 'none',
          }}>
            <span style={{
              fontSize: 26, lineHeight: 1, height: 32,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{t.emoji}</span>
            <span style={{
              fontSize: 12, marginTop: 3,
              color: active ? PERSONAL_COLORS.primary : PERSONAL_COLORS.textSecondary,
              fontWeight: active ? 700 : 500,
            }}>{t.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
