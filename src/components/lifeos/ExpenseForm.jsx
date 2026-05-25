import React, { useEffect, useRef, useState } from 'react';
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
  const [pendingBlob, setPendingBlob] = useState(null);
  const cameraRef = useRef(null);

  // Diagnostic: log every unmount with the last captured error so we
  // can detect silent closes vs. caught-then-closed flows.
  useEffect(() => {
    return () => {
      console.log('[ExpenseForm] UNMOUNTING. lastExpenseError:',
        window.lastExpenseError || 'none');
    };
  }, []);

  // Reset form whenever the dialog opens — pre-fill if editing.
  useEffect(() => {
    if (!isOpen) return;
    setForm(expense ? formFromRow(expense) : initialForm());
    setPendingBlob(null);
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
    let savedRow = null;

    try {
      // Step 1: upload photo if attached
      let receipt_url = form.receipt_url;
      if (pendingBlob && cameraRef.current) {
        console.log('[ExpenseForm] Step 1: uploading photo');
        try {
          receipt_url = await cameraRef.current.uploadNow();
          console.log('[ExpenseForm] Photo uploaded:', receipt_url);
        } catch (uploadErr) {
          throw new Error(`UPLOAD_FAILED: ${uploadErr?.message || uploadErr}`);
        }
        if (!receipt_url) {
          throw new Error('UPLOAD_FAILED: uploadNow returned no URL');
        }
      }

      // Step 2: build payload
      const payload = {
        amount,
        category: form.category,
        subcategory: form.subcategory || null,
        description: form.description || null,
        date: form.date,
        payment_method: form.payment_method || null,
        notes: form.notes || null,
        receipt_url: receipt_url || null,
      };
      console.log('[ExpenseForm] Step 2: inserting expense', payload);

      // Step 3: insert + verify
      if (expense?.id) {
        savedRow = await updateExpense(expense.id, payload);
      } else {
        savedRow = await addExpense(userId, payload);
      }
      console.log('[ExpenseForm] Step 3: insert verified', savedRow);

      // Step 4: success path — only here do we close
      toast.success((expense ? 'ההוצאה עודכנה' : 'ההוצאה נשמרה') + (receipt_url ? ' עם תמונה' : ''));
      setPendingBlob(null);
      onSaved?.(savedRow);
      onClose?.();

    } catch (err) {
      window.lastExpenseError = {
        time: new Date().toISOString(),
        message: err?.message || String(err),
        stack: err?.stack,
        details: err,
      };
      console.error('[ExpenseForm] SAVE FAILED', window.lastExpenseError);

      const userMsg = err?.message?.startsWith('UPLOAD_FAILED:')
        ? `העלאת התמונה נכשלה: ${err.message.replace('UPLOAD_FAILED: ', '')}`
        : err?.message?.startsWith('VERIFICATION_FAILED:')
        ? `ההוצאה לא נשמרה כראוי. ${err.message}`
        : `שמירה נכשלה: ${err?.message || 'שגיאה לא ידועה'}`;

      toast.error(userMsg);
      alert(userMsg);
      // CRITICAL: do NOT call onClose. Form stays open so user can retry.

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
                ref={cameraRef}
                label="צלם קבלה"
                compact
                deferredUpload
                onPhotoCaptured={(blob, filename) => setPendingBlob(blob ? { blob, filename } : null)}
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
  fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
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
