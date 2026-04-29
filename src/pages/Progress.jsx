import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabaseClient";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import PageLoader from "@/components/PageLoader";
import PermGate from "@/components/PermGate";

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

  const isLoading = !trainee || !baselines || !records || !measurements || !goalProgress || !sessions;
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
  // Each baseline row is one technique × one session, so a multi-
  // technique session shows as parallel points on the same date.
  // connectNulls keeps a technique's line drawn across sessions
  // where it wasn't measured.
  const TECH_COLORS = ['#FF6F20', '#1D9E75', '#D85A30', '#1565C0', '#9C27B0'];
  const TECH_LABELS = { basic: 'Basic', foot_switch: 'Foot Switch', high_knees: 'High Knees', criss: 'Criss-Cross' };
  const techNames = [...new Set(baselinesArr.map(b => b.technique || 'basic'))];
  const baselineDates = [...new Set(baselinesArr.map(b =>
    b.date || new Date(b.created_at).toISOString().split('T')[0]
  ))].sort();
  const baselineData = baselineDates.map(date => {
    const row = { date: new Date(date).toLocaleDateString('he-IL') };
    techNames.forEach(tech => {
      const entry = baselinesArr.find(b => {
        const bDate = b.date || new Date(b.created_at).toISOString().split('T')[0];
        return bDate === date && (b.technique || 'basic') === tech;
      });
      const label = TECH_LABELS[tech] || tech;
      row[label] = entry
        ? Number(entry.baseline_score ?? entry.jps ?? entry.score ?? 0)
        : null;
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

  // ── Empty state ──────────────────────────────────────────────
  const noData = baselineData.length === 0
    && barData.length === 0
    && weightData.length === 0
    && totalSessions === 0;

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
