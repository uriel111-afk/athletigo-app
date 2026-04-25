import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LIFEOS_COLORS } from '@/lib/lifeos/lifeos-constants';

// Bottom navigation for Life OS screens. Five primary tabs; the last
// one is a "more" sheet that exposes the secondary screens.
const PRIMARY_TABS = [
  { to: '/lifeos',          emoji: '🏠', label: 'בית' },
  { to: '/lifeos/expenses', emoji: '💸', label: 'הוצאות' },
  { to: '/lifeos/plan',     emoji: '🎯', label: 'תוכנית' },
  { to: '/lifeos/momentum', emoji: '🚀', label: 'מומנטום' },
];

const MORE_ITEMS = [
  { to: '/lifeos/income',        emoji: '💰', label: 'הכנסות' },
  { to: '/lifeos/recurring',     emoji: '🔁', label: 'הוצאות קבועות' },
  { to: '/lifeos/installments',  emoji: '📊', label: 'תשלומי פס' },
  { to: '/lifeos/cashflow',      emoji: '📈', label: 'תזרים מזומנים' },
  { to: '/lifeos/leads',         emoji: '👥', label: 'לידים' },
  { to: '/lifeos/content',       emoji: '🎬', label: 'לוח תוכן' },
  { to: '/lifeos/community',     emoji: '📣', label: 'קהילה' },
  { to: '/lifeos/documents',     emoji: '📁', label: 'מסמכים' },
  { to: '/lifeos/settings',      emoji: '⚙️', label: 'הגדרות' },
];

export default function LifeOSNav() {
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  const isActive = (to) => {
    if (to === '/lifeos') return location.pathname === '/lifeos';
    return location.pathname === to || location.pathname.startsWith(to + '/');
  };

  return (
    <>
      {/* "More" sheet */}
      {moreOpen && (
        <>
          <div
            onClick={() => setMoreOpen(false)}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(0,0,0,0.4)',
              zIndex: 1060,
            }}
          />
          <div style={{
            position: 'fixed', left: 0, right: 0, bottom: 80,
            zIndex: 1061,
            backgroundColor: '#FFFFFF',
            borderTopLeftRadius: 18,
            borderTopRightRadius: 18,
            boxShadow: '0 -4px 20px rgba(0,0,0,0.12)',
            padding: '16px 12px',
            direction: 'rtl',
          }}>
            <div style={{
              fontSize: 14, fontWeight: 700,
              color: LIFEOS_COLORS.textPrimary,
              padding: '4px 8px 12px',
            }}>
              עוד
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 8,
            }}>
              {MORE_ITEMS.map(item => {
                const active = isActive(item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setMoreOpen(false)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 6,
                      padding: '14px 6px',
                      borderRadius: 12,
                      textDecoration: 'none',
                      backgroundColor: active ? LIFEOS_COLORS.primaryLight : '#F7F3EC',
                      border: active ? `1px solid ${LIFEOS_COLORS.primary}` : '1px solid transparent',
                    }}
                  >
                    <span style={{ fontSize: 26, lineHeight: 1 }}>{item.emoji}</span>
                    <span style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: active ? LIFEOS_COLORS.primary : LIFEOS_COLORS.textPrimary,
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

      {/* Bottom nav bar */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        zIndex: 1050,
        backgroundColor: '#FFFFFF',
        borderTop: `0.5px solid ${LIFEOS_COLORS.border}`,
        boxShadow: '0 -2px 10px rgba(0,0,0,0.04)',
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        padding: '10px 8px 18px',
        direction: 'rtl',
      }}>
        {PRIMARY_TABS.map(item => {
          const active = isActive(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                minWidth: 56,
                textDecoration: 'none',
              }}
            >
              <span style={{ fontSize: 26, lineHeight: 1, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {item.emoji}
              </span>
              <span style={{
                fontSize: 12, marginTop: 3,
                color: active ? LIFEOS_COLORS.primary : LIFEOS_COLORS.textSecondary,
                fontWeight: active ? 700 : 500,
              }}>
                {item.label}
              </span>
            </Link>
          );
        })}
        {/* "More" button */}
        <button
          onClick={() => setMoreOpen(v => !v)}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            minWidth: 56,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          <span style={{ fontSize: 26, lineHeight: 1, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {moreOpen ? '✕' : '☰'}
          </span>
          <span style={{
            fontSize: 12, marginTop: 3,
            color: moreOpen ? LIFEOS_COLORS.primary : LIFEOS_COLORS.textSecondary,
            fontWeight: moreOpen ? 700 : 500,
          }}>
            עוד
          </span>
        </button>
      </div>
    </>
  );
}
