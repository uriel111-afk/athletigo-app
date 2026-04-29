import React, { useState, useMemo, useContext, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { AuthContext } from '@/lib/AuthContext';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  ReferenceLine, ReferenceDot, Legend,
} from 'recharts';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { exerciseInfoFor, unitLabel } from '@/lib/recordExercises';
import NewRecordDialog from '@/components/forms/NewRecordDialog';
import { Chip } from '@/components/ui/Chip';
import { GOAL_STATUS } from '@/lib/goalsApi';
import GoalAchievedPopup from '@/components/trainee/GoalAchievedPopup';
import RecordsByDay from '@/components/profile/RecordsByDay';
import { useWindowSize } from '@/hooks/useWindowSize';

const O = '#FF6F20';
const CARD_BG = '#FFFFFF';
const BORDER = '#F0E4D0';
// 8-colour palette used wherever a series needs its own colour —
// master chart line, projection line, target ReferenceLine, milestone
// ReferenceDot, folder card accent, legend swatch. Index = exercise
// position in the visible-exercises list, modulo length.
const EXERCISE_COLORS = [
  '#FF6F20', // brand orange
  '#3B82F6', // blue
  '#10B981', // green
  '#8B5CF6', // purple
  '#F59E0B', // amber
  '#EF4444', // red
  '#06B6D4', // cyan
  '#EC4899', // pink
];

const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('he-IL');
};

// Compact day-month label for the X axis. Recharts struggles to fit a
// full D.M.YYYY string when 5+ ticks are visible — chopping the year
// frees enough horizontal space to show 4–6 ticks without rotation.
const shortDateLabel = (s) => {
  if (!s) return '';
  const parts = String(s).split('.');
  if (parts.length >= 2) return `${parts[0]}.${parts[1]}`;
  return String(s);
};

// Custom legend — Recharts' built-in cuts long Hebrew exercise names
// (e.g. "בייסליין — בס...") because it constrains item width. This
// version flex-wraps so every name renders in full, breaking onto a
// new row when the row fills.
const CustomLegend = ({ payload }) => {
  if (!Array.isArray(payload) || payload.length === 0) return null;
  return (
    <div
      dir="rtl"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px 16px',
        justifyContent: 'center',
        width: '100%',
        padding: '4px 0 0',
      }}
    >
      {payload.map((entry, i) => (
        <div
          key={`legend-${i}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: '#1A1A1A',
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{
            width: 10, height: 10, borderRadius: 999,
            background: entry.color, display: 'inline-block',
          }} />
          {entry.value}
        </div>
      ))}
    </div>
  );
};

// Trim + lowercase + collapse whitespace so two strings that "look
// the same" actually compare equal. Required for goal↔records
// matching because users can create goals via different forms (the
// goal dialog, the achievement popup CTA, an old onboarding row) and
// the casing/spacing isn't always identical to the records.name.
const normalizeExerciseName = (name) =>
  (name || '').trim().toLowerCase().replace(/\s+/g, ' ');

// Find the single active goal whose exercise_name normalizes to the
// passed exerciseName. Returns null when none matches.
const findGoalForExercise = (goals, exerciseName) => {
  if (!Array.isArray(goals) || !exerciseName) return null;
  const target = normalizeExerciseName(exerciseName);
  return goals.find(
    (g) => g.status === GOAL_STATUS.ACTIVE && normalizeExerciseName(g.exercise_name) === target
  ) || null;
};

// All achieved goals for an exercise — fed into ReferenceDot
// milestone flags.
const findAchievedGoalsForExercise = (goals, exerciseName) => {
  if (!Array.isArray(goals) || !exerciseName) return [];
  const target = normalizeExerciseName(exerciseName);
  return goals.filter(
    (g) =>
      g.status === GOAL_STATUS.ACHIEVED &&
      g.completed_at &&
      normalizeExerciseName(g.exercise_name) === target
  );
};

// Personal records tab — master chart with per-exercise filter pills,
// stats row, and inline-expandable folders per exercise. Each folder
// shows its own progression chart with PB-emphasised dots, an
// optional ReferenceLine for the linked goal target, and the full
// records list. Adds + edits live in NewRecordDialog.
export default function ProgressTab({ traineeId }) {
  const { user: currentUser } = useContext(AuthContext);
  const isCoach =
    currentUser?.is_coach || currentUser?.role === 'coach' || currentUser?.role === 'admin';
  const queryClient = useQueryClient();

  // Responsive chart sizing. <480px gets a shorter chart + smaller
  // axis tick text + tighter LineChart margins so the plot area
  // stays readable on a 360px viewport without horizontal scroll.
  const { width: viewportWidth } = useWindowSize();
  const isMobile = viewportWidth < 480;
  const chartHeight = isMobile ? 260 : 360;

  const [openRecordFolder, setOpenRecordFolder] = useState(null);
  const [filterExercise, setFilterExercise] = useState('all');
  const [showNewRecord, setShowNewRecord] = useState(false);
  // Coach-only inline edit — set to a personal_records row to open
  // NewRecordDialog in edit mode (UPDATE instead of INSERT).
  const [editingRecord, setEditingRecord] = useState(null);

  // Master-chart minimize toggle. Persisted per traineeId so the
  // trainee's preference survives across sessions; the coach gets a
  // separate key when viewing a specific trainee.
  const minimizeKey = traineeId ? `records_chart_minimized_${traineeId}` : null;
  const [chartMinimized, setChartMinimized] = useState(() => {
    if (!minimizeKey) return false;
    try { return localStorage.getItem(minimizeKey) === '1'; } catch { return false; }
  });
  useEffect(() => {
    if (!minimizeKey) return;
    try {
      if (chartMinimized) localStorage.setItem(minimizeKey, '1');
      else localStorage.removeItem(minimizeKey);
    } catch {}
  }, [chartMinimized, minimizeKey]);

  // ── Data ───────────────────────────────────────────────────────
  const { data: records = [] } = useQuery({
    queryKey: ['personal-records', traineeId],
    queryFn: async () => {
      if (!traineeId) return [];
      const { data, error } = await supabase
        .from('personal_records')
        .select('*')
        .eq('trainee_id', traineeId)
        .or('status.is.null,status.neq.deleted')
        .order('date', { ascending: true });
      if (error) {
        console.warn('[Records] query failed:', error.message);
        return [];
      }
      return data || [];
    },
    enabled: !!traineeId,
  });

  // Goal progress — used to draw the dashed target line on a folder's
  // chart when an exercise has a linked goal. Read-only here.
  const { data: goalProgress = [] } = useQuery({
    queryKey: ['goal-progress', traineeId],
    queryFn: async () => {
      if (!traineeId) return [];
      const { data, error } = await supabase
        .from('goal_progress')
        .select('*')
        .eq('trainee_id', traineeId)
        .order('date', { ascending: false });
      if (error) {
        console.warn('[Records] goal_progress query failed:', error.message);
        return [];
      }
      return data || [];
    },
    enabled: !!traineeId,
  });

  // Goals — used to overlay the projection line + achieved-milestone
  // dots on the records chart. Active row drives the dashed line;
  // achieved rows surface as flag dots at their completion timestamp.
  const { data: goalsData = [] } = useQuery({
    queryKey: ['goals', traineeId],
    queryFn: async () => {
      if (!traineeId) return [];
      const { data, error } = await supabase
        .from('goals')
        .select('*')
        .eq('trainee_id', traineeId)
        .order('created_at', { ascending: true });
      if (error) {
        console.warn('[Records] goals query failed:', error.message);
        return [];
      }
      return data || [];
    },
    enabled: !!traineeId,
  });

  // Goal-achievement celebration popup state. Set by NewRecordDialog
  // via the onAchievement callback when a freshly-saved record value
  // crosses an active goal's target_value.
  const [achievement, setAchievement] = useState(null);

  // Tap-to-pin point on the chart — Recharts' tooltip is hover-only
  // and disappears the moment a finger leaves the screen on mobile,
  // so we mirror activeDot clicks into local state and render a
  // pinned panel below the chart that the trainee can read at leisure.
  const [selectedPoint, setSelectedPoint] = useState(null);

  // Realtime — coach adds a record on laptop → trainee phone refreshes live.
  useEffect(() => {
    if (!traineeId) return;
    const ch = supabase
      .channel(`personal-records-${traineeId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'personal_records',
        filter: `trainee_id=eq.${traineeId}`,
      }, () => queryClient.invalidateQueries({ queryKey: ['personal-records', traineeId] }))
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [traineeId, queryClient]);

  // Group records by exercise name. Each folder carries the sorted
  // records array, the all-time best, and the latest entry.
  const folders = useMemo(() => {
    const map = new Map();
    for (const r of records) {
      const key = (r.name || r.exercise_name || '').trim();
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    }
    const arr = [];
    for (const [name, list] of map.entries()) {
      const sorted = [...list].sort((a, b) =>
        String(a.date || '').localeCompare(String(b.date || ''))
      );
      const best = sorted.reduce(
        (mx, r) => (Number(r.value) > Number(mx?.value || -Infinity) ? r : mx),
        sorted[0]
      );
      const latest = sorted[sorted.length - 1];
      arr.push({ name, records: sorted, best, latest });
    }
    arr.sort((a, b) =>
      String(b.latest?.date || '').localeCompare(String(a.latest?.date || ''))
    );
    return arr;
  }, [records]);

  const exerciseNames = useMemo(() => folders.map(f => f.name), [folders]);

  const chartExercises = filterExercise === 'all' ? exerciseNames : [filterExercise];

  // Build a per-exercise projection segment from "current PB" → target.
  // End date prefers goal.target_date; falls back to a slope-based
  // estimate (days needed at current rate of progress) and finally a
  // 90-day default. Result feeds an extra `${ex}__proj` dataKey.
  const projections = useMemo(() => {
    if (!Array.isArray(goalsData) || goalsData.length === 0) return [];
    const out = [];
    for (const ex of chartExercises) {
      const activeGoal = findGoalForExercise(goalsData, ex);
      if (!activeGoal) continue;
      const target = parseFloat(activeGoal.target_value);
      if (!Number.isFinite(target)) continue;
      const exNorm = normalizeExerciseName(ex);
      const exRecords = records
        .filter(r => normalizeExerciseName(r.name || r.exercise_name) === exNorm && r.date)
        .sort((a, b) => String(a.date).localeCompare(String(b.date)));
      if (exRecords.length === 0) continue;
      const last = exRecords[exRecords.length - 1];
      const startDate = last.date;
      const startValue = Number(last.value) || 0;
      let endDate;
      if (activeGoal.target_date) {
        endDate = String(activeGoal.target_date).split('T')[0];
      } else if (exRecords.length >= 2) {
        const first = exRecords[0];
        const dayDiff = (new Date(last.date) - new Date(first.date)) / 86400000;
        const valDiff = startValue - (Number(first.value) || 0);
        const slopePerDay = dayDiff > 0 ? valDiff / dayDiff : 0;
        const remaining = target - startValue;
        const daysToTarget = slopePerDay > 0 ? remaining / slopePerDay : 90;
        const future = new Date(last.date);
        future.setDate(future.getDate() + Math.max(7, Math.min(365, Math.ceil(daysToTarget))));
        endDate = future.toISOString().split('T')[0];
      } else {
        const future = new Date(last.date);
        future.setDate(future.getDate() + 90);
        endDate = future.toISOString().split('T')[0];
      }
      out.push({
        ex,
        startDate,
        startValue,
        endDate,
        endValue: target,
        goal: activeGoal,
      });
    }
    return out;
  }, [chartExercises, goalsData, records]);

  // Active goals where the trainee has NO record yet for that
  // exercise — projection line can't draw without a start point, so
  // we fall back to a horizontal target ReferenceLine. Disjoint from
  // `projections` (a goal lands in exactly one of the two arrays).
  const targetOnlyGoals = useMemo(() => {
    if (!Array.isArray(goalsData) || goalsData.length === 0) return [];
    const out = [];
    for (const ex of chartExercises) {
      const activeGoal = findGoalForExercise(goalsData, ex);
      if (!activeGoal) continue;
      const target = parseFloat(activeGoal.target_value);
      if (!Number.isFinite(target)) continue;
      const exNorm = normalizeExerciseName(ex);
      const hasRecord = records.some(
        r => normalizeExerciseName(r.name || r.exercise_name) === exNorm && r.date
      );
      if (hasRecord) continue;
      out.push({ ex, target, goal: activeGoal });
    }
    return out;
  }, [chartExercises, goalsData, records]);

  // Achieved-goal milestones — one ReferenceDot per goal with status
  // 'הושג' that matches a visible exercise via normalised name.
  const milestones = useMemo(() => {
    if (!Array.isArray(goalsData)) return [];
    const visibleNorms = new Set(chartExercises.map(normalizeExerciseName));
    return goalsData
      .filter(g => g.status === GOAL_STATUS.ACHIEVED && g.completed_at)
      .filter(g => visibleNorms.has(normalizeExerciseName(g.exercise_name)))
      .map(g => {
        const exNorm = normalizeExerciseName(g.exercise_name);
        const visibleEx = chartExercises.find(e => normalizeExerciseName(e) === exNorm);
        return {
          ex: visibleEx || g.exercise_name,
          date: fmtDate(g.completed_at),
          _isoDate: String(g.completed_at).split('T')[0],
          value: parseFloat(g.target_value) || 0,
          goal: g,
        };
      })
      .filter(m => Number.isFinite(m.value) && m.value > 0);
  }, [goalsData, chartExercises]);

  // Master chart — one line per exercise (filterable). Each row is a
  // unique date; values come from the matching record on that date.
  // Projection endpoints + achievement dates are folded in so dashed
  // lines and milestone dots have x-axis anchors.
  const masterChartData = useMemo(() => {
    const filterNorm = normalizeExerciseName(filterExercise);
    const filteredRecords = filterExercise === 'all'
      ? records
      : records.filter(r => normalizeExerciseName(r.name || r.exercise_name) === filterNorm);
    const dateSet = new Set(filteredRecords.map(r => r.date).filter(Boolean));
    for (const p of projections) {
      if (p.startDate) dateSet.add(p.startDate);
      if (p.endDate) dateSet.add(p.endDate);
    }
    for (const m of milestones) {
      if (m._isoDate) dateSet.add(m._isoDate);
    }
    const dates = [...dateSet].sort();
    return dates.map(date => {
      const row = { date: fmtDate(date), _isoDate: date };
      chartExercises.forEach(ex => {
        const exNorm = normalizeExerciseName(ex);
        const entry = filteredRecords.find(r =>
          r.date === date && normalizeExerciseName(r.name || r.exercise_name) === exNorm
        );
        if (entry) row[ex] = Number(entry.value) || 0;
        const proj = projections.find(p => p.ex === ex);
        if (proj) {
          if (date === proj.startDate) row[`${ex}__proj`] = proj.startValue;
          else if (date === proj.endDate) row[`${ex}__proj`] = proj.endValue;
        }
      });
      return row;
    });
  }, [records, chartExercises, filterExercise, projections, milestones]);

  const stats = {
    total: records.length,
    exercises: exerciseNames.length,
    personalBests: records.filter(r => r.is_personal_best).length,
  };

  const deleteRecord = async (id) => {
    if (!id) return;
    if (!window.confirm('למחוק שיא זה?')) return;
    const { error } = await supabase
      .from('personal_records')
      .update({ status: 'deleted', deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      toast.error('שגיאה במחיקה: ' + error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['personal-records', traineeId] });
    toast.success('נמחק');
  };

  if (!traineeId) return null;

  // Helper — find the latest goal_progress row for an exercise so we
  // can draw a dashed target line on its chart.
  const linkedGoalFor = (exerciseName) =>
    (goalProgress || [])
      .filter(gp => gp.exercise_name === exerciseName)
      .sort((a, b) => new Date(b.date) - new Date(a.date))[0] || null;

  return (
    <div dir="rtl" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <button
        onClick={() => setShowNewRecord(true)}
        style={{
          width: '100%', padding: 14, borderRadius: 14, border: 'none',
          background: O, color: '#fff', fontSize: 16, fontWeight: 600,
          cursor: 'pointer', marginBottom: 16,
        }}
      >
        🏆 שיא חדש
      </button>

      {records.length === 0 && (
        <div style={{
          padding: 40, textAlign: 'center', color: '#888',
          background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 14,
        }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🏆</div>
          <div style={{ fontSize: 15 }}>עוד אין שיאים</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>שיאים יופיעו כאן אחרי הזנה ראשונה</div>
        </div>
      )}

      {records.length > 0 && (
        // Full-width breakout — escapes the parent's horizontal
        // padding so the chart hits the actual viewport edges on
        // mobile. The negative margin equals half the leftover
        // space, the explicit 100vw width fills it. Inner card keeps
        // a thin 8px gutter so the YAxis ticks aren't flush to the
        // screen edge.
        <div style={{
          marginLeft: 'calc(-50vw + 50%)',
          marginRight: 'calc(-50vw + 50%)',
          width: '100vw',
          paddingLeft: 8,
          paddingRight: 8,
          marginBottom: 16,
        }}>
        <div style={{
          background: CARD_BG, borderRadius: 0,
          borderTop: `1px solid ${BORDER}`,
          borderBottom: `1px solid ${BORDER}`,
          padding: '16px 4px',
          position: 'relative',
        }}>
        {/* Active-goal progress banner — only when a single exercise
            is filtered and that exercise has an active goal. Anchors
            the trainee on starting → current → target. */}
        {filterExercise !== 'all' && (() => {
          const goal = findGoalForExercise(goalsData, filterExercise);
          if (!goal) return null;
          const target = parseFloat(goal.target_value);
          const start = Number(goal.starting_value) || 0;
          if (!Number.isFinite(target)) return null;
          const filterNorm = normalizeExerciseName(filterExercise);
          const exRecs = records.filter(
            r => normalizeExerciseName(r.name || r.exercise_name) === filterNorm
          );
          const current = exRecs.length
            ? Math.max(...exRecs.map(r => Number(r.value) || 0))
            : start;
          const span = Math.max(0, target - start);
          const made = Math.max(0, current - start);
          const pct = span > 0 ? Math.max(0, Math.min(100, (made / span) * 100)) : 0;
          const colorIdx = exerciseNames.indexOf(filterExercise);
          const color = EXERCISE_COLORS[colorIdx >= 0 ? colorIdx % EXERCISE_COLORS.length : 0];
          return (
            <div style={{
              margin: '0 8px 16px',
              padding: 12,
              background: `${color}15`,
              borderRadius: 12,
              border: `1px solid ${color}33`,
            }}>
              <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>{filterExercise}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, height: 8, background: '#F0E4D0', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{
                    width: `${pct}%`, height: '100%', background: color,
                    transition: 'width 0.5s',
                  }} />
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color }}>{Math.round(pct)}%</div>
              </div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                {current} מתוך {target} {goal.target_unit ? goal.target_unit : ''} (התחלת ב-{start})
              </div>
            </div>
          );
        })()}

          {/* Header row — title + minimize button. Button sits on the
              left in RTL (visual top-left) so it never collides with
              the title text. */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 12,
          }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>📊 סקירת שיאים</div>
            <button
              type="button"
              onClick={() => setChartMinimized(m => !m)}
              aria-label={chartMinimized ? 'הצג גרף' : 'מזער גרף'}
              style={{
                width: 28, height: 28, borderRadius: 8,
                border: '1px solid #F0E4D0', background: '#FFFFFF',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#FFF5EE';
                e.currentTarget.style.borderColor = '#FF6F20';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#FFFFFF';
                e.currentTarget.style.borderColor = '#F0E4D0';
              }}
            >
              {chartMinimized
                ? <ChevronDown size={16} color="#555" />
                : <ChevronUp size={16} color="#555" />}
            </button>
          </div>

          {/* Filter chips — flex-wrap so long names render fully on
              their own line instead of being truncated. Each Chip
              keeps whiteSpace:nowrap internally; the row wraps. No
              overflow rules so a long chip never gets clipped. */}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            justifyContent: 'flex-start',
            width: '100%',
            marginBottom: 16,
          }}>
            <Chip
              size="sm"
              selected={filterExercise === 'all'}
              onClick={() => setFilterExercise('all')}
              label="הכל"
            />
            {exerciseNames.map(name => (
              <Chip
                key={name}
                size="sm"
                selected={filterExercise === name}
                onClick={() => setFilterExercise(name)}
                label={name}
              />
            ))}
          </div>

          {chartMinimized ? (
            <div style={{
              padding: '20px 0 8px',
              textAlign: 'center', color: '#888', fontSize: 12,
            }}>
              הגרף ממוזער
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={chartHeight}>
              <LineChart
                data={masterChartData}
                // Tighter margins on mobile so the plot area uses
                // the actual viewport instead of leaving 20px×4
                // unused gutters around it.
                margin={isMobile
                  ? { top: 20, right: 8, left: 8, bottom: 40 }
                  : { top: 20, right: 20, left: 20, bottom: 50 }}
              >
                <CartesianGrid
                  vertical={false}
                  strokeDasharray="3 3"
                  stroke={BORDER}
                />
                {/* reversed flips the time axis to RTL flow (latest on
                    the left, earliest on the right) so it matches the
                    Hebrew reading direction. */}
                <XAxis
                  dataKey="date"
                  reversed
                  tick={{ fontSize: isMobile ? 10 : 11, fill: '#888' }}
                  tickFormatter={shortDateLabel}
                  tickMargin={isMobile ? 4 : 8}
                  minTickGap={20}
                  interval={Math.max(0, Math.ceil(masterChartData.length / 6) - 1)}
                  height={40}
                />
                {/* orientation="right" parks the value axis on the
                    right side of the chart — the side a Hebrew reader
                    expects to see numbers. */}
                <YAxis
                  orientation="right"
                  domain={[0, 'dataMax + 1']}
                  tick={{ fontSize: isMobile ? 10 : 11, fill: '#888' }}
                  width={isMobile ? 32 : 36}
                />
                <Tooltip
                  cursor={{ stroke: '#FF6F20', strokeWidth: 1, strokeDasharray: '3 3' }}
                  wrapperStyle={{ maxWidth: 180 }}
                  contentStyle={{
                    background: '#FFFEFC',
                    border: '1px solid #F5E8D5',
                    borderRadius: 10,
                    padding: '8px 12px',
                    direction: 'rtl',
                    fontFamily: "'Barlow', 'Heebo', 'Assistant', sans-serif",
                    fontSize: isMobile ? 11 : 13,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  }}
                  labelStyle={{ color: '#888', marginBottom: 4 }}
                  itemStyle={{ color: '#1A1A1A' }}
                />
                {chartExercises.length > 1 && (
                  <Legend
                    content={<CustomLegend />}
                    wrapperStyle={{ paddingTop: 12 }}
                    verticalAlign="bottom"
                  />
                )}
                {chartExercises.map((ex, i) => {
                  const color = EXERCISE_COLORS[i % EXERCISE_COLORS.length];
                  return (
                    <Line
                      key={ex}
                      type="monotone"
                      dataKey={ex}
                      name={ex}
                      stroke={color}
                      strokeWidth={2.5}
                      connectNulls
                      dot={(props) => {
                        const { cx, cy, payload, index } = props;
                        const record = records.find(r =>
                          r.date === payload._isoDate &&
                          (r.name || r.exercise_name) === ex
                        );
                        const isPB = !!record?.is_personal_best;
                        return (
                          <circle
                            key={`${ex}-${index}`}
                            cx={cx} cy={cy}
                            r={isPB ? 6 : 4}
                            fill={isPB ? color : '#FFFFFF'}
                            stroke={color}
                            strokeWidth={1.5}
                          />
                        );
                      }}
                      activeDot={{
                        r: 6, fill: color, stroke: 'white', strokeWidth: 2, cursor: 'pointer',
                        onClick: (_, payload) => {
                          if (!payload) return;
                          setSelectedPoint({
                            exerciseName: ex,
                            color,
                            date: payload.payload?.date,
                            isoDate: payload.payload?._isoDate,
                            value: payload.value ?? payload.payload?.[ex],
                          });
                        },
                      }}
                    />
                  );
                })}
                {/* Dashed projection lines — current PB → target value
                    at target_date (or slope-based fallback). Hidden
                    from the legend so it doesn't double the entries. */}
                {projections.map((p) => {
                  const i = chartExercises.indexOf(p.ex);
                  const color = EXERCISE_COLORS[i % EXERCISE_COLORS.length];
                  return (
                    <Line
                      key={`${p.ex}__proj`}
                      type="linear"
                      dataKey={`${p.ex}__proj`}
                      name={`${p.ex} (תחזית ליעד)`}
                      stroke={color}
                      strokeWidth={1.8}
                      strokeDasharray="6 4"
                      dot={false}
                      activeDot={false}
                      connectNulls
                      legendType="none"
                    />
                  );
                })}
                {/* Horizontal target lines — per visible exercise,
                    one faint dotted guide at the active goal's
                    target_value. */}
                {projections.map((p) => {
                  const i = chartExercises.indexOf(p.ex);
                  const color = EXERCISE_COLORS[i % EXERCISE_COLORS.length];
                  return (
                    <ReferenceLine
                      key={`${p.ex}__target`}
                      y={p.endValue}
                      stroke={color}
                      strokeDasharray="2 4"
                      strokeOpacity={0.5}
                      label={{
                        value: `יעד ${p.ex}: ${p.endValue}`,
                        position: 'left', fill: color, fontSize: 10,
                      }}
                    />
                  );
                })}
                {/* Target-only goals — exercise has an active goal but
                    no records yet. We can't draw a slope, so we draw a
                    bolder dashed horizontal at the target so the
                    trainee still sees what they're chasing. */}
                {targetOnlyGoals.map((g) => {
                  const i = chartExercises.indexOf(g.ex);
                  const color = EXERCISE_COLORS[i >= 0 ? i % EXERCISE_COLORS.length : 0];
                  return (
                    <ReferenceLine
                      key={`${g.ex}__target_only`}
                      y={g.target}
                      stroke={color}
                      strokeDasharray="6 4"
                      strokeWidth={1.8}
                      strokeOpacity={0.8}
                      label={{
                        value: `יעד ${g.ex}: ${g.target}`,
                        position: 'left', fill: color, fontSize: 10,
                      }}
                    />
                  );
                })}
                {/* Achieved-goal flag dots — one per past achievement
                    placed at completed_at / target_value. */}
                {milestones.map((m, idx) => {
                  const i = chartExercises.indexOf(m.ex);
                  const color = EXERCISE_COLORS[i % EXERCISE_COLORS.length];
                  return (
                    <ReferenceDot
                      key={`milestone-${m.ex}-${idx}`}
                      x={m.date}
                      y={m.value}
                      r={8}
                      fill="#FFFFFF"
                      stroke={color}
                      strokeWidth={2}
                      label={{
                        value: '🏁',
                        position: 'top',
                        fontSize: 14,
                      }}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          )}

          {/* Stats row — three full-width cards under the chart. */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 8,
            margin: '16px 8px 0',
          }}>
            {[
              { val: stats.total, label: 'שיאים' },
              { val: stats.exercises, label: 'תרגילים' },
              { val: stats.personalBests, label: 'שיאים אישיים' },
            ].map((s, i) => (
              <div
                key={i}
                style={{
                  borderRadius: 12,
                  border: `1px solid ${BORDER}`,
                  padding: 12,
                  background: '#FFFFFF',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 24, fontWeight: 700, color: O }}>{s.val}</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Pinned point panel — shows up after a tap on a dot.
              Mobile-friendly: stays put until the trainee dismisses
              it. Hidden when nothing's selected. */}
          {selectedPoint && (
            <div style={{
              margin: '12px 8px 0',
              padding: 12,
              background: '#FFF8F2',
              borderRadius: 10,
              border: `1px solid ${selectedPoint.color || BORDER}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
            }}>
              <div>
                <div style={{ fontSize: 12, color: '#888' }}>{selectedPoint.date}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#1A1A1A' }}>
                  {selectedPoint.exerciseName}: {selectedPoint.value}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPoint(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#888',
                  fontSize: 20,
                  cursor: 'pointer',
                  padding: '4px 8px',
                }}
                aria-label="סגור"
              >×</button>
            </div>
          )}
        </div>
        </div>
      )}

      {/* Per-day folder view — sits between the master chart and
          the per-exercise folders. Mirrors the chip filter so a
          single tap on a chip narrows BOTH visualisations. Coach
          and self-trainee both get edit-on-click; read-only viewers
          (no isCoach flag and not the trainee themselves) just see
          the row without the cursor changing. */}
      {records.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
            padding: '0 4px',
          }}>
            <h3 style={{
              fontSize: 18, fontWeight: 700, margin: 0,
              fontFamily: "'Barlow Condensed', 'Heebo', 'Assistant', sans-serif",
            }}>
              היסטוריית שיאים
            </h3>
            <span style={{ fontSize: 12, color: '#888' }}>
              {records.length} שיאים סה״כ
            </span>
          </div>
          <RecordsByDay
            records={(() => {
              if (filterExercise === 'all') return records;
              const filterNorm = normalizeExerciseName(filterExercise);
              return records.filter(
                r => normalizeExerciseName(r.name || r.exercise_name) === filterNorm
              );
            })()}
            exerciseNames={exerciseNames}
            colors={EXERCISE_COLORS}
            onRecordClick={isCoach ? (rec) => setEditingRecord(rec) : undefined}
          />
        </section>
      )}

      {/* Per-exercise folders — inline expandable */}
      {folders.map(folder => {
        const { name, records: recs, best, latest } = folder;
        const isOpen = openRecordFolder === name;
        const colorIndex = exerciseNames.indexOf(name);
        const color = EXERCISE_COLORS[colorIndex % EXERCISE_COLORS.length];
        const info = exerciseInfoFor(name);
        const linkedGoal = linkedGoalFor(name);
        return (
          <div key={name} style={{
            background: CARD_BG, borderRadius: 14, border: `1px solid ${BORDER}`,
            marginBottom: 10, overflow: 'hidden',
          }}>
            <div
              onClick={() => setOpenRecordFolder(isOpen ? null : name)}
              style={{
                padding: 14, cursor: 'pointer',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <span style={{ fontSize: 22 }}>{info?.icon || '🎯'}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontSize: 15, fontWeight: 600,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {name}
                  </div>
                  <div style={{ fontSize: 12, color: '#888' }}>
                    {recs.length} שיאים · אחרון: {fmtDate(latest?.date)}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                {best?.is_personal_best && <span style={{ fontSize: 16 }}>🏆</span>}
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color }}>{best?.value ?? '—'}</div>
                  <div style={{ fontSize: 10, color: '#888' }}>{unitLabel(best?.unit)}</div>
                </div>
                <span style={{
                  fontSize: 14, color: '#888',
                  display: 'inline-block',
                  transition: 'transform 0.2s',
                  transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                }}>▼</span>
              </div>
            </div>

            {isOpen && (
              <div style={{ padding: '0 14px 14px', borderTop: `1px solid ${BORDER}` }}>
                <div style={{ marginTop: 12, marginBottom: 12 }}>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart
                      data={recs.map(r => ({
                        date: fmtDate(r.date),
                        value: Number(r.value) || 0,
                        pb: !!r.is_personal_best,
                      }))}
                      margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#888' }} />
                      <YAxis domain={[0, 'auto']} tick={{ fontSize: 11, fill: '#888' }} />
                      <Tooltip contentStyle={{
                        borderRadius: 12, border: `1px solid ${BORDER}`,
                        background: '#fff', fontSize: 12, direction: 'rtl',
                      }} />
                      <Line
                        type="monotone"
                        dataKey="value"
                        name={name}
                        stroke={color}
                        strokeWidth={2.5}
                        dot={(props) => {
                          const { cx, cy, payload, index } = props;
                          const isPB = !!payload?.pb;
                          return (
                            <circle
                              key={`${name}-${index}`}
                              cx={cx} cy={cy} r={isPB ? 8 : 5}
                              fill={isPB ? color : 'white'}
                              stroke={color} strokeWidth={2}
                            />
                          );
                        }}
                        activeDot={{ r: 8, fill: color, stroke: 'white', strokeWidth: 2 }}
                      />
                      {linkedGoal?.target_value && (
                        <ReferenceLine
                          y={Number(linkedGoal.target_value)}
                          stroke="#1D9E75"
                          strokeDasharray="5 5"
                          label={{
                            value: `יעד: ${linkedGoal.target_value}`,
                            position: 'right', fill: '#1D9E75', fontSize: 11,
                          }}
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {linkedGoal && (
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 12px', background: '#E8F5E9', borderRadius: 10,
                    marginBottom: 10, fontSize: 13,
                  }}>
                    <span>🎯 יעד: {linkedGoal.goal_name || linkedGoal.exercise_name}</span>
                    <span style={{
                      fontWeight: 600,
                      color: Number(linkedGoal.progress) >= 100 ? '#1D9E75' : '#FF6F20',
                    }}>
                      {linkedGoal.progress != null ? `${linkedGoal.progress}%` : '—'}
                    </span>
                  </div>
                )}

                {[...recs].reverse().map((r, idx, arr) => (
                  <div
                    key={r.id}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '8px 0',
                      borderBottom: idx < arr.length - 1 ? `1px solid ${BORDER}` : 'none',
                      fontSize: 13, gap: 10,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div>{fmtDate(r.date)}</div>
                      {r.notes && (
                        <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                          {r.notes}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      {r.rpe && <span style={{ fontSize: 11, color: '#888' }}>RPE {r.rpe}</span>}
                      {Number(r.improvement) > 0 && (
                        <span style={{
                          fontSize: 11, color: '#1D9E75',
                          background: '#E8F5E9', padding: '2px 6px', borderRadius: 8,
                        }}>
                          +{r.improvement}
                        </span>
                      )}
                      {r.is_personal_best && <span>🏆</span>}
                      <span style={{
                        fontWeight: 700,
                        color: r.is_personal_best ? color : '#1A1A1A',
                      }}>
                        {r.value} <span style={{ fontSize: 11, fontWeight: 500 }}>{unitLabel(r.unit)}</span>
                      </span>
                      {isCoach && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingRecord(r); }}
                          style={{
                            background: 'none', border: 'none', color: O,
                            fontSize: 13, cursor: 'pointer', padding: 0,
                          }}
                          aria-label="ערוך שיא"
                        >✏️</button>
                      )}
                      {isCoach && (
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteRecord(r.id); }}
                          style={{
                            background: 'none', border: 'none', color: '#C62828',
                            fontSize: 13, cursor: 'pointer', padding: 0,
                          }}
                          aria-label="מחק שיא"
                        >🗑</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <NewRecordDialog
        isOpen={showNewRecord}
        onClose={() => setShowNewRecord(false)}
        traineeId={traineeId}
        coachId={isCoach ? currentUser?.id : null}
        currentUserId={currentUser?.id}
        isCoach={isCoach}
        onAchievement={setAchievement}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['personal-records', traineeId] });
          queryClient.invalidateQueries({ queryKey: ['goals', traineeId] });
          queryClient.invalidateQueries({ queryKey: ['goal-progress', traineeId] });
        }}
      />

      {/* Coach edit-record dialog — same NewRecordDialog component
          but with editData prefilled, switching it to UPDATE mode. */}
      <NewRecordDialog
        isOpen={!!editingRecord}
        onClose={() => setEditingRecord(null)}
        traineeId={traineeId}
        coachId={isCoach ? currentUser?.id : null}
        currentUserId={currentUser?.id}
        isCoach={isCoach}
        editData={editingRecord}
        onAchievement={setAchievement}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['personal-records', traineeId] });
          queryClient.invalidateQueries({ queryKey: ['goals', traineeId] });
          queryClient.invalidateQueries({ queryKey: ['goal-progress', traineeId] });
          setEditingRecord(null);
        }}
      />

      {/* Goal-achieved celebration — fired from NewRecordDialog when
          the saved record value crosses the active goal's target. The
          "set new goal" CTA bubbles up to the parent profile via a
          window event so the goals tab can open its form prefilled. */}
      {achievement && (
        <GoalAchievedPopup
          goal={achievement.goal}
          achievedValue={achievement.value}
          exerciseName={achievement.exerciseName}
          onClose={() => setAchievement(null)}
          onSetNewGoal={() => {
            try {
              window.dispatchEvent(new CustomEvent('athletigo:open-goal-form', {
                detail: {
                  traineeId,
                  exerciseName: achievement.exerciseName,
                  startingValue: achievement.value,
                },
              }));
            } catch {}
            setAchievement(null);
          }}
        />
      )}
    </div>
  );
}
