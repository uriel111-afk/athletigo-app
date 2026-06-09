import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Pencil, Trash2, RefreshCw, Plus, X } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { toast } from 'sonner';

import { AuthContext } from '@/lib/AuthContext';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import { LIFEOS_COLORS, LIFEOS_CARD } from '@/lib/lifeos/lifeos-constants';
import {
  getMonthlySummary, listExpenses, listIncome,
} from '@/lib/lifeos/lifeos-api';
import {
  getIncomeStreams, addIncomeStream, updateIncomeStream, deleteIncomeStream,
} from '@/lib/lifeos/income-api';

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

// Maps a stream name (as the user named it in the dashboard) to the
// income.source enum values that count toward it. For streams whose
// name matches a key here, actual_ytd and monthly_actual are derived
// live from the income table — any value stored in JSONB for those
// two fields is ignored. Unmapped streams (a name not in this map)
// fall back to whatever's in JSONB.
const STREAM_SOURCE_MAP = {
  'Coaching': ['training', 'online_coaching'],
  'Courses':  ['course', 'workshop'],
  'Products': ['product_sale'],
};

// Pure helper — given the raw JSONB streams + a YTD slice of income
// rows, returns the streams with actual_ytd / monthly_actual computed
// for any stream that's mapped in STREAM_SOURCE_MAP.
const deriveStreams = (rawStreams, ytdRows) => {
  const now = new Date();
  const currMonth = now.getMonth();
  const currYear = now.getFullYear();
  return (rawStreams || []).map(s => {
    const sources = STREAM_SOURCE_MAP[s.name];
    if (!sources) return s;
    const matching = (ytdRows || []).filter(r => sources.includes(r.source));
    const actual_ytd = matching.reduce(
      (sum, r) => sum + (Number(r.amount) || 0), 0
    );
    const monthly_actual = matching
      .filter(r => {
        if (!r.date) return false;
        const d = new Date(r.date);
        return d.getMonth() === currMonth && d.getFullYear() === currYear;
      })
      .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    return { ...s, actual_ytd, monthly_actual };
  });
};

export default function FinanceDashboard() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;

  const [streams, setStreams] = useState([]);
  const [summary, setSummary] = useState({ income: 0, expenses: 0, net: 0 });
  const [chart, setChart] = useState([]);
  const [loaded, setLoaded] = useState(false);

  // Inline forms — single source of truth so only one is open at a time.
  // 'adding' = the add-form is showing; otherwise the string is the
  // name of the stream being edited.
  const [openForm, setOpenForm] = useState(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoaded(false);
    try {
      const window = buildMonthWindow(6);
      const from = window[0].from;
      const to = window[window.length - 1].to;

      // YTD income — separate fetch because the 6-month chart window
      // doesn't always align with a calendar year (Jan still needs the
      // prior-year months for the chart but only the current-year rows
      // for actual_ytd).
      const yearStart = `${new Date().getFullYear()}-01-01`;
      const today = new Date().toISOString().slice(0, 10);

      const [streamsRes, summaryRes, expRows, incRows, ytdIncome] = await Promise.all([
        getIncomeStreams(userId),
        getMonthlySummary(userId, new Date()),
        listExpenses(userId, { from, to }),
        listIncome(userId, { from, to }),
        listIncome(userId, { from: yearStart, to: today }),
      ]);

      setStreams(deriveStreams(streamsRes, ytdIncome));
      setSummary(summaryRes || { income: 0, expenses: 0, net: 0 });

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
      toast.error('שגיאה בטעינת נתונים: ' + (err?.message || ''));
    } finally {
      setLoaded(true);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const totalAnnualTarget = useMemo(
    () => streams.reduce((s, x) => s + (Number(x.target_annual) || 0), 0),
    [streams]
  );
  const totalAnnualActual = useMemo(
    () => streams.reduce((s, x) => s + (Number(x.actual_ytd) || 0), 0),
    [streams]
  );
  const overallTargetProgress = totalAnnualTarget > 0
    ? Math.min(100, (totalAnnualActual / totalAnnualTarget) * 100)
    : 0;

  // After every mutation: reload so deriveStreams runs against the
  // fresh JSONB. setStreams direct from the mutation result would skip
  // derivation and briefly show stale actual_ytd for mapped streams.
  const handleAdd = async ({ name, target_annual }) => {
    try {
      await addIncomeStream(userId, { name, target_annual });
      setOpenForm(null);
      toast.success('Stream נוסף');
      load();
    } catch (err) {
      toast.error('שגיאה: ' + (err?.message || ''));
    }
  };

  const handleUpdate = async (streamName, patch) => {
    try {
      await updateIncomeStream(userId, streamName, patch);
      setOpenForm(null);
      toast.success('עודכן');
      load();
    } catch (err) {
      toast.error('שגיאה: ' + (err?.message || ''));
    }
  };

  const handleDelete = async (streamName) => {
    if (!confirm(`למחוק את "${streamName}"?`)) return;
    try {
      await deleteIncomeStream(userId, streamName);
      toast.success('נמחק');
      load();
    } catch (err) {
      toast.error('שגיאה: ' + (err?.message || ''));
    }
  };

  return (
    <LifeOSLayout title="דשבורד פיננסי" onQuickSaved={load} rightSlot={
      <button onClick={load} aria-label="רענן" title="רענן" style={iconBtnStyle}>
        <RefreshCw size={16} />
      </button>
    }>
      {/* ─── Monthly summary ───────────────────────────────────── */}
      <div style={{ ...LIFEOS_CARD, marginBottom: 12 }}>
        <div style={sectionTitleStyle}>סיכום החודש</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <SummaryTile label="הכנסות" value={fmt(summary.income)} color={LIFEOS_COLORS.success} />
          <SummaryTile label="הוצאות" value={fmt(summary.expenses)} color={LIFEOS_COLORS.error} />
          <SummaryTile
            label="נטו"
            value={fmt(summary.net)}
            color={summary.net >= 0 ? LIFEOS_COLORS.success : LIFEOS_COLORS.error}
          />
        </div>
      </div>

      {/* ─── CashFlow 6-month bar chart ────────────────────────── */}
      <div style={{ ...LIFEOS_CARD, marginBottom: 12 }}>
        <div style={sectionTitleStyle}>תזרים — 6 חודשים</div>
        {!loaded ? (
          <div style={{ padding: 30, textAlign: 'center', color: LIFEOS_COLORS.textSecondary, fontSize: 13 }}>
            טוען...
          </div>
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

      {/* ─── Income streams ───────────────────────────────────── */}
      <div style={{ ...LIFEOS_CARD, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={sectionTitleStyle}>זרמי הכנסה</div>
          {totalAnnualTarget > 0 && (
            <div style={{ fontSize: 11, color: LIFEOS_COLORS.textSecondary }}>
              {fmt(totalAnnualActual)} / {fmt(totalAnnualTarget)}₪ ({pct(overallTargetProgress)})
            </div>
          )}
        </div>

        {!loaded ? (
          <div style={{ padding: 20, textAlign: 'center', color: LIFEOS_COLORS.textSecondary, fontSize: 13 }}>
            טוען...
          </div>
        ) : streams.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 30, marginBottom: 6 }}>📊</div>
            <div style={{ fontSize: 13, color: LIFEOS_COLORS.textSecondary, marginBottom: 12 }}>
              אין עדיין זרמי הכנסה
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {streams.map(s => (
              <StreamCard
                key={s.name}
                stream={s}
                isEditing={openForm === s.name}
                onStartEdit={() => setOpenForm(s.name)}
                onCancelEdit={() => setOpenForm(null)}
                onSave={(patch) => handleUpdate(s.name, patch)}
                onDelete={() => handleDelete(s.name)}
              />
            ))}
          </div>
        )}

        {/* Add stream — inline */}
        {openForm === 'adding' ? (
          <AddStreamForm
            onSave={handleAdd}
            onCancel={() => setOpenForm(null)}
          />
        ) : (
          <button
            onClick={() => setOpenForm('adding')}
            style={{
              width: '100%', marginTop: 12,
              padding: '12px 14px', borderRadius: 12,
              border: `1px dashed ${LIFEOS_COLORS.primary}`,
              backgroundColor: LIFEOS_COLORS.primaryLight,
              color: LIFEOS_COLORS.primary,
              fontSize: 14, fontWeight: 700,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              fontFamily: 'inherit',
            }}
          >
            <Plus size={16} /> הוסף stream
          </button>
        )}
      </div>
    </LifeOSLayout>
  );
}

// ─── StreamCard ────────────────────────────────────────────────
function StreamCard({ stream, isEditing, onStartEdit, onCancelEdit, onSave, onDelete }) {
  const [form, setForm] = useState({
    target_annual:  stream.target_annual  || 0,
    actual_ytd:     stream.actual_ytd     || 0,
    monthly_actual: stream.monthly_actual || 0,
    growth_rate:    stream.growth_rate    || 0,
  });

  // Re-seed when the row's underlying values change (e.g. another
  // save happened) so the local form doesn't drift.
  useEffect(() => {
    setForm({
      target_annual:  stream.target_annual  || 0,
      actual_ytd:     stream.actual_ytd     || 0,
      monthly_actual: stream.monthly_actual || 0,
      growth_rate:    stream.growth_rate    || 0,
    });
  }, [stream.target_annual, stream.actual_ytd, stream.monthly_actual, stream.growth_rate]);

  const target = Number(stream.target_annual) || 0;
  const actual = Number(stream.actual_ytd) || 0;
  const progress = target > 0 ? Math.min(100, (actual / target) * 100) : 0;

  return (
    <div style={{
      backgroundColor: '#FFFFFF',
      border: `1px solid ${LIFEOS_COLORS.border}`,
      borderRadius: 12,
      padding: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1, fontSize: 14, fontWeight: 700, color: LIFEOS_COLORS.textPrimary }}>
          {stream.name}
        </div>
        {!isEditing && (
          <>
            <button onClick={onStartEdit} aria-label="ערוך" style={iconBtnStyle}>
              <Pencil size={14} />
            </button>
            <button
              onClick={onDelete}
              aria-label="מחק"
              style={{ ...iconBtnStyle, color: LIFEOS_COLORS.error }}
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
      </div>

      {/* Progress bar — actual_ytd / target_annual */}
      <div style={{ marginBottom: 8 }}>
        <div style={{
          width: '100%', height: 8, borderRadius: 999,
          backgroundColor: '#F3EEE2',
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${progress}%`, height: '100%',
            backgroundColor: progress >= 100 ? LIFEOS_COLORS.success : LIFEOS_COLORS.primary,
            transition: 'width 0.3s ease',
          }} />
        </div>
        <div style={{
          fontSize: 11, color: LIFEOS_COLORS.textSecondary,
          marginTop: 4, display: 'flex', justifyContent: 'space-between',
        }}>
          <span>שנתי: {fmt(actual)} / {fmt(target)}₪</span>
          <span>{pct(progress)}</span>
        </div>
      </div>

      {/* Stats — monthly + growth */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
        fontSize: 12, color: LIFEOS_COLORS.textSecondary,
      }}>
        <div>
          החודש: <strong style={{ color: LIFEOS_COLORS.textPrimary }}>
            {fmt(stream.monthly_actual)}₪
          </strong>
        </div>
        <div>
          צמיחה: <strong style={{ color: LIFEOS_COLORS.textPrimary }}>
            {pct(stream.growth_rate)}
          </strong>
        </div>
      </div>

      {/* Edit form */}
      {isEditing && (
        <div style={{
          marginTop: 12, padding: 10, borderRadius: 10,
          backgroundColor: LIFEOS_COLORS.primaryLight,
          border: `1px dashed ${LIFEOS_COLORS.primary}`,
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <NumberField
            label="יעד שנתי (₪)"
            value={form.target_annual}
            onChange={(v) => setForm(prev => ({ ...prev, target_annual: v }))}
          />
          <NumberField
            label="בפועל מתחילת השנה (₪)"
            value={form.actual_ytd}
            onChange={(v) => setForm(prev => ({ ...prev, actual_ytd: v }))}
          />
          <NumberField
            label="החודש (₪)"
            value={form.monthly_actual}
            onChange={(v) => setForm(prev => ({ ...prev, monthly_actual: v }))}
          />
          <NumberField
            label="צמיחה (%)"
            value={form.growth_rate}
            onChange={(v) => setForm(prev => ({ ...prev, growth_rate: v }))}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button onClick={onCancelEdit} style={btnSecondary}>ביטול</button>
            <button onClick={() => onSave(form)} style={btnPrimary}>שמור</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── AddStreamForm ─────────────────────────────────────────────
function AddStreamForm({ onSave, onCancel }) {
  const [name, setName] = useState('');
  const [target, setTarget] = useState(0);

  return (
    <div style={{
      marginTop: 12, padding: 12, borderRadius: 12,
      backgroundColor: LIFEOS_COLORS.primaryLight,
      border: `1px dashed ${LIFEOS_COLORS.primary}`,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: LIFEOS_COLORS.textPrimary }}>
          stream חדש
        </div>
        <button onClick={onCancel} aria-label="סגור" style={iconBtnStyle}>
          <X size={14} />
        </button>
      </div>
      <div>
        <label style={labelStyle}>שם</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="למשל: אימון אישי"
          style={inputStyle}
          autoFocus
        />
      </div>
      <NumberField
        label="יעד שנתי (₪)"
        value={target}
        onChange={setTarget}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onCancel} style={btnSecondary}>ביטול</button>
        <button
          onClick={() => onSave({ name, target_annual: target })}
          disabled={!name.trim()}
          style={{
            ...btnPrimary,
            opacity: name.trim() ? 1 : 0.5,
            cursor: name.trim() ? 'pointer' : 'not-allowed',
          }}
        >
          הוסף
        </button>
      </div>
    </div>
  );
}

// ─── Reusable bits ─────────────────────────────────────────────
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

function NumberField({ label, value, onChange }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        style={inputStyle}
      />
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────
const sectionTitleStyle = {
  fontSize: 13,
  fontWeight: 700,
  color: LIFEOS_COLORS.textPrimary,
  marginBottom: 10,
};

const iconBtnStyle = {
  width: 28, height: 28, borderRadius: 8, border: 'none',
  background: 'transparent', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: LIFEOS_COLORS.textSecondary,
};

const labelStyle = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  color: LIFEOS_COLORS.textSecondary,
  marginBottom: 4,
};

const inputStyle = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 8,
  border: `1px solid ${LIFEOS_COLORS.border}`,
  backgroundColor: '#FFFFFF',
  fontSize: 13,
  color: LIFEOS_COLORS.textPrimary,
  fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
  outline: 'none',
  boxSizing: 'border-box',
};

const btnPrimary = {
  flex: 1,
  padding: '10px 14px',
  borderRadius: 10,
  border: 'none',
  backgroundColor: LIFEOS_COLORS.primary,
  color: '#FFFFFF',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const btnSecondary = {
  flex: 1,
  padding: '10px 14px',
  borderRadius: 10,
  border: `1px solid ${LIFEOS_COLORS.border}`,
  backgroundColor: '#FFFFFF',
  color: LIFEOS_COLORS.textPrimary,
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
