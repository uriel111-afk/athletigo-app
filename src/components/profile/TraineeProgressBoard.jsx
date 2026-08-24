import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { ChevronLeft } from 'lucide-react';
import ExerciseTrendChart, { METRICS, dayOf } from '@/components/charts/ExerciseTrendChart';

// ────────────────────────────────────────────────────────────────
// The trainee's progress page, in the order a person actually reads:
//   1. how the month is going
//   2. every exercise on one line, with its record and a tiny trend
//   3. tap one to open its full chart
//
// Two queries, both already used elsewhere on this tab: the trainee's
// set logs with the execution join, and the names of the exercises
// those logs point at.
// ────────────────────────────────────────────────────────────────

const C = {
  orange: '#FF6F20',
  charcoal: '#2D2A26',
  cream: '#FBF3EA',
  gold: '#C9A227',
  green: '#15803D',
  muted: '#807A6A',
};
const SANS = "'Rubik', system-ui, sans-serif";

function parseTd(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

// "<block> · <inner>" for a drill inside a multi-exercise method,
// the plain name otherwise.
function labelFor(exercise, drillIndex) {
  const base = exercise?.exercise_name || exercise?.name || 'תרגיל';
  if (!drillIndex) return base;
  const td = parseTd(exercise?.tabata_data) || {};
  const inners = (Array.isArray(td.rounds) && td.rounds[0]?.exercises)
    ? td.rounds[0].exercises
    : Array.isArray(td.stations) ? td.stations
      : Array.isArray(td.exercises_in_rotation) ? td.exercises_in_rotation
        : Array.isArray(td.sub_exercises) ? td.sub_exercises
          : null;
  const inner = inners?.[drillIndex];
  const innerName = inner?.name || inner?.exercise_name || null;
  return innerName ? `${base} · ${innerName}` : `${base} · פנימי ${drillIndex + 1}`;
}

// One tiny line, no axes — just the shape of the last few sessions.
function Sparkline({ values }) {
  if (!Array.isArray(values) || values.length < 2) {
    return <div style={{ width: 56, height: 18 }} />;
  }
  const W = 56;
  const H = 18;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const x = (i) => (i * W) / (values.length - 1);
  const y = (v) => H - 2 - ((v - lo) / span) * (H - 4);
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join(' ');
  return (
    <svg width={W} height={H} style={{ display: 'block', flexShrink: 0 }}>
      <path d={d} fill="none" stroke={C.orange} strokeWidth="1.75"
        strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="2.5" fill={C.orange} />
    </svg>
  );
}

export default function TraineeProgressBoard({ traineeId }) {
  const [openKey, setOpenKey] = useState(null);

  const { data: logRows = [], isLoading } = useQuery({
    queryKey: ['trainee-set-logs', traineeId],
    enabled: !!traineeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exercise_set_logs')
        .select(`
          execution_id, exercise_id, drill_index, set_number,
          reps_completed, time_completed, weight_used,
          workout_executions!inner(executed_at, plan_id, trainee_id)
        `)
        .eq('workout_executions.trainee_id', traineeId);
      if (error) {
        console.warn('[TraineeProgressBoard] set-logs query failed:', error.message);
        return [];
      }
      return data || [];
    },
  });

  const exIds = useMemo(() => {
    const set = new Set();
    for (const r of logRows) if (r?.exercise_id) set.add(r.exercise_id);
    return [...set].sort();
  }, [logRows]);
  const exIdsKey = exIds.join(',');

  const { data: exerciseRows = [] } = useQuery({
    queryKey: ['progress-board-exercises', exIdsKey],
    enabled: exIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exercises')
        .select('id, exercise_name, tabata_data')
        .in('id', exIds);
      if (error) {
        console.warn('[TraineeProgressBoard] exercises query failed:', error.message);
        return [];
      }
      return data || [];
    },
  });

  const exerciseById = useMemo(() => {
    const m = {};
    for (const e of exerciseRows) if (e?.id) m[e.id] = e;
    return m;
  }, [exerciseRows]);

  // ── Build one series per (exercise, drill) ─────────────────────
  const series = useMemo(() => {
    const grouped = new Map();

    for (const row of logRows) {
      const at = row.workout_executions?.executed_at;
      const planId = row.workout_executions?.plan_id ?? null;
      if (!row.exercise_id || !row.execution_id || !at) continue;
      const drill = Number.isFinite(row.drill_index) ? row.drill_index : 0;
      const key = `${row.exercise_id}|${drill}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          key, exerciseId: row.exercise_id, drillIndex: drill,
          byExecution: new Map(), planCounts: new Map(),
        });
      }
      const g = grouped.get(key);
      g.planCounts.set(planId, (g.planCounts.get(planId) || 0) + 1);
      if (!g.byExecution.has(row.execution_id)) {
        g.byExecution.set(row.execution_id, { at, planId, rows: [] });
      }
      g.byExecution.get(row.execution_id).rows.push(row);
    }

    const out = [];
    for (const g of grouped.values()) {
      // One chart, one plan. Exercise rows are per-plan already, so a
      // mixed series is an anomaly; when it happens the dominant plan
      // wins rather than two plans sharing one line.
      let dominantPlan = null;
      let bestCount = -1;
      for (const [pid, count] of g.planCounts) {
        if (count > bestCount) { bestCount = count; dominantPlan = pid; }
      }

      // Which number this exercise is measured by: whatever its logs
      // actually carry, reps first.
      let metric = null;
      for (const exec of g.byExecution.values()) {
        for (const r of exec.rows) {
          if (r.reps_completed != null) { metric = METRICS.reps; break; }
          if (r.time_completed != null) { metric = METRICS.time; break; }
          if (r.weight_used != null) { metric = METRICS.weight; break; }
        }
        if (metric) break;
      }
      if (!metric) continue;

      const sessions = [];
      for (const exec of g.byExecution.values()) {
        if (exec.planId !== dominantPlan) continue;
        let best = null;
        for (const r of exec.rows) {
          const v = r[metric.logField];
          if (v == null || v === '') continue;
          const num = Number(v);
          if (!Number.isFinite(num)) continue;
          if (best == null || num > best) best = num;
        }
        if (best == null) continue;
        sessions.push({ at: exec.at, day: dayOf(exec.at), value: best });
      }
      if (sessions.length === 0) continue;
      sessions.sort((a, b) => a.day - b.day || new Date(a.at) - new Date(b.at));

      const values = sessions.map((s) => s.value);
      const record = Math.max(...values);
      const last = sessions[sessions.length - 1];
      const previousBest = values.length > 1 ? Math.max(...values.slice(0, -1)) : null;

      out.push({
        key: g.key,
        label: labelFor(exerciseById[g.exerciseId], g.drillIndex),
        metric,
        sessions,
        record,
        lastAt: last.at,
        lastIsRecord: previousBest != null && last.value > previousBest,
      });
    }

    out.sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));
    return out;
  }, [logRows, exerciseById]);

  // ── The month, in two numbers ──────────────────────────────────
  const summary = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const inMonth = (iso) => new Date(iso).getTime() >= monthStart;

    const execs = new Set();
    for (const r of logRows) {
      const at = r.workout_executions?.executed_at;
      if (at && inMonth(at)) execs.add(r.execution_id);
    }

    let records = 0;
    for (const s of series) if (s.lastIsRecord && inMonth(s.lastAt)) records += 1;

    return { workouts: execs.size, records };
  }, [logRows, series]);

  if (!traineeId) return null;

  if (isLoading && logRows.length === 0) {
    return (
      <div style={{ fontFamily: SANS, fontSize: 13, color: C.muted, padding: '18px 4px' }}>
        טוען נתוני התקדמות…
      </div>
    );
  }

  if (series.length === 0) {
    return (
      <div style={{
        fontFamily: SANS, fontSize: 13, color: C.muted,
        padding: '20px 14px', textAlign: 'center',
        background: '#FFFFFF', border: '1px dashed #E8DBCB', borderRadius: 14,
      }}>
        עדיין אין נתוני ביצוע — מלא סטים באימון כדי לראות מגמה
      </div>
    );
  }

  return (
    <section dir="rtl" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* א. The month */}
      <div style={{
        display: 'flex', gap: 10,
        background: C.cream, border: '1px solid #E8DBCB',
        borderRadius: 14, padding: '12px 14px',
      }}>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontFamily: SANS, fontSize: 22, fontWeight: 800, color: C.orange }}>
            {summary.workouts}
          </div>
          <div style={{ fontFamily: SANS, fontSize: 11, color: C.muted }}>אימונים החודש</div>
        </div>
        <div style={{ width: 1, background: '#E8DBCB' }} />
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontFamily: SANS, fontSize: 22, fontWeight: 800, color: C.gold }}>
            {summary.records}
          </div>
          <div style={{ fontFamily: SANS, fontSize: 11, color: C.muted }}>שיאים נשברו</div>
        </div>
      </div>

      {/* ב. One line per exercise */}
      <div style={{
        background: '#FFFFFF', border: '1px solid #E8DBCB',
        borderRadius: 14, overflow: 'hidden',
      }}>
        {series.map((s, i) => {
          const open = openKey === s.key;
          return (
            <div key={s.key} style={{ borderTop: i === 0 ? 'none' : '1px solid #F0E8D8' }}>
              <button
                type="button"
                onClick={() => setOpenKey(open ? null : s.key)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '11px 12px', background: open ? 'rgba(255,111,32,0.05)' : 'transparent',
                  border: 'none', cursor: 'pointer', textAlign: 'right', direction: 'rtl',
                }}
              >
                <ChevronLeft
                  size={15}
                  style={{
                    color: C.muted, flexShrink: 0,
                    transform: open ? 'rotate(-90deg)' : 'none',
                    transition: 'transform .15s',
                  }}
                />
                <span style={{
                  flex: 1, minWidth: 0, fontFamily: SANS, fontSize: 13.5,
                  fontWeight: 700, color: C.charcoal,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{s.label}</span>

                <Sparkline values={s.sessions.map((x) => x.value)} />

                <span style={{
                  flexShrink: 0, fontFamily: SANS, fontSize: 12.5, fontWeight: 800,
                  color: s.lastIsRecord ? C.gold : C.muted, minWidth: 54, textAlign: 'left',
                }}>
                  {s.metric.fmt(s.record)}
                </span>
              </button>

              {/* ג. The full chart */}
              {open && (
                <div style={{ padding: '0 8px 10px' }}>
                  <ExerciseTrendChart
                    exerciseName={s.label}
                    sessions={s.sessions}
                    metric={s.metric}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
