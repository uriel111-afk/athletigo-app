import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '@/lib/AuthContext';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import PageSkeleton from '@/components/PageSkeleton';
import FocusChips from '@/components/lifeos/FocusChips';
import IdeaCaptureButton from '@/components/lifeos/IdeaCaptureButton';
import FocusDocSheet, { doneToast } from '@/components/lifeos/FocusDocSheet';
import NodeDetailSheet from '@/components/lifeos/NodeDetailSheet';
import { ChevronRight, ChevronLeft, Flame, LayoutGrid, Plus, X, ClipboardList, ListPlus } from 'lucide-react';
import { toast } from 'sonner';
import {
  FOCUS, isoDate, addDays, dowOf, HEB_DAYS, HEB_DAYS_FULL,
  monthDays, weekDays, monthLabel, HEB_MONTHS,
  fetchNodes, fetchLogs, fetchNotesForDate, logSetFrom, indexNodes, topBranchOf, ancestorsOf,
  logTask, unlogTask, createNode, updateNode, deleteNode,
  seedPersonalArm, PERSONAL_ARM_TITLE, migratePersonalToBoard,
  armColorMap, darken, hexAlpha,
  recurringTasks, taskExpectedOn, taskLoggedOn, taskMonthStats, taskStreak,
  harvestToday, todayStats,
} from '@/lib/lifeos/focus-api';

const GREEN = '#16a34a';
const pctColor = (p) => (p >= 0.8 ? GREEN : p >= 0.5 ? FOCUS.amber : FOCUS.red);
const pctText = (done, expected) => (expected ? `${Math.round((done / expected) * 100)}%` : '—');
const onBoard = (t, tag) => !tag || (t.tags || []).includes(tag);

// The tracker board is reused by the personal board (one tracker, one
// home). Props toggle the personal-only affordances:
//   title/chips   — header + sub-nav slot.
//   docOnCheck    — checking a cell opens FocusDocSheet automatically.
//   quickAdd      — collapsible "build a recurring task" row.
//   daySummary    — "תועדו היום N" strip + feed.
//   seedPersonal  — ensure the 'החיים שלי' arm exists first.
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
  daySummary = false,
  seedPersonal = false,
  boardTag = null,
  pageScroll = false,
  defaultPeriod = 'month',
  footerSlot = null,
} = {}) {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const navigate = useNavigate();
  const today = isoDate();

  const [nodes, setNodes] = useState([]);
  const [logs, setLogs] = useState([]);
  const [notesToday, setNotesToday] = useState([]);
  const [feedOpen, setFeedOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [period, setPeriod] = useState(defaultPeriod); // week | month | year
  const [cursor, setCursor] = useState(today);         // a date inside the shown period
  const [armFilter, setArmFilter] = useState(null);
  const [docNode, setDocNode] = useState(null);
  const [sheetNode, setSheetNode] = useState(null);    // row tap → the item's home
  const [rowMenu, setRowMenu] = useState(null);        // { task, x, y } long-press bar
  const [pickerOpen, setPickerOpen] = useState(false); // "add from existing"
  const seededRef = useRef(false);

  // ── Columns for the current period ────────────────────────────────
  const { columns, colKind, periodStart, periodEnd } = useMemo(() => {
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
      const [n, l, notes] = await Promise.all([
        fetchNodes(userId),
        fetchLogs(userId, lo, hi),
        daySummary ? fetchNotesForDate(userId, today) : Promise.resolve([]),
      ]);
      setNodes(n); setLogs(l); setNotesToday(notes);
    } catch { toast.error('שגיאה בטעינה'); }
    finally { setLoaded(true); }
  }, [userId, periodStart, periodEnd, today, seedPersonal, daySummary, boardTag]);

  useEffect(() => { load(); }, [load]);

  const { byId, children, roots } = useMemo(() => indexNodes(nodes), [nodes]);
  const armMap = useMemo(() => armColorMap(children, roots), [children, roots]);
  const logSet = useMemo(() => logSetFrom(logs), [logs]);

  // ── Rows grouped by arm (curated by boardTag membership) ───────────
  const allGroups = useMemo(() => {
    const recurr = recurringTasks(nodes).filter(t => onBoard(t, boardTag));
    const gmap = new Map();
    const order = [];
    recurr.forEach(t => {
      const top = topBranchOf(t, byId);
      const gid = top?.id || 'none';
      if (!gmap.has(gid)) { gmap.set(gid, { id: gid, title: top?.title || 'כללי', color: armMap[gid] || '#B48A5A', tasks: [] }); order.push(gid); }
      gmap.get(gid).tasks.push(t);
    });
    return order.map(id => gmap.get(id));
  }, [nodes, byId, armMap, boardTag]);

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
        if (taskExpectedOn(t, col)) { expected++; if (taskLoggedOn(t, logSet, col)) done++; }
      }
    });
    return { expected, done };
  }), [columns, colKind, allRows, logSet, today]);

  const grandStat = useMemo(() => colStats.reduce((a, c) => ({ expected: a.expected + c.expected, done: a.done + c.done }), { expected: 0, done: 0 }), [colStats]);

  // ── Today strip — BOARD rows only when curated ────────────────────
  const strip = useMemo(() => {
    if (boardTag) {
      let total = 0, done = 0;
      boardRows.forEach(t => { if (taskExpectedOn(t, today)) { total++; if (taskLoggedOn(t, logSet, today)) done++; } });
      const fear = boardRows.find(t => t.is_fear_task && taskExpectedOn(t, today) && !taskLoggedOn(t, logSet, today)) || null;
      return { done, total, fear };
    }
    const s = todayStats(nodes, logSet, today);
    const { overdue, rollover, main } = harvestToday(nodes, logSet, today);
    return { done: s.done, total: s.total, fear: [...overdue, ...rollover, ...main].find(n => n.is_fear_task) || null };
  }, [boardTag, boardRows, nodes, logSet, today]);
  const remaining = Math.max(0, strip.total - strip.done);
  const allDone = strip.total > 0 && strip.done === strip.total;

  // ── Cell toggle ───────────────────────────────────────────────────
  const toggleCell = async (task, date) => {
    if (date > today) return;
    if (!(taskExpectedOn(task, date) || taskLoggedOn(task, logSet, date))) return;
    const logged = taskLoggedOn(task, logSet, date);
    if (logged) {
      setLogs(prev => prev.filter(l => !(l.node_id === task.id && (task.frequency === 'monthly' ? l.log_date.slice(0, 7) === date.slice(0, 7) : l.log_date === date))));
      try { await unlogTask(task, date); } catch { load(); }
    } else {
      setLogs(prev => [...prev, { node_id: task.id, log_date: date }]);
      try {
        await logTask(userId, task, date);
        if (docOnCheck) setDocNode(task);
        else doneToast('בוצע ✓', task, setDocNode);
      } catch { load(); }
    }
  };

  // ── Board membership actions ──────────────────────────────────────
  const defaultArmId = useMemo(() => {
    const personal = armChips.find(a => a.title === PERSONAL_ARM_TITLE);
    return (personal || armChips[0])?.id || null;
  }, [armChips]);

  const createRecurring = async ({ title: t, armId, frequency, dow }) => {
    const name = String(t || '').trim();
    if (!name || !armId) return false;
    const fields = { parent_id: armId, node_type: 'task', title: name, frequency };
    if (frequency === 'weekly') fields.day_of_week = dow;
    if (boardTag) fields.tags = [boardTag];      // born on the board
    try { await createNode(userId, fields); await load(); toast.success('נוספה משימה קבועה ✓'); return true; }
    catch { toast.error('שגיאה בהוספה'); return false; }
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
    if (period === 'week') setCursor(c => addDays(c, dir * 7));
    else if (period === 'year') { const d = new Date(cursor + 'T00:00:00'); setCursor(isoDate(new Date(d.getFullYear() + dir, d.getMonth(), 1))); }
    else { const d = new Date(cursor + 'T00:00:00'); setCursor(isoDate(new Date(d.getFullYear(), d.getMonth() + dir, 1))); }
  };
  const periodTitle = period === 'year' ? String(new Date(cursor + 'T00:00:00').getFullYear())
    : period === 'week' ? `${periodStart.slice(8)}–${periodEnd.slice(8)}/${periodEnd.slice(5, 7)}`
    : monthLabel(cursor);

  const cellW = colKind === 'month' ? 46 : 30;
  const labelW = pageScroll ? 104 : 132;
  const statW = pageScroll ? 46 : 54;
  const sStart = { position: 'sticky', right: 0, zIndex: 2, width: labelW, minWidth: labelW, maxWidth: labelW, padding: '0 8px', background: '#fff', boxSizing: 'border-box' };
  const sEnd = { position: 'sticky', left: 0, zIndex: 2, width: statW, minWidth: statW, padding: '0 3px', background: '#fff', boxSizing: 'border-box' };

  // Stats line for the row's home sheet: 'רצף N · החודש X%'.
  const sheetStat = useMemo(() => {
    if (!sheetNode) return null;
    const st = taskStreak(sheetNode, logSet, today);
    const ms = taskMonthStats(sheetNode, logSet, monthDays(today), today);
    return `רצף ${st} · החודש ${pctText(ms.done, ms.expected)}`;
  }, [sheetNode, logSet, today]);

  if (!loaded) return <LifeOSLayout title={title} fullBleed={!pageScroll} hideFab>{chips}<PageSkeleton rows={7} /></LifeOSLayout>;

  const grid = allRows.length === 0 ? (
    <div style={{ textAlign: 'center', padding: '48px 20px', color: FOCUS.muted }}>
      <LayoutGrid size={40} color={FOCUS.orange} style={{ opacity: 0.5 }} />
      <div style={{ fontSize: 15, fontWeight: 700, color: FOCUS.ink, marginTop: 12 }}>{boardTag ? 'הלוח ריק' : 'אין עדיין משימות קבועות'}</div>
      <div style={{ fontSize: 13, marginTop: 6 }}>{boardTag ? 'הוסף משימה למעלה או בחר מהקיים' : 'הוסף משימה יומית או שבועית במפה'}</div>
    </div>
  ) : (
    <div style={{ minWidth: 'max-content', fontSize: 12 }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'stretch', borderBottom: `1px solid ${FOCUS.border}` }}>
        <div style={{ ...sStart, height: 32, display: 'flex', alignItems: 'center', fontWeight: 700, color: FOCUS.muted }}>משימה</div>
        {columns.map((col, i) => {
          const isToday = colKind === 'day' && col === today;
          const label = colKind === 'month' ? HEB_MONTHS[i].slice(0, 3) : String(new Date(col + 'T00:00:00').getDate());
          const dow = colKind === 'day' ? HEB_DAYS[dowOf(col)] : null;
          return (
            <div key={col} style={{ width: cellW, flexShrink: 0, height: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: isToday ? hexAlpha(FOCUS.orange, 0.14) : 'transparent', color: isToday ? '#B4531A' : FOCUS.muted, fontWeight: isToday ? 800 : 600 }}>
              {dow && <span style={{ fontSize: 8, lineHeight: 1, opacity: 0.7 }}>{dow}</span>}
              <span style={{ fontSize: colKind === 'month' ? 11 : 12 }}>{label}</span>
            </div>
          );
        })}
        <div style={{ ...sEnd, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: FOCUS.muted, fontSize: 10 }}>%·רצף</div>
      </div>

      {/* Groups + task rows */}
      {groups.map(g => (
        <React.Fragment key={g.id}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ ...sStart, height: 24, display: 'flex', alignItems: 'center', gap: 6, background: hexAlpha(g.color, 0.1) }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: g.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 800, color: darken(g.color), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.title}</span>
            </div>
            <div style={{ flex: 1, height: 24, background: hexAlpha(g.color, 0.05) }} />
          </div>
          {g.tasks.map(task => {
            const rowStat = colKind === 'month'
              ? columns.reduce((a, m) => { const s = taskMonthStats(task, logSet, monthDays(m), today); return { done: a.done + s.done, expected: a.expected + s.expected }; }, { done: 0, expected: 0 })
              : taskMonthStats(task, logSet, columns, today);
            const p = rowStat.expected ? rowStat.done / rowStat.expected : 0;
            const streak = taskStreak(task, logSet, today);
            return (
              <div key={task.id} style={{ display: 'flex', alignItems: 'center', borderBottom: `1px solid ${FOCUS.border}` }}>
                <RowLabel task={task} style={sStart}
                  onTap={() => setSheetNode(task)}
                  onLongPress={boardTag ? (x, y) => setRowMenu({ task, x, y }) : null} />
                {columns.map(col => (
                  <Cell key={col} task={task} col={col} colKind={colKind} logSet={logSet} today={today} color={g.color} w={cellW} onToggle={toggleCell} />
                ))}
                <div style={{ ...sEnd, minHeight: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1.1 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: rowStat.expected ? pctColor(p) : FOCUS.muted }}>{pctText(rowStat.done, rowStat.expected)}</span>
                  <span style={{ fontSize: 9, color: FOCUS.muted }}>🔥{streak}</span>
                </div>
              </div>
            );
          })}
        </React.Fragment>
      ))}

      {/* Bottom summary */}
      <div style={{ display: 'flex', alignItems: 'center', borderTop: `2px solid ${FOCUS.border}`, background: '#FFFDFA' }}>
        <div style={{ ...sStart, minHeight: 28, display: 'flex', alignItems: 'center', fontWeight: 800, color: FOCUS.ink, background: '#FFFDFA' }}>סה״כ</div>
        {colStats.map((c, i) => {
          const p = c.expected ? c.done / c.expected : 0;
          return (
            <div key={i} style={{ width: cellW, flexShrink: 0, minHeight: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: c.expected ? pctColor(p) : FOCUS.border }}>
              {c.expected ? Math.round(p * 100) : '·'}
            </div>
          );
        })}
        <div style={{ ...sEnd, minHeight: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: grandStat.expected ? pctColor(grandStat.done / grandStat.expected) : FOCUS.muted, background: '#FFFDFA' }}>
          {pctText(grandStat.done, grandStat.expected)}
        </div>
      </div>
    </div>
  );

  return (
    <LifeOSLayout title={title} fullBleed={!pageScroll} hideFab>
      {chips}

      {/* ── Quick add (collapsible) + add-from-existing ── */}
      {quickAdd && (
        <QuickAddRow arms={armChips} defaultArmId={defaultArmId} onAdd={createRecurring}
          onPick={boardTag ? () => setPickerOpen(true) : null} />
      )}

      {/* ── Day-summary strip ── */}
      {daySummary && (
        <div onClick={() => notesToday.length && setFeedOpen(true)}
          style={{ margin: '0 12px 8px', display: 'flex', alignItems: 'center', gap: 10, background: FOCUS.card, border: `1px solid ${FOCUS.border}`, borderRadius: 14, boxShadow: FOCUS.neu, padding: '9px 14px', cursor: notesToday.length ? 'pointer' : 'default' }}>
          <ClipboardList size={17} color={FOCUS.orange} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: FOCUS.ink }}>תועדו היום {notesToday.length} פעילויות</div>
          {notesToday.length > 0 && <ChevronLeft size={18} color={FOCUS.muted} />}
        </div>
      )}

      {/* ── Today strip (board rows only when curated) ── */}
      <div onClick={() => navigate('/lifeos/focus/today')}
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
          {[['week', 'שבוע'], ['month', 'חודש'], ['year', 'שנה']].map(([k, l]) => (
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

      {/* ── The grid — page-scroll (no inner vertical scroll) or fullBleed ── */}
      {pageScroll ? (
        <div style={{ overflowX: 'auto', overflowY: 'hidden' }}>{grid}</div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', WebkitOverflowScrolling: 'touch', padding: '0 0 24px' }}>{grid}</div>
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

      {docNode && <FocusDocSheet node={docNode} userId={userId} onClose={() => setDocNode(null)} onSaved={load} />}
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
      {feedOpen && <DayFeedSheet notes={notesToday} byId={byId} onClose={() => setFeedOpen(false)} />}
      <IdeaCaptureButton onSaved={load} hidden={!!(sheetNode || docNode || pickerOpen)} />
    </LifeOSLayout>
  );
}

// ── Row label: tap = open home sheet, long-press = mini bar ─────────
function RowLabel({ task, style, onTap, onLongPress }) {
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
    <div onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={() => clearTimeout(t.current.timer)}
      style={{ ...style, minHeight: 32, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', userSelect: 'none', touchAction: 'pan-y' }}>
      {task.is_fear_task && <Flame size={11} color={FOCUS.red} style={{ flexShrink: 0 }} />}
      <span style={{ fontSize: 12.5, fontWeight: 600, color: FOCUS.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title || 'משימה'}</span>
      <span style={{ fontSize: 9, color: FOCUS.muted, flexShrink: 0 }}>{task.frequency === 'daily' ? 'יומי' : task.frequency === 'weekly' ? HEB_DAYS[task.day_of_week] : 'חודשי'}</span>
    </div>
  );
}

// ── Quick-add: collapsed to a [+] button; expands to the full form ──
function QuickAddRow({ arms, defaultArmId, onAdd, onPick }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [freq, setFreq] = useState('daily');
  const [dow, setDow] = useState(0);
  const [armId, setArmId] = useState(defaultArmId);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!armId && defaultArmId) setArmId(defaultArmId); }, [defaultArmId, armId]);

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
      <div style={{ margin: '0 12px 8px', display: 'flex', gap: 8 }}>
        <button onClick={() => setOpen(true)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', borderRadius: 12, border: `1px solid ${FOCUS.border}`, background: '#fff', boxShadow: FOCUS.neu, color: FOCUS.orange, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          <Plus size={17} /> משימה חדשה
        </button>
        {onPick && (
          <button onClick={onPick} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderRadius: 12, border: `1px solid ${FOCUS.border}`, background: '#fff', boxShadow: FOCUS.neu, color: FOCUS.ink, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
            <ListPlus size={16} /> מהקיים
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ margin: '0 12px 10px', background: FOCUS.card, border: `1px solid ${FOCUS.border}`, borderRadius: 14, boxShadow: FOCUS.neu, padding: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input autoFocus value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          placeholder="משימה קבועה חדשה…"
          style={{ flex: 1, minWidth: 0, border: `1px solid ${FOCUS.border}`, borderRadius: 11, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', color: FOCUS.ink, background: '#FFFDFA', outline: 'none' }} />
        <button onClick={submit} disabled={busy || !text.trim() || !armId} aria-label="הוסף"
          style={{ flexShrink: 0, width: 42, height: 42, borderRadius: 12, border: 'none', background: (busy || !text.trim()) ? FOCUS.border : FOCUS.orangeGrad, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Plus size={22} />
        </button>
        <button onClick={() => setOpen(false)} aria-label="סגור" style={{ flexShrink: 0, width: 38, height: 42, borderRadius: 12, border: `1px solid ${FOCUS.border}`, background: '#fff', color: FOCUS.muted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <X size={18} />
        </button>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8, overflowX: 'auto', alignItems: 'center' }}>
        {freqChip('daily', 'יומי')}
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
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: FOCUS.muted }}><X size={20} /></button>
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

// ── Day feed: today's documentation notes, chronological ────────────
function DayFeedSheet({ notes, byId, onClose }) {
  const timeOf = (iso) => { try { return new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
  return (
    <div dir="rtl" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1400, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 560, maxHeight: '80vh', overflowY: 'auto', background: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: '16px 16px calc(env(safe-area-inset-bottom,0px) + 20px)', boxShadow: '0 -6px 24px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: FOCUS.ink }}>תיעוד היום · {notes.length}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: FOCUS.muted }}><X size={20} /></button>
        </div>
        {notes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 12px', color: FOCUS.muted, fontSize: 13 }}>עוד לא תיעדת פעילויות היום</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {notes.map(nt => (
              <div key={nt.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: '#FFFDFA', border: `1px solid ${FOCUS.border}`, borderRadius: 12, padding: '10px 12px' }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: FOCUS.orange, flexShrink: 0, marginTop: 1 }}>{timeOf(nt.created_at)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: FOCUS.ink, marginBottom: 2 }}>{byId[nt.node_id]?.title || 'משימה'}</div>
                  <div style={{ fontSize: 12.5, color: FOCUS.ink, whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{nt.content}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── One grid cell ──────────────────────────────────────────────────
function Cell({ task, col, colKind, logSet, today, color, w, onToggle }) {
  if (colKind === 'month') {
    const s = taskMonthStats(task, logSet, monthDays(col), today);
    const p = s.expected ? s.done / s.expected : 0;
    return (
      <div style={{ width: w, flexShrink: 0, minHeight: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: s.expected ? pctColor(p) : FOCUS.border }}>
        {s.expected ? `${Math.round(p * 100)}` : '·'}
      </div>
    );
  }
  const expected = taskExpectedOn(task, col);
  const logged = taskLoggedOn(task, logSet, col);
  const future = col > today;
  const tappable = !future && (expected || logged);
  let inner;
  if (logged) {
    inner = <span style={{ width: 17, height: 17, borderRadius: 5, background: color, color: '#fff', fontSize: 12, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>;
  } else if (expected) {
    inner = <span style={{ width: 15, height: 15, borderRadius: 4, border: `1.5px solid ${future ? FOCUS.border : hexAlpha(color, 0.7)}`, opacity: future ? 0.5 : 1 }} />;
  } else {
    inner = <span style={{ width: 8, height: 2, borderRadius: 2, background: FOCUS.border }} />;
  }
  return (
    <div onClick={tappable ? () => onToggle(task, col) : undefined}
      style={{ width: w, flexShrink: 0, minHeight: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: tappable ? 'pointer' : 'default', background: col === today ? hexAlpha(FOCUS.orange, 0.07) : 'transparent' }}>
      {inner}
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
