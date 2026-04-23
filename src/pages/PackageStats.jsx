import React, { useState, useContext, useMemo } from "react";
import { AuthContext } from "@/lib/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabaseClient";
import { QUERY_KEYS } from "@/components/utils/queryKeys";
import { Package } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { usePackageExpiry } from "../components/hooks/usePackageExpiry";
import PackageDetailsDialog from "../components/PackageDetailsDialog";
import PackageFormDialog from "../components/forms/PackageFormDialog";
import PageLoader from "../components/PageLoader";
import ProtectedCoachPage from "../components/ProtectedCoachPage";

const isActiveStatus = (s) => s === "פעיל" || s === "active";
const isExpiredStatus = (s) => s === "expired" || s === "פג תוקף" || s === "completed" || s === "הסתיים" || s === "cancelled" || s === "בוטל";

function fmt(d) {
  if (!d) return '—';
  try { return format(new Date(d), 'dd/MM/yy', { locale: he }); } catch { return '—'; }
}

function remainingOf(p) {
  return Math.max(0, (p.total_sessions || p.sessions_count || 0) - (p.used_sessions || 0));
}

function priceOf(p) {
  return Number(p.final_price || p.price || 0);
}

// Bucket a package into one of: active / expiring / expired / completed.
function bucketOf(pkg) {
  const status = pkg.status;
  const total = pkg.total_sessions || pkg.sessions_count || 0;
  const used = pkg.used_sessions || 0;
  const remaining = remainingOf(pkg);
  const exp = pkg.expires_at || pkg.end_date;
  const expDate = exp ? new Date(exp) : null;
  const now = new Date();
  const in14 = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  if (status === "completed" || status === "הסתיים") return 'completed';
  if (status === "cancelled" || status === "בוטל") return 'expired';
  if (expDate && expDate < now) return 'expired';
  if (total > 0 && used >= total) return 'completed';
  if (isActiveStatus(status)) {
    if (remaining === 1) return 'expiring';
    if (expDate && expDate >= now && expDate <= in14) return 'expiring';
    return 'active';
  }
  return 'expired';
}

function bucketEmoji(b)  { return b === 'active' ? '🟢' : b === 'expiring' ? '⚡' : b === 'expired' ? '🔴' : '✅'; }
function bucketBg(b)     { return b === 'active' ? '#E8F5E9' : b === 'expiring' ? '#FEF9C3' : b === 'expired' ? '#FFEBEE' : '#F3F4F6'; }
function bucketBorder(b) { return b === 'active' ? '2px solid #FF6F20' : '0.5px solid #F0E4D0'; }
function balanceColor(r) { return r === 0 ? '#dc2626' : r === 1 ? '#EAB308' : '#16a34a'; }

const FILTERS = [
  { id: 'all',       label: 'הכל' },
  { id: 'active',    label: '🟢 פעילות' },
  { id: 'expiring',  label: '⚡ מסתיימות' },
  { id: 'expired',   label: '🔴 הסתיימו' },
  { id: 'completed', label: '✅ הושלמו' },
];

const SORT_OPTIONS = [
  { id: 'newest',    label: 'חדש → ישן' },
  { id: 'expiry',    label: 'לפי תפוגה' },
  { id: 'remaining', label: 'לפי יתרה' },
  { id: 'price',     label: 'לפי מחיר' },
];

export default function PackageStats() {
  const { user: coach } = useContext(AuthContext);
  const navigate = useNavigate();
  const [selectedPkg, setSelectedPkg] = useState(null);
  const [editingPkg, setEditingPkg] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [expanded, setExpanded] = useState({});

  usePackageExpiry(coach?.id);

  // Existing query — list of all packages
  const { data: allServices = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.SERVICES,
    queryFn: () => base44.entities.ClientService.list('-created_at', 2000).catch(() => []),
    initialData: [],
  });

  // New: trainees roster for name lookup
  const { data: traineesById = new Map() } = useQuery({
    queryKey: ['pkg-stats-trainees', coach?.id],
    queryFn: async () => {
      if (!coach?.id) return new Map();
      const { data } = await supabase.from('users').select('id, full_name, phone').eq('coach_id', coach.id);
      const m = new Map();
      for (const u of (data || [])) m.set(u.id, u);
      return m;
    },
    enabled: !!coach?.id,
    initialData: new Map(),
  });

  // New: sessions grouped by service_id so the accordion can show
  // linked sessions inline without an extra dialog round-trip.
  const { data: sessionsByService = new Map() } = useQuery({
    queryKey: ['pkg-stats-sessions', coach?.id],
    queryFn: async () => {
      if (!coach?.id) return new Map();
      const { data } = await supabase
        .from('sessions')
        .select('id, date, status, session_type, service_id')
        .eq('coach_id', coach.id)
        .not('service_id', 'is', null)
        .order('date', { ascending: false })
        .limit(1000);
      const m = new Map();
      for (const s of (data || [])) {
        if (!m.has(s.service_id)) m.set(s.service_id, []);
        m.get(s.service_id).push(s);
      }
      return m;
    },
    enabled: !!coach?.id,
    initialData: new Map(),
  });

  const coachServices = useMemo(
    () => coach?.id ? allServices.filter(s => s.coach_id === coach.id) : [],
    [allServices, coach?.id]
  );

  // Per-bucket counts + financials
  const metrics = useMemo(() => {
    let active = 0, expiring = 0, expired = 0, completed = 0;
    let revActive = 0, revAll = 0;
    let totalSessions = 0, usedSessions = 0;
    for (const p of coachServices) {
      const b = bucketOf(p);
      const price = priceOf(p);
      revAll += price;
      if (b === 'active')    { active++; revActive += price; }
      if (b === 'expiring')  { expiring++; revActive += price; }
      if (b === 'expired')   { expired++; }
      if (b === 'completed') { completed++; }
      totalSessions += (p.total_sessions || p.sessions_count || 0);
      usedSessions  += (p.used_sessions || 0);
    }
    const utilizationPct = totalSessions > 0 ? Math.round((usedSessions / totalSessions) * 100) : 0;
    return { active, expiring, expired, completed, revActive, revAll, totalSessions, usedSessions, utilizationPct, totalSold: coachServices.length };
  }, [coachServices]);

  // Package-types breakdown (revenue per type, for the bar chart card)
  const typesBreakdown = useMemo(() => {
    const buckets = { personal: { name: 'אישי', count: 0, revenue: 0 }, group: { name: 'קבוצתי', count: 0, revenue: 0 }, online: { name: 'אונליין', count: 0, revenue: 0 } };
    for (const p of coachServices) {
      const t = (p.package_type || (p.service_type?.includes('קבוצ') ? 'group' : p.service_type?.includes('אונליין') ? 'online' : 'personal')).toLowerCase();
      const key = ['personal','group','online'].includes(t) ? t : 'personal';
      buckets[key].count++;
      buckets[key].revenue += priceOf(p);
    }
    return Object.values(buckets).filter(b => b.count > 0);
  }, [coachServices]);

  // Filtered + searched + sorted list for the accordion
  const visibleList = useMemo(() => {
    const term = search.trim().toLowerCase();
    let list = coachServices.filter(p => filter === 'all' ? true : bucketOf(p) === filter);
    if (term) {
      list = list.filter(p => {
        const tName = (traineesById.get(p.trainee_id)?.full_name || p.trainee_name || '').toLowerCase();
        const pName = (p.package_name || p.service_type || '').toLowerCase();
        return tName.includes(term) || pName.includes(term);
      });
    }
    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sortBy === 'newest')   return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      if (sortBy === 'expiry')   return new Date(a.expires_at || a.end_date || '9999-12-31') - new Date(b.expires_at || b.end_date || '9999-12-31');
      if (sortBy === 'remaining')return remainingOf(a) - remainingOf(b);
      if (sortBy === 'price')    return priceOf(b) - priceOf(a);
      return 0;
    });
    return sorted;
  }, [coachServices, filter, search, sortBy, traineesById]);

  const toggleExpanded = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  if (!coach) return <ProtectedCoachPage><PageLoader /></ProtectedCoachPage>;

  const sendRenewalNudge = (pkg) => {
    // Reuse the existing LastSessionAlert flow (CustomEvent listener
    // mounted in App.jsx) so the coach picks one of three message tones
    // and a notification is written to the trainee.
    const trainee = traineesById.get(pkg.trainee_id);
    window.dispatchEvent(new CustomEvent('athletigo:last-session', {
      detail: {
        coachId: coach.id,
        traineeId: pkg.trainee_id,
        traineeName: trainee?.full_name || pkg.trainee_name,
        packageName: pkg.package_name || pkg.service_type || 'חבילה',
      },
    }));
  };

  return (
    <ProtectedCoachPage>
      <div className="min-h-screen pb-24" dir="rtl" style={{ backgroundColor: '#FFF9F0' }}>
        <div className="max-w-2xl mx-auto px-3 py-4">
          {/* Header */}
          <h1 className="text-xl font-black text-gray-900 mb-3 flex items-center gap-2 px-1" style={{ textAlign: 'right' }}>
            <Package className="w-6 h-6 text-[#FF6F20]" />🎫 חבילות
          </h1>

          {isLoading ? <PageLoader message="טוען חבילות..." /> : (
            <>
              {/* Orange hero — total revenue from packages */}
              <div style={{ background: '#FF6F20', borderRadius: 16, padding: 18, margin: '0 0 8px', textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>סך הכנסות מחבילות</div>
                <div style={{ fontSize: 32, fontWeight: 700, color: 'white', marginTop: 4 }}>₪{metrics.revAll.toLocaleString()}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>פעילות + מסתיימות: ₪{metrics.revActive.toLocaleString()}</div>
              </div>

              {/* 4 KPI cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <KpiCard value={metrics.active}    color="#16a34a" label="חבילות פעילות" />
                <KpiCard value={metrics.expiring}  color="#EAB308" label="עומדות להסתיים" />
                <KpiCard value={metrics.expired}   color="#dc2626" label="הסתיימו" />
                <KpiCard value={metrics.totalSold} color="#7F47B5" label="סה״כ נמכרו" />
              </div>

              {/* Utilization rate */}
              <Card title="📊 ניצול חבילות">
                <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
                  <UtilizationCircle pct={metrics.utilizationPct} />
                  <div style={{ textAlign: 'right', fontSize: 13, lineHeight: 1.9, color: '#888' }}>
                    <div>סה״כ מפגשים: <b style={{ color: '#1a1a1a' }}>{metrics.totalSessions}</b></div>
                    <div>נוצלו: <b style={{ color: '#16a34a' }}>{metrics.usedSessions}</b></div>
                    <div>נותרו: <b style={{ color: '#FF6F20' }}>{Math.max(0, metrics.totalSessions - metrics.usedSessions)}</b></div>
                  </div>
                </div>
              </Card>

              {/* Package types breakdown */}
              {typesBreakdown.length > 0 && (
                <Card title="📦 חלוקה לפי סוג חבילה">
                  {typesBreakdown.map(pt => {
                    const totalRev = typesBreakdown.reduce((s, x) => s + x.revenue, 0) || 1;
                    const widthPct = (pt.revenue / totalRev) * 100;
                    return (
                      <div key={pt.name} style={{ marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                          <span style={{ fontWeight: 500 }}>{pt.name}</span>
                          <span style={{ color: '#888' }}>{pt.count} חבילות · ₪{pt.revenue.toLocaleString()}</span>
                        </div>
                        <div style={{ height: 6, background: '#F0E4D0', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${widthPct}%`, background: '#FF6F20', borderRadius: 3 }} />
                        </div>
                      </div>
                    );
                  })}
                </Card>
              )}

              {/* Filter + search + sort */}
              <div className="flex gap-2 overflow-x-auto pb-2" style={{ marginBottom: 6 }}>
                {FILTERS.map(f => (
                  <button key={f.id} onClick={() => setFilter(f.id)}
                    className="rounded-full px-3 py-1.5 text-xs font-bold whitespace-nowrap"
                    style={{
                      background: filter === f.id ? '#FF6F20' : 'white',
                      color: filter === f.id ? 'white' : '#1a1a1a',
                      border: filter === f.id ? 'none' : '0.5px solid #F0E4D0',
                    }}>
                    {f.label}
                  </button>
                ))}
              </div>
              <input
                type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="חפש לפי מתאמן או חבילה..."
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 12,
                  border: '0.5px solid #F0E4D0', fontSize: 14, direction: 'rtl',
                  marginBottom: 6, background: 'white', boxSizing: 'border-box', outline: 'none',
                }}
              />
              <div className="flex gap-2 overflow-x-auto pb-2" style={{ marginBottom: 10 }}>
                {SORT_OPTIONS.map(s => (
                  <button key={s.id} onClick={() => setSortBy(s.id)}
                    className="rounded-full px-3 py-1 text-[11px] font-semibold whitespace-nowrap"
                    style={{
                      background: sortBy === s.id ? '#FFF0E4' : 'white',
                      color: sortBy === s.id ? '#FF6F20' : '#888',
                      border: sortBy === s.id ? '1px solid #FF6F20' : '0.5px solid #F0E4D0',
                    }}>
                    {s.label}
                  </button>
                ))}
              </div>

              {/* Accordion list */}
              {visibleList.length === 0 ? (
                <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-gray-200">
                  <Package className="w-10 h-10 mx-auto text-gray-300 mb-2" />
                  <p className="text-gray-500 text-sm">אין חבילות להצגה</p>
                </div>
              ) : (
                visibleList.map(pkg => {
                  const b = bucketOf(pkg);
                  const remaining = remainingOf(pkg);
                  const total = pkg.total_sessions || pkg.sessions_count || 0;
                  const used = pkg.used_sessions || 0;
                  const traineeName = traineesById.get(pkg.trainee_id)?.full_name || pkg.trainee_name || 'מתאמן';
                  const isOpen = !!expanded[pkg.id];
                  const linkedSessions = sessionsByService.get(pkg.id) || [];
                  const dashUsed = total > 0 ? (used / total) * 113 : 0;
                  return (
                    <div key={pkg.id} style={{ marginBottom: 8 }}>
                      <div onClick={() => toggleExpanded(pkg.id)}
                        style={{
                          background: 'white', borderRadius: isOpen ? '14px 14px 0 0' : 14,
                          padding: 14, border: bucketBorder(b),
                          boxShadow: '0 2px 6px rgba(0,0,0,0.04)', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 10,
                        }}>
                        <div style={{ width: 42, height: 42, borderRadius: 12, background: bucketBg(b), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                          {bucketEmoji(b)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {pkg.package_name || pkg.service_type || 'חבילה'}
                          </div>
                          <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{traineeName}</div>
                        </div>
                        <div style={{ width: 44, height: 44, position: 'relative', flexShrink: 0 }}>
                          <svg width="44" height="44" viewBox="0 0 44 44">
                            <circle cx="22" cy="22" r="18" fill="none" stroke="#F0E4D0" strokeWidth="3" />
                            <circle cx="22" cy="22" r="18" fill="none" stroke={balanceColor(remaining)} strokeWidth="3"
                              strokeDasharray={`${dashUsed} 113`} transform="rotate(-90 22 22)" strokeLinecap="round" />
                            <text x="22" y="22" textAnchor="middle" dominantBaseline="middle" fontSize="12" fontWeight="600" fill="#1a1a1a">
                              {remaining}
                            </text>
                          </svg>
                        </div>
                        <div style={{ textAlign: 'center', flexShrink: 0 }}>
                          <div style={{ fontSize: 16, fontWeight: 700, color: '#16a34a' }}>₪{priceOf(pkg)}</div>
                          <div style={{ fontSize: 9, color: '#888' }}>מחיר</div>
                        </div>
                        <div style={{ fontSize: 14, color: '#888', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</div>
                      </div>

                      {isOpen && (
                        <div style={{
                          background: 'white', borderRadius: '0 0 14px 14px', padding: 14,
                          borderTop: '0.5px solid #F0E4D0',
                          border: bucketBorder(b), borderTopWidth: 0,
                        }}>
                          {/* Detail rows */}
                          <div style={{ fontSize: 13, lineHeight: 2, color: '#555' }}>
                            <DetailRow k="סוג"            v={pkg.package_type || pkg.service_type || 'אישי'} />
                            <DetailRow k="תאריך התחלה"   v={fmt(pkg.start_date)} />
                            <DetailRow k="תאריך סיום"    v={fmt(pkg.end_date || pkg.expires_at)} />
                            <DetailRow k="סה״כ מפגשים"   v={total} />
                            <DetailRow k="נוצלו"         v={used} valueColor="#FF6F20" valueBold />
                            <DetailRow k="נותרו"         v={remaining} valueColor={balanceColor(remaining)} valueBold />
                            <DetailRow k="תשלום"         v={pkg.payment_method || 'לא צוין'} />
                            {pkg.notes_internal && <DetailRow k="הערות" v={pkg.notes_internal} />}
                          </div>

                          {/* Linked sessions */}
                          <div style={{ marginTop: 12, padding: 10, background: '#FFF9F0', borderRadius: 10 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                              מפגשים מקושרים ({linkedSessions.length})
                            </div>
                            {linkedSessions.length === 0 ? (
                              <div style={{ fontSize: 12, color: '#888' }}>אין מפגשים</div>
                            ) : linkedSessions.slice(0, 5).map(s => (
                              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', fontSize: 12 }}>
                                <span>{sessionStatusIcon(s.status)}</span>
                                <span>{fmt(s.date)}</span>
                                <span style={{ color: '#888' }}>· {s.status || ''}</span>
                              </div>
                            ))}
                            {linkedSessions.length > 5 && (
                              <div style={{ fontSize: 11, color: '#FF6F20', marginTop: 4, fontWeight: 600 }}>
                                + עוד {linkedSessions.length - 5} מפגשים
                              </div>
                            )}
                          </div>

                          {/* Action buttons */}
                          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                            <button onClick={(e) => { e.stopPropagation(); navigate(createPageUrl('TraineeProfile') + `?userId=${pkg.trainee_id}`); }}
                              style={{ flex: 1, padding: 8, borderRadius: 10, border: 'none', background: '#FFF0E4', color: '#FF6F20', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                              👤 פרופיל מתאמן
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setSelectedPkg(pkg); }}
                              style={{ flex: 1, padding: 8, borderRadius: 10, border: '0.5px solid #F0E4D0', background: 'white', color: '#1a1a1a', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                              📋 פרטים מלאים
                            </button>
                            {remaining <= 1 && (
                              <button onClick={(e) => { e.stopPropagation(); sendRenewalNudge(pkg); }}
                                style={{ flex: 1, padding: 8, borderRadius: 10, border: 'none', background: '#FF6F20', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                                🔄 הודעת חידוש
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </>
          )}
        </div>

        {/* Existing dialogs preserved — accordion's 'פרטים מלאים' button opens this */}
        <PackageDetailsDialog isOpen={!!selectedPkg} onClose={() => setSelectedPkg(null)}
          packageData={selectedPkg} onEdit={(pkg) => { setSelectedPkg(null); setEditingPkg(pkg); }} />
        <PackageFormDialog isOpen={!!editingPkg} onClose={() => setEditingPkg(null)}
          traineeId={editingPkg?.trainee_id} traineeName={editingPkg?.trainee_name} editingPackage={editingPkg} />
      </div>
    </ProtectedCoachPage>
  );
}

function KpiCard({ value, color, label }) {
  return (
    <div style={{ background: 'white', borderRadius: 14, padding: 14, textAlign: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
      <div style={{ fontSize: 24, fontWeight: 500, color }}>{value}</div>
      <div style={{ fontSize: 11, color: '#888', fontWeight: 600, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div style={{ background: 'white', borderRadius: 14, padding: 16, marginBottom: 8, boxShadow: '0 2px 6px rgba(0,0,0,0.04)', textAlign: 'right' }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a', marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

function UtilizationCircle({ pct }) {
  const dash = (pct / 100) * 201;
  return (
    <div style={{ textAlign: 'center' }}>
      <svg width="80" height="80" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r="32" fill="none" stroke="#F0E4D0" strokeWidth="6" />
        <circle cx="40" cy="40" r="32" fill="none" stroke="#FF6F20" strokeWidth="6"
          strokeDasharray={`${dash} 201`} transform="rotate(-90 40 40)" strokeLinecap="round" />
        <text x="40" y="40" textAnchor="middle" dominantBaseline="middle" fontSize="16" fontWeight="600" fill="#1a1a1a">
          {pct}%
        </text>
      </svg>
      <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>מפגשים שנוצלו</div>
    </div>
  );
}

function DetailRow({ k, v, valueColor, valueBold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ color: '#888' }}>{k}</span>
      <span style={{ color: valueColor || '#1a1a1a', fontWeight: valueBold ? 600 : 400 }}>{v}</span>
    </div>
  );
}

function sessionStatusIcon(status) {
  if (status === 'התקיים' || status === 'completed' || status === 'הגיע') return '✅';
  if (status === 'בוטל' || status === 'cancelled') return '❌';
  if (status === 'ממתין' || status === 'ממתין לאישור' || status === 'pending') return '⏳';
  return '📅';
}
