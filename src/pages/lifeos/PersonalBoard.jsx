import React, { useContext, useEffect, useMemo, useState } from 'react';
import { CalendarDays, LayoutGrid } from 'lucide-react';
import { AuthContext } from '@/lib/AuthContext';
import TodayScreen from '@/components/lifeos/TodayScreen';
import BoardScreen from '@/components/lifeos/BoardScreen';
import WeekBar from '@/components/lifeos/WeekBar';
import DayStrip from '@/components/lifeos/DayStrip';
import {
  FOCUS, hexAlpha, isoDate, fetchNodes, fetchLogs, logSetFrom, recurringTasks,
  taskExpectedOn, taskLoggedOn, BOARD_TAG,
} from '@/lib/lifeos/focus-api';
import { weekOf } from '@/lib/lifeos/schedule-api';

// ═══════════════════════════════════════════════════════════════════
// אישי — two segments, one route
// ═══════════════════════════════════════════════════════════════════
//   היום   TodayScreen — the schedule (day/week/month over an hour axis) and
//                        the task drawer under it. The old לוז segment is
//                        gone: the calendar IS the לוז.
//   הלוח   BoardScreen — the habit matrix + execution counts.
//
// Both read the SAME focus_nodes rows. A task placed in the schedule and the
// row in the matrix are one record; see src/lib/lifeos/schedule-api.js.
//
// ── the shared date ──────────────────────────────────────────────
// `date` lives HERE, not in either screen, because the day strip has to move
// BOTH: the calendar's cursor and the matrix's cursor are the same day. Each
// screen takes it as a controlled prop. Before this, TodayScreen owned `date`
// and FocusTracker owned `cursor`, and nothing could move the two together.
//
// ── the chrome above the segments ────────────────────────────────
//   row 1     the two-pill switcher
//   WeekBar   מיקוד / פרס / משפט + the week percent   (collapsed by default)
//   DayStrip  seven day cards with completion rings
// The resolution switcher is row 2 and lives inside the segment that owns it.
// ═══════════════════════════════════════════════════════════════════

const SEG_KEY = 'personal_segment';
const SEGMENTS = [
  { key: 'day', label: 'היום', Icon: CalendarDays },
  { key: 'board', label: 'הלוח', Icon: LayoutGrid },
];
// Retired segments fold into היום: 'schedule' was the לוז, 'now' was מה עכשיו.
const LEGACY = { schedule: 'day', now: 'day' };

// Same predicate FocusTracker uses to decide what is ON the board
// (FocusTracker.jsx:32). Duplicated as one line rather than exported, so the
// tracker's own filter stays byte-for-byte what it was.
const onBoard = (t, tag) => !tag || (t.tags || []).includes(tag);

export default function PersonalBoard() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const today = isoDate();

  const [seg, setSeg] = useState(() => {
    try {
      const v = localStorage.getItem(SEG_KEY) || 'day';
      return LEGACY[v] || v;
    } catch { return 'day'; }
  });
  const [date, setDate] = useState(today);

  const pick = (k) => {
    setSeg(k);
    try { localStorage.setItem(SEG_KEY, k); } catch { /* private mode */ }
  };

  // ── ring data ────────────────────────────────────────────────────
  // The strip needs completion per day across the SAME habits the matrix
  // shows, so it reads nodes + logs directly rather than reaching into a
  // screen. One small read; the screens keep their own loads untouched.
  const [nodes, setNodes] = useState([]);
  const [logs, setLogs] = useState([]);

  const week = useMemo(() => weekOf(date), [date]);

  useEffect(() => {
    if (!userId) return;
    let dead = false;
    (async () => {
      try {
        const [ns, lg] = await Promise.all([
          fetchNodes(userId),
          fetchLogs(userId, week[0], week[6]),
        ]);
        if (dead) return;
        console.log('[PersonalBoard] raw ring inputs', {
          week: { from: week[0], to: week[6] },
          nodes: ns.length, logs: lg.length, logRows: lg,
        });
        setNodes(ns); setLogs(lg);
      } catch (e) {
        console.warn('[PersonalBoard] ring load failed', e?.message);
      }
    })();
    return () => { dead = true; };
  }, [userId, week]);

  const logSet = useMemo(() => logSetFrom(logs), [logs]);
  // Board habits only — the same filter the matrix applies, so the ring and
  // the column under it can never disagree.
  const habits = useMemo(
    () => recurringTasks(nodes).filter(t => onBoard(t, BOARD_TAG)),
    [nodes]);

  const days = useMemo(() => week.map(d => {
    let done = 0, expected = 0;
    for (const t of habits) {
      if (!taskExpectedOn(t, d)) continue;
      expected += 1;
      if (taskLoggedOn(t, logSet, d)) done += 1;
    }
    return { date: d, done, expected, pct: expected ? done / expected : 0 };
  }), [week, habits, logSet]);

  const weekPct = useMemo(() => {
    const done = days.reduce((a, d) => a + d.done, 0);
    const expected = days.reduce((a, d) => a + d.expected, 0);
    return expected ? (done / expected) * 100 : 0;
  }, [days]);

  // Carried over from the summary card the week bar replaces.
  const remaining = useMemo(() => {
    const t = days.find(d => d.date === today);
    return t ? Math.max(0, t.expected - t.done) : null;
  }, [days, today]);
  const courage = useMemo(() => {
    const f = habits.find(t => t.is_fear_task && !taskLoggedOn(t, logSet, today));
    return f ? (f.title || 'משימה') : null;
  }, [habits, logSet, today]);

  useEffect(() => {
    console.log('[PersonalBoard] raw week bar + strip data', {
      date, weekStartOfStrip: week[0], weekPct, remaining, courage,
      days: days.map(d => ({ date: d.date, done: d.done, expected: d.expected, pct: d.pct })),
    });
  }, [date, week, days, weekPct, remaining, courage]);

  const bar = (
    <>
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
      <WeekBar userId={userId} date={date} percent={weekPct}
        remaining={remaining} courage={courage} />
      <DayStrip days={days} date={date} onPick={setDate} />
    </>
  );

  if (seg === 'board') return <BoardScreen headerSlot={bar} date={date} onDate={setDate} />;
  return <TodayScreen headerSlot={bar} date={date} onDate={setDate} />;
}
