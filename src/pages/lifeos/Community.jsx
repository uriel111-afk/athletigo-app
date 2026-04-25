import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { AuthContext } from '@/lib/AuthContext';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import CommunityMetricForm from '@/components/lifeos/CommunityMetricForm';
import { LIFEOS_COLORS, LIFEOS_CARD } from '@/lib/lifeos/lifeos-constants';
import { listCommunityMetrics } from '@/lib/lifeos/lifeos-api';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';

const fmt = (n) => Math.round(n).toLocaleString('he-IL');

export default function Community() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;

  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoaded(false);
    try {
      setRows(await listCommunityMetrics(userId, { limit: 60 }) || []);
    } catch (err) {
      console.error('[Community] load error:', err);
      toast.error('שגיאה בטעינה');
    } finally {
      setLoaded(true);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  // Most recent metric (first element since sorted desc by date).
  const latest = rows[0] || null;
  const previous = rows[1] || null;

  // Chart data — last 30 entries, ASC by date.
  const chartData = useMemo(() => {
    return rows
      .slice(0, 30)
      .slice()
      .reverse()
      .map(r => ({
        date: new Date(r.date).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' }),
        followers: r.followers_count || 0,
      }));
  }, [rows]);

  // Aggregated totals over the fetched window.
  const totals = useMemo(() => {
    const newFollowers = rows.reduce((s, r) => s + (r.new_followers || 0), 0);
    const dms = rows.reduce((s, r) => s + (r.dms_received || 0), 0);
    const leads = rows.reduce((s, r) => s + (r.leads_from_content || 0), 0);
    const engRates = rows.map(r => Number(r.engagement_rate || 0)).filter(x => x > 0);
    const avgEng = engRates.length > 0 ? engRates.reduce((s, x) => s + x, 0) / engRates.length : 0;
    return { newFollowers, dms, leads, avgEng };
  }, [rows]);

  const delta = latest && previous
    ? (latest.followers_count || 0) - (previous.followers_count || 0)
    : null;

  const handleDelete = async (id) => {
    if (!confirm('בטוח שאתה רוצה למחוק את המדידה?')) return;
    try { await supabase.from('community_metrics').delete().eq('id', id); toast.success('נמחק'); load(); }
    catch (err) { toast.error('שגיאה: ' + (err?.message || '')); }
  };

  return (
    <LifeOSLayout title="קהילה" onQuickSaved={load}>
      <button
        onClick={() => setShowForm(true)}
        style={{
          width: '100%', padding: '14px 16px', borderRadius: 12, border: 'none',
          backgroundColor: LIFEOS_COLORS.primary, color: '#FFFFFF',
          fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 14,
          boxShadow: '0 2px 8px rgba(255,111,32,0.2)',
        }}
      >
        + מדד יומי חדש
      </button>

      {/* Latest metric */}
      {!loaded ? (
        <EmptyCard text="טוען..." />
      ) : !latest ? (
        <EmptyCard text="עדיין לא הזנת מדידות. לחץ + כדי להתחיל" />
      ) : (
        <>
          {/* Hero: followers — long-press to delete most recent */}
          <div style={{ ...LIFEOS_CARD, marginBottom: 12, textAlign: 'center', position: 'relative' }}>
            <button onClick={() => handleDelete(latest.id)} aria-label="מחק מדידה אחרונה" style={{
              position: 'absolute', top: 8, left: 8,
              width: 28, height: 28, borderRadius: 8, border: 'none',
              background: 'transparent', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: LIFEOS_COLORS.error,
            }}>
              <Trash2 size={14} />
            </button>
            <div style={{ fontSize: 12, fontWeight: 600, color: LIFEOS_COLORS.textSecondary, marginBottom: 4 }}>
              עוקבים ({latest.platform}) • {new Date(latest.date).toLocaleDateString('he-IL')}
            </div>
            <div style={{ fontSize: 36, fontWeight: 900, color: LIFEOS_COLORS.textPrimary }}>
              {fmt(latest.followers_count || 0)}
            </div>
            {delta !== null && (
              <div style={{
                fontSize: 13, fontWeight: 700, marginTop: 4,
                color: delta > 0 ? LIFEOS_COLORS.success : delta < 0 ? LIFEOS_COLORS.error : LIFEOS_COLORS.textSecondary,
              }}>
                {delta > 0 ? '↑' : delta < 0 ? '↓' : '→'} {Math.abs(delta)} מהמדידה הקודמת
              </div>
            )}
          </div>

          {/* Secondary stats */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <MetricStat label="הודעות (DM) היום" value={latest.dms_received || 0} emoji="💬" />
            <MetricStat label="תגובות היום" value={latest.comments_received || 0} emoji="💭" />
            <MetricStat label="לידים היום" value={latest.leads_from_content || 0} emoji="🎯" />
            <MetricStat
              label="engagement"
              value={latest.engagement_rate ? `${Number(latest.engagement_rate).toFixed(1)}%` : '—'}
              emoji="⚡"
            />
          </div>

          {/* Chart */}
          {chartData.length >= 2 && (
            <div style={{ ...LIFEOS_CARD, marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: LIFEOS_COLORS.textPrimary, marginBottom: 10 }}>
                מגמת עוקבים
              </div>
              <div style={{ width: '100%', height: 180 }}>
                <ResponsiveContainer>
                  <LineChart data={chartData} margin={{ top: 6, right: 6, left: 6, bottom: 6 }}>
                    <CartesianGrid strokeDasharray="2 3" stroke="#eee" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: LIFEOS_COLORS.textSecondary }} />
                    <YAxis tick={{ fontSize: 10, fill: LIFEOS_COLORS.textSecondary }} width={44} />
                    <Tooltip
                      contentStyle={{ borderRadius: 10, border: `1px solid ${LIFEOS_COLORS.border}`, fontSize: 12 }}
                      formatter={(v) => fmt(v)}
                    />
                    <Line
                      type="monotone" dataKey="followers" name="עוקבים"
                      stroke={LIFEOS_COLORS.primary} strokeWidth={2.5}
                      dot={{ r: 3, fill: LIFEOS_COLORS.primary }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Totals over window */}
          <div style={{ ...LIFEOS_CARD }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: LIFEOS_COLORS.textPrimary, marginBottom: 10 }}>
              סיכום — {rows.length} מדידות אחרונות
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <SummaryRow emoji="📈" label="עוקבים חדשים"     value={fmt(totals.newFollowers)} />
              <SummaryRow emoji="💬" label="סה״כ הודעות"       value={fmt(totals.dms)} />
              <SummaryRow emoji="🎯" label="לידים מתוכן"       value={fmt(totals.leads)} />
              <SummaryRow emoji="⚡" label="engagement ממוצע" value={`${totals.avgEng.toFixed(1)}%`} />
            </div>
          </div>
        </>
      )}

      <CommunityMetricForm
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        userId={userId}
        lastMetric={latest}
        onSaved={load}
      />
    </LifeOSLayout>
  );
}

function MetricStat({ label, value, emoji }) {
  return (
    <div style={{ ...LIFEOS_CARD, padding: 12, textAlign: 'center' }}>
      <div style={{ fontSize: 22 }}>{emoji}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: LIFEOS_COLORS.textPrimary, marginTop: 2 }}>
        {value}
      </div>
      <div style={{ fontSize: 10, color: LIFEOS_COLORS.textSecondary, marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}

function SummaryRow({ emoji, label, value }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 10px', borderRadius: 10, backgroundColor: '#F7F3EC',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 18 }}>{emoji}</span>
        <span style={{ fontSize: 13, color: LIFEOS_COLORS.textPrimary, fontWeight: 600 }}>{label}</span>
      </div>
      <span style={{ fontSize: 14, fontWeight: 800, color: LIFEOS_COLORS.textPrimary }}>{value}</span>
    </div>
  );
}

function EmptyCard({ text }) {
  return (
    <div style={{ ...LIFEOS_CARD, textAlign: 'center' }}>
      <div style={{ fontSize: 13, color: LIFEOS_COLORS.textSecondary, padding: '14px 0' }}>{text}</div>
    </div>
  );
}
