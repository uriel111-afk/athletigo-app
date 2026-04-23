import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  INCOME_SOURCES, ATHLETIGO_PRODUCTS, LIFEOS_COLORS,
} from '@/lib/lifeos/lifeos-constants';
import { addIncome } from '@/lib/lifeos/lifeos-api';

const todayISO = () => new Date().toISOString().slice(0, 10);

const initialForm = () => ({
  amount: '',
  source: '',
  product: '',
  client_name: '',
  description: '',
  date: todayISO(),
  notes: '',
});

export default function IncomeForm({ isOpen, onClose, userId, onSaved }) {
  const [form, setForm] = useState(initialForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) setForm(initialForm());
  }, [isOpen]);

  const set = (patch) => setForm(prev => ({ ...prev, ...patch }));

  // When a product is picked, auto-fill amount with its default price
  // if amount is still empty.
  const handleProductChange = (key) => {
    const prod = ATHLETIGO_PRODUCTS.find(p => p.key === key);
    set({
      product: key,
      amount: form.amount || (prod?.price ? String(prod.price) : ''),
    });
  };

  const handleSave = async () => {
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) {
      toast.error('הכנס סכום תקין');
      return;
    }
    if (!form.source) {
      toast.error('בחר מקור הכנסה');
      return;
    }
    setSaving(true);
    try {
      await addIncome(userId, {
        amount,
        source: form.source,
        product: form.product || null,
        client_name: form.client_name || null,
        description: form.description || null,
        date: form.date,
        notes: form.notes || null,
      });
      toast.success('ההכנסה נשמרה');
      onSaved?.();
      onClose();
    } catch (err) {
      console.error('[IncomeForm] save error:', err);
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
            הכנסה חדשה
          </DialogTitle>
        </DialogHeader>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 8 }}>
          {/* Amount */}
          <div>
            <label style={labelStyle}>סכום *</label>
            <input
              type="number"
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => set({ amount: e.target.value })}
              placeholder="כמה נכנס?"
              style={{
                ...inputStyle,
                fontSize: 28, fontWeight: 800, textAlign: 'center',
                color: LIFEOS_COLORS.success,
                letterSpacing: 1,
              }}
              autoFocus
            />
          </div>

          {/* Source — chips */}
          <div>
            <label style={labelStyle}>מקור *</label>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 6,
              marginTop: 4,
            }}>
              {INCOME_SOURCES.map(src => {
                const active = form.source === src.key;
                return (
                  <button
                    key={src.key}
                    onClick={() => set({ source: src.key })}
                    style={{
                      padding: '10px 6px',
                      borderRadius: 10,
                      border: `1px solid ${active ? LIFEOS_COLORS.primary : LIFEOS_COLORS.border}`,
                      backgroundColor: active ? LIFEOS_COLORS.primary : '#FFFFFF',
                      color: active ? '#FFFFFF' : LIFEOS_COLORS.textPrimary,
                      fontSize: 13, fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {src.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Product select */}
          <div>
            <label style={labelStyle}>מוצר</label>
            <select
              value={form.product}
              onChange={(e) => handleProductChange(e.target.value)}
              style={inputStyle}
            >
              <option value="">— בחר מוצר —</option>
              {ATHLETIGO_PRODUCTS.map(p => (
                <option key={p.key} value={p.key}>
                  {p.label} {p.price ? `(₪${p.price})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Client name + date row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>שם לקוח</label>
              <input
                type="text"
                value={form.client_name}
                onChange={(e) => set({ client_name: e.target.value })}
                placeholder="אופציונלי"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>תאריך</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => set({ date: e.target.value })}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label style={labelStyle}>תיאור</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => set({ description: e.target.value })}
              placeholder="על מה ההכנסה?"
              style={inputStyle}
            />
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
              {saving ? <Loader2 className="w-5 h-5 animate-spin" style={{ margin: '0 auto' }} /> : 'שמור הכנסה'}
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
  backgroundColor: LIFEOS_COLORS.success,
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
