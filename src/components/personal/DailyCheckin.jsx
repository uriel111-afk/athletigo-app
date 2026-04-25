import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import {
  PERSONAL_COLORS, MOODS, TRAINING_TYPES, WELLNESS_ACTIONS,
} from '@/lib/personal/personal-constants';
import { upsertCheckin } from '@/lib/personal/personal-api';
import { calculateDailyScore } from '@/lib/personal/personal-score';

const TODAY = () => new Date().toISOString().slice(0, 10);

const initialForm = (existing) => ({
  date: existing?.date || TODAY(),
  mood: existing?.mood ?? null,
  sleep_start: existing?.sleep_start || '',
  sleep_end: existing?.sleep_end || '',
  trained: existing?.trained ?? null,
  training_type: existing?.training_type || '',
  nutrition_score: existing?.nutrition_score ?? null,
  cooked: existing?.cooked ?? null,
  learned: existing?.learned ?? null,
  learned_topic: existing?.learned_topic || '',
  meditated: existing?.meditated ?? false,
  meditate_action: existing?.meditated ? 'meditation' : '',
  journal_entry: existing?.journal_entry || '',
});

const calcSleepHours = (start, end) => {
  if (!start || !end) return null;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60; // wrapped past midnight
  return Math.round((mins / 60) * 10) / 10;
};

export default function DailyCheckin({ isOpen, onClose, userId, existing = null, onSaved }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(initialForm(existing));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setForm(initialForm(existing));
    setStep(0);
  }, [isOpen, existing?.id]);

  const set = (patch) => setForm(prev => ({ ...prev, ...patch }));

  const sleepHours = calcSleepHours(form.sleep_start, form.sleep_end);

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      date: form.date,
      mood: form.mood,
      sleep_start: form.sleep_start || null,
      sleep_end: form.sleep_end || null,
      sleep_hours: sleepHours,
      trained: !!form.trained,
      training_type: form.trained ? (form.training_type || null) : null,
      nutrition_score: form.nutrition_score,
      cooked: !!form.cooked,
      learned: !!form.learned,
      learned_topic: form.learned ? (form.learned_topic || null) : null,
      meditated: form.meditate_action && form.meditate_action !== 'none',
      journal_entry: form.journal_entry || null,
    };
    payload.daily_score = calculateDailyScore(payload);

    try {
      await upsertCheckin(userId, payload);
      toast.success('יום טוב אוריאל ✓');
      onSaved?.(payload);
      onClose?.();
    } catch (err) {
      console.error('[DailyCheckin] save error:', err);
      toast.error('שגיאה: ' + (err?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  const STEPS = [
    // 1. Mood
    {
      title: 'איך אתה מרגיש היום?',
      content: (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, padding: '20px 0' }}>
          {MOODS.map(m => (
            <button key={m.value}
              onClick={() => { set({ mood: m.value }); setStep(s => s + 1); }}
              style={{
                flex: 1, padding: '16px 4px', borderRadius: 14,
                border: form.mood === m.value
                  ? `2px solid ${PERSONAL_COLORS.primary}`
                  : `1px solid ${PERSONAL_COLORS.border}`,
                background: form.mood === m.value ? PERSONAL_COLORS.primaryLight : '#FFFFFF',
                cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              }}>
              <span style={{ fontSize: 32, lineHeight: 1 }}>{m.emoji}</span>
              <span style={{ fontSize: 10, fontWeight: 600, color: PERSONAL_COLORS.textSecondary }}>{m.label}</span>
            </button>
          ))}
        </div>
      ),
    },

    // 2. Sleep
    {
      title: 'מתי הלכת לישון? מתי קמת?',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="הלכתי לישון">
              <input type="time" value={form.sleep_start}
                onChange={e => set({ sleep_start: e.target.value })}
                style={timeInput} />
            </Field>
            <Field label="קמתי">
              <input type="time" value={form.sleep_end}
                onChange={e => set({ sleep_end: e.target.value })}
                style={timeInput} />
            </Field>
          </div>
          {sleepHours !== null && (
            <div style={{
              textAlign: 'center', padding: 12, borderRadius: 10,
              backgroundColor: sleepHours >= 7 ? '#DCFCE7' : '#FEF2F2',
              fontSize: 18, fontWeight: 800,
              color: sleepHours >= 7 ? PERSONAL_COLORS.success : PERSONAL_COLORS.error,
            }}>
              {sleepHours} שעות שינה {sleepHours >= 7 ? '✓' : '— צריך יותר'}
            </div>
          )}
        </div>
      ),
    },

    // 3. Training
    {
      title: 'אימנת היום?',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 0' }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <ChoiceBtn active={form.trained === true}
              onClick={() => set({ trained: true })}
              emoji="💪" label="כן" />
            <ChoiceBtn active={form.trained === false}
              onClick={() => set({ trained: false, training_type: '' })}
              emoji="⏭️" label="עוד לא" />
          </div>
          {form.trained && (
            <div>
              <label style={fieldLabel}>סוג אימון</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                {TRAINING_TYPES.map(t => (
                  <button key={t.key} onClick={() => set({ training_type: t.key })}
                    style={chipStyle(form.training_type === t.key)}>
                    <span style={{ fontSize: 18 }}>{t.emoji}</span>
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ),
    },

    // 4. Nutrition + cooking
    {
      title: 'אכלת טוב?',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '12px 0' }}>
          <div>
            <label style={fieldLabel}>איכות תזונה</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} onClick={() => set({ nutrition_score: n })}
                  style={{
                    flex: 1, padding: '14px 0', borderRadius: 10,
                    border: form.nutrition_score === n
                      ? `2px solid ${PERSONAL_COLORS.primary}`
                      : `1px solid ${PERSONAL_COLORS.border}`,
                    background: form.nutrition_score === n
                      ? PERSONAL_COLORS.primaryLight : '#FFFFFF',
                    fontSize: 16, fontWeight: 800,
                    color: PERSONAL_COLORS.textPrimary,
                    cursor: 'pointer',
                  }}>{n}</button>
              ))}
            </div>
          </div>
          <div>
            <label style={fieldLabel}>בישלת בבית?</label>
            <div style={{ display: 'flex', gap: 10 }}>
              <ChoiceBtn active={form.cooked === true} onClick={() => set({ cooked: true })} emoji="🍳" label="כן" />
              <ChoiceBtn active={form.cooked === false} onClick={() => set({ cooked: false })} emoji="🥡" label="לא" />
            </div>
          </div>
        </div>
      ),
    },

    // 5. Learning
    {
      title: 'למדת משהו?',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 0' }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <ChoiceBtn active={form.learned === true}
              onClick={() => set({ learned: true })}
              emoji="🧠" label="כן" />
            <ChoiceBtn active={form.learned === false}
              onClick={() => set({ learned: false, learned_topic: '' })}
              emoji="⏭️" label="לא" />
          </div>
          {form.learned && (
            <div>
              <label style={fieldLabel}>מה למדת? (קצר)</label>
              <input type="text" value={form.learned_topic}
                onChange={e => set({ learned_topic: e.target.value })}
                placeholder="Claude API / n8n / ..."
                style={textInput} autoFocus />
            </div>
          )}
        </div>
      ),
    },

    // 6. Wellness
    {
      title: 'עשית משהו לרוגע?',
      content: (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, padding: '12px 0' }}>
          {WELLNESS_ACTIONS.map(a => (
            <button key={a.key} onClick={() => set({ meditate_action: a.key })}
              style={{
                padding: '14px 8px', borderRadius: 12,
                border: form.meditate_action === a.key
                  ? `2px solid ${PERSONAL_COLORS.primary}`
                  : `1px solid ${PERSONAL_COLORS.border}`,
                background: form.meditate_action === a.key
                  ? PERSONAL_COLORS.primaryLight : '#FFFFFF',
                display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 14, fontWeight: 700,
                color: PERSONAL_COLORS.textPrimary, cursor: 'pointer',
              }}>
              <span style={{ fontSize: 22 }}>{a.emoji}</span>
              <span>{a.label}</span>
            </button>
          ))}
        </div>
      ),
    },

    // 7. Journal
    {
      title: 'מחשבה אחת על היום:',
      content: (
        <div style={{ padding: '12px 0' }}>
          <textarea value={form.journal_entry}
            onChange={e => set({ journal_entry: e.target.value })}
            placeholder="אופציונלי..."
            rows={4}
            style={{ ...textInput, minHeight: 100, resize: 'vertical' }} />
        </div>
      ),
    },
  ];

  if (!isOpen) return null;
  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !saving) onClose?.(); }}>
      <DialogContent dir="rtl" className="max-w-md" onPointerDownOutside={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle style={{ fontSize: 16, fontWeight: 700, textAlign: 'right' }}>
            צ׳ק-אין יומי · {step + 1}/{STEPS.length}
          </DialogTitle>
        </DialogHeader>

        {/* Progress bar */}
        <div style={{ height: 4, borderRadius: 999, backgroundColor: '#F0E4D0', overflow: 'hidden' }}>
          <div style={{
            width: `${((step + 1) / STEPS.length) * 100}%`,
            height: '100%', backgroundColor: PERSONAL_COLORS.primary,
            transition: 'width 0.3s ease',
          }} />
        </div>

        <div style={{
          fontSize: 18, fontWeight: 700, color: PERSONAL_COLORS.textPrimary,
          marginTop: 8, textAlign: 'right',
        }}>
          {current.title}
        </div>

        {current.content}

        <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
          <button onClick={() => step === 0 ? onClose?.() : setStep(s => s - 1)}
            disabled={saving}
            style={{
              flex: 1, padding: '12px 16px', borderRadius: 12,
              border: `1px solid ${PERSONAL_COLORS.border}`, backgroundColor: '#FFFFFF',
              color: PERSONAL_COLORS.textPrimary,
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            }}>
            <ChevronRight size={16} /> {step === 0 ? 'ביטול' : 'אחורה'}
          </button>
          <button onClick={() => isLast ? handleSave() : setStep(s => s + 1)}
            disabled={saving}
            style={{
              flex: 2, padding: '12px 16px', borderRadius: 12,
              border: 'none', backgroundColor: PERSONAL_COLORS.primary, color: '#FFFFFF',
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            }}>
            {saving
              ? <Loader2 size={18} className="animate-spin" />
              : isLast ? 'שמור ✓' : <>הבא <ChevronLeft size={16} /></>}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label style={fieldLabel}>{label}</label>
      {children}
    </div>
  );
}

function ChoiceBtn({ active, onClick, emoji, label }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: '14px 8px', borderRadius: 12,
      border: active ? `2px solid ${PERSONAL_COLORS.primary}` : `1px solid ${PERSONAL_COLORS.border}`,
      background: active ? PERSONAL_COLORS.primaryLight : '#FFFFFF',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      fontSize: 14, fontWeight: 700,
      color: PERSONAL_COLORS.textPrimary, cursor: 'pointer',
    }}>
      <span style={{ fontSize: 20 }}>{emoji}</span>
      <span>{label}</span>
    </button>
  );
}

const fieldLabel = { display: 'block', fontSize: 12, fontWeight: 700, color: PERSONAL_COLORS.textSecondary, marginBottom: 6 };
const textInput = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: `1px solid ${PERSONAL_COLORS.border}`, backgroundColor: '#FFFFFF',
  fontSize: 14, color: PERSONAL_COLORS.textPrimary,
  fontFamily: "'Heebo', 'Assistant', sans-serif",
  outline: 'none', boxSizing: 'border-box',
};
const timeInput = { ...textInput, fontSize: 16, fontWeight: 700, textAlign: 'center' };
function chipStyle(active) {
  return {
    padding: '8px 4px', borderRadius: 10,
    border: active ? `2px solid ${PERSONAL_COLORS.primary}` : `1px solid ${PERSONAL_COLORS.border}`,
    background: active ? PERSONAL_COLORS.primaryLight : '#FFFFFF',
    fontSize: 11, fontWeight: 600, cursor: 'pointer',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
    color: PERSONAL_COLORS.textPrimary,
  };
}
