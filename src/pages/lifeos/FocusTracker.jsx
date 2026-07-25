import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '@/lib/AuthContext';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import PageSkeleton from '@/components/PageSkeleton';
import FocusChips from '@/components/lifeos/FocusChips';
import IdeaCaptureButton from '@/components/lifeos/IdeaCaptureButton';
import FocusDocSheet, { doneToast } from '@/components/lifeos/FocusDocSheet';
import NotDoneSheet from '@/components/lifeos/NotDoneSheet';
import NodeDetailSheet from '@/components/lifeos/NodeDetailSheet';
import HabitBankSheet from '@/components/lifeos/HabitBankSheet';
import { ChevronRight, ChevronLeft, Flame, LayoutGrid, Plus, X, ListPlus, FolderPlus } from 'lucide-react';
import { toast } from 'sonner';
import {
  FOCUS, isoDate, addDays, dowOf, HEB_DAYS, HEB_DAYS_FULL,
  monthDays, weekDays, monthLabel, HEB_MONTHS,
  fetchNodes, fetchLogs, logSetFrom, logByKey, indexNodes, topBranchOf, branchUnderArm, ancestorsOf,
  logTask, unlogTask, createNode, updateNode, deleteNode,
  bankItemsOf, addBankItem,
  seedPersonalArm, seedPersonalDomains, seedPersonalHabits, PERSONAL_ARM_TITLE, migratePersonalToBoard,
  armColorMap, ARM_PALETTE, darken, hexAlpha,
  recurringTasks, taskExpectedOn, taskLoggedOn, taskMonthStats, taskStreak,
  harvestToday, todayStats, weeklyTargetOf, weekDoneCount, isCellExpected,
} from '@/lib/lifeos/focus-api';

const GREEN = '#16a34a';
const pctColor = (p) => (p >= 0.8 ? GREEN : p >= 0.5 ? FOCUS.amber : FOCUS.red);
const pctText = (done, expected) => (expected ? `${Math.round((done / expected) * 100)}%` : '—');
const onBoard = (t, tag) => !tag || (t.tags || []).includes(tag);
// 10px caption under an icon-only button (matches the מיקוד map toolbar).
const capLabel = { fontSize: 9, fontWeight: 700, lineHeight: 1 };
// Frequency label shown on a row / checklist item (weekly-N → "N/שב׳").
const freqLabel = (t) => {
  const N = weeklyTargetOf(t);
  if (N) return `${N}/שב׳`;
  return t.frequency === 'daily' ? 'יומי' : t.frequency === 'weekly' ? HEB_DAYS[t.day_of_week] : 'חודשי';
};

// Minutes logged on one done row from its start/end times; an end before start
// is treated as crossing midnight. 0 when either time is missing.
const rowDurationMin = (row) => {
  if (!row || !row.start_time || !row.end_time) return 0;
  const toMin = (t) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m; };
  let d = toMin(row.end_time) - toMin(row.start_time);
  if (d < 0) d += 1440;
  return d > 0 ? d : 0;
};
// Total minutes invested in a habit during the month of cursorIso — summed
// client-side over its DONE rows (start_time/end_time already exist; no query).
const monthInvestedMin = (task, logs, cursorIso) => {
  const ym = cursorIso.slice(0, 7);
  return logs.reduce((s, l) => (
    l.node_id === task.id && (!l.status || l.status === 'done') && String(l.log_date).slice(0, 7) === ym
      ? s + rowDurationMin(l) : s
  ), 0);
};
const fmtInvested = (min) => {
  const h = Math.floor(min / 60), m = min % 60;
  if (h && m) return `${h} שעות ${m}'`;
  if (h) return `${h} שעות`;
  return `${m}'`;
};

// The tracker board is reused by the personal board (one tracker, one
// home). Props toggle the personal-only affordances:
//   title/chips   — header + sub-nav slot.
//   docOnCheck    — checking a cell opens FocusDocSheet automatically.
//   quickAdd      — collapsible "build a recurring task" row.
//   seedPersonal  — ensure the 'החיים שלי' arm exists first.
//   seedHabits    — also seed the agreed habit set (once per user).
//   boardTag      — CURATED mode: show only tasks tagged with it; long-press
//                   to remove/delete; "add from existing" picker; the today
//                   strip counts board rows only; first-run migration tags
//                   the personal arm.
//   pageScroll    — no inner scrolling; the PAGE scrolls, grid renders full
//                   height (month/year still pan horizontally).
//   defaultPeriod — initial period (personal board opens on 'week').
export default function FocusTracker({
  title = 'מיקוד',
  chips = <FocusChips />,
  docOnCheck = false,
  quickAdd = false,
  seedPersonal = false,
  seedHabits = false,
  boardTag = null,
  pageScroll = false,
  defaultPeriod = 'month',
  footerSlot = null,
  headerSlot = null,        // rendered above the tracker (extra card slot)
  hideTopBar = false,       // drop the layout's title/search/bell row (אישי board)
  groupByDomain = false,    // group rows by the domain branch under the personal arm
  seedDomains = false,      // ensure PERSONAL_DOMAINS branches exist (once per user)
} = {}) {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const navigate = useNavigate();
  const today = isoDate();

  const [nodes, setNodes] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [period, setPeriod] = useState(defaultPeriod); // week | month | year
  const [cursor, setCursor] = useState(today);         // a date inside the shown period
  const [armFilter, setArmFilter] = useState(null);
  const [docNode, setDocNode] = useState(null);        // { task, date, existing } — done-cell doc/edit
  const [notDoneNode, setNotDoneNode] = useState(null); // { task, date, existing } — skip reason
  const [sheetNode, setSheetNode] = useState(null);    // row tap → the item's home
  const [rowMenu, setRowMenu] = useState(null);        // { task, x, y } long-press bar
  const [pickerOpen, setPickerOpen] = useState(false); // "add from existing"
  const [bankNode, setBankNode] = useState(null);      // row tap → the habit's task bank
  const seededRef = useRef(false);

  // ── Columns for the current period ────────────────────────────────
  const { columns, colKind, periodStart, periodEnd } = useMemo(() => {
    if (period === 'day') {
      return { columns: [cursor], colKind: 'day', periodStart: cursor, periodEnd: cursor };
    }
    if (period === 'week') {
      const days = weekDays(cursor);
      return { columns: days, colKind: 'day', periodStart: days[0], periodEnd: days[6] };
    }
    if (period === 'year') {
      const y = new Date(cursor + 'T00:00:00').getFullYear();
      const months = Array.from({ length: 12 }, (_, i) => isoDate(new Date(y, i, 1)));
      return { columns: months, colKind: 'month', periodStart: isoDate(new Date(y, 0, 1)), periodEnd: isoDate(new Date(y, 11, 31)) };
    }
    const days = monthDays(cursor);
    return { columns: days, colKind: 'day', periodStart: days[0], periodEnd: days[days.length - 1] };
  }, [period, cursor]);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      if (seedPersonal && !seededRef.current) {
        seededRef.current = true;
        try { await seedPersonalArm(userId); } catch { /* non-fatal */ }
        // Ensure the domain (category) branches exist, once per user. Key is
        // v2 because 'שינה' joined PERSONAL_DOMAINS after v1 users were
        // flagged; the seeder itself is title-idempotent either way.
        if (seedDomains) {
          const dkey = `domains_seeded_v2_${userId}`;
          let dd = null;
          try { dd = localStorage.getItem(dkey); } catch { /* noop */ }
          if (!dd) {
            try { await seedPersonalDomains(userId); } catch { /* non-fatal */ }
            try { localStorage.setItem(dkey, '1'); } catch { /* noop */ }
          }
        }
        // Ensure the agreed habit set exists. Double-guarded: this flag skips
        // the extra read, and seedPersonalHabits skips any habit whose title is
        // already under the arm — so a cleared flag can't duplicate rows.
        if (seedHabits) {
          const hkey = `habits_seeded_v1_${userId}`;
          let hh = null;
          try { hh = localStorage.getItem(hkey); } catch { /* noop */ }
          if (!hh) {
            try { await seedPersonalHabits(userId, boardTag || undefined); } catch { /* non-fatal */ }
            try { localStorage.setItem(hkey, '1'); } catch { /* noop */ }
          }
        }
        // First-run curation: tag the personal arm onto the board once.
        if (boardTag) {
          const key = `board_migrated_v1_${userId}`;
          let done = null;
          try { done = localStorage.getItem(key); } catch { /* noop */ }
          if (!done) {
            try { await migratePersonalToBoard(userId, boardTag); } catch { /* non-fatal */ }
            try { localStorage.setItem(key, '1'); } catch { /* noop */ }
          }
        }
      }
      const lo = periodStart < addDays(today, -120) ? periodStart : addDays(today, -120);
      const hi = periodEnd > today ? periodEnd : today;
      const [n, l] = await Promise.all([
        fetchNodes(userId),
        fetchLogs(userId, lo, hi),
      ]);
      setNodes(n); setLogs(l);
    } catch { toast.error('שגיאה בטעינה'); }
    finally { setLoaded(true); }
  }, [userId, periodStart, periodEnd, today, seedPersonal, seedDomains, seedHabits, boardTag]);

  useEffect(() => { load(); }, [load]);

  const { byId, children, roots } = useMemo(() => indexNodes(nodes), [nodes]);
  const armMap = useMemo(() => armColorMap(children, roots), [children, roots]);
  const logSet = useMemo(() => logSetFrom(logs), [logs]);
  const logMap = useMemo(() => logByKey(logs), [logs]);   // "nodeId|date" → full row
  // The personal arm id — habits are grouped by their domain branch under it.
  const personalArmId = useMemo(() => {
    for (const r of roots) for (const b of (children[r.id] || [])) if (b.title === PERSONAL_ARM_TITLE) return b.id;
    return null;
  }, [roots, children]);

  // ── Rows grouped by arm (curated by boardTag membership) ───────────
  const allGroups = useMemo(() => {
    const recurr = recurringTasks(nodes).filter(t => onBoard(t, boardTag));
    const gmap = new Map();
    const order = [];
    recurr.forEach(t => {
      // Personal board groups by domain (branch under the arm); business by arm.
      const grp = (groupByDomain && personalArmId) ? branchUnderArm(t, byId, personalArmId) : topBranchOf(t, byId);
      const gid = grp?.id || 'none';
      if (!gmap.has(gid)) {
        const color = (groupByDomain && personalArmId) ? ARM_PALETTE[order.length % ARM_PALETTE.length] : (armMap[gid] || '#B48A5A');
        gmap.set(gid, { id: gid, title: grp?.title || 'כללי', color, tasks: [] });
        order.push(gid);
      }
      gmap.get(gid).tasks.push(t);
    });
    return order.map(id => gmap.get(id));
  }, [nodes, byId, armMap, boardTag, groupByDomain, personalArmId]);

  const groups = useMemo(() => (armFilter ? allGroups.filter(g => g.id === armFilter) : allGroups), [allGroups, armFilter]);
  const armChips = useMemo(() => allGroups.map(g => ({ id: g.id, title: g.title, color: g.color })), [allGroups]);
  const allRows = useMemo(() => groups.flatMap(g => g.tasks), [groups]);
  const boardRows = useMemo(() => allGroups.flatMap(g => g.tasks), [allGroups]);

  // Per-column aggregate % (bottom summary).
  const colStats = useMemo(() => columns.map(col => {
    let expected = 0, done = 0;
    allRows.forEach(t => {
      if (colKind === 'month') {
        const s = taskMonthStats(t, logSet, monthDays(col), today);
        expected += s.expected; done += s.done;
      } else {
        if (col > today) return;
        const logged = taskLoggedOn(t, logSet, col);
        // Weekly-N: a done day always counts; a non-done day counts as expected
        // only while the week is still under target.
        const exp = weeklyTargetOf(t) ? (logged || isCellExpected(t, logSet, col, today)) : taskExpectedOn(t, col);
        if (exp) { expected++; if (logged) done++; }
      }
    });
    return { expected, done };
  }), [columns, colKind, allRows, logSet, today]);

  const grandStat = useMemo(() => colStats.reduce((a, c) => ({ expected: a.expected + c.expected, done: a.done + c.done }), { expected: 0, done: 0 }), [colStats]);

  // ── Today strip — BOARD rows only when curated ────────────────────
  const strip = useMemo(() => {
    if (boardTag) {
      let total = 0, done = 0;
      // Weekly-N habits count toward "today" only while the week is under target.
      const expToday = (t) => {
        const wN = weeklyTargetOf(t);
        return wN ? (taskLoggedOn(t, logSet, today) || weekDoneCount(t, logSet, today, today) < wN) : taskExpectedOn(t, today);
      };
      boardRows.forEach(t => { if (expToday(t)) { total++; if (taskLoggedOn(t, logSet, today)) done++; } });
      const fear = boardRows.find(t => t.is_fear_task && expToday(t) && !taskLoggedOn(t, logSet, today)) || null;
      return { done, total, fear };
    }
    const s = todayStats(nodes, logSet, today);
    const { overdue, rollover, main } = harvestToday(nodes, logSet, today);
    return { done: s.done, total: s.total, fear: [...overdue, ...rollover, ...main].find(n => n.is_fear_task) || null };
  }, [boardTag, boardRows, nodes, logSet, today]);
  const remaining = Math.max(0, strip.total - strip.done);
  const allDone = strip.total > 0 && strip.done === strip.total;

  // ── Cell toggle ───────────────────────────────────────────────────
  // Mark a habit done for a date (optimistic) + optional doc sheet. Used by
  // the daily checklist's checkbox and by the "actually done" escape.
  const markDone = async (task, date) => {
    if (date > today) return;
    setLogs(prev => [...prev.filter(l => !(l.node_id === task.id && l.log_date === date)), { node_id: task.id, log_date: date, status: 'done' }]);
    try {
      await logTask(userId, task, date);
      if (docOnCheck) setDocNode({ task, date, existing: null });
      else doneToast('בוצע ✓', task, () => setDocNode({ task, date, existing: null }));
    } catch { load(); }
  };
  // Remove a done/skipped mark for a date (optimistic).
  const removeMark = async (task, date) => {
    setLogs(prev => prev.filter(l => !(l.node_id === task.id && (task.frequency === 'monthly' ? l.log_date.slice(0, 7) === date.slice(0, 7) : l.log_date === date))));
    try { await unlogTask(task, date); } catch { load(); }
  };
  // Tap routing in the review matrices: DONE cell → doc/edit sheet (no longer
  // un-checks; use the sheet's "בטל סימון" for that). Expected-but-not-done (or
  // a skipped row) → the not-done reason sheet.
  const onCellTap = (task, date) => {
    if (date > today) return;
    const row = logMap[task.id + '|' + date] || null;
    if (taskLoggedOn(task, logSet, date)) { setDocNode({ task, date, existing: row }); return; }
    if (taskExpectedOn(task, date) || row) setNotDoneNode({ task, date, existing: row });
  };

  // ── Per-habit task bank ───────────────────────────────────────────
  // Bank items are child task nodes of the habit (see BANK_TAG in focus-api),
  // so a per-item day mark is an ordinary focus_task_logs row on the item id.
  const bankCounts = useMemo(() => {
    const m = {};
    allRows.forEach(t => { const n = bankItemsOf(t.id, children).length; if (n) m[t.id] = n; });
    return m;
  }, [allRows, children]);
  const bankItems = useMemo(() => (bankNode ? bankItemsOf(bankNode.id, children) : []), [bankNode, children]);
  const isItemDone = (item, date) => logSet.has(item.id + '|' + date);

  const addToBank = async (habit, title) => {
    try { await addBankItem(userId, habit, title, bankItemsOf(habit.id, children).length); await load(); return true; }
    catch { toast.error('שגיאה בהוספה'); return false; }
  };
  const deleteBankItem = async (item) => {
    setNodes(prev => prev.filter(n => n.id !== item.id));
    try { await deleteNode(item.id); } catch { toast.error('שגיאה'); load(); }
  };
  // Completing ANY bank item marks the habit's day done. The full doc sheet is
  // NOT forced per item — the habit gets the light "בוצע ✓" toast with a
  // "הוסף תיעוד" action, so checking several items in a row stays fluid and
  // documentation still happens once, on demand (or later from the cell).
  const toggleBankItem = async (habit, item, date) => {
    if (date > today) return;
    const wasDone = isItemDone(item, date);
    setLogs(prev => [
      ...prev.filter(l => !(l.node_id === item.id && l.log_date === date)),
      ...(wasDone ? [] : [{ node_id: item.id, log_date: date, status: 'done' }]),
    ]);
    try {
      if (wasDone) { await unlogTask(item, date); return; }
      await logTask(userId, item, date);
      // First item of the day → the habit itself counts as done.
      if (!taskLoggedOn(habit, logSet, date)) {
        setLogs(prev => [...prev.filter(l => !(l.node_id === habit.id && l.log_date === date)), { node_id: habit.id, log_date: date, status: 'done' }]);
        await logTask(userId, habit, date);
        doneToast('בוצע ✓', habit, () => { setBankNode(null); setDocNode({ task: habit, date, existing: null }); });
      }
    } catch { load(); }
  };

  // ── Board membership actions ──────────────────────────────────────
  // Quick-add targets: for the personal board, EVERY domain branch under the
  // arm (incl. empty ones just seeded), not only domains that already have
  // habits. Business keeps the arm-derived list.
  const domainArms = useMemo(() => {
    if (!groupByDomain || !personalArmId) return armChips;
    return (children[personalArmId] || [])
      .filter(b => b.node_type !== 'task')
      .map((b, i) => ({ id: b.id, title: b.title, color: ARM_PALETTE[i % ARM_PALETTE.length] }));
  }, [groupByDomain, personalArmId, children, armChips]);
  const quickAddArms = groupByDomain ? domainArms : armChips;
  const defaultArmId = useMemo(() => {
    if (groupByDomain) return domainArms[0]?.id || null;
    const personal = armChips.find(a => a.title === PERSONAL_ARM_TITLE);
    return (personal || armChips[0])?.id || null;
  }, [groupByDomain, domainArms, armChips]);

  const createRecurring = async ({ title: t, armId, frequency, dow }) => {
    const name = String(t || '').trim();
    if (!name || !armId) return false;
    const fields = { parent_id: armId, node_type: 'task', title: name };
    const tags = boardTag ? [boardTag] : [];     // born on the board
    if (frequency === 'week5') { fields.frequency = 'daily'; tags.push('w:5'); }  // 5×/week, flexible days
    else { fields.frequency = frequency; if (frequency === 'weekly') fields.day_of_week = dow; }
    if (tags.length) fields.tags = tags;
    try { await createNode(userId, fields); await load(); toast.success('נוספה משימה קבועה ✓'); return true; }
    catch { toast.error('שגיאה בהוספה'); return false; }
  };

  // Create a NEW domain/topic branch under the personal arm (beyond the 7
  // seeded ones). It appears as a group once it has a habit, and immediately
  // in the habit-add domain picker — grouping is by branch id, never a
  // hard-coded PERSONAL_DOMAINS list.
  const createDomain = async (name) => {
    const t = String(name || '').trim();
    if (!t || !personalArmId) return false;
    try { await createNode(userId, { parent_id: personalArmId, node_type: 'branch', title: t, sort_order: 300 }); await load(); toast.success('נושא נוסף ✓'); return true; }
    catch { toast.error('שגיאה'); return false; }
  };

  const removeFromBoard = async (task) => {
    setRowMenu(null);
    if (!boardTag) return;
    setNodes(prev => prev.map(n => n.id === task.id ? { ...n, tags: (n.tags || []).filter(x => x !== boardTag) } : n));
    try { await updateNode(task.id, { tags: (task.tags || []).filter(x => x !== boardTag) }); toast('הוסר מהלוח'); }
    catch { toast.error('שגיאה'); load(); }
  };
  const deleteCompletely = async (task) => {
    setRowMenu(null);
    setNodes(prev => prev.filter(n => n.id !== task.id));
    try { await deleteNode(task.id); toast('נמחק'); } catch { toast.error('שגיאה'); load(); }
  };
  const addToBoard = async (task) => {
    if (!boardTag) return;
    setNodes(prev => prev.map(n => n.id === task.id ? { ...n, tags: [...new Set([...(n.tags || []), boardTag])] } : n));
    try { await updateNode(task.id, { tags: [...new Set([...(task.tags || []), boardTag])] }); toast.success('נוסף ללוח ✓'); }
    catch { toast.error('שגיאה'); load(); }
  };

  const shift = (dir) => {
    if (period === 'day') setCursor(c => addDays(c, dir));
    else if (period === 'week') setCursor(c => addDays(c, dir * 7));
    else if (period === 'year') { const d = new Date(cursor + 'T00:00:00'); setCursor(isoDate(new Date(d.getFullYear() + dir, d.getMonth(), 1))); }
    else { const d = new Date(cursor + 'T00:00:00'); setCursor(isoDate(new Date(d.getFullYear(), d.getMonth() + dir, 1))); }
  };
  const periodTitle = period === 'day' ? (cursor === today ? 'היום' : `${cursor.slice(8)}/${cursor.slice(5, 7)}`)
    : period === 'year' ? String(new Date(cursor + 'T00:00:00').getFullYear())
    : period === 'week' ? `${periodStart.slice(8)}–${periodEnd.slice(8)}/${periodEnd.slice(5, 7)}`
    : monthLabel(cursor);

  // Dense spreadsheet <table>: habit-name column sticky on the right (RTL),
  // a "%" column sticky on the left, day columns scroll between them.
  const cellW = colKind === 'month' ? 46 : 34;
  const labelW = pageScroll ? 116 : 132;
  const statW = 50;
  const bdr = `1px solid ${FOCUS.border}`;
  const nameCell = { position: 'sticky', right: 0, zIndex: 3, background: '#fff', width: labelW, minWidth: labelW, maxWidth: labelW, boxSizing: 'border-box', borderBottom: bdr, borderLeft: bdr };
  const pctCell = { position: 'sticky', left: 0, zIndex: 3, background: '#fff', width: statW, minWidth: statW, boxSizing: 'border-box', borderBottom: bdr, borderRight: bdr, textAlign: 'center' };
  const dayCell = { width: cellW, minWidth: cellW, boxSizing: 'border-box', borderBottom: bdr, textAlign: 'center', padding: 0 };

  // Stats line for the row's home sheet: 'רצף N · החודש X%'.
  const sheetStat = useMemo(() => {
    if (!sheetNode) return null;
    const st = taskStreak(sheetNode, logSet, today);
    const ms = taskMonthStats(sheetNode, logSet, monthDays(today), today);
    return `רצף ${st} · החודש ${pctText(ms.done, ms.expected)}`;
  }, [sheetNode, logSet, today]);

  if (!loaded) return <LifeOSLayout title={title} fullBleed={!pageScroll} hideFab hideTopBar={hideTopBar}>{chips}<PageSkeleton rows={7} /></LifeOSLayout>;

  // ── ONE dense <table> for day (1 col) / week (7) / month (≤31) / year ──
  const grid = allRows.length === 0 ? (
    <div style={{ textAlign: 'center', padding: '48px 20px', color: FOCUS.muted }}>
      <LayoutGrid size={40} color={FOCUS.orange} style={{ opacity: 0.5 }} />
      <div style={{ fontSize: 15, fontWeight: 700, color: FOCUS.ink, marginTop: 12 }}>{boardTag ? 'הלוח ריק' : 'אין עדיין משימות קבועות'}</div>
      <div style={{ fontSize: 13, marginTop: 6 }}>{boardTag ? 'הוסף הרגל למעלה או בחר מהקיים' : 'הוסף משימה יומית או שבועית במפה'}</div>
    </div>
  ) : (
    // ag-dense-table opts this out of App.css's mobile "table → card"
    // transform (which turned every day <td> into a full-width block, so a
    // habit's day cells stacked vertically and the date header vanished).
    <table className="ag-dense-table" style={{ borderCollapse: 'separate', borderSpacing: 0, width: 'max-content', fontSize: 12, direction: 'rtl' }}>
      <thead>
        <tr>
          <td style={{ ...nameCell, zIndex: 4, background: '#FFFDFA', height: 34, padding: '0 8px', textAlign: 'right', fontWeight: 700, color: FOCUS.muted }}>משימה</td>
          {columns.map((col, i) => {
            const isToday = colKind === 'day' && col === today;
            const lbl = colKind === 'month' ? HEB_MONTHS[i].slice(0, 3) : String(new Date(col + 'T00:00:00').getDate());
            const dow = colKind === 'day' ? HEB_DAYS[dowOf(col)] : null;
            return (
              <td key={col} style={{ ...dayCell, height: 34, background: isToday ? hexAlpha(FOCUS.orange, 0.14) : '#FFFDFA', color: isToday ? '#B4531A' : FOCUS.muted, fontWeight: isToday ? 800 : 600 }}>
                {dow && <div style={{ fontSize: 8, lineHeight: 1, opacity: 0.7 }}>{dow}</div>}
                <div style={{ fontSize: colKind === 'month' ? 11 : 12 }}>{lbl}</div>
              </td>
            );
          })}
          <td style={{ ...pctCell, zIndex: 4, background: '#FFFDFA', height: 34, fontWeight: 700, color: FOCUS.muted, fontSize: 10 }}>%</td>
        </tr>
      </thead>
      <tbody>
        {groups.map(g => (
          <React.Fragment key={g.id}>
            {/* Category header — colSpan across the whole width; the label stays
                pinned to the right while the coloured bar scrolls. */}
            <tr>
              <td colSpan={columns.length + 2} style={{ padding: 0, borderBottom: bdr, background: hexAlpha(g.color, 0.08) }}>
                <div style={{ position: 'sticky', right: 0, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px' }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: g.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: darken(g.color), whiteSpace: 'nowrap' }}>{g.title}</span>
                </div>
              </td>
            </tr>
            {g.tasks.map(task => {
              const rowStat = colKind === 'month'
                ? columns.reduce((a, m) => { const s = taskMonthStats(task, logSet, monthDays(m), today); return { done: a.done + s.done, expected: a.expected + s.expected }; }, { done: 0, expected: 0 })
                : taskMonthStats(task, logSet, columns, today);
              const p = rowStat.expected ? rowStat.done / rowStat.expected : 0;
              const streak = taskStreak(task, logSet, today);
              const invested = period === 'month' ? monthInvestedMin(task, logs, cursor) : 0;
              return (
                <tr key={task.id}>
                  <RowLabel task={task} style={nameCell}
                    subline={invested > 0 ? `⏱ ${fmtInvested(invested)}` : null}
                    bankCount={bankCounts[task.id] || 0}
                    /* Personal board: the row opens the habit's task bank
                       (its details stay one long-press away). Business
                       tracker keeps opening the node's home sheet. */
                    onTap={() => (boardTag ? setBankNode(task) : setSheetNode(task))}
                    onLongPress={boardTag ? (x, y) => setRowMenu({ task, x, y }) : null} />
                  {columns.map(col => (
                    <Cell key={col} task={task} col={col} colKind={colKind} logSet={logSet} logMap={logMap} today={today} color={g.color} w={cellW} onToggle={onCellTap} />
                  ))}
                  <td style={{ ...pctCell }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1.1, minHeight: 34, padding: '2px 0' }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: rowStat.expected ? pctColor(p) : FOCUS.muted }}>{pctText(rowStat.done, rowStat.expected)}</span>
                      <span style={{ fontSize: 9, color: FOCUS.muted }}>🔥{streak}</span>
                      {period === 'month' && rowStat.expected > 0 && (
                        <div style={{ width: '82%', height: 3, borderRadius: 2, background: '#F0E4D0', overflow: 'hidden', marginTop: 2 }}>
                          <div style={{ width: `${Math.round(p * 100)}%`, height: '100%', background: pctColor(p) }} />
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </React.Fragment>
        ))}
        {/* Bottom summary — per-day completion percent across all habits. */}
        <tr>
          <td style={{ ...nameCell, background: '#FFFDFA', borderTop: `2px solid ${FOCUS.border}`, padding: '0 8px', textAlign: 'right', fontWeight: 800, color: FOCUS.ink }}>סה״כ</td>
          {colStats.map((c, i) => {
            const pp = c.expected ? c.done / c.expected : 0;
            return (
              <td key={i} style={{ ...dayCell, background: '#FFFDFA', borderTop: `2px solid ${FOCUS.border}`, fontSize: 9, fontWeight: 700, color: c.expected ? pctColor(pp) : FOCUS.border }}>
                {c.expected ? Math.round(pp * 100) : '·'}
              </td>
            );
          })}
          <td style={{ ...pctCell, background: '#FFFDFA', borderTop: `2px solid ${FOCUS.border}`, fontSize: 12, fontWeight: 800, color: grandStat.expected ? pctColor(grandStat.done / grandStat.expected) : FOCUS.muted }}>
            {pctText(grandStat.done, grandStat.expected)}
          </td>
        </tr>
      </tbody>
    </table>
  );

  return (
    <LifeOSLayout title={title} fullBleed={!pageScroll} hideFab hideTopBar={hideTopBar}>
      {chips}
      {headerSlot}

      {/* ── Quick add (collapsible) + add-from-existing ── */}
      {quickAdd && (
        <QuickAddRow arms={quickAddArms} defaultArmId={defaultArmId} onAdd={createRecurring}
          onPick={boardTag ? () => setPickerOpen(true) : null}
          onAddTopic={groupByDomain ? createDomain : null} />
      )}

      {/* ── Today strip (board rows only when curated) ──
          On the personal board this is a LOCAL control: it zooms the table to
          today (period 'day', cursor today) so the remaining habits are the
          only thing on screen. It used to navigate to /lifeos/focus/today —
          the business Focus screen — which was wrong for אישי. The business
          tracker keeps that navigation. */}
      <div onClick={() => (boardTag ? (setPeriod('day'), setCursor(today)) : navigate('/lifeos/focus/today'))}
        style={{ margin: '0 12px 8px', display: 'flex', alignItems: 'center', gap: 12, background: allDone ? 'linear-gradient(135deg,#FFF3E9,#FFE4CF)' : FOCUS.card, border: `1px solid ${FOCUS.border}`, borderRadius: 14, boxShadow: FOCUS.neu, padding: '9px 14px', cursor: 'pointer' }}>
        <MiniRing done={strip.done} total={strip.total} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {allDone ? (
            <div style={{ fontSize: 15, fontWeight: 800, color: '#B4531A' }}>יום מושלם ✓</div>
          ) : (
            <>
              <div style={{ fontSize: 14, fontWeight: 800, color: FOCUS.ink }}>היום: נותרו {remaining}</div>
              <div style={{ fontSize: 12, color: FOCUS.muted, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <Flame size={12} color={FOCUS.red} /> אומץ: {strip.fear ? (strip.fear.title || 'משימה') : 'אין'}
              </div>
            </>
          )}
        </div>
        <ChevronLeft size={18} color={FOCUS.muted} />
      </div>

      {/* ── Controls: one compact row (arrows + period + scope) ── */}
      <div style={{ padding: '0 12px 8px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={() => shift(1)} style={navBtn}><ChevronRight size={16} /></button>
          <div style={{ minWidth: 70, textAlign: 'center', fontSize: 13, fontWeight: 800, color: FOCUS.ink }}>{periodTitle}</div>
          <button onClick={() => shift(-1)} style={navBtn}><ChevronLeft size={16} /></button>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {[['day', 'יום'], ['week', 'שבוע'], ['month', 'חודש'], ['year', 'שנה']].map(([k, l]) => (
            <button key={k} onClick={() => { setPeriod(k); setCursor(today); }}
              style={{ padding: '6px 10px', borderRadius: 9, cursor: 'pointer', border: `1px solid ${period === k ? FOCUS.orange : FOCUS.border}`, background: period === k ? FOCUS.orange : '#fff', color: period === k ? '#fff' : FOCUS.muted, fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit' }}>{l}</button>
          ))}
        </div>
        {armChips.length > 1 && (
          <div style={{ display: 'flex', gap: 5, overflowX: 'auto', flex: 1, minWidth: 0 }}>
            <button onClick={() => setArmFilter(null)} style={scopeChip(!armFilter, FOCUS.orange)}>הכל</button>
            {armChips.map(a => (
              <button key={a.id} onClick={() => setArmFilter(armFilter === a.id ? null : a.id)} style={scopeChip(armFilter === a.id, a.color)}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: a.color, display: 'inline-block', marginLeft: 4 }} />{a.title}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Monthly single-habit trend line across the weeks ── */}
      {period === 'month' && allRows.length === 1 && (
        <MonthSparkline task={allRows[0]} logSet={logSet} logs={logs} cursor={cursor} />
      )}

      {/* ── The dense table — one component for day / week / month / year ── */}
      {pageScroll ? (
        <div style={{ overflowX: 'auto', overflowY: 'hidden', padding: '0 12px 8px' }}>{grid}</div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', WebkitOverflowScrolling: 'touch', padding: '0 12px 24px' }}>{grid}</div>
      )}
      {footerSlot}

      {/* ── Long-press mini bar ── */}
      {rowMenu && (
        <>
          <div onClick={() => setRowMenu(null)} style={{ position: 'fixed', inset: 0, zIndex: 1350 }} />
          <div dir="rtl" style={{ position: 'fixed', zIndex: 1360, left: Math.max(8, Math.min(rowMenu.x - 90, (window.innerWidth || 380) - 188)), top: Math.min(rowMenu.y, (window.innerHeight || 700) - 70), display: 'flex', gap: 6, background: '#fff', border: `1px solid ${FOCUS.border}`, borderRadius: 12, padding: 6, boxShadow: '0 6px 20px rgba(0,0,0,0.22)' }}>
            <button onClick={() => removeFromBoard(rowMenu.task)} style={miniBtn('#FFF3E9', '#B4531A')}>הסר מהלוח</button>
            <button onClick={() => deleteCompletely(rowMenu.task)} style={miniBtn('#FCEBEB', '#C0392B')}>מחק לגמרי</button>
            <button onClick={() => { const t = rowMenu.task; setRowMenu(null); setSheetNode(t); }} style={miniBtn('#F1F3F6', '#3C3489')}>פרטים</button>
          </div>
        </>
      )}

      {docNode && (
        <FocusDocSheet node={docNode.task} userId={userId} date={docNode.date} existing={docNode.existing}
          onClose={() => setDocNode(null)} onSaved={load}
          onUncheck={() => { removeMark(docNode.task, docNode.date); setDocNode(null); }} />
      )}
      {notDoneNode && (
        <NotDoneSheet node={notDoneNode.task} userId={userId} date={notDoneNode.date} existing={notDoneNode.existing}
          onClose={() => setNotDoneNode(null)} onSaved={load}
          onMarkDone={() => markDone(notDoneNode.task, notDoneNode.date)} />
      )}
      {sheetNode && (
        <NodeDetailSheet node={nodes.find(n => n.id === sheetNode.id) || sheetNode} ancestors={ancestorsOf(sheetNode, byId)} allNodes={nodes} statLine={sheetStat} onClose={() => setSheetNode(null)} onSaved={load} />
      )}
      {pickerOpen && (
        <AddExistingSheet
          groups={recurringTasks(nodes).filter(t => !onBoard(t, boardTag)).reduce((acc, t) => {
            const top = topBranchOf(t, byId); const gid = top?.id || 'none';
            let g = acc.find(x => x.id === gid);
            if (!g) { g = { id: gid, title: top?.title || 'כללי', color: armMap[gid] || '#B48A5A', tasks: [] }; acc.push(g); }
            g.tasks.push(t); return acc;
          }, [])}
          onAdd={addToBoard} onClose={() => setPickerOpen(false)} />
      )}
      {bankNode && (
        <HabitBankSheet
          habit={bankNode}
          date={today}
          items={bankItems}
          isItemDone={(item) => isItemDone(item, today)}
          onAdd={(t) => addToBank(bankNode, t)}
          onToggle={(item) => toggleBankItem(bankNode, item, today)}
          onDelete={deleteBankItem}
          onDetails={() => { const t = bankNode; setBankNode(null); setSheetNode(t); }}
          onClose={() => setBankNode(null)} />
      )}
      <IdeaCaptureButton onSaved={load} hidden={!!(sheetNode || docNode || notDoneNode || pickerOpen || bankNode)} />
    </LifeOSLayout>
  );
}

// ── Row label: tap = open home sheet, long-press = mini bar ─────────
function RowLabel({ task, style, onTap, onLongPress, subline = null, bankCount = 0 }) {
  const t = useRef({ x: 0, y: 0, moved: false, long: false, timer: null });
  const start = (e) => {
    const p = e.touches ? e.touches[0] : e;
    t.current = { x: p.clientX, y: p.clientY, moved: false, long: false, timer: null };
    if (onLongPress) t.current.timer = setTimeout(() => { t.current.long = true; onLongPress(p.clientX, p.clientY); }, 450);
  };
  const move = (e) => {
    const p = e.touches ? e.touches[0] : e;
    if (Math.abs(p.clientX - t.current.x) > 8 || Math.abs(p.clientY - t.current.y) > 8) { t.current.moved = true; clearTimeout(t.current.timer); }
  };
  const end = () => { clearTimeout(t.current.timer); if (!t.current.long && !t.current.moved) onTap(); };
  return (
    <td onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={() => clearTimeout(t.current.timer)}
      style={{ ...style, padding: '2px 8px', cursor: 'pointer', userSelect: 'none', touchAction: 'pan-y' }}>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 1, minHeight: 30 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {task.is_fear_task && <Flame size={11} color={FOCUS.red} style={{ flexShrink: 0 }} />}
          <span style={{ fontSize: 12.5, fontWeight: 600, color: FOCUS.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title || 'משימה'}</span>
          <span style={{ fontSize: 9, color: FOCUS.muted, flexShrink: 0 }}>{freqLabel(task)}</span>
          {/* Bank badge — makes the sub-item list discoverable on the row. */}
          {bankCount > 0 && (
            <span style={{ fontSize: 8.5, fontWeight: 800, color: '#B4531A', background: hexAlpha(FOCUS.orange, 0.14), borderRadius: 6, padding: '1px 4px', flexShrink: 0, lineHeight: 1.4 }}>☰{bankCount}</span>
          )}
        </div>
        {subline && <div style={{ fontSize: 9.5, color: '#B4531A', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subline}</div>}
      </div>
    </td>
  );
}

// ── Quick-add: collapsed to a [+] button; expands to the full form ──
function QuickAddRow({ arms, defaultArmId, onAdd, onPick, onAddTopic }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [freq, setFreq] = useState('daily');
  const [dow, setDow] = useState(0);
  const [armId, setArmId] = useState(defaultArmId);
  const [busy, setBusy] = useState(false);
  const [topicOpen, setTopicOpen] = useState(false);
  const [topic, setTopic] = useState('');
  useEffect(() => { if (!armId && defaultArmId) setArmId(defaultArmId); }, [defaultArmId, armId]);

  const saveTopic = async () => {
    if (!topic.trim() || !onAddTopic) return;
    const ok = await onAddTopic(topic);
    if (ok) { setTopic(''); setTopicOpen(false); }
  };

  const submit = async () => {
    if (busy || !text.trim() || !armId) return;
    setBusy(true);
    const ok = await onAdd({ title: text, armId, frequency: freq, dow });
    setBusy(false);
    if (ok) setText('');
  };
  const freqChip = (k, l) => (
    <button key={k} onClick={() => setFreq(k)}
      style={{ padding: '6px 11px', borderRadius: 18, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', border: `1px solid ${freq === k ? FOCUS.orange : FOCUS.border}`, background: freq === k ? hexAlpha(FOCUS.orange, 0.14) : '#fff', color: freq === k ? '#B4531A' : FOCUS.muted }}>{l}</button>
  );

  if (!open) {
    return (
      <div style={{ margin: '0 12px 8px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setOpen(true)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', borderRadius: 12, border: `1px solid ${FOCUS.border}`, background: '#fff', boxShadow: FOCUS.neu, color: FOCUS.orange, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            <Plus size={17} /> הוסף הרגל
          </button>
          {onPick && (
            <button onClick={onPick} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderRadius: 12, border: `1px solid ${FOCUS.border}`, background: '#fff', boxShadow: FOCUS.neu, color: FOCUS.ink, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
              <ListPlus size={16} /> מהקיים
            </button>
          )}
          {onAddTopic && (
            <button onClick={() => setTopicOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderRadius: 12, border: `1px solid ${FOCUS.border}`, background: '#fff', boxShadow: FOCUS.neu, color: FOCUS.ink, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
              <FolderPlus size={16} /> נושא חדש
            </button>
          )}
        </div>
        {onAddTopic && topicOpen && (
          <div style={{ display: 'flex', gap: 8 }}>
            <input autoFocus value={topic} onChange={(e) => setTopic(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveTopic(); }}
              placeholder="שם הנושא החדש…" style={{ flex: 1, minWidth: 0, border: `1px solid ${FOCUS.border}`, borderRadius: 11, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', color: FOCUS.ink, background: '#FFFDFA', outline: 'none' }} />
            <button onClick={saveTopic} disabled={!topic.trim()} style={{ flexShrink: 0, padding: '0 16px', borderRadius: 11, border: 'none', background: topic.trim() ? FOCUS.orangeGrad : FOCUS.border, color: '#fff', fontWeight: 800, fontSize: 13.5, cursor: topic.trim() ? 'pointer' : 'default', fontFamily: 'inherit' }}>הוסף</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ margin: '0 12px 10px', background: FOCUS.card, border: `1px solid ${FOCUS.border}`, borderRadius: 14, boxShadow: FOCUS.neu, padding: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input autoFocus value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          placeholder="הרגל חדש…"
          style={{ flex: 1, minWidth: 0, border: `1px solid ${FOCUS.border}`, borderRadius: 11, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', color: FOCUS.ink, background: '#FFFDFA', outline: 'none' }} />
        <button onClick={submit} disabled={busy || !text.trim() || !armId} aria-label="הוסף"
          style={{ flexShrink: 0, width: 46, height: 46, borderRadius: 12, border: 'none', background: (busy || !text.trim()) ? FOCUS.border : FOCUS.orangeGrad, color: '#fff', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
          <Plus size={19} /><span style={capLabel}>הוסף</span>
        </button>
        <button onClick={() => setOpen(false)} aria-label="סגור" style={{ flexShrink: 0, width: 44, height: 46, borderRadius: 12, border: `1px solid ${FOCUS.border}`, background: '#fff', color: FOCUS.muted, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
          <X size={16} /><span style={capLabel}>סגור</span>
        </button>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8, overflowX: 'auto', alignItems: 'center' }}>
        {freqChip('daily', 'יומי')}
        {freqChip('week5', '5 בשבוע')}
        {freqChip('weekly', 'שבועי')}
        {freqChip('monthly', 'חודשי')}
        {freq === 'weekly' && (
          <select value={dow} onChange={(e) => setDow(Number(e.target.value))}
            style={{ padding: '6px 8px', borderRadius: 18, border: `1px solid ${FOCUS.border}`, background: '#fff', color: FOCUS.ink, fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
            {HEB_DAYS_FULL.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
        )}
        <span style={{ flex: 1 }} />
        {arms.length > 0 && (
          <select value={armId || ''} onChange={(e) => setArmId(e.target.value)}
            style={{ maxWidth: 140, padding: '6px 8px', borderRadius: 18, border: `1px solid ${FOCUS.border}`, background: '#fff', color: FOCUS.ink, fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
            {arms.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
          </select>
        )}
      </div>
    </div>
  );
}

// ── Add-from-existing: recurring tasks NOT on the board, by arm ─────
function AddExistingSheet({ groups, onAdd, onClose }) {
  return (
    <div dir="rtl" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1400, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 560, maxHeight: '80vh', overflowY: 'auto', background: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: '16px 16px calc(env(safe-area-inset-bottom,0px) + 20px)', boxShadow: '0 -6px 24px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: FOCUS.ink }}>הוסף מהקיים</div>
          <button onClick={onClose} aria-label="סגור" style={{ background: 'none', border: 'none', cursor: 'pointer', color: FOCUS.muted, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}><X size={20} /><span style={capLabel}>סגור</span></button>
        </div>
        {groups.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 12px', color: FOCUS.muted, fontSize: 13 }}>כל המשימות הקבועות כבר על הלוח</div>
        ) : groups.map(g => (
          <div key={g.id} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: g.color }} />
              <span style={{ fontSize: 13, fontWeight: 800, color: darken(g.color) }}>{g.title}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {g.tasks.map(t => (
                <button key={t.id} onClick={() => onAdd(t)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 11, border: `1px solid ${FOCUS.border}`, background: '#FFFDFA', cursor: 'pointer', textAlign: 'right', fontFamily: 'inherit' }}>
                  <Plus size={15} color={FOCUS.orange} style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: FOCUS.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title || 'משימה'}</span>
                  <span style={{ fontSize: 10, color: FOCUS.muted }}>{t.frequency === 'daily' ? 'יומי' : t.frequency === 'weekly' ? HEB_DAYS_FULL[t.day_of_week] : 'חודשי'}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── One table cell (<td>) ──────────────────────────────────────────
function Cell({ task, col, colKind, logSet, logMap, today, color, w, onToggle }) {
  if (colKind === 'month') {
    // Year zoom: month columns → compact percent number.
    const s = taskMonthStats(task, logSet, monthDays(col), today);
    const p = s.expected ? s.done / s.expected : 0;
    return (
      <td style={{ width: w, minWidth: w, height: 34, textAlign: 'center', borderBottom: `1px solid ${FOCUS.border}`, fontSize: 10, fontWeight: 700, color: s.expected ? pctColor(p) : FOCUS.border }}>
        {s.expected ? `${Math.round(p * 100)}` : '·'}
      </td>
    );
  }
  const wN = weeklyTargetOf(task);
  const logged = taskLoggedOn(task, logSet, col);
  const future = col > today;
  // Weekly-N: expected box only while the week is under target; any past/today
  // day stays tappable so an extra session can always be logged.
  const expected = wN ? isCellExpected(task, logSet, col, today) : taskExpectedOn(task, col);
  const row = logMap[task.id + '|' + col];
  const tappable = !future && (wN ? true : (expected || logged));
  const isToday = col === today;
  let inner;
  if (logged) {
    // Done → checkmark + the short summary text (if any) inside the cell.
    inner = (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, width: '100%', padding: '0 1px' }}>
        <span style={{ width: 16, height: 16, borderRadius: 5, background: color, color: '#fff', fontSize: 11, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✓</span>
        {row?.summary && <span style={{ fontSize: 7, lineHeight: 1, color: darken(color), maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.summary}</span>}
      </div>
    );
  } else if (row?.status === 'skipped') {
    inner = <span style={{ width: 13, height: 2, borderRadius: 2, background: hexAlpha(FOCUS.red, 0.5), display: 'inline-block' }} />;   // recorded not-done
  } else if (expected) {
    inner = <span style={{ width: 15, height: 15, borderRadius: 4, border: `1.5px solid ${future ? FOCUS.border : hexAlpha(color, 0.7)}`, opacity: future ? 0.5 : 1, display: 'inline-block' }} />;
  } else {
    inner = <span style={{ width: 8, height: 2, borderRadius: 2, background: FOCUS.border, display: 'inline-block' }} />;
  }
  return (
    <td onClick={tappable ? () => onToggle(task, col) : undefined}
      style={{ width: w, minWidth: w, height: 34, textAlign: 'center', verticalAlign: 'middle', borderBottom: `1px solid ${FOCUS.border}`, cursor: tappable ? 'pointer' : 'default', background: isToday ? hexAlpha(FOCUS.orange, 0.1) : 'transparent', boxShadow: isToday ? `inset 0 0 0 1.5px ${hexAlpha(FOCUS.edgeSel, 0.5)}` : 'none', padding: 0 }}>
      {inner}
    </td>
  );
}

// ── Monthly single-habit trend line across the weeks of the month ──
function MonthSparkline({ task, logSet, logs = [], cursor }) {
  const days = monthDays(cursor);
  const today = isoDate();
  const invested = monthInvestedMin(task, logs, cursor);
  // Group the month's days into weeks (Sun-start), compute each week's %.
  const weeks = [];
  let cur = [];
  days.forEach(d => {
    cur.push(d);
    if (dowOf(d) === 6) { weeks.push(cur); cur = []; }
  });
  if (cur.length) weeks.push(cur);
  const pts = weeks.map(w => {
    let e = 0, done = 0;
    w.forEach(d => { if (d <= today && taskExpectedOn(task, d)) { e++; if (taskLoggedOn(task, logSet, d)) done++; } });
    return e ? done / e : null;
  });
  const W = 260, H = 40, pad = 6;
  const n = pts.length;
  const xy = pts.map((p, i) => ({
    x: pad + (n > 1 ? (i * (W - 2 * pad)) / (n - 1) : (W - 2 * pad) / 2),
    y: p == null ? null : (H - pad) - p * (H - 2 * pad),
  }));
  const line = xy.filter(o => o.y != null);
  const d = line.map((o, i) => `${i ? 'L' : 'M'} ${o.x.toFixed(1)} ${o.y.toFixed(1)}`).join(' ');
  return (
    <div style={{ margin: '4px 12px 10px', background: FOCUS.card, border: `1px solid ${FOCUS.border}`, borderRadius: 14, boxShadow: FOCUS.neu, padding: '10px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: FOCUS.ink }}>מגמה שבועית · {task.title || 'הרגל'}</span>
        {invested > 0 && <span style={{ fontSize: 11.5, fontWeight: 800, color: '#B4531A' }}>{fmtInvested(invested)} — סה״כ הושקע החודש</span>}
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block', height: 40 }}>
        <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke={FOCUS.border} strokeWidth="1" />
        {d && <path d={d} fill="none" stroke={FOCUS.orange} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
        {line.map((o, i) => <circle key={i} cx={o.x} cy={o.y} r="2.5" fill={FOCUS.orange} />)}
      </svg>
    </div>
  );
}

// ── Mini progress ring for the today strip ─────────────────────────
function MiniRing({ done, total }) {
  const pct = total ? done / total : 0;
  const R = 15, C = 2 * Math.PI * R;
  return (
    <div style={{ position: 'relative', width: 40, height: 40, flexShrink: 0 }}>
      <svg width="40" height="40" viewBox="0 0 40 40">
        <circle cx="20" cy="20" r={R} fill="none" stroke="#F0E4D0" strokeWidth="4" />
        <circle cx="20" cy="20" r={R} fill="none" stroke={FOCUS.orange} strokeWidth="4" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} transform="rotate(-90 20 20)" style={{ transition: 'stroke-dashoffset .3s' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: FOCUS.ink }}>{done}/{total}</div>
    </div>
  );
}

const navBtn = { width: 30, height: 30, borderRadius: 9, border: `1px solid ${FOCUS.border}`, background: '#fff', boxShadow: FOCUS.neu, color: FOCUS.ink, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
const scopeChip = (active, color) => ({ flexShrink: 0, display: 'inline-flex', alignItems: 'center', padding: '5px 10px', borderRadius: 20, cursor: 'pointer', border: `1px solid ${active ? color : FOCUS.border}`, background: active ? hexAlpha(color, 0.14) : '#fff', color: active ? darken(color) : FOCUS.muted, fontSize: 12, fontWeight: 700, fontFamily: 'inherit', whiteSpace: 'nowrap' });
const miniBtn = (bg, fg) => ({ minHeight: 40, padding: '0 12px', borderRadius: 9, border: 'none', background: bg, color: fg, fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' });
