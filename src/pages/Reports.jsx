import React, { useState, useEffect, useContext, useMemo } from "react";
import { AuthContext } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { normalizeStatus } from "@/lib/enums";
import ProtectedCoachPage from "../components/ProtectedCoachPage";
import { Loader2 } from "lucide-react";

const TIME_OPTIONS = [
  { id: 'week',    label: 'השבוע' },
  { id: 'month',   label: 'החודש' },
  { id: '3months', label: '3 חודשים' },
  { id: 'year',    label: 'שנה' },
  { id: 'all',     label: 'הכל' },
];

function getStartDate(filter) {
  const now = new Date();
  switch (filter) {
    case 'week':    return new Date(now.getTime() - 7 * 86400000);
    case 'month':   return new Date(now.getFullYear(), now.getMonth(), 1);
    case '3months': return new Date(now.getFullYear(), now.getMonth() - 2, 1);
    case 'year':    return new Date(now.getFullYear(), 0, 1);
    default:        return null;
  }
}

function statusIcon(status) {
  const n = normalizeStatus(status);
  if (n === 'completed' || n === 'present') return '✅';
  if (n === 'cancelled') return '❌';
  if (n === 'pending') return '⏳';
  if (n === 'scheduled' || n === 'confirmed') return '📅';
  return '📅';
}
function statusLabel(status) {
  const n = normalizeStatus(status);
  if (n === 'completed' || n === 'present') return 'הושלם';
  if (n === 'cancelled') return 'בוטל';
  if (n === 'pending') return 'ממתין';
  if (n === 'scheduled') return 'מתוכנן';
  return status || '';
}
function relativeTime(dateStr) {
  if (!dateStr) return '';
  const ms = Date.now() - new Date(dateStr).getTime();
  const day = Math.floor(ms / 86400000);
  if (day < 1) return 'היום';
  if (day === 1) return 'אתמול';
  if (day < 7) return `${day} ימים`;
  if (day < 30) return `${Math.floor(day / 7)} שבועות`;
  return `${Math.floor(day / 30)} חודשים`;
}

const SESSION_TYPES = [
  { type: 'אישי',    label: 'אישי',    color: '#FF6F20' },
  { type: 'קבוצתי',  label: 'קבוצתי',  color: '#7F47B5' },
  { type: 'אונליין', label: 'אונליין', color: '#3B82F6' },
];

export default function Reports() {
  const { user } = useContext(AuthContext);
  const [timeFilter, setTimeFilter] = useState('month');
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [trainees, setTrainees] = useState([]);
  const [packages, setPackages] = useState([]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const fetchAll = async () => {
      setLoading(true);
      const start = getStartDate(timeFilter);
      let q = supabase
        .from('sessions')
        .select('id, date, time, status, session_type, trainee_id, service_id, participants, created_at')
        .eq('coach_id', user.id)
        .order('date', { ascending: false });
      if (start) q = q.gte('date', start.toISOString().split('T')[0]);
      const [sessRes, traineesRes, pkgRes] = await Promise.all([
        q,
        supabase.from('users').select('id, full_name').eq('coach_id', user.id).eq('role', 'trainee'),
        supabase.from('client_services').select('id, trainee_id, package_name, status, used_sessions, total_sessions, expires_at, end_date, created_at').eq('coach_id', user.id),
      ]);
      if (cancelled) return;
      setSessions(sessRes.data || []);
      setTrainees(traineesRes.data || []);
      setPackages(pkgRes.data || []);
      setLoading(false);
    };
    fetchAll();
    return () => { cancelled = true; };
  }, [user?.id, timeFilter]);

  const traineeNameById = useMemo(() => {
    const m = new Map();
    for (const t of trainees) m.set(t.id, t.full_name);
    return m;
  }, [trainees]);

  // Sessions can have a single trainee_id OR a participants[] array
  // (group sessions). Normalize to a flat list of (sessionId, traineeId).
  const traineeIdsFromSession = (s) => {
    const ids = [];
    if (s.trainee_id) ids.push(s.trainee_id);
    if (Array.isArray(s.participants)) {
      for (const p of s.participants) if (p?.trainee_id) ids.push(p.trainee_id);
    }
    return ids.length > 0 ? ids : [null];
  };

  const metrics = useMemo(() => {
    let total = 0, completed = 0, cancelled = 0;
    const traineeSet = new Set();
    for (const s of sessions) {
      total++;
      const n = normalizeStatus(s.status);
      if (n === 'completed' || n === 'present') completed++;
      if (n === 'cancelled') cancelled++;
      for (const tid of traineeIdsFromSession(s)) if (tid) traineeSet.add(tid);
    }
    const scheduled = total - cancelled;
    const rate = scheduled > 0 ? Math.round((completed / scheduled) * 100) : 0;
    return { total, completed, cancelled, scheduled, rate, activeTrainees: traineeSet.size };
  }, [sessions]);

  const chartData = useMemo(() => {
    const groups = new Map();
    const isDaily = timeFilter === 'week' || timeFilter === 'month';
    for (const s of sessions) {
      if (!s.date) continue;
      const d = new Date(s.date);
      if (Number.isNaN(d.getTime())) continue;
      let key, label;
      if (isDaily) {
        key = d.toISOString().split('T')[0];
        label = `${d.getDate()}/${d.getMonth() + 1}`;
      } else {
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        label = `${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`;
      }
      const prev = groups.get(key) || { count: 0, label };
      prev.count++;
      groups.set(key, prev);
    }
    const arr = Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => ({ key: k, count: v.count, label: v.label }));
    return arr;
  }, [sessions, timeFilter]);

  const maxChartCount = useMemo(() => chartData.reduce((m, d) => Math.max(m, d.count), 0), [chartData]);

  const topTrainees = useMemo(() => {
    const map = new Map();
    for (const s of sessions) {
      const n = normalizeStatus(s.status);
      if (n !== 'completed' && n !== 'present') continue;
      for (const tid of traineeIdsFromSession(s)) {
        if (!tid) continue;
        const prev = map.get(tid) || { id: tid, name: traineeNameById.get(tid) || 'מתאמן', count: 0 };
        prev.count++;
        map.set(tid, prev);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [sessions, traineeNameById]);

  const sessionTypesBreakdown = useMemo(() => {
    const counts = { אישי: 0, קבוצתי: 0, אונליין: 0 };
    for (const s of sessions) {
      const t = (s.session_type || '').trim();
      if (counts[t] != null) counts[t]++;
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
    return SESSION_TYPES.map(st => ({
      ...st,
      count: counts[st.type] || 0,
      percent: Math.round(((counts[st.type] || 0) / total) * 100),
    })).filter(st => st.count > 0);
  }, [sessions]);

  const packageStats = useMemo(() => {
    let active = 0, expiring = 0, expired = 0;
    const now = new Date();
    const in14 = new Date(now.getTime() + 14 * 86400000);
    for (const p of packages) {
      const total = p.total_sessions || 0;
      const used = p.used_sessions || 0;
      const remaining = Math.max(0, total - used);
      const exp = p.expires_at || p.end_date;
      const expDate = exp ? new Date(exp) : null;
      const isActive = p.status === 'פעיל' || p.status === 'active';
      const finished = p.status === 'completed' || p.status === 'הסתיים' || p.status === 'expired' || p.status === 'פג תוקף' || p.status === 'cancelled' || p.status === 'בוטל' || (expDate && expDate < now) || (total > 0 && used >= total);
      if (finished) { expired++; continue; }
      if (isActive && (remaining === 1 || (expDate && expDate <= in14))) { expiring++; continue; }
      if (isActive) active++;
    }
    return { active, expiring, expired };
  }, [packages]);

  const recentActivity = useMemo(() => {
    const items = [];
    for (const s of sessions.slice(0, 30)) {
      const tid = s.trainee_id || (s.participants?.[0]?.trainee_id);
      items.push({
        icon: statusIcon(s.status),
        message: `${traineeNameById.get(tid) || 'מתאמן'} — מפגש ${statusLabel(s.status)}`,
        date: s.date || s.created_at,
      });
    }
    const start = getStartDate(timeFilter);
    for (const p of packages) {
      if (start && p.created_at && new Date(p.created_at) < start) continue;
      items.push({
        icon: '🎫',
        message: `${traineeNameById.get(p.trainee_id) || 'מתאמן'} — חבילה "${p.package_name || ''}" נוצרה`,
        date: p.created_at,
      });
    }
    return items
      .filter(i => i.date)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 10);
  }, [sessions, packages, traineeNameById, timeFilter]);

  return (
    <ProtectedCoachPage>
      <div className="min-h-screen pb-24" dir="rtl" style={{ backgroundColor: '#FFF9F0' }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div style={{ padding: 16, textAlign: 'right' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1a1a1a' }}>📊 דוחות</div>
            <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>סיכום פעילות ונתונים</div>
          </div>

          {/* Time filter */}
          <div style={{ display: 'flex', gap: 6, padding: '0 14px 12px', overflowX: 'auto' }}>
            {TIME_OPTIONS.map(t => {
              const active = timeFilter === t.id;
              return (
                <div key={t.id} onClick={() => setTimeFilter(t.id)}
                  style={{
                    padding: '6px 14px', borderRadius: 20,
                    background: active ? '#FF6F20' : 'white',
                    color: active ? 'white' : '#1a1a1a',
                    fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer',
                    border: active ? 'none' : '0.5px solid #F0E4D0',
                    flexShrink: 0,
                  }}>{t.label}</div>
              );
            })}
          </div>

          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '40vh' }}>
              <div style={{
                width: 36, height: 36,
                border: '3px solid #F0E4D0',
                borderTop: '3px solid #FF6F20',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }} />
            </div>
          ) : (
            <>
              {/* KPI cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '0 12px 12px' }}>
                <Kpi value={metrics.total}          color="#FF6F20" label="סה״כ מפגשים" />
                <Kpi value={metrics.completed}      color="#16a34a" label="הושלמו" />
                <Kpi value={metrics.activeTrainees} color="#7F47B5" label="מתאמנים פעילים" />
                <Kpi value={metrics.cancelled}      color="#dc2626" label="בוטלו" />
              </div>

              {/* Attendance rate */}
              <Card title="📈 אחוז נוכחות">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around' }}>
                  <svg width="100" height="100" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="40" fill="none" stroke="#F0E4D0" strokeWidth="7" />
                    <circle cx="50" cy="50" r="40" fill="none" stroke="#FF6F20" strokeWidth="7"
                      strokeDasharray={`${(metrics.rate / 100) * 251} 251`}
                      transform="rotate(-90 50 50)" strokeLinecap="round" />
                    <text x="50" y="50" textAnchor="middle" dominantBaseline="middle" fontSize="20" fontWeight="600" fill="#1a1a1a">{metrics.rate}%</text>
                  </svg>
                  <div style={{ textAlign: 'right', fontSize: 13, color: '#888', lineHeight: 1.9 }}>
                    <div>נקבעו: <b style={{ color: '#1a1a1a' }}>{metrics.scheduled}</b></div>
                    <div>הושלמו: <b style={{ color: '#16a34a' }}>{metrics.completed}</b></div>
                    <div>בוטלו: <b style={{ color: '#dc2626' }}>{metrics.cancelled}</b></div>
                  </div>
                </div>
              </Card>

              {/* Sessions over time */}
              <Card title="📅 מפגשים לאורך זמן">
                {chartData.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 16, color: '#888', fontSize: 13 }}>אין נתונים</div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 130, paddingTop: 14 }}>
                    {chartData.map(d => {
                      const h = maxChartCount > 0 ? (d.count / maxChartCount) * 90 : 0;
                      return (
                        <div key={d.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 0 }}>
                          {d.count > 0 && <div style={{ fontSize: 10, fontWeight: 600, color: '#1a1a1a' }}>{d.count}</div>}
                          <div style={{ width: '100%', height: Math.max(h, 4), background: '#FF6F20', borderRadius: '3px 3px 0 0', opacity: h > 0 ? 1 : 0.2 }} />
                          <div style={{ fontSize: 9, color: '#888', whiteSpace: 'nowrap', transform: 'rotate(-45deg)', transformOrigin: 'right top', marginTop: 4 }}>{d.label}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>

              {/* Top trainees */}
              {topTrainees.length > 0 && (
                <Card title="🏆 מתאמנים מובילים">
                  {topTrainees.slice(0, 5).map((t, i) => (
                    <div key={t.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                      borderBottom: i < Math.min(4, topTrainees.length - 1) ? '0.5px solid #F8F0E8' : 'none',
                    }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: i === 0 ? '#FFF0E4' : i === 1 ? '#F0F0F0' : i === 2 ? '#FEF3E2' : '#F3F4F6',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, fontWeight: 700,
                        color: i === 0 ? '#FF6F20' : i === 1 ? '#888' : i === 2 ? '#CA8A04' : '#888',
                      }}>{i + 1}</div>
                      <div style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{t.name}</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#FF6F20' }}>{t.count} מפגשים</div>
                    </div>
                  ))}
                </Card>
              )}

              {/* Session types breakdown */}
              {sessionTypesBreakdown.length > 0 && (
                <Card title="📋 חלוקה לפי סוג מפגש">
                  {sessionTypesBreakdown.map(st => (
                    <div key={st.type} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                        <span style={{ fontWeight: 500 }}>{st.label}</span>
                        <span style={{ color: '#888' }}>{st.count} ({st.percent}%)</span>
                      </div>
                      <div style={{ height: 6, background: '#F0E4D0', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${st.percent}%`, background: st.color, borderRadius: 3 }} />
                      </div>
                    </div>
                  ))}
                </Card>
              )}

              {/* Package status summary */}
              <Card title="🎫 סטטוס חבילות">
                <div style={{ display: 'flex', justifyContent: 'space-around' }}>
                  <PkgStat value={packageStats.active}   color="#16a34a" label="פעילות" />
                  <Divider />
                  <PkgStat value={packageStats.expiring} color="#EAB308" label="מסתיימות" />
                  <Divider />
                  <PkgStat value={packageStats.expired}  color="#dc2626" label="הסתיימו" />
                </div>
              </Card>

              {/* Recent activity */}
              {recentActivity.length > 0 && (
                <Card title="🕐 פעילות אחרונה" mb={16}>
                  {recentActivity.map((a, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0',
                      borderBottom: i < recentActivity.length - 1 ? '0.5px solid #F8F0E8' : 'none',
                      fontSize: 13,
                    }}>
                      <div style={{ fontSize: 16 }}>{a.icon}</div>
                      <div style={{ flex: 1, color: '#555' }}>{a.message}</div>
                      <div style={{ fontSize: 11, color: '#aaa', whiteSpace: 'nowrap' }}>{relativeTime(a.date)}</div>
                    </div>
                  ))}
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </ProtectedCoachPage>
  );
}

function Kpi({ value, color, label }) {
  return (
    <div style={{ background: 'white', borderRadius: 14, padding: 14, textAlign: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
      <div style={{ fontSize: 28, fontWeight: 500, color }}>{value}</div>
      <div style={{ fontSize: 12, color: '#888', fontWeight: 600, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function Card({ title, children, mb = 12 }) {
  return (
    <div style={{
      background: 'white', borderRadius: 14, padding: 16,
      margin: `0 12px ${mb}px`, boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
      textAlign: 'right',
    }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a', marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

function PkgStat({ value, color, label }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 500, color }}>{value}</div>
      <div style={{ fontSize: 11, color: '#888' }}>{label}</div>
    </div>
  );
}

function Divider() {
  return <div style={{ width: '0.5px', background: '#E5E5E5' }} />;
}
