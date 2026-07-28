import React, { useMemo, useRef, useState } from 'react';
import { ChevronDown, Plus, Check, X, Clock, Info, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import {
  FOCUS, hexAlpha, isoDate, dowOf, HEB_DAYS_FULL, BOARD_TAG, BANK_TAG, INSPIRATION_TAG,
  PERSONAL_ARM_TITLE, indexNodes, createNode, deleteNode, weeklyTargetOf, weekDoneCount, taskLoggedOn,
} from '@/lib/lifeos/focus-api';
import { timeLabel, durationOf } from '@/lib/lifeos/schedule-api';
import { categoryClassifier, groupByCategory, CATEGORIES, catTagFor } from '@/lib/lifeos/categories';
import { weekProgressMap } from '@/lib/lifeos/week-math';

// ═══════════════════════════════════════════════════════════════════
// מגירת משימות — collapsed category rows, full-width task rows
// ═══════════════════════════════════════════════════════════════════
// The drawer is now the ONE place unscheduled work lives. The calendar above no
// longer keeps its own "ללא שעה" strip, so a task waiting for an hour is
// counted once, in one header: "N ממתינות" = tasks with no task_time.
//
// Categories come from src/lib/lifeos/categories.js, not from the branch tree,
// because the tree merges domains the user wants apart (צילום and עריכה both
// sit under 'יצירה'). Each category keeps its own fixed colour, and that same
// colour paints its dots in the month view.
//
// Every category starts CLOSED. The old default opened whatever was live today,
// which meant the drawer opened at a different height every morning; a closed
// drawer is a stable, scannable list of domains instead.
//
// NOTHING here scrolls on its own. An open category grows to fit every row it
// has and the page scrolls as one surface. The drawer used to cap a category
// and scroll inside it, which cost two things: rows were sliced in half at the
// cap, and a drag that crossed the boundary was captured by the inner scroller
// and died. Closed categories are what keeps the drawer short — not a clipped
// window onto an open one.
//
// Order inside an open category is a fixed four-tier rule, not by date or name:
//   0  a one-off already due (due/task_date <= today)      — it is late
//   1  a recurring habit behind its weekly pace           — it is slipping
//   2  a recurring habit on pace                          — it is fine
//   3  every other one-off (due later, or with no date)    — it can wait
// Pace is pro-rata inside the week: target × (days elapsed / 7). On Sunday a
// 3×/week habit is not yet "behind" at 0 done; by Thursday it is.
//
// Scheduling is the + BUTTON and nothing else. A tap on the body of a row
// selects it for dragging, and the ⓘ button opens its details. Scheduling used
// to share the body tap, which meant every mis-tap while reading the drawer
// silently booked an hour — the worst kind of bug, because the calendar then
// looks planned when it is not.
// A tap that drifts more than MOVE_CANCEL pixels between down and up is a
// scroll and does nothing at all, since the drawer is a scrolling surface.
//
// The drawer has two states:
//   idle   — the + button ARMS the task; the next slot tap places it
//   picker — a slot is already armed, so the drawer lights up and + places the
//            task straight into that slot. Quick-add creates and places at once.
//
// Dragging a row to the calendar is select-then-drag (lib/lifeos/use-tap-drag),
// the same controller the calendar's own blocks use. It is deliberately NOT
// bound to a plain touch: the drawer scrolls, and a scroll that books an hour
// is worse than no drag at all. Delete mode opts out entirely.
// ═══════════════════════════════════════════════════════════════════

// Finger slop: past this the gesture was a scroll, not a tap.
const MOVE_CANCEL = 10;
// Full touch target for the one destructive-ish action in the row.
const PLUS_SIZE = 44;

const FREQS = [
  { key: 'oneoff', label: 'חד פעמית' },
  { key: 'daily', label: 'כל יום' },
  { key: 'weeklyN', label: 'כמה פעמים בשבוע' },
  { key: 'weekly', label: 'ביום קבוע' },
];

export default function TaskBankAccordion({
  nodes = [], logSet = new Set(), executions = [], dayStates = [],
  date = isoDate(), pendingId = null, armedSlot = null,
  onPick, onOpenDetails, onQuickAdd, onSaved, userId, classify,
  itemProps = () => ({}), isSelected = () => false, isArmed = () => false,
}) {
  const today = isoDate();
  const [open, setOpen] = useState(() => new Set());   // every category closed
  // null → closed. A string → open with that category preselected; '' → open
  // with nothing preselected (the footer button).
  const [addOpen, setAddOpen] = useState(null);
  const [quick, setQuick] = useState('');
  const [delMode, setDelMode] = useState(false);
  const [sel, setSel] = useState(() => new Set());
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const { children } = useMemo(() => indexNodes(nodes), [nodes]);
  const arm = useMemo(() => nodes.find(n => n.node_type !== 'task' && n.title === PERSONAL_ARM_TITLE), [nodes]);

  const classifier = useMemo(() => classify || categoryClassifier(nodes), [classify, nodes]);

  const tasks = useMemo(() => nodes.filter(t =>
    t.node_type === 'task' &&
    (!t.status || t.status === 'active') &&
    !(t.tags || []).includes(BANK_TAG) &&
    !(t.tags || []).includes(INSPIRATION_TAG)), [nodes]);

  const categories = useMemo(() => groupByCategory(tasks, classifier), [tasks, classifier]);

  // "ממתינות" = has no hour yet. That is what the drawer is for, so it is the
  // number the header carries.
  const waiting = useMemo(() => tasks.filter(t => !t.task_time), [tasks]);
  const waitingIds = useMemo(() => new Set(waiting.map(t => t.id)), [waiting]);

  // Personal habits show the executions-based weekly number, the same one the
  // board shows, so one habit never reports two different counts.
  const personalIds = useMemo(() => {
    const s = new Set();
    if (!arm) return s;
    const stack = [arm.id];
    while (stack.length) {
      const id = stack.pop();
      (children[id] || []).forEach(c => { s.add(c.id); stack.push(c.id); });
    }
    return s;
  }, [arm, children]);
  const personalProgress = useMemo(
    () => weekProgressMap(tasks.filter(t => personalIds.has(t.id)), executions, { date, dayStates }),
    [tasks, personalIds, executions, date, dayStates]);

  // ── one weekly ratio per recurring task, whichever source owns it ──
  const ratioOf = (t) => {
    if (!t.frequency) return null;                     // a one-off has no ratio
    if (personalIds.has(t.id)) {
      const p = personalProgress[t.id];
      return p ? { count: p.count, target: p.target } : null;
    }
    const N = weeklyTargetOf(t) || (t.frequency === 'daily' ? 7 : null);
    return N ? { count: weekDoneCount(t, logSet, today), target: N } : null;
  };

  // ── the four-tier order ────────────────────────────────────────────
  const dueOf = (t) => String(t.due_date || t.task_date || '').slice(0, 10);
  const tierOf = (t) => {
    if (!t.frequency) {
      const d = dueOf(t);
      return d && d <= today ? 0 : 3;
    }
    const r = ratioOf(t);
    if (!r || !r.target) return 2;
    const elapsed = dowOf(today) + 1;                  // 1 on Sunday … 7 on Saturday
    return r.count < (r.target * elapsed) / 7 ? 1 : 2;
  };
  // Inside a tier: dated before undated, earlier date first, then by title so
  // the order is stable between renders (two equal rows never swap places).
  const sortTasks = (list) => [...list].sort((a, b) => {
    const t = tierOf(a) - tierOf(b);
    if (t) return t;
    const da = dueOf(a), db = dueOf(b);
    if (da && db && da !== db) return da < db ? -1 : 1;
    if (!!da !== !!db) return da ? -1 : 1;
    return String(a.title).localeCompare(String(b.title), 'he');
  });

  const isOpen = (c) => open.has(c.key);
  const toggle = (key) => setOpen(prev => {
    const s = new Set(prev);
    if (s.has(key)) s.delete(key); else s.add(key);
    return s;
  });

  // Short right-hand label: a ratio for a recurring task, a duration for a
  // one-off. Done-today wins over both, because that is the whole answer.
  const labelOf = (t) => {
    if (taskLoggedOn(t, logSet, today)) return '✓ היום';
    const r = ratioOf(t);
    if (r) return `${r.count}/${r.target} השבוע`;
    return `${durationOf(t)} דק׳`;
  };

  const picking = !!armedSlot;

  const submitQuick = async () => {
    const t = quick.trim();
    if (!t) return;
    setQuick('');
    await onQuickAdd(t);
  };

  // ── delete mode ────────────────────────────────────────────────────
  // For clearing SEEDED rows the user never wanted. Nothing is deleted without
  // an explicit selection and an explicit confirmation, and deleteNode cascades
  // to the node's own notes and logs (FK on delete cascade).
  const exitDelete = () => { setDelMode(false); setSel(new Set()); setConfirming(false); };
  const toggleSel = (id) => setSel(prev => {
    const s = new Set(prev);
    if (s.has(id)) s.delete(id); else s.add(id);
    return s;
  });
  const runDelete = async () => {
    if (busy || !sel.size) return;
    setBusy(true);
    let ok = 0;
    for (const id of sel) {
      try { await deleteNode(id); ok += 1; }
      catch (e) { toast.error('שגיאה במחיקה: ' + (e?.message || '')); }
    }
    setBusy(false);
    exitDelete();
    if (ok) toast.success(ok === 1 ? 'משימה נמחקה' : `${ok} משימות נמחקו`);
    if (onSaved) onSaved();
  };

  return (
    <div style={{
      margin: '0 12px 12px', padding: picking ? 8 : 0, borderRadius: 16,
      border: picking ? `2px solid ${FOCUS.orange}` : '2px solid transparent',
      background: picking ? hexAlpha(FOCUS.orange, 0.06) : 'transparent',
      transition: 'background .18s, border-color .18s',
    }}>
      {/* ── header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 13.5, fontWeight: 800, color: picking ? '#B4531A' : FOCUS.ink }}>
          {picking ? `בחר משימה ל-${timeLabel(armedSlot.hour, armedSlot.quarter)}` : 'מגירת משימות'}
        </span>
        {!picking && (
          <span style={{ fontSize: 11, fontWeight: 800, color: FOCUS.muted, background: '#fff', border: `1px solid ${FOCUS.border}`, borderRadius: 999, padding: '2px 9px' }}>
            {waiting.length} ממתינות
          </span>
        )}
        <span style={{ flex: 1 }} />
        <button onClick={() => (delMode ? exitDelete() : setDelMode(true))}
          aria-pressed={delMode}
          title={delMode ? 'יציאה ממצב מחיקה' : 'מצב מחיקה'}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 800,
            border: `1px solid ${delMode ? FOCUS.red : FOCUS.border}`,
            background: delMode ? hexAlpha(FOCUS.red, 0.1) : '#fff',
            color: delMode ? FOCUS.red : FOCUS.muted }}>
          {delMode ? <><X size={13} /> ביטול</> : <><Trash2 size={13} /> מחיקה</>}
        </button>
      </div>

      {delMode && (
        <div style={{ fontSize: 11.5, color: FOCUS.muted, background: '#fff', border: `1px solid ${FOCUS.border}`, borderRadius: 11, padding: '8px 11px', marginBottom: 8, lineHeight: 1.5 }}>
          סמן משימות למחיקה. פתח קטגוריה כדי לראות את המשימות שלה.
        </div>
      )}

      {/* Quick add lives INSIDE the picker: create and place without leaving
          the flow, which is the point of not using a modal here. */}
      {picking && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <input value={quick} onChange={(e) => setQuick(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitQuick(); }}
            placeholder="הוספה מהירה ושיבוץ…"
            style={{ flex: 1, minWidth: 0, border: `1px solid ${FOCUS.orange}`, borderRadius: 11, padding: '9px 11px', fontSize: 13.5, fontFamily: 'inherit', color: FOCUS.ink, background: '#fff', outline: 'none' }} />
          <button onClick={submitQuick} disabled={!quick.trim()}
            style={{ flexShrink: 0, padding: '0 14px', borderRadius: 11, border: 'none', background: quick.trim() ? FOCUS.orangeGrad : FOCUS.border, color: '#fff', fontSize: 13, fontWeight: 800, cursor: quick.trim() ? 'pointer' : 'default', fontFamily: 'inherit' }}>
            שבץ
          </button>
        </div>
      )}

      {/* ── collapsed category rows ── */}
      {categories.length === 0 ? (
        <div style={{ fontSize: 12.5, color: FOCUS.muted, padding: '14px 2px', textAlign: 'center' }}>אין עדיין משימות</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {categories.map(c => {
            const on = isOpen(c);
            const openCount = c.tasks.filter(t => waitingIds.has(t.id)).length;
            const rows = on ? sortTasks(c.tasks) : [];
            // No `overflow: hidden` on the card. It was there to clip the header
            // to the rounded corners, but it also clipped a selected row's scale
            // and an armed row's shadow at the card edge — a row visibly cut off.
            // The header rounds its own top corners instead, so nothing clips.
            return (
              <div key={c.key} style={{ background: FOCUS.card, border: `1px solid ${on ? hexAlpha(c.color, 0.45) : FOCUS.border}`, borderRadius: 13, boxShadow: FOCUS.neu }}>
                <button onClick={() => toggle(c.key)}
                  aria-expanded={on}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '11px 12px', border: 'none', background: on ? hexAlpha(c.color, 0.1) : '#fff', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'right',
                    borderTopLeftRadius: 12, borderTopRightRadius: 12,
                    borderBottomLeftRadius: on ? 0 : 12, borderBottomRightRadius: on ? 0 : 12 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 800, color: FOCUS.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 800, borderRadius: 999, padding: '2px 8px', flexShrink: 0, minWidth: 22, textAlign: 'center',
                    background: openCount ? c.color : '#fff',
                    border: openCount ? 'none' : `1px solid ${FOCUS.border}`,
                    color: openCount ? '#fff' : FOCUS.muted }}>{openCount}</span>
                  <ChevronDown size={16} color={FOCUS.muted} style={{ flexShrink: 0, transform: on ? 'none' : 'rotate(90deg)', transition: 'transform .15s' }} />
                </button>

                {on && (
                  // No maxHeight, no overflow, no overscroll containment: an open
                  // category is as tall as its rows and the PAGE scrolls. A nested
                  // scroller cut rows in half at its edges and swallowed a drag the
                  // moment the finger crossed out of it, which is exactly the
                  // gesture the drag model depends on.
                  <div style={{ padding: '8px 10px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {rows.map(t => (
                      <TaskRow key={t.id} node={t} color={c.color}
                        done={taskLoggedOn(t, logSet, today)}
                        late={tierOf(t) === 0}
                        behind={tierOf(t) === 1}
                        pending={pendingId === t.id}
                        picking={picking}
                        label={labelOf(t)}
                        scheduled={!!t.task_time}
                        delMode={delMode}
                        checked={sel.has(t.id)}
                        dragSelected={isSelected(t.id)}
                        dragArmed={isArmed(t.id)}
                        dragProps={itemProps(t)}
                        onPick={() => onPick(t)}
                        onOpenDetails={() => onOpenDetails && onOpenDetails(t)}
                        onSelect={() => toggleSel(t.id)} />
                    ))}

                    {/* Last row of every open category: add straight into THIS
                        category, so the sheet opens already filed. */}
                    {!delMode && (
                      <button onClick={() => setAddOpen(c.key)}
                        style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', boxSizing: 'border-box',
                          padding: '10px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'right',
                          border: `1px dashed ${hexAlpha(c.color, 0.55)}`, background: '#fff' }}>
                        <Plus size={15} color={c.color} style={{ flexShrink: 0 }} />
                        <span style={{ fontSize: 12.5, fontWeight: 800, color: c.color }}>משימה חדשה ב{c.label}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── footer: delete bar in delete mode, otherwise + משימה חדשה ── */}
      {delMode ? (
        <button onClick={() => sel.size && setConfirming(true)} disabled={!sel.size}
          style={{ width: '100%', marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '13px', borderRadius: 14, border: 'none', fontFamily: 'inherit', fontSize: 14.5, fontWeight: 800,
            background: sel.size ? FOCUS.red : FOCUS.border, color: '#fff', cursor: sel.size ? 'pointer' : 'default' }}>
          <Trash2 size={16} /> {sel.size ? `מחק ${sel.size} משימות` : 'לא נבחרו משימות'}
        </button>
      ) : (
        // Unchanged: no category preselected.
        <button onClick={() => setAddOpen('')}
          style={{ width: '100%', marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '13px', borderRadius: 14, border: 'none', background: FOCUS.orangeGrad, color: '#fff', fontSize: 14.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
          <Plus size={17} /> משימה חדשה
        </button>
      )}

      {confirming && (
        <ConfirmDelete count={sel.size} busy={busy}
          onCancel={() => setConfirming(false)} onConfirm={runDelete} />
      )}

      {addOpen !== null && (
        <NewTaskSheet userId={userId} nodes={nodes} classifier={classifier}
          initialCategory={addOpen || null}
          onClose={() => setAddOpen(null)}
          onSaved={(key) => {
            setAddOpen(null);
            // Open the category it landed in, so it is visible without hunting.
            if (key) setOpen(prev => new Set(prev).add(key));
            onSaved && onSaved();
          }} />
      )}
    </div>
  );
}

// ── one full-width task row ───────────────────────────────────────
// Five gestures, five outcomes, no overlap:
//   tap the body      → select for dragging (delete mode: tick the checkbox)
//   tap it again      → arm it; the next touch drags
//   hold 400ms        → drag straight away
//   tap the +         → schedule, with no selection step at all
//   tap the ⓘ         → task details
// A tap that drifted past MOVE_CANCEL does nothing: that was a scroll, and the
// drawer is a scrolling surface. `dragProps` supplies the pointerdown that
// drives selection and the long press; it is chained, not replaced. The two
// buttons stop pointerdown from reaching it, so neither also selects the row.
function TaskRow({ node, color, done, late, behind, pending, picking, label, scheduled, delMode, checked, dragSelected, dragArmed, dragProps = {}, onPick, onOpenDetails, onSelect }) {
  const down = useRef(null);
  const dnd = delMode ? {} : dragProps;
  const onPointerDown = (e) => {
    down.current = { x: e.clientX, y: e.clientY };
    if (dnd.onPointerDown) dnd.onPointerDown(e);
  };
  const tapped = (e) => {
    const d = down.current;
    down.current = null;
    if (!d) return true;                       // keyboard / synthetic click
    return Math.hypot(e.clientX - d.x, e.clientY - d.y) <= MOVE_CANCEL;
  };

  const edge = delMode && checked ? FOCUS.red
    : dragArmed ? FOCUS.orange
      : dragSelected ? hexAlpha(FOCUS.orange, 0.85)
        : pending ? FOCUS.orange
          : late ? hexAlpha('#E24B4A', 0.5)
            : done ? hexAlpha('#16a34a', 0.45)
              : hexAlpha(color, 0.3);

  // Delete mode only. Outside it, a body tap is selection, and selection is the
  // drag controller's job — it fires on pointerup inside dragProps, so there is
  // deliberately nothing to do here.
  const onBody = (e) => {
    if (!delMode) return;
    if (!tapped(e)) return;                    // it was a scroll
    onSelect();
  };

  return (
    <div {...dnd}
      onPointerDown={onPointerDown} onClick={onBody}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%', boxSizing: 'border-box',
        // Tight on the + side (it brings its own 44px), roomier on the grip side.
        padding: '5px 10px 5px 6px', borderRadius: 12, cursor: delMode ? 'pointer' : 'grab',
        fontFamily: 'inherit', touchAction: 'pan-y',
        // A 400ms hold must become a drag, not the browser's text-selection
        // callout, which would eat the gesture on iOS.
        userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none',
        border: `${dragSelected || dragArmed ? 2 : 1}px solid ${edge}`,
        transform: dragSelected || dragArmed ? 'scale(1.02)' : 'none',
        boxShadow: dragArmed ? `0 3px 12px ${hexAlpha(FOCUS.orange, 0.4)}` : 'none',
        transition: 'transform .12s, box-shadow .12s',
        background: delMode && checked ? hexAlpha(FOCUS.red, 0.07)
          : dragSelected || dragArmed || pending ? hexAlpha(FOCUS.orange, 0.14)
            : done ? hexAlpha('#16a34a', 0.06)
              : picking ? '#fff' : hexAlpha(color, 0.04),
      }}>

      {delMode ? (
        <span style={{ width: 19, height: 19, borderRadius: 5, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: checked ? 'none' : `1.5px solid ${FOCUS.border}`, background: checked ? FOCUS.red : '#fff', color: '#fff' }}>
          {checked && <Check size={13} />}
        </span>
      ) : (
        // Details moved here. A body tap is SELECTION now, so it cannot also
        // open a sheet — one gesture, one outcome. This is the only remaining
        // way in, so it is a real button with a label, not a decorative grip.
        <button onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onOpenDetails(); }}
          aria-label={`פרטי המשימה: ${node.title}`} title="פרטי המשימה"
          style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 8, border: `1px solid ${hexAlpha(color, 0.35)}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
          <Info size={14} color={hexAlpha(color, 0.9)} />
        </button>
      )}

      {done && <Check size={13} color="#15803d" style={{ flexShrink: 0 }} />}
      {scheduled && !done && <Clock size={12} color={FOCUS.muted} style={{ flexShrink: 0 }} />}

      <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: behind || late ? 800 : 700,
        color: done ? '#15803d' : FOCUS.ink, textDecoration: done ? 'line-through' : 'none',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {node.title}
      </span>

      <span style={{ fontSize: 10.5, fontWeight: 700, flexShrink: 0,
        color: late ? '#C2410C' : behind ? '#B4531A' : FOCUS.muted }}>
        {label}
      </span>

      {!delMode && (
        <button
          // Seeds the slop check itself, then keeps the gesture away from the
          // drag controller: + schedules immediately, with no selection step.
          onPointerDown={(e) => { down.current = { x: e.clientX, y: e.clientY }; e.stopPropagation(); }}
          onClick={(e) => { e.stopPropagation(); if (tapped(e)) onPick(); }}
          aria-label={`שבץ ביומן: ${node.title}`}
          style={{ width: PLUS_SIZE, height: PLUS_SIZE, flexShrink: 0, borderRadius: 12, border: 'none', background: FOCUS.orangeGrad, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
          <Plus size={20} />
        </button>
      )}
    </div>
  );
}

// ── מחיקה — one confirmation, no silent deletes ───────────────────
function ConfirmDelete({ count, busy, onCancel, onConfirm }) {
  return (
    <div dir="rtl" onClick={onCancel}
      style={{ position: 'fixed', inset: 0, zIndex: 1460, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 380, background: '#fff', borderRadius: 18, padding: 18, boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <AlertTriangle size={19} color={FOCUS.red} style={{ flexShrink: 0 }} />
          <div style={{ fontSize: 15.5, fontWeight: 800, color: FOCUS.ink }}>
            למחוק {count === 1 ? 'משימה אחת' : `${count} משימות`}?
          </div>
        </div>
        <div style={{ fontSize: 12.5, color: FOCUS.muted, lineHeight: 1.6, marginBottom: 16 }}>
          המחיקה מוחקת גם את היסטוריית הסימונים של אותן משימות, ואין דרך לשחזר.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onConfirm} disabled={busy}
            style={{ flex: 1, padding: '12px', borderRadius: 13, border: 'none', background: FOCUS.red, color: '#fff', fontSize: 14, fontWeight: 800, cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit', opacity: busy ? 0.7 : 1 }}>
            {busy ? 'מוחק…' : 'מחק'}
          </button>
          <button onClick={onCancel} disabled={busy}
            style={{ flex: 1, padding: '12px', borderRadius: 13, border: `1px solid ${FOCUS.border}`, background: '#fff', color: FOCUS.ink, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}

// ── + משימה חדשה ──────────────────────────────────────────────────
function NewTaskSheet({ userId, nodes, classifier, initialCategory = null, onClose, onSaved }) {
  const [title, setTitle] = useState('');
  const [catKey, setCatKey] = useState(initialCategory || CATEGORIES[0].key);
  const [freq, setFreq] = useState('oneoff');
  const [times, setTimes] = useState(3);
  const [dow, setDow] = useState(0);
  const [when, setWhen] = useState(isoDate());
  const [minutes, setMinutes] = useState(30);
  const [busy, setBusy] = useState(false);

  // A category is a view over the tree, not a node, so a new task still needs a
  // real parent. Pick the branch whose existing tasks already classify into the
  // chosen category; fall back to the personal arm.
  const parentFor = (key) => {
    const { byId, children } = indexNodes(nodes);
    const arm = nodes.find(n => n.node_type !== 'task' && n.title === PERSONAL_ARM_TITLE);
    const branches = arm ? (children[arm.id] || []).filter(b => b.node_type === 'branch') : [];
    const score = branches.map(b => ({
      b, n: (children[b.id] || []).filter(t => t.node_type === 'task' && classifier(t) === key).length,
    })).sort((x, y) => y.n - x.n)[0];
    if (score && score.n > 0) return score.b.id;
    return branches[0]?.id || arm?.id || Object.keys(byId)[0] || null;
  };

  const save = async () => {
    const t = title.trim();
    const parent = parentFor(catKey);
    if (!t || !parent || busy) return;
    setBusy(true);
    try {
      // catTagFor pins the task to the category the user actually chose. Without
      // it the title keywords would re-classify it on the next render, and a
      // task added inside a category could appear in a different one.
      const tags = [BOARD_TAG, catTagFor(catKey)];
      const fields = {
        parent_id: parent, node_type: 'task', title: t, sort_order: 100,
        net_minutes: Number(minutes) || 30,
      };
      if (freq === 'oneoff') {
        fields.task_kind = 'oneoff';
        fields.task_date = when || null;
      } else {
        fields.task_kind = 'recurring';
        fields.frequency = freq === 'weekly' ? 'weekly' : 'daily';
        if (freq === 'weekly') fields.day_of_week = Number(dow);
        if (freq === 'weeklyN') { tags.push(`w:${times}`); fields.weekly_target = times; }
        if (freq === 'daily') fields.weekly_target = 7;
      }
      fields.tags = tags;
      await createNode(userId, fields);
      toast.success('נוספה ✓');
      onSaved(catKey);
    } catch (e) { toast.error('שגיאה: ' + (e?.message || '')); setBusy(false); }
  };

  return (
    <div dir="rtl" onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1440, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 560, maxHeight: '88vh', overflowY: 'auto', background: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: '16px 16px calc(env(safe-area-inset-bottom,0px) + 20px)', boxShadow: '0 -6px 24px rgba(0,0,0,0.15)' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: FOCUS.ink }}>משימה חדשה</div>
          <button onClick={onClose} aria-label="סגור" style={{ background: 'none', border: 'none', cursor: 'pointer', color: FOCUS.muted }}><X size={20} /></button>
        </div>

        <div style={lbl}>שם</div>
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="מה צריך לעשות" style={inp} />

        <div style={lbl}>קטגוריה</div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {CATEGORIES.filter(c => c.key !== 'other').map(c => {
            const on = catKey === c.key;
            return (
              <button key={c.key} onClick={() => setCatKey(c.key)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '7px 11px', borderRadius: 18, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: on ? 800 : 600, whiteSpace: 'nowrap',
                  border: `1px solid ${on ? c.color : FOCUS.border}`, background: on ? hexAlpha(c.color, 0.14) : '#fff', color: on ? c.color : FOCUS.muted }}>
                <c.Icon size={12} /> {c.label}
              </button>
            );
          })}
        </div>

        <div style={lbl}>משך ברירת מחדל (דקות)</div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {[10, 15, 30, 45, 60, 90].map(m => (
            <button key={m} onClick={() => setMinutes(m)}
              style={{ flex: 1, padding: '8px 0', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: minutes === m ? 800 : 600,
                border: `1px solid ${minutes === m ? FOCUS.orange : FOCUS.border}`, background: minutes === m ? hexAlpha(FOCUS.orange, 0.14) : '#fff', color: minutes === m ? '#B4531A' : FOCUS.ink }}>{m}</button>
          ))}
        </div>

        <div style={lbl}>תדירות</div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {FREQS.map(f => {
            const on = freq === f.key;
            return (
              <button key={f.key} onClick={() => setFreq(f.key)}
                style={{ flex: '1 0 auto', padding: '8px 12px', borderRadius: 18, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: on ? 800 : 600, whiteSpace: 'nowrap',
                  border: `1px solid ${on ? FOCUS.orange : FOCUS.border}`, background: on ? hexAlpha(FOCUS.orange, 0.14) : '#fff', color: on ? '#B4531A' : FOCUS.muted }}>
                {f.label}
              </button>
            );
          })}
        </div>

        {freq === 'oneoff' && (<><div style={lbl}>מתי</div>
          <input type="date" value={when} onChange={(e) => setWhen(e.target.value)} style={inp} /></>)}

        {freq === 'weeklyN' && (<><div style={lbl}>כמה פעמים בשבוע</div>
          <div style={{ display: 'flex', gap: 5 }}>
            {[1, 2, 3, 4, 5, 6, 7].map(n => (
              <button key={n} onClick={() => setTimes(n)}
                style={{ flex: 1, padding: '8px 0', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: times === n ? 800 : 600,
                  border: `1px solid ${times === n ? FOCUS.orange : FOCUS.border}`, background: times === n ? hexAlpha(FOCUS.orange, 0.14) : '#fff', color: times === n ? '#B4531A' : FOCUS.ink }}>{n}</button>
            ))}
          </div></>)}

        {freq === 'weekly' && (<><div style={lbl}>באיזה יום</div>
          <select value={dow} onChange={(e) => setDow(e.target.value)} style={inp}>
            {HEB_DAYS_FULL.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select></>)}

        <button onClick={save} disabled={!title.trim() || busy}
          style={{ width: '100%', marginTop: 16, padding: '13px', borderRadius: 14, border: 'none', background: !title.trim() ? FOCUS.border : FOCUS.orangeGrad, color: '#fff', fontSize: 15, fontWeight: 800, cursor: !title.trim() ? 'default' : 'pointer', fontFamily: 'inherit' }}>
          {busy ? 'שומר…' : 'הוסף'}
        </button>
      </div>
    </div>
  );
}

const lbl = { fontSize: 11, fontWeight: 700, color: FOCUS.muted, margin: '12px 0 5px' };
const inp = { width: '100%', boxSizing: 'border-box', border: `1px solid ${FOCUS.border}`, borderRadius: 11, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', color: FOCUS.ink, background: '#FFFDFA', outline: 'none' };
