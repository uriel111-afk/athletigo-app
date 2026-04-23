import React, { useState, useEffect, useContext, useCallback, useMemo } from 'react';
import { AuthContext } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { normalizeStatus } from '@/lib/enums';
import ProtectedCoachPage from '../components/ProtectedCoachPage';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

// Unified Reports + Financial page. 4 tabs (overview / sessions /
// financial / trainees), every metric clickable to drill down into
// the underlying rows. All names + numbers come from Supabase via
// real queries with realtime sync. No hardcoded data anywhere.

const TABS = [
  { id: 'overview',  label: 'סקירה',    icon: '📊' },
  { id: 'sessions',  label: 'מפגשים',  icon: '📅' },
  { id: 'financial', label: 'כספי',    icon: '💰' },
  { id: 'trainees',  label: 'מתאמנים', icon: '👥' },
];

const TIMES = [
  { id: 'week',    label: 'השבוע' },
  { id: 'month',   label: 'החודש' },
  { id: '3months', label: '3 חודשים' },
  { id: 'year',    label: 'שנה' },
  { id: 'all',     label: 'הכל' },
];

const DAY_LABELS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

function getStartDate(f) {
  const now = new Date();
  switch (f) {
    case 'week':    return new Date(now.getTime() - 7 * 86400000);
    case 'month':   return new Date(now.getFullYear(), now.getMonth(), 1);
    case '3months': return new Date(now.getFullYear(), now.getMonth() - 2, 1);
    case 'year':    return new Date(now.getFullYear(), 0, 1);
    default:        return null;
  }
}

function fmtDate(d) {
  if (!d) return '';
  try { return format(new Date(d), 'dd/MM/yy', { locale: he }); } catch { return ''; }
}
function fmtMonth(d) {
  if (!d) return '';
  try { return format(new Date(d), 'MM/yy', { locale: he }); } catch { return ''; }
}
function statusIcon(status) {
  const n = normalizeStatus(status);
  if (n === 'completed' || n === 'present') return '✅';
  if (n === 'cancelled') return '❌';
  if (n === 'pending')   return '⏳';
  return '📅';
}
function statusLabel(status) {
  const n = normalizeStatus(status);
  if (n === 'completed' || n === 'present') return 'הושלם';
  if (n === 'cancelled') return 'בוטל';
  if (n === 'pending')   return 'ממתין';
  return status || '';
}

export default function Reports() {
  const { user } = useContext(AuthContext);
  const [activeTab, setActiveTab] = useState('overview');
  const [timeFilter, setTimeFilter] = useState('month');
  const [sessions, setSessions] = useState([]);
  const [trainees, setTrainees] = useState([]);
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  const toggle = (key) => setExpanded(prev => prev === key ? null : key);

  const fetchAll = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const [sRes, tRes, pRes] = await Promise.all([
      supabase.from('sessions')
        .select('id, date, time, status, session_type, trainee_id, service_id, participants, coach_notes, created_at')
        .eq('coach_id', user.id)
        .order('date', { ascending: false }),
      supabase.from('users')
        .select('id, full_name, phone, email, created_at')
        .eq('coach_id', user.id)
        .eq('role', 'trainee'),
      supabase.from('client_services')
        .select('id, trainee_id, package_name, package_type, service_type, total_sessions, used_sessions, sessions_remaining, final_price, payment_method, status, start_date, end_date, expires_at, created_at')
        .eq('coach_id', user.id),
    ]);
    setSessions(sRes.data || []);
    setTrainees(tRes.data || []);
    setPackages(pRes.data || []);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { fetchAll(); }, [fetchAll, timeFilter]);

  // Realtime: any change to sessions or client_services for this coach
  // triggers a full refetch so charts and lists stay in sync.
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase.channel('reports_live_' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions',         filter: `coach_id=eq.${user.id}` }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_services',  filter: `coach_id=eq.${user.id}` }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, fetchAll]);

  // ─── Derived data ────────────────────────────────────────────
  const traineeNameById = useMemo(() => {
    const m = new Map();
    for (const t of trainees) m.set(t.id, t.full_name);
    return m;
  }, [trainees]);
  const getName = (id) => traineeNameById.get(id) || 'לא ידוע';

  const startDate = getStartDate(timeFilter);

  // Sessions can be solo (trainee_id) or group (participants[]).
  // Flatten to (sessionRow, traineeId[]) for "active trainees" + "top trainees".
  const traineeIdsFromSession = (s) => {
    const ids = new Set();
    if (s.trainee_id) ids.add(s.trainee_id);
    if (Array.isArray(s.participants)) for (const p of s.participants) if (p?.trainee_id) ids.add(p.trainee_id);
    return Array.from(ids);
  };

  const filtered = useMemo(() => (
    startDate ? sessions.filter(s => s.date && new Date(s.date) >= startDate) : sessions
  ), [sessions, startDate]);

  const filteredPkgs = useMemo(() => (
    startDate ? packages.filter(p => p.created_at && new Date(p.created_at) >= startDate) : packages
  ), [packages, startDate]);

  const completed = useMemo(() => filtered.filter(s => {
    const n = normalizeStatus(s.status);
    return n === 'completed' || n === 'present';
  }), [filtered]);
  const cancelled = useMemo(() => filtered.filter(s => normalizeStatus(s.status) === 'cancelled'), [filtered]);
  const pending   = useMemo(() => filtered.filter(s => normalizeStatus(s.status) === 'pending'), [filtered]);

  const totalRevenue = useMemo(() => filteredPkgs.reduce((s, p) => s + (Number(p.final_price) || 0), 0), [filteredPkgs]);
  const allTimeRevenue = useMemo(() => packages.reduce((s, p) => s + (Number(p.final_price) || 0), 0), [packages]);

  // ─── Helpers shared across tabs ──────────────────────────────
  const renderList = (title, items) => (
    <div style={{
      background: '#FFF9F0', borderRadius: 12, padding: 12,
      margin: '4px 12px 10px', maxHeight: 280, overflowY: 'auto', direction: 'rtl',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a' }}>{title} ({items.length})</span>
        <span onClick={() => setExpanded(null)} style={{ cursor: 'pointer', color: '#888', fontSize: 16 }}>✕</span>
      </div>
      {items.length > 0 ? items.slice(0, 50).map((item, i) => (
        <div key={item.key || i} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 0', borderBottom: i < Math.min(50, items.length) - 1 ? '0.5px solid #F0E4D0' : 'none',
          fontSize: 13,
        }}>
          {item.icon && <span style={{ fontSize: 14 }}>{item.icon}</span>}
          <span style={{ flex: 1, fontWeight: 500, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
          {item.detail && <span style={{ color: '#888', fontSize: 12 }}>{item.detail}</span>}
          {item.value && <span style={{ fontWeight: 600, color: '#FF6F20' }}>{item.value}</span>}
        </div>
      )) : <div style={{ textAlign: 'center', color: '#888', padding: 12, fontSize: 13 }}>אין נתונים לתקופה זו</div>}
    </div>
  );

  const renderKPI = (label, value, color, key, items) => (
    <React.Fragment key={key}>
      <div onClick={() => toggle(key)} style={{
        background: 'white', borderRadius: 14, padding: 14, textAlign: 'center', cursor: 'pointer',
        boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
        border: expanded === key ? '2px solid #FF6F20' : '0.5px solid transparent',
        transition: 'border 0.15s',
      }}>
        <div style={{ fontSize: 26, fontWeight: 500, color }}>{value}</div>
        <div style={{ fontSize: 11, color: '#888', fontWeight: 600, marginTop: 2 }}>{label}</div>
      </div>
      {expanded === key && (
        <div style={{ gridColumn: '1 / -1' }}>{renderList(label, items)}</div>
      )}
    </React.Fragment>
  );

  const renderCard = (title, key, children, expandable = false) => (
    <div onClick={expandable ? () => toggle(key) : undefined} style={{
      background: 'white', borderRadius: 14, padding: 16, margin: '0 12px 10px',
      boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
      border: expandable && expanded === key ? '2px solid #FF6F20' : '0.5px solid transparent',
      cursor: expandable ? 'pointer' : 'default',
    }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a', marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );

  // ─── Section: Attendance circle ──────────────────────────────
  const renderAttendance = () => {
    const rate = filtered.length > 0 ? Math.round(completed.length / filtered.length * 100) : 0;
    const dash = (rate / 100) * 226;
    const perTrainee = trainees.map(t => {
      const mine = filtered.filter(s => traineeIdsFromSession(s).includes(t.id));
      const comp = mine.filter(s => { const n = normalizeStatus(s.status); return n === 'completed' || n === 'present'; }).length;
      const canc = mine.filter(s => normalizeStatus(s.status) === 'cancelled').length;
      const tot = mine.length;
      return { id: t.id, name: t.full_name, comp, canc, total: tot, rate: tot > 0 ? Math.round(comp / tot * 100) : 0 };
    }).filter(t => t.total > 0).sort((a, b) => b.rate - a.rate);

    return (
      <>
        <div onClick={() => toggle('att')} style={{
          background: 'white', borderRadius: 14, padding: 16, margin: '0 12px 10px', cursor: 'pointer',
          boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
          border: expanded === 'att' ? '2px solid #FF6F20' : '0.5px solid transparent',
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#1a1a1a' }}>📈 אחוז נוכחות</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around' }}>
            <svg width="90" height="90" viewBox="0 0 90 90">
              <circle cx="45" cy="45" r="36" fill="none" stroke="#F0E4D0" strokeWidth="6" />
              <circle cx="45" cy="45" r="36" fill="none" stroke="#FF6F20" strokeWidth="6"
                strokeDasharray={`${dash} 226`} transform="rotate(-90 45 45)" strokeLinecap="round" />
              <text x="45" y="45" textAnchor="middle" dominantBaseline="middle" fontSize="18" fontWeight="600" fill="#1a1a1a">{rate}%</text>
            </svg>
            <div style={{ textAlign: 'right', fontSize: 13, color: '#888', lineHeight: 1.9 }}>
              <div>הושלמו: <b style={{ color: '#16a34a' }}>{completed.length}</b></div>
              <div>בוטלו: <b style={{ color: '#dc2626' }}>{cancelled.length}</b></div>
              <div>סה״כ: <b style={{ color: '#1a1a1a' }}>{filtered.length}</b></div>
            </div>
          </div>
        </div>
        {expanded === 'att' && renderList('פירוט לפי מתאמן', perTrainee.map(t => ({
          key: t.id, icon: '👤', name: t.name, detail: `${t.comp}✅ ${t.canc}❌`, value: `${t.rate}%`,
        })))}
      </>
    );
  };

  // ─── Section: Sessions over time chart ────────────────────────
  const renderSessionsChart = () => {
    const groups = new Map();
    const isDaily = timeFilter === 'week' || timeFilter === 'month';
    for (const s of filtered) {
      if (!s.date) continue;
      const d = new Date(s.date);
      const key = isDaily
        ? `${d.getDate()}/${d.getMonth() + 1}`
        : `${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`;
      groups.set(key, (groups.get(key) || 0) + 1);
    }
    const data = Array.from(groups.entries()).slice(-12);
    const maxV = Math.max(...data.map(([, v]) => v), 1);
    return (
      <div style={{ background: 'white', borderRadius: 14, padding: 16, margin: '0 12px 10px', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14, color: '#1a1a1a' }}>📅 מפגשים לאורך זמן</div>
        {data.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#888', padding: 12, fontSize: 13 }}>אין נתונים לתקופה זו</div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 110 }}>
            {data.map(([label, count]) => {
              const h = (count / maxV) * 80;
              return (
                <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#1a1a1a' }}>{count}</div>
                  <div style={{ width: '100%', height: Math.max(h, 4), background: '#FF6F20', borderRadius: '3px 3px 0 0' }} />
                  <div style={{ fontSize: 9, color: '#888', whiteSpace: 'nowrap', transform: 'rotate(-45deg)', transformOrigin: 'right top', marginTop: 2 }}>{label}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // ─── Section: Package status summary ──────────────────────────
  const renderPackageStatus = () => {
    const now = new Date();
    let active = 0, expiring = 0, expired = 0;
    const activeList = [], expiringList = [], expiredList = [];
    for (const p of packages) {
      const total = p.total_sessions || 0;
      const used = p.used_sessions || 0;
      const remaining = Math.max(0, total - used);
      const ed = p.expires_at || p.end_date;
      const exp = ed ? new Date(ed) : null;
      const isActive = p.status === 'פעיל' || p.status === 'active';
      const finished = ['completed', 'expired', 'cancelled', 'הסתיים', 'פג תוקף', 'בוטל'].includes(p.status) || (exp && exp < now) || (total > 0 && used >= total);
      if (finished) { expired++; expiredList.push(p); continue; }
      const inWindow = exp && (exp - now) / 86400000 <= 14;
      if (isActive && (remaining === 1 || inWindow)) { expiring++; expiringList.push(p); continue; }
      if (isActive) { active++; activeList.push(p); }
    }
    const cell = (label, val, color, key, items) => (
      <div onClick={() => toggle(key)} style={{ flex: 1, textAlign: 'center', cursor: 'pointer', padding: '4px' }}>
        <div style={{ fontSize: 22, fontWeight: 500, color }}>{val}</div>
        <div style={{ fontSize: 11, color: '#888' }}>{label}</div>
      </div>
    );
    return (
      <>
        <div style={{ background: 'white', borderRadius: 14, padding: 16, margin: '0 12px 10px', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#1a1a1a' }}>🎫 סטטוס חבילות</div>
          <div style={{ display: 'flex' }}>
            {cell('פעילות', active, '#16a34a', 'pkg_active', activeList)}
            <div style={{ width: '0.5px', background: '#E5E5E5' }} />
            {cell('מסתיימות', expiring, '#EAB308', 'pkg_expiring', expiringList)}
            <div style={{ width: '0.5px', background: '#E5E5E5' }} />
            {cell('הסתיימו', expired, '#dc2626', 'pkg_expired', expiredList)}
          </div>
        </div>
        {expanded === 'pkg_active' && renderList('חבילות פעילות', activeList.map(p => ({
          key: p.id, icon: '🟢', name: getName(p.trainee_id), detail: p.package_name, value: `נותרו ${Math.max(0, (p.total_sessions || 0) - (p.used_sessions || 0))}`,
        })))}
        {expanded === 'pkg_expiring' && renderList('עומדות להסתיים', expiringList.map(p => ({
          key: p.id, icon: '⚡', name: getName(p.trainee_id), detail: p.package_name, value: fmtDate(p.expires_at || p.end_date),
        })))}
        {expanded === 'pkg_expired' && renderList('הסתיימו', expiredList.map(p => ({
          key: p.id, icon: '🔴', name: getName(p.trainee_id), detail: p.package_name, value: fmtDate(p.expires_at || p.end_date),
        })))}
      </>
    );
  };

  // ─── Section: Top trainees ────────────────────────────────────
  const renderTopTrainees = () => {
    const stats = trainees.map(t => {
      const mine = filtered.filter(s => traineeIdsFromSession(s).includes(t.id));
      const count = mine.filter(s => { const n = normalizeStatus(s.status); return n === 'completed' || n === 'present'; }).length;
      return { id: t.id, name: t.full_name, count, sessions: mine };
    }).filter(t => t.count > 0).sort((a, b) => b.count - a.count).slice(0, 5);
    return (
      <div style={{ background: 'white', borderRadius: 14, padding: 16, margin: '0 12px 10px', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#1a1a1a' }}>🏆 מתאמנים מובילים</div>
        {stats.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#888', padding: 12, fontSize: 13 }}>אין נתונים לתקופה זו</div>
        ) : stats.map((t, i) => (
          <React.Fragment key={t.id}>
            <div onClick={() => toggle('top_' + t.id)} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
              borderBottom: i < stats.length - 1 ? '0.5px solid #F8F0E8' : 'none', cursor: 'pointer',
            }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%',
                background: i === 0 ? '#FFF0E4' : i === 1 ? '#F0F0F0' : i === 2 ? '#FEF3E2' : '#F3F4F6',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 700,
                color: i === 0 ? '#FF6F20' : i === 1 ? '#888' : i === 2 ? '#CA8A04' : '#888' }}>{i + 1}</div>
              <div style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{t.name}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#FF6F20' }}>{t.count} מפגשים</div>
            </div>
            {expanded === 'top_' + t.id && renderList(t.name, t.sessions.map(s => ({
              key: s.id, icon: statusIcon(s.status), name: fmtDate(s.date), detail: s.session_type || '', value: statusLabel(s.status),
            })))}
          </React.Fragment>
        ))}
      </div>
    );
  };

  // ─── Section: Session-type breakdown ──────────────────────────
  const renderTypeBreakdown = () => {
    const types = [
      { key: 'אישי',    label: 'אישי',    color: '#FF6F20' },
      { key: 'קבוצתי',  label: 'קבוצתי',  color: '#7F47B5' },
      { key: 'אונליין', label: 'אונליין', color: '#3B82F6' },
    ];
    const total = filtered.length || 1;
    const data = types.map(t => {
      const list = filtered.filter(s => (s.session_type || '').trim() === t.key);
      return { ...t, count: list.length, percent: Math.round(list.length / total * 100), list };
    }).filter(t => t.count > 0);
    return (
      <div style={{ background: 'white', borderRadius: 14, padding: 16, margin: '0 12px 10px', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#1a1a1a' }}>📋 חלוקה לפי סוג מפגש</div>
        {data.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#888', padding: 12, fontSize: 13 }}>אין נתונים לתקופה זו</div>
        ) : data.map(t => (
          <React.Fragment key={t.key}>
            <div onClick={() => toggle('type_' + t.key)} style={{ marginBottom: 10, cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                <span style={{ fontWeight: 500 }}>{t.label}</span>
                <span style={{ color: '#888' }}>{t.count} ({t.percent}%)</span>
              </div>
              <div style={{ height: 6, background: '#F0E4D0', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${t.percent}%`, background: t.color, borderRadius: 3 }} />
              </div>
            </div>
            {expanded === 'type_' + t.key && renderList(t.label, t.list.map(s => ({
              key: s.id, icon: statusIcon(s.status), name: getName(s.trainee_id), detail: fmtDate(s.date), value: statusLabel(s.status),
            })))}
          </React.Fragment>
        ))}
      </div>
    );
  };

  // ─── Section: Busiest days ────────────────────────────────────
  const renderBusiestDays = () => {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    const lists = [[], [], [], [], [], [], []];
    for (const s of filtered) {
      if (!s.date) continue;
      const d = new Date(s.date).getDay();
      counts[d]++;
      lists[d].push(s);
    }
    const max = Math.max(...counts, 1);
    return (
      <div style={{ background: 'white', borderRadius: 14, padding: 16, margin: '0 12px 10px', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#1a1a1a' }}>📆 ימים עמוסים</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 100 }}>
          {DAY_LABELS.map((label, i) => {
            const h = (counts[i] / max) * 70;
            return (
              <div key={i} onClick={() => counts[i] > 0 && toggle('day_' + i)} style={{ flex: 1, textAlign: 'center', cursor: counts[i] > 0 ? 'pointer' : 'default' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#1a1a1a' }}>{counts[i]}</div>
                <div style={{ width: '100%', height: Math.max(h, 4), background: '#FF6F20', borderRadius: '3px 3px 0 0', margin: '2px 0', opacity: counts[i] > 0 ? 1 : 0.2 }} />
                <div style={{ fontSize: 10, color: '#888' }}>{label.slice(0, 3)}</div>
              </div>
            );
          })}
        </div>
        {expanded?.startsWith('day_') && renderList(
          DAY_LABELS[Number(expanded.split('_')[1])],
          lists[Number(expanded.split('_')[1])].map(s => ({
            key: s.id, icon: statusIcon(s.status), name: getName(s.trainee_id), detail: fmtDate(s.date), value: s.session_type || '',
          })),
        )}
      </div>
    );
  };

  // ─── Section: Recent sessions list ────────────────────────────
  const renderRecentSessions = () => {
    const recent = filtered.slice(0, 20);
    return (
      <div style={{ background: 'white', borderRadius: 14, padding: 16, margin: '0 12px 10px', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#1a1a1a' }}>🕐 מפגשים אחרונים</div>
        {recent.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#888', padding: 12, fontSize: 13 }}>אין נתונים לתקופה זו</div>
        ) : recent.map((s, i) => (
          <div key={s.id} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0',
            borderBottom: i < recent.length - 1 ? '0.5px solid #F8F0E8' : 'none', fontSize: 13,
          }}>
            <span style={{ fontSize: 14 }}>{statusIcon(s.status)}</span>
            <span style={{ flex: 1, fontWeight: 500 }}>{getName(s.trainee_id)}</span>
            <span style={{ color: '#888', fontSize: 12 }}>{fmtDate(s.date)} {s.time || ''}</span>
            <span style={{ color: '#888', fontSize: 12 }}>{statusLabel(s.status)}</span>
          </div>
        ))}
      </div>
    );
  };

  // ─── Section: Profitable clients ──────────────────────────────
  const renderProfitableClients = () => {
    const clients = trainees.map(t => {
      const myPkgs = packages.filter(p => p.trainee_id === t.id);
      return {
        id: t.id, name: t.full_name,
        totalPaid: myPkgs.reduce((s, p) => s + (Number(p.final_price) || 0), 0),
        pkgCount: myPkgs.length,
        sessionCount: sessions.filter(s => traineeIdsFromSession(s).includes(t.id)).length,
        pkgs: myPkgs,
      };
    }).filter(c => c.totalPaid > 0).sort((a, b) => b.totalPaid - a.totalPaid).slice(0, 10);
    return (
      <div style={{ background: 'white', borderRadius: 14, padding: 16, margin: '0 12px 10px', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#1a1a1a' }}>💎 לקוחות מובילים</div>
        {clients.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#888', padding: 12, fontSize: 13 }}>אין נתונים</div>
        ) : clients.map((c, i) => (
          <React.Fragment key={c.id}>
            <div onClick={() => toggle('client_' + c.id)} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0',
              borderBottom: i < clients.length - 1 ? '0.5px solid #F8F0E8' : 'none', cursor: 'pointer',
            }}>
              <div style={{ width: 32, height: 32, borderRadius: 10,
                background: i < 3 ? '#FFF0E4' : '#F3F4F6',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 700, color: i < 3 ? '#FF6F20' : '#888' }}>{i + 1}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{c.name}</div>
                <div style={{ fontSize: 11, color: '#888' }}>{c.pkgCount} חבילות · {c.sessionCount} מפגשים</div>
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#16a34a' }}>₪{c.totalPaid.toLocaleString()}</div>
            </div>
            {expanded === 'client_' + c.id && renderList('חבילות שנרכשו', c.pkgs.map(p => ({
              key: p.id, icon: '🎫', name: p.package_name, detail: p.payment_method || 'לא צוין', value: `₪${Number(p.final_price) || 0}`,
            })))}
          </React.Fragment>
        ))}
      </div>
    );
  };

  // ─── Section: Revenue over time chart ─────────────────────────
  const renderRevenueChart = () => {
    const groups = new Map();
    for (const p of filteredPkgs) {
      if (!p.created_at) continue;
      const d = new Date(p.created_at);
      const key = `${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`;
      const prev = groups.get(key) || { revenue: 0, count: 0, list: [] };
      prev.revenue += Number(p.final_price) || 0;
      prev.count++;
      prev.list.push(p);
      groups.set(key, prev);
    }
    const data = Array.from(groups.entries()).slice(-12);
    const maxV = Math.max(...data.map(([, v]) => v.revenue), 1);
    return (
      <div style={{ background: 'white', borderRadius: 14, padding: 16, margin: '0 12px 10px', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14, color: '#1a1a1a' }}>📈 הכנסות לאורך זמן</div>
        {data.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#888', padding: 12, fontSize: 13 }}>אין נתונים לתקופה זו</div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 110 }}>
              {data.map(([label, v]) => {
                const h = (v.revenue / maxV) * 80;
                return (
                  <div key={label} onClick={() => toggle('rev_' + label)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 0, cursor: 'pointer' }}>
                    <div style={{ fontSize: 9, fontWeight: 600, color: '#1a1a1a' }}>₪{Math.round(v.revenue / 1000)}k</div>
                    <div style={{ width: '100%', height: Math.max(h, 4), background: '#16a34a', borderRadius: '3px 3px 0 0' }} />
                    <div style={{ fontSize: 9, color: '#888' }}>{label}</div>
                  </div>
                );
              })}
            </div>
            {expanded?.startsWith('rev_') && (() => {
              const k = expanded.replace('rev_', '');
              const item = data.find(([key]) => key === k);
              return item ? renderList(`הכנסות ${k}`, item[1].list.map(p => ({
                key: p.id, icon: '🎫', name: getName(p.trainee_id), detail: p.package_name, value: `₪${Number(p.final_price) || 0}`,
              }))) : null;
            })()}
          </>
        )}
      </div>
    );
  };

  // ─── Section: Package types ───────────────────────────────────
  const renderPackageTypes = () => {
    const map = new Map();
    for (const p of filteredPkgs) {
      const k = p.package_name || p.service_type || 'לא צוין';
      const prev = map.get(k) || { name: k, count: 0, revenue: 0, list: [] };
      prev.count++;
      prev.revenue += Number(p.final_price) || 0;
      prev.list.push(p);
      map.set(k, prev);
    }
    const data = Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
    const totalRev = data.reduce((s, t) => s + t.revenue, 0) || 1;
    return (
      <div style={{ background: 'white', borderRadius: 14, padding: 16, margin: '0 12px 10px', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#1a1a1a' }}>📦 חלוקה לפי סוג חבילה</div>
        {data.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#888', padding: 12, fontSize: 13 }}>אין חבילות בתקופה זו</div>
        ) : data.map((t, i) => (
          <React.Fragment key={t.name}>
            <div onClick={() => toggle('ptype_' + i)} style={{ marginBottom: 10, cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                <span style={{ fontWeight: 500 }}>{t.name}</span>
                <span style={{ color: '#888' }}>{t.count} · ₪{t.revenue.toLocaleString()}</span>
              </div>
              <div style={{ height: 6, background: '#F0E4D0', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(t.revenue / totalRev) * 100}%`, background: '#FF6F20', borderRadius: 3 }} />
              </div>
            </div>
            {expanded === 'ptype_' + i && renderList(t.name, t.list.map(p => ({
              key: p.id, icon: '🎫', name: getName(p.trainee_id), detail: fmtDate(p.created_at), value: `₪${Number(p.final_price) || 0}`,
            })))}
          </React.Fragment>
        ))}
      </div>
    );
  };

  // ─── Section: Monthly comparison ──────────────────────────────
  const renderMonthlyComparison = () => {
    const now = new Date();
    const thisStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastEnd = thisStart;
    const thisRev = packages.filter(p => p.created_at && new Date(p.created_at) >= thisStart).reduce((s, p) => s + (Number(p.final_price) || 0), 0);
    const lastRev = packages.filter(p => {
      if (!p.created_at) return false;
      const d = new Date(p.created_at);
      return d >= lastStart && d < lastEnd;
    }).reduce((s, p) => s + (Number(p.final_price) || 0), 0);
    const change = lastRev > 0 ? Math.round((thisRev - lastRev) / lastRev * 100) : (thisRev > 0 ? 100 : 0);
    return (
      <div style={{ background: 'white', borderRadius: 14, padding: 16, margin: '0 12px 10px', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#1a1a1a' }}>📅 השוואה חודשית</div>
        <div style={{ display: 'flex', justifyContent: 'space-around' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#888' }}>החודש</div>
            <div style={{ fontSize: 22, fontWeight: 500, color: '#16a34a' }}>₪{thisRev.toLocaleString()}</div>
          </div>
          <div style={{ width: '0.5px', background: '#E5E5E5' }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#888' }}>חודש קודם</div>
            <div style={{ fontSize: 22, fontWeight: 500, color: '#888' }}>₪{lastRev.toLocaleString()}</div>
          </div>
          <div style={{ width: '0.5px', background: '#E5E5E5' }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#888' }}>שינוי</div>
            <div style={{ fontSize: 22, fontWeight: 500, color: change >= 0 ? '#16a34a' : '#dc2626' }}>{change >= 0 ? '+' : ''}{change}%</div>
          </div>
        </div>
      </div>
    );
  };

  // ─── Section: Payment methods ─────────────────────────────────
  const renderPaymentMethods = () => {
    const map = new Map();
    for (const p of filteredPkgs) {
      const k = p.payment_method || 'לא צוין';
      const prev = map.get(k) || { name: k, count: 0, total: 0, list: [] };
      prev.count++;
      prev.total += Number(p.final_price) || 0;
      prev.list.push(p);
      map.set(k, prev);
    }
    const data = Array.from(map.values()).sort((a, b) => b.total - a.total);
    const totalAll = data.reduce((s, t) => s + t.total, 0) || 1;
    return (
      <div style={{ background: 'white', borderRadius: 14, padding: 16, margin: '0 12px 10px', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#1a1a1a' }}>💳 שיטות תשלום</div>
        {data.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#888', padding: 12, fontSize: 13 }}>אין תשלומים בתקופה זו</div>
        ) : data.map((t, i) => (
          <React.Fragment key={t.name}>
            <div onClick={() => toggle('pay_' + i)} style={{ marginBottom: 10, cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                <span style={{ fontWeight: 500 }}>{t.name}</span>
                <span style={{ color: '#888' }}>{t.count} · ₪{t.total.toLocaleString()}</span>
              </div>
              <div style={{ height: 6, background: '#F0E4D0', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(t.total / totalAll) * 100}%`, background: '#3B82F6', borderRadius: 3 }} />
              </div>
            </div>
            {expanded === 'pay_' + i && renderList(t.name, t.list.map(p => ({
              key: p.id, icon: '💳', name: getName(p.trainee_id), detail: p.package_name, value: `₪${Number(p.final_price) || 0}`,
            })))}
          </React.Fragment>
        ))}
      </div>
    );
  };

  // ─── Section: Trainees tab ────────────────────────────────────
  const renderTraineesList = () => {
    const now = new Date();
    const stats = trainees.map(t => {
      const myPkgs = packages.filter(p => p.trainee_id === t.id);
      const activePkg = myPkgs.find(p => {
        const isActive = p.status === 'פעיל' || p.status === 'active';
        const remaining = (p.total_sessions || 0) - (p.used_sessions || 0);
        const ed = p.expires_at || p.end_date;
        const expired = ed && new Date(ed) < now;
        return isActive && remaining > 0 && !expired;
      });
      const mySessions = sessions.filter(s => traineeIdsFromSession(s).includes(t.id));
      return {
        id: t.id, name: t.full_name, phone: t.phone,
        sessionCount: mySessions.length,
        totalPaid: myPkgs.reduce((s, p) => s + (Number(p.final_price) || 0), 0),
        activePkg, pkgs: myPkgs, sessions: mySessions,
        joined: t.created_at,
      };
    });
    const totalT = stats.length;
    const activeT = stats.filter(s => s.activePkg).length;
    const inactiveT = totalT - activeT;
    return (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, padding: '0 12px 10px' }}>
          <div style={{ background: 'white', borderRadius: 14, padding: 12, textAlign: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 22, fontWeight: 500, color: '#1a1a1a' }}>{totalT}</div>
            <div style={{ fontSize: 11, color: '#888', fontWeight: 600 }}>סה״כ</div>
          </div>
          <div style={{ background: 'white', borderRadius: 14, padding: 12, textAlign: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 22, fontWeight: 500, color: '#16a34a' }}>{activeT}</div>
            <div style={{ fontSize: 11, color: '#888', fontWeight: 600 }}>פעילים</div>
          </div>
          <div style={{ background: 'white', borderRadius: 14, padding: 12, textAlign: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 22, fontWeight: 500, color: '#dc2626' }}>{inactiveT}</div>
            <div style={{ fontSize: 11, color: '#888', fontWeight: 600 }}>ללא חבילה</div>
          </div>
        </div>

        {stats.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#888', padding: 20, fontSize: 13 }}>אין מתאמנים</div>
        ) : stats.map(t => (
          <React.Fragment key={t.id}>
            <div onClick={() => toggle('tr_' + t.id)} style={{
              background: 'white', borderRadius: 14, padding: 14, margin: '0 12px 8px',
              cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
              border: expanded === 'tr_' + t.id ? '2px solid #FF6F20' : '0.5px solid transparent',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: t.activePkg ? '#E8F5E9' : '#F3F4F6',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                {t.activePkg ? '🟢' : '⚪'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a' }}>{t.name}</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                  {t.sessionCount} מפגשים · ₪{t.totalPaid.toLocaleString()}
                </div>
              </div>
              <div style={{ fontSize: 14, color: '#888' }}>▼</div>
            </div>
            {expanded === 'tr_' + t.id && (
              <div style={{ background: '#FFF9F0', borderRadius: 12, padding: 12, margin: '-4px 12px 8px' }}>
                {t.activePkg && (
                  <div style={{ background: 'white', borderRadius: 10, padding: 10, marginBottom: 8, fontSize: 13, direction: 'rtl' }}>
                    <div style={{ fontWeight: 600 }}>חבילה פעילה: {t.activePkg.package_name}</div>
                    <div style={{ color: '#888', fontSize: 12, marginTop: 2 }}>
                      נותרו {Math.max(0, (t.activePkg.total_sessions || 0) - (t.activePkg.used_sessions || 0))} מתוך {t.activePkg.total_sessions || 0}
                    </div>
                  </div>
                )}
                <div style={{ fontSize: 12, color: '#888', marginBottom: 6, direction: 'rtl' }}>5 מפגשים אחרונים:</div>
                {t.sessions.slice(0, 5).map(s => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', fontSize: 12, direction: 'rtl' }}>
                    <span>{statusIcon(s.status)}</span>
                    <span>{fmtDate(s.date)}</span>
                    <span style={{ color: '#888' }}>· {statusLabel(s.status)}</span>
                  </div>
                ))}
                {t.sessions.length === 0 && <div style={{ fontSize: 12, color: '#888', direction: 'rtl' }}>אין מפגשים</div>}
                {t.joined && <div style={{ fontSize: 11, color: '#aaa', marginTop: 8, direction: 'rtl' }}>הצטרף: {fmtDate(t.joined)}</div>}
              </div>
            )}
          </React.Fragment>
        ))}
      </>
    );
  };

  // ─── Render ───────────────────────────────────────────────────
  return (
    <ProtectedCoachPage>
      <div style={{ minHeight: '100vh', background: '#FFF9F0', paddingBottom: 100, direction: 'rtl' }}>
        <style>{`@keyframes _rep_spin { to { transform: rotate(360deg); } }`}</style>

        <div className="max-w-2xl mx-auto">
          <div style={{ padding: 16, textAlign: 'right' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1a1a1a' }}>📊 דוחות וסיכום כספי</div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, padding: '0 12px 10px' }}>
            {TABS.map(t => (
              <div key={t.id} onClick={() => { setActiveTab(t.id); setExpanded(null); }}
                style={{
                  flex: 1, textAlign: 'center', padding: '10px 4px', borderRadius: 12,
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: activeTab === t.id ? '#FF6F20' : 'white',
                  color: activeTab === t.id ? 'white' : '#1a1a1a',
                  border: activeTab === t.id ? 'none' : '0.5px solid #F0E4D0',
                  boxShadow: activeTab === t.id ? 'none' : '0 2px 6px rgba(0,0,0,0.04)',
                }}>{t.icon} {t.label}</div>
            ))}
          </div>

          {/* Time filter */}
          <div style={{ display: 'flex', gap: 4, padding: '0 12px 12px', overflowX: 'auto' }}>
            {TIMES.map(t => (
              <div key={t.id} onClick={() => setTimeFilter(t.id)}
                style={{
                  padding: '5px 12px', borderRadius: 16, fontSize: 11, fontWeight: 600,
                  cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                  background: timeFilter === t.id ? '#1a1a1a' : 'white',
                  color: timeFilter === t.id ? 'white' : '#888',
                  border: timeFilter === t.id ? 'none' : '0.5px solid #F0E4D0',
                }}>{t.label}</div>
            ))}
          </div>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
              <div style={{ width: 36, height: 36, border: '3px solid #F0E4D0', borderTop: '3px solid #FF6F20', borderRadius: '50%', animation: '_rep_spin 0.8s linear infinite' }} />
            </div>
          ) : (
            <>
              {/* OVERVIEW */}
              {activeTab === 'overview' && (
                <>
                  {/* Revenue hero */}
                  <div onClick={() => toggle('rev_hero')} style={{
                    background: '#FF6F20', borderRadius: 16, padding: 18,
                    margin: '0 12px 10px', textAlign: 'center', cursor: 'pointer',
                    border: expanded === 'rev_hero' ? '3px solid #1a1a1a' : 'none',
                  }}>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>הכנסות בתקופה</div>
                    <div style={{ fontSize: 32, fontWeight: 700, color: 'white' }}>₪{totalRevenue.toLocaleString()}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>סה״כ לכל הזמנים: ₪{allTimeRevenue.toLocaleString()}</div>
                  </div>
                  {expanded === 'rev_hero' && renderList('חבילות שנמכרו', filteredPkgs.map(p => ({
                    key: p.id, icon: '🎫', name: getName(p.trainee_id), detail: p.package_name, value: `₪${Number(p.final_price) || 0}`,
                  })))}

                  {/* 4 KPIs */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '0 12px 10px' }}>
                    {renderKPI('מפגשים', filtered.length, '#FF6F20', 'all_sessions',
                      filtered.map(s => ({ key: s.id, icon: statusIcon(s.status), name: getName(s.trainee_id), detail: fmtDate(s.date), value: statusLabel(s.status) })))}
                    {renderKPI('הושלמו', completed.length, '#16a34a', 'completed_k',
                      completed.map(s => ({ key: s.id, icon: '✅', name: getName(s.trainee_id), detail: fmtDate(s.date) })))}
                    {renderKPI('ממתינים', pending.length, '#EAB308', 'pending_k',
                      pending.map(s => ({ key: s.id, icon: '⏳', name: getName(s.trainee_id), detail: fmtDate(s.date) })))}
                    {renderKPI('בוטלו', cancelled.length, '#dc2626', 'cancelled_k',
                      cancelled.map(s => ({ key: s.id, icon: '❌', name: getName(s.trainee_id), detail: fmtDate(s.date) })))}
                  </div>

                  {renderAttendance()}
                  {renderSessionsChart()}
                  {renderPackageStatus()}
                </>
              )}

              {/* SESSIONS */}
              {activeTab === 'sessions' && (
                <>
                  {renderTopTrainees()}
                  {renderTypeBreakdown()}
                  {renderBusiestDays()}
                  {renderRecentSessions()}
                </>
              )}

              {/* FINANCIAL */}
              {activeTab === 'financial' && (
                <>
                  <div onClick={() => toggle('rev_hero_f')} style={{
                    background: '#FF6F20', borderRadius: 16, padding: 18,
                    margin: '0 12px 10px', textAlign: 'center', cursor: 'pointer',
                    border: expanded === 'rev_hero_f' ? '3px solid #1a1a1a' : 'none',
                  }}>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>הכנסות בתקופה</div>
                    <div style={{ fontSize: 32, fontWeight: 700, color: 'white' }}>₪{totalRevenue.toLocaleString()}</div>
                  </div>
                  {expanded === 'rev_hero_f' && renderList('חבילות שנמכרו', filteredPkgs.map(p => ({
                    key: p.id, icon: '🎫', name: getName(p.trainee_id), detail: p.package_name, value: `₪${Number(p.final_price) || 0}`,
                  })))}

                  {renderProfitableClients()}
                  {renderRevenueChart()}
                  {renderPackageTypes()}
                  {renderMonthlyComparison()}
                  {renderPaymentMethods()}
                </>
              )}

              {/* TRAINEES */}
              {activeTab === 'trainees' && renderTraineesList()}
            </>
          )}
        </div>
      </div>
    </ProtectedCoachPage>
  );
}
