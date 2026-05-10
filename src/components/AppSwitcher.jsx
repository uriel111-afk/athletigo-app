import React, { useContext } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '@/lib/AuthContext';
import { COACH_USER_ID } from '@/lib/lifeos/lifeos-constants';

// Four-pill switcher between the coach's apps:
//   מקצועי (/dashboard)    — clients & training
//   פיננסי (/lifeos/leads)  — leads & sales pipeline
//   צמיחה  (/lifeos)        — content / strategy
//   אישי   (/personal)      — habits, journaling
//
// Only renders for the Life OS coach. Anyone else sees nothing — the
// regular app flow is unchanged.
//
// Visual spec (May 2026): cream pill on inactive, solid orange on
// active, NO border. Replaces the previous orange-outlined chips.
export default function AppSwitcher() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();

  if (!user || user.id !== COACH_USER_ID) return null;

  const path = location.pathname;
  const activeKey =
    path.startsWith('/personal')                                                  ? 'personal'
    : path.startsWith('/lifeos/leads') || path.startsWith('/lifeos/content') ||
      path.startsWith('/lifeos/community')                                         ? 'finance'
    : path.startsWith('/lifeos')                                                   ? 'growth'
    : 'pro';

  const apps = [
    { key: 'pro',      label: 'מקצועי', to: '/dashboard'    },
    { key: 'finance',  label: 'פיננסי', to: '/lifeos/leads' },
    { key: 'growth',   label: 'צמיחה',  to: '/lifeos'       },
    { key: 'personal', label: 'אישי',   to: '/personal'     },
  ];

  return (
    <div
      dir="rtl"
      style={{
        padding: '12px 12px 8px',
        display: 'flex',
        gap: 8,
        justifyContent: 'center',
        background: 'white',
        borderBottom: '1px solid #FFF0E4',
      }}
    >
      {apps.map((app) => {
        const active = activeKey === app.key;
        return (
          <button
            key={app.key}
            type="button"
            onClick={() => navigate(app.to)}
            // Bulletproof border removal — index.css has a leftover
            // Vite default `button { border: 1px solid transparent }`
            // and a `:hover` rule that flips border-color. Spelling
            // out border / borderWidth / borderStyle / borderColor /
            // outline / boxShadow inline beats anything global.
            style={{
              padding: '10px 18px',
              borderRadius: 22,
              fontSize: 14,
              fontWeight: active ? 700 : 600,
              background: active ? '#FF6F20' : '#FFF9F0',
              color: active ? 'white' : '#888',
              border: '0',
              borderWidth: '0',
              borderStyle: 'none',
              borderColor: 'transparent',
              outline: 'none',
              boxShadow: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s',
              fontFamily: "'Barlow', 'Heebo', sans-serif",
            }}
          >
            {app.label}
          </button>
        );
      })}
    </div>
  );
}
