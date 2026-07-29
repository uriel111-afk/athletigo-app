import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutGrid, Sparkles, SlidersHorizontal } from 'lucide-react';
import { AuthContext } from '@/lib/AuthContext';
import FocusTracker from '@/pages/lifeos/FocusTracker';
import StructureSheet from '@/components/lifeos/StructureSheet';
import QuickCapture from '@/components/lifeos/QuickCapture';
import { FOCUS, BOARD_TAG, isoDate, addDays, fetchNodes, indexNodes, hexAlpha, BANK_TAG, INSPIRATION_TAG, PERSONAL_ARM_TITLE } from '@/lib/lifeos/focus-api';
import { fetchExecutions, fetchCustomFields, fetchDayStates } from '@/lib/lifeos/personal-day-api';
import { execCountMap, weekProgressMap } from '@/lib/lifeos/week-math';

// ═══════════════════════════════════════════════════════════════════
// הלוח — the habit matrix, unchanged, plus the execution counts
// ═══════════════════════════════════════════════════════════════════
// FocusTracker is NOT forked. It keeps reading focus_task_logs for the
// done/skipped mark exactly as before; this screen loads focus_executions on
// its own and hands the per-cell counts down as ONE prop (`execCounts`), which
// the tracker only uses to draw a small ×N badge when a day holds two or more
// executions. Everything else — quick add, groups, long-press, the doc sheet —
// is the same single component the business tracker uses.
//
// The structural editor (branches, habits, bank items, promote/demote, custom
// fields) hangs off the footer, so the board stays a board.
// ═══════════════════════════════════════════════════════════════════

const ZOOM_KEY = 'personal_board_zoom';
const ZOOMS = [
  { key: 'branches', label: 'ענפים' },
  { key: 'all', label: 'הכל' },
  { key: 'month', label: 'חודש' },
];

export default function BoardScreen({ headerSlot = null, date, onDate }) {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const navigate = useNavigate();
  const today = isoDate();

  const [executions, setExecutions] = useState([]);
  const [customFields, setCustomFields] = useState([]);
  const [dayStates, setDayStates] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [structOpen, setStructOpen] = useState(false);
  // The relocated ענפים/הכל/חודש row, as a popover off one icon button.
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef(null);
  useEffect(() => {
    if (!filterOpen) return undefined;
    const away = (e) => { if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('touchstart', away);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('touchstart', away); };
  }, [filterOpen]);
  // Zoom: 'ענפים' = the collapsed accordion (a branch row that expands in
  // place), 'הכל' = every group open, 'חודש' = 30 day columns.
  const [zoom, setZoom] = useState(() => {
    try { return localStorage.getItem(ZOOM_KEY) || 'branches'; } catch { return 'branches'; }
  });
  const pickZoom = (z) => {
    setZoom(z);
    try { localStorage.setItem(ZOOM_KEY, z); } catch { /* private mode */ }
  };

  const load = useCallback(async () => {
    if (!userId) return;
    const from = addDays(today, -120);
    // The tracker fetches its own nodes; this second read exists only so the
    // structural sheet has the tree without reaching into the tracker.
    const [ex, cf, ds, ns] = await Promise.all([
      fetchExecutions(userId, from, today),
      fetchCustomFields(userId),
      fetchDayStates(userId, from, today),
      fetchNodes(userId),
    ]);
    setExecutions(ex); setCustomFields(cf); setDayStates(ds); setNodes(ns);
  }, [userId, today]);

  useEffect(() => { load(); }, [load]);

  const execCounts = useMemo(() => execCountMap(executions), [executions]);
  const brokenDays = useMemo(
    () => dayStates.filter(d => d.capacity === 'broken').map(d => String(d.day).slice(0, 10)),
    [dayStates]);

  // Habits and one-offs per branch, from the same tree the tracker renders.
  const { children } = useMemo(() => indexNodes(nodes), [nodes]);
  const arm = useMemo(() => nodes.find(n => n.node_type !== 'task' && n.title === PERSONAL_ARM_TITLE), [nodes]);
  const branchTasks = useMemo(() => {
    const out = {};
    if (!arm) return out;
    (children[arm.id] || []).filter(b => b.node_type === 'branch').forEach(b => {
      out[b.id] = (children[b.id] || []).filter(t => t.node_type === 'task'
        && !(t.tags || []).includes(BANK_TAG) && !(t.tags || []).includes(INSPIRATION_TAG));
    });
    return out;
  }, [arm, children]);
  const habits = useMemo(() => Object.values(branchTasks).flat().filter(t => t.task_kind !== 'oneoff'), [branchTasks]);
  // Weekly progress per habit, in ITS measure_mode, broken days excluded.
  const weekProgress = useMemo(
    () => weekProgressMap(habits, executions, { date: today, dayStates }),
    [habits, executions, today, dayStates]);

  // 'חד פעמי' chips, rendered inside the expanded branch row by the tracker.
  const groupFooter = useCallback((g) => {
    const oneoffs = (branchTasks[g.id] || []).filter(t => t.task_kind === 'oneoff' && t.status !== 'done');
    if (!oneoffs.length) return null;
    return (
      <div style={{ padding: '6px 8px 8px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 9.5, fontWeight: 800, color: FOCUS.muted, flexShrink: 0 }}>חד פעמי</span>
        {oneoffs.map(t => (
          <span key={t.id}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 9px', borderRadius: 999, border: `1px solid ${t.due_date && String(t.due_date).slice(0, 10) <= today ? '#E24B4A' : FOCUS.border}`, background: '#fff', fontSize: 11, fontWeight: 700, color: FOCUS.ink, whiteSpace: 'nowrap' }}>
            {t.title}
            {t.due_date && <span style={{ fontSize: 9, color: FOCUS.muted }}>{String(t.due_date).slice(8)}/{String(t.due_date).slice(5, 7)}</span>}
          </span>
        ))}
      </div>
    );
  }, [branchTasks, today]);

  const btn = {
    flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
    padding: '11px 12px', borderRadius: 14, cursor: 'pointer',
    border: `1px solid ${FOCUS.border}`, background: '#fff',
    boxShadow: FOCUS.neu, color: FOCUS.ink, fontSize: 13, fontWeight: 700,
    fontFamily: 'inherit', whiteSpace: 'nowrap',
  };

  const footer = (
    <div style={{ padding: '18px 12px 8px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setStructOpen(true)} style={btn}>
          <SlidersHorizontal size={16} color={FOCUS.orange} /> הוספה ושינוי
        </button>
        <button onClick={() => navigate('/lifeos/inspiration')} style={btn}>
          <Sparkles size={16} color={FOCUS.orange} /> רשימת השראה
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => navigate('/personal')} style={btn}>
          <LayoutGrid size={16} color={FOCUS.orange} /> עוד כלים
        </button>
      </div>
      <QuickCapture userId={userId} />
    </div>
  );

  // The segment bar is the whole header now. The ענפים / הכל / חודש row that
  // used to sit under it is gone from the visible chrome — it became the
  // filter button below, at the left edge of the controls row. Same three
  // options, same three strings, one row less.
  const header = <>{headerSlot}</>;

  const filter = (
    <div style={{ position: 'relative', flexShrink: 0 }} ref={filterRef}>
      <button onClick={() => setFilterOpen(o => !o)}
        aria-label={`תצוגה: ${ZOOMS.find(z => z.key === zoom)?.label || ''}`}
        aria-expanded={filterOpen}
        style={{ width: 32, height: 30, borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          border: `1px solid ${zoom === 'branches' ? FOCUS.border : FOCUS.orange}`,
          background: zoom === 'branches' ? '#fff' : hexAlpha(FOCUS.orange, 0.13),
          color: zoom === 'branches' ? FOCUS.muted : '#B4531A' }}>
        <SlidersHorizontal size={15} />
      </button>
      {filterOpen && (
        <div role="menu"
          style={{ position: 'absolute', top: 34, left: 0, zIndex: 30, minWidth: 116,
            background: '#fff', border: `1px solid ${FOCUS.border}`, borderRadius: 12,
            boxShadow: '0 6px 18px rgba(0,0,0,0.12)', padding: 5,
            display: 'flex', flexDirection: 'column', gap: 3 }}>
          {ZOOMS.map(z => {
            const on = zoom === z.key;
            return (
              <button key={z.key} onClick={() => { pickZoom(z.key); setFilterOpen(false); }}
                style={{ padding: '8px 11px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: 12.5, fontWeight: on ? 800 : 600, textAlign: 'right', direction: 'rtl',
                  border: `1px solid ${on ? FOCUS.orange : 'transparent'}`,
                  background: on ? hexAlpha(FOCUS.orange, 0.13) : '#FFFDFA',
                  color: on ? '#B4531A' : FOCUS.ink }}>
                {z.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <>
      <FocusTracker
        /* key forces a clean remount when the zoom changes the period, so the
           tracker's own cursor/period state starts from the new default. */
        key={zoom}
        title="אישי"
        chips={null}
        quickAdd
        docOnCheck
        seedPersonal
        groupByDomain
        boardTag={BOARD_TAG}
        pageScroll
        defaultPeriod={zoom === 'month' ? 'month' : 'week'}
        hideTopBar
        /* The day strip in PersonalBoard drives this cursor, so tapping a day
           moves the matrix and the calendar together. */
        cursor={date}
        onCursor={onDate}
        /* Chrome collapse: the filter row became one button at the left edge
           of the controls row, quick-add moved to the bottom as one button,
           the summary card became the week bar, and the matrix lost its %
           column + streak. All four are personal-board only. */
        filterSlot={filter}
        quickAddFooter
        leanBoard
        hideTodayStrip
        headerSlot={header}
        footerSlot={footer}
        execCounts={execCounts}
        brokenDays={brokenDays}
        weekProgress={weekProgress}
        expandAll={zoom !== 'branches'}
        groupFooter={groupFooter}
        customFields={customFields}
        onFieldsChanged={load}
      />
      {structOpen && (
        <StructureSheet userId={userId} nodes={nodes} customFields={customFields}
          onSaved={load} onClose={() => setStructOpen(false)} />
      )}
    </>
  );
}
