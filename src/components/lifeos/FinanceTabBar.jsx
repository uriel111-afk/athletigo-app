import React from 'react';
import { NavLink } from 'react-router-dom';
import { BarChart3, Target } from 'lucide-react';
import { LIFEOS_COLORS } from '@/lib/lifeos/lifeos-constants';

// Pill-style mini tab bar for jumping between the four "finance-area"
// pages without leaving context. Each tab navigates to a real route
// and uses NavLink's isActive so the current page is highlighted.
//
// Drop this at the top of each of the four pages so the bar is always
// available no matter where the user lands.

const TABS = [
  { to: '/lifeos/finance-dashboard', label: 'דשבורד', Icon: BarChart3 },
  { to: '/lifeos/goals',             label: 'יעדים',  Icon: Target },
];

export default function FinanceTabBar() {
  return (
    <div
      dir="rtl"
      style={{
        display: 'flex', gap: 4,
        padding: 4,
        backgroundColor: '#FFFFFF',
        border: `1px solid ${LIFEOS_COLORS.border}`,
        borderRadius: 12,
        marginBottom: 14,
      }}
    >
      {TABS.map(t => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.to === '/lifeos/finance-dashboard'}
          style={({ isActive }) => ({
            flex: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            padding: '8px 4px',
            borderRadius: 10,
            textDecoration: 'none',
            backgroundColor: isActive ? LIFEOS_COLORS.primary : 'transparent',
            color: isActive ? '#FFFFFF' : LIFEOS_COLORS.textSecondary,
            fontSize: 12, fontWeight: 700,
            fontFamily: 'inherit',
            transition: 'background-color 0.15s ease, color 0.15s ease',
            minWidth: 0,
          })}
        >
          <t.Icon size={14} />
          <span style={{ whiteSpace: 'nowrap' }}>{t.label}</span>
        </NavLink>
      ))}
    </div>
  );
}
