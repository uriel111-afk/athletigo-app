import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Plus, Trash2, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { PERSONAL_COLORS } from '@/lib/personal/personal-constants';
import {
  weekStart, weekStartISO, weekDays, isoOf, HE_DAY_NAMES,
  addPlanItem, deletePlanItem, copyWeekPlan,
} from '@/lib/personal/weekly-api';
import { supabase } from '@/lib/supabaseClient';

const ITEM_TYPES = [
  { key: 'training', label: 'אימון',   emoji: '🏋️' },
  { key: 'task',     label: 'משימה',   emoji: '✅' },
  { key: 'meal',     label: 'ארוחה',   emoji: '🍽️' },
  { key: 'chore',    label: 'בית',     emoji: '🏠' },
  { key: 'other',    label: 'אחר',     emoji: '✨' },
];

// Plans the upcoming Sunday-→Saturday week. Opens as a fullscreen
// dialog over the WeeklyBoard. Items are stored in
// personal_weekly_plan and surface back into the board's day blocks
// via fetchWeek().
export default function WeekPlanner({ isOpen, onClose, userId }) {
  // Default to the NEXT week (the current week is already half-spent).
  const [anchor, setAnchor] = useState(() => {
    const d = weekStart(new Date());
    d.setDate(d.getDate() + 7);
    return d;
  });

  const [plan, setPlan] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const startISO = useMemo(() => weekStartISO(anchor), [anchor]);
  const days = useMemo(() => weekDays(anchor), [anchor]);

  const load = useCallback(async () => {
    if (!userId || !isOpen) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('personal_weekly_plan')
        .select('*')
        .eq('user_id', userId)
        .eq('week_start', startISO);
      setPlan(data || []);
    } finally {
      setLoading(false);
    }
  }, [userId, isOpen, startISO]);

  useEffect(() => { load(); }, [load]);

  const planByDay = useMemo(() => {
    const m = {};
    plan.forEach(p => (m[p.day_of_week] ||= []).push(p));
    return m;
  }, [plan]);

  const handleCopyPrev = async () => {
    setSaving(true);
    try {
      const prev = new Date(anchor); prev.setDate(prev.getDate() - 7);
      const prevISO = weekStartISO(prev);
      const n = await copyWeekPlan(userId, prevISO, startISO);
      if (n === 0) toast('אין תכנון בשבוע הקודם להעתיק');
      else toast.success(`הועתקו ${n} פריטים`);
      load();
    } catch (err) { toast.error('שגיאה: ' + (err?.message || '')); }
    finally { setSaving(false); }
  };

  const handleAdd = async (dow, payload) => {
    try {
      await addPlanItem(userId, {
        week_start: startISO,
        day_of_week: dow,
        item_type: payload.type,
        title: payload.title,
        time_slot: payload.timeSlot || null,
      });
      load();
    } catch (err) { toast.error('שגיאה: ' + (err?.message || '')); }
  };

  const handleDelete = async (id) => {
    try {
      await deletePlanItem(id);
      load();
    } catch (err) { toast.error('שגיאה: ' + (err?.message || '')); }
  };

  const shiftWeek = (delta) => {
    const d = new Date(anchor); d.setDate(d.getDate() + delta * 7); setAnchor(d);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(v) => { if (!v) onClose?.(); }}>
      <DialogContent
        dir="rtl"
        className="max-w-3xl"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle style={{ fontSize: 16, fontWeight: 800, textAlign: 'right' }}>
            תכנון שבוע — {labelForWeek(anchor)}
          </DialogTitle>
        </DialogHeader>

        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <button onClick={() => shiftWeek(-1)} style={pillBtn}>← קודם</button>
          <button onClick={() => shiftWeek(1)} style={pillBtn}>הבא →</button>
          <div style={{ flex: 1 }} />
          <button onClick={handleCopyPrev} disabled={saving} style={{
            ...pillBtn,
            backgroundColor: '#FFFFFF',
            border: `1px solid ${PERSONAL_COLORS.primary}`,
            color: PERSONAL_COLORS.primary,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            <Copy size={14} /> העתק מהשבוע הקודם
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 30 }}>
            <Loader2 size={24} className="animate-spin" style={{ color: PERSONAL_COLORS.primary }} />
          </div>
        ) : (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
            gap: 8, maxHeight: '60vh', overflowY: 'auto',
          }}>
            {days.map((d, dow) => (
              <DayPlanCol
                key={dow}
                date={d}
                dow={dow}
                items={planByDay[dow] || []}
                onAdd={(payload) => handleAdd(dow, payload)}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 10 }}>
          <button onClick={onClose} style={{
            padding: '10px 20px', borderRadius: 12, border: 'none',
            backgroundColor: PERSONAL_COLORS.primary, color: '#FFFFFF',
            fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}>
            סיום
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Per-day column inside the planner ────────────────────────────

function DayPlanCol({ date, dow, items, onAdd, onDelete }) {
  const [type, setType] = useState('task');
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('');

  const submit = () => {
    if (!title.trim()) return;
    onAdd({ type, title: title.trim(), timeSlot: time || null });
    setTitle('');
    setTime('');
  };

  return (
    <div style={{
      padding: 8, borderRadius: 12,
      backgroundColor: '#FFFFFF',
      border: `1px solid ${PERSONAL_COLORS.border}`,
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{
        fontSize: 13, fontWeight: 800, color: PERSONAL_COLORS.textPrimary,
        paddingBottom: 4, borderBottom: `1px solid ${PERSONAL_COLORS.border}`,
      }}>
        {HE_DAY_NAMES[dow]} {date.getDate()}.{date.getMonth() + 1}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.length === 0 && (
          <div style={{ fontSize: 11, color: '#B0A89B', padding: '4px 0' }}>
            אין פריטים
          </div>
        )}
        {items.map(it => {
          const meta = ITEM_TYPES.find(t => t.key === it.item_type);
          return (
            <div key={it.id} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 6px', borderRadius: 8,
              backgroundColor: '#FAF6EE',
            }}>
              <span style={{ fontSize: 13 }}>{meta?.emoji || '•'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 12, color: PERSONAL_COLORS.textPrimary,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {it.title}
                </div>
                {it.time_slot && (
                  <div style={{ fontSize: 10, color: PERSONAL_COLORS.primary }}>
                    {it.time_slot}
                  </div>
                )}
              </div>
              <button onClick={() => onDelete(it.id)} aria-label="מחק" style={{
                border: 'none', background: 'transparent',
                color: PERSONAL_COLORS.error, cursor: 'pointer', padding: 2,
              }}>
                <Trash2 size={12} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Add row */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 4 }}>
        <select value={type} onChange={(e) => setType(e.target.value)} style={selectStyle}>
          {ITEM_TYPES.map(t => (
            <option key={t.key} value={t.key}>{t.emoji} {t.label}</option>
          ))}
        </select>
        <input
          type="text" value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="תיאור"
          style={inputStyle}
        />
        <input
          type="text" value={time} onChange={(e) => setTime(e.target.value)}
          placeholder="שעה (אופ׳)"
          style={inputStyle}
        />
        <button onClick={submit} disabled={!title.trim()} style={{
          padding: '6px 8px', borderRadius: 8, border: 'none',
          backgroundColor: title.trim() ? PERSONAL_COLORS.primary : '#E5DDD0',
          color: '#FFFFFF', fontSize: 11, fontWeight: 700,
          cursor: title.trim() ? 'pointer' : 'default',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
        }}>
          <Plus size={12} /> הוסף
        </button>
      </div>
    </div>
  );
}

function labelForWeek(anchor) {
  const start = new Date(anchor);
  const end = new Date(anchor); end.setDate(end.getDate() + 6);
  return `${start.getDate()}.${start.getMonth() + 1} – ${end.getDate()}.${end.getMonth() + 1}`;
}

const pillBtn = {
  padding: '6px 12px', borderRadius: 999, border: 'none',
  backgroundColor: '#F5F1EA', color: PERSONAL_COLORS.textPrimary,
  fontSize: 12, fontWeight: 700, cursor: 'pointer',
};

const inputStyle = {
  width: '100%', padding: '6px 8px', borderRadius: 8,
  border: `1px solid ${PERSONAL_COLORS.border}`,
  backgroundColor: '#FFFFFF', fontSize: 11,
  color: PERSONAL_COLORS.textPrimary,
  fontFamily: "'Heebo', 'Assistant', sans-serif",
  outline: 'none', boxSizing: 'border-box',
};

const selectStyle = { ...inputStyle, fontSize: 11 };
