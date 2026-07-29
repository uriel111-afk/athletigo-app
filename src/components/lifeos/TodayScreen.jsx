import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
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
  unlogTask, createNode, BOARD_TAG, PERSONAL_ARM_TITLE,
  indexNodes, ancestorsOf,
} from '@/lib/lifeos/focus-api';
import { fetchExecutions, fetchDayStates } from '@/lib/lifeos/personal-day-api';
import {
  getPlacements, scheduleTask, movePlacement, unschedule, restorePlacement,
  setPlacementDone, snapshotOf, dateOf, startOf, placedNodeIds, estimateMinutes,
  rolloverOncePerDay, schedulingProgress, timeLabel, DEFAULT_DURATION,
} from '@/lib/lifeos/schedule-api';
import { categoryClassifier, colorOfCategory } from '@/lib/lifeos/categories';
import { useTapDrag } from '@/lib/lifeos/use-tap-drag';

// ═══════════════════════════════════════════════════════════════════
// היום — the schedule on top, the task drawer under it
// ═══════════════════════════════════════════════════════════════════
// The calendar renders focus_placements rows; the drawer renders focus_nodes
// that have no placement yet. Placing no longer edits the task — it inserts a
// placement, so the same task can sit twice in one day and a recurring habit
// can be booked on a specific date.
//
// focus_nodes.task_date / task_time are NOT read and NOT written here any
// more. Both columns are still in the database, untouched.
//
// The next-move engine is NOT rendered here. NextMoveScreen.jsx is
// deliberately kept on disk, unreferenced, along with priority-engine.js and
// the focus_modes / focus_day_state reads behind it: the component still works
// as a standalone screen, so bringing it back is a route away and needs no
// rewrite. Nothing on this screen reads it.
//
// Ticking a block is ONE call — setPlacementDone in lib/lifeos/schedule-api —
// which writes all three tables (the placement's done_at, the focus_task_logs
// day mark, one focus_executions row) and, on untick, refuses to clear the day
// mark while another placement of that task on that day is still done. The
// calendar and the habit matrix therefore cannot drift.
//
// Dragging is select-then-drag, in lib/lifeos/use-tap-drag.js — @dnd-kit is
// gone from this screen. It could not express an activation that depends on the
// state of the item under the finger (immediate once armed, 400ms otherwise),
// and its instant drag meant a scroll through the drawer booked hours by
// accident. The controller also owns the scroll lock and the edge auto-scroll.
// ═══════════════════════════════════════════════════════════════════

const CAL_ZOOM_KEY = 'personal_calendar_zoom';
// ─── the loaded window ────────────────────────────────────────────
// Placements are fetched for WINDOW_DAYS either side of an ANCHOR date, and
// the anchor follows the calendar rather than being pinned to today. Without
// that, paging far enough forward or back walked off the end of the loaded
// range and the grid simply drew empty rows — which reads as "nothing is
// booked", the one thing a schedule must never say by accident.
//
// The re-anchor fires before the edge is reached, not at it: the month view
// shows a whole month around `date` plus the neighbouring-month corners, so a
// date sitting exactly on the boundary would still be missing its own tail.
// MARGIN is comfortably wider than any period the calendar can display.
const WINDOW_DAYS = 180;
const REANCHOR_MARGIN = 45;
const windowAround = (anchor) => ({ from: addDays(anchor, -WINDOW_DAYS), to: addDays(anchor, WINDOW_DAYS) });

// ─── the duration a new block opens at ────────────────────────────
// A task's own typical length, so an hour-long strength session books an hour
// instead of a flat 30. This is a SEED: it is written once, at insert time,
// into focus_placements.duration_minutes and stays editable after. durationOf
// still reads that column and ONLY that column, so a block resized later never
// snaps back to whatever net_minutes happens to say.
// Every route that creates a placement goes through it, or the same task would
// get one length when tapped in and another when dragged in.
const seedDuration = (node) => {
  const m = estimateMinutes(node);
  return m > 0 ? m : DEFAULT_DURATION;
};

// `date` is CONTROLLED by PersonalBoard so the day strip can move the
// calendar and the habit matrix together. The local fallback keeps the
// component standalone-renderable (and is what runs if it is ever mounted
// without the pair of props).
export default function TodayScreen({ headerSlot = null, date: dateProp, onDate }) {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const today = isoDate();

  const [nodes, setNodes] = useState([]);
  const [logs, setLogs] = useState([]);
  const [executions, setExecutions] = useState([]);
  const [dayStates, setDayStates] = useState([]);
  const [placements, setPlacements] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const [ownDate, setOwnDate] = useState(today);
  const controlledDate = dateProp !== undefined && typeof onDate === 'function';
  const date = controlledDate ? dateProp : ownDate;
  const setDate = controlledDate ? onDate : setOwnDate;
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

  // The window currently held in `placements`. A ref, not state: `load` must
  // refetch the range that is actually on screen, and making that a dependency
  // would rebuild `load` on every re-anchor and re-run the mount effect.
  const rangeRef = useRef(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const from = addDays(today, -120);
    const w = rangeRef.current || windowAround(today);
    rangeRef.current = w;
    const [ns, lg, ex, ds, pl] = await Promise.all([
      fetchNodes(userId),
      fetchLogs(userId, from, addDays(today, 60)),
      fetchExecutions(userId, from, today),
      fetchDayStates(userId, from, today),
      getPlacements(userId, w.from, w.to),
    ]);
    console.log('[TodayScreen] load ← raw placements', { range: w, rows: pl.length, data: pl });
    setNodes(ns); setLogs(lg); setExecutions(ex); setDayStates(ds); setPlacements(pl);
    setLoaded(true);
  }, [userId, today]);

  useEffect(() => { load(); }, [load]);

  // Re-anchor the window on the visible date and refetch just the placements.
  // Only the placements move: nodes, logs, executions and day states are not
  // windowed by the calendar's cursor.
  const reanchor = useCallback(async (anchor) => {
    if (!userId) return;
    const w = windowAround(anchor);
    rangeRef.current = w;
    const pl = await getPlacements(userId, w.from, w.to);
    console.log('[TodayScreen] placements window re-anchored ← raw', { anchor, from: w.from, to: w.to, rows: pl.length, data: pl });
    setPlacements(pl);
  }, [userId]);

  useEffect(() => {
    if (!loaded || !userId) return;
    const w = rangeRef.current;
    // Still comfortably inside the loaded range → nothing to do.
    if (w && date > addDays(w.from, REANCHOR_MARGIN) && date < addDays(w.to, -REANCHOR_MARGIN)) return;
    reanchor(date).catch(e => toast.error('שגיאה: ' + (e?.message || '')));
  }, [date, loaded, userId, reanchor]);

  // The embedded node from the join carries only id/title/tags/frequency. The
  // category classifier walks parent_id up to the branch, so every placement
  // gets the FULL node swapped in and falls back to the stub if the tree has
  // not arrived yet.
  const byId = useMemo(() => indexNodes(nodes).byId, [nodes]);
  const placed = useMemo(
    () => placements.map(p => ({ ...p, node: byId[p.node_id] || p.node || null })),
    [placements, byId]);
  const placedIds = useMemo(() => placedNodeIds(placements), [placements]);

  useEffect(() => {
    if (!loaded || !placed.length) return;
    let cancelled = false;
    (async () => {
      const moved = await rolloverOncePerDay(placed, today);
      if (!cancelled && moved.length) {
        toast(`${moved.length} משימות שלא בוצעו הועברו להיום`);
        load();
      }
    })();
    return () => { cancelled = true; };
  }, [loaded]);   // once per mount, not per reload

  const logSet = useMemo(() => logSetFrom(logs), [logs]);
  const logMap = useMemo(() => logByKey(logs), [logs]);
  const classify = useMemo(() => categoryClassifier(nodes), [nodes]);
  const progress = useMemo(() => schedulingProgress(nodes, placed, { date, view }), [nodes, placed, date, view]);

  // ── the one write the calendar and the board share ──────────────
  // Three tables, one call. See setPlacementDone in schedule-api.
  const toggleDone = async (placement) => {
    const d = dateOf(placement);
    if (d > today) { toast('אי אפשר לסמן יום עתידי'); return; }
    try {
      const next = !placement.done_at;
      await setPlacementDone(placement, next, { userId, node: placement.node });
      if (next) toast.success('בוצע ✓'); else toast('הסימון בוטל');
      await load();
    } catch (e) { toast.error('שגיאה: ' + (e?.message || '')); }
  };

  const openDoc = (placement) => {
    const node = placement.node;
    if (!node) return;
    const d = dateOf(placement);
    setDoc({ node, date: d, existing: logMap[node.id + '|' + d] || null });
  };

  // ── placement (both routes end here) ────────────────────────────
  const place = async (node, d, hour, quarter) => {
    try {
      await scheduleTask(node.id, d, timeLabel(hour, quarter), seedDuration(node));
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
  // due_date, not task_date: the day this is DUE is a property of the task,
  // the hour it sits at is the placement, and task_date is no longer written.
  const quickAdd = async (title) => {
    if (!armedSlot) return;
    try {
      const { children } = indexNodes(nodes);
      const arm = nodes.find(n => n.node_type !== 'task' && n.title === PERSONAL_ARM_TITLE);
      const parent = arm ? ((children[arm.id] || []).find(b => b.node_type === 'branch')?.id || arm.id) : null;
      if (!parent) { toast.error('לא נמצא ענף לשייך אליו'); return; }
      const created = await createNode(userId, {
        parent_id: parent, node_type: 'task', title, tags: [BOARD_TAG],
        task_kind: 'oneoff', due_date: armedSlot.date, net_minutes: 30, sort_order: 100,
      });
      console.log('[TodayScreen] quickAdd ← raw createNode', created);
      await scheduleTask(created.id, armedSlot.date, timeLabel(armedSlot.hour, armedSlot.quarter), seedDuration(created));
      setArmedSlot(null);
      toast.success('נוספה ושובצה ✓');
      await load();
    } catch (e) { toast.error('שגיאה: ' + (e?.message || '')); }
  };

  // No dialog on the way out — the block leaves the grid at once and the toast
  // carries the way back. The snapshot is taken BEFORE the delete, so undo
  // re-places the exact minute for the exact length rather than guessing.
  const removePlacement = async (placement) => {
    const prev = snapshotOf(placement);
    try {
      await unschedule(placement.id);
      await load();
      toast('הוחזר למגירה', {
        action: {
          label: 'ביטול',
          onClick: async () => {
            try { await restorePlacement(prev); await load(); toast.success('הוחזר ליומן'); }
            catch (e) { toast.error('שגיאה: ' + (e?.message || '')); }
          },
        },
      });
    } catch (e) { toast.error('שגיאה: ' + (e?.message || '')); }
  };

  // ── drag: select, then drag ─────────────────────────────────────
  // One controller for BOTH directions, and the dropped item tells them apart:
  // anything carrying node_id is an existing PLACEMENT being moved, anything
  // else is a task coming in from the drawer for the first time.
  const onDrop = useCallback(async (item, rawSlot) => {
    const slot = parseSlotId(rawSlot);
    if (!slot) return;
    const time = timeLabel(slot.hour, slot.quarter);
    const isPlacement = !!item?.node_id;
    try {
      if (isPlacement) {
        if (startOf(item) === time && dateOf(item) === slot.date) return;   // dropped where it already was
        const prev = snapshotOf(item);
        await movePlacement(item.id, slot.date, time);
        setPending(null); setArmedSlot(null);
        await load();
        toast.success(`נקבע ל-${time}`, {
          action: {
            label: 'ביטול',
            onClick: async () => {
              try { await movePlacement(prev.id, prev.date, prev.start_time); await load(); toast('בוטל'); }
              catch (e) { toast.error('שגיאה: ' + (e?.message || '')); }
            },
          },
        });
        return;
      }
      const created = await scheduleTask(item.id, slot.date, time, seedDuration(item));
      setPending(null); setArmedSlot(null);
      await load();
      toast.success(`נקבע ל-${time}`, {
        action: {
          label: 'ביטול',
          onClick: async () => {
            try { await unschedule(created.id); await load(); toast('בוטל'); }
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

  // The ghost carries either a drawer task or a calendar block.
  const dragged = drag.dragNode;
  const draggedNode = dragged ? (dragged.node || dragged) : null;

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
          placements={placed}
          date={date} onDate={setDate} view={view} onView={pickView}
          zoom={zoom} onZoom={pickZoom}
          armed={armedSlot} onArm={armSlot} onClearArm={() => setArmedSlot(null)}
          onToggleDone={toggleDone} onOpenDoc={openDoc} onUnschedule={removePlacement}
          categoryOf={classify} progress={progress}
          itemProps={drag.itemProps} isSelected={drag.isSelected} isArmed={drag.isArmed}
          onEmptyTap={clearIfSelected}
        />

        <TaskBankAccordion
          userId={userId} nodes={nodes} logSet={logSet}
          executions={executions} dayStates={dayStates} date={date}
          placedIds={placedIds}
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
      {dragged && (
        <div ref={drag.ghostRef}
          style={{ position: 'fixed', left: 0, top: 0, transform: 'translate(-50%,-50%)', pointerEvents: 'none', zIndex: 3000,
            padding: '8px 13px', borderRadius: 999, background: '#fff',
            border: `2px solid ${colorOfCategory(classify(draggedNode))}`,
            boxShadow: '0 8px 22px rgba(0,0,0,0.28)', fontSize: 13, fontWeight: 800, color: FOCUS.ink, whiteSpace: 'nowrap' }}>
          {draggedNode?.title}
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
