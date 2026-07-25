import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutGrid, X } from 'lucide-react';
import { PERSONAL_COLORS } from '@/lib/personal/personal-constants';

// The /personal sections sheet — a header icon that replaces the removed
// PersonalNav bottom bar. Holds the bar's four tabs plus the two items that
// were behind its own "עוד" button, so every /personal screen stays
// reachable from every other one. Kept separate from LifeOSMoreMenu (☰ in
// the AppSwitcher row) because these are personal-app routes, not Life OS
// ones — hence the distinct grid icon.
const SECTIONS = [
  { to: '/personal',        emoji: '🏠', label: 'בית' },
  { to: '/personal/week',   emoji: '📅', label: 'שבוע' },
  { to: '/personal/habits', emoji: '✅', label: 'הרגלים' },
  { to: '/personal/people', emoji: '👥', label: 'קשרים' },
  { to: '/personal/growth', emoji: '🎯', label: 'התפתחות' },
  { to: '/personal/home',   emoji: '🍳', label: 'משק בית' },
];

export default function PersonalMoreMenu() {
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const isActive = (to) =>
    to === '/personal'
      ? location.pathname === '/personal'
      : location.pathname === to || location.pathname.startsWith(to + '/');

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        aria-label="מסכים אישיים"
        style={{
          background: 'transparent', border: 'none', padding: 6,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
          color: open ? PERSONAL_COLORS.primary : PERSONAL_COLORS.textSecondary,
        }}
      >
        {open ? <X size={20} /> : <LayoutGrid size={20} />}
      </button>

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1060 }}
          />
          {/* Bottom sheet — anchored at 0; no nav bar sits below it anymore. */}
          <div style={{
            position: 'fixed', left: 0, right: 0, bottom: 0,
            zIndex: 1061,
            backgroundColor: '#FFFFFF',
            borderTopLeftRadius: 18,
            borderTopRightRadius: 18,
            boxShadow: '0 -4px 20px rgba(0,0,0,0.12)',
            padding: '16px 12px',
            paddingBottom: 'max(env(safe-area-inset-bottom), 16px)',
            direction: 'rtl',
          }}>
            <div style={{
              fontSize: 14, fontWeight: 700,
              color: PERSONAL_COLORS.textPrimary,
              padding: '4px 8px 12px',
            }}>
              מסכים
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {SECTIONS.map(item => {
                const active = isActive(item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setOpen(false)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 6,
                      padding: '14px 6px',
                      borderRadius: 12,
                      textDecoration: 'none',
                      backgroundColor: active ? PERSONAL_COLORS.primaryLight : '#F7F3EC',
                      border: active ? `1px solid ${PERSONAL_COLORS.primary}` : '1px solid transparent',
                    }}
                  >
                    <span style={{ fontSize: 26, lineHeight: 1 }}>{item.emoji}</span>
                    <span style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: active ? PERSONAL_COLORS.primary : PERSONAL_COLORS.textPrimary,
                    }}>
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}
