import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '@/lib/AuthContext';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import PageSkeleton from '@/components/PageSkeleton';
import FocusChips from '@/components/lifeos/FocusChips';
import IdeaCaptureButton from '@/components/lifeos/IdeaCaptureButton';
import FocusDocSheet, { doneToast } from '@/components/lifeos/FocusDocSheet';
import { ChevronRight, ChevronLeft, Flame, LayoutGrid } from 'lucide-react';
import { toast } from 'sonner';
import {
  FOCUS, isoDate, addDays, dowOf, HEB_DAYS,
  monthDays, weekDays, monthLabel, HEB_MONTHS,
  fetchNodes, fetchLogs, logSetFrom, indexNodes, topBranchOf,
  logTask, unlogTask, armColorMap, darken, hexAlpha,
  recurringTasks, taskExpectedOn, taskLoggedOn, taskMonthStats, taskStreak,
  harvestToday, todayStats,
} from '@/lib/lifeos/focus-api';

const GREEN = '#16a34a';
const pctColor = (p) => (p >= 0.8 ? GREEN : p >= 0.5 ? FOCUS.amber : FOCUS.red);
const pctText = (done, expected) => (expected ? `${Math.round((done / expected) * 100)}%` : '—');

const LABEL_W = 132;

export default function FocusTracker() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const navigate = useNavigate();
  const today = isoDate();

  const [nodes, setNodes] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [period, setPeriod] = useState('month'); // week | month | year
  const [cursor, setCursor] = useState(today);    // a date inside the shown period
  const [armFilter, setArmFilter] = useState(null);
  const [docNode, setDocNode] = useState(null);

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
      const lo = periodStart < addDays(today, -120) ? periodStart : addDays(today, -120);
      const hi = periodEnd > today ? periodEnd : today;
      const [n, l] = await Promise.all([fetchNodes(userId), fetchLogs(userId, lo, hi)]);
      setNodes(n); setLogs(l);
    } catch { toast.error('שגיאה בטעינה'); }
    finally { setLoaded(true); }
  }, [userId, periodStart, periodEnd, today]);

  useEffect(() => { load(); }, [load]);

  const { byId, children, roots } = useMemo(() => indexNodes(nodes), [nodes]);
  const armMap = useMemo(() => armColorMap(children, roots), [children, roots]);
  const logSet = useMemo(() => logSetFrom(logs), [logs]);

  // ── Rows grouped by arm ───────────────────────────────────────────
  const groups = useMemo(() => {
    const recurr = recurringTasks(nodes);
    const gmap = new Map();
    const order = [];
    roots.forEach(r => (children[r.id] || []).forEach(b => {
      if (b.node_type !== 'task') { order.push(b.id); gmap.set(b.id, { id: b.id, title: b.title || 'ענף', color: armMap[b.id] || '#B48A5A', tasks: [] }); }
    }));
    recurr.forEach(t => {
      const top = topBranchOf(t, byId);
      const gid = top?.id || 'none';
      if (!gmap.has(gid)) { gmap.set(gid, { id: gid, title: top?.title || 'כללי', color: armMap[gid] || '#B48A5A', tasks: [] }); order.push(gid); }
      gmap.get(gid).tasks.push(t);
    });
    let list = order.map(id => gmap.get(id)).filter(g => g && g.tasks.length);
    if (armFilter) list = list.filter(g => g.id === armFilter);
    return list;
  }, [nodes, children, roots, byId, armMap, armFilter]);

  const armChips = useMemo(() => {
    const arr = [];
    roots.forEach(r => (children[r.id] || []).forEach(b => { if (b.node_type !== 'task') arr.push({ id: b.id, title: b.title || 'ענף', color: armMap[b.id] || '#B48A5A' }); }));
    return arr;
  }, [roots, children, armMap]);

  const allRows = useMemo(() => groups.flatMap(g => g.tasks), [groups]);

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

  // ── Today strip (Part D) ──────────────────────────────────────────
  const stats = useMemo(() => todayStats(nodes, logSet, today), [nodes, logSet, today]);
  const fearTask = useMemo(() => {
    const { overdue, rollover, main } = harvestToday(nodes, logSet, today);
    return [...overdue, ...rollover, ...main].find(n => n.is_fear_task) || null;
  }, [nodes, logSet, today]);
  const remaining = Math.max(0, stats.total - stats.done);
  const allDone = stats.total > 0 && stats.done === stats.total;

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
      try { await logTask(userId, task, date); doneToast('בוצע ✓', task, setDocNode); } catch { load(); }
    }
  };

  const shift = (dir) => {
    if (period === 'week') setCursor(c => addDays(c, dir * 7));
    else if (period === 'year') { const d = new Date(cursor + 'T00:00:00'); setCursor(isoDate(new Date(d.getFullYear() + dir, d.getMonth(), 1))); }
    else { const d = new Date(cursor + 'T00:00:00'); setCursor(isoDate(new Date(d.getFullYear(), d.getMonth() + dir, 1))); }
  };
  const periodTitle = period === 'year' ? String(new Date(cursor + 'T00:00:00').getFullYear())
    : period === 'week' ? `${periodStart.slice(8)}–${periodEnd.slice(8)} · ${monthLabel(cursor)}`
    : monthLabel(cursor);

  const cellW = colKind === 'month' ? 46 : 30;

  if (!loaded) return <LifeOSLayout title="מיקוד" fullBleed hideFab><FocusChips /><PageSkeleton rows={7} /></LifeOSLayout>;

  return (
    <LifeOSLayout title="מיקוד" fullBleed hideFab>
      <FocusChips />

      {/* ── Today strip (tap → היום) ── */}
      <div onClick={() => navigate('/lifeos/focus/today')}
        style={{ margin: '0 12px 8px', display: 'flex', alignItems: 'center', gap: 12, background: allDone ? 'linear-gradient(135deg,#FFF3E9,#FFE4CF)' : FOCUS.card, border: `1px solid ${FOCUS.border}`, borderRadius: 14, boxShadow: FOCUS.neu, padding: '10px 14px', cursor: 'pointer' }}>
        <MiniRing done={stats.done} total={stats.total} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {allDone ? (
            <div style={{ fontSize: 15, fontWeight: 800, color: '#B4531A' }}>יום מושלם ✓</div>
          ) : (
            <>
              <div style={{ fontSize: 14, fontWeight: 800, color: FOCUS.ink }}>היום: נותרו {remaining}</div>
              <div style={{ fontSize: 12, color: FOCUS.muted, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <Flame size={12} color={FOCUS.red} /> אומץ: {fearTask ? (fearTask.title || 'משימה') : 'אין'}
              </div>
            </>
          )}
        </div>
        <ChevronLeft size={18} color={FOCUS.muted} />
      </div>

      {/* ── Controls: month nav + period + scope ── */}
      <div style={{ padding: '0 12px 8px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => shift(1)} style={navBtn}><ChevronRight size={18} /></button>
          <div style={{ flex: 1, textAlign: 'center', fontSize: 14, fontWeight: 800, color: FOCUS.ink }}>{periodTitle}</div>
          <button onClick={() => shift(-1)} style={navBtn}><ChevronLeft size={18} /></button>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[['week', 'שבוע'], ['month', 'חודש'], ['year', 'שנה']].map(([k, l]) => (
            <button key={k} onClick={() => { setPeriod(k); setCursor(today); }}
              style={{ flex: 1, padding: '7px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${period === k ? FOCUS.orange : FOCUS.border}`, background: period === k ? FOCUS.orange : '#fff', color: period === k ? '#fff' : FOCUS.muted, fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>{l}</button>
          ))}
        </div>
        {armChips.length > 0 && (
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
            <button onClick={() => setArmFilter(null)} style={scopeChip(!armFilter, FOCUS.orange)}>הכל</button>
            {armChips.map(a => (
              <button key={a.id} onClick={() => setArmFilter(armFilter === a.id ? null : a.id)} style={scopeChip(armFilter === a.id, a.color)}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: a.color, display: 'inline-block', marginLeft: 5 }} />{a.title}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── The grid ── */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', WebkitOverflowScrolling: 'touch', padding: '0 0 24px' }}>
        {allRows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: FOCUS.muted }}>
            <LayoutGrid size={40} color={FOCUS.orange} style={{ opacity: 0.5 }} />
            <div style={{ fontSize: 15, fontWeight: 700, color: FOCUS.ink, marginTop: 12 }}>אין עדיין משימות קבועות</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>הוסף משימה יומית או שבועית במפה</div>
          </div>
        ) : (
          <div style={{ minWidth: 'max-content', fontSize: 12 }}>
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'stretch', borderBottom: `1px solid ${FOCUS.border}` }}>
              <div style={{ ...stickyStart, height: 34, display: 'flex', alignItems: 'center', fontWeight: 700, color: FOCUS.muted }}>משימה</div>
              {columns.map((col, i) => {
                const isToday = colKind === 'day' && col === today;
                const label = colKind === 'month' ? HEB_MONTHS[i].slice(0, 3) : String(new Date(col + 'T00:00:00').getDate());
                const dow = colKind === 'day' ? HEB_DAYS[dowOf(col)] : null;
                return (
                  <div key={col} style={{ width: cellW, flexShrink: 0, height: 34, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0, background: isToday ? hexAlpha(FOCUS.orange, 0.14) : 'transparent', color: isToday ? '#B4531A' : FOCUS.muted, fontWeight: isToday ? 800 : 600 }}>
                    {dow && <span style={{ fontSize: 8, lineHeight: 1, opacity: 0.7 }}>{dow}</span>}
                    <span style={{ fontSize: colKind === 'month' ? 11 : 12 }}>{label}</span>
                  </div>
                );
              })}
              <div style={{ ...stickyEnd, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: FOCUS.muted }}>%· רצף</div>
            </div>

            {/* Groups + task rows */}
            {groups.map(g => (
              <React.Fragment key={g.id}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <div style={{ ...stickyStart, height: 26, display: 'flex', alignItems: 'center', gap: 6, background: hexAlpha(g.color, 0.1) }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: g.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 800, color: darken(g.color), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.title}</span>
                  </div>
                  <div style={{ flex: 1, height: 26, background: hexAlpha(g.color, 0.05) }} />
                </div>
                {g.tasks.map(task => {
                  const rowStat = colKind === 'month'
                    ? columns.reduce((a, m) => { const s = taskMonthStats(task, logSet, monthDays(m), today); return { done: a.done + s.done, expected: a.expected + s.expected }; }, { done: 0, expected: 0 })
                    : taskMonthStats(task, logSet, columns, today);
                  const p = rowStat.expected ? rowStat.done / rowStat.expected : 0;
                  const streak = taskStreak(task, logSet, today);
                  return (
                    <div key={task.id} style={{ display: 'flex', alignItems: 'center', borderBottom: `1px solid ${FOCUS.border}` }}>
                      <div style={{ ...stickyStart, minHeight: 32, display: 'flex', alignItems: 'center', gap: 5 }}>
                        {task.is_fear_task && <Flame size={11} color={FOCUS.red} style={{ flexShrink: 0 }} />}
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: FOCUS.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title || 'משימה'}</span>
                        <span style={{ fontSize: 9, color: FOCUS.muted, flexShrink: 0 }}>{task.frequency === 'daily' ? 'יומי' : task.frequency === 'weekly' ? HEB_DAYS[task.day_of_week] : 'חודשי'}</span>
                      </div>
                      {columns.map(col => (
                        <Cell key={col} task={task} col={col} colKind={colKind} logSet={logSet} today={today} color={g.color} w={cellW} onToggle={toggleCell} />
                      ))}
                      <div style={{ ...stickyEnd, minHeight: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1.1 }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: rowStat.expected ? pctColor(p) : FOCUS.muted }}>{pctText(rowStat.done, rowStat.expected)}</span>
                        <span style={{ fontSize: 9, color: FOCUS.muted, display: 'flex', alignItems: 'center', gap: 1 }}>🔥{streak}</span>
                      </div>
                    </div>
                  );
                })}
              </React.Fragment>
            ))}

            {/* Bottom summary */}
            <div style={{ display: 'flex', alignItems: 'center', borderTop: `2px solid ${FOCUS.border}`, background: '#FFFDFA' }}>
              <div style={{ ...stickyStart, minHeight: 30, display: 'flex', alignItems: 'center', fontWeight: 800, color: FOCUS.ink, background: '#FFFDFA' }}>סה״כ</div>
              {colStats.map((c, i) => {
                const p = c.expected ? c.done / c.expected : 0;
                return (
                  <div key={i} style={{ width: cellW, flexShrink: 0, minHeight: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: c.expected ? pctColor(p) : FOCUS.border }}>
                    {c.expected ? Math.round(p * 100) : '·'}
                  </div>
                );
              })}
              <div style={{ ...stickyEnd, minHeight: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: grandStat.expected ? pctColor(grandStat.expected ? grandStat.done / grandStat.expected : 0) : FOCUS.muted, background: '#FFFDFA' }}>
                {pctText(grandStat.done, grandStat.expected)}
              </div>
            </div>
          </div>
        )}
      </div>

      {docNode && <FocusDocSheet node={docNode} userId={userId} onClose={() => setDocNode(null)} onSaved={load} />}
      <IdeaCaptureButton onSaved={load} />
    </LifeOSLayout>
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

const navBtn = { width: 34, height: 34, borderRadius: 10, border: `1px solid ${FOCUS.border}`, background: '#fff', boxShadow: FOCUS.neu, color: FOCUS.ink, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
const scopeChip = (active, color) => ({ flexShrink: 0, display: 'inline-flex', alignItems: 'center', padding: '5px 11px', borderRadius: 20, cursor: 'pointer', border: `1px solid ${active ? color : FOCUS.border}`, background: active ? hexAlpha(color, 0.14) : '#fff', color: active ? darken(color) : FOCUS.muted, fontSize: 12, fontWeight: 700, fontFamily: 'inherit', whiteSpace: 'nowrap' });
const stickyStart = { position: 'sticky', right: 0, zIndex: 2, width: LABEL_W, minWidth: LABEL_W, maxWidth: LABEL_W, padding: '0 8px', background: '#fff', boxSizing: 'border-box' };
const stickyEnd = { position: 'sticky', left: 0, zIndex: 2, width: 54, minWidth: 54, padding: '0 4px', background: '#fff', boxSizing: 'border-box' };
