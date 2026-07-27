import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AuthContext } from '@/lib/AuthContext';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import PageSkeleton from '@/components/PageSkeleton';
import DayCalendar, { parseSlotId } from '@/components/lifeos/DayCalendar';
import TaskBankAccordion from '@/components/lifeos/TaskBankAccordion';
import NodeDetailSheet from '@/components/lifeos/NodeDetailSheet';
import FocusDocSheet from '@/components/lifeos/FocusDocSheet';
import QuickCapture from '@/components/lifeos/QuickCapture';
import {
  FOCUS, isoDate, addDays, fetchNodes, fetchLogs, logSetFrom, logByKey,
  logTask, unlogTask, taskLoggedOn, createNode, BOARD_TAG, PERSONAL_ARM_TITLE,
  indexNodes, ancestorsOf,
} from '@/lib/lifeos/focus-api';
import { fetchExecutions, fetchDayStates, addExecution, deleteExecution } from '@/lib/lifeos/personal-day-api';
import {
  scheduleTask, unscheduleTask, restoreTaskTime, restorePlacement, placementOf,
  rolloverOncePerDay, schedulingProgress, timeLabel,
} from '@/lib/lifeos/schedule-api';
import { categoryClassifier, colorOfCategory } from '@/lib/lifeos/categories';
import { useTapDrag } from '@/lib/lifeos/use-tap-drag';

// ═══════════════════════════════════════════════════════════════════
// היום — the schedule on top, the task drawer under it
// ═══════════════════════════════════════════════════════════════════
// Owns the data for the calendar and the drawer, because they are two views of
// one set of rows: the drawer lists tasks, the calendar shows the ones carrying
// a task_time. Placing writes those columns on the task itself — nothing is
// created, nothing is copied.
//
// The next-move engine is NOT rendered here any more. NextMoveScreen.jsx is
// deliberately kept on disk, unreferenced, along with priority-engine.js and
// the focus_modes / focus_day_state reads behind it: the component still works
// as a standalone screen, so bringing it back is a route away and needs no
// rewrite. Nothing on this screen reads it.
//
// Ticking is the SAME write the habit matrix performs, at every zoom level:
//   focus_task_logs  (logTask)      — the day mark the matrix draws
//   focus_executions (addExecution) — the history the week maths counts
//
// Dragging is select-then-drag, in lib/lifeos/use-tap-drag.js — @dnd-kit is
// gone from this screen. It could not express an activation that depends on the
// state of the item under the finger (immediate once armed, 400ms otherwise),
// and its instant drag meant a scroll through the drawer booked hours by
// accident. The controller also owns the scroll lock and the edge auto-scroll.
// ═══════════════════════════════════════════════════════════════════

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

  const [pending, setPending] = useState(null);     // task armed, waiting for a slot
  const [armedSlot, setArmedSlot] = useState(null); // slot armed, waiting for a task
  const [doc, setDoc] = useState(null);
  const [details, setDetails] = useState(null);   // drawer row → task details

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

  // No dialog on the way out — the block leaves the grid at once and the toast
  // carries the way back. `prev` is captured BEFORE the write, so undo restores
  // the exact minute rather than guessing an hour from the row it sat in.
  const unschedule = async (node) => {
    const prev = node.task_time;
    try {
      await unscheduleTask(node);
      await load();
      toast('הוחזר למגירה', {
        action: {
          label: 'ביטול',
          onClick: async () => {
            try { await restoreTaskTime(node, prev); await load(); toast.success('הוחזר ליומן'); }
            catch (e) { toast.error('שגיאה: ' + (e?.message || '')); }
          },
        },
      });
    } catch (e) { toast.error('שגיאה: ' + (e?.message || '')); }
  };

  // ── drag: select, then drag ─────────────────────────────────────
  // One controller for BOTH directions — a row coming in from the drawer and a
  // block moving between hours are the same gesture on the same code path, and
  // both end here with the slot the finger was over.
  const onDrop = useCallback(async (node, rawSlot) => {
    const slot = parseSlotId(rawSlot);
    if (!slot) return;
    if (String(node.task_time || '').slice(0, 5) === timeLabel(slot.hour, slot.quarter)
      && String(node.task_date || '').slice(0, 10) === slot.date) return;   // dropped where it already was
    const prev = placementOf(node);
    try {
      await scheduleTask(node, slot.date, slot.hour, slot.quarter);
      setPending(null); setArmedSlot(null);
      await load();
      toast.success(`נקבע ל-${timeLabel(slot.hour, slot.quarter)}`, {
        action: {
          label: 'ביטול',
          onClick: async () => {
            try { await restorePlacement(node, prev); await load(); toast('בוטל'); }
            catch (e) { toast.error('שגיאה: ' + (e?.message || '')); }
          },
        },
      });
    } catch (e) { toast.error('שגיאה בשיבוץ: ' + (e?.message || '')); }
  }, [load]);

  const drag = useTapDrag({ onDrop });

  // Tapping empty space cancels a selection — and reports whether it did, so
  // the slot underneath knows not to also arm itself on that same tap.
  const clearIfSelected = useCallback(() => {
    if (!drag.selectedId) return false;
    drag.clearSelection();
    return true;
  }, [drag]);

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

      {/* pan-y on the whole screen: vertical scrolling only, so a two-finger
          pinch cannot zoom the browser inside the personal tab. The global
          viewport meta is untouched — every other tab zooms as before. */}
      <div style={{ touchAction: 'pan-y' }}>
        <DayCalendar
          nodes={nodes} logSet={logSet} doneOf={doneOf}
          date={date} onDate={setDate} view={view} onView={pickView}
          zoom={zoom} onZoom={pickZoom}
          armed={armedSlot} onArm={armSlot} onClearArm={() => setArmedSlot(null)}
          onToggleDone={toggleDone} onOpenDoc={openDoc} onUnschedule={unschedule}
          categoryOf={classify} progress={progress}
          itemProps={drag.itemProps} isSelected={drag.isSelected} isArmed={drag.isArmed}
          onEmptyTap={clearIfSelected}
        />

        <TaskBankAccordion
          userId={userId} nodes={nodes} logSet={logSet}
          executions={executions} dayStates={dayStates} date={date}
          pendingId={pending?.id || null} armedSlot={armedSlot}
          classify={classify}
          onPick={pickTask} onOpenDetails={setDetails} onQuickAdd={quickAdd} onSaved={load}
          itemProps={drag.itemProps} isSelected={drag.isSelected} isArmed={drag.isArmed}
        />

        <div style={{ padding: '0 12px 20px' }}>
          <QuickCapture userId={userId} />
        </div>
      </div>

      {/* The floating item. pointerEvents:none — it sits under the finger, and
          elementFromPoint has to see the slot beneath it, not this. */}
      {drag.dragNode && (
        <div ref={drag.ghostRef}
          style={{ position: 'fixed', left: 0, top: 0, transform: 'translate(-50%,-50%)', pointerEvents: 'none', zIndex: 3000,
            padding: '8px 13px', borderRadius: 999, background: '#fff',
            border: `2px solid ${colorOfCategory(classify(drag.dragNode))}`,
            boxShadow: '0 8px 22px rgba(0,0,0,0.28)', fontSize: 13, fontWeight: 800, color: FOCUS.ink, whiteSpace: 'nowrap' }}>
          {drag.dragNode.title}
        </div>
      )}

      {/* Details, not documentation: this is the sheet the map uses, so a task
          is edited in exactly one place. It closes itself on park/delete. */}
      {details && (
        <NodeDetailSheet
          node={nodes.find(n => n.id === details.id) || details}
          ancestors={ancestorsOf(details, indexNodes(nodes).byId)}
          allNodes={nodes}
          onClose={() => setDetails(null)}
          onSaved={load} />
      )}

      {doc && (
        <FocusDocSheet node={doc.node} userId={userId} date={doc.date} existing={doc.existing}
          onClose={() => setDoc(null)}
          onSaved={async () => { setDoc(null); await load(); }}
          onUncheck={async () => { await unlogTask(doc.node, doc.date); setDoc(null); await load(); }} />
      )}
    </LifeOSLayout>
  );
}
