import React, { useCallback, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Plus } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { toast } from 'sonner';

import { AuthContext } from '@/lib/AuthContext';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import FinanceTabBar from '@/components/lifeos/FinanceTabBar';
import { LIFEOS_COLORS, LIFEOS_CARD } from '@/lib/lifeos/lifeos-constants';
import {
  getMonthlySummary, listExpenses, listIncome,
} from '@/lib/lifeos/lifeos-api';

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('he-IL');

const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthLabel = (d) => d.toLocaleDateString('he-IL', { month: 'short', year: '2-digit' });

const buildMonthWindow = (n) => {
  const out = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    out.push({
      key: monthKey(d),
      label: monthLabel(d),
      from: d.toISOString().slice(0, 10),
      to: end.toISOString().slice(0, 10),
    });
  }
  return out;
};

// Maps a display category name to the income.source enum values that
// belong to it. Drives the per-category total and per-product
// drill-down below.
const CATEGORY_SOURCE_MAP = {
  'Coaching': ['training', 'online_coaching'],
  'Courses':  ['course', 'workshop'],
  'Products': ['product_sale'],
};
const CATEGORY_ORDER = ['Coaching', 'Courses', 'Products'];
const CATEGORY_EMOJI = { Coaching: '🏋️', Courses: '📚', Products: '🛍️' };

// Group a slice of income rows by display category, then by product
// name (trimmed, case-insensitive key but the original name is shown).
// Rows without a product land in an "אחר" bucket so their amount still
// counts toward the category total — never a silent zero.
// Returns { [category]: { total, products: [{ name, total }] } }.
const computeIncomeBreakdown = (rows) => {
  const out = {};
  for (const [category, sources] of Object.entries(CATEGORY_SOURCE_MAP)) {
    const matching = (rows || []).filter(r => sources.includes(r.source));
    const total = matching.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const byKey = new Map();
    for (const r of matching) {
      const raw = (r.product || '').trim() || 'אחר';
      const key = raw.toLowerCase();
      const prev = byKey.get(key) || { name: raw, total: 0 };
      prev.total += Number(r.amount) || 0;
      byKey.set(key, prev);
    }
    out[category] = {
      total,
      products: Array.from(byKey.values()).sort((a, b) => b.total - a.total),
    };
  }
  return out;
};

export default function FinanceDashboard() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const navigate = useNavigate();

  const [monthSummary, setMonthSummary] = useState({ income: 0, expenses: 0, net: 0 });
  const [breakdown,    setBreakdown]    = useState({});
  const [chart,        setChart]        = useState([]);
  const [loaded,       setLoaded]       = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoaded(false);
    try {
      const window = buildMonthWindow(6);
      const from = window[0].from;
      const to = window[window.length - 1].to;

      const [summary, expRows, incRows] = await Promise.all([
        getMonthlySummary(userId, new Date()),
        listExpenses(userId, { from, to }),
        listIncome(userId, { from, to }),
      ]);

      setMonthSummary(summary || { income: 0, expenses: 0, net: 0 });
      setBreakdown(computeIncomeBreakdown(summary?.incomeRows || []));

      const buckets = Object.fromEntries(
        window.map(w => [w.key, { label: w.label, income: 0, expenses: 0 }])
      );
      for (const r of (incRows || [])) {
        if (!r.date) continue;
        const k = r.date.slice(0, 7);
        if (buckets[k]) buckets[k].income += Number(r.amount) || 0;
      }
      for (const r of (expRows || [])) {
        if (!r.date) continue;
        const k = r.date.slice(0, 7);
        if (buckets[k]) buckets[k].expenses += Number(r.amount) || 0;
      }
      setChart(window.map(w => ({
        label: buckets[w.key].label,
        income: Math.round(buckets[w.key].income),
        expenses: Math.round(buckets[w.key].expenses),
      })));
    } catch (err) {
      console.error('[FinanceDashboard] load error:', err);
      toast.error('שגיאה: ' + (err?.message || ''));
    } finally {
      setLoaded(true);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const goAddIncome = () => navigate('/lifeos/income');

  return (
    <LifeOSLayout title="דשבורד פיננסי" onQuickSaved={load} rightSlot={
      <button onClick={load} aria-label="רענן" title="רענן" style={iconBtnStyle}>
        <RefreshCw size={16} />
      </button>
    }>
      <div style={{ padding: '0 14px' }}>
        <FinanceTabBar />

        {/* ─── Income breakdown (THIS MONTH) ────────────────── */}
        <div style={{ ...LIFEOS_CARD, marginBottom: 12 }}>
          <div style={{ ...sectionTitleStyle, marginBottom: 10 }}>
            הכנסות החודש
          </div>
          {!loaded ? (
            <div style={loadingStyle}>טוען...</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {CATEGORY_ORDER.map(cat => (
                <CategoryBreakdown
                  key={cat}
                  name={cat}
                  emoji={CATEGORY_EMOJI[cat]}
                  data={breakdown[cat] || { total: 0, products: [] }}
                  onAdd={goAddIncome}
                />
              ))}
            </div>
          )}
        </div>

        {/* ─── Monthly summary (read-only) ──────────────────── */}
        <div style={{ ...LIFEOS_CARD, marginBottom: 12 }}>
          <div style={sectionTitleStyle}>סיכום החודש</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <SummaryTile label="הכנסות" value={fmt(monthSummary.income)}   color={LIFEOS_COLORS.success} />
            <SummaryTile label="הוצאות" value={fmt(monthSummary.expenses)} color={LIFEOS_COLORS.error} />
            <SummaryTile
              label="רווח"
              value={fmt(monthSummary.net)}
              color={monthSummary.net >= 0 ? LIFEOS_COLORS.success : LIFEOS_COLORS.error}
            />
          </div>
        </div>

        {/* ─── CashFlow 6-month bar chart ───────────────────── */}
        <div style={{ ...LIFEOS_CARD, marginBottom: 12 }}>
          <div style={sectionTitleStyle}>תזרים — 6 חודשים</div>
          {!loaded ? (
            <div style={loadingStyle}>טוען...</div>
          ) : (
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer>
                <BarChart data={chart} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={LIFEOS_COLORS.border} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: LIFEOS_COLORS.textSecondary }} />
                  <YAxis tick={{ fontSize: 11, fill: LIFEOS_COLORS.textSecondary }} />
                  <Tooltip
                    contentStyle={{ borderRadius: 10, border: `1px solid ${LIFEOS_COLORS.border}`, fontSize: 12 }}
                    formatter={(v) => `${fmt(v)}₪`}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="income"   name="הכנסה" fill={LIFEOS_COLORS.success} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expenses" name="הוצאה" fill={LIFEOS_COLORS.error}   radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </LifeOSLayout>
  );
}

// ─── CategoryBreakdown ────────────────────────────────────────
function CategoryBreakdown({ name, emoji, data, onAdd }) {
  return (
    <div style={{
      border: `1px solid ${LIFEOS_COLORS.border}`,
      borderRadius: 10,
      padding: '10px 12px',
      backgroundColor: '#FFFFFF',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: data.products.length > 0 ? 8 : 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16, lineHeight: 1 }}>{emoji}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: LIFEOS_COLORS.textPrimary }}>
            {name}
          </span>
        </div>
        <div style={{ fontSize: 15, fontWeight: 800, color: LIFEOS_COLORS.textPrimary, direction: 'ltr' }}>
          ₪{fmt(data.total)}
        </div>
      </div>

      {data.products.length === 0 ? (
        <div style={{ fontSize: 11, color: LIFEOS_COLORS.textSecondary, padding: '4px 0' }}>
          אין הכנסות החודש
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6 }}>
          {data.products.map((p, i) => (
            <div key={`${p.name}-${i}`} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              fontSize: 12, color: LIFEOS_COLORS.textSecondary,
            }}>
              <span>{p.name}</span>
              <span style={{ direction: 'ltr', color: LIFEOS_COLORS.textPrimary, fontWeight: 600 }}>
                ₪{fmt(p.total)}
              </span>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={onAdd}
        style={{
          width: '100%', marginTop: 6,
          padding: '6px 10px', borderRadius: 8,
          border: `1px dashed ${LIFEOS_COLORS.primary}`,
          backgroundColor: LIFEOS_COLORS.primaryLight,
          color: LIFEOS_COLORS.primary,
          fontSize: 11, fontWeight: 700,
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          fontFamily: 'inherit',
        }}
      >
        <Plus size={12} /> הוסף הכנסה
      </button>
    </div>
  );
}

function SummaryTile({ label, value, color }) {
  return (
    <div style={{
      padding: 10, borderRadius: 10,
      backgroundColor: '#FFFFFF',
      border: `1px solid ${LIFEOS_COLORS.border}`,
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 11, color: LIFEOS_COLORS.textSecondary, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 17, fontWeight: 800, color }}>
        {value}₪
      </div>
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────
const sectionTitleStyle = {
  fontSize: 13,
  fontWeight: 700,
  color: LIFEOS_COLORS.textPrimary,
};

const iconBtnStyle = {
  width: 28, height: 28, borderRadius: 8, border: 'none',
  background: 'transparent', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: LIFEOS_COLORS.textSecondary,
};

const loadingStyle = {
  padding: 24,
  textAlign: 'center',
  color: LIFEOS_COLORS.textSecondary,
  fontSize: 13,
};
