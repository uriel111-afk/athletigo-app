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
import { getGoalsHierarchy } from '@/lib/lifeos/goals-api';

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('he-IL');
const pct = (n) => `${(Number(n) || 0).toFixed(1)}%`;

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
// belong to it. Drives both the per-category total and the per-product
// drill-down below.
const CATEGORY_SOURCE_MAP = {
  'Coaching': ['training', 'online_coaching'],
  'Courses':  ['course', 'workshop'],
  'Products': ['product_sale'],
};
const CATEGORY_ORDER  = ['Coaching', 'Courses', 'Products'];
const CATEGORY_EMOJI  = { Coaching: '🏋️', Courses: '📚', Products: '🛍️' };

// Group a slice of income rows by display category, then by product
// name (trimmed, case-insensitive key but the original name is shown).
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

// ─── Health rules ──────────────────────────────────────────────
const monthlyHealth = (progressPct) => {
  if (progressPct >= 80) return { level: 'green',  message: 'בטוח - עדיף מהיעד' };
  if (progressPct >= 50) return { level: 'yellow', message: 'אזהרה - צריך להאיץ' };
  return                       { level: 'red',    message: 'בסכנה - בחורים יום' };
};

const expenseHealth = (ratioPct) => {
  if (ratioPct <= 40) return { level: 'green',  message: 'בטוח - חיסכון טוב' };
  if (ratioPct <= 70) return { level: 'yellow', message: 'אזהרה - בקרוב סוף' };
  return                     { level: 'red',    message: 'בעיה - צמצם הוצאות' };
};

// ─── Smart recommendations ─────────────────────────────────────
const buildRecommendations = ({
  monthlyProgress, expenseRatio,
  monthlyTarget, actualThisMonth,
  ytdIncome, breakdown,
}) => {
  const out = [];

  if (monthlyProgress > 100) {
    out.push({ emoji: '✓', text: 'כל הכבוד! עדיף מהיעד' });
  } else if (monthlyProgress < 50 && monthlyTarget > 0) {
    const remaining = Math.max(0, monthlyTarget - actualThisMonth);
    out.push({
      emoji: '⏰',
      text: `צריך ${Math.round(remaining).toLocaleString('he-IL')}₪ עד סוף החודש להשג יעד`,
    });
  }

  if (expenseRatio > 60) {
    out.push({ emoji: '⚠️', text: 'הוצאות גבוהות - בדוק את העלויות' });
  }

  if (ytdIncome < 50000) {
    out.push({ emoji: '💡', text: 'הוסף 1-2 לקוחות בחודש הבא' });
  }

  // Category surfaced when it has zero income this month.
  for (const cat of CATEGORY_ORDER) {
    const data = breakdown?.[cat];
    if (data && data.total === 0) {
      out.push({ emoji: '🎯', text: `אין הכנסות החודש ב-${cat} — הוסף הכנסה` });
    }
  }

  if (out.length === 0) {
    out.push({ emoji: '✨', text: 'הכל בכיוון - המשך כך' });
  }

  return out.slice(0, 3);
};

export default function FinanceDashboard() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const navigate = useNavigate();

  const [monthlyTarget, setMonthlyTarget] = useState(0); // derived from goals_hierarchy.annual_target / 12
  const [ytdIncome,     setYtdIncome]     = useState(0);
  const [monthSummary,  setMonthSummary]  = useState({ income: 0, expenses: 0, net: 0 });
  const [breakdown,     setBreakdown]     = useState({});
  const [chart,         setChart]         = useState([]);
  const [loaded,        setLoaded]        = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoaded(false);
    try {
      const window = buildMonthWindow(6);
      const from = window[0].from;
      const to = window[window.length - 1].to;

      const yearStart = `${new Date().getFullYear()}-01-01`;
      const today = new Date().toISOString().slice(0, 10);

      const [hierarchy, summary, ytdRows, expRows, incRows] = await Promise.all([
        getGoalsHierarchy(userId),
        getMonthlySummary(userId, new Date()),
        listIncome(userId, { from: yearStart, to: today }),
        listExpenses(userId, { from, to }),
        listIncome(userId, { from, to }),
      ]);

      // monthly target is derived; not displayed on this page anymore
      // but still drives the health/recs thresholds. To change it,
      // the coach edits annual_target on /lifeos/goals.
      const annual = Number(hierarchy?.annual_target) || 0;
      setMonthlyTarget(annual / 12);

      setYtdIncome((ytdRows || []).reduce((s, r) => s + (Number(r.amount) || 0), 0));
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

  const actualThisMonth = monthSummary.income;
  const monthlyProgress = monthlyTarget > 0
    ? (actualThisMonth / monthlyTarget) * 100
    : 0;
  const expenseRatio = monthSummary.income > 0
    ? (monthSummary.expenses / monthSummary.income) * 100
    : 0;
  const monthlyHealthBadge = monthlyHealth(monthlyProgress);
  const expenseHealthBadge = expenseHealth(expenseRatio);
  const recommendations = buildRecommendations({
    monthlyProgress, expenseRatio, monthlyTarget, actualThisMonth,
    ytdIncome, breakdown,
  });

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

        {/* ─── Health status ────────────────────────────────── */}
        {loaded && (
          <div style={{ ...LIFEOS_CARD, marginBottom: 12 }}>
            <div style={{ ...sectionTitleStyle, marginBottom: 10 }}>בריאות פיננסית</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <HealthRow
                label="עמידה ביעד החודשי"
                value={pct(Math.min(monthlyProgress, 999))}
                level={monthlyHealthBadge.level}
                message={monthlyHealthBadge.message}
              />
              <HealthRow
                label="יחס הוצאות / הכנסות"
                value={pct(Math.min(expenseRatio, 999))}
                level={expenseHealthBadge.level}
                message={expenseHealthBadge.message}
              />
            </div>
          </div>
        )}

        {/* ─── Smart recommendations ────────────────────────── */}
        {loaded && recommendations.length > 0 && (
          <div style={{ ...LIFEOS_CARD, marginBottom: 12 }}>
            <div style={{ ...sectionTitleStyle, marginBottom: 10 }}>המלצות</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {recommendations.map((r, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 8,
                    padding: '8px 10px', borderRadius: 8,
                    backgroundColor: LIFEOS_COLORS.primaryLight,
                    fontSize: 12, color: LIFEOS_COLORS.textPrimary,
                    lineHeight: 1.5,
                  }}
                >
                  <span style={{ fontSize: 14, lineHeight: 1.4 }}>{r.emoji}</span>
                  <span style={{ flex: 1 }}>{r.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

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

// ─── HealthRow ─────────────────────────────────────────────────
function HealthRow({ label, value, level, message }) {
  const colorMap = {
    green:  LIFEOS_COLORS.success,
    yellow: LIFEOS_COLORS.warning,
    red:    LIFEOS_COLORS.error,
  };
  const emojiMap = { green: '🟢', yellow: '🟡', red: '🔴' };
  const tintMap = { green: '#ECFDF5', yellow: '#FEF9E7', red: '#FEF2F2' };
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 10px', borderRadius: 8,
      backgroundColor: tintMap[level],
    }}>
      <span style={{ fontSize: 18, lineHeight: 1 }}>{emojiMap[level]}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: LIFEOS_COLORS.textPrimary }}>
          {label}
        </div>
        <div style={{ fontSize: 11, color: LIFEOS_COLORS.textSecondary, marginTop: 1 }}>
          {message}
        </div>
      </div>
      <div style={{ fontSize: 14, fontWeight: 800, color: colorMap[level], whiteSpace: 'nowrap' }}>
        {value}
      </div>
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
