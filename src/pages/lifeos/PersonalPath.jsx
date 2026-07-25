import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '@/lib/AuthContext';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import PageSkeleton from '@/components/PageSkeleton';
import CyclePathStrip from '@/components/lifeos/CyclePathStrip';
import { ChevronRight } from 'lucide-react';
import {
  FOCUS, hexAlpha, isoDate, addDays, fetchNodes, indexNodes,
  BANK_TAG, INSPIRATION_TAG, PERSONAL_ARM_TITLE, ARM_PALETTE, darken,
} from '@/lib/lifeos/focus-api';
import { fetchExecutions, fetchDayStates } from '@/lib/lifeos/personal-day-api';
import { weekProgressMap, minutesThisWeek } from '@/lib/lifeos/week-math';

// ─── מסלול המחזור ──────────────────────────────────────────────────
// The destination of the day screen's path strip: the same RTL path, once per
// branch, with the cycle goal underneath it. Day 1 on the RIGHT, progress
// flowing LEFT — the direction rule from CyclePathStrip, reused, not re-derived.
export default function PersonalPath() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const navigate = useNavigate();
  const today = isoDate();

  const [nodes, setNodes] = useState([]);
  const [executions, setExecutions] = useState([]);
  const [dayStates, setDayStates] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    const from = addDays(today, -180);
    try {
      const [ns, ex, ds] = await Promise.all([
        fetchNodes(userId), fetchExecutions(userId, from, today), fetchDayStates(userId, from, today),
      ]);
      setNodes(ns); setExecutions(ex); setDayStates(ds);
    } finally { setLoaded(true); }
  }, [userId, today]);
  useEffect(() => { load(); }, [load]);

  const { children } = useMemo(() => indexNodes(nodes), [nodes]);
  const arm = useMemo(() => nodes.find(n => n.node_type !== 'task' && n.title === PERSONAL_ARM_TITLE), [nodes]);
  const branches = useMemo(() => (arm ? (children[arm.id] || []).filter(b => b.node_type === 'branch') : []), [arm, children]);

  if (!loaded) return <LifeOSLayout title="מסלול"><PageSkeleton rows={6} /></LifeOSLayout>;

  return (
    <LifeOSLayout title="מסלול המחזור">
      <div style={{ padding: '4px 12px 8px' }}>
        <button onClick={() => navigate('/lifeos/personal-board')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: FOCUS.orange, fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
          <ChevronRight size={16} /> חזרה לאישי
        </button>
      </div>

      {branches.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: FOCUS.muted, fontSize: 13 }}>אין ענפים עדיין</div>
      )}

      {branches.map((b, i) => {
        const color = ARM_PALETTE[i % ARM_PALETTE.length];
        const habits = (children[b.id] || []).filter(t => t.node_type === 'task'
          && !(t.tags || []).includes(BANK_TAG) && !(t.tags || []).includes(INSPIRATION_TAG)
          && t.task_kind !== 'oneoff');
        const prog = weekProgressMap(habits, executions, { date: today, dayStates });
        const metCount = habits.filter(h => prog[h.id]?.met).length;
        const mins = habits.reduce((s, h) => s + minutesThisWeek(h, executions, { date: today, dayStates }), 0);
        const start = b.cycle_start ? String(b.cycle_start).slice(0, 10) : null;
        const end = b.cycle_end ? String(b.cycle_end).slice(0, 10) : null;

        return (
          <div key={b.id} style={{ margin: '0 0 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0 14px 4px' }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 14, fontWeight: 800, color: darken(color) }}>{b.title}</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 10.5, fontWeight: 700, color: FOCUS.muted }}>
                {metCount}/{habits.length} הרגלים בשבוע{mins > 0 ? ` · ${Math.round(mins / 60)} ש׳` : ''}
              </span>
            </div>

            {start && end
              ? <CyclePathStrip start={start} end={end} today={today} label={b.title} />
              : <div style={{ margin: '0 12px 8px', padding: '10px 12px', background: FOCUS.card, border: `1px dashed ${FOCUS.edge}`, borderRadius: 14, fontSize: 12, color: FOCUS.muted }}>אין מחזור מוגדר לענף הזה</div>}

            {b.metric_target != null && (
              <div style={{ margin: '0 12px 4px', padding: '9px 12px', background: hexAlpha(color, 0.07), border: `1px solid ${hexAlpha(color, 0.3)}`, borderRadius: 12 }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: darken(color) }}>
                  {b.note || `${b.metric_target} ${b.metric_unit || ''}`}
                </div>
                <div style={{ fontSize: 10.5, color: FOCUS.muted, marginTop: 2 }}>
                  יעד: {b.metric_target} {b.metric_unit || ''} · בוצע: {b.metric_current || 0}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </LifeOSLayout>
  );
}
