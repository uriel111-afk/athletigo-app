import React, { useContext } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '@/lib/AuthContext';
import { COACH_USER_ID } from '@/lib/lifeos/lifeos-constants';

// Three-pill switcher between the coach's three apps:
//   מקצועי (/dashboard)  — clients & training
//   פיננסי (/lifeos)      — finance & strategy
//   צמיחה (/lifeos/leads) — leads & content
//
// Only renders for the Life OS coach. Anyone else sees nothing — the
// regular app flow is unchanged.
export default function AppSwitcher() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();

  if (!user || user.id !== COACH_USER_ID) return null;

  const path = location.pathname;
  const activeKey =
    path.startsWith('/lifeos/leads') || path.startsWith('/lifeos/content') || path.startsWith('/lifeos/community')
      ? 'growth'
      : path.startsWith('/lifeos')
      ? 'finance'
      : 'pro';

  const apps = [
    { key: 'pro',     label: 'מקצועי',  to: '/dashboard'    },
    { key: 'finance', label: 'פיננסי',  to: '/lifeos'       },
    { key: 'growth',  label: 'צמיחה',   to: '/lifeos/leads' },
  ];

  return (
    <div
      dir="rtl"
      style={{
        display: 'flex', justifyContent: 'center', gap: 6,
        padding: '8px 12px',
        background: '#FDF8F3',
        borderBottom: '0.5px solid #F0E4D0',
      }}
    >
      {apps.map(app => {
        const active = activeKey === app.key;
        return (
          <button
            key={app.key}
            onClick={() => navigate(app.to)}
            style={{
              height: 36,
              padding: '0 16px',
              borderRadius: 18,
              fontSize: 12, fontWeight: 700,
              cursor: 'pointer',
              backgroundColor: active ? '#FF6F20' : 'transparent',
              color:           active ? '#FFFFFF' : '#FF6F20',
              border: active ? 'none' : '1px solid #FF6F20',
              transition: 'all 0.15s ease',
            }}
          >
            {app.label}
          </button>
        );
      })}
    </div>
  );
}
