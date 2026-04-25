import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  EXPENSE_CATEGORIES, PAYMENT_METHODS, LIFEOS_COLORS,
} from '@/lib/lifeos/lifeos-constants';
import { addExpense, updateExpense } from '@/lib/lifeos/lifeos-api';
import SmartCamera from '@/components/lifeos/SmartCamera';

const todayISO = () => new Date().toISOString().slice(0, 10);

const initialForm = () => ({
  amount: '',
  category: '',
  subcategory: '',
  description: '',
  date: todayISO(),
  payment_method: '',
  notes: '',
  receipt_url: '',
});

const formFromRow = (row) => ({
  amount: row.amount != null ? String(row.amount) : '',
  category: row.category || '',
  subcategory: row.subcategory || '',
  description: row.description || '',
  date: row.date || todayISO(),
  payment_method: row.payment_method || '',
  notes: row.notes || '',
  receipt_url: row.receipt_url || '',
});

export default function ExpenseForm({ isOpen, onClose, userId, onSaved, expense = null }) {
  const [form, setForm] = useState(initialForm());
  const [saving, setSaving] = useState(false);

  // Reset form whenever the dialog opens — pre-fill if editing.
  useEffect(() => {
    if (!isOpen) return;
    setForm(expense ? formFromRow(expense) : initialForm());
  }, [isOpen, expense?.id]);

  const set = (patch) => setForm(prev => ({ ...prev, ...patch }));

  const handleSave = async () => {
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) {
      toast.error('הכנס סכום תקין');
      return;
    }
    if (!form.category) {
      toast.error('בחר קטגוריה');
      return;
    }
    setSaving(true);
    const payload = {
      amount,
      category: form.category,
      subcategory: form.subcategory || null,
      description: form.description || null,
      date: form.date,
      payment_method: form.payment_method || null,
      notes: form.notes || null,
      receipt_url: form.receipt_url || null,
    };
    try {
      if (expense?.id) await updateExpense(expense.id, payload);
      else             await addExpense(userId, payload);
      toast.success(expense ? 'ההוצאה עודכנה' : 'ההוצאה נשמרה');
      onSaved?.();
      onClose();
    } catch (err) {
      console.error('[ExpenseForm] save error:', err);
      toast.error('שגיאה בשמירה: ' + (err?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent
        dir="rtl"
        className="max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle style={{ fontSize: 18, fontWeight: 800, textAlign: 'right' }}>
            {expense ? 'עריכת הוצאה' : 'הוצאה חדשה'}
          </DialogTitle>
        </DialogHeader>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 8 }}>
          {/* Amount — big and centered */}
          <div>
            <label style={labelStyle}>סכום *</label>
            <input
              type="number"
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => set({ amount: e.target.value })}
              placeholder="כמה שילמת?"
              style={{
                ...inputStyle,
                fontSize: 28, fontWeight: 800, textAlign: 'center',
                letterSpacing: 1,
              }}
              autoFocus
            />
          </div>

          {/* Category — grid of chips */}
          <div>
            <label style={labelStyle}>קטגוריה *</label>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 6,
              marginTop: 4,
            }}>
              {EXPENSE_CATEGORIES.map(cat => {
                const active = form.category === cat.key;
                return (
                  <button
                    key={cat.key}
                    onClick={() => set({ category: cat.key })}
                    style={{
                      padding: '10px 6px',
                      borderRadius: 10,
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

          {/* Subcategory (free text) */}
          <div>
            <label style={labelStyle}>תת-קטגוריה</label>
            <input
              type="text"
              value={form.subcategory}
              onChange={(e) => set({ subcategory: e.target.value })}
              placeholder="למשל: חשמל, סלולר, ארוחה..."
              style={inputStyle}
            />
          </div>

          {/* Description */}
          <div>
            <label style={labelStyle}>תיאור</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => set({ description: e.target.value })}
              placeholder="על מה ההוצאה?"
              style={inputStyle}
            />
          </div>

          {/* Date + Payment method row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>תאריך</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => set({ date: e.target.value })}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>שיטת תשלום</label>
              <select
                value={form.payment_method}
                onChange={(e) => set({ payment_method: e.target.value })}
                style={inputStyle}
              >
                <option value="">—</option>
                {PAYMENT_METHODS.map(pm => (
                  <option key={pm.key} value={pm.key}>{pm.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Receipt photo */}
          <div>
            <label style={labelStyle}>קבלה</label>
            {form.receipt_url ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px', borderRadius: 10,
                border: `1px solid ${LIFEOS_COLORS.border}`,
                backgroundColor: '#FFFFFF',
              }}>
                <span style={{ fontSize: 18 }}>📎</span>
                <a href={form.receipt_url} target="_blank" rel="noopener noreferrer"
                   style={{ flex: 1, fontSize: 12, color: LIFEOS_COLORS.primary, textDecoration: 'underline' }}>
                  צפה בקבלה
                </a>
                <button type="button" onClick={() => set({ receipt_url: '' })}
                  style={{
                    background: 'transparent', border: 'none',
                    color: LIFEOS_COLORS.error, cursor: 'pointer',
                    fontSize: 13, fontWeight: 700,
                  }}>
                  הסר
                </button>
              </div>
            ) : (
              <SmartCamera
                label="צלם קבלה"
                compact
                onUploaded={({ url }) => set({ receipt_url: url })}
              />
            )}
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 10, paddingTop: 8 }}>
            <button
              onClick={onClose}
              disabled={saving}
              style={btnSecondary}
            >
              ביטול
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={btnPrimary}
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" style={{ margin: '0 auto' }} /> : 'שמור הוצאה'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Inline styles ──────────────────────────────────────────────
const labelStyle = {
  display: 'block',
  fontSize: 12,
  fontWeight: 700,
  color: LIFEOS_COLORS.textSecondary,
  marginBottom: 6,
};

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: `1px solid ${LIFEOS_COLORS.border}`,
  backgroundColor: '#FFFFFF',
  fontSize: 14,
  color: LIFEOS_COLORS.textPrimary,
  fontFamily: "'Heebo', 'Assistant', sans-serif",
  outline: 'none',
  boxSizing: 'border-box',
};

const btnPrimary = {
  flex: 1,
  padding: '12px 16px',
  borderRadius: 12,
  border: 'none',
  backgroundColor: LIFEOS_COLORS.primary,
  color: '#FFFFFF',
  fontSize: 15,
  fontWeight: 700,
  cursor: 'pointer',
};

const btnSecondary = {
  flex: 1,
  padding: '12px 16px',
  borderRadius: 12,
  border: `1px solid ${LIFEOS_COLORS.border}`,
  backgroundColor: '#FFFFFF',
  color: LIFEOS_COLORS.textPrimary,
  fontSize: 15,
  fontWeight: 700,
  cursor: 'pointer',
};
