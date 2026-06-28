import React, { useContext } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Briefcase, Coins, Sprout, User, Clapperboard } from 'lucide-react';
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
    path.startsWith('/content')                                                   ? 'content'
    : path.startsWith('/personal')                                                ? 'personal'
    : path.startsWith('/lifeos/leads') || path.startsWith('/lifeos/content') ||
      path.startsWith('/lifeos/community')                                         ? 'finance'
    : path.startsWith('/lifeos')                                                   ? 'growth'
    : 'pro';

  const apps = [
    { key: 'pro',      label: 'מקצועי', to: '/dashboard',    Icon: Briefcase },
    { key: 'finance',  label: 'פיננסי', to: '/lifeos/finance-dashboard', Icon: Coins     },
    { key: 'growth',   label: 'לידים',  to: '/lifeos',       Icon: Sprout    },
    { key: 'personal', label: 'אישי',   to: '/personal',     Icon: User      },
    { key: 'content',  label: 'תוכן',   to: '/content',      Icon: Clapperboard },
  ];

  return (
    <div
      dir="rtl"
      style={{
        padding: '12px 12px 8px',
        display: 'flex',
        gap: 8,
        background: 'white',
        borderBottom: '1px solid #FFF0E4',
      }}
    >
      {apps.map((app) => {
        const active = activeKey === app.key;
        const { Icon } = app;
        return (
          <button
            key={app.key}
            type="button"
            onClick={() => navigate(app.to)}
            style={{
              // flex:1 + minWidth:0 share the row evenly across 4 tabs.
              flex: 1, minWidth: 0,
              padding: '10px 0',
              borderRadius: 12,
              fontSize: 13,
              fontWeight: active ? 700 : 500,
              background: active ? '#FF6F20' : '#F6EAD9',
              color: active ? 'white' : '#9A6A3A',
              // Active = flat (no bottom border); inactive = a 3px
              // bottom band in the soft tan border so the row reads as
              // a tab strip. Top/left/right always borderless so heights
              // stay consistent between states.
              borderTop: '0', borderLeft: '0', borderRight: '0',
              borderBottom: active ? '0' : '3px solid #E0C9A8',
              outline: 'none',
              boxShadow: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s',
              fontFamily: "'Rubik', system-ui, sans-serif",
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              lineHeight: 1,
            }}
          >
            <Icon size={17} aria-hidden style={{ display: 'block', color: active ? 'white' : '#9A6A3A' }} />
            <span>{app.label}</span>
          </button>
        );
      })}
    </div>
  );
}
