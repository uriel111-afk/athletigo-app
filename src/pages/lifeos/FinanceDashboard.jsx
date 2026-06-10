import React, { useCallback, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil, Check, X, RefreshCw } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { toast } from 'sonner';

import { AuthContext } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import { LIFEOS_COLORS, LIFEOS_CARD } from '@/lib/lifeos/lifeos-constants';
import {
  getMonthlySummary, listExpenses, listIncome,
} from '@/lib/lifeos/lifeos-api';

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

// Reads {annual_target, monthly_target} off the user row. Returns
// zeros if either column doesn't exist yet (42703) so the page can
// still render before the migration runs — the save handler surfaces
// the error in that case.
async function fetchGoals(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('annual_target, monthly_target')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    if (error.code === '42703') return { annual_target: 0, monthly_target: 0 };
    throw error;
  }
  return {
    annual_target:  Number(data?.annual_target)  || 0,
    monthly_target: Number(data?.monthly_target) || 0,
  };
}

export default function FinanceDashboard() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const navigate = useNavigate();

  const [annualTarget,   setAnnualTarget]   = useState(0);
  const [monthlyTarget,  setMonthlyTarget]  = useState(0);
  const [ytdIncome,      setYtdIncome]      = useState(0);
  const [monthSummary,   setMonthSummary]   = useState({ income: 0, expenses: 0, net: 0 });
  const [chart,          setChart]          = useState([]);
  const [loaded,         setLoaded]         = useState(false);

  // 'annual' | 'monthly' | null. Only one goal edits at a time.
  const [editing, setEditing] = useState(null);
  const [draft,   setDraft]   = useState('');

  const load = useCallback(async () => {
    if (!userId) return;
    setLoaded(false);
    try {
      const window = buildMonthWindow(6);
      const from = window[0].from;
      const to = window[window.length - 1].to;

      const yearStart = `${new Date().getFullYear()}-01-01`;
      const today = new Date().toISOString().slice(0, 10);

      const [goals, summary, ytdRows, expRows, incRows] = await Promise.all([
        fetchGoals(userId),
        getMonthlySummary(userId, new Date()),
        listIncome(userId, { from: yearStart, to: today }),
        listExpenses(userId, { from, to }),
        listIncome(userId, { from, to }),
      ]);

      setAnnualTarget(goals.annual_target);
      setMonthlyTarget(goals.monthly_target);
      setYtdIncome((ytdRows || []).reduce((s, r) => s + (Number(r.amount) || 0), 0));
      setMonthSummary(summary || { income: 0, expenses: 0, net: 0 });

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

  const startEdit = (which) => {
    setEditing(which);
    setDraft(String(which === 'annual' ? annualTarget : monthlyTarget));
  };
  const cancelEdit = () => {
    setEditing(null);
    setDraft('');
  };
  const saveGoal = async (which) => {
    const field = which === 'annual' ? 'annual_target' : 'monthly_target';
    const value = Number(draft) || 0;
    try {
      const { error } = await supabase
        .from('users')
        .update({ [field]: value })
        .eq('id', userId);
      if (error) throw error;
      if (which === 'annual') setAnnualTarget(value);
      else                    setMonthlyTarget(value);
      setEditing(null);
      setDraft('');
      toast.success('נשמר');
    } catch (err) {
      toast.error('שגיאה: ' + (err?.message || ''));
    }
  };

  const annualProgress  = annualTarget  > 0 ? Math.min(100, (ytdIncome             / annualTarget)  * 100) : 0;
  const monthlyProgress = monthlyTarget > 0 ? Math.min(100, (monthSummary.income   / monthlyTarget) * 100) : 0;

  return (
    <LifeOSLayout title="דשבורד פיננסי" onQuickSaved={load} rightSlot={
      <button onClick={load} aria-label="רענן" title="רענן" style={iconBtnStyle}>
        <RefreshCw size={16} />
      </button>
    }>
      <div style={{ padding: '0 14px' }}>
        {/* ─── Goals management link ─────────────────────────── */}
        <button
          onClick={() => navigate('/lifeos/goals')}
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 12,
            border: `1px solid ${LIFEOS_COLORS.border}`,
            backgroundColor: '#FFFFFF',
            color: LIFEOS_COLORS.textPrimary,
            fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            fontFamily: 'inherit',
          }}
        >
          <span>🎯 ניהול יעדים (קטגוריות + מוצרים)</span>
          <span style={{ color: LIFEOS_COLORS.textSecondary }}>‹</span>
        </button>

        {/* ─── Annual goal ──────────────────────────────────── */}
        <GoalCard
          title="יעד שנתי"
          target={annualTarget}
          actual={ytdIncome}
          progress={annualProgress}
          isEditing={editing === 'annual'}
          draft={draft}
          onDraftChange={setDraft}
          onStartEdit={() => startEdit('annual')}
          onSave={() => saveGoal('annual')}
          onCancel={cancelEdit}
        />

        {/* ─── Monthly goal ────────────────────────────────── */}
        <GoalCard
          title="יעד חודשי"
          target={monthlyTarget}
          actual={monthSummary.income}
          progress={monthlyProgress}
          isEditing={editing === 'monthly'}
          draft={draft}
          onDraftChange={setDraft}
          onStartEdit={() => startEdit('monthly')}
          onSave={() => saveGoal('monthly')}
          onCancel={cancelEdit}
        />

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

// ─── GoalCard ──────────────────────────────────────────────────
function GoalCard({
  title, target, actual, progress,
  isEditing, draft, onDraftChange,
  onStartEdit, onSave, onCancel,
}) {
  const reached = progress >= 100;

  return (
    <div style={{ ...LIFEOS_CARD, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={sectionTitleStyle}>{title}</div>
        {!isEditing && (
          <button onClick={onStartEdit} aria-label="ערוך" style={iconBtnStyle}>
            <Pencil size={14} />
          </button>
        )}
      </div>

      {isEditing ? (
        <div style={{
          display: 'flex', gap: 8, alignItems: 'center',
          padding: 10, borderRadius: 10,
          backgroundColor: LIFEOS_COLORS.primaryLight,
          border: `1px dashed ${LIFEOS_COLORS.primary}`,
          marginBottom: 10,
        }}>
          <span style={{ fontSize: 13, color: LIFEOS_COLORS.textSecondary }}>₪</span>
          <input
            type="number"
            inputMode="decimal"
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            placeholder="0"
            style={{ ...inputStyle, flex: 1 }}
            autoFocus
          />
          <button onClick={onSave} aria-label="שמור" style={{ ...iconBtnStyle, color: LIFEOS_COLORS.success }}>
            <Check size={16} />
          </button>
          <button onClick={onCancel} aria-label="בטל" style={{ ...iconBtnStyle, color: LIFEOS_COLORS.error }}>
            <X size={16} />
          </button>
        </div>
      ) : (
        <div style={{
          fontSize: 22, fontWeight: 800, color: LIFEOS_COLORS.textPrimary,
          marginBottom: 10, textAlign: 'left', direction: 'ltr',
        }}>
          {fmt(target)}<span style={{ fontSize: 14, color: LIFEOS_COLORS.textSecondary }}>₪</span>
        </div>
      )}

      {/* Progress bar */}
      <div style={{
        width: '100%', height: 10, borderRadius: 999,
        backgroundColor: '#F3EEE2',
        overflow: 'hidden',
        marginBottom: 6,
      }}>
        <div style={{
          width: `${progress}%`, height: '100%',
          backgroundColor: reached ? LIFEOS_COLORS.success : LIFEOS_COLORS.primary,
          transition: 'width 0.3s ease',
        }} />
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontSize: 12, color: LIFEOS_COLORS.textSecondary,
      }}>
        <span>{fmt(actual)} / {fmt(target)}₪</span>
        <span style={{ color: reached ? LIFEOS_COLORS.success : LIFEOS_COLORS.textSecondary, fontWeight: 700 }}>
          {pct(progress)}
        </span>
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

const inputStyle = {
  padding: '8px 10px',
  borderRadius: 8,
  border: `1px solid ${LIFEOS_COLORS.border}`,
  backgroundColor: '#FFFFFF',
  fontSize: 14,
  color: LIFEOS_COLORS.textPrimary,
  fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
  outline: 'none',
  boxSizing: 'border-box',
  width: '100%',
};

const loadingStyle = {
  padding: 24,
  textAlign: 'center',
  color: LIFEOS_COLORS.textSecondary,
  fontSize: 13,
};
