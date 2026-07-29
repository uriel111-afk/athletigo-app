import React, { useState, useMemo, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useQuery } from '@tanstack/react-query';

// ── Progress graph ───────────────────────────────────────────────────
// Renders at the bottom of the plans page (folder level) and is reused
// on the trainee profile. Visible to trainee and coach alike.
//
// Data source: every workout_execution of the PLAN FAMILY, joined to
// exercises through exercises.source_exercise_id so one exercise is
// tracked across every duplicate of the plan. Matching by name is never
// done — two exercises may share a name and mean different things.
//
// Data honesty is enforced, not decorative:
//   • entered values      -> solid orange segment, filled dot
//   • completed, no entry -> dashed grey segment, hollow dot
//   • not performed       -> no dot, and no line drawn across it
//   • < 3 sessions        -> no trend at all, plus a line saying how
//                            many sessions are still missing
//   • gap >= 14 days      -> the line breaks rather than spanning it
//
// Inline styles only; nothing anchored left; nothing truncates.

const ORANGE = '#FF6F20';
const INK = '#1a1a1a';
const MUTED = '#8a8177';
const GREY = '#B9AE9E';
const SANS = "'Rubik', system-ui, sans-serif";
const GAP_DAYS = 14;
const MIN_SESSIONS = 3;

const LEVELS = [
  { key: 'plan', label: 'תוכנית' },
  { key: 'section', label: 'מקטע' },
  { key: 'exercise', label: 'תרגיל' },
];
const METRICS = [
  { key: 'reps', label: 'חזרות', unit: 'חזרות' },
  { key: 'weight', label: 'משקל', unit: 'ק"ג' },
  { key: 'seconds', label: 'שניות', unit: 'שניות' },
  { key: 'sets', label: 'סטים', unit: 'סטים' },
  { key: 'completion', label: 'אחוז השלמה', unit: '%' },
];
const PERIODS = [
  { key: 'all', label: 'הכל', days: null },
  { key: '3m', label: '3 חודשים', days: 90 },
  { key: '1m', label: 'חודש', days: 30 },
];

const fmtNum = (v) => {
  if (v == null || Number.isNaN(v)) return '—';
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10);
};
const fmtDate = (iso) => {
  try {
    return new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
  } catch { return ''; }
};
const daysBetween = (a, b) => Math.abs(new Date(b) - new Date(a)) / 86400000;

// ── Data loader ──────────────────────────────────────────────────────
// Returns one row per (session, exercise) with the aggregated metrics,
// plus an explicit `entered` flag so the renderer can tell a real value
// from a completed-but-unfilled session.
async function loadFamilyProgress({ planId, traineeId }) {
  if (!planId) return { sessions: [], exercises: [], missingColumn: false };

  // 1. The plan family: the root plus every copy pointing at it.
  const { data: self } = await supabase
    .from('training_plans').select('id, parent_plan_id')
    .eq('id', planId).maybeSingle();
  const rootId = self?.parent_plan_id || planId;
  const { data: family } = await supabase
    .from('training_plans').select('id')
    .or(`id.eq.${rootId},parent_plan_id.eq.${rootId}`)
    .neq('status', 'deleted');
  const planIds = (family || []).map((p) => p.id);
  if (planIds.length === 0) return { sessions: [], exercises: [], missingColumn: false };

  // 2. Exercises across the family, carrying their family-root link.
  //    source_exercise_id is what makes an exercise the SAME exercise
  //    across duplicates. If the column is absent the graph cannot be
  //    built correctly, and we say so rather than falling back to name
  //    matching, which would silently merge unrelated exercises.
  const exRes = await supabase
    .from('exercises')
    .select('id, exercise_name, name, training_plan_id, training_section_id, source_exercise_id, sets, reps')
    .in('training_plan_id', planIds);
  if (exRes.error) {
    return { sessions: [], exercises: [], missingColumn: exRes.error.code === '42703', error: exRes.error.message };
  }
  const exercises = exRes.data || [];
  const rootOf = new Map();                       // exerciseId -> family root id
  for (const e of exercises) rootOf.set(e.id, e.source_exercise_id || e.id);

  // 3. Executions of the family.
  let q = supabase.from('workout_executions')
    .select('id, plan_id, trainee_id, executed_at, completion_percent')
    .in('plan_id', planIds)
    .order('executed_at', { ascending: true });
  if (traineeId) q = q.eq('trainee_id', traineeId);
  const { data: execs } = await q;
  const executions = execs || [];
  if (executions.length === 0) return { sessions: [], exercises, missingColumn: false };

  // 4. Set logs for those executions.
  const { data: logs } = await supabase
    .from('exercise_set_logs')
    .select('execution_id, exercise_id, set_number, reps_completed, time_completed, weight_used')
    .in('execution_id', executions.map((e) => e.id));

  const byExec = new Map();
  for (const l of logs || []) {
    if (!byExec.has(l.execution_id)) byExec.set(l.execution_id, []);
    byExec.get(l.execution_id).push(l);
  }

  const sessions = executions.map((ex) => {
    const rows = byExec.get(ex.id) || [];
    const perExercise = new Map();               // rootExerciseId -> agg
    for (const r of rows) {
      const root = rootOf.get(r.exercise_id) || r.exercise_id;
      if (!perExercise.has(root)) {
        perExercise.set(root, { reps: 0, seconds: 0, weight: 0, sets: 0, entered: false });
      }
      const a = perExercise.get(root);
      a.sets += 1;
      if (r.reps_completed != null) { a.reps += Number(r.reps_completed) || 0; a.entered = true; }
      if (r.time_completed != null) { a.seconds += Number(r.time_completed) || 0; a.entered = true; }
      if (r.weight_used != null) { a.weight = Math.max(a.weight, Number(r.weight_used) || 0); a.entered = true; }
    }
    return {
      id: ex.id,
      date: ex.executed_at,
      planId: ex.plan_id,
      completion: ex.completion_percent == null ? null : Number(ex.completion_percent),
      perExercise,
      entered: [...perExercise.values()].some((a) => a.entered),
    };
  });

  return { sessions, exercises, missingColumn: false };
}

// ── Series builder ───────────────────────────────────────────────────
// Produces points with an explicit status per session so the renderer
// can honour the honesty rules.
function buildSeries(sessions, metric, level, targetRootId, exercises) {
  const rootIdsInScope = (() => {
    if (level === 'plan') return null;                       // everything
    if (!targetRootId) return null;
    if (level === 'exercise') return new Set([targetRootId]);
    // section: every exercise whose section matches the target's section
    const target = exercises.find((e) => (e.source_exercise_id || e.id) === targetRootId);
    if (!target) return new Set([targetRootId]);
    const roots = exercises
      .filter((e) => e.training_section_id === target.training_section_id)
      .map((e) => e.source_exercise_id || e.id);
    return new Set(roots);
  })();

  return sessions.map((s) => {
    if (metric === 'completion') {
      return {
        date: s.date,
        value: s.completion,
        status: s.completion == null ? 'noentry' : 'entered',
      };
    }
    let total = 0, any = false, anyEntered = false;
    for (const [root, agg] of s.perExercise) {
      if (rootIdsInScope && !rootIdsInScope.has(root)) continue;
      any = true;
      if (agg.entered) anyEntered = true;
      total += Number(agg[metric]) || 0;
    }
    if (!any) return { date: s.date, value: null, status: 'absent' };     // not performed
    if (!anyEntered || total === 0) return { date: s.date, value: null, status: 'noentry' };
    return { date: s.date, value: total, status: 'entered' };
  });
}

// ── Sparkline ────────────────────────────────────────────────────────
function Sparkline({ values, width = 64, height = 22 }) {
  const pts = (values || []).filter((v) => v != null);
  if (pts.length < 2) {
    return <span style={{ width, height, display: 'inline-block' }} aria-hidden />;
  }
  const min = Math.min(...pts), max = Math.max(...pts);
  const span = max - min || 1;
  const d = pts.map((v, i) => {
    const x = (i / (pts.length - 1)) * (width - 2) + 1;
    const y = height - 1 - ((v - min) / span) * (height - 2);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const up = pts[pts.length - 1] >= pts[0];
  return (
    <svg width={width} height={height} aria-hidden style={{ display: 'block' }}>
      <path d={d} fill="none" stroke={up ? ORANGE : GREY} strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Chart ────────────────────────────────────────────────────────────
function Chart({ points, unit }) {
  const W = 320, H = 150, PAD_X = 8, PAD_Y = 14;
  const withValues = points.filter((p) => p.value != null);
  if (withValues.length === 0) return null;

  const min = Math.min(...withValues.map((p) => p.value));
  const max = Math.max(...withValues.map((p) => p.value));
  const span = max - min || Math.max(1, Math.abs(max) * 0.1);
  const n = points.length;
  const x = (i) => PAD_X + (n <= 1 ? (W - 2 * PAD_X) / 2 : (i / (n - 1)) * (W - 2 * PAD_X));
  const y = (v) => H - PAD_Y - ((v - min) / span) * (H - 2 * PAD_Y);

  // Split into drawable runs. A run breaks on: an absent session, a
  // 14-day gap, or a change between entered / noentry styling.
  const runs = [];
  let cur = null;
  points.forEach((p, i) => {
    if (p.value == null) { cur = null; return; }
    const prev = i > 0 ? points[i - 1] : null;
    const bigGap = prev && prev.value != null && daysBetween(prev.date, p.date) >= GAP_DAYS;
    const styleChanged = cur && cur.status !== p.status;
    if (!cur || bigGap || styleChanged) {
      cur = { status: p.status, pts: [] };
      runs.push(cur);
      // Bridge from the previous point only when it is contiguous and
      // the break was purely a style change.
      if (styleChanged && !bigGap && prev && prev.value != null) {
        cur.pts.push({ i: i - 1, v: prev.value });
      }
    }
    cur.pts.push({ i, v: p.value });
  });

  const first = withValues[0].value;
  const areaRun = runs.find((r) => r.pts.length > 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="pgFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={ORANGE} stopOpacity="0.18" />
          <stop offset="100%" stopColor={ORANGE} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* dashed baseline at the starting value */}
      <line x1={PAD_X} x2={W - PAD_X} y1={y(first)} y2={y(first)}
        stroke={GREY} strokeWidth="1" strokeDasharray="3 3" opacity="0.7" />

      {/* light area fill under the first solid run */}
      {areaRun && (
        <path
          d={`${areaRun.pts.map((p, k) => `${k === 0 ? 'M' : 'L'}${x(p.i)},${y(p.v)}`).join(' ')} L${x(areaRun.pts[areaRun.pts.length - 1].i)},${H - PAD_Y} L${x(areaRun.pts[0].i)},${H - PAD_Y} Z`}
          fill="url(#pgFill)"
        />
      )}

      {/* line runs */}
      {runs.map((r, ri) => r.pts.length > 1 && (
        <path
          key={ri}
          d={r.pts.map((p, k) => `${k === 0 ? 'M' : 'L'}${x(p.i)},${y(p.v)}`).join(' ')}
          fill="none"
          stroke={r.status === 'entered' ? ORANGE : GREY}
          strokeWidth={r.status === 'entered' ? 2.2 : 1.6}
          strokeDasharray={r.status === 'entered' ? undefined : '5 4'}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}

      {/* dots — only at six sessions or fewer, plus always the last */}
      {points.map((p, i) => {
        if (p.value == null) return null;               // absent -> no dot
        const isLast = i === points.length - 1;
        if (!isLast && withValues.length > 6) return null;
        const filled = p.status === 'entered';
        return (
          <g key={i}>
            {isLast && <circle cx={x(i)} cy={y(p.value)} r="8" fill={ORANGE} opacity="0.16" />}
            <circle
              cx={x(i)} cy={y(p.value)} r={isLast ? 4.5 : 3.5}
              fill={filled ? ORANGE : '#FFFFFF'}
              stroke={filled ? ORANGE : GREY}
              strokeWidth="1.6"
            />
          </g>
        );
      })}
    </svg>
  );
}

export default function ProgressGraph({ planId, traineeId, title = 'התקדמות' }) {
  const [level, setLevel] = useState('plan');
  const [metric, setMetric] = useState('reps');
  const [period, setPeriod] = useState('all');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState(0);
  const [focusRoot, setFocusRoot] = useState(null);
  const dragRef = useRef({ x: 0, base: 0, pinch: null });

  const { data, isLoading } = useQuery({
    queryKey: ['progress-graph', planId, traineeId],
    queryFn: () => loadFamilyProgress({ planId, traineeId }),
    enabled: !!planId,
  });

  const sessions = data?.sessions || [];
  const exercises = data?.exercises || [];

  // Period filter
  const periodSessions = useMemo(() => {
    const days = PERIODS.find((p) => p.key === period)?.days;
    if (!days) return sessions;
    const cutoff = Date.now() - days * 86400000;
    return sessions.filter((s) => new Date(s.date).getTime() >= cutoff);
  }, [sessions, period]);

  // Which metrics actually have data at the current level.
  const availableMetrics = useMemo(() => METRICS.filter((m) => {
    const series = buildSeries(periodSessions, m.key, level, focusRoot, exercises);
    return series.some((p) => p.value != null);
  }), [periodSessions, level, focusRoot, exercises]);

  const activeMetric = availableMetrics.find((m) => m.key === metric) || availableMetrics[0] || null;

  const series = useMemo(
    () => (activeMetric ? buildSeries(periodSessions, activeMetric.key, level, focusRoot, exercises) : []),
    [periodSessions, activeMetric, level, focusRoot, exercises],
  );

  // Visible window from zoom + pan.
  const visible = useMemo(() => {
    if (series.length === 0) return [];
    const count = Math.max(2, Math.round(series.length / zoom));
    const maxStart = Math.max(0, series.length - count);
    const start = Math.min(maxStart, Math.max(0, Math.round(pan)));
    return series.slice(start, start + count);
  }, [series, zoom, pan]);

  const entered = series.filter((p) => p.status === 'entered' && p.value != null);
  const notEnough = entered.length < MIN_SESSIONS;

  const visibleWithValues = visible.filter((p) => p.value != null);
  const bigValue = visibleWithValues.length ? visibleWithValues[visibleWithValues.length - 1].value : null;
  const startValue = visibleWithValues.length ? visibleWithValues[0].value : null;
  const change = (bigValue != null && startValue != null && startValue !== 0)
    ? Math.round(((bigValue - startValue) / Math.abs(startValue)) * 100)
    : null;
  const peak = visibleWithValues.length ? Math.max(...visibleWithValues.map((p) => p.value)) : null;
  const mean = visibleWithValues.length
    ? visibleWithValues.reduce((a, p) => a + p.value, 0) / visibleWithValues.length : null;

  // Pan / pinch
  const onDown = useCallback((e) => {
    dragRef.current = { x: e.clientX, base: pan, pinch: null };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, [pan]);
  const onMove = useCallback((e) => {
    if (e.buttons === 0 && e.pointerType === 'mouse') return;
    const dx = e.clientX - dragRef.current.x;
    setPan(Math.max(0, dragRef.current.base - dx / 24));
  }, []);

  const card = {
    background: '#FFFFFF', border: '1px solid #F0E4D0',
    borderRadius: 14, padding: '14px 13px', fontFamily: SANS,
    direction: 'rtl',
  };
  const chipRow = { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 };
  const chip = (on) => ({
    padding: '6px 12px', borderRadius: 999,
    border: `1px solid ${on ? ORANGE : '#F0E4D0'}`,
    background: on ? ORANGE : '#FFFFFF',
    color: on ? '#FFFFFF' : INK,
    fontFamily: SANS, fontSize: 13, fontWeight: 500,
    cursor: 'pointer', lineHeight: 1.5,
  });

  if (!planId) return null;
  if (isLoading) {
    return <div dir="rtl" style={{ ...card, color: MUTED, fontSize: 14 }}>טוען נתוני התקדמות…</div>;
  }
  if (data?.missingColumn) {
    return (
      <div dir="rtl" style={{ ...card, color: MUTED, fontSize: 14, lineHeight: 1.6 }}>
        <div style={{ fontSize: 17, fontWeight: 500, color: INK, marginBottom: 4 }}>{title}</div>
        גרף ההתקדמות דורש את העמודה <span style={{ direction: 'ltr', display: 'inline-block' }}>exercises.source_exercise_id</span>,
        שעדיין לא קיימת. יש להריץ את המיגרציה. הגרף לא מזהה תרגילים לפי שם — זה היה מאחד תרגילים שונים בטעות.
      </div>
    );
  }

  return (
    <div dir="rtl" style={card}>
      <div style={{ fontSize: 17, fontWeight: 500, color: INK, lineHeight: 1.4 }}>{title}</div>

      {/* big value + change pill */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 38, fontWeight: 500, color: ORANGE, lineHeight: 1.1 }}>
          {fmtNum(bigValue)}
        </span>
        {activeMetric && (
          <span style={{ fontSize: 14, color: MUTED }}>{activeMetric.unit}</span>
        )}
        {change != null && (
          <span style={{
            padding: '3px 10px', borderRadius: 999, fontSize: 13, fontWeight: 500,
            background: change > 0 ? '#F0FDF4' : change < 0 ? '#FEF2F2' : '#F5F1EA',
            color: change > 0 ? '#166534' : change < 0 ? '#991B1B' : MUTED,
            border: `1px solid ${change > 0 ? '#BBF7D0' : change < 0 ? '#FECACA' : '#EFE6D8'}`,
          }}>{change > 0 ? '+' : ''}{change}%</span>
        )}
      </div>

      {/* level chips */}
      <div style={chipRow}>
        {LEVELS.map((l) => (
          <button key={l.key} type="button" style={chip(level === l.key)}
            onClick={() => { setLevel(l.key); setPan(0); }}>{l.label}</button>
        ))}
      </div>

      {/* metric chips — a metric with no data at this level is not rendered */}
      {availableMetrics.length > 0 && (
        <div style={chipRow}>
          {availableMetrics.map((m) => (
            <button key={m.key} type="button" style={chip(activeMetric?.key === m.key)}
              onClick={() => setMetric(m.key)}>{m.label}</button>
          ))}
        </div>
      )}

      {/* trend, or an honest statement of what is missing */}
      {notEnough ? (
        <div style={{
          marginTop: 12, padding: '14px 12px',
          background: '#FBF6EE', border: '1px dashed #E4DACB', borderRadius: 10,
          fontSize: 14, color: MUTED, lineHeight: 1.6, textAlign: 'right',
        }}>
          {entered.length === 0
            ? `אין עדיין אימונים עם נתונים שהוזנו. צריך ${MIN_SESSIONS} כדי להציג מגמה.`
            : `יש ${entered.length} אימונים עם נתונים. חסרים עוד ${MIN_SESSIONS - entered.length} כדי להציג מגמה.`}
        </div>
      ) : (
        <>
          <div
            onPointerDown={onDown}
            onPointerMove={onMove}
            style={{ marginTop: 12, touchAction: 'none', cursor: 'ew-resize' }}
          >
            <Chart points={visible} unit={activeMetric?.unit} />
          </div>

          {/* edge date labels follow the visible range */}
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            fontSize: 12, color: MUTED, marginTop: 2,
          }}>
            <span>{visible.length ? fmtDate(visible[visible.length - 1].date) : ''}</span>
            <span>{visible.length ? fmtDate(visible[0].date) : ''}</span>
          </div>

          {/* zoom controls */}
          <div style={{ ...chipRow, alignItems: 'center' }}>
            <button type="button" style={chip(false)} onClick={() => setZoom((z) => Math.min(8, z * 1.5))}>+</button>
            <button type="button" style={chip(false)} onClick={() => setZoom((z) => Math.max(1, z / 1.5))}>−</button>
            <button type="button" style={chip(zoom === 1)} onClick={() => { setZoom(1); setPan(0); }}>הכל</button>
          </div>
        </>
      )}

      {/* period chips */}
      <div style={chipRow}>
        {PERIODS.map((p) => (
          <button key={p.key} type="button" style={chip(period === p.key)}
            onClick={() => { setPeriod(p.key); setPan(0); }}>{p.label}</button>
        ))}
      </div>

      {/* summary row */}
      {!notEnough && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 12,
          paddingTop: 10, borderTop: '1px solid #F0E4D0',
        }}>
          {[['שיא', peak], ['ממוצע', mean], ['נקודת פתיחה', startValue]].map(([l, v]) => (
            <span key={l} style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 12, color: MUTED }}>{l}</span>
              <span style={{ fontSize: 17, fontWeight: 500, color: INK }}>{fmtNum(v)}</span>
            </span>
          ))}
        </div>
      )}

      <PerExerciseList
        sessions={sessions}
        exercises={exercises}
        onFocus={(root) => { setLevel('exercise'); setFocusRoot(root); setPan(0); }}
      />
    </div>
  );
}

// ── Per-exercise list ────────────────────────────────────────────────
// Percent change is measured against that trainee's FIRST recorded
// session for that exercise — never against the plan's prescription.
function PerExerciseList({ sessions, exercises, onFocus }) {
  const rows = useMemo(() => {
    const byRoot = new Map();
    for (const s of sessions) {
      for (const [root, agg] of s.perExercise) {
        if (!agg.entered) continue;
        if (!byRoot.has(root)) byRoot.set(root, []);
        // Prefer reps, then seconds, then weight as the tracked metric.
        const metric = agg.reps > 0 ? 'reps' : agg.seconds > 0 ? 'seconds' : agg.weight > 0 ? 'weight' : null;
        if (!metric) continue;
        byRoot.get(root).push({ date: s.date, value: agg[metric], metric });
      }
    }
    const nameOf = (root) => {
      const e = exercises.find((x) => (x.source_exercise_id || x.id) === root);
      return e?.exercise_name || e?.name || 'תרגיל';
    };
    const label = { reps: 'חזרות', seconds: 'שניות', weight: 'ק"ג' };
    const out = [];
    for (const [root, pts] of byRoot) {
      if (pts.length === 0) continue;
      const first = pts[0].value, last = pts[pts.length - 1].value;
      const pct = first === 0 ? null : Math.round(((last - first) / Math.abs(first)) * 100);
      out.push({
        root, name: nameOf(root), pts, first, last, pct,
        metric: pts[0].metric, metricLabel: label[pts[0].metric] || '',
        sessions: pts.length,
      });
    }
    // gains first, then תקוע, then declines
    out.sort((a, b) => {
      const rank = (r) => (r.pct == null ? 1 : r.pct > 0 ? 0 : r.pct === 0 ? 1 : 2);
      const d = rank(a) - rank(b);
      if (d !== 0) return d;
      return (b.pct ?? 0) - (a.pct ?? 0);
    });
    return out;
  }, [sessions, exercises]);

  if (rows.length === 0) return null;

  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #F0E4D0' }}>
      <div style={{ fontSize: 15, fontWeight: 500, color: INK, marginBottom: 8 }}>לפי תרגיל</div>
      {rows.map((r) => {
        const stuck = r.pct === 0 || r.pct == null;
        return (
          <button
            key={r.root}
            type="button"
            onClick={() => onFocus && onFocus(r.root)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%',
              padding: '9px 2px', background: 'transparent', border: 'none',
              borderBottom: '1px solid #F7F1E7', cursor: 'pointer',
              textAlign: 'right', direction: 'rtl', fontFamily: SANS,
            }}
          >
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{
                display: 'block', fontSize: 15, fontWeight: 500, color: INK,
                lineHeight: 1.4, wordBreak: 'break-word', overflowWrap: 'break-word',
              }}>{r.name}</span>
              {/* what is measured, and from what to what */}
              <span style={{ display: 'block', fontSize: 12, color: MUTED, lineHeight: 1.5, marginTop: 1 }}>
                {r.metricLabel}: {fmtNum(r.first)} ← {fmtNum(r.last)} · {r.sessions} אימונים
              </span>
            </span>
            <Sparkline values={r.pts.map((p) => p.value)} />
            <span style={{
              fontSize: 13, fontWeight: 500, flexShrink: 0,
              color: stuck ? MUTED : r.pct > 0 ? '#166534' : '#991B1B',
            }}>
              {stuck ? 'תקוע' : `${r.pct > 0 ? '+' : ''}${r.pct}%`}
            </span>
          </button>
        );
      })}
    </div>
  );
}
