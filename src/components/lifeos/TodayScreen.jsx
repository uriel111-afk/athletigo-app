import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, Zap } from 'lucide-react';
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, MouseSensor,
  useSensor, useSensors, pointerWithin, closestCenter,
} from '@dnd-kit/core';
import { AuthContext } from '@/lib/AuthContext';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import PageSkeleton from '@/components/PageSkeleton';
import DayCalendar, { parseSlotId } from '@/components/lifeos/DayCalendar';
import NextMoveScreen from '@/components/lifeos/NextMoveScreen';
import TaskBankAccordion from '@/components/lifeos/TaskBankAccordion';
import FocusDocSheet from '@/components/lifeos/FocusDocSheet';
import QuickCapture from '@/components/lifeos/QuickCapture';
import {
  FOCUS, hexAlpha, isoDate, addDays, fetchNodes, fetchLogs, logSetFrom, logByKey,
  logTask, unlogTask, taskLoggedOn, createNode, BOARD_TAG, PERSONAL_ARM_TITLE, indexNodes,
} from '@/lib/lifeos/focus-api';
import { fetchExecutions, fetchDayStates, addExecution, deleteExecution } from '@/lib/lifeos/personal-day-api';
import {
  scheduleTask, unscheduleTask, rolloverOncePerDay, schedulingProgress, timeLabel,
} from '@/lib/lifeos/schedule-api';
import { categoryClassifier, colorOfCategory } from '@/lib/lifeos/categories';

// ═══════════════════════════════════════════════════════════════════
// היום — the next move on top, then the schedule, then the task drawer
// ═══════════════════════════════════════════════════════════════════
// Owns the data for the calendar and the drawer, because they are two views of
// one set of rows: the drawer lists tasks, the calendar shows the ones carrying
// a task_time. Placing writes those columns on the task itself — nothing is
// created, nothing is copied.
//
// NextMoveScreen sits above both as a collapsible strip. It is NOT forked or
// reimplemented: the same component renders `embedded`, loads its own day
// state, and stays mounted while collapsed so the strip header can name the
// move the engine currently proposes. Collapsed is the default — the strip is
// there when the question is "what now", out of the way when it is not.
//
// Ticking is the SAME write the habit matrix performs, at every zoom level:
//   focus_task_logs  (logTask)      — the day mark the matrix draws
//   focus_executions (addExecution) — the history the week maths counts
//
// Drag-and-drop uses @dnd-kit with a TouchSensor, so a finger drag works; the
// browser's native `draggable` would have been mouse-only. DndContext also
// brings the edge auto-scroll the brief asks for (its autoScroll default).
// ═══════════════════════════════════════════════════════════════════

const NEXT_OPEN_KEY = 'personal_nextmove_open';
const CAL_ZOOM_KEY = 'personal_calendar_zoom';

export default function TodayScreen({ headerSlot = null }) {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const today = isoDate();

  const [nodes, setNodes] = useState([]);
  const [logs, setLogs] = useState([]);
  const [executions, setExecutions] = useState([]);
  const [dayStates, setDayStates] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const [date, setDate] = useState(today);
  const [view, setView] = useState(() => {
    try { return localStorage.getItem('personal_cal_view') || 'day'; } catch { return 'day'; }
  });
  const pickView = (v) => {
    setView(v);
    try { localStorage.setItem('personal_cal_view', v); } catch { /* private mode */ }
  };

  // Row resolution: 'twoHour' | 'hour' | 'quarter'. Two hours is the default —
  // the whole waking day fits without scrolling, which is the view you want
  // when you open the screen to see the shape of the day.
  const [zoom, setZoom] = useState(() => {
    try { return localStorage.getItem(CAL_ZOOM_KEY) || 'twoHour'; } catch { return 'twoHour'; }
  });
  const pickZoom = (z) => {
    setZoom(z);
    try { localStorage.setItem(CAL_ZOOM_KEY, z); } catch { /* private mode */ }
  };

  // The next-move strip: collapsed by default, and the choice is remembered.
  const [nextOpen, setNextOpen] = useState(() => {
    try { return localStorage.getItem(NEXT_OPEN_KEY) === '1'; } catch { return false; }
  });
  const toggleNext = () => {
    setNextOpen(v => {
      const next = !v;
      try { localStorage.setItem(NEXT_OPEN_KEY, next ? '1' : '0'); } catch { /* private mode */ }
      return next;
    });
  };
  const [moveTitle, setMoveTitle] = useState(null);

  const [pending, setPending] = useState(null);     // task armed, waiting for a slot
  const [armedSlot, setArmedSlot] = useState(null); // slot armed, waiting for a task
  const [dragging, setDragging] = useState(null);
  const [doc, setDoc] = useState(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const from = addDays(today, -120);
    const [ns, lg, ex, ds] = await Promise.all([
      fetchNodes(userId),
      fetchLogs(userId, from, addDays(today, 60)),
      fetchExecutions(userId, from, today),
      fetchDayStates(userId, from, today),
    ]);
    setNodes(ns); setLogs(lg); setExecutions(ex); setDayStates(ds);
    setLoaded(true);
  }, [userId, today]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!loaded || !nodes.length) return;
    let cancelled = false;
    (async () => {
      const moved = await rolloverOncePerDay(nodes, today);
      if (!cancelled && moved.length) {
        toast(`${moved.length} משימות שלא בוצעו הועברו להיום`);
        load();
      }
    })();
    return () => { cancelled = true; };
  }, [loaded]);   // once per mount, not per reload

  const logSet = useMemo(() => logSetFrom(logs), [logs]);
  const logMap = useMemo(() => logByKey(logs), [logs]);
  const doneOf = useCallback((node, d) => taskLoggedOn(node, logSet, d), [logSet]);
  const classify = useMemo(() => categoryClassifier(nodes), [nodes]);
  const progress = useMemo(() => schedulingProgress(nodes, { date, view }), [nodes, date, view]);

  // ── the one write both screens share ────────────────────────────
  const toggleDone = async (node, d) => {
    if (d > today) { toast('אי אפשר לסמן יום עתידי'); return; }
    const already = taskLoggedOn(node, logSet, d);
    try {
      if (already) {
        await unlogTask(node, d);
        // Drop the matching execution too, or the week maths would keep
        // counting a session on a day the matrix shows as not done.
        const mine = executions.filter(x => x.node_id === node.id && String(x.day).slice(0, 10) === d);
        const last = mine[mine.length - 1];
        if (last) { try { await deleteExecution(last.id); } catch { /* log row already gone */ } }
        toast('הסימון בוטל');
      } else {
        await logTask(userId, node, d);
        try { await addExecution(userId, { node_id: node.id, day: d, minutes: node.net_minutes ?? null }); }
        catch { /* executions table missing → the day mark still stands */ }
        toast.success('בוצע ✓');
      }
      await load();
    } catch (e) { toast.error('שגיאה: ' + (e?.message || '')); }
  };

  const openDoc = (node, d) => setDoc({ node, date: d, existing: logMap[node.id + '|' + d] || null });

  // ── placement (both routes end here) ────────────────────────────
  const place = async (node, d, hour, quarter) => {
    try {
      await scheduleTask(node, d, hour, quarter);
      setPending(null); setArmedSlot(null);
      toast.success(`נקבע ל-${timeLabel(hour, quarter)}`);
      await load();
    } catch (e) { toast.error('שגיאה בשיבוץ: ' + (e?.message || '')); }
  };

  // Route B: a slot is armed and the user taps a task in the bank.
  // Otherwise tapping a task arms the TASK, and the next slot tap places it.
  const pickTask = (t) => {
    if (armedSlot) { place(t, armedSlot.date, armedSlot.hour, armedSlot.quarter); return; }
    setPending(p => (p?.id === t.id ? null : t));
  };

  const armSlot = (slot) => {
    if (pending) { place(pending, slot.date, slot.hour, slot.quarter); return; }
    setArmedSlot(s => (s && s.date === slot.date && s.hour === slot.hour && s.quarter === slot.quarter ? null : slot));
  };

  // Quick add from inside the picker — create, then place, without a dialog.
  const quickAdd = async (title) => {
    if (!armedSlot) return;
    try {
      const { children } = indexNodes(nodes);
      const arm = nodes.find(n => n.node_type !== 'task' && n.title === PERSONAL_ARM_TITLE);
      const parent = arm ? ((children[arm.id] || []).find(b => b.node_type === 'branch')?.id || arm.id) : null;
      if (!parent) { toast.error('לא נמצא ענף לשייך אליו'); return; }
      const created = await createNode(userId, {
        parent_id: parent, node_type: 'task', title, tags: [BOARD_TAG],
        task_kind: 'oneoff', task_date: armedSlot.date, net_minutes: 30, sort_order: 100,
      });
      await scheduleTask(created, armedSlot.date, armedSlot.hour, armedSlot.quarter);
      setArmedSlot(null);
      toast.success('נוספה ושובצה ✓');
      await load();
    } catch (e) { toast.error('שגיאה: ' + (e?.message || '')); }
  };

  const unschedule = async (node) => {
    try { await unscheduleTask(node); await load(); toast('הוסר מהשעה'); }
    catch (e) { toast.error('שגיאה: ' + (e?.message || '')); }
  };

  // ── drag sensors ────────────────────────────────────────────────
  // TouchSensor with a short press delay: a quick tap stays a tap (so route B
  // still works on the very same chip), a held finger becomes a drag.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  // Slots are small and packed, and the hour grid auto-scrolls near its edges.
  // closestCenter alone snapped a drop to whatever slot centre was nearest —
  // measurably the wrong hour once auto-scroll moved the grid under the finger.
  // pointerWithin only matches a slot actually under the pointer; closestCenter
  // stays as the fallback for the gaps between slots.
  const collisionDetection = useCallback((args) => {
    const hits = pointerWithin(args);
    return hits.length ? hits : closestCenter(args);
  }, []);

  const onDragStart = (e) => setDragging(e.active?.data?.current?.node || null);
  const onDragEnd = (e) => {
    setDragging(null);
    const slot = parseSlotId(e.over?.id);
    const node = e.active?.data?.current?.node;
    if (slot && node) place(node, slot.date, slot.hour, slot.quarter);
  };

  if (!loaded) {
    return (
      <LifeOSLayout title="אישי" hideFab hideTopBar>
        {headerSlot}<PageSkeleton rows={6} />
      </LifeOSLayout>
    );
  }

  return (
    <LifeOSLayout title="אישי" hideFab hideTopBar>
      {headerSlot}

      {/* ── המהלך הבא — collapsed strip above the calendar ── */}
      <div style={{ margin: '0 12px 10px', background: FOCUS.card, border: `1px solid ${nextOpen ? hexAlpha(FOCUS.orange, 0.5) : FOCUS.border}`, borderRadius: 14, boxShadow: FOCUS.neu, overflow: 'hidden' }}>
        <button onClick={toggleNext}
          aria-expanded={nextOpen}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 7, padding: '11px 12px', border: 'none', background: nextOpen ? hexAlpha(FOCUS.orange, 0.09) : 'transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'right' }}>
          <Zap size={15} color={FOCUS.orange} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 12.5, fontWeight: 800, color: '#B4531A', flexShrink: 0 }}>המהלך הבא</span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700, color: moveTitle ? FOCUS.ink : FOCUS.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            · {moveTitle || 'אין מה להציע כרגע'}
          </span>
          <ChevronDown size={17} color={FOCUS.muted}
            style={{ flexShrink: 0, transform: nextOpen ? 'none' : 'rotate(90deg)', transition: 'transform .16s' }} />
        </button>
      </div>

      {/* Mounted even when collapsed, so the header above can name the move. */}
      <NextMoveScreen embedded hidden={!nextOpen} onMoveTitle={setMoveTitle} />

      <DndContext sensors={sensors} collisionDetection={collisionDetection} autoScroll
        onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>

        <DayCalendar
          nodes={nodes} logSet={logSet} doneOf={doneOf}
          date={date} onDate={setDate} view={view} onView={pickView}
          zoom={zoom} onZoom={pickZoom}
          armed={armedSlot} onArm={armSlot} onClearArm={() => setArmedSlot(null)}
          onToggleDone={toggleDone} onOpenDoc={openDoc} onUnschedule={unschedule}
          categoryOf={classify} progress={progress}
        />

        <TaskBankAccordion
          userId={userId} nodes={nodes} logSet={logSet}
          executions={executions} dayStates={dayStates} date={date}
          pendingId={pending?.id || null} armedSlot={armedSlot}
          classify={classify}
          onPick={pickTask} onQuickAdd={quickAdd} onSaved={load}
        />

        <DragOverlay dropAnimation={null}>
          {dragging && (
            <div style={{ padding: '7px 12px', borderRadius: 999, background: '#fff', border: `2px solid ${colorOfCategory(classify(dragging))}`, boxShadow: '0 6px 18px rgba(0,0,0,0.25)', fontSize: 12.5, fontWeight: 800, color: FOCUS.ink, whiteSpace: 'nowrap' }}>
              {dragging.title}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <div style={{ padding: '0 12px 20px' }}>
        <QuickCapture userId={userId} />
      </div>

      {doc && (
        <FocusDocSheet node={doc.node} userId={userId} date={doc.date} existing={doc.existing}
          onClose={() => setDoc(null)}
          onSaved={async () => { setDoc(null); await load(); }}
          onUncheck={async () => { await unlogTask(doc.node, doc.date); setDoc(null); await load(); }} />
      )}
    </LifeOSLayout>
  );
}
