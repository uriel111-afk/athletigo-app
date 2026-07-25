import React, { useState } from 'react';
import { CalendarClock, LayoutGrid, Sun } from 'lucide-react';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import DayScreen from '@/components/lifeos/DayScreen';
import BoardScreen from '@/components/lifeos/BoardScreen';
import { FOCUS, hexAlpha } from '@/lib/lifeos/focus-api';

// ═══════════════════════════════════════════════════════════════════
// אישי — three segments, one route
// ═══════════════════════════════════════════════════════════════════
//   היום   DayScreen   — capacity, window, THE next move, modes, cycle path
//   הלוח   BoardScreen — the habit matrix (FocusTracker) + execution counts
//   לוז    placeholder — Stage 1 ships the segment, not the schedule. The
//                        calendar/time-blocking work is Stage 2; showing the
//                        empty tab now keeps the shape of the tab honest
//                        instead of adding a fourth entry point later.
//
// The chosen segment is remembered, so the tab reopens where it was left.
// FocusTracker owns its own LifeOSLayout, so the board segment hands the
// segment bar down as headerSlot rather than wrapping it in a second shell.
// ═══════════════════════════════════════════════════════════════════

const SEG_KEY = 'personal_segment';
const SEGMENTS = [
  { key: 'day', label: 'היום', Icon: Sun },
  { key: 'board', label: 'הלוח', Icon: LayoutGrid },
  { key: 'schedule', label: 'לוז', Icon: CalendarClock },
];

export default function PersonalBoard() {
  const [seg, setSeg] = useState(() => {
    try { return localStorage.getItem(SEG_KEY) || 'day'; } catch { return 'day'; }
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
            style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '9px 6px', borderRadius: 13, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: on ? 800 : 700,
              border: `1px solid ${on ? FOCUS.orange : FOCUS.border}`, background: on ? hexAlpha(FOCUS.orange, 0.13) : '#fff', color: on ? '#B4531A' : FOCUS.muted, boxShadow: on ? 'none' : FOCUS.neu }}>
            <Icon size={15} /> {label}
          </button>
        );
      })}
    </div>
  );

  if (seg === 'board') return <BoardScreen headerSlot={bar} />;
  if (seg === 'day') return <DayScreen headerSlot={bar} />;

  return (
    <LifeOSLayout title="אישי" hideFab hideTopBar>
      {bar}
      <div style={{ margin: '10px 12px', padding: '34px 18px', textAlign: 'center', background: FOCUS.card, border: `1px dashed ${FOCUS.edge}`, borderRadius: 16 }}>
        <CalendarClock size={34} color={FOCUS.orange} style={{ opacity: 0.55 }} />
        <div style={{ fontSize: 15, fontWeight: 800, color: FOCUS.ink, marginTop: 10 }}>הלוז מגיע בשלב הבא</div>
        <div style={{ fontSize: 12.5, color: FOCUS.muted, marginTop: 6, lineHeight: 1.5 }}>
          בשלב 1 יש את המהלך הבא ואת הלוח.<br />
          שיבוץ המשימות לשעות ביום מגיע בשלב 2.
        </div>
      </div>
    </LifeOSLayout>
  );
}
