import React, { useMemo, useState } from 'react';
import { ArrowRight, ChevronDown } from 'lucide-react';
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import { base44 } from '@/api/base44Client';
import { readExerciseSummary, readSectionRating } from '@/lib/workoutExecutionApi';
import UnifiedPlanBuilder from './UnifiedPlanBuilder';
import WorkoutExecutionReadOnly from './WorkoutExecutionReadOnly';
import FullscreenChart from '@/components/FullscreenChart';
import SwipeableCard from '@/components/SwipeableCard';

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

// Hebrew long format for execution metadata, e.g.
// "יום שלישי, 22 באפריל 2026, 14:32".
function formatLongHe(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('he-IL', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return ''; }
}

function GradientDivider() {
  return (
    <div style={{
      height: 1,
      background: 'linear-gradient(to right, #FF6F20, #FFE5D0, transparent)',
      margin: '20px 0',
      borderRadius: 999,
    }} />
  );
}

// The chart body is extracted so we can render it both inline (200px)
// and inside the fullscreen modal (340px) without duplication.
function ImprovementChart({ data, height, gradientId = 'workoutGrad' }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={ORANGE} stopOpacity={0.25} />
            <stop offset="95%" stopColor={ORANGE} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#F5E6D8" vertical={false} />
        <XAxis
          dataKey="date" tick={{ fontSize: 10, fill: '#AAA' }}
          axisLine={false} tickLine={false}
        />
        <YAxis
          domain={[0, 10]} tick={{ fontSize: 10, fill: '#AAA' }}
          axisLine={false} tickLine={false} ticks={[0, 2, 4, 6, 8, 10]}
        />
        <Tooltip
          contentStyle={{
            background: '#1a1a1a', border: 'none', borderRadius: 10,
            color: 'white', fontSize: 12,
          }}
          formatter={(v, name) => {
            if (name === 'completionScaled') {
              const pct = Math.round(Number(v) * 10);
              return [`${pct}%`, 'השלמה'];
            }
            return [`${Number(v).toFixed(1)}/10`, 'ציון'];
          }}
          labelStyle={{ color: ORANGE, fontWeight: 700 }}
          cursor={{ stroke: ORANGE, strokeWidth: 1, strokeDasharray: '4 4' }}
        />
        <ReferenceLine y={5} stroke="#E5E5E5" strokeDasharray="3 3" />
        <Area
          type="monotone"
          dataKey="score"
          stroke={ORANGE}
          strokeWidth={3}
          fill={`url(#${gradientId})`}
          dot={{ fill: ORANGE, r: 5, strokeWidth: 2, stroke: 'white' }}
          activeDot={{ r: 8, fill: ORANGE, stroke: 'white', strokeWidth: 2 }}
          connectNulls
        />
        {/* Completion %, normalized to the same 0..10 axis as score so
            both lines share a Y range. Tooltip de-normalizes back to %
            via the formatter above. */}
        <Area
          type="monotone"
          dataKey="completionScaled"
          stroke="#3B82F6"
          strokeWidth={2}
          strokeDasharray="4 4"
          fill="transparent"
          dot={{ fill: '#3B82F6', r: 3, strokeWidth: 1, stroke: 'white' }}
          activeDot={{ r: 6, fill: '#3B82F6', stroke: 'white', strokeWidth: 2 }}
          connectNulls
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function ImprovementGraph({ data, executionsCount }) {
  const [fullscreen, setFullscreen] = useState(false);

  if (!data || data.length === 0) {
    return (
      <div style={{
        padding: '24px 12px', textAlign: 'center', color: '#888',
        background: '#FAFAFA', borderRadius: 14, border: '1px solid #F0F0F0',
        fontSize: 13,
      }}>
        עוד לא ביצעת אימון זה · הגרף יופיע אחרי הביצוע הראשון
      </div>
    );
  }

  // chartData admits executions where self_rating is null but
  // completion_percent > 0 (so the line still draws something for
  // toggle-only workouts like tabata). `score` on those points is
  // null — we must NOT call toFixed on it. Walk back to find the
  // latest point that actually has a numeric score for the header
  // big number; trend is only meaningful when both endpoints have
  // scores.
  const lastWithScore = (() => {
    for (let i = data.length - 1; i >= 0; i--) {
      if (data[i].score != null) return data[i];
    }
    return null;
  })();
  const latest = lastWithScore ? lastWithScore.score : null;
  const prev = (() => {
    if (!lastWithScore) return null;
    const lastIdx = data.indexOf(lastWithScore);
    for (let i = lastIdx - 1; i >= 0; i--) {
      if (data[i].score != null) return data[i].score;
    }
    return null;
  })();
  const trend = (latest != null && prev != null)
    ? Number((latest - prev).toFixed(2))
    : 0;

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setFullscreen(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setFullscreen(true); }}
        style={{
          background: 'white',
          borderRadius: 20,
          padding: '20px 16px 12px',
          marginBottom: 16,
          boxShadow: '0 8px 32px rgba(255,111,32,0.10)',
          border: '1px solid #FFE5D0',
          cursor: 'pointer',
        }}
      >
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'flex-start', marginBottom: 16, gap: 8,
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a1a' }}>
              גרף השיפור שלך
            </div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
              {executionsCount} ביצועים
            </div>
          </div>
          <div style={{ textAlign: 'left' }}>
            <div style={{
              fontSize: 40, fontWeight: 900, color: ORANGE, lineHeight: 1,
            }}>
              {latest != null ? latest.toFixed(1) : '—'}
            </div>
            <div style={{ fontSize: 11, color: '#888', textAlign: 'center' }}>
              מתוך 10
            </div>
          </div>
        </div>

        {trend !== 0 && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '4px 10px', borderRadius: 999, marginBottom: 12,
            background: trend > 0 ? '#ECFDF5' : '#FEF2F2',
            color: trend > 0 ? '#059669' : '#DC2626',
            fontSize: 12, fontWeight: 600,
          }}>
            {trend > 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(1)} מהאימון הקודם
          </div>
        )}

        <ImprovementChart data={data} height={200} gradientId="workoutGrad" />
      </div>

      <FullscreenChart
        isOpen={fullscreen}
        onClose={() => setFullscreen(false)}
        title="גרף השיפור שלך"
      >
        <ImprovementChart data={data} height={340} gradientId="workoutGradFs" />
      </FullscreenChart>
    </>
  );
}

// Per-exercise completion trend — additive sibling to ImprovementGraph.
// Reads the same `completed` array (no extra query) and pulls the
// per-exercise summary stored on workout_executions.exercise_summaries
// (step 2 plumbing). Selector chips are derived from
// plan.sections[*].exercises so coaches/trainees see the real exercise
// names; falls back to summary keys if the prop doesn't carry the
// nested shape. Renders nothing when no exercise has data yet, so it
// never adds visual noise on a fresh plan.
function ExerciseProgressGraph({ plan, completed }) {
  const allExercises = useMemo(() => {
    const fromPlan = [];
    for (const section of plan?.sections || []) {
      for (const ex of section?.exercises || []) {
        if (ex && ex.id) {
          fromPlan.push({
            id: ex.id,
            name: ex.exercise_name || ex.name || 'תרגיל',
          });
        }
      }
    }
    if (fromPlan.length > 0) return fromPlan;
    // Fallback — derive ids from the summaries we already have.
    const ids = new Set();
    for (const e of completed || []) {
      const map = e?.exercise_summaries;
      if (map && typeof map === 'object') {
        for (const id of Object.keys(map)) ids.add(id);
      }
    }
    return Array.from(ids).map((id) => ({ id, name: 'תרגיל' }));
  }, [plan, completed]);

  const exercisesWithData = useMemo(() => {
    return allExercises.filter((ex) => (
      (completed || []).some((e) => readExerciseSummary(e, ex.id).completion_pct != null)
    ));
  }, [allExercises, completed]);

  const [selectedId, setSelectedId] = useState(null);
  // Derived selection — first chip is the default until the user picks
  // something. Avoids a useEffect just to seed state.
  const effectiveSelectedId = selectedId ?? exercisesWithData[0]?.id ?? null;

  if (exercisesWithData.length === 0) return null;

  const chartData = (completed || [])
    .slice()
    .sort((a, b) => new Date(a.executed_at) - new Date(b.executed_at))
    .map((e) => {
      const s = readExerciseSummary(e, effectiveSelectedId);
      if (s.completion_pct == null) return null;
      return {
        date: formatShort(e.executed_at),
        completion: Number(s.completion_pct),
      };
    })
    .filter(Boolean);

  return (
    <div style={{
      background: 'white',
      borderRadius: 16,
      padding: '16px 14px',
      marginBottom: 16,
      border: '1px solid #FFE5D0',
      boxShadow: '0 4px 16px rgba(255,111,32,0.06)',
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: DARK, marginBottom: 4 }}>
        התקדמות לפי תרגיל
      </div>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 12 }}>
        אחוז ההשלמה של התרגיל לאורך הביצועים
      </div>

      {/* Chip selector — horizontally scrollable so a long exercise
          roster doesn't blow up the card height. */}
      <div style={{
        display: 'flex', gap: 8,
        overflowX: 'auto', paddingBottom: 4,
        marginBottom: 12,
      }}>
        {exercisesWithData.map((ex) => {
          const active = ex.id === effectiveSelectedId;
          return (
            <button
              key={ex.id}
              type="button"
              onClick={() => setSelectedId(ex.id)}
              style={{
                flexShrink: 0,
                padding: '6px 12px',
                borderRadius: 999,
                border: active ? `1px solid ${ORANGE}` : '1px solid #E5E5E5',
                background: active ? '#FFF5EE' : 'white',
                color: active ? ORANGE : '#666',
                fontSize: 12, fontWeight: 600,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              {ex.name}
            </button>
          );
        })}
      </div>

      {chartData.length === 0 ? (
        <div style={{
          padding: '18px 8px', textAlign: 'center',
          color: '#888', fontSize: 12,
          background: '#FAFAFA', borderRadius: 10,
          border: '1px solid #F0F0F0',
        }}>
          עדיין אין נתונים לתרגיל הזה
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F5E6D8" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#AAA' }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#AAA' }} axisLine={false} tickLine={false} ticks={[0, 25, 50, 75, 100]} />
            <Tooltip
              contentStyle={{
                background: 'white',
                border: `1px solid ${ORANGE}`,
                borderRadius: 10,
                color: DARK,
                fontSize: 12,
              }}
              labelStyle={{ color: ORANGE, fontWeight: 700 }}
              formatter={(v) => [`${Math.round(Number(v))}%`, 'השלמה']}
              cursor={{ stroke: ORANGE, strokeWidth: 1, strokeDasharray: '4 4' }}
            />
            <Line
              type="monotone"
              dataKey="completion"
              stroke={ORANGE}
              strokeWidth={2.5}
              dot={{ fill: ORANGE, r: 4, strokeWidth: 2, stroke: 'white' }}
              activeDot={{ r: 7, fill: ORANGE, stroke: 'white', strokeWidth: 2 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// Per-section control/challenge trend — additive sibling to
// ExerciseProgressGraph. Reads workout_executions.section_ratings via
// readSectionRating, which normalizes the legacy number shape (avg
// only) and the new object shape ({ control, challenge, avg, notes })
// into one record. Legacy rows contribute only the avg line; the
// control/challenge series skip nulls with connectNulls=false so the
// gap is visible (not falsely interpolated).
function SectionProgressGraph({ plan, completed }) {
  const allSections = useMemo(() => {
    const fromPlan = [];
    for (const section of plan?.sections || []) {
      if (section && section.id) {
        fromPlan.push({
          id: section.id,
          name: section.section_name || section.name || 'סקשן',
        });
      }
    }
    if (fromPlan.length > 0) return fromPlan;
    // Fallback — derive section ids from section_ratings keys across
    // the loaded executions. Names default to "סקשן" since the prop
    // didn't surface them.
    const ids = new Set();
    for (const e of completed || []) {
      const map = e?.section_ratings;
      if (map && typeof map === 'object') {
        for (const id of Object.keys(map)) ids.add(id);
      }
    }
    return Array.from(ids).map((id) => ({ id, name: 'סקשן' }));
  }, [plan, completed]);

  const sectionsWithData = useMemo(() => {
    return allSections.filter((s) => (
      (completed || []).some((e) => readSectionRating(e?.section_ratings?.[s.id]).avg != null)
    ));
  }, [allSections, completed]);

  const [selectedId, setSelectedId] = useState(null);
  const effectiveSelectedId = selectedId ?? sectionsWithData[0]?.id ?? null;

  if (sectionsWithData.length === 0) return null;

  const chartData = (completed || [])
    .slice()
    .sort((a, b) => new Date(a.executed_at) - new Date(b.executed_at))
    .map((e) => {
      const r = readSectionRating(e?.section_ratings?.[effectiveSelectedId]);
      if (r.avg == null && r.control == null && r.challenge == null) return null;
      return {
        date: formatShort(e.executed_at),
        avg: r.avg,
        control: r.control,
        challenge: r.challenge,
      };
    })
    .filter(Boolean);

  return (
    <div style={{
      background: 'white',
      borderRadius: 16,
      padding: '16px 14px',
      marginBottom: 16,
      border: '1px solid #FFE5D0',
      boxShadow: '0 4px 16px rgba(255,111,32,0.06)',
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: DARK, marginBottom: 4 }}>
        התקדמות לפי סקשן — שליטה מול אתגר
      </div>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 12 }}>
        ממוצע, שליטה ואתגר לאורך הביצועים (0-10)
      </div>

      <div style={{
        display: 'flex', gap: 8,
        overflowX: 'auto', paddingBottom: 4,
        marginBottom: 12,
      }}>
        {sectionsWithData.map((s) => {
          const active = s.id === effectiveSelectedId;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedId(s.id)}
              style={{
                flexShrink: 0,
                padding: '6px 12px',
                borderRadius: 999,
                border: active ? `1px solid ${ORANGE}` : '1px solid #E5E5E5',
                background: active ? '#FFF5EE' : 'white',
                color: active ? ORANGE : '#666',
                fontSize: 12, fontWeight: 600,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              {s.name}
            </button>
          );
        })}
      </div>

      {chartData.length === 0 ? (
        <div style={{
          padding: '18px 8px', textAlign: 'center',
          color: '#888', fontSize: 12,
          background: '#FAFAFA', borderRadius: 10,
          border: '1px solid #F0F0F0',
        }}>
          עדיין אין נתונים לסקשן הזה
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F5E6D8" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#AAA' }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 10]} tick={{ fontSize: 10, fill: '#AAA' }} axisLine={false} tickLine={false} ticks={[0, 2, 4, 6, 8, 10]} />
              <Tooltip
                contentStyle={{
                  background: 'white',
                  border: `1px solid ${ORANGE}`,
                  borderRadius: 10,
                  color: DARK,
                  fontSize: 12,
                }}
                labelStyle={{ color: ORANGE, fontWeight: 700 }}
                formatter={(v, name) => {
                  const label = name === 'avg' ? 'ממוצע' : name === 'control' ? 'שליטה' : 'אתגר';
                  return [v != null ? `${Number(v).toFixed(1)}/10` : '—', label];
                }}
                cursor={{ stroke: ORANGE, strokeWidth: 1, strokeDasharray: '4 4' }}
              />
              <Line
                type="monotone" dataKey="avg"
                stroke={ORANGE} strokeWidth={2.5}
                dot={{ fill: ORANGE, r: 4, strokeWidth: 2, stroke: 'white' }}
                activeDot={{ r: 7, fill: ORANGE, stroke: 'white', strokeWidth: 2 }}
                connectNulls={false}
              />
              <Line
                type="monotone" dataKey="control"
                stroke="#4CAF50" strokeWidth={2}
                dot={{ fill: '#4CAF50', r: 3, strokeWidth: 2, stroke: 'white' }}
                activeDot={{ r: 6, fill: '#4CAF50', stroke: 'white', strokeWidth: 2 }}
                connectNulls={false}
              />
              <Line
                type="monotone" dataKey="challenge"
                stroke="#E0A030" strokeWidth={2}
                dot={{ fill: '#E0A030', r: 3, strokeWidth: 2, stroke: 'white' }}
                activeDot={{ r: 6, fill: '#E0A030', stroke: 'white', strokeWidth: 2 }}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>

          {/* Explicit legend — Recharts' built-in Legend reads poorly
              on small mobile cards. Three colored bars in a row keeps
              the mapping obvious without taking vertical space. */}
          <div style={{
            display: 'flex', gap: 16, justifyContent: 'center',
            marginTop: 6, flexWrap: 'wrap',
            fontSize: 11, color: '#666',
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 14, height: 3, background: ORANGE, borderRadius: 2 }} />
              ממוצע
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 14, height: 3, background: '#4CAF50', borderRadius: 2 }} />
              שליטה
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 14, height: 3, background: '#E0A030', borderRadius: 2 }} />
              אתגר
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// Single unified progress graph — replaces ImprovementGraph +
// ExerciseProgressGraph + SectionProgressGraph at the bottom of the
// page. Two selectors (רמה / מדד) recompute the series from the
// already-loaded `completed` array + plan.sections.exercises. No new
// queries; every metric flows through readExerciseSummary /
// readSectionRating so legacy executions without exercise_summaries
// gracefully drop out of the series instead of crashing on toFixed.
function UnifiedProgressGraph({ plan, completed }) {
  const NUM_FONT = "'Barlow Condensed', 'Arial Narrow', sans-serif";
  const SANS_FONT = "'Barlow', system-ui, sans-serif";

  const allExercises = useMemo(() => {
    const out = [];
    for (const section of plan?.sections || []) {
      for (const ex of section?.exercises || []) {
        if (ex && ex.id) {
          out.push({ id: ex.id, name: ex.exercise_name || ex.name || 'תרגיל' });
        }
      }
    }
    return out;
  }, [plan]);

  const [level, setLevel] = useState('all');
  // 'reps' is the most universal metric across all levels — also the
  // user-facing default. The `?? 'reps'` fallback in `effectiveMetric`
  // below means switching level can never leave us on a metric the
  // new level doesn't support (e.g. 'difficulty' is per-exercise only,
  // 'control'/'challenge' are workout-wide only).
  const [metric, setMetric] = useState('reps');

  // Which metrics are valid given the current level.
  const metricsForLevel = level === 'all'
    ? ['reps', 'sets', 'control', 'challenge']
    : ['reps', 'sets', 'difficulty'];
  const effectiveMetric = metricsForLevel.includes(metric) ? metric : 'reps';

  // Wraps setLevel so that switching context also resets the metric if
  // the current pick isn't applicable on the new level.
  const setLevelSafe = (nextLevel) => {
    const nextValid = nextLevel === 'all'
      ? ['reps', 'sets', 'control', 'challenge']
      : ['reps', 'sets', 'difficulty'];
    if (!nextValid.includes(metric)) setMetric('reps');
    setLevel(nextLevel);
  };

  const isScaleMetric = effectiveMetric === 'control'
    || effectiveMetric === 'challenge'
    || effectiveMetric === 'difficulty';

  const sortedExecs = useMemo(
    () => (completed || []).slice().sort(
      (a, b) => new Date(a.executed_at) - new Date(b.executed_at),
    ),
    [completed],
  );

  // Pull the numeric value for a given execution × level × metric.
  // Returns null for "no data" — callers filter those out so the chart
  // and aggregates never reach a null .toFixed. Every iteration is
  // guarded with Number.isFinite so legacy executions missing
  // exercise_summaries or per-section control/challenge data drop out
  // of the series silently instead of crashing.
  const valueFor = (exec, lvl, met) => {
    if (!exec) return null;

    if (lvl === 'all') {
      if (met === 'reps') {
        const map = exec.exercise_summaries;
        if (!map || typeof map !== 'object') return null;
        let total = 0; let any = false;
        for (const exId of Object.keys(map)) {
          const s = readExerciseSummary(exec, exId);
          if (Number.isFinite(s.total_reps_done) && s.total_reps_done > 0) {
            total += s.total_reps_done; any = true;
          }
        }
        return any ? total : null;
      }
      if (met === 'sets') {
        const map = exec.exercise_summaries;
        if (!map || typeof map !== 'object') return null;
        let total = 0; let any = false;
        for (const exId of Object.keys(map)) {
          const s = readExerciseSummary(exec, exId);
          if (Number.isFinite(s.done_sets) && s.done_sets > 0) {
            total += s.done_sets; any = true;
          }
        }
        return any ? total : null;
      }
      if (met === 'control' || met === 'challenge') {
        const ratings = exec.section_ratings;
        if (!ratings || typeof ratings !== 'object') return null;
        const vals = [];
        for (const sid of Object.keys(ratings)) {
          const r = readSectionRating(ratings[sid]);
          const v = r[met];
          if (Number.isFinite(v) && v > 0) vals.push(v);
        }
        if (vals.length === 0) return null;
        return vals.reduce((a, b) => a + b, 0) / vals.length;
      }
    } else {
      const s = readExerciseSummary(exec, lvl);
      if (met === 'reps') {
        return Number.isFinite(s.total_reps_done) && s.total_reps_done > 0
          ? s.total_reps_done : null;
      }
      if (met === 'sets') {
        return Number.isFinite(s.done_sets) && s.done_sets > 0
          ? s.done_sets : null;
      }
      if (met === 'difficulty') {
        return Number.isFinite(s.avg_difficulty) ? s.avg_difficulty : null;
      }
    }
    return null;
  };

  const chartData = useMemo(() => (
    sortedExecs
      .map((e) => ({ date: formatShort(e.executed_at), value: valueFor(e, level, effectiveMetric) }))
      .filter((p) => p.value != null)
  ), [sortedExecs, level, effectiveMetric]);

  const yDomain = isScaleMetric ? [0, 10] : [0, 'auto'];

  // Hebrew noun that pairs with the value in tiles + tooltip + detail.
  // "סטים" reads as "sets" both at workout-wide (סטים שהושלמו) and per
  // exercise (סטים) — the same noun, different framing handled in the
  // subtitle below.
  const metricNoun = (() => {
    if (effectiveMetric === 'reps') return 'חזרות';
    if (effectiveMetric === 'sets') return level === 'all' ? 'סטים שהושלמו' : 'סטים';
    if (effectiveMetric === 'control') return 'שליטה';
    if (effectiveMetric === 'challenge') return 'אתגר';
    if (effectiveMetric === 'difficulty') return 'קושי';
    return '';
  })();

  // One-line subtitle under the title — removes the previous ambiguity
  // about what the number on the Y axis actually means.
  const metricSubtitle = (() => {
    if (level === 'all') {
      if (effectiveMetric === 'reps') return 'סך החזרות שביצעת בכל אימון';
      if (effectiveMetric === 'sets') return 'סך הסטים שהושלמו בכל אימון';
      if (effectiveMetric === 'control') return 'כמה הרגשת שליטה (1-10)';
      if (effectiveMetric === 'challenge') return 'כמה האימון אתגר אותך (1-10)';
    } else {
      if (effectiveMetric === 'reps') return 'סך החזרות שביצעת בתרגיל זה';
      if (effectiveMetric === 'sets') return 'סטים שהושלמו בתרגיל זה';
      if (effectiveMetric === 'difficulty') return 'ממוצע קושי התרגיל (1-10)';
    }
    return '';
  })();

  // formatVal — bare value with unit (used in tooltip).
  // formatTileVal — concise "value + noun" (used in שיא / ממוצע tiles
  // and the detail value when no /10 framing needed).
  // formatDetailVal — for scale metrics adds the explicit "/ 10".
  const formatVal = (v) => {
    if (v == null || !Number.isFinite(Number(v))) return '—';
    if (isScaleMetric) return `${Number(v).toFixed(1)}/10`;
    return `${Math.round(Number(v))}`;
  };
  const formatTileVal = (v) => {
    if (v == null || !Number.isFinite(Number(v))) return '—';
    if (isScaleMetric) return `${Number(v).toFixed(1)} ${metricNoun}`;
    return `${Math.round(Number(v))} ${metricNoun}`;
  };
  const formatDetailVal = (v) => {
    if (v == null || !Number.isFinite(Number(v))) return '—';
    if (isScaleMetric) return `${Number(v).toFixed(1)} / 10 ${metricNoun}`;
    return `${Math.round(Number(v))} ${metricNoun}`;
  };

  const tiles = useMemo(() => {
    const vals = chartData.map((p) => p.value).filter((v) => Number.isFinite(Number(v)));
    if (vals.length === 0) return { best: null, avg: null, trend: null };
    const best = Math.max(...vals);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const trend = vals.length >= 2 ? vals[vals.length - 1] - vals[0] : 0;
    return { best, avg, trend };
  }, [chartData]);

  const latestPoint = chartData.length > 0 ? chartData[chartData.length - 1] : null;
  const prevPoint = chartData.length >= 2 ? chartData[chartData.length - 2] : null;
  const change = (latestPoint && prevPoint && latestPoint.value != null && prevPoint.value != null)
    ? latestPoint.value - prevPoint.value
    : null;

  const chipStyle = (active) => ({
    flexShrink: 0,
    padding: '6px 12px',
    borderRadius: 999,
    border: active ? `1px solid ${ORANGE}` : '1px solid #E5E5E5',
    background: active ? '#FFF5EE' : 'white',
    color: active ? ORANGE : '#666',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
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
          גרף ההתקדמות שלך
        </div>
        {metricSubtitle && (
          <div style={{
            fontSize: 12, color: '#888', marginTop: 3,
            fontFamily: SANS_FONT, fontWeight: 500,
          }}>{metricSubtitle}</div>
        )}
      </div>

      {/* רמה — workout-wide or per-exercise selection */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        overflowX: 'auto', paddingBottom: 6, marginBottom: 8,
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'thin',
      }}>
        <span style={captionStyle}>רמה</span>
        <button type="button" onClick={() => setLevelSafe('all')} style={chipStyle(level === 'all')}>
          כל האימון
        </button>
        {allExercises.map((ex) => (
          <button key={ex.id} type="button"
            onClick={() => setLevelSafe(ex.id)}
            style={chipStyle(level === ex.id)}
          >{ex.name}</button>
        ))}
      </div>

      {/* מדד — chips depend on the active level; per-exercise gets
          'קושי' instead of 'שליטה'/'אתגר', and the workout-wide
          context gets the two section-rating dimensions. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginBottom: 14, flexWrap: 'wrap',
      }}>
        <span style={captionStyle}>מדד</span>
        <button type="button" onClick={() => setMetric('reps')} style={chipStyle(effectiveMetric === 'reps')}>
          חזרות
        </button>
        <button type="button" onClick={() => setMetric('sets')} style={chipStyle(effectiveMetric === 'sets')}>
          {level === 'all' ? 'סטים שהושלמו' : 'סטים'}
        </button>
        {level === 'all' && (
          <>
            <button type="button" onClick={() => setMetric('control')} style={chipStyle(effectiveMetric === 'control')}>
              שליטה
            </button>
            <button type="button" onClick={() => setMetric('challenge')} style={chipStyle(effectiveMetric === 'challenge')}>
              אתגר
            </button>
          </>
        )}
        {level !== 'all' && (
          <button type="button" onClick={() => setMetric('difficulty')} style={chipStyle(effectiveMetric === 'difficulty')}>
            קושי
          </button>
        )}
      </div>

      {chartData.length === 0 ? (
        <div style={{
          padding: '32px 8px', textAlign: 'center', color: '#888', fontSize: 13,
          background: '#FAFAFA', borderRadius: 12, border: '1px solid #F0F0F0',
          fontFamily: SANS_FONT,
        }}>
          עדיין אין נתונים למדד הזה
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F5E6D8" vertical={false} />
            <XAxis
              dataKey="date" tick={{ fontSize: 12, fill: '#AAA' }}
              axisLine={false} tickLine={false}
            />
            <YAxis
              domain={yDomain} tick={{ fontSize: 12, fill: '#AAA' }}
              axisLine={false} tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: 'white', border: `1px solid ${ORANGE}`,
                borderRadius: 10, color: DARK, fontSize: 13,
              }}
              labelStyle={{ color: ORANGE, fontWeight: 700 }}
              formatter={(v) => [formatVal(v), metricNoun]}
              // metricNoun adapts per-metric ("חזרות" / "סטים שהושלמו"
              // / "שליטה" / "אתגר" / "קושי") so the tooltip always
              // names the right axis instead of a bare number.
              cursor={{ stroke: ORANGE, strokeWidth: 1, strokeDasharray: '4 4' }}
            />
            <Line
              type="monotone" dataKey="value"
              stroke={ORANGE} strokeWidth={3}
              dot={{ fill: ORANGE, r: 6, strokeWidth: 2, stroke: 'white' }}
              activeDot={{ r: 9, fill: ORANGE, stroke: 'white', strokeWidth: 2 }}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}

      {chartData.length > 0 && (
        <>
          {/* 3 metric tiles — שיא / ממוצע / מגמה */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
            marginTop: 18, paddingInline: 4,
          }}>
            {(() => {
              const trendStr = (() => {
                if (tiles.trend == null || !Number.isFinite(tiles.trend) || tiles.trend === 0) return '—';
                const sign = tiles.trend > 0 ? '+' : '−';
                const abs = Math.abs(tiles.trend);
                if (isScaleMetric) return `${sign}${abs.toFixed(1)} ${metricNoun}`;
                return `${sign}${Math.round(abs)} ${metricNoun}`;
              })();
              const trendColor = tiles.trend > 0 ? '#16a34a'
                : tiles.trend < 0 ? '#dc2626'
                : DARK;
              return [
                { label: 'שיא',   value: formatTileVal(tiles.best), color: DARK },
                { label: 'ממוצע', value: formatTileVal(tiles.avg),  color: DARK },
                { label: 'מגמה',  value: trendStr,                  color: trendColor },
              ];
            })().map((t) => (
              <div key={t.label} style={{
                background: '#FFF8EF', border: '1px solid #EFE0C8',
                borderRadius: 10, padding: '10px 8px', textAlign: 'center',
              }}>
                <div style={{ fontSize: 11, color: '#888', fontFamily: SANS_FONT, marginBottom: 4 }}>{t.label}</div>
                <div style={{
                  fontFamily: NUM_FONT, fontSize: 22, fontWeight: 700,
                  color: t.color, lineHeight: 1,
                }}>{t.value}</div>
              </div>
            ))}
          </div>

          {/* Latest point detail */}
          {latestPoint && (
            <div style={{
              marginTop: 14, padding: '10px 12px',
              background: '#FFF5EE', border: `1px solid #FFE5D0`,
              borderRadius: 10,
              fontFamily: SANS_FONT,
              paddingInline: 14,
            }}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>
                פירוט — {latestPoint.date}
              </div>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8,
              }}>
                <span style={{ fontSize: 13, color: '#555', fontWeight: 600 }}>
                  {metricNoun}
                </span>
                <span style={{
                  fontFamily: NUM_FONT, fontSize: 22, fontWeight: 700, color: ORANGE,
                  lineHeight: 1,
                }}>
                  {formatDetailVal(latestPoint.value)}
                </span>
              </div>
              {change != null && Number.isFinite(change) && change !== 0 && (
                <div style={{
                  fontSize: 12,
                  color: change > 0 ? '#16a34a' : '#dc2626',
                  marginTop: 4, fontWeight: 600,
                }}>
                  {change > 0 ? '↑' : '↓'}{' '}
                  {isScaleMetric ? Math.abs(change).toFixed(1) : Math.round(Math.abs(change))}
                  {' '}{metricNoun}{' '}מהביצוע הקודם
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MasterCard({
  plan, sectionsCount, exercisesCount, isCoach, hasExecutions,
  onActivate, onEditPlan, onDuplicateExecution, onPlanDeleted,
}) {
  const traineeLabel = hasExecutions ? 'בצע שוב' : 'התחל אימון';
  const handleCardTap = isCoach
    ? () => onEditPlan && onEditPlan(plan)
    : () => onActivate && onActivate();

  // Plan-level action menu (coach only). The 3-dots button opens
  // a bottom sheet with: copy-to-trainee → opens a second sheet
  // with the coach's roster; edit → existing onEditPlan; duplicate
  // → inserts a new training_plans row; delete → cascade delete +
  // navigate back.
  const queryClient = useQueryClient();
  const [showPlanMenu, setShowPlanMenu] = useState(false);
  const [showCopyToTrainee, setShowCopyToTrainee] = useState(false);

  const { data: trainees = [] } = useQuery({
    queryKey: ['plan-menu-trainees'],
    queryFn: async () => {
      const me = await base44.auth.me().catch(() => null);
      if (!me?.id) return [];
      const { data } = await supabase
        .from('users')
        .select('id, full_name')
        .eq('role', 'trainee')
        .eq('coach_id', me.id)
        .order('full_name');
      return data || [];
    },
    enabled: showCopyToTrainee || showPlanMenu,
  });

  const handlePlanAction = async (action) => {
    setShowPlanMenu(false);
    if (action === 'edit') {
      onEditPlan && onEditPlan(plan);
      return;
    }
    if (action === 'duplicate') {
      try {
        const { id, created_at, ...rest } = plan;
        const { error } = await supabase
          .from('training_plans')
          .insert({ ...rest, plan_name: `${plan.plan_name || 'תוכנית'} (עותק)` });
        if (error) throw error;
        toast.success('התוכנית שוכפלה ✅');
        queryClient.invalidateQueries({ queryKey: ['workouts-plans'] });
        queryClient.invalidateQueries({ queryKey: ['training-plans'] });
      } catch (e) {
        toast.error('שכפול נכשל: ' + (e?.message || 'נסה שוב'));
      }
      return;
    }
    if (action === 'copy') {
      setShowCopyToTrainee(true);
      return;
    }
    if (action === 'delete') {
      if (!window.confirm(`למחוק את "${plan.plan_name || ''}" לצמיתות? לא ניתן לשחזר.`)) return;
      try {
        await supabase.from('exercises').delete().eq('training_plan_id', plan.id);
        await supabase.from('training_sections').delete().eq('training_plan_id', plan.id);
        await supabase.from('workout_executions').delete().eq('plan_id', plan.id);
        const { error } = await supabase.from('training_plans').delete().eq('id', plan.id);
        if (error) throw error;
        toast.success('התוכנית נמחקה');
        queryClient.invalidateQueries({ queryKey: ['workouts-plans'] });
        queryClient.invalidateQueries({ queryKey: ['training-plans'] });
        if (onPlanDeleted) onPlanDeleted();
      } catch (e) {
        toast.error('מחיקה נכשלה: ' + (e?.message || 'נסה שוב'));
      }
    }
  };

  const copyPlanToTrainee = async (traineeId) => {
    try {
      const { id, created_at, ...rest } = plan;
      const { error } = await supabase
        .from('training_plans')
        .insert({ ...rest, assigned_to: traineeId });
      if (error) throw error;
      toast.success('התוכנית הועתקה בהצלחה ✅');
      queryClient.invalidateQueries({ queryKey: ['workouts-plans'] });
      queryClient.invalidateQueries({ queryKey: ['training-plans'] });
    } catch (e) {
      toast.error('העתקה נכשלה: ' + (e?.message || 'נסה שוב'));
    } finally {
      setShowCopyToTrainee(false);
    }
  };

  return (
    <div
      onClick={handleCardTap}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleCardTap(); }}
      style={{
        position: 'relative',
        background: '#EEF2FF',
        border: '2px solid #818CF8',
        borderRadius: 14,
        padding: '14px 16px',
        cursor: 'pointer',
      }}
    >
      {isCoach && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setShowPlanMenu(true); }}
          aria-label="פעולות תוכנית"
          style={{
            position: 'absolute', top: 12, left: 12,
            width: 32, height: 32, borderRadius: '50%',
            background: 'rgba(0,0,0,0.06)', border: 'none',
            fontSize: 18, lineHeight: 1, cursor: 'pointer',
            color: '#888',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 0,
            zIndex: 2,
          }}
        >⋮</button>
      )}
      <div style={{
        fontSize: 17, fontWeight: 800, color: DARK,
        marginBottom: 4,
        paddingLeft: isCoach ? 44 : 0,
      }}>
        {plan.plan_name || plan.title || 'תוכנית'}
      </div>
      <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 12 }}>
        {sectionsCount} סקשנים · {exercisesCount} תרגילים
      </div>
      {isCoach ? (
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEditPlan && onEditPlan(plan); }}
            style={{
              width: '100%', padding: '10px',
              background: 'white',
              border: `2px solid ${ORANGE}`,
              borderRadius: 12,
              color: ORANGE,
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              marginBottom: 8,
            }}
          >
            ✏️ ערוך תוכנית
          </button>
          {onDuplicateExecution && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDuplicateExecution(plan); }}
              style={{
                width: '100%', padding: '10px',
                background: '#1a1a1a',
                border: 'none',
                borderRadius: 12,
                color: ORANGE,
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              📋 שכפל אימון
            </button>
          )}
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onActivate && onActivate(); }}
            style={{
              width: '100%', height: 44, borderRadius: 12,
              background: ORANGE, color: 'white', border: 'none',
              fontSize: 14, fontWeight: 800, cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(255,111,32,0.25)',
              marginBottom: onDuplicateExecution ? 8 : 0,
            }}
          >
            {traineeLabel}
          </button>
          {onDuplicateExecution && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDuplicateExecution(plan); }}
              style={{
                width: '100%', padding: '10px',
                background: 'white',
                border: `2px solid ${ORANGE}`,
                borderRadius: 12,
                color: ORANGE,
                fontWeight: 700, fontSize: 13, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              📋 שכפל אימון
            </button>
          )}
        </>
      )}

      {/* Action menu — bottom sheet. zIndex bumped above app
          chrome / bottom nav, plus 100px bottom padding so the
          last action isn't hidden behind a sticky footer. */}
      {showPlanMenu && (
        <>
          <div
            onClick={(e) => { e.stopPropagation(); setShowPlanMenu(false); }}
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.4)', zIndex: 999,
            }}
          />
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed', bottom: 0, left: 0, right: 0,
              background: 'white', borderRadius: '20px 20px 0 0',
              padding: '24px 20px 100px', zIndex: 1000, direction: 'rtl',
              cursor: 'default',
            }}
          >
            <div style={{ width: 36, height: 4, background: '#E5E7EB', borderRadius: 999, margin: '0 auto 20px' }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: DARK, marginBottom: 16 }}>
              {plan.plan_name || 'תוכנית'}
            </div>
            {[
              { icon: '📋', label: 'העתק למתאמן אחר', action: 'copy', color: DARK },
              { icon: '✏️', label: 'ערוך תוכנית', action: 'edit', color: DARK },
              { icon: '📄', label: 'שכפל תוכנית', action: 'duplicate', color: DARK },
              { icon: '🗑️', label: 'מחק תוכנית', action: 'delete', color: '#DC2626' },
            ].map((item) => (
              <button
                key={item.action}
                type="button"
                onClick={() => handlePlanAction(item.action)}
                style={{
                  width: '100%', padding: '16px',
                  background: 'white', border: 'none',
                  borderBottom: '1px solid #F5F5F5',
                  display: 'flex', alignItems: 'center', gap: 14,
                  fontSize: 16, color: item.color,
                  cursor: 'pointer', direction: 'rtl', textAlign: 'right',
                }}
              >
                <span style={{ fontSize: 20 }}>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Copy-to-trainee picker — second sheet. zIndex above the
          first menu (which is at 1000) so the picker stacks on
          top, plus 100px bottom padding to clear the footer. */}
      {showCopyToTrainee && (
        <>
          <div
            onClick={(e) => { e.stopPropagation(); setShowCopyToTrainee(false); }}
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.4)', zIndex: 1001,
            }}
          />
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed', bottom: 0, left: 0, right: 0,
              background: 'white', borderRadius: '20px 20px 0 0',
              padding: '24px 20px 100px', zIndex: 1002,
              maxHeight: '70vh', overflowY: 'auto', direction: 'rtl',
              cursor: 'default',
            }}
          >
            <div style={{ width: 36, height: 4, background: '#E5E7EB', borderRadius: 999, margin: '0 auto 20px' }} />
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: DARK }}>בחר מתאמן</div>
            {trainees.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#888', fontSize: 14 }}>
                אין מתאמנים זמינים
              </div>
            ) : (
              trainees.map((trainee) => (
                <button
                  key={trainee.id}
                  type="button"
                  onClick={() => copyPlanToTrainee(trainee.id)}
                  style={{
                    width: '100%', padding: '14px 16px',
                    background: 'white', border: 'none',
                    borderBottom: '1px solid #F5F5F5',
                    display: 'flex', alignItems: 'center', gap: 12,
                    fontSize: 15, color: DARK, cursor: 'pointer',
                    direction: 'rtl', textAlign: 'right',
                  }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: ORANGE, color: 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 700, flexShrink: 0,
                  }}>
                    {trainee.full_name?.[0] || '?'}
                  </div>
                  {trainee.full_name}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

// One past-execution accordion. Three render shapes:
//
//   • Completed (has a score)          — tap expands inline to
//     WorkoutExecutionReadOnly which fetches workout_executions +
//     exercise_set_logs and renders the saved per-set values,
//     exercise notes, section ratings, and the average score.
//
//   • Blank / scheduled (completion=0  — created by the duplicate
//     button or any other "I plan to do this" path) — tap fires
//     onActivate(execution); the parent flips to active mode and
//     mounts UnifiedPlanBuilder so the trainee can actually run it.
//     No accordion, no read-only render — those would just show
//     placeholders since no set logs exist yet.
//
//   • In-progress (completion>0 but no score) — falls through to the
//     accordion in case partial set logs exist worth showing.
//
// When isCoach=true and onDelete is provided, the row is wrapped in
// SwipeableCard so a left-swipe reveals a delete button.
function ExecutionRow({ plan, execution, indexLabel, isCoach = false, onDelete, onActivate }) {
  const [open, setOpen] = useState(false);
  const score = execution.self_rating != null ? Number(execution.self_rating) : null;
  const hasScore = score != null;
  const completionRaw = execution.completion_percent;
  const completionNum = completionRaw == null ? 0 : Number(completionRaw);
  // Treat blank duplicates and any unstarted scheduled rows as
  // "tap to start." We can't cheaply check exercise_set_logs from
  // here without an extra round-trip per row, so completion_percent
  // alone gates the branch — createDuplicatedExecution writes 0 and
  // the live workout flow overwrites it on save.
  const isBlank = !hasScore && completionNum === 0;

  const handleClick = () => {
    if (isBlank) {
      if (onActivate) onActivate(execution);
      return;
    }
    setOpen((v) => !v);
  };

  const inner = (
    <div style={{
      background: 'white',
      border: isBlank ? `1px solid ${ORANGE}` : '1px solid #F0E4D0',
      borderRadius: 10,
      marginBottom: 6,
      overflow: 'hidden',
    }}>
      <button
        type="button"
        onClick={handleClick}
        aria-expanded={isBlank ? undefined : open}
        style={{
          all: 'unset',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 10, padding: '10px 14px',
          width: '100%', boxSizing: 'border-box',
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize: 15, fontWeight: 700, color: DARK,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            marginBottom: 1,
          }}>
            {plan?.plan_name || plan?.title || 'אימון'} ({indexLabel})
          </div>
          <div style={{ fontSize: 13, color: '#aaa', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {isBlank ? 'מוכן להתחלה' : formatLongHe(execution.executed_at)}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {isBlank ? (
            <span style={{
              padding: '6px 12px',
              borderRadius: 999,
              background: ORANGE,
              color: 'white',
              fontSize: 12,
              fontWeight: 800,
              lineHeight: 1,
              boxShadow: '0 2px 6px rgba(255,111,32,0.25)',
            }}>
              ▶ התחל אימון
            </span>
          ) : (
            <>
              {hasScore && (
                <div style={{
                  width: 34, height: 34, borderRadius: '50%',
                  background: ORANGE, color: 'white',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 15, fontWeight: 900, lineHeight: 1,
                }}>
                  {score.toFixed(1)}
                </div>
              )}
              {completionNum > 0 && (
                <span style={{ fontSize: 13, color: '#888' }}>
                  {Math.round(completionNum)}%
                </span>
              )}
              <span style={{ fontSize: 11, color: '#ccc' }}>
                {open ? '▲' : '▼'}
              </span>
            </>
          )}
        </div>
      </button>
      {!isBlank && open && (
        <div style={{ padding: '0 12px 12px' }}>
          <WorkoutExecutionReadOnly
            plan={plan}
            executionId={execution.id}
            compact
          />
        </div>
      )}
    </div>
  );

  return (
    <SwipeableCard
      disabled={!isCoach || !onDelete}
      onDelete={onDelete ? () => onDelete(execution) : undefined}
    >
      {inner}
    </SwipeableCard>
  );
}

export default function WorkoutFolderDetail({
  plan, sectionsCount, exercisesCount, executions,
  isCoach = false, onBack, onWorkoutFinished, onEditPlan,
  onDuplicateExecution, onDeleteExecution,
}) {
  // null = render the folder body. 'active' = full-screen workout via the
  // master button (canEdit/isCoach mirror the user's role).
  const [activeMode, setActiveMode] = useState(null);
  // Collapsible state for the bottom progress graph. Closed by
  // default — the graph block is tall and noisy on first scroll;
  // the trainee/coach opens it when they want to inspect trends.
  const [graphExpanded, setGraphExpanded] = useState(false);

  const completed = executions || [];

  const numberedNewestFirst = useMemo(() => {
    const sorted = completed
      .slice()
      .sort((a, b) => new Date(b.executed_at) - new Date(a.executed_at));
    const total = sorted.length;
    return sorted.map((exec, i) => ({ exec, indexLabel: total - i }));
  }, [completed]);

  const chartData = useMemo(
    () => {
      const built = completed
        .slice()
        .sort((a, b) => new Date(a.executed_at) - new Date(b.executed_at))
        .filter((e) => e.self_rating != null || (e.completion_percent ?? 0) > 0)
        .map((e) => {
          const completionPct = e.completion_percent != null ? Number(e.completion_percent) : 0;
          return {
            date: formatShort(e.executed_at),
            score: e.self_rating != null ? Number(e.self_rating) : null,
            completion: completionPct,
            // Same 0..10 axis as score; the chart's tooltip formatter
            // de-normalizes this back to a 0..100% string.
            completionScaled: completionPct / 10,
          };
        });
      // Diagnostic — shows in the browser console how many of the
      // raw executions actually carry a numeric self_rating, vs how
      // many hit the chart. Helps spot stuck "graph empty after save"
      // bugs without redeploying.
      const withScore = completed.filter((e) => e.self_rating != null).length;
      console.log('[GRAPH] executions:', completed.length, '· with self_rating:', withScore, '· chart points:', built.length);
      return built;
    },
    [completed]
  );

  const planName = plan?.plan_name || plan?.title || 'אימון';

  // Master button activation → full-screen UnifiedPlanBuilder (replaces
  // the folder body but stays within the same Workouts page level).
  if (activeMode === 'active') {
    return (
      <UnifiedPlanBuilder
        plan={plan}
        isCoach={isCoach}
        canEdit={isCoach}
        onBack={() => {
          setActiveMode(null);
          onWorkoutFinished && onWorkoutFinished();
        }}
      />
    );
  }

  return (
    <div dir="rtl" style={{ minHeight: '100vh', background: '#FAFAFA' }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: 'white',
        borderBottom: '1px solid #F0E4D0',
        display: 'flex', alignItems: 'center',
        height: 56, padding: '0 8px',
      }}>
        <button
          type="button"
          onClick={() => onBack && onBack()}
          style={{
            all: 'unset', cursor: 'pointer',
            height: 36, borderRadius: 8, padding: '0 10px',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            color: DARK, fontSize: 14, fontWeight: 700,
          }}
        >
          <ArrowRight className="w-5 h-5" />
          חזרה לאימונים
        </button>
        <div style={{
          flex: 1, textAlign: 'center', fontSize: 16, fontWeight: 800, color: DARK,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          padding: '0 8px',
        }}>
          {planName}
        </div>
        {/* Spacer to balance the back-button width so the title
            actually centers. Width matched to a typical "חזרה לאימונים"
            label so the visual balance is close. */}
        <div style={{ width: 110 }} />
      </div>

      <div style={{ padding: 16 }}>
        <MasterCard
          plan={plan}
          sectionsCount={sectionsCount}
          exercisesCount={exercisesCount}
          isCoach={isCoach}
          hasExecutions={completed.length > 0}
          onActivate={() => setActiveMode('active')}
          onEditPlan={onEditPlan}
          onDuplicateExecution={onDuplicateExecution}
          onPlanDeleted={onBack}
        />

        {completed.length > 0 && (
          <>
            <div style={{
              borderTop: '1px solid #F0E4D0',
              marginTop: 12,
              padding: '12px 0 8px',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: DARK }}>
                ביצועים קודמים
              </div>
              <span style={{
                background: '#FFF5EE',
                color: ORANGE,
                fontSize: 12, fontWeight: 700,
                padding: '3px 10px', borderRadius: 999,
                lineHeight: 1,
              }}>
                {completed.length}
              </span>
            </div>
            <div>
              {numberedNewestFirst.map(({ exec, indexLabel }) => (
                <ExecutionRow
                  key={exec.id}
                  plan={plan}
                  execution={exec}
                  indexLabel={indexLabel}
                  isCoach={isCoach}
                  onDelete={onDeleteExecution}
                  onActivate={() => setActiveMode('active')}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Unified progress graph — full-bleed, last block on the page.
          Collapsible: closed by default; tapping the header toggles
          the expanded body. The graph component (with its internal
          title, level/metric selectors, chart, tiles) renders only
          when expanded so the collapsed state stays a compact 50px
          strip at the bottom of the folder body. */}
      <div style={{
        background: '#FFFFFF',
        borderTop: '1px solid #F0E4D0',
        width: '100%',
        direction: 'rtl',
      }}>
        <button
          type="button"
          onClick={() => setGraphExpanded((v) => !v)}
          aria-expanded={graphExpanded}
          aria-label="הצג/הסתר גרף התקדמות"
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            padding: '14px 16px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontFamily: "'Barlow', system-ui, sans-serif",
            direction: 'rtl',
          }}
        >
          <span style={{
            fontSize: 13,
            color: '#6b7280',
            fontWeight: 500,
            letterSpacing: '0.3px',
          }}>
            גרף התקדמות
          </span>
          <span style={{
            width: 32, height: 32,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#6b7280',
            transition: 'transform 0.2s',
            transform: graphExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            flexShrink: 0,
          }} aria-hidden>
            <ChevronDown size={18} />
          </span>
        </button>
        {graphExpanded && (
          <UnifiedProgressGraph plan={plan} completed={completed} />
        )}
      </div>
    </div>
  );
}
