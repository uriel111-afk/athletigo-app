import React from 'react';
import { NavLink } from 'react-router-dom';
import { Gauge, CalendarCheck, ListChecks, CalendarDays, Network, LayoutGrid, AlignLeft } from 'lucide-react';
import { FOCUS } from '@/lib/lifeos/focus-api';

// The chip sub-nav shared by every Focus screen:
// בקרה / מעקב / היום / רשימה / מתאר / יומן / מפה.
// מעקב is the landing (end:true → /lifeos/focus renders the Tracker).
const CHIPS = [
  { to: '/lifeos/focus/control',  label: 'בקרה',   Icon: Gauge,         end: false },
  { to: '/lifeos/focus',          label: 'מעקב',   Icon: LayoutGrid,    end: true },
  { to: '/lifeos/focus/today',    label: 'היום',   Icon: CalendarCheck, end: false },
  { to: '/lifeos/focus/list',     label: 'רשימה',  Icon: ListChecks,    end: false },
  { to: '/lifeos/focus/outline',  label: 'מתאר',   Icon: AlignLeft,     end: false },
  { to: '/lifeos/focus/calendar', label: 'יומן',   Icon: CalendarDays,  end: false },
  { to: '/lifeos/focus/map',      label: 'מפה',    Icon: Network,       end: false },
];

// `compact` (map only) → 32px chips, tight vertical padding, chips shrink to
// content so `trailing` tools share one horizontally-scrollable row.
// `trailing` → extra buttons rendered after the chips in the same row.
// Default (no props) keeps the original look for the other four screens.
export default function FocusChips({ compact = false, trailing = null }) {
  return (
    <div
      dir="rtl"
      style={{
        display: 'flex', gap: 6, alignItems: 'center',
        padding: compact ? '4px 8px' : '4px 14px 12px',
        overflowX: 'auto',
        flexShrink: 0,
      }}
    >
      {CHIPS.map(c => (
        <NavLink
          key={c.to}
          to={c.to}
          end={c.end}
          style={({ isActive }) => ({
            flex: compact ? '0 0 auto' : '1 1 0',
            minWidth: compact ? 0 : 72,
            minHeight: compact ? 32 : undefined,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: compact ? 4 : 5,
            padding: compact ? '0 10px' : '9px 6px',
            borderRadius: compact ? 10 : 12,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
            backgroundColor: isActive ? FOCUS.orange : '#FFFFFF',
            color: isActive ? '#FFFFFF' : '#9A6A3A',
            border: isActive ? 'none' : `1px solid ${FOCUS.border}`,
            boxShadow: isActive ? 'none' : FOCUS.neu,
            fontSize: compact ? 12.5 : 13, fontWeight: isActive ? 700 : 600,
            fontFamily: 'inherit',
            transition: 'background-color .15s, color .15s',
          })}
        >
          <c.Icon size={compact ? 14 : 15} />
          <span>{c.label}</span>
        </NavLink>
      ))}
      {trailing}
    </div>
  );
}
