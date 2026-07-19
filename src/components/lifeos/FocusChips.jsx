import React from 'react';
import { NavLink } from 'react-router-dom';
import { CalendarCheck, ListChecks, CalendarDays, Network } from 'lucide-react';
import { FOCUS } from '@/lib/lifeos/focus-api';

// The 4-chip sub-nav shared by every Focus screen: היום / רשימה / יומן / מפה.
const CHIPS = [
  { to: '/lifeos/focus',          label: 'היום',   Icon: CalendarCheck, end: true },
  { to: '/lifeos/focus/list',     label: 'רשימה',  Icon: ListChecks,    end: false },
  { to: '/lifeos/focus/calendar', label: 'יומן',   Icon: CalendarDays,  end: false },
  { to: '/lifeos/focus/map',      label: 'מפה',    Icon: Network,       end: false },
];

export default function FocusChips() {
  return (
    <div
      dir="rtl"
      style={{
        display: 'flex', gap: 6,
        padding: '4px 14px 12px',
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
            flex: '1 1 0',
            minWidth: 72,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            padding: '9px 6px',
            borderRadius: 12,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
            backgroundColor: isActive ? FOCUS.orange : '#FFFFFF',
            color: isActive ? '#FFFFFF' : '#9A6A3A',
            border: isActive ? 'none' : `1px solid ${FOCUS.border}`,
            boxShadow: isActive ? 'none' : FOCUS.neu,
            fontSize: 13, fontWeight: isActive ? 700 : 600,
            fontFamily: 'inherit',
            transition: 'background-color .15s, color .15s',
          })}
        >
          <c.Icon size={15} />
          <span>{c.label}</span>
        </NavLink>
      ))}
    </div>
  );
}
