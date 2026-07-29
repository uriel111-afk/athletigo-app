import React from 'react';
import { FOCUS, HEB_DAYS, hexAlpha, isoDate } from '@/lib/lifeos/focus-api';

// ═══════════════════════════════════════════════════════════════════
// The seven-day strip — day letter, date number, completion ring
// ═══════════════════════════════════════════════════════════════════
// Sits under the week bar and drives BOTH segments: tapping a day moves
// the calendar (היום) and the matrix cursor (הלוח) to it, because the
// date lives one level up in PersonalBoard.
//
// Orange is reserved. The CURRENT day is tinted with orange text; every
// other card is white with muted text, selected or not — a selected day
// is marked by its ring and border, never by borrowing today's colour.
// ═══════════════════════════════════════════════════════════════════

const R = 12;
const C = 2 * Math.PI * R;

function Ring({ pct, active }) {
  const p = Math.max(0, Math.min(1, pct));
  return (
    <div style={{ position: 'relative', width: 30, height: 30, flexShrink: 0 }}>
      <svg width="30" height="30" viewBox="0 0 30 30">
        <circle cx="15" cy="15" r={R} fill="none" stroke="#F0E4D0" strokeWidth="3" />
        <circle cx="15" cy="15" r={R} fill="none"
          stroke={active ? FOCUS.orange : '#C9BCA8'} strokeWidth="3" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - p)}
          transform="rotate(-90 15 15)"
          style={{ transition: 'stroke-dashoffset .3s' }} />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        fontSize: 8.5, fontWeight: 800,
        color: active ? '#B4531A' : FOCUS.muted,
        fontVariantNumeric: 'tabular-nums',
      }}>{Math.round(p * 100)}</div>
    </div>
  );
}

export default function DayStrip({ days = [], date, onPick }) {
  const today = isoDate();
  return (
    <div style={{ display: 'flex', gap: 5, padding: '0 12px 10px' }}>
      {days.map(d => {
        const isToday = d.date === today;
        const selected = d.date === date;
        return (
          <button key={d.date} onClick={() => onPick && onPick(d.date)}
            aria-label={`${d.date} — ${Math.round((d.pct || 0) * 100)}%`}
            aria-current={selected ? 'date' : undefined}
            style={{
              flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 2, padding: '6px 2px 7px',
              borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
              // Raised card. Today is tinted; everything else stays white,
              // including the selected day.
              background: isToday ? hexAlpha(FOCUS.orange, 0.13) : '#fff',
              border: `1px solid ${isToday ? FOCUS.orange : selected ? FOCUS.edge : FOCUS.border}`,
              boxShadow: FOCUS.neu,
            }}>
            <span style={{
              fontSize: 9.5, fontWeight: isToday ? 800 : 600,
              color: isToday ? '#B4531A' : FOCUS.muted, lineHeight: 1,
            }}>{HEB_DAYS[new Date(d.date + 'T00:00:00').getDay()]}</span>
            <span style={{
              fontSize: 12, fontWeight: isToday ? 800 : 700,
              color: isToday ? '#B4531A' : FOCUS.ink, lineHeight: 1.1,
            }}>{Number(d.date.slice(8))}</span>
            <Ring pct={d.pct || 0} active={isToday} />
          </button>
        );
      })}
    </div>
  );
}
