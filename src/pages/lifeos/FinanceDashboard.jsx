import React, { useCallback, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { toast } from 'sonner';

import { AuthContext } from '@/lib/AuthContext';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import FinanceTabBar from '@/components/lifeos/FinanceTabBar';
import GoalProgress from '@/components/lifeos/GoalProgress';
import {
  LIFEOS_COLORS, LIFEOS_CARD, YEARLY_GOAL,
} from '@/lib/lifeos/lifeos-constants';
import {
  getMonthlySummary, listExpenses, listIncome, getAnnualIncome,
} from '@/lib/lifeos/lifeos-api';
import { getAnnualTarget } from '@/lib/lifeos/goals-api';

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

export default function FinanceDashboard() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const navigate = useNavigate();

  const [monthSummary, setMonthSummary] = useState({ income: 0, expenses: 0, net: 0 });
  const [chart,        setChart]        = useState([]);
  // Annual headline figures — kept in sync with LifeOSDashboard +
  // BusinessPlan via users.goals_hierarchy.annual_target. Defaults
  // to YEARLY_GOAL so a brand-new user still sees a progress bar.
  const [annualTarget, setAnnualTarget] = useState(YEARLY_GOAL);
  const [annualIncome, setAnnualIncome] = useState(0);
  const [loaded,       setLoaded]       = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoaded(false);
    try {
      const window = buildMonthWindow(6);
      const from = window[0].from;
      const to = window[window.length - 1].to;

      const [summary, expRows, incRows, target, annualSum] = await Promise.all([
        getMonthlySummary(userId, new Date()),
        listExpenses(userId, { from, to }),
        listIncome(userId, { from, to }),
        getAnnualTarget(userId, YEARLY_GOAL).catch(() => YEARLY_GOAL),
        getAnnualIncome(userId).catch(() => 0),
      ]);

      setMonthSummary(summary || { income: 0, expenses: 0, net: 0 });
      setAnnualTarget(target);
      setAnnualIncome(annualSum);

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

  return (
    <LifeOSLayout title="דשבורד פיננסי" onQuickSaved={load} rightSlot={
      <button onClick={load} aria-label="רענן" title="רענן" style={iconBtnStyle}>
        <RefreshCw size={16} />
      </button>
    }>
      <div style={{ padding: '0 14px' }}>
        <FinanceTabBar />

        {/* ─── Annual goal progress ─────────────────────────── */}
        <div style={{ marginBottom: 20 }}>
          <GoalProgress current={annualIncome} target={annualTarget} />
        </div>

        {/* ─── Monthly summary — every tile drills down ──────── */}
        {/* Income → /lifeos/income, Expenses → /lifeos/expenses,
            Profit → /reports (the unified coach financial report). */}
        <div style={{ ...LIFEOS_CARD, marginBottom: 12 }}>
          <div style={sectionTitleStyle}>סיכום החודש</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <SummaryTile
              label="הכנסות"
              value={fmt(monthSummary.income)}
              color={LIFEOS_COLORS.success}
              icon="💰"
              onClick={() => navigate('/lifeos/income')}
              hint="לפירוט"
            />
            <SummaryTile
              label="הוצאות"
              value={fmt(monthSummary.expenses)}
              color={LIFEOS_COLORS.error}
              icon="📊"
              onClick={() => navigate('/lifeos/expenses')}
              hint="לפירוט"
            />
            <SummaryTile
              label="רווח"
              value={fmt(monthSummary.net)}
              color={monthSummary.net >= 0 ? LIFEOS_COLORS.success : LIFEOS_COLORS.error}
              icon="📈"
              onClick={() => navigate('/reports')}
              hint="לדוח"
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

function SummaryTile({ label, value, color, icon, onClick, hint }) {
  const isClickable = !!onClick;
  return (
    <div
      onClick={onClick}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      style={{
        padding: 10, borderRadius: 10,
        backgroundColor: '#FFFFFF',
        border: `1px solid ${isClickable ? LIFEOS_COLORS.primary : LIFEOS_COLORS.border}`,
        textAlign: 'center',
        cursor: isClickable ? 'pointer' : 'default',
        transition: 'transform 0.1s ease',
      }}
    >
      {icon && (
        <div style={{ fontSize: 18, lineHeight: 1, marginBottom: 4 }}>
          {icon}
        </div>
      )}
      <div style={{ fontSize: 11, color: LIFEOS_COLORS.textSecondary, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 17, fontWeight: 800, color }}>
        {value}₪
      </div>
      {hint && (
        <div style={{ fontSize: 9, fontWeight: 700, color: LIFEOS_COLORS.primary, marginTop: 2 }}>
          {hint} ←
        </div>
      )}
    </div>
  );
}

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
