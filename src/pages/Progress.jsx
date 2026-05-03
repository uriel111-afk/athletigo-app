import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabaseClient";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  AreaChart, Area, ReferenceLine, Cell,
} from "recharts";
import PageLoader from "@/components/PageLoader";
import PermGate from "@/components/PermGate";
import FullscreenChart from "@/components/FullscreenChart";
import GoalsOverviewChart from "@/components/charts/GoalsOverviewChart";

// Visual progress dashboard for the trainee.
// 4 stat cards on top → baseline JPS chart → personal records bar →
// weight line → goals radar → monthly sessions bar. Read-only;
// adding/editing happens in TraineeProfile (coach) or via the
// dedicated CTAs on TraineeHome (trainee).

function ProgressInner() {
  const [trainee, setTrainee] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await base44.auth.me();
        if (!cancelled) setTrainee(me);
      } catch (e) {
        console.warn('[Progress] auth.me failed:', e?.message);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const traineeId = trainee?.id;

  const { data: baselines } = useQuery({
    queryKey: ['progress-baselines', traineeId],
    enabled: !!traineeId,
    queryFn: async () => {
      const { data } = await supabase.from('baselines')
        .select('*').eq('trainee_id', traineeId).order('date', { ascending: true });
      return data || [];
    },
  });

  const { data: records } = useQuery({
    queryKey: ['progress-records', traineeId],
    enabled: !!traineeId,
    queryFn: async () => {
      const { data } = await supabase.from('personal_records')
        .select('*').eq('trainee_id', traineeId)
        .or('status.is.null,status.neq.deleted')
        .order('date', { ascending: true });
      return data || [];
    },
  });

  const { data: measurements } = useQuery({
    queryKey: ['progress-measurements', traineeId],
    enabled: !!traineeId,
    queryFn: async () => {
      const { data } = await supabase.from('measurements')
        .select('*').eq('trainee_id', traineeId).order('date', { ascending: true });
      return data || [];
    },
  });

  const { data: goalProgress } = useQuery({
    queryKey: ['progress-goals', traineeId],
    enabled: !!traineeId,
    queryFn: async () => {
      const { data } = await supabase.from('goal_progress')
        .select('*').eq('trainee_id', traineeId).order('date', { ascending: true });
      return data || [];
    },
  });

  const { data: sessions } = useQuery({
    queryKey: ['progress-sessions', traineeId],
    enabled: !!traineeId,
    queryFn: async () => {
      const { data } = await supabase.from('sessions')
        .select('*').eq('trainee_id', traineeId)
        .neq('status', 'deleted')
        .order('date', { ascending: true });
      return data || [];
    },
  });

  // workout_executions powers the new dashboard top section: summary
  // cards, improvement area chart, weekly attendance bars.
  const { data: executions } = useQuery({
    queryKey: ['progress-executions', traineeId],
    enabled: !!traineeId,
    queryFn: async () => {
      const { data } = await supabase.from('workout_executions')
        .select('*')
        .eq('trainee_id', traineeId)
        .order('executed_at', { ascending: true });
      return data || [];
    },
  });

  const [scoreFullscreen, setScoreFullscreen] = useState(false);
  const [weeklyFullscreen, setWeeklyFullscreen] = useState(false);

  const isLoading = !trainee || !baselines || !records || !measurements || !goalProgress || !sessions || !executions;
  if (isLoading) return <PageLoader fullHeight />;

  // ── Stat cards ───────────────────────────────────────────────
  const completedSessions = (sessions || []).filter(s =>
    s.status === 'completed' || s.status === 'התקיים' || s.status === 'הושלם'
  );
  const totalSessions = completedSessions.length;
  const totalRecords = records?.length || 0;
  const personalBests = records?.filter(r => r.is_personal_best).length || 0;

  const baselinesArr = baselines || [];
  const latestJPS = baselinesArr.length
    ? Number(baselinesArr[baselinesArr.length - 1].jps ?? baselinesArr[baselinesArr.length - 1].score ?? 0)
    : null;
  const firstJPS = baselinesArr.length
    ? Number(baselinesArr[0].jps ?? baselinesArr[0].score ?? 0)
    : null;
  const jpsImprovement = (latestJPS != null && firstJPS != null && firstJPS > 0)
    ? Math.round(((latestJPS - firstJPS) / firstJPS) * 100)
    : null;

  const stats = [
    { label: 'אימונים',        value: totalSessions, icon: '🏋️', color: '#FF6F20' },
    { label: 'שיאים אישיים',    value: personalBests, icon: '🏆', color: '#1D9E75' },
    { label: 'שיאים מתועדים',   value: totalRecords,  icon: '📊', color: '#D85A30' },
    { label: 'שיפור JPS',       value: jpsImprovement != null ? `${jpsImprovement}%` : '—', icon: '📈', color: '#1565C0' },
  ];

  // ── Baseline JPS chart — one line per technique ─────────────
  // Sessions bucketed by created_at within a 120s window so a
  // multi-technique save becomes ONE point. Legacy rows missing
  // created_at fall back to `date + id`. Tech name + score read
  // through fallbacks (technique / tab_name / name; baseline_score /
  // jps / score) so old rows still chart correctly.
  const TECH_COLORS = ['#FF6F20', '#1D9E75', '#D85A30', '#1565C0', '#9C27B0'];
  const TECH_LABELS = { basic: 'Basic', foot_switch: 'Foot Switch', high_knees: 'High Knees', criss: 'Criss-Cross' };
  const techOf = (b) => b.technique || b.tab_name || b.name || 'basic';
  const jpsOf = (b) => Number(b.baseline_score ?? b.jps ?? b.score ?? 0);
  const techNames = [...new Set(baselinesArr.map(techOf))];
  const baselineSessions = [];
  const sortable = [...baselinesArr].sort((a, b) =>
    new Date(a.created_at || a.date || 0) - new Date(b.created_at || b.date || 0)
  );
  for (const b of sortable) {
    const stamp = b.created_at || b.date || b.id || new Date().toISOString();
    const ts = new Date(stamp);
    const tsValid = !Number.isNaN(ts.getTime());
    const found = tsValid
      ? baselineSessions.find(s => Math.abs(new Date(s.created_at) - ts) < 120000)
      : null;
    if (found) {
      found.techniques.push(b);
    } else {
      const safeTs = tsValid ? ts : new Date();
      baselineSessions.push({
        key: stamp,
        date: b.date || safeTs.toISOString().split('T')[0],
        time: tsValid
          ? safeTs.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
          : '',
        created_at: stamp,
        techniques: [b],
      });
    }
  }
  console.log('[Progress] baselines:', baselinesArr.length, 'rows → grouped:', baselineSessions.length, 'sessions',
    '· techniques:', techNames);
  const baselineData = baselineSessions.map(s => {
    const row = {
      date: s.time
        ? `${new Date(s.date).toLocaleDateString('he-IL')} ${s.time}`
        : new Date(s.date).toLocaleDateString('he-IL'),
    };
    techNames.forEach(tech => {
      const entry = s.techniques.find(t => techOf(t) === tech);
      const label = TECH_LABELS[tech] || tech;
      row[label] = entry ? jpsOf(entry) : null;
    });
    return row;
  });

  // ── Records bar (latest record per exercise) ─────────────────
  const latestRecordPerExercise = {};
  (records || []).forEach(r => {
    const name = r.name || r.exercise_name || 'כללי';
    const cur = latestRecordPerExercise[name];
    if (!cur || new Date(r.date) > new Date(cur.date)) {
      latestRecordPerExercise[name] = r;
    }
  });
  const barData = Object.entries(latestRecordPerExercise).map(([name, r]) => ({
    name: name.length > 10 ? name.substring(0, 10) + '...' : name,
    value: Number(r.value) || 0,
    fullName: name,
  })).filter(d => d.value > 0);

  // ── Weight chart — fall back to onboarding height/weight ────
  const allMeasurements = [...(measurements || [])];
  if (allMeasurements.length === 0 && (trainee?.height_cm || trainee?.weight_kg)) {
    allMeasurements.unshift({
      id: 'onboarding',
      date: trainee.onboarding_completed_at || trainee.created_at,
      weight_kg: trainee.weight_kg,
      height_cm: trainee.height_cm,
    });
  }
  const weightData = allMeasurements
    .filter(m => m.weight_kg || m.weight)
    .map(m => ({
      date: new Date(m.date || m.created_at).toLocaleDateString('he-IL'),
      weight: Number(m.weight_kg ?? m.weight),
    }));

  // ── Goals radar ──────────────────────────────────────────────
  let goals = [];
  if (trainee?.training_goals) {
    if (typeof trainee.training_goals === 'string') {
      try { goals = JSON.parse(trainee.training_goals); } catch { goals = []; }
    } else if (Array.isArray(trainee.training_goals)) {
      goals = trainee.training_goals;
    }
  }
  const radarData = goals.map(goal => {
    const latest = (goalProgress || [])
      .filter(gp => gp.goal_name === goal)
      .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    return {
      goal: goal.length > 10 ? goal.substring(0, 10) + '...' : goal,
      progress: Number(latest?.progress) || 0,
    };
  }).slice(0, 8);

  // ── Sessions per month ───────────────────────────────────────
  const sessionsByMonth = {};
  completedSessions.forEach(s => {
    if (!s.date) return;
    const d = new Date(s.date);
    if (Number.isNaN(d.getTime())) return;
    const key = d.toLocaleDateString('he-IL', { year: 'numeric', month: 'short' });
    sessionsByMonth[key] = (sessionsByMonth[key] || 0) + 1;
  });
  const monthlyData = Object.entries(sessionsByMonth).map(([month, count]) => ({ month, count }));

  // ── Workout dashboard (new) ─────────────────────────────────
  // All four datasets derive from workout_executions. Skipped
  // gracefully when the trainee has no executions yet.
  const execList = (executions || []).filter((e) => e.executed_at);
  const lastExec = execList.length > 0 ? execList[execList.length - 1] : null;
  const prevExec = execList.length > 1 ? execList[execList.length - 2] : null;
  const lastScore = lastExec?.self_rating != null ? Number(lastExec.self_rating) : null;
  const prevScore = prevExec?.self_rating != null ? Number(prevExec.self_rating) : null;
  const trend = (lastScore != null && prevScore != null) ? (lastScore - prevScore) : 0;

  // Streak — consecutive days going back from today with at least
  // one execution. Uses local-date strings (YYYY-MM-DD) keyed off
  // executed_at to dodge timezone slop.
  const dayKey = (d) => {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return null;
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  };
  const execDays = new Set(execList.map((e) => dayKey(e.executed_at)).filter(Boolean));
  let streak = 0;
  {
    const cursor = new Date();
    while (execDays.has(dayKey(cursor))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
  }

  // Current week (Sunday start). Anchor: most recent Sunday at 00:00.
  const weekAnchor = (() => {
    const a = new Date();
    a.setHours(0, 0, 0, 0);
    a.setDate(a.getDate() - a.getDay()); // Sunday
    return a;
  })();
  const weekCount = execList.filter((e) => {
    const t = new Date(e.executed_at).getTime();
    return Number.isFinite(t) && t >= weekAnchor.getTime();
  }).length;

  const scoreData = execList
    .filter((e) => e.self_rating != null)
    .map((e) => ({
      date: new Date(e.executed_at).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' }),
      rating: Number(e.self_rating),
    }));

  // Last 8 weeks of attendance, oldest→newest. Each bucket counts
  // executions whose week-anchor matches.
  const weeklyData = (() => {
    const buckets = [];
    for (let i = 7; i >= 0; i -= 1) {
      const start = new Date(weekAnchor);
      start.setDate(start.getDate() - i * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      const count = execList.filter((e) => {
        const t = new Date(e.executed_at).getTime();
        return t >= start.getTime() && t < end.getTime();
      }).length;
      const label = start.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
      buckets.push({ week: label, count });
    }
    return buckets;
  })();

  const goalsForChart = radarData.map((g) => ({
    title: g.goal,
    progress: g.progress,
  }));

  const hasDashboardData = execList.length > 0;

  // ── Empty state ──────────────────────────────────────────────
  const noData = baselineData.length === 0
    && barData.length === 0
    && weightData.length === 0
    && totalSessions === 0
    && !hasDashboardData;

  const card = {
    background: 'white',
    borderRadius: 14,
    border: '1px solid #F0E4D0',
    padding: 16,
    marginBottom: 16,
    direction: 'rtl',
  };
  const tooltipStyle = {
    borderRadius: 12,
    border: '1px solid #F0E4D0',
    background: '#fff',
    fontSize: 12,
    direction: 'rtl',
  };

  return (
    <div dir="rtl" style={{
      minHeight: '100vh',
      background: '#FDF8F3',
      paddingBottom: 100,
      fontFamily: "'Heebo', 'Assistant', sans-serif",
    }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: 16 }}>
        {/* Page heading */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#1A1A1A' }}>
            📈 ההתקדמות שלי
          </div>
          <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>
            סקירה ויזואלית של כל המסע שלך
          </div>
        </div>

        {noData ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>עוד אין נתוני התקדמות</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>הנתונים יופיעו כאן אחרי האימון הראשון</div>
          </div>
        ) : (
          <>
            {/* ── New workout dashboard (top) ─────────────────────── */}
            {hasDashboardData && (
              <>
                {/* Summary cards row */}
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 10, marginBottom: 16,
                }}>
                  <div style={{
                    background: '#FF6F20', borderRadius: 14, padding: '14px 10px',
                    textAlign: 'center', color: 'white',
                  }}>
                    <div style={{ fontSize: 11, opacity: 0.85, marginBottom: 4 }}>ציון אחרון</div>
                    <div style={{ fontSize: 36, fontWeight: 900, lineHeight: 1 }}>
                      {lastScore != null ? lastScore.toFixed(1) : '—'}
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.8 }}>מתוך 10</div>
                  </div>
                  <div style={{
                    background: 'white', border: '1px solid #F0E4D0',
                    borderRadius: 14, padding: '14px 10px', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>רצף ימים</div>
                    <div style={{ fontSize: 36, fontWeight: 900, color: '#1a1a1a', lineHeight: 1 }}>
                      {streak}
                    </div>
                    <div style={{ fontSize: 11, color: '#888' }}>ימים</div>
                  </div>
                  <div style={{
                    background: 'white', border: '1px solid #F0E4D0',
                    borderRadius: 14, padding: '14px 10px', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>השבוע</div>
                    <div style={{ fontSize: 36, fontWeight: 900, color: '#FF6F20', lineHeight: 1 }}>
                      {weekCount}
                    </div>
                    <div style={{ fontSize: 11, color: '#888' }}>אימונים</div>
                  </div>
                </div>

                {/* Improvement area chart — tap to fullscreen */}
                {scoreData.length > 0 && (
                  <>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setScoreFullscreen(true)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setScoreFullscreen(true); }}
                      style={{
                        background: 'white', border: '1px solid #F0E4D0',
                        borderRadius: 16, padding: 16, marginBottom: 16,
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{
                        display: 'flex', justifyContent: 'space-between',
                        alignItems: 'center', marginBottom: 12,
                      }}>
                        <div style={{ fontSize: 15, fontWeight: 700 }}>גרף שיפור</div>
                        <div>
                          <span style={{ fontSize: 32, fontWeight: 900, color: '#FF6F20' }}>
                            {lastScore != null ? lastScore.toFixed(1) : '—'}
                          </span>
                          <span style={{ fontSize: 12, color: '#888' }}>/10</span>
                        </div>
                      </div>
                      {trend !== 0 && (
                        <div style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '3px 10px', borderRadius: 999, marginBottom: 10,
                          background: trend > 0 ? '#ECFDF5' : '#FEF2F2',
                          color: trend > 0 ? '#059669' : '#DC2626',
                          fontSize: 12, fontWeight: 600,
                        }}>
                          {trend > 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(1)} מהאימון הקודם
                        </div>
                      )}
                      <ResponsiveContainer width="100%" height={180}>
                        <AreaChart data={scoreData}>
                          <defs>
                            <linearGradient id="progressScoreGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#FF6F20" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#FF6F20" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#F5E6D8" vertical={false} />
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#aaa' }} axisLine={false} tickLine={false} />
                          <YAxis domain={[0, 10]} tick={{ fontSize: 10, fill: '#aaa' }} axisLine={false} tickLine={false} ticks={[0, 5, 10]} />
                          <Tooltip
                            contentStyle={{ background: '#1a1a1a', border: 'none', borderRadius: 10, color: 'white', fontSize: 12 }}
                            formatter={(v) => [`${Number(v).toFixed(1)}/10`, 'ציון']}
                          />
                          <ReferenceLine y={5} stroke="#E5E7EB" strokeDasharray="4 4" />
                          <Area
                            type="monotone" dataKey="rating"
                            stroke="#FF6F20" strokeWidth={3}
                            fill="url(#progressScoreGrad)"
                            dot={{ fill: '#FF6F20', r: 5, stroke: 'white', strokeWidth: 2 }}
                            activeDot={{ r: 8, fill: '#FF6F20' }}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                    <FullscreenChart
                      isOpen={scoreFullscreen}
                      onClose={() => setScoreFullscreen(false)}
                      title="גרף שיפור"
                    >
                      <ResponsiveContainer width="100%" height={340}>
                        <AreaChart data={scoreData}>
                          <defs>
                            <linearGradient id="progressScoreGradFs" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#FF6F20" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#FF6F20" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#F5E6D8" vertical={false} />
                          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#aaa' }} axisLine={false} tickLine={false} />
                          <YAxis domain={[0, 10]} tick={{ fontSize: 11, fill: '#aaa' }} axisLine={false} tickLine={false} ticks={[0, 2, 4, 6, 8, 10]} />
                          <Tooltip
                            contentStyle={{ background: '#1a1a1a', border: 'none', borderRadius: 10, color: 'white', fontSize: 12 }}
                            formatter={(v) => [`${Number(v).toFixed(1)}/10`, 'ציון']}
                          />
                          <ReferenceLine y={5} stroke="#E5E7EB" strokeDasharray="4 4" />
                          <Area
                            type="monotone" dataKey="rating"
                            stroke="#FF6F20" strokeWidth={3}
                            fill="url(#progressScoreGradFs)"
                            dot={{ fill: '#FF6F20', r: 5, stroke: 'white', strokeWidth: 2 }}
                            activeDot={{ r: 8, fill: '#FF6F20' }}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </FullscreenChart>
                  </>
                )}

                {/* Goals overview — reuses the existing component */}
                {goalsForChart.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <GoalsOverviewChart goals={goalsForChart} />
                  </div>
                )}

                {/* Weekly attendance bars (last 8 weeks) */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setWeeklyFullscreen(true)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setWeeklyFullscreen(true); }}
                  style={{
                    background: 'white', border: '1px solid #F0E4D0',
                    borderRadius: 16, padding: 16, marginBottom: 16,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', marginBottom: 12,
                  }}>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>נוכחות שבועית</div>
                    <div style={{ fontSize: 12, color: '#888' }}>8 שבועות אחרונים</div>
                  </div>
                  <ResponsiveContainer width="100%" height={130}>
                    <BarChart data={weeklyData}>
                      <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#aaa' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#aaa' }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ background: '#1a1a1a', border: 'none', borderRadius: 10, color: 'white', fontSize: 12 }}
                        formatter={(v) => [v, 'אימונים']}
                      />
                      <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                        {weeklyData.map((entry, i) => (
                          <Cell
                            key={i}
                            fill={i === weeklyData.length - 1 ? '#FF6F20' : 'rgba(255,111,32,0.25)'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <FullscreenChart
                  isOpen={weeklyFullscreen}
                  onClose={() => setWeeklyFullscreen(false)}
                  title="נוכחות שבועית"
                >
                  <ResponsiveContainer width="100%" height={340}>
                    <BarChart data={weeklyData}>
                      <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#aaa' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#aaa' }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ background: '#1a1a1a', border: 'none', borderRadius: 10, color: 'white', fontSize: 12 }}
                        formatter={(v) => [v, 'אימונים']}
                      />
                      <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                        {weeklyData.map((entry, i) => (
                          <Cell
                            key={i}
                            fill={i === weeklyData.length - 1 ? '#FF6F20' : 'rgba(255,111,32,0.25)'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </FullscreenChart>
              </>
            )}

            {/* Stat cards */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr',
              gap: 10, marginBottom: 20,
            }}>
              {stats.map((s, i) => (
                <div key={i} style={{
                  background: 'white', borderRadius: 14,
                  border: '1px solid #F0E4D0',
                  padding: 16, textAlign: 'center',
                }}>
                  <div style={{ fontSize: 24, marginBottom: 4 }}>{s.icon}</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 12, color: '#888' }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Baseline JPS line chart — one line per technique */}
            {baselineData.length > 0 && techNames.length > 0 && (
              <div style={card}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>
                  📈 התקדמות JPS לפי טכניקה
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={baselineData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0E4D0" />
                    <XAxis dataKey="date" fontSize={11} />
                    <YAxis domain={[0, 'auto']} fontSize={11} />
                    <Tooltip contentStyle={tooltipStyle} />
                    {techNames.map((tech, i) => {
                      const label = TECH_LABELS[tech] || tech;
                      const color = TECH_COLORS[i % TECH_COLORS.length];
                      return (
                        <Line key={tech} type="monotone" dataKey={label} name={label}
                          stroke={color} strokeWidth={2.5} connectNulls
                          dot={{ r: 5, fill: color, stroke: 'white', strokeWidth: 2 }}
                          activeDot={{ r: 7, fill: color, stroke: 'white', strokeWidth: 2 }} />
                      );
                    })}
                  </LineChart>
                </ResponsiveContainer>
                <div style={{
                  display: 'flex', justifyContent: 'center', gap: 16,
                  marginTop: 8, fontSize: 12, color: '#1A1A1A', flexWrap: 'wrap',
                }}>
                  {techNames.map((tech, i) => {
                    const label = TECH_LABELS[tech] || tech;
                    const color = TECH_COLORS[i % TECH_COLORS.length];
                    return (
                      <span key={tech}><span style={{ color }}>●</span> {label}</span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Records bar chart */}
            {barData.length > 0 && (
              <div style={card}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>
                  🏆 שיאים אישיים
                </div>
                <ResponsiveContainer width="100%" height={Math.max(200, barData.length * 36)}>
                  <BarChart data={barData} layout="vertical" margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0E4D0" />
                    <XAxis type="number" fontSize={11} />
                    <YAxis type="category" dataKey="name" fontSize={11} width={90} />
                    <Tooltip contentStyle={tooltipStyle}
                      formatter={(value, _name, ctx) => [value, ctx?.payload?.fullName || 'שיא']} />
                    <Bar dataKey="value" fill="#FF6F20" radius={[0, 6, 6, 0]} barSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Weight line chart */}
            {weightData.length > 0 && (
              <div style={card}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>
                  ⚖️ מעקב משקל
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={weightData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0E4D0" />
                    <XAxis dataKey="date" fontSize={11} />
                    <YAxis domain={['auto', 'auto']} fontSize={11} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Line type="monotone" dataKey="weight" name="משקל (ק״ג)"
                      stroke="#FF6F20" strokeWidth={2.5}
                      dot={{ r: 5, fill: '#FF6F20', stroke: 'white', strokeWidth: 2 }}
                      activeDot={{ r: 7, fill: '#FF6F20', stroke: 'white', strokeWidth: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Goals radar */}
            {radarData.length >= 3 && (
              <div style={card}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>
                  🎯 יעדים
                </div>
                <ResponsiveContainer width="100%" height={230}>
                  <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="65%">
                    <PolarGrid stroke="#F0E4D0" />
                    <PolarAngleAxis dataKey="goal" fontSize={9} tick={{ fontSize: 9, fill: '#1A1A1A' }} />
                    <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#888' }} />
                    <Radar dataKey="progress" stroke="#FF6F20" fill="#FF6F20"
                      fillOpacity={0.15} strokeWidth={2}
                      dot={{ r: 5, fill: '#FF6F20', stroke: 'white', strokeWidth: 2 }} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${v}%`} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Monthly sessions bar */}
            {monthlyData.length > 0 && (
              <div style={card}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>
                  📅 אימונים לפי חודש
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0E4D0" />
                    <XAxis dataKey="month" fontSize={11} />
                    <YAxis fontSize={11} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="count" name="אימונים" fill="#FF6F20"
                      radius={[6, 6, 0, 0]} barSize={30} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function Progress() {
  return (
    <PermGate permission="view_progress" label="מעקב התקדמות">
      <ProgressInner />
    </PermGate>
  );
}
