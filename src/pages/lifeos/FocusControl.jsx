import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '@/lib/AuthContext';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import PageSkeleton from '@/components/PageSkeleton';
import FocusChips from '@/components/lifeos/FocusChips';
import IdeaCaptureButton from '@/components/lifeos/IdeaCaptureButton';
import { Flame, AlertTriangle, CheckCircle2, CalendarClock, Users, Coins, Timer, CalendarRange, ChevronLeft, Gauge } from 'lucide-react';
import { toast } from 'sonner';
import {
  FOCUS, isoDate, addDays, dowOf, HEB_DAYS,
  fetchNodes, fetchLogs, logSetFrom, indexNodes,
  harvestToday, computeStreak, todayStats, descendantTasks, allDescendants, occursOn,
} from '@/lib/lifeos/focus-api';

const money = (n) => Number(n || 0).toLocaleString('he-IL');

export default function FocusControl() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const navigate = useNavigate();
  const today = isoDate();

  const [nodes, setNodes] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const [n, l] = await Promise.all([
        fetchNodes(userId),
        fetchLogs(userId, addDays(today, -62), today),
      ]);
      setNodes(n); setLogs(l);
    } catch { toast.error('שגיאה בטעינה'); }
    finally { setLoaded(true); }
  }, [userId, today]);

  useEffect(() => { load(); }, [load]);

  const { children, roots } = useMemo(() => indexNodes(nodes), [nodes]);
  const logSet = useMemo(() => logSetFrom(logs), [logs]);
  const isDone = useCallback((n) => logSet.has(n.id + '|' + today) || n.status === 'done', [logSet, today]);

  const streak = useMemo(() => computeStreak(nodes, logs, today), [nodes, logs, today]);
  const stats = useMemo(() => todayStats(nodes, logSet, today), [nodes, logSet, today]);
  const overdue = useMemo(() => harvestToday(nodes, logSet, today).overdue.length, [nodes, logSet, today]);
  const fearOpen = useMemo(() => nodes.filter(n => n.node_type === 'task' && n.status === 'active' && n.is_fear_task && !logSet.has(n.id + '|' + today)).length, [nodes, logSet, today]);

  const branches = useMemo(() => {
    const list = [];
    roots.forEach(r => (children[r.id] || []).forEach(c => { if (c.node_type !== 'task') list.push(c); }));
    return list;
  }, [roots, children]);

  const weekDates = useMemo(() => {
    const start = addDays(today, -dowOf(today));
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [today]);

  const shortcuts = [
    { label: 'לידים', Icon: Users, onClick: () => navigate('/lifeos/leads') },
    { label: 'פיננסי', Icon: Coins, onClick: () => navigate('/lifeos/finance-dashboard') },
    { label: 'שעונים', Icon: Timer, onClick: () => navigate('/clocks') },
    { label: 'תכנון שבוע', Icon: CalendarRange, onClick: () => navigate('/lifeos/focus/calendar', { state: { openPlan: true } }) },
  ];

  if (!loaded) return <LifeOSLayout title="מיקוד" fullBleed><FocusChips /><PageSkeleton rows={6} /></LifeOSLayout>;

  const noData = nodes.length === 0;

  return (
    <LifeOSLayout title="מיקוד" fullBleed>
      <FocusChips />
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '0 14px 24px' }}>

        {/* 1. TOP STRIP — 2x2 tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
          <Tile Icon={Flame} tint="#FFF3E9" fg="#B4531A" label="רצף ימים" value={`${streak}`} unit="ימים" />
          <Tile Icon={CheckCircle2} tint="#E1F5EE" fg="#085041" label="משימות היום"
            value={stats.total ? `${stats.done} מתוך ${stats.total}` : 'אין משימות'} big={!stats.total} />
          <Tile Icon={AlertTriangle} tint={overdue > 0 ? '#FCEBEB' : '#F1F3F6'} fg={overdue > 0 ? '#C0392B' : '#7a8290'}
            label="באיחור" value={`${overdue}`} unit={overdue > 0 ? 'משימות' : 'הכל בזמן'} unitInline={overdue === 0} />
          <Tile Icon={Flame} tint="#FBEAF0" fg="#72243E" label="אומץ פתוחות" value={`${fearOpen}`} unit={fearOpen ? 'משימות' : 'אין כרגע'} unitInline={fearOpen === 0} />
        </div>

        {/* 2. ARM CARDS */}
        <div style={{ fontSize: 13, fontWeight: 800, color: FOCUS.muted, marginBottom: 8 }}>זרועות</div>
        {branches.length === 0 ? (
          <EmptyBox icon={<Gauge size={34} color={FOCUS.orange} style={{ opacity: 0.5 }} />} title="אין זרועות עדיין" sub="עבור למפה כדי להוסיף ענף ראשון" />
        ) : (
          branches.map(b => {
            const tasks = descendantTasks(b.id, children);
            const doneCount = tasks.filter(isDone).length;
            const taskPct = tasks.length ? doneCount / tasks.length : 0;
            const hasMetric = b.metric_target != null && b.metric_target !== '';
            const metricPct = hasMetric && Number(b.metric_target) > 0 ? Math.min(1, Number(b.metric_current || 0) / Number(b.metric_target)) : 0;

            const subtree = [b, ...allDescendants(b.id, children)];
            const revSum = subtree.reduce((s, n) => s + Number(n.revenue_actual || 0), 0);
            const costSum = subtree.reduce((s, n) => s + Number(n.cost_actual || 0), 0);
            const hasEcon = subtree.some(n => (n.budget != null && n.budget !== '') || Number(n.cost_actual || 0) !== 0 || Number(n.revenue_actual || 0) !== 0);
            const profit = revSum - costSum;

            const upcoming = tasks
              .filter(t => t.due_date && t.due_date >= today)
              .map(t => t.due_date).sort()[0];

            return (
              <div key={b.id} onClick={() => navigate('/lifeos/focus/map', { state: { focusBranchId: b.id } })}
                style={{ background: FOCUS.card, border: `1px solid ${FOCUS.border}`, borderRadius: 16, boxShadow: FOCUS.neu, padding: 14, marginBottom: 12, cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: FOCUS.ink }}>{b.title}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: FOCUS.muted }}>{tasks.length ? `${doneCount}/${tasks.length}` : 'ריק'}</span>
                </div>

                {tasks.length > 0 ? (
                  <div style={{ height: 6, borderRadius: 4, background: '#F1E7D8', marginTop: 9, overflow: 'hidden' }}>
                    <div style={{ width: `${taskPct * 100}%`, height: '100%', background: FOCUS.orange, borderRadius: 4 }} />
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: FOCUS.muted, marginTop: 8 }}>אין משימות בזרוע — הוסף במפה</div>
                )}

                {hasMetric && (
                  <>
                    <div style={{ fontSize: 12, color: '#085041', fontWeight: 700, marginTop: 9 }}>
                      {money(b.metric_current)} מתוך {money(b.metric_target)} {b.metric_unit || ''}
                    </div>
                    <div style={{ height: 6, borderRadius: 4, background: '#F1E7D8', marginTop: 5, overflow: 'hidden' }}>
                      <div style={{ width: `${metricPct * 100}%`, height: '100%', background: '#16a34a', borderRadius: 4 }} />
                    </div>
                  </>
                )}

                {hasEcon && (
                  <div style={{ fontSize: 12.5, marginTop: 10, fontWeight: 700, color: FOCUS.muted }}>
                    הכנסות {money(revSum)} · הוצאות {money(costSum)} · רווח{' '}
                    <span style={{ color: profit >= 0 ? '#085041' : '#C0392B', fontWeight: 900 }}>
                      {profit >= 0 ? '' : '−'}{money(Math.abs(profit))}
                    </span>
                  </div>
                )}

                {upcoming && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#B4531A', fontWeight: 700, marginTop: 10 }}>
                    <CalendarClock size={13} /> דדליין קרוב: {upcoming}
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* 3. WEEK FORECAST */}
        <div style={{ fontSize: 13, fontWeight: 800, color: FOCUS.muted, margin: '18px 0 8px' }}>תחזית שבוע</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
          {weekDates.map(d => {
            const count = nodes.filter(n => occursOn(n, d)).length;
            const hasDue = nodes.some(n => n.node_type === 'task' && n.status === 'active' && n.due_date === d);
            const isToday = d === today;
            return (
              <button key={d} onClick={() => navigate('/lifeos/focus/calendar', { state: { date: d } })}
                style={{
                  flex: 1, padding: '10px 2px', borderRadius: 12, cursor: 'pointer',
                  border: isToday ? `1.5px solid ${FOCUS.orange}` : `1px solid ${FOCUS.border}`,
                  background: '#fff', boxShadow: FOCUS.neu, position: 'relative',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, fontFamily: 'inherit',
                }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: isToday ? FOCUS.orange : FOCUS.muted }}>{HEB_DAYS[dowOf(d)]}</span>
                <span style={{ fontSize: 17, fontWeight: 800, color: count ? FOCUS.ink : '#C9BBA6' }}>{count}</span>
                {hasDue && <span style={{ position: 'absolute', top: 6, left: 6, width: 7, height: 7, borderRadius: '50%', background: '#E24B4A' }} />}
              </button>
            );
          })}
        </div>

        {/* 4. SHORTCUTS */}
        <div style={{ fontSize: 13, fontWeight: 800, color: FOCUS.muted, marginBottom: 8 }}>קיצורים</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {shortcuts.map(s => (
            <button key={s.label} onClick={s.onClick}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderRadius: 999, border: `1px solid ${FOCUS.border}`, background: '#fff', boxShadow: FOCUS.neu, color: FOCUS.ink, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              <s.Icon size={15} color={FOCUS.orange} /> {s.label} <ChevronLeft size={14} color={FOCUS.muted} />
            </button>
          ))}
        </div>

        {noData && (
          <EmptyBox icon={<Gauge size={38} color={FOCUS.orange} style={{ opacity: 0.5 }} />} title="עדיין אין נתונים לבקרה" sub="בנה את המפה שלך והבקרה תתמלא מעצמה" />
        )}
      </div>

      <IdeaCaptureButton onSaved={load} />
    </LifeOSLayout>
  );
}

function Tile({ Icon, tint, fg, label, value, unit, big, unitInline }) {
  return (
    <div style={{ background: FOCUS.card, border: `1px solid ${FOCUS.border}`, borderRadius: 16, boxShadow: FOCUS.neu, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
        <span style={{ width: 28, height: 28, borderRadius: 9, background: tint, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={16} color={fg} />
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: FOCUS.muted }}>{label}</span>
      </div>
      <div style={{ fontSize: big ? 15 : 22, fontWeight: 900, color: FOCUS.ink, lineHeight: 1.1 }}>{value}</div>
      {unit && <div style={{ fontSize: 11, color: FOCUS.muted, marginTop: 3 }}>{unit}</div>}
    </div>
  );
}

function EmptyBox({ icon, title, sub }) {
  return (
    <div style={{ textAlign: 'center', padding: '32px 20px', color: FOCUS.muted, background: '#fff', border: `1px dashed ${FOCUS.border}`, borderRadius: 16, marginTop: 8 }}>
      {icon}
      <div style={{ fontSize: 15, fontWeight: 800, color: FOCUS.ink, marginTop: 10 }}>{title}</div>
      <div style={{ fontSize: 13, marginTop: 5 }}>{sub}</div>
    </div>
  );
}
