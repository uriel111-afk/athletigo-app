import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  EXPENSE_CATEGORIES, RECURRING_FREQUENCIES, LIFEOS_COLORS,
} from '@/lib/lifeos/lifeos-constants';
import { addRecurring, updateRecurring } from '@/lib/lifeos/lifeos-api';

const todayISO = () => new Date().toISOString().slice(0, 10);

const initialForm = () => ({
  name: '',
  amount: '',
  category: '',
  frequency: 'monthly',
  due_day: '',
  start_date: todayISO(),
  notes: '',
});

const formFromRow = (row) => ({
  name: row.name || '',
  amount: row.amount != null ? String(row.amount) : '',
  category: row.category || '',
  frequency: row.frequency || 'monthly',
  due_day: row.due_day != null ? String(row.due_day) : '',
  start_date: row.start_date || todayISO(),
  notes: row.notes || '',
});

export default function RecurringForm({ isOpen, onClose, userId, onSaved, recurring = null }) {
  const [form, setForm] = useState(initialForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setForm(recurring ? formFromRow(recurring) : initialForm());
  }, [isOpen, recurring?.id]);
  const set = (patch) => setForm(prev => ({ ...prev, ...patch }));

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('הכנס שם'); return; }
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) { toast.error('סכום לא תקין'); return; }
    if (!form.category) { toast.error('בחר קטגוריה'); return; }

    setSaving(true);
    const payload = {
      name: form.name.trim(),
      amount,
      category: form.category,
      frequency: form.frequency,
      due_day: form.due_day ? parseInt(form.due_day, 10) : null,
      start_date: form.start_date,
      notes: form.notes || null,
    };
    try {
      if (recurring?.id) await updateRecurring(recurring.id, payload);
      else               await addRecurring(userId, { ...payload, is_active: true });
      toast.success(recurring ? 'עודכן' : 'נשמר');
      onSaved?.();
      onClose();
    } catch (err) {
      console.error('[RecurringForm] save error:', err);
      toast.error('שגיאה: ' + (err?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent dir="rtl" className="max-w-md" onPointerDownOutside={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle style={{ fontSize: 18, fontWeight: 800, textAlign: 'right' }}>
            {recurring ? 'עריכת הוצאה קבועה' : 'הוצאה קבועה חדשה'}
          </DialogTitle>
        </DialogHeader>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 8 }}>
          <div>
            <label style={labelStyle}>שם *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="למשל: חשמל, Netflix, שכירות"
              style={inputStyle}
              autoFocus
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>סכום *</label>
              <input
                type="number" inputMode="decimal"
                value={form.amount}
                onChange={(e) => set({ amount: e.target.value })}
                placeholder="₪"
                style={{ ...inputStyle, fontSize: 18, fontWeight: 700 }}
              />
            </div>
            <div>
              <label style={labelStyle}>תדירות</label>
              <select
                value={form.frequency}
                onChange={(e) => set({ frequency: e.target.value })}
                style={inputStyle}
              >
                {RECURRING_FREQUENCIES.map(f => (
                  <option key={f.key} value={f.key}>{f.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label style={labelStyle}>קטגוריה *</label>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 4,
            }}>
              {EXPENSE_CATEGORIES.map(cat => {
                const active = form.category === cat.key;
                return (
                  <button
                    key={cat.key}
                    onClick={() => set({ category: cat.key })}
                    style={{
                      padding: '10px 6px', borderRadius: 10,
                      border: `1px solid ${active ? LIFEOS_COLORS.primary : LIFEOS_COLORS.border}`,
                      backgroundColor: active ? LIFEOS_COLORS.primary : '#FFFFFF',
                      color: active ? '#FFFFFF' : LIFEOS_COLORS.textPrimary,
                      fontSize: 12, fontWeight: 600,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ fontSize: 18 }}>{cat.emoji}</span>
                    <span>{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>יום בחודש</label>
              <input
                type="number" min="1" max="31"
                value={form.due_day}
                onChange={(e) => set({ due_day: e.target.value })}
                placeholder="1-31"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>תאריך התחלה</label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => set({ start_date: e.target.value })}
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, paddingTop: 8 }}>
            <button onClick={onClose} disabled={saving} style={btnSecondary}>ביטול</button>
            <button onClick={handleSave} disabled={saving} style={btnPrimary}>
              {saving ? <Loader2 className="w-5 h-5 animate-spin" style={{ margin: '0 auto' }} /> : 'שמור'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const labelStyle = { display: 'block', fontSize: 12, fontWeight: 700, color: LIFEOS_COLORS.textSecondary, marginBottom: 6 };
const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: `1px solid ${LIFEOS_COLORS.border}`, backgroundColor: '#FFFFFF',
  fontSize: 14, color: LIFEOS_COLORS.textPrimary,
  fontFamily: "'Heebo', 'Assistant', sans-serif", outline: 'none', boxSizing: 'border-box',
};
const btnPrimary = {
  flex: 1, padding: '12px 16px', borderRadius: 12, border: 'none',
  backgroundColor: LIFEOS_COLORS.primary, color: '#FFFFFF',
  fontSize: 15, fontWeight: 700, cursor: 'pointer',
};
const btnSecondary = {
  flex: 1, padding: '12px 16px', borderRadius: 12,
  border: `1px solid ${LIFEOS_COLORS.border}`, backgroundColor: '#FFFFFF',
  color: LIFEOS_COLORS.textPrimary, fontSize: 15, fontWeight: 700, cursor: 'pointer',
};
