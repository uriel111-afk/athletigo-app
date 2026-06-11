import React, { useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';

// Per-(exercise_id, drill_index) numeric trend graph. Generic shared
// component — extracted from WorkoutFolderDetail so the same view can
// power both the folder detail page (plan-scoped) and the trainee
// profile ProgressTab (trainee-scoped, across every plan).
//
// Inputs are already-fetched arrays — this component owns no Supabase
// query. Each surface is responsible for assembling:
//   rows         — exercise_set_logs rows with the embedded join
//                  workout_executions!inner(executed_at, plan_id [, trainee_id])
//   exerciseById — { [exerciseId]: { exercise_name, name, tabata_data } }
//                  used to label nested-inner series (super_set /
//                  combo / circuit / tabata) as "<block> · <inner>".
//
// title / subtitle / emptyText override the default Hebrew header copy
// when a caller wants different framing (e.g. the profile view says
// "מגמת אימונים" instead of "גרף ההתקדמות שלך").

const ORANGE = '#FF6F20';
const DARK = '#1a1a1a';

function formatShort(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('he-IL', {
      day: '2-digit', month: '2-digit',
    });
  } catch { return ''; }
}

// Parse tabata_data (TEXT column) defensively so a stray null / bad
// JSON / already-an-object input all flow through the same shape.
function parseTd(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

export default function ExerciseNumericTrendGraph({
  rows,
  exerciseById,
  title = 'גרף ההתקדמות שלך',
  subtitle = 'מגמת ערכים לאורך זמן · תרגיל יחיד או פנימי',
  emptyText = 'עדיין אין נתונים — בצע אימון כדי לראות מגמה',
}) {
  const SANS_FONT = "'Rubik', system-ui, sans-serif";
  const WEIGHT_BLUE = '#185FA5';

  const setLogRows = Array.isArray(rows) ? rows : [];
  const lookup = exerciseById || {};

  // Group into series: grouped[`${exId}|${drill}`] = { exerciseId,
  // drillIndex, byExecution: { [execId]: { executedAt, logs[] } } }.
  // Drill 0 captures single-exercise rows AND the first inner of nested
  // blocks — the label resolver below distinguishes them by inspecting
  // the exercise's tabata_data shape.
  const grouped = useMemo(() => {
    const m = {};
    for (const row of setLogRows) {
      const exId = row.exercise_id;
      const d = Number.isFinite(row.drill_index) ? row.drill_index : 0;
      const execId = row.execution_id;
      const at = row.workout_executions?.executed_at;
      if (!exId || !execId || !at) continue;
      const key = `${exId}|${d}`;
      if (!m[key]) m[key] = { exerciseId: exId, drillIndex: d, byExecution: {} };
      if (!m[key].byExecution[execId]) m[key].byExecution[execId] = { executedAt: at, logs: [] };
      m[key].byExecution[execId].logs.push(row);
    }
    return m;
  }, [setLogRows]);

  // Series list — one chip per (exercise_id, drill_index). Label is
  // the exercise name for single-exercise series and "<block> · <inner>"
  // for nested series (super_set / combo / circuit / tabata).
  const seriesList = useMemo(() => {
    const items = [];
    for (const key of Object.keys(grouped)) {
      const { exerciseId, drillIndex } = grouped[key];
      const ex = lookup[exerciseId] || {};
      const exName = ex.exercise_name || ex.name || 'תרגיל';
      const td = parseTd(ex.tabata_data) || {};
      // Nested-method inner roster: pick the first array that's
      // populated. super_set/combo carry inners under rounds[0].exercises;
      // circuit under stations; tabata under exercises_in_rotation.
      const innerArr = (Array.isArray(td.rounds) && td.rounds[0]?.exercises)
        ? td.rounds[0].exercises
        : Array.isArray(td.stations) ? td.stations
        : Array.isArray(td.exercises_in_rotation) ? td.exercises_in_rotation
        : null;
      let label = exName;
      if (innerArr) {
        const inner = innerArr[drillIndex] || {};
        const innerName = inner.name || inner.exerciseName || null;
        label = innerName
          ? `${exName} · ${innerName}`
          : `${exName} · פנימי ${drillIndex + 1}`;
      }
      items.push({ key, exerciseId, drillIndex, label });
    }
    items.sort((a, b) => a.label.localeCompare(b.label, 'he'));
    return items;
  }, [grouped, lookup]);

  const [selectedKey, setSelectedKey] = useState(null);
  const effectiveKey = selectedKey ?? seriesList[0]?.key ?? null;
  const selected = effectiveKey ? grouped[effectiveKey] : null;

  // Probe the selected series for which metrics make sense. The chip
  // strip only renders the supported metrics for the active series, so
  // a time-only exercise doesn't show "נפח" and a bodyweight one
  // doesn't show the volume option.
  const capabilities = useMemo(() => {
    if (!selected) return { hasReps: false, hasWeight: false, hasTime: false };
    let hasReps = false, hasWeight = false, hasTime = false;
    for (const execId of Object.keys(selected.byExecution)) {
      for (const log of selected.byExecution[execId].logs) {
        if (Number(log.reps_completed) > 0) hasReps = true;
        if (Number(log.weight_used) > 0) hasWeight = true;
        if (Number(log.time_completed) > 0) hasTime = true;
      }
    }
    return { hasReps, hasWeight, hasTime };
  }, [selected]);

  // Smart default per series.
  const defaultMetric = capabilities.hasWeight
    ? 'volume'
    : (capabilities.hasTime && !capabilities.hasReps)
      ? 'seconds'
      : 'sumReps';

  // Per-series metric override — each series remembers its own pick;
  // unselected series fall back to their own smart default. This
  // dodges a useEffect to reset metric when the series changes.
  const [metricByKey, setMetricByKey] = useState({});
  const setMetric = (m) => setMetricByKey((prev) => ({ ...prev, [effectiveKey]: m }));
  const wantedMetric = metricByKey[effectiveKey] ?? defaultMetric;
  const effectiveMetric = (() => {
    if (wantedMetric === 'volume' && !capabilities.hasWeight) return defaultMetric;
    if (wantedMetric === 'seconds' && !capabilities.hasTime) return defaultMetric;
    if ((wantedMetric === 'sumReps' || wantedMetric === 'maxReps') && !capabilities.hasReps) return defaultMetric;
    return wantedMetric;
  })();

  // Aggregate per execution → one point per workout. sortedExecs walks
  // the byExecution map in executed_at order so the resulting array is
  // already chart-ready (X axis is L→R chronological even under RTL).
  const chartData = useMemo(() => {
    if (!selected) return [];
    const points = [];
    for (const execId of Object.keys(selected.byExecution)) {
      const { executedAt, logs } = selected.byExecution[execId];
      let reps = 0, repsMax = 0, volume = 0, seconds = 0, weightMax = 0;
      let anyReps = false, anyWeight = false, anySec = false;
      for (const log of logs) {
        const r = Number(log.reps_completed);
        const w = Number(log.weight_used);
        const t = Number(log.time_completed);
        if (Number.isFinite(r) && r > 0) {
          reps += r;
          if (r > repsMax) repsMax = r;
          anyReps = true;
        }
        if (Number.isFinite(w) && w > 0) {
          if (w > weightMax) weightMax = w;
          anyWeight = true;
        }
        if (Number.isFinite(r) && r > 0 && Number.isFinite(w) && w > 0) {
          volume += r * w;
        }
        if (Number.isFinite(t) && t > 0) {
          seconds += t;
          anySec = true;
        }
      }
      points.push({
        execId,
        executedAt,
        date: formatShort(executedAt),
        reps: anyReps ? reps : null,
        repsMax: anyReps ? repsMax : null,
        volume: anyWeight && anyReps ? volume : null,
        seconds: anySec ? seconds : null,
        weight: anyWeight ? weightMax : null,
      });
    }
    points.sort((a, b) => new Date(a.executedAt) - new Date(b.executedAt));
    return points;
  }, [selected]);

  const yKey = effectiveMetric === 'volume' ? 'volume'
    : effectiveMetric === 'seconds' ? 'seconds'
    : effectiveMetric === 'maxReps' ? 'repsMax'
    : 'reps';
  const metricNoun = effectiveMetric === 'volume' ? 'נפח'
    : effectiveMetric === 'seconds' ? 'שניות'
    : effectiveMetric === 'maxReps' ? 'שיא חזרות'
    : 'חזרות';

  // The dual reps+weight rendering only kicks in for "נפח" — switching
  // to "סך חזרות" / "שיא" on a weight exercise shows the single reps
  // line so the trainee can isolate one axis at a time.
  const isDualLine = capabilities.hasWeight && effectiveMetric === 'volume';
  const hasEnoughData = chartData.length >= 2;

  const chipStyle = (active) => ({
    flexShrink: 0,
    padding: '6px 12px',
    borderRadius: 999,
    border: active ? `1px solid ${ORANGE}` : '1px solid #E5E5E5',
    background: active ? '#FFF5EE' : 'white',
    color: active ? ORANGE : '#666',
    fontSize: 12, fontWeight: 600,
    cursor: 'pointer', whiteSpace: 'nowrap',
    fontFamily: SANS_FONT,
  });
  const captionStyle = {
    fontSize: 11, color: '#888', fontWeight: 700,
    flexShrink: 0, paddingInlineEnd: 4,
    fontFamily: SANS_FONT,
  };

  return (
    <div style={{
      background: '#FFFFFF',
      borderTop: '1px solid #F0E4D0',
      padding: '20px 12px 28px',
      direction: 'rtl',
      width: '100%',
      boxSizing: 'border-box',
    }}>
      <div style={{ marginBottom: 14, paddingInline: 4 }}>
        <div style={{
          fontSize: 18, fontWeight: 800, color: DARK,
          fontFamily: SANS_FONT, lineHeight: 1.2,
        }}>
          {title}
        </div>
        <div style={{
          fontSize: 12, color: '#888', marginTop: 3,
          fontFamily: SANS_FONT, fontWeight: 500,
        }}>
          {subtitle}
        </div>
      </div>

      {seriesList.length === 0 ? (
        <div style={{
          padding: '32px 8px', textAlign: 'center', color: '#888', fontSize: 13,
          background: '#FAFAFA', borderRadius: 10, border: '1px solid #F0F0F0',
        }}>
          {emptyText}
        </div>
      ) : (
        <>
          {/* תרגיל — series chip strip. Each chip is one
              (exercise_id, drill_index) series; nested inner exercises
              appear as their own chips labelled "<block> · <inner>". */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            overflowX: 'auto', paddingBottom: 6, marginBottom: 8,
            WebkitOverflowScrolling: 'touch', scrollbarWidth: 'thin',
          }}>
            <span style={captionStyle}>תרגיל</span>
            {seriesList.map((s) => (
              <button key={s.key} type="button"
                onClick={() => setSelectedKey(s.key)}
                style={chipStyle(effectiveKey === s.key)}
              >{s.label}</button>
            ))}
          </div>

          {/* מדד — only the metrics the active series actually supports
              are rendered. Volume hides on bodyweight; seconds hides on
              rep-only; reps hides on pure-time exercises. */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginBottom: 14, flexWrap: 'wrap',
          }}>
            <span style={captionStyle}>מדד</span>
            {capabilities.hasReps && (
              <>
                <button type="button" onClick={() => setMetric('sumReps')} style={chipStyle(effectiveMetric === 'sumReps')}>
                  סך חזרות
                </button>
                <button type="button" onClick={() => setMetric('maxReps')} style={chipStyle(effectiveMetric === 'maxReps')}>
                  שיא
                </button>
              </>
            )}
            {capabilities.hasWeight && (
              <button type="button" onClick={() => setMetric('volume')} style={chipStyle(effectiveMetric === 'volume')}>
                נפח
              </button>
            )}
            {capabilities.hasTime && (
              <button type="button" onClick={() => setMetric('seconds')} style={chipStyle(effectiveMetric === 'seconds')}>
                שניות
              </button>
            )}
          </div>

          {!hasEnoughData ? (
            <div style={{
              padding: '32px 8px', textAlign: 'center', color: '#888', fontSize: 13,
              background: '#FAFAFA', borderRadius: 10, border: '1px solid #F0F0F0',
            }}>
              צריך לפחות שני אימונים כדי להראות מגמה
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData} margin={{ top: 24, right: 12, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F5E6D8" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} />
                <YAxis
                  yAxisId="primary"
                  orientation="right"
                  domain={[0, 'auto']}
                  tick={{ fontSize: 11, fill: ORANGE }}
                  axisLine={false} tickLine={false}
                />
                {isDualLine && (
                  <YAxis
                    yAxisId="weight"
                    orientation="left"
                    domain={[0, 'auto']}
                    tick={{ fontSize: 11, fill: WEIGHT_BLUE }}
                    axisLine={false} tickLine={false}
                  />
                )}
                <Tooltip
                  contentStyle={{
                    background: 'white', border: `1px solid ${ORANGE}`,
                    borderRadius: 10, color: DARK, fontSize: 13,
                  }}
                  labelStyle={{ color: ORANGE, fontWeight: 700 }}
                  formatter={(v, name) => {
                    if (v == null || !Number.isFinite(Number(v))) return ['—', name];
                    return [`${Math.round(Number(v))}`, name];
                  }}
                  cursor={{ stroke: ORANGE, strokeWidth: 1, strokeDasharray: '4 4' }}
                />
                <Line
                  yAxisId="primary"
                  type="monotone"
                  dataKey={isDualLine ? 'reps' : yKey}
                  name={isDualLine ? 'חזרות' : metricNoun}
                  stroke={ORANGE}
                  strokeWidth={2.5}
                  dot={{ fill: ORANGE, r: 5, strokeWidth: 2, stroke: 'white' }}
                  activeDot={{ r: 8, fill: ORANGE, stroke: 'white', strokeWidth: 2 }}
                  connectNulls
                />
                {isDualLine && (
                  <Line
                    yAxisId="weight"
                    type="monotone"
                    dataKey="weight"
                    name={'משקל בק"ג'}
                    stroke={WEIGHT_BLUE}
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={{ fill: WEIGHT_BLUE, r: 4, strokeWidth: 2, stroke: 'white' }}
                    activeDot={{ r: 7, fill: WEIGHT_BLUE, stroke: 'white', strokeWidth: 2 }}
                    label={(props) => {
                      const { x, y, value } = props;
                      if (value == null || !Number.isFinite(Number(value))) return null;
                      return (
                        <text
                          x={x}
                          y={y - 10}
                          fill={WEIGHT_BLUE}
                          fontSize={11}
                          fontWeight={700}
                          textAnchor="middle"
                        >
                          {Math.round(Number(value))}
                        </text>
                      );
                    }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          )}
        </>
      )}
    </div>
  );
}
