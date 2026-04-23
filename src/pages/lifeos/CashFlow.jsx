import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from 'recharts';
import { AuthContext } from '@/lib/AuthContext';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import { LIFEOS_COLORS, LIFEOS_CARD } from '@/lib/lifeos/lifeos-constants';
import { listExpenses, listIncome, listRecurring } from '@/lib/lifeos/lifeos-api';
import { toast } from 'sonner';

const fmt = (n) => Math.round(n).toLocaleString('he-IL');

const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthLabel = (d) => d.toLocaleDateString('he-IL', { month: 'short', year: '2-digit' });

// Build an array of {key, label, from, to} for the last N months including current.
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
      date: d,
    });
  }
  return out;
};

// Same shape but forward N months for forecast.
const buildForecastWindow = (n) => {
  const out = [];
  const now = new Date();
  for (let i = 1; i <= n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    out.push({ key: monthKey(d), label: monthLabel(d), date: d });
  }
  return out;
};

// Convert any recurring payment amount to monthly.
const toMonthly = (amount, frequency) => {
  const a = Number(amount || 0);
  switch (frequency) {
    case 'weekly':    return a * 4.33;
    case 'quarterly': return a / 3;
    case 'yearly':    return a / 12;
    default:          return a;
  }
};

export default function CashFlow() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;

  const [monthly, setMonthly] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [recurringMonthly, setRecurringMonthly] = useState(0);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoaded(false);
    try {
      const window = buildMonthWindow(6);
      const from = window[0].from;
      const to = window[window.length - 1].to;
      const [expenses, income, recurring] = await Promise.all([
        listExpenses(userId, { from, to }),
        listIncome(userId, { from, to }),
        listRecurring(userId, { onlyActive: true }),
      ]);

      // Bucket into months.
      const rows = window.map(w => ({ ...w, income: 0, expenses: 0, net: 0 }));
      const index = Object.fromEntries(rows.map(r => [r.key, r]));
      expenses.forEach(e => {
        const d = new Date(e.date);
        const k = monthKey(d);
        if (index[k]) index[k].expenses += Number(e.amount || 0);
      });
      income.forEach(i => {
        const d = new Date(i.date);
        const k = monthKey(d);
        if (index[k]) index[k].income += Number(i.amount || 0);
      });
      rows.forEach(r => { r.net = r.income - r.expenses; });

      setMonthly(rows);
      setRecurringMonthly(
        (recurring || []).reduce((s, r) => s + toMonthly(r.amount, r.frequency), 0)
      );
    } catch (err) {
      console.error('[CashFlow] load error:', err);
      toast.error('שגיאה בטעינה');
    } finally {
      setLoaded(true);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const summary = useMemo(() => {
    if (!monthly.length) return null;
    const avgIncome = monthly.reduce((s, r) => s + r.income, 0) / monthly.length;
    const avgExpenses = monthly.reduce((s, r) => s + r.expenses, 0) / monthly.length;
    const best = monthly.slice().sort((a, b) => b.net - a.net)[0];
    const current = monthly[monthly.length - 1];
    const prev = monthly[monthly.length - 2];
    let trend = 'stable';
    if (prev && prev.net > 0) {
      const delta = ((current.net - prev.net) / Math.abs(prev.net)) * 100;
      if (delta > 10) trend = 'up';
      else if (delta < -10) trend = 'down';
    }
    return { avgIncome, avgExpenses, best, current, prev, trend };
  }, [monthly]);

  const forecast = useMemo(() => {
    if (!summary) return [];
    return buildForecastWindow(3).map(w => {
      const projectedIncome = summary.avgIncome;
      // Expenses = recurring (known) + variable avg (last 6 months excluding recurring)
      const projectedExpenses = Math.max(recurringMonthly, summary.avgExpenses);
      return {
        ...w,
        income: projectedIncome,
        expenses: projectedExpenses,
        net: projectedIncome - projectedExpenses,
      };
    });
  }, [summary, recurringMonthly]);

  const alerts = useMemo(() => {
    if (!summary || !summary.current) return [];
    const out = [];
    if (summary.prev && summary.current.expenses > summary.prev.expenses * 1.2) {
      const pct = Math.round(((summary.current.expenses - summary.prev.expenses) / summary.prev.expenses) * 100);
      out.push({ type: 'warning', text: `ההוצאות עלו ב-${pct}% החודש` });
    }
    if (summary.best && summary.current.key === summary.best.key && summary.current.net > 0) {
      out.push({ type: 'success', text: 'זה החודש הכי רווחי שלך! 🚀' });
    }
    if (summary.current.net < 0) {
      out.push({ type: 'error', text: 'החודש בהפסד. בדוק את ההוצאות.' });
    }
    return out;
  }, [summary]);

  if (!loaded) {
    return (
      <LifeOSLayout title="תזרים מזומנים">
        <div style={{ ...LIFEOS_CARD, textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: LIFEOS_COLORS.textSecondary, padding: '14px 0' }}>
            טוען...
          </div>
        </div>
      </LifeOSLayout>
    );
  }

  return (
    <LifeOSLayout title="תזרים מזומנים">
      {/* Alerts */}
      {alerts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {alerts.map((a, i) => <AlertBanner key={i} type={a.type} text={a.text} />)}
        </div>
      )}

      {/* Bar chart */}
      <div style={{ ...LIFEOS_CARD, marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: LIFEOS_COLORS.textPrimary, marginBottom: 10 }}>
          הכנסות מול הוצאות — 6 חודשים
        </div>
        <div style={{ width: '100%', height: 220 }}>
          <ResponsiveContainer>
            <BarChart data={monthly} margin={{ top: 6, right: 6, left: 6, bottom: 6 }}>
              <CartesianGrid strokeDasharray="2 3" stroke="#eee" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: LIFEOS_COLORS.textSecondary }} />
              <YAxis tick={{ fontSize: 10, fill: LIFEOS_COLORS.textSecondary }} width={48} />
              <Tooltip
                contentStyle={{ borderRadius: 10, border: `1px solid ${LIFEOS_COLORS.border}`, fontSize: 12 }}
                formatter={(v) => `${fmt(v)}₪`}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="income"   name="הכנסות" fill={LIFEOS_COLORS.success} radius={[6, 6, 0, 0]} />
              <Bar dataKey="expenses" name="הוצאות" fill="#C7C7C7" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <Stat label="ממוצע הכנסות" value={summary.avgIncome} color={LIFEOS_COLORS.success} />
          <Stat label="ממוצע הוצאות" value={summary.avgExpenses} color={LIFEOS_COLORS.textSecondary} />
        </div>
      )}

      {/* Best month */}
      {summary?.best && (
        <div style={{ ...LIFEOS_CARD, marginBottom: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: LIFEOS_COLORS.textSecondary, marginBottom: 4 }}>
            החודש הכי רווחי
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: LIFEOS_COLORS.textPrimary }}>
            {summary.best.label} — {fmt(summary.best.net)}₪
          </div>
          <div style={{
            fontSize: 11, marginTop: 6,
            color: summary.trend === 'up' ? LIFEOS_COLORS.success
                  : summary.trend === 'down' ? LIFEOS_COLORS.error
                  : LIFEOS_COLORS.textSecondary,
            fontWeight: 600,
          }}>
            מגמה: {summary.trend === 'up' ? 'עולה ↑' : summary.trend === 'down' ? 'יורדת ↓' : 'יציבה →'}
          </div>
        </div>
      )}

      {/* Forecast */}
      {forecast.length > 0 && (
        <div style={{ ...LIFEOS_CARD }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: LIFEOS_COLORS.textPrimary, marginBottom: 10 }}>
            תחזית 3 חודשים
          </div>
          <div style={{ fontSize: 11, color: LIFEOS_COLORS.textSecondary, marginBottom: 10 }}>
            מבוסס על ממוצע הכנסות + הוצאות קבועות ({fmt(recurringMonthly)}₪/חודש)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {forecast.map(f => (
              <div key={f.key} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 12px', borderRadius: 10, backgroundColor: '#F7F3EC',
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: LIFEOS_COLORS.textPrimary }}>
                  {f.label}
                </div>
                <div style={{
                  fontSize: 15, fontWeight: 800,
                  color: f.net >= 0 ? LIFEOS_COLORS.success : LIFEOS_COLORS.error,
                }}>
                  {f.net >= 0 ? '+' : ''}{fmt(f.net)}₪
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </LifeOSLayout>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ ...LIFEOS_CARD, textAlign: 'center' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: LIFEOS_COLORS.textSecondary }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color, marginTop: 4 }}>
        {fmt(value)}₪
      </div>
    </div>
  );
}

function AlertBanner({ type, text }) {
  const map = {
    warning: { bg: '#FEF3C7', border: '#EAB308', color: '#713F12' },
    success: { bg: '#DCFCE7', border: '#16a34a', color: '#14532D' },
    error:   { bg: '#FEE2E2', border: '#dc2626', color: '#7F1D1D' },
  };
  const s = map[type] || map.warning;
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 10,
      backgroundColor: s.bg, border: `1px solid ${s.border}`,
      color: s.color, fontSize: 13, fontWeight: 600,
    }}>
      {text}
    </div>
  );
}
