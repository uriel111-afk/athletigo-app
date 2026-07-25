import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { LIFEOS_COLORS } from '@/lib/lifeos/lifeos-constants';
import VersionStamp from '@/components/lifeos/VersionStamp';

// The "עוד" menu — a header icon that opens the secondary-screens sheet.
// This used to be the last tab of the bottom nav (LifeOSNav); the bottom
// bar was removed as redundant with the AppSwitcher pill row, so the sheet
// moved up into the top bar's icon cluster and absorbed the three primary
// tabs the bar owned (בית / מומנטום / הוצאות) so no screen is stranded.
const MORE_ITEMS = [
  { to: '/lifeos/dashboard',         emoji: '🏠', label: 'בית' },
  { to: '/lifeos/momentum',          emoji: '🚀', label: 'מומנטום' },
  { to: '/lifeos/expenses',          emoji: '💸', label: 'הוצאות' },
  { to: '/lifeos/finance-dashboard', emoji: '📊', label: 'פיננסי' },
  { to: '/lifeos/income',            emoji: '💰', label: 'הכנסות' },
  { to: '/lifeos/recurring',         emoji: '🔁', label: 'הוצאות קבועות' },
  { to: '/lifeos/installments',      emoji: '💳', label: 'תשלומי פס' },
  { to: '/lifeos/cashflow',          emoji: '📈', label: 'תזרים מזומנים' },
  { to: '/lifeos/leads',             emoji: '👥', label: 'לידים' },
  { to: '/lifeos/content',           emoji: '🎬', label: 'לוח תוכן' },
  { to: '/lifeos/community',         emoji: '📣', label: 'קהילה' },
  { to: '/lifeos/documents',         emoji: '📁', label: 'מסמכים' },
  { to: '/lifeos/settings',          emoji: '⚙️', label: 'הגדרות' },
];

export default function LifeOSMoreMenu() {
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const isActive = (to) =>
    location.pathname === to || location.pathname.startsWith(to + '/');

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        aria-label="עוד"
        style={{
          background: 'transparent', border: 'none', padding: 6,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: open ? LIFEOS_COLORS.primary : LIFEOS_COLORS.textSecondary,
        }}
      >
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1060 }}
          />
          {/* Bottom sheet — anchored at 0 now that no nav bar sits below it. */}
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
              color: LIFEOS_COLORS.textPrimary,
              padding: '4px 8px 12px',
            }}>
              עוד
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {MORE_ITEMS.map(item => {
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
            <VersionStamp style={{ marginTop: 14, paddingBottom: 2 }} />
          </div>
        </>
      )}
    </>
  );
}
