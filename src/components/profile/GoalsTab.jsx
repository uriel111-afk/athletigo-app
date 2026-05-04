import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { supabase } from '@/lib/supabaseClient';

// Open-ended goal input UX helpers.
//
// GOAL_PLACEHOLDERS — rotated every 2s while the title field is
// empty + focused. Each example reads as a full trainee statement
// so the "this is free text, not just a number" affordance is
// obvious before the trainee starts typing.
const GOAL_PLACEHOLDERS = [
  'לדוגמה: "10 עליות סנטה"',
  'לדוגמה: "לרוץ 5 ק״מ בלי לעצור"',
  'לדוגמה: "להרגיש קל בקפיצות"',
  'לדוגמה: "לעמוד 60 שניות על הידיים"',
];
const GOAL_TITLE_MAX = 120;

// Reusable autogrow textarea — single-line by default, scrollHeight
// trick expands as the user types. RTL + brand styling baked in.
function AutogrowTextarea({
  value, onChange, placeholder, maxLength, style, onFocus, onBlur, ...rest
}) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value.slice(0, maxLength || Infinity))}
      onFocus={onFocus}
      onBlur={onBlur}
      placeholder={placeholder}
      rows={1}
      style={{
        width: '100%', padding: '12px 14px',
        border: '1.5px solid #F0E4D0', borderRadius: 10,
        fontSize: 15, direction: 'rtl', boxSizing: 'border-box',
        resize: 'none', overflow: 'hidden', minHeight: 44,
        fontFamily: 'inherit', lineHeight: 1.5,
        outline: 'none', background: 'white',
        ...(style || {}),
      }}
      {...rest}
    />
  );
}

// Inline character counter — gray under the limit, brand orange in
// the last 20 chars so the trainee sees the boundary coming.
function CharCounter({ length, max }) {
  const near = length > (max - 20);
  return (
    <div style={{
      fontSize: 11,
      color: near ? '#FF6F20' : '#888',
      textAlign: 'left',
      marginTop: 2,
      fontFeatureSettings: '"tnum"',
    }}>
      {length}/{max}
    </div>
  );
}

// Tiny ✅ that fades in/out beside a save control. 300ms fade-in,
// auto-clears via parent state.
function SaveCheckmark({ show }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block', marginRight: 8,
        opacity: show ? 1 : 0,
        transform: show ? 'scale(1)' : 'scale(0.85)',
        transition: 'opacity 0.3s ease, transform 0.3s ease',
        fontSize: 16, lineHeight: 1,
      }}
    >
      {show ? '✅' : ''}
    </span>
  );
}

// Goals system v2 — measurable, trackable goals.
//   Per-goal accordion card with a sparkline of every measurement.
//   "+ הוסף מדידה" appends to goals.measurements JSONB and updates
//   current_value. New goals open via NewGoalSheet (type picker
//   then form).

const GOAL_PRESETS = [
  { type: 'distance',     icon: '🏃', label: 'ריצה / מרחק',  unit: 'ק"מ' },
  { type: 'reps',         icon: '💪', label: 'כוח / חזרות',   unit: 'חזרות' },
  { type: 'weight_loss',  icon: '⚖️', label: 'ירידה במשקל',  unit: 'ק"ג' },
  { type: 'weight_gain',  icon: '📈', label: 'עלייה במסה',   unit: 'ק"ג' },
  { type: 'skill',        icon: '🎯', label: 'מיומנות',      unit: 'שלב' },
  { type: 'time',         icon: '⏱', label: 'שיפור זמן',    unit: 'שניות' },
  { type: 'body',         icon: '📏', label: 'מדדי גוף',     unit: 'ס"מ' },
  { type: 'custom',       icon: '✨', label: 'יעד אחר',      unit: '' },
];

const goalTypeIcon = (type) => {
  const found = GOAL_PRESETS.find((p) => p.type === type);
  return found ? found.icon : '🎯';
};

const parseMeasurements = (raw) => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw) {
    try { return JSON.parse(raw); } catch { return []; }
  }
  return [];
};

const getProgressPct = (goal) => {
  const start = Number(goal.start_value);
  const target = Number(goal.target_value);
  const current = Number(goal.current_value ?? goal.start_value);
  if (!Number.isFinite(start) || !Number.isFinite(target) || target === start) return 0;
  const range = target - start;
  const advanced = current - start;
  return Math.min(100, Math.max(0, Math.round((advanced / range) * 100)));
};

function NewGoalSheet({ onClose, traineeId, onSaved }) {
  const [step, setStep] = useState(1);
  const [selectedType, setSelectedType] = useState(null);
  const [form, setForm] = useState({
    title: '', successDefinition: '', startValue: '', targetValue: '',
    unit: '', targetDate: '',
  });
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // Rotating placeholder for the title field — flips through
  // GOAL_PLACEHOLDERS every 2s while the field is empty + focused.
  const [titleFocused, setTitleFocused] = useState(false);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  useEffect(() => {
    if (!titleFocused || form.title.length > 0) return;
    const t = setInterval(
      () => setPlaceholderIdx((n) => (n + 1) % GOAL_PLACEHOLDERS.length),
      2000,
    );
    return () => clearInterval(t);
  }, [titleFocused, form.title]);

  const saveGoal = async () => {
    if (!form.title || !form.targetValue || !selectedType) return;
    setSaving(true);
    try {
      // Open inputs — the trainee may type "10 חזרות" or "5 ק״מ".
      // parseFloat extracts the leading number for the NUMERIC
      // start_value / target_value columns; the full string also
      // lands in title / success_definition for free-text recall.
      const startNum = parseFloat(form.startValue);
      const targetNum = parseFloat(form.targetValue);
      const startVal = Number.isFinite(startNum) ? startNum : 0;
      const targetVal = Number.isFinite(targetNum) ? targetNum : null;
      const { error } = await supabase.from('goals').insert({
        trainee_id: traineeId,
        title: form.title.trim(),
        goal_type: selectedType.type,
        start_value: startVal,
        current_value: startVal,
        target_value: targetVal,
        unit: form.unit?.trim() || selectedType.unit || null,
        success_definition: form.successDefinition?.trim() || null,
        target_date: form.targetDate || null,
        status: 'פעיל',
        source: 'manual',
        measurements: JSON.stringify([{
          date: new Date().toISOString(),
          value: startVal,
          note: 'מדידה ראשונית',
        }]),
      });
      if (error) throw error;
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1200);
      toast.success('היעד נוצר ✅');
      onSaved && onSaved();
    } catch (e) {
      console.warn('[GoalsTab] saveGoal failed:', e?.message);
      toast.error('יצירת יעד נכשלה');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.5)', zIndex: 999,
      }} />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: 'white', borderRadius: '20px 20px 0 0',
          padding: '24px 20px 100px', zIndex: 1000,
          maxHeight: '85vh', overflowY: 'auto', direction: 'rtl',
        }}
      >
        <div style={{
          width: 36, height: 4, background: '#E5E7EB',
          borderRadius: 999, margin: '0 auto 20px',
        }} />

        {step === 1 && (
          <>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>איזה סוג יעד?</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {GOAL_PRESETS.map((preset) => (
                <button
                  key={preset.type}
                  type="button"
                  onClick={() => {
                    setSelectedType(preset);
                    setForm((f) => ({ ...f, unit: preset.unit }));
                    setStep(2);
                  }}
                  style={{
                    padding: '16px 12px', borderRadius: 14, cursor: 'pointer',
                    background: 'white', border: '1.5px solid #F0E4D0',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                  }}
                >
                  <span style={{ fontSize: 28 }}>{preset.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a' }}>{preset.label}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 2 && selectedType && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <button
                type="button"
                onClick={() => setStep(1)}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#888' }}
                aria-label="חזרה"
              >→</button>
              <span style={{ fontSize: 22 }}>{selectedType.icon}</span>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{selectedType.label}</div>
            </div>

            {/* Title — autogrow textarea, char counter, rotating
                placeholder while empty + focused. Open-ended so the
                trainee can write "10 עליות סנטה" or a longer phrase. */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#888', marginBottom: 6 }}>
                אני רוצה...
              </div>
              <AutogrowTextarea
                value={form.title}
                onChange={(v) => setForm((f) => ({ ...f, title: v }))}
                onFocus={() => setTitleFocused(true)}
                onBlur={() => setTitleFocused(false)}
                placeholder={GOAL_PLACEHOLDERS[placeholderIdx]}
                maxLength={GOAL_TITLE_MAX}
              />
              <CharCounter length={form.title.length} max={GOAL_TITLE_MAX} />
            </div>

            {/* Success definition — also free text + autogrow. */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#888', marginBottom: 6 }}>
                הצלחה תיראה כך:
              </div>
              <AutogrowTextarea
                value={form.successDefinition}
                onChange={(v) => setForm((f) => ({ ...f, successDefinition: v }))}
                placeholder='למשל: "לרוץ 5 ק״מ בלי לעצור"'
                maxLength={GOAL_TITLE_MAX}
              />
              <CharCounter length={form.successDefinition.length} max={GOAL_TITLE_MAX} />
            </div>

            {/* Start / target — open text. parseFloat extracts the
                leading number on save; the trainee can also type
                a phrase ("עליות סנטה: 0", "5 ק״מ") and save the
                numeric portion. */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#888', marginBottom: 6 }}>
                נקודת התחלה (היום)
              </div>
              <input
                type="text"
                placeholder={`לדוגמה: 0 ${selectedType.unit}`.trim()}
                value={form.startValue}
                onChange={(e) => setForm((f) => ({ ...f, startValue: e.target.value }))}
                style={{
                  width: '100%', padding: '12px 14px',
                  border: '1.5px solid #F0E4D0', borderRadius: 10,
                  fontSize: 15, direction: 'rtl', boxSizing: 'border-box',
                  outline: 'none', background: 'white',
                }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#888', marginBottom: 6 }}>
                יעד סופי
              </div>
              <input
                type="text"
                placeholder={`לדוגמה: 10 ${selectedType.unit}`.trim()}
                value={form.targetValue}
                onChange={(e) => setForm((f) => ({ ...f, targetValue: e.target.value }))}
                style={{
                  width: '100%', padding: '12px 14px',
                  border: '1.5px solid #F0E4D0', borderRadius: 10,
                  fontSize: 15, direction: 'rtl', boxSizing: 'border-box',
                  outline: 'none', background: 'white',
                }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#888', marginBottom: 6 }}>
                יחידת מידה
              </div>
              <input
                type="text"
                placeholder={selectedType.unit}
                value={form.unit}
                onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                style={{
                  width: '100%', padding: '12px 14px',
                  border: '1.5px solid #F0E4D0', borderRadius: 10,
                  fontSize: 15, direction: 'rtl', boxSizing: 'border-box',
                  outline: 'none', background: 'white',
                }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#888', marginBottom: 6 }}>
                תאריך יעד (אופציונלי)
              </div>
              <input
                type="date"
                value={form.targetDate}
                onChange={(e) => setForm((f) => ({ ...f, targetDate: e.target.value }))}
                style={{
                  width: '100%', padding: '12px 14px',
                  border: '1.5px solid #F0E4D0', borderRadius: 10,
                  fontSize: 15, direction: 'rtl', boxSizing: 'border-box',
                  outline: 'none', background: 'white',
                }}
              />
            </div>

            <button
              type="button"
              onClick={saveGoal}
              disabled={!form.title || !form.targetValue || saving}
              style={{
                width: '100%', padding: '14px',
                background: form.title && form.targetValue && !saving ? '#FF6F20' : '#F5F5F5',
                border: 'none', borderRadius: 12,
                color: form.title && form.targetValue && !saving ? 'white' : '#aaa',
                fontWeight: 700, fontSize: 16,
                cursor: form.title && form.targetValue && !saving ? 'pointer' : 'not-allowed',
                marginTop: 8,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <SaveCheckmark show={savedFlash} />
              {saving ? 'שומר...' : 'צור יעד ✓'}
            </button>
          </>
        )}
      </div>
    </>
  );
}

function GoalCard({ goal, isOpen, onToggle, onMeasurementSaved }) {
  const [measValue, setMeasValue] = useState('');
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const pct = getProgressPct(goal);
  const measurements = parseMeasurements(goal.measurements);
  const chartData = [
    { date: 'התחלה', value: Number(goal.start_value) || 0 },
    ...measurements.map((m) => ({
      date: new Date(m.date).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' }),
      value: Number(m.value),
    })).filter((d) => Number.isFinite(d.value)),
  ];

  const saveMeasurement = async () => {
    // Open input — accept "10 חזרות" or "5 ק״מ" too. parseFloat
    // extracts the leading number for the chart point; the
    // freeform note (full string) attaches as the "note" field
    // so the trainee can recall what they actually wrote.
    const val = parseFloat(measValue);
    if (!Number.isFinite(val)) {
      toast.error('יש להזין מספר במדידה');
      return;
    }
    setSaving(true);
    try {
      const trimmed = (measValue || '').trim();
      const note = trimmed && trimmed !== String(val) ? trimmed : null;
      const entry = note
        ? { date: new Date().toISOString(), value: val, note }
        : { date: new Date().toISOString(), value: val };
      const updated = [...measurements, entry];
      const { error } = await supabase
        .from('goals')
        .update({
          measurements: JSON.stringify(updated),
          current_value: val,
        })
        .eq('id', goal.id);
      if (error) throw error;
      setMeasValue('');
      setAdding(false);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1200);
      toast.success('מדידה נשמרה ✅');
      onMeasurementSaved && onMeasurementSaved();
    } catch (e) {
      console.warn('[GoalsTab] saveMeasurement failed:', e?.message);
      toast.error('שמירת מדידה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      background: 'white', borderRadius: 16,
      border: '1px solid #F0E4D0', marginBottom: 12,
      overflow: 'hidden',
      boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
    }}>
      <div style={{ height: 6, background: '#F5EDDB' }}>
        <div style={{
          height: '100%', width: `${pct}%`,
          background: '#FF6F20',
          transition: 'width 0.4s ease',
          borderRadius: '0 999px 999px 0',
        }} />
      </div>

      <div
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
        style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
      >
        <div style={{
          width: 48, height: 48, borderRadius: 14,
          background: '#FFF5EE', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          fontSize: 24, flexShrink: 0,
        }}>
          {goalTypeIcon(goal.goal_type)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 17, fontWeight: 700, color: '#1a1a1a',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {goal.title || goal.goal_name || 'יעד'}
          </div>
          <div style={{ fontSize: 13, color: '#888', marginTop: 3 }}>
            {goal.current_value ?? goal.start_value ?? 0} / {goal.target_value ?? '?'} {goal.unit || ''}
          </div>
        </div>
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#FF6F20' }}>{pct}%</div>
          <div style={{ fontSize: 10, color: '#aaa' }}>התקדמות</div>
        </div>
        <span style={{ fontSize: 12, color: '#ccc' }}>{isOpen ? '▲' : '▼'}</span>
      </div>

      {isOpen && (
        <div style={{ borderTop: '1px solid #F5F5F5', padding: 16 }}>
          {goal.success_definition && (
            <div style={{
              background: '#FFF5EE', borderRadius: 10, padding: '10px 14px',
              marginBottom: 14, fontSize: 13, color: '#FF6F20',
              borderRight: '3px solid #FF6F20', fontStyle: 'italic',
            }}>
              הצלחה = {goal.success_definition}
            </div>
          )}

          {chartData.length > 1 && (
            <div style={{ marginBottom: 14 }}>
              <ResponsiveContainer width="100%" height={140}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id={`g${goal.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#FF6F20" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#FF6F20" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#aaa' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#aaa' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: '#1a1a1a', border: 'none', borderRadius: 10, color: 'white', fontSize: 12 }}
                    formatter={(v) => [`${v} ${goal.unit || ''}`, goal.title || 'יעד']}
                  />
                  <Area
                    type="monotone" dataKey="value"
                    stroke="#FF6F20" strokeWidth={2.5}
                    fill={`url(#g${goal.id})`}
                    dot={{ fill: '#FF6F20', r: 4, stroke: 'white', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {adding ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
              <input
                type="text"
                placeholder={goal.unit ? `לדוגמה: 10 ${goal.unit}` : 'הזן ערך'}
                value={measValue}
                onChange={(e) => setMeasValue(e.target.value.slice(0, GOAL_TITLE_MAX))}
                autoFocus
                style={{
                  flex: 1, height: 44, fontSize: 16, fontWeight: 600,
                  border: '2px solid #FF6F20', borderRadius: 10,
                  textAlign: 'right', padding: '0 12px',
                  outline: 'none', direction: 'rtl',
                  boxSizing: 'border-box',
                }}
              />
              <button
                type="button"
                onClick={saveMeasurement}
                disabled={!measValue || saving}
                style={{
                  padding: '10px 16px',
                  background: measValue && !saving ? '#FF6F20' : '#F5F5F5',
                  color: measValue && !saving ? 'white' : '#aaa',
                  border: 'none', borderRadius: 10,
                  fontWeight: 700, cursor: measValue && !saving ? 'pointer' : 'not-allowed',
                  display: 'inline-flex', alignItems: 'center',
                }}
              >
                <SaveCheckmark show={savedFlash} />
                {saving ? '...' : 'שמור'}
              </button>
              <button
                type="button"
                onClick={() => { setAdding(false); setMeasValue(''); }}
                style={{
                  padding: '10px 14px', background: '#F5F5F5', border: 'none',
                  borderRadius: 10, color: '#888', cursor: 'pointer',
                }}
                aria-label="בטל"
              >✕</button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              style={{
                width: '100%', padding: '10px', background: '#FFF5EE',
                border: '1px solid #FFE5D0', borderRadius: 10,
                color: '#FF6F20', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}
            >
              + הוסף מדידה
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function GoalsTab({ traineeId }) {
  const [openGoalId, setOpenGoalId] = useState(null);
  const [showNewGoal, setShowNewGoal] = useState(false);

  const { data: goals = [], refetch } = useQuery({
    queryKey: ['goals-v2', traineeId],
    queryFn: async () => {
      if (!traineeId) return [];
      const { data, error } = await supabase
        .from('goals')
        .select('*')
        .eq('trainee_id', traineeId)
        .order('created_at', { ascending: false });
      if (error) {
        console.warn('[GoalsTab] fetch failed:', error.message);
        return [];
      }
      return data || [];
    },
    enabled: !!traineeId,
  });

  return (
    <div style={{ padding: 16, direction: 'rtl' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 20,
      }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#1a1a1a' }}>
          היעדים שלי
        </div>
        <button
          type="button"
          onClick={() => setShowNewGoal(true)}
          style={{
            background: '#FF6F20', border: 'none', borderRadius: 999,
            color: 'white', padding: '8px 18px', fontSize: 14,
            fontWeight: 700, cursor: 'pointer',
          }}
        >
          + יעד חדש
        </button>
      </div>

      {goals.map((goal) => (
        <GoalCard
          key={goal.id}
          goal={goal}
          isOpen={openGoalId === goal.id}
          onToggle={() => setOpenGoalId(openGoalId === goal.id ? null : goal.id)}
          onMeasurementSaved={refetch}
        />
      ))}

      {goals.length === 0 && (
        <div
          onClick={() => setShowNewGoal(true)}
          style={{
            background: 'white', borderRadius: 16,
            border: '2px dashed #F0E4D0', padding: 32,
            textAlign: 'center', cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>🎯</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#aaa' }}>עוד אין יעדים</div>
          <div style={{ fontSize: 13, color: '#ccc', marginTop: 4 }}>לחץ להוספת יעד ראשון</div>
        </div>
      )}

      {showNewGoal && (
        <NewGoalSheet
          traineeId={traineeId}
          onClose={() => setShowNewGoal(false)}
          onSaved={() => { refetch(); setShowNewGoal(false); }}
        />
      )}
    </div>
  );
}
