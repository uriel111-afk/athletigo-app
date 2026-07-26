import React, { useState } from 'react';
import { CalendarDays, LayoutGrid, Zap } from 'lucide-react';
import TodayScreen from '@/components/lifeos/TodayScreen';
import NextMoveScreen from '@/components/lifeos/NextMoveScreen';
import BoardScreen from '@/components/lifeos/BoardScreen';
import { FOCUS, hexAlpha } from '@/lib/lifeos/focus-api';

// ═══════════════════════════════════════════════════════════════════
// אישי — three segments, one route
// ═══════════════════════════════════════════════════════════════════
//   היום      TodayScreen    — the schedule (day/week/month over an hour axis)
//                              with the task-bank accordion under it. The old
//                              לוז segment is gone: the calendar IS the לוז,
//                              and it now lives where the day starts.
//   מה עכשיו  NextMoveScreen — capacity, time window, THE next move, modes and
//                              the cycle path. This is the former DayScreen,
//                              renamed and moved to its own segment (git mv,
//                              so its history is intact).
//   הלוח      BoardScreen    — the habit matrix + execution counts.
//
// All three read the SAME focus_nodes rows. A task placed in the schedule, the
// move proposed by the engine and the row in the matrix are one record; see
// src/lib/lifeos/schedule-api.js for why there is no second table.
//
// The chosen segment is remembered, so the tab reopens where it was left.
// FocusTracker owns its own LifeOSLayout, so each screen takes the segment bar
// as headerSlot rather than being wrapped in a second shell.
// ═══════════════════════════════════════════════════════════════════

const SEG_KEY = 'personal_segment';
const SEGMENTS = [
  { key: 'day', label: 'היום', Icon: CalendarDays },
  { key: 'now', label: 'מה עכשיו', Icon: Zap },
  { key: 'board', label: 'הלוח', Icon: LayoutGrid },
];
const LEGACY = { schedule: 'day' };   // the old לוז segment folded into היום

export default function PersonalBoard() {
  const [seg, setSeg] = useState(() => {
    try {
      const v = localStorage.getItem(SEG_KEY) || 'day';
      return LEGACY[v] || v;
    } catch { return 'day'; }
  });

  const pick = (k) => {
    setSeg(k);
    try { localStorage.setItem(SEG_KEY, k); } catch { /* private mode */ }
  };

  const bar = (
    <div style={{ padding: '8px 12px 6px', display: 'flex', gap: 6 }}>
      {SEGMENTS.map(({ key, label, Icon }) => {
        const on = seg === key;
        return (
          <button key={key} onClick={() => pick(key)}
            style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '9px 6px', borderRadius: 13, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: on ? 800 : 700, whiteSpace: 'nowrap',
              border: `1px solid ${on ? FOCUS.orange : FOCUS.border}`, background: on ? hexAlpha(FOCUS.orange, 0.13) : '#fff', color: on ? '#B4531A' : FOCUS.muted, boxShadow: on ? 'none' : FOCUS.neu }}>
            <Icon size={15} /> {label}
          </button>
        );
      })}
    </div>
  );

  if (seg === 'board') return <BoardScreen headerSlot={bar} />;
  if (seg === 'now') return <NextMoveScreen headerSlot={bar} />;
  return <TodayScreen headerSlot={bar} />;
}
