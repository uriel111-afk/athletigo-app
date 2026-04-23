import React, { useState, useEffect, useContext, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { normalizeStatus } from '@/lib/enums';
import { createPageUrl } from '@/utils';
import ProtectedCoachPage from '../components/ProtectedCoachPage';
import PackageDetailsDialog from '../components/PackageDetailsDialog';
import PackageFormDialog from '../components/forms/PackageFormDialog';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

// Single unified data page for the coach. Accordion of 5 sections —
// only one open at a time — covering everything that used to live in
// PackageStats, ConversionDashboard, and the prior tabbed Reports.
// All numbers are computed from real Supabase rows; realtime
// subscriptions on 4 tables keep the page in sync as data changes.

const TIMES = [
  { id: 'week',    label: 'השבוע' },
  { id: 'month',   label: 'החודש' },
  { id: '3months', label: '3 חודשים' },
  { id: 'year',    label: 'שנה' },
  { id: 'all',     label: 'הכל' },
];

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
  const navigate = useNavigate();
  const [timeFilter, setTimeFilter] = useState('month');
  const [openSection, setOpenSection] = useState(null);
  const [openSub, setOpenSub] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [trainees, setTrainees] = useState([]);
  const [packages, setPackages] = useState([]);
  const [leads, setLeads] = useState([]);
  const [pkgFilter, setPkgFilter] = useState('all'); // packages section sub-filter
  // Preserved dialogs from the old PackageStats — still openable from
  // the packages section so coaches can see + edit a single package.
  const [selectedPkg, setSelectedPkg] = useState(null);
  const [editingPkg, setEditingPkg] = useState(null);

  const toggleSection = (key) => {
    setOpenSection(prev => prev === key ? null : key);
    setOpenSub(null);
  };
  const toggleSub = (key) => setOpenSub(prev => prev === key ? null : key);

  const fetchAll = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const [sRes, tRes, pRes, lRes] = await Promise.all([
      supabase.from('sessions')
        .select('id, date, time, status, session_type, trainee_id, service_id, participants, created_at')
        .eq('coach_id', user.id)
        .order('date', { ascending: false }),
      supabase.from('users')
        .select('id, full_name, phone, email, created_at')
        .eq('coach_id', user.id)
        .eq('role', 'trainee'),
      supabase.from('client_services')
        .select('id, trainee_id, package_name, package_type, service_type, total_sessions, used_sessions, sessions_remaining, final_price, payment_method, status, start_date, end_date, expires_at, created_at')
        .eq('coach_id', user.id),
      supabase.from('leads')
        .select('id, full_name, phone, email, status, source, coach_notes, created_at')
        .eq('coach_id', user.id)
        .order('created_at', { ascending: false }),
    ]);
    setSessions(sRes.data || []);
    setTrainees(tRes.data || []);
    setPackages(pRes.data || []);
    setLeads(lRes.data || []);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Realtime on all 4 tables
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase.channel('unified_reports_' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions',         filter: `coach_id=eq.${user.id}` }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_services',  filter: `coach_id=eq.${user.id}` }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users',            filter: `coach_id=eq.${user.id}` }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads',            filter: `coach_id=eq.${user.id}` }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, fetchAll]);

  // ─── Derived helpers ────────────────────────────────────────
  const traineeNameById = useMemo(() => {
    const m = new Map();
    for (const t of trainees) m.set(t.id, t.full_name);
    return m;
  }, [trainees]);
  const getName = (id) => traineeNameById.get(id) || 'לא ידוע';

  const traineeIdsFromSession = (s) => {
    const ids = new Set();
    if (s.trainee_id) ids.add(s.trainee_id);
    if (Array.isArray(s.participants)) for (const p of s.participants) if (p?.trainee_id) ids.add(p.trainee_id);
    return Array.from(ids);
  };

  const startDate = getStartDate(timeFilter);
  const filtered = useMemo(() => (
    startDate ? sessions.filter(s => s.date && new Date(s.date) >= startDate) : sessions
  ), [sessions, startDate]);
  const filteredPkgs = useMemo(() => (
    startDate ? packages.filter(p => p.created_at && new Date(p.created_at) >= startDate) : packages
  ), [packages, startDate]);
  const filteredLeads = useMemo(() => (
    startDate ? leads.filter(l => l.created_at && new Date(l.created_at) >= startDate) : leads
  ), [leads, startDate]);

  const completed = filtered.filter(s => { const n = normalizeStatus(s.status); return n === 'completed' || n === 'present'; });
  const cancelled = filtered.filter(s => normalizeStatus(s.status) === 'cancelled');
  const pending   = filtered.filter(s => normalizeStatus(s.status) === 'pending');

  const totalRevenue = filteredPkgs.reduce((s, p) => s + (Number(p.final_price) || 0), 0);
  const allTimeRevenue = packages.reduce((s, p) => s + (Number(p.final_price) || 0), 0);

  // ─── Tiny helpers shared across sections ─────────────────────
  const SectionCard = ({ id, icon, title, subtitle, valueRight, valueLabel, valueColor = '#1a1a1a', children }) => {
    const open = openSection === id;
    return (
      <div style={{ margin: '0 12px 8px' }}>
        <div onClick={() => toggleSection(id)} style={{
          background: 'white', borderRadius: open ? '14px 14px 0 0' : 14,
          padding: 14, boxShadow: '0 2px 6px rgba(0,0,0,0.04)', cursor: 'pointer',
          border: open ? '2px solid #FF6F20' : '0.5px solid transparent',
          borderBottom: open ? 'none' : undefined,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{ fontSize: 24 }}>{icon}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a' }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{subtitle}</div>}
          </div>
          {valueRight !== undefined && (
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: valueColor }}>{valueRight}</div>
              {valueLabel && <div style={{ fontSize: 10, color: '#888' }}>{valueLabel}</div>}
            </div>
          )}
          <div style={{ fontSize: 14, color: '#888', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</div>
        </div>
        {open && (
          <div style={{
            background: 'white', borderRadius: '0 0 14px 14px', padding: 14,
            border: '2px solid #FF6F20', borderTop: 'none', textAlign: 'right',
          }}>
            {children}
          </div>
        )}
      </div>
    );
  };

  const Sublist = ({ title, items, onItemClick }) => (
    <div style={{
      background: '#FFF9F0', borderRadius: 10, padding: 10,
      maxHeight: 280, overflowY: 'auto', marginTop: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#1a1a1a' }}>{title} ({items.length})</span>
        <span onClick={(e) => { e.stopPropagation(); setOpenSub(null); }} style={{ cursor: 'pointer', color: '#888', fontSize: 14 }}>✕</span>
      </div>
      {items.length > 0 ? items.slice(0, 50).map((item, i) => (
        <div key={item.key || i}
          onClick={onItemClick ? (e) => { e.stopPropagation(); onItemClick(item); } : undefined}
          style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '6px 0',
            borderBottom: i < Math.min(50, items.length) - 1 ? '0.5px solid #F0E4D0' : 'none',
            fontSize: 12, cursor: onItemClick ? 'pointer' : 'default',
          }}>
          {item.icon && <span style={{ fontSize: 13 }}>{item.icon}</span>}
          <span style={{ flex: 1, fontWeight: 500, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
          {item.detail && <span style={{ color: '#888', fontSize: 11 }}>{item.detail}</span>}
          {item.value && <span style={{ fontWeight: 600, color: '#FF6F20' }}>{item.value}</span>}
        </div>
      )) : <div style={{ textAlign: 'center', color: '#888', padding: 10, fontSize: 12 }}>אין נתונים</div>}
    </div>
  );

  // ─── Section: Revenue ────────────────────────────────────────
  const renderRevenue = () => {
    const now = new Date();
    const thisStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const thisRev = packages.filter(p => p.created_at && new Date(p.created_at) >= thisStart).reduce((s, p) => s + (Number(p.final_price) || 0), 0);
    const lastRev = packages.filter(p => {
      if (!p.created_at) return false;
      const d = new Date(p.created_at);
      return d >= lastStart && d < thisStart;
    }).reduce((s, p) => s + (Number(p.final_price) || 0), 0);
    const change = lastRev > 0 ? Math.round((thisRev - lastRev) / lastRev * 100) : (thisRev > 0 ? 100 : 0);

    const profitableClients = trainees.map(t => {
      const myPkgs = packages.filter(p => p.trainee_id === t.id);
      return { id: t.id, name: t.full_name, totalPaid: myPkgs.reduce((s, p) => s + (Number(p.final_price) || 0), 0), pkgCount: myPkgs.length, pkgs: myPkgs };
    }).filter(c => c.totalPaid > 0).sort((a, b) => b.totalPaid - a.totalPaid).slice(0, 10);

    const paymentMethods = (() => {
      const m = new Map();
      for (const p of filteredPkgs) {
        const k = p.payment_method || 'לא צוין';
        const prev = m.get(k) || { method: k, count: 0, total: 0 };
        prev.count++; prev.total += Number(p.final_price) || 0;
        m.set(k, prev);
      }
      return Array.from(m.values()).sort((a, b) => b.total - a.total);
    })();

    // Revenue chart bars
    const chartGroups = new Map();
    for (const p of filteredPkgs) {
      if (!p.created_at) continue;
      const d = new Date(p.created_at);
      const k = `${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`;
      chartGroups.set(k, (chartGroups.get(k) || 0) + (Number(p.final_price) || 0));
    }
    const chartData = Array.from(chartGroups.entries()).slice(-12);
    const maxV = Math.max(...chartData.map(([, v]) => v), 1);

    return (
      <SectionCard id="revenue" icon="💰" title="הכנסות" subtitle="סיכום כספי"
        valueRight={`₪${totalRevenue.toLocaleString()}`} valueLabel="בתקופה" valueColor="#16a34a">
        {/* Monthly comparison */}
        <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: 14 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#888' }}>החודש</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#16a34a' }}>₪{thisRev.toLocaleString()}</div>
          </div>
          <div style={{ width: '0.5px', background: '#E5E5E5' }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#888' }}>חודש קודם</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#888' }}>₪{lastRev.toLocaleString()}</div>
          </div>
          <div style={{ width: '0.5px', background: '#E5E5E5' }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#888' }}>שינוי</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: change >= 0 ? '#16a34a' : '#dc2626' }}>{change >= 0 ? '+' : ''}{change}%</div>
          </div>
        </div>

        {/* Revenue chart */}
        {chartData.length > 0 && (
          <>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#1a1a1a', marginBottom: 6 }}>הכנסות לאורך זמן</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 80, marginBottom: 14 }}>
              {chartData.map(([label, v]) => {
                const h = (v / maxV) * 60;
                return (
                  <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    <div style={{ fontSize: 8, fontWeight: 600, color: '#1a1a1a' }}>₪{Math.round(v / 1000)}k</div>
                    <div style={{ width: '100%', height: Math.max(h, 4), background: '#16a34a', borderRadius: '3px 3px 0 0' }} />
                    <div style={{ fontSize: 8, color: '#888' }}>{label}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Profitable clients */}
        <div style={{ fontSize: 12, fontWeight: 600, color: '#1a1a1a', marginTop: 4, marginBottom: 6 }}>💎 לקוחות מובילים</div>
        {profitableClients.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#888', padding: 8, fontSize: 12 }}>אין הכנסות עדיין</div>
        ) : profitableClients.map((c, i) => (
          <React.Fragment key={c.id}>
            <div onClick={(e) => { e.stopPropagation(); toggleSub('client_' + c.id); }} style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '6px 0',
              borderBottom: i < profitableClients.length - 1 ? '0.5px solid #F8F0E8' : 'none',
              fontSize: 13, cursor: 'pointer',
            }}>
              <span style={{ width: 20, textAlign: 'center', fontWeight: 700, color: i < 3 ? '#FF6F20' : '#888' }}>{i + 1}</span>
              <span style={{ flex: 1, fontWeight: 500 }}>{c.name}</span>
              <span style={{ color: '#888', fontSize: 11 }}>{c.pkgCount} חבילות</span>
              <span style={{ fontWeight: 700, color: '#16a34a' }}>₪{c.totalPaid.toLocaleString()}</span>
            </div>
            {openSub === 'client_' + c.id && (
              <Sublist title={c.name} items={c.pkgs.map(p => ({
                key: p.id, icon: '🎫', name: p.package_name, detail: p.payment_method || 'לא צוין', value: `₪${Number(p.final_price) || 0}`,
              }))} />
            )}
          </React.Fragment>
        ))}

        {/* Payment methods */}
        <div style={{ fontSize: 12, fontWeight: 600, color: '#1a1a1a', marginTop: 14, marginBottom: 6 }}>💳 אמצעי תשלום</div>
        {paymentMethods.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#888', padding: 6, fontSize: 12 }}>אין נתונים</div>
        ) : paymentMethods.map(pm => (
          <div key={pm.method} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12 }}>
            <span style={{ fontWeight: 500 }}>{pm.method}</span>
            <span style={{ color: '#888' }}>{pm.count} · ₪{pm.total.toLocaleString()}</span>
          </div>
        ))}

        {/* Total all-time small footer */}
        <div style={{ marginTop: 14, paddingTop: 10, borderTop: '0.5px solid #F0E4D0', fontSize: 11, color: '#888', textAlign: 'center' }}>
          סה״כ לכל הזמנים: <b style={{ color: '#1a1a1a' }}>₪{allTimeRevenue.toLocaleString()}</b>
        </div>
      </SectionCard>
    );
  };

  // ─── Section: Sessions ───────────────────────────────────────
  const renderSessions = () => {
    const rate = filtered.length > 0 ? Math.round(completed.length / filtered.length * 100) : 0;
    const dash = (rate / 100) * 226;

    // Top trainees
    const topTrainees = trainees.map(t => {
      const mine = filtered.filter(s => traineeIdsFromSession(s).includes(t.id));
      const count = mine.filter(s => { const n = normalizeStatus(s.status); return n === 'completed' || n === 'present'; }).length;
      return { id: t.id, name: t.full_name, count };
    }).filter(t => t.count > 0).sort((a, b) => b.count - a.count).slice(0, 5);

    // Type breakdown
    const types = ['אישי', 'קבוצתי', 'אונליין'];
    const typeColors = { 'אישי': '#FF6F20', 'קבוצתי': '#7F47B5', 'אונליין': '#3B82F6' };
    const total = filtered.length || 1;
    const typeData = types.map(t => {
      const list = filtered.filter(s => (s.session_type || '').trim() === t);
      return { type: t, count: list.length, percent: Math.round(list.length / total * 100), color: typeColors[t] };
    }).filter(t => t.count > 0);

    // Sessions chart
    const chartGroups = new Map();
    const isDaily = timeFilter === 'week' || timeFilter === 'month';
    for (const s of filtered) {
      if (!s.date) continue;
      const d = new Date(s.date);
      const k = isDaily ? `${d.getDate()}/${d.getMonth() + 1}` : `${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`;
      chartGroups.set(k, (chartGroups.get(k) || 0) + 1);
    }
    const chartData = Array.from(chartGroups.entries()).slice(-12);
    const maxV = Math.max(...chartData.map(([, v]) => v), 1);

    const recent = filtered.slice(0, 15);

    return (
      <SectionCard id="sessions" icon="📅" title="מפגשים" subtitle="פעילות אימונים"
        valueRight={`${completed.length}/${filtered.length}`} valueLabel="הושלמו" valueColor="#FF6F20">
        {/* 4 mini KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6, marginBottom: 14 }}>
          {[
            { v: filtered.length, l: 'סה״כ', c: '#1a1a1a' },
            { v: completed.length, l: 'הושלמו', c: '#16a34a' },
            { v: pending.length, l: 'ממתינים', c: '#EAB308' },
            { v: cancelled.length, l: 'בוטלו', c: '#dc2626' },
          ].map((k, i) => (
            <div key={i} style={{ background: '#FFF9F0', borderRadius: 10, padding: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 600, color: k.c }}>{k.v}</div>
              <div style={{ fontSize: 10, color: '#888', fontWeight: 600, marginTop: 2 }}>{k.l}</div>
            </div>
          ))}
        </div>

        {/* Attendance circle */}
        <div onClick={(e) => { e.stopPropagation(); toggleSub('att'); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', marginBottom: 14, padding: 8, borderRadius: 10, background: '#FFF9F0', cursor: 'pointer' }}>
          <svg width="70" height="70" viewBox="0 0 90 90">
            <circle cx="45" cy="45" r="36" fill="none" stroke="#F0E4D0" strokeWidth="6" />
            <circle cx="45" cy="45" r="36" fill="none" stroke="#FF6F20" strokeWidth="6"
              strokeDasharray={`${dash} 226`} transform="rotate(-90 45 45)" strokeLinecap="round" />
            <text x="45" y="45" textAnchor="middle" dominantBaseline="middle" fontSize="18" fontWeight="600" fill="#1a1a1a">{rate}%</text>
          </svg>
          <div style={{ textAlign: 'right', fontSize: 12, color: '#888', lineHeight: 1.7 }}>
            <div>הושלמו: <b style={{ color: '#16a34a' }}>{completed.length}</b></div>
            <div>בוטלו: <b style={{ color: '#dc2626' }}>{cancelled.length}</b></div>
            <div>אחוז נוכחות</div>
          </div>
        </div>
        {openSub === 'att' && (() => {
          const perTrainee = trainees.map(t => {
            const mine = filtered.filter(s => traineeIdsFromSession(s).includes(t.id));
            const comp = mine.filter(s => { const n = normalizeStatus(s.status); return n === 'completed' || n === 'present'; }).length;
            const tot = mine.length;
            return { id: t.id, name: t.full_name, comp, tot, rate: tot > 0 ? Math.round(comp / tot * 100) : 0 };
          }).filter(t => t.tot > 0).sort((a, b) => b.rate - a.rate);
          return <Sublist title="פירוט לפי מתאמן" items={perTrainee.map(t => ({ key: t.id, icon: '👤', name: t.name, detail: `${t.comp}/${t.tot}`, value: `${t.rate}%` }))} />;
        })()}

        {/* Sessions chart */}
        {chartData.length > 0 && (
          <>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#1a1a1a', marginBottom: 6 }}>📊 לאורך זמן</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 80, marginBottom: 14 }}>
              {chartData.map(([label, count]) => {
                const h = (count / maxV) * 60;
                return (
                  <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    <div style={{ fontSize: 9, fontWeight: 600, color: '#1a1a1a' }}>{count}</div>
                    <div style={{ width: '100%', height: Math.max(h, 4), background: '#FF6F20', borderRadius: '3px 3px 0 0' }} />
                    <div style={{ fontSize: 8, color: '#888' }}>{label}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Top trainees */}
        {topTrainees.length > 0 && (
          <>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#1a1a1a', marginBottom: 6 }}>🏆 מתאמנים מובילים</div>
            {topTrainees.map((t, i) => (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '5px 0',
                borderBottom: i < topTrainees.length - 1 ? '0.5px solid #F8F0E8' : 'none', fontSize: 13,
              }}>
                <span style={{ width: 20, textAlign: 'center', fontWeight: 700, color: i < 3 ? '#FF6F20' : '#888' }}>{i + 1}</span>
                <span style={{ flex: 1, fontWeight: 500 }}>{t.name}</span>
                <span style={{ color: '#FF6F20', fontWeight: 600 }}>{t.count}</span>
              </div>
            ))}
          </>
        )}

        {/* Type breakdown */}
        {typeData.length > 0 && (
          <>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#1a1a1a', marginTop: 14, marginBottom: 6 }}>📋 לפי סוג</div>
            {typeData.map(t => (
              <div key={t.type} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                  <span style={{ fontWeight: 500 }}>{t.type}</span>
                  <span style={{ color: '#888' }}>{t.count} ({t.percent}%)</span>
                </div>
                <div style={{ height: 5, background: '#F0E4D0', borderRadius: 3 }}>
                  <div style={{ height: '100%', width: `${t.percent}%`, background: t.color, borderRadius: 3 }} />
                </div>
              </div>
            ))}
          </>
        )}

        {/* Recent sessions */}
        <div style={{ fontSize: 12, fontWeight: 600, color: '#1a1a1a', marginTop: 14, marginBottom: 6 }}>🕐 מפגשים אחרונים</div>
        {recent.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#888', padding: 8, fontSize: 12 }}>אין נתונים</div>
        ) : recent.map(s => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 0', borderBottom: '0.5px solid #F8F0E8', fontSize: 12 }}>
            <span>{statusIcon(s.status)}</span>
            <span style={{ flex: 1, fontWeight: 500 }}>{getName(s.trainee_id)}</span>
            <span style={{ color: '#888', fontSize: 11 }}>{fmtDate(s.date)}</span>
            <span style={{ color: '#888', fontSize: 11 }}>{statusLabel(s.status)}</span>
          </div>
        ))}
      </SectionCard>
    );
  };

  // ─── Section: Packages ───────────────────────────────────────
  const renderPackages = () => {
    const now = new Date();
    const in14 = new Date(now.getTime() + 14 * 86400000);
    const bucketOf = (p) => {
      const total = p.total_sessions || 0;
      const used = p.used_sessions || 0;
      const remaining = Math.max(0, total - used);
      const ed = p.expires_at || p.end_date;
      const exp = ed ? new Date(ed) : null;
      const isActive = p.status === 'פעיל' || p.status === 'active';
      if (['completed', 'הסתיים'].includes(p.status) || (total > 0 && used >= total)) return 'completed';
      if (['expired', 'פג תוקף', 'cancelled', 'בוטל'].includes(p.status) || (exp && exp < now)) return 'expired';
      if (isActive && (remaining === 1 || (exp && exp <= in14))) return 'expiring';
      if (isActive) return 'active';
      return 'expired';
    };
    let active = 0, expiring = 0, expired = 0, completedPkgs = 0;
    let totalSessionsAll = 0, usedSessionsAll = 0;
    for (const p of packages) {
      const b = bucketOf(p);
      if (b === 'active') active++;
      else if (b === 'expiring') expiring++;
      else if (b === 'expired') expired++;
      else if (b === 'completed') completedPkgs++;
      totalSessionsAll += p.total_sessions || 0;
      usedSessionsAll += p.used_sessions || 0;
    }
    const utilizationPct = totalSessionsAll > 0 ? Math.round(usedSessionsAll / totalSessionsAll * 100) : 0;
    const dash = (utilizationPct / 100) * 226;

    const filtersList = [
      { id: 'all',       label: 'הכל' },
      { id: 'active',    label: '🟢 פעילות' },
      { id: 'expiring',  label: '⚡ מסתיימות' },
      { id: 'expired',   label: '🔴 הסתיימו' },
      { id: 'completed', label: '✅ הושלמו' },
    ];
    const visiblePkgs = pkgFilter === 'all' ? packages : packages.filter(p => bucketOf(p) === pkgFilter);

    return (
      <SectionCard id="packages" icon="🎫" title="חבילות" subtitle={`${active} פעילות`}
        valueRight={packages.length} valueLabel="סה״כ" valueColor="#FF6F20">
        {/* Status counts */}
        <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: 14 }}>
          <div style={{ textAlign: 'center' }}><div style={{ fontSize: 18, fontWeight: 600, color: '#16a34a' }}>{active}</div><div style={{ fontSize: 10, color: '#888' }}>פעילות</div></div>
          <div style={{ textAlign: 'center' }}><div style={{ fontSize: 18, fontWeight: 600, color: '#EAB308' }}>{expiring}</div><div style={{ fontSize: 10, color: '#888' }}>מסתיימות</div></div>
          <div style={{ textAlign: 'center' }}><div style={{ fontSize: 18, fontWeight: 600, color: '#dc2626' }}>{expired}</div><div style={{ fontSize: 10, color: '#888' }}>הסתיימו</div></div>
          <div style={{ textAlign: 'center' }}><div style={{ fontSize: 18, fontWeight: 600, color: '#888' }}>{completedPkgs}</div><div style={{ fontSize: 10, color: '#888' }}>סיימו</div></div>
        </div>

        {/* Utilization */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', marginBottom: 14, padding: 8, borderRadius: 10, background: '#FFF9F0' }}>
          <svg width="70" height="70" viewBox="0 0 90 90">
            <circle cx="45" cy="45" r="36" fill="none" stroke="#F0E4D0" strokeWidth="6" />
            <circle cx="45" cy="45" r="36" fill="none" stroke="#FF6F20" strokeWidth="6"
              strokeDasharray={`${dash} 226`} transform="rotate(-90 45 45)" strokeLinecap="round" />
            <text x="45" y="45" textAnchor="middle" dominantBaseline="middle" fontSize="16" fontWeight="600" fill="#1a1a1a">{utilizationPct}%</text>
          </svg>
          <div style={{ textAlign: 'right', fontSize: 12, color: '#888', lineHeight: 1.7 }}>
            <div>נוצלו: <b style={{ color: '#16a34a' }}>{usedSessionsAll}</b></div>
            <div>סה״כ: <b style={{ color: '#1a1a1a' }}>{totalSessionsAll}</b></div>
            <div>ניצול חבילות</div>
          </div>
        </div>

        {/* Filter chips */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 8, overflowX: 'auto' }}>
          {filtersList.map(f => (
            <div key={f.id} onClick={(e) => { e.stopPropagation(); setPkgFilter(f.id); }} style={{
              padding: '4px 10px', borderRadius: 16, fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
              background: pkgFilter === f.id ? '#FF6F20' : 'white',
              color: pkgFilter === f.id ? 'white' : '#888',
              border: pkgFilter === f.id ? 'none' : '0.5px solid #F0E4D0',
            }}>{f.label}</div>
          ))}
        </div>

        {/* Package list — tap opens PackageDetailsDialog */}
        {visiblePkgs.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#888', padding: 12, fontSize: 12 }}>אין חבילות בקטגוריה זו</div>
        ) : visiblePkgs.slice(0, 50).map(p => {
          const b = bucketOf(p);
          const remaining = Math.max(0, (p.total_sessions || 0) - (p.used_sessions || 0));
          const emoji = b === 'active' ? '🟢' : b === 'expiring' ? '⚡' : b === 'expired' ? '🔴' : '✅';
          return (
            <div key={p.id} onClick={(e) => { e.stopPropagation(); setSelectedPkg(p); }} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0',
              borderBottom: '0.5px solid #F8F0E8', fontSize: 12, cursor: 'pointer',
            }}>
              <span>{emoji}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getName(p.trainee_id)}</div>
                <div style={{ fontSize: 11, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.package_name || p.service_type || 'חבילה'}</div>
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: remaining === 0 ? '#dc2626' : remaining === 1 ? '#EAB308' : '#16a34a' }}>{remaining}/{p.total_sessions || 0}</div>
                <div style={{ fontSize: 10, color: '#888' }}>₪{Number(p.final_price) || 0}</div>
              </div>
            </div>
          );
        })}
      </SectionCard>
    );
  };

  // ─── Section: Trainees ───────────────────────────────────────
  const renderTrainees = () => {
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
        id: t.id, name: t.full_name,
        sessionCount: mySessions.length,
        totalPaid: myPkgs.reduce((s, p) => s + (Number(p.final_price) || 0), 0),
        activePkg,
      };
    }).sort((a, b) => b.totalPaid - a.totalPaid);
    const activeT = stats.filter(s => s.activePkg).length;

    return (
      <SectionCard id="trainees" icon="👥" title="מתאמנים" subtitle={`${activeT} פעילים`}
        valueRight={trainees.length} valueLabel="סה״כ" valueColor="#7F47B5">
        <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: 12 }}>
          <div style={{ textAlign: 'center' }}><div style={{ fontSize: 18, fontWeight: 600, color: '#16a34a' }}>{activeT}</div><div style={{ fontSize: 10, color: '#888' }}>עם חבילה</div></div>
          <div style={{ textAlign: 'center' }}><div style={{ fontSize: 18, fontWeight: 600, color: '#dc2626' }}>{trainees.length - activeT}</div><div style={{ fontSize: 10, color: '#888' }}>ללא חבילה</div></div>
        </div>
        {stats.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#888', padding: 12, fontSize: 12 }}>אין מתאמנים</div>
        ) : stats.map(t => (
          <div key={t.id} onClick={(e) => { e.stopPropagation(); navigate(createPageUrl('TraineeProfile') + `?userId=${t.id}`); }} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0',
            borderBottom: '0.5px solid #F8F0E8', fontSize: 12, cursor: 'pointer',
          }}>
            <div style={{ width: 30, height: 30, borderRadius: 10, background: t.activePkg ? '#E8F5E9' : '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
              {t.activePkg ? '🟢' : '⚪'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
              <div style={{ fontSize: 11, color: '#888' }}>{t.sessionCount} מפגשים</div>
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#16a34a' }}>₪{t.totalPaid.toLocaleString()}</div>
            </div>
          </div>
        ))}
      </SectionCard>
    );
  };

  // ─── Section: Leads ──────────────────────────────────────────
  const renderLeads = () => {
    if (!leads.length) {
      return (
        <SectionCard id="leads" icon="🎯" title="לידים והמרות" subtitle="אין נתונים על לידים" valueRight={0} valueColor="#888">
          <div style={{ textAlign: 'center', color: '#888', padding: 12, fontSize: 12 }}>טרם נוספו לידים למערכת</div>
        </SectionCard>
      );
    }
    const statusCounts = (() => {
      const m = new Map();
      for (const l of filteredLeads) {
        const k = l.status || 'חדש';
        m.set(k, (m.get(k) || 0) + 1);
      }
      return Array.from(m.entries());
    })();
    const converted = filteredLeads.filter(l => l.status === 'הומר' || l.status === 'converted').length;
    const newLeads = filteredLeads.filter(l => l.status === 'חדש' || l.status === 'new' || !l.status).length;
    const conversionRate = filteredLeads.length > 0 ? Math.round(converted / filteredLeads.length * 100) : 0;

    return (
      <SectionCard id="leads" icon="🎯" title="לידים והמרות" subtitle={`${conversionRate}% המרה`}
        valueRight={`${newLeads}/${filteredLeads.length}`} valueLabel="חדשים" valueColor="#7F47B5">
        {/* Status breakdown */}
        <div style={{ fontSize: 12, fontWeight: 600, color: '#1a1a1a', marginBottom: 6 }}>סטטוסים</div>
        {statusCounts.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#888', padding: 6, fontSize: 12 }}>אין לידים בתקופה זו</div>
        ) : statusCounts.map(([status, count]) => {
          const pct = Math.round(count / filteredLeads.length * 100);
          return (
            <div key={status} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                <span style={{ fontWeight: 500 }}>{status}</span>
                <span style={{ color: '#888' }}>{count} ({pct}%)</span>
              </div>
              <div style={{ height: 5, background: '#F0E4D0', borderRadius: 3 }}>
                <div style={{ height: '100%', width: `${pct}%`, background: '#7F47B5', borderRadius: 3 }} />
              </div>
            </div>
          );
        })}

        {/* Recent leads */}
        <div style={{ fontSize: 12, fontWeight: 600, color: '#1a1a1a', marginTop: 14, marginBottom: 6 }}>לידים אחרונים</div>
        {filteredLeads.slice(0, 10).map(l => (
          <div key={l.id} onClick={(e) => { e.stopPropagation(); navigate(createPageUrl('Leads')); }} style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '6px 0',
            borderBottom: '0.5px solid #F8F0E8', fontSize: 12, cursor: 'pointer',
          }}>
            <span style={{ fontSize: 13 }}>🎯</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.full_name || 'ללא שם'}</div>
              <div style={{ fontSize: 11, color: '#888' }}>{l.source || 'לא צוין'} · {fmtDate(l.created_at)}</div>
            </div>
            <span style={{ fontSize: 11, color: '#888', padding: '2px 6px', borderRadius: 8, background: '#F0E4D0' }}>{l.status || 'חדש'}</span>
          </div>
        ))}
      </SectionCard>
    );
  };

  // ─── Render ──────────────────────────────────────────────────
  return (
    <ProtectedCoachPage>
      <div style={{ minHeight: '100vh', background: '#FFF9F0', paddingBottom: 100, direction: 'rtl' }}>
        <style>{`@keyframes _rep_spin { to { transform: rotate(360deg); } }`}</style>

        <div className="max-w-2xl mx-auto">
          <div style={{ padding: 16, textAlign: 'right' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1a1a1a' }}>📊 דוחות ונתונים</div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>סקירה מאוחדת של הפעילות שלך</div>
          </div>

          {/* Time filter */}
          <div style={{ display: 'flex', gap: 4, padding: '0 12px 12px', overflowX: 'auto' }}>
            {TIMES.map(t => (
              <div key={t.id} onClick={() => setTimeFilter(t.id)} style={{
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
              {renderRevenue()}
              {renderSessions()}
              {renderPackages()}
              {renderTrainees()}
              {renderLeads()}
            </>
          )}
        </div>

        {/* Preserved package dialogs from old PackageStats */}
        <PackageDetailsDialog isOpen={!!selectedPkg} onClose={() => setSelectedPkg(null)}
          packageData={selectedPkg} onEdit={(pkg) => { setSelectedPkg(null); setEditingPkg(pkg); }} />
        <PackageFormDialog isOpen={!!editingPkg} onClose={() => setEditingPkg(null)}
          traineeId={editingPkg?.trainee_id} traineeName={editingPkg?.trainee_name} editingPackage={editingPkg} />
      </div>
    </ProtectedCoachPage>
  );
}
