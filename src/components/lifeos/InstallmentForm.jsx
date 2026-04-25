import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { LIFEOS_COLORS, EXPENSE_CATEGORIES } from '@/lib/lifeos/lifeos-constants';
import { addInstallment, updateInstallment } from '@/lib/lifeos/lifeos-api';

const todayISO = () => new Date().toISOString().slice(0, 10);
const addMonths = (iso, n) => {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
};

const initialForm = () => ({
  name: '',
  total_amount: '',
  total_payments: '',
  payments_made: '0',
  start_date: todayISO(),
  category: '',
  notes: '',
});

const formFromRow = (row) => ({
  name: row.name || '',
  total_amount: row.total_amount != null ? String(row.total_amount) : '',
  total_payments: row.total_payments != null ? String(row.total_payments) : '',
  payments_made: row.payments_made != null ? String(row.payments_made) : '0',
  start_date: row.start_date || todayISO(),
  category: row.category || '',
  notes: row.notes || '',
});

export default function InstallmentForm({ isOpen, onClose, userId, onSaved, installment = null }) {
  const [form, setForm] = useState(initialForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setForm(installment ? formFromRow(installment) : initialForm());
  }, [isOpen, installment?.id]);
  const set = (patch) => setForm(prev => ({ ...prev, ...patch }));

  // Derived values
  const monthly = useMemo(() => {
    const t = parseFloat(form.total_amount);
    const n = parseInt(form.total_payments, 10);
    if (!t || !n || n <= 0) return 0;
    return t / n;
  }, [form.total_amount, form.total_payments]);

  const endDate = useMemo(() => {
    const n = parseInt(form.total_payments, 10);
    if (!n || n <= 0 || !form.start_date) return '';
    return addMonths(form.start_date, n - 1);
  }, [form.total_payments, form.start_date]);

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('הכנס שם'); return; }
    const total = parseFloat(form.total_amount);
    const n = parseInt(form.total_payments, 10);
    if (!total || total <= 0) { toast.error('סכום כולל לא תקין'); return; }
    if (!n || n <= 0) { toast.error('מספר תשלומים לא תקין'); return; }

    setSaving(true);
    const payload = {
      name: form.name.trim(),
      total_amount: total,
      monthly_amount: monthly,
      total_payments: n,
      payments_made: parseInt(form.payments_made || '0', 10),
      start_date: form.start_date,
      end_date: endDate,
      category: form.category || null,
      notes: form.notes || null,
    };
    try {
      if (installment?.id) await updateInstallment(installment.id, payload);
      else                  await addInstallment(userId, payload);
      toast.success(installment ? 'עודכן' : 'תשלום פס נשמר');
      onSaved?.();
      onClose();
    } catch (err) {
      console.error('[InstallmentForm] save error:', err);
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
            {installment ? 'עריכת תשלום פס' : 'תשלום פס חדש'}
          </DialogTitle>
        </DialogHeader>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 8 }}>
          <div>
            <label style={labelStyle}>שם *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="למשל: iPhone, ריהוט, טלוויזיה"
              style={inputStyle}
              autoFocus
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>סכום כולל *</label>
              <input
                type="number" inputMode="decimal"
                value={form.total_amount}
                onChange={(e) => set({ total_amount: e.target.value })}
                placeholder="₪"
                style={{ ...inputStyle, fontSize: 18, fontWeight: 700 }}
              />
            </div>
            <div>
              <label style={labelStyle}>מס' תשלומים *</label>
              <input
                type="number" inputMode="numeric"
                value={form.total_payments}
                onChange={(e) => set({ total_payments: e.target.value })}
                placeholder="12"
                style={{ ...inputStyle, fontSize: 18, fontWeight: 700 }}
              />
            </div>
          </div>

          {monthly > 0 && (
            <div style={{
              padding: '10px 12px', borderRadius: 10,
              backgroundColor: '#F7F3EC',
              display: 'flex', justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: 12, color: LIFEOS_COLORS.textSecondary, fontWeight: 600 }}>
                תשלום חודשי:
              </span>
              <span style={{ fontSize: 14, fontWeight: 800, color: LIFEOS_COLORS.primary }}>
                {Math.round(monthly).toLocaleString('he-IL')}₪
              </span>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>תשלומים ששולמו</label>
              <input
                type="number" inputMode="numeric" min="0"
                value={form.payments_made}
                onChange={(e) => set({ payments_made: e.target.value })}
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

          <div>
            <label style={labelStyle}>קטגוריה</label>
            <select
              value={form.category}
              onChange={(e) => set({ category: e.target.value })}
              style={inputStyle}
            >
              <option value="">—</option>
              {EXPENSE_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
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
