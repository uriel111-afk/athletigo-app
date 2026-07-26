import React, { useMemo, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { ChevronDown, Plus, Check, X, Clock, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import {
  FOCUS, hexAlpha, isoDate, HEB_DAYS_FULL, BOARD_TAG, BANK_TAG, INSPIRATION_TAG,
  PERSONAL_ARM_TITLE, indexNodes, createNode, weeklyTargetOf, weekDoneCount, taskLoggedOn,
} from '@/lib/lifeos/focus-api';
import { occursOn, timeLabel, durationOf } from '@/lib/lifeos/schedule-api';
import { categoryClassifier, groupByCategory, CATEGORIES } from '@/lib/lifeos/categories';
import { weekProgressMap } from '@/lib/lifeos/week-math';

// ═══════════════════════════════════════════════════════════════════
// בנק משימות — one collapsible category per real domain
// ═══════════════════════════════════════════════════════════════════
// Categories come from src/lib/lifeos/categories.js, not from the branch tree,
// because the tree merges domains the user wants apart (צילום and עריכה both
// sit under 'יצירה'). Each category keeps its own fixed colour, and that same
// colour paints its dots in the month view.
//
// Closed, a category is only its header (icon + name + count). Open, its list
// is height-capped and scrolls inside itself, so a domain with fifty tasks
// still cannot push the schedule off the screen.
//
// The bank has two states:
//   idle   — tapping a task ARMS the task; the next slot tap places it
//   picker — a slot is already armed, so the whole bank lights up and the next
//            task tap places it there. Quick-add creates and places in one go.
// Every chip is also a @dnd-kit draggable, so the drag route needs no separate
// markup.
// ═══════════════════════════════════════════════════════════════════

const OPEN_MAX_H = 210;

const FREQS = [
  { key: 'oneoff', label: 'חד פעמית' },
  { key: 'daily', label: 'כל יום' },
  { key: 'weeklyN', label: 'כמה פעמים בשבוע' },
  { key: 'weekly', label: 'ביום קבוע' },
];

export default function TaskBankAccordion({
  nodes = [], logSet = new Set(), executions = [], dayStates = [],
  date = isoDate(), pendingId = null, armedSlot = null,
  onPick, onQuickAdd, onSaved, userId, classify,
}) {
  const today = isoDate();
  const [open, setOpen] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [quick, setQuick] = useState('');

  const { children } = useMemo(() => indexNodes(nodes), [nodes]);
  const arm = useMemo(() => nodes.find(n => n.node_type !== 'task' && n.title === PERSONAL_ARM_TITLE), [nodes]);

  const classifier = useMemo(() => classify || categoryClassifier(nodes), [classify, nodes]);

  const tasks = useMemo(() => nodes.filter(t =>
    t.node_type === 'task' &&
    (!t.status || t.status === 'active') &&
    !(t.tags || []).includes(BANK_TAG) &&
    !(t.tags || []).includes(INSPIRATION_TAG)), [nodes]);

  const categories = useMemo(() => groupByCategory(tasks, classifier), [tasks, classifier]);

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

  const liveToday = (t) => !taskLoggedOn(t, logSet, today) && occursOn(t, today);
  const defaultOpen = useMemo(
    () => new Set(categories.filter(c => c.tasks.some(liveToday)).map(c => c.key)),
    [categories, logSet, today]);   // liveToday closes over logSet/today
  const openKeys = open || defaultOpen;
  const isOpen = (c) => openKeys.has(c.key);
  const toggle = (key) => setOpen(prev => {
    const s = new Set(prev || defaultOpen);
    if (s.has(key)) s.delete(key); else s.add(key);
    return s;
  });

  const weekLabel = (t) => {
    if (taskLoggedOn(t, logSet, today)) return '✓ היום';
    if (personalIds.has(t.id)) {
      const p = personalProgress[t.id];
      return p ? `${p.count}/${p.target} השבוע` : null;
    }
    const N = weeklyTargetOf(t);
    if (N) return `${weekDoneCount(t, logSet, today)}/${N} השבוע`;
    return t.frequency === 'daily' ? 'יומי' : null;
  };

  const picking = !!armedSlot;

  const submitQuick = async () => {
    const t = quick.trim();
    if (!t) return;
    setQuick('');
    await onQuickAdd(t);
  };

  return (
    <div style={{
      margin: '0 12px 12px', padding: picking ? 8 : 0, borderRadius: 16,
      border: picking ? `2px solid ${FOCUS.orange}` : '2px solid transparent',
      background: picking ? hexAlpha(FOCUS.orange, 0.06) : 'transparent',
      transition: 'background .18s, border-color .18s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 7 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: picking ? '#B4531A' : FOCUS.ink }}>
          {picking ? `בחר משימה ל-${timeLabel(armedSlot.hour, armedSlot.quarter)}` : 'בנק משימות'}
        </span>
        <button onClick={() => setAddOpen(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '7px 12px', borderRadius: 11, border: 'none', background: FOCUS.orangeGrad, color: '#fff', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
          <Plus size={14} /> משימה חדשה
        </button>
      </div>

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

      {categories.length === 0 ? (
        <div style={{ fontSize: 12.5, color: FOCUS.muted, padding: '14px 2px', textAlign: 'center' }}>אין עדיין משימות</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {categories.map(c => {
            const on = isOpen(c);
            const openCount = c.tasks.filter(t => !taskLoggedOn(t, logSet, today)).length;
            const Icon = c.Icon;
            return (
              <div key={c.key} style={{ background: FOCUS.card, border: `1px solid ${on ? hexAlpha(c.color, 0.45) : FOCUS.border}`, borderRadius: 13, boxShadow: FOCUS.neu, overflow: 'hidden' }}>
                <button onClick={() => toggle(c.key)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 11px', border: 'none', background: on ? hexAlpha(c.color, 0.1) : '#fff', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'right' }}>
                  <ChevronDown size={15} color={c.color} style={{ flexShrink: 0, transform: on ? 'none' : 'rotate(90deg)', transition: 'transform .15s' }} />
                  <Icon size={15} color={c.color} style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 800, color: FOCUS.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#fff', background: c.color, borderRadius: 999, padding: '2px 8px', flexShrink: 0, minWidth: 22, textAlign: 'center' }}>{openCount}</span>
                </button>

                {on && (
                  <div style={{ maxHeight: OPEN_MAX_H, overflowY: 'auto', padding: '4px 10px 10px', display: 'flex', flexWrap: 'wrap', gap: 5, overscrollBehavior: 'contain' }}>
                    {c.tasks.map(t => (
                      <TaskChip key={t.id} node={t} color={c.color}
                        done={taskLoggedOn(t, logSet, today)}
                        armed={pendingId === t.id}
                        picking={picking}
                        label={weekLabel(t)}
                        onPick={() => onPick(t)} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {addOpen && (
        <NewTaskSheet userId={userId} nodes={nodes} classifier={classifier}
          onClose={() => setAddOpen(false)}
          onSaved={() => { setAddOpen(false); onSaved && onSaved(); }} />
      )}
    </div>
  );
}

// ── one draggable task chip ───────────────────────────────────────
// The chip is BOTH a drag handle and a tap target. dnd-kit only starts a drag
// after the activation distance is passed, so a plain tap still fires onClick
// and the two placement routes never fight each other.
function TaskChip({ node, color, done, armed, picking, label, onPick }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `task|${node.id}`, data: { node } });
  return (
    <button ref={setNodeRef} {...attributes} {...listeners}
      onClick={onPick} title={node.title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: '100%',
        padding: '7px 11px', borderRadius: 999, cursor: 'grab', fontFamily: 'inherit',
        touchAction: 'none',            // let the pointer sensor own the gesture
        opacity: isDragging ? 0.4 : 1,
        border: `1px solid ${armed ? FOCUS.orange : done ? hexAlpha('#16a34a', 0.45) : hexAlpha(color, 0.4)}`,
        background: armed ? hexAlpha(FOCUS.orange, 0.18) : done ? hexAlpha('#16a34a', 0.08) : picking ? '#fff' : hexAlpha(color, 0.06),
        boxShadow: picking ? `0 1px 4px ${hexAlpha(color, 0.35)}` : 'none',
      }}>
      <GripVertical size={11} color={hexAlpha(color, 0.9)} style={{ flexShrink: 0 }} />
      {done && <Check size={12} color="#15803d" style={{ flexShrink: 0 }} />}
      {node.task_time && !done && <Clock size={11} color={FOCUS.muted} style={{ flexShrink: 0 }} />}
      <span style={{ fontSize: 12.5, fontWeight: 700, color: done ? '#15803d' : FOCUS.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.title}</span>
      <span style={{ fontSize: 9, color: FOCUS.muted, flexShrink: 0 }}>{durationOf(node)}׳</span>
      {label && <span style={{ fontSize: 9.5, fontWeight: 700, color: FOCUS.muted, flexShrink: 0 }}>{label}</span>}
    </button>
  );
}

// ── + משימה חדשה ──────────────────────────────────────────────────
function NewTaskSheet({ userId, nodes, classifier, onClose, onSaved }) {
  const [title, setTitle] = useState('');
  const [catKey, setCatKey] = useState(CATEGORIES[0].key);
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
      const tags = [BOARD_TAG];
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
      onSaved();
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
