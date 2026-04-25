import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AuthContext } from '@/lib/AuthContext';
import PersonalLayout from '@/components/personal/PersonalLayout';
import HabitCard from '@/components/personal/HabitCard';
import HabitHeatmap from '@/components/personal/HabitHeatmap';
import {
  PERSONAL_COLORS, PERSONAL_CARD,
  HABIT_CATEGORIES, HABIT_FREQUENCIES, HABIT_ICON_PICKER,
} from '@/lib/personal/personal-constants';
import {
  listHabits, addHabit, updateHabit, deleteHabit,
  listHabitLogs, toggleHabitLog,
} from '@/lib/personal/personal-api';
import { findHabitInsight } from '@/lib/personal/personal-mentor';

const todayISO = () => new Date().toISOString().slice(0, 10);
const dayKey = (d) => new Date(d).toISOString().slice(0, 10);

// Streak per habit — consecutive days with completed=true ending today.
function streakFor(habitId, logs) {
  const set = new Set(logs.filter(l => l.habit_id === habitId && l.completed).map(l => l.date));
  let streak = 0;
  const cursor = new Date();
  if (set.has(dayKey(cursor))) { streak = 1; cursor.setDate(cursor.getDate() - 1); }
  else cursor.setDate(cursor.getDate() - 1);
  while (set.has(dayKey(cursor))) { streak++; cursor.setDate(cursor.getDate() - 1); }
  return streak;
}

function monthPctFor(habitId, logs) {
  const start = new Date(); start.setDate(1);
  const total = new Date().getDate(); // days elapsed this month
  const startISO = start.toISOString().slice(0, 10);
  const done = logs.filter(l => l.habit_id === habitId && l.completed && l.date >= startISO).length;
  return Math.round((done / Math.max(1, total)) * 100);
}

export default function Habits() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;

  const [habits, setHabits] = useState([]);
  const [logs, setLogs] = useState([]);
  const [todayLogsMap, setTodayLogsMap] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState(null);
  const [insight, setInsight] = useState(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoaded(false);
    const since = new Date(); since.setDate(since.getDate() - 35);
    const sinceISO = since.toISOString().slice(0, 10);
    try {
      const [h, l, ai] = await Promise.all([
        listHabits(userId).catch(() => []),
        listHabitLogs(userId, { sinceDate: sinceISO }).catch(() => []),
        findHabitInsight(userId).catch(() => null),
      ]);
      setHabits(h);
      setLogs(l);
      setInsight(ai);
      const today = todayISO();
      const map = {};
      l.forEach(x => { if (x.date === today) map[x.habit_id] = x.completed; });
      setTodayLogsMap(map);
    } finally { setLoaded(true); }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const weeklyStats = useMemo(() => {
    if (habits.length === 0 || logs.length === 0) return null;
    const since = new Date(); since.setDate(since.getDate() - 6);
    const sinceISO = since.toISOString().slice(0, 10);
    const recent = logs.filter(l => l.date >= sinceISO && l.completed);
    const totalSlots = habits.length * 7;
    const pct = totalSlots > 0 ? Math.round((recent.length / totalSlots) * 100) : 0;

    // Best/worst.
    const byHabit = {};
    habits.forEach(h => { byHabit[h.id] = 0; });
    recent.forEach(l => { if (byHabit[l.habit_id] !== undefined) byHabit[l.habit_id]++; });
    const sorted = habits.slice().sort((a, b) => (byHabit[b.id] || 0) - (byHabit[a.id] || 0));
    return {
      pct,
      best: sorted[0],
      worst: sorted[sorted.length - 1],
    };
  }, [habits, logs]);

  const handleToggle = async (habit) => {
    try {
      await toggleHabitLog(userId, habit.id);
      load();
    } catch (err) { toast.error('שגיאה: ' + (err?.message || '')); }
  };

  const handleDelete = async (id) => {
    if (!confirm('בטוח שאתה רוצה למחוק את ההרגל?')) return;
    try { await deleteHabit(id); toast.success('נמחק'); setSelected(null); load(); }
    catch (err) { toast.error('שגיאה: ' + (err?.message || '')); }
  };

  const selectedLogs = useMemo(
    () => selected ? logs.filter(l => l.habit_id === selected.id) : [],
    [logs, selected]
  );

  return (
    <PersonalLayout title="הרגלים" rightSlot={
      <button onClick={load} aria-label="רענן" title="רענן" style={{
        width: 32, height: 32, borderRadius: 10, border: 'none',
        background: 'transparent', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: PERSONAL_COLORS.textSecondary,
      }}>
        <RefreshCw size={16} />
      </button>
    }>
      <button onClick={() => setShowNew(true)} style={{
        width: '100%', padding: '14px 16px', borderRadius: 12, border: 'none',
        backgroundColor: PERSONAL_COLORS.primary, color: '#FFFFFF',
        fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 14,
        boxShadow: '0 2px 8px rgba(255,111,32,0.2)',
      }}>+ הרגל חדש</button>

      {weeklyStats && (
        <div style={{ ...PERSONAL_CARD, marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: PERSONAL_COLORS.textPrimary, marginBottom: 4 }}>
            השבוע: {weeklyStats.pct}% עמידה
          </div>
          {weeklyStats.best && weeklyStats.worst && (
            <div style={{ fontSize: 11, color: PERSONAL_COLORS.textSecondary, lineHeight: 1.5 }}>
              הכי חזק: {weeklyStats.best.icon} {weeklyStats.best.name}<br />
              צריך שיפור: {weeklyStats.worst.icon} {weeklyStats.worst.name}
            </div>
          )}
        </div>
      )}

      {insight && (
        <div style={{
          ...PERSONAL_CARD, marginBottom: 12,
          backgroundColor: '#FFF4E6', border: `1px solid ${PERSONAL_COLORS.primary}`,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: PERSONAL_COLORS.primary, marginBottom: 4 }}>
            💡 תובנה
          </div>
          <div style={{ fontSize: 13, color: PERSONAL_COLORS.textPrimary, lineHeight: 1.5 }}>
            {insight}
          </div>
        </div>
      )}

      {!loaded ? (
        <Empty text="טוען..." />
      ) : habits.length === 0 ? (
        <div style={{ padding: '36px 18px', textAlign: 'center' }}>
          <div style={{ fontSize: 38, marginBottom: 8 }}>🌱</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: PERSONAL_COLORS.textPrimary, marginBottom: 12 }}>
            עדיין אין הרגלים
          </div>
          <button onClick={() => setShowNew(true)} style={{
            padding: '10px 18px', borderRadius: 12, border: 'none',
            backgroundColor: PERSONAL_COLORS.primary, color: '#FFFFFF',
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}>+ הוסף הרגל ראשון</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {habits.map(h => (
            <HabitCard
              key={h.id}
              habit={h}
              doneToday={!!todayLogsMap[h.id]}
              monthPct={monthPctFor(h.id, logs)}
              streak={streakFor(h.id, logs)}
              onToggle={handleToggle}
              onClick={() => setSelected(h)}
            />
          ))}
        </div>
      )}

      {/* Heatmap modal */}
      {selected && (
        <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
          <DialogContent dir="rtl" className="max-w-md">
            <DialogHeader>
              <DialogTitle style={{ fontSize: 16, fontWeight: 700, textAlign: 'right' }}>
                {selected.icon} {selected.name}
              </DialogTitle>
            </DialogHeader>
            <div style={{ fontSize: 11, color: PERSONAL_COLORS.textSecondary, marginBottom: 8 }}>
              30 ימים אחרונים — ירוק = עשיתי
            </div>
            <HabitHeatmap logs={selectedLogs} />
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button onClick={() => { setEditing(selected); setShowNew(true); setSelected(null); }}
                style={{
                  flex: 1, padding: '8px 12px', borderRadius: 10,
                  border: `1px solid ${PERSONAL_COLORS.border}`,
                  background: '#FFFFFF', color: PERSONAL_COLORS.textPrimary,
                  fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}>ערוך הרגל</button>
              <button onClick={() => handleDelete(selected.id)}
                style={{
                  flex: 1, padding: '8px 12px', borderRadius: 10,
                  border: `1px solid ${PERSONAL_COLORS.error}`,
                  background: '#FFFFFF', color: PERSONAL_COLORS.error,
                  fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}>מחק הרגל</button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {showNew && (
        <NewHabitDialog
          isOpen={showNew}
          onClose={() => { setShowNew(false); setEditing(null); }}
          userId={userId}
          habit={editing}
          onSaved={load}
        />
      )}
    </PersonalLayout>
  );
}

function NewHabitDialog({ isOpen, onClose, userId, habit = null, onSaved }) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('✅');
  const [category, setCategory] = useState('general');
  const [frequency, setFrequency] = useState('daily');
  const [target, setTarget] = useState('');
  const [saving, setSaving] = useState(false);
  // Pre-fill from habit on open (edit mode).
  useEffect(() => {
    if (!isOpen) return;
    if (habit) {
      setName(habit.name || '');
      setIcon(habit.icon || '✅');
      setCategory(habit.category || 'general');
      setFrequency(habit.frequency || 'daily');
      setTarget(habit.target_value || '');
    } else {
      setName(''); setIcon('✅'); setCategory('general');
      setFrequency('daily'); setTarget('');
    }
  }, [isOpen, habit?.id]);
  const handleSave = async () => {
    if (!name.trim()) { toast.error('הכנס שם'); return; }
    setSaving(true);
    const payload = {
      name: name.trim(), icon, category, frequency,
      target_value: target || null,
    };
    try {
      if (habit?.id) await updateHabit(habit.id, payload);
      else           await addHabit(userId, { ...payload, is_active: true });
      toast.success(habit ? 'עודכן' : 'נוסף');
      onSaved?.();
      onClose?.();
    } catch (err) { toast.error('שגיאה: ' + (err?.message || '')); }
    finally { setSaving(false); }
  };
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !saving) onClose?.(); }}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle style={{ fontSize: 16, fontWeight: 700, textAlign: 'right' }}>
            {habit ? 'עריכת הרגל' : 'הרגל חדש'}
          </DialogTitle>
        </DialogHeader>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8 }}>
          <input type="text" placeholder="שם ההרגל" autoFocus
            value={name} onChange={e => setName(e.target.value)} style={textInput} />
          <div>
            <label style={lbl}>אייקון</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 4 }}>
              {HABIT_ICON_PICKER.map(em => (
                <button key={em} onClick={() => setIcon(em)} style={{
                  aspectRatio: '1', fontSize: 18, borderRadius: 8,
                  border: icon === em ? `2px solid ${PERSONAL_COLORS.primary}` : `1px solid ${PERSONAL_COLORS.border}`,
                  backgroundColor: icon === em ? PERSONAL_COLORS.primaryLight : '#FFFFFF',
                  cursor: 'pointer',
                }}>{em}</button>
              ))}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={lbl}>קטגוריה</label>
              <select value={category} onChange={e => setCategory(e.target.value)} style={textInput}>
                {HABIT_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>תדירות</label>
              <select value={frequency} onChange={e => setFrequency(e.target.value)} style={textInput}>
                {HABIT_FREQUENCIES.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            </div>
          </div>
          <input type="text" placeholder="יעד (למשל '7 שעות', '30 דקות')"
            value={target} onChange={e => setTarget(e.target.value)} style={textInput} />
          <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
            <button onClick={onClose} disabled={saving} style={btnSecondary}>ביטול</button>
            <button onClick={handleSave} disabled={saving} style={btnPrimary}>
              {saving ? <Loader2 size={18} className="animate-spin" style={{ margin: '0 auto' }} /> : 'שמור'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Empty({ text }) {
  return <div style={{
    padding: 30, textAlign: 'center', fontSize: 13, color: PERSONAL_COLORS.textSecondary,
    backgroundColor: '#FFFFFF', borderRadius: 14,
    border: `1px solid ${PERSONAL_COLORS.border}`,
  }}>{text}</div>;
}

const lbl = { display: 'block', fontSize: 12, fontWeight: 700, color: PERSONAL_COLORS.textSecondary, marginBottom: 6 };
const textInput = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: `1px solid ${PERSONAL_COLORS.border}`, backgroundColor: '#FFFFFF',
  fontSize: 14, color: PERSONAL_COLORS.textPrimary,
  fontFamily: "'Heebo', 'Assistant', sans-serif", outline: 'none', boxSizing: 'border-box',
};
const btnPrimary = {
  flex: 1, padding: '12px 16px', borderRadius: 12, border: 'none',
  backgroundColor: PERSONAL_COLORS.primary, color: '#FFFFFF',
  fontSize: 14, fontWeight: 700, cursor: 'pointer',
};
const btnSecondary = {
  flex: 1, padding: '12px 16px', borderRadius: 12,
  border: `1px solid ${PERSONAL_COLORS.border}`, backgroundColor: '#FFFFFF',
  color: PERSONAL_COLORS.textPrimary, fontSize: 14, fontWeight: 700, cursor: 'pointer',
};
