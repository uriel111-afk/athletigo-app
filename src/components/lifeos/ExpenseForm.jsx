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

  // Single chokepoint for closing the form — logs the trigger so we
  // can identify silent closes (e.g. dialog-openchange vs success vs cancel).
  const closeForm = (source) => {
    console.log('[ExpenseForm] closing, source:', source);
    onClose?.();
  };

  const handleSaveExpense = async () => {
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
    try {
      console.log('[EXPENSE] start, pendingBlob:', pendingBlob);

      let receipt_url = form.receipt_url || null;

      // ── Step 1: upload photo if one was captured ─────────────────
      if (pendingBlob?.blob && cameraRef.current) {
        const blob = pendingBlob.blob;
        console.log('[EXPENSE] photo:', { size: blob.size, type: blob.type, name: pendingBlob.filename });

        if (blob.size > 5 * 1024 * 1024) {
          alert('התמונה גדולה מ-5 מגה. נסה תמונה קטנה יותר.');
          setSaving(false);
          return;
        }

        console.log('[EXPENSE] uploading via SmartCamera.uploadNow (bucket: lifeos-files → media fallback)');

        let uploadResult = null;
        try {
          uploadResult = await cameraRef.current.uploadNow();
          console.log('[EXPENSE] upload result:', { uploadResult });
        } catch (uploadError) {
          console.error('[EXPENSE] upload threw:', uploadError);
          window.lastExpenseError = {
            time: new Date().toISOString(),
            stage: 'upload',
            message: uploadError?.message || String(uploadError),
            bucketAttempted: uploadError?.bucketAttempted,
            path: uploadError?.path,
            primaryError: uploadError?.primaryError,
            statusCode: uploadError?.statusCode,
            stack: uploadError?.stack,
          };
          // SmartCamera.uploadToStorage already shows a detailed alert
          // at the upload layer (sets err.alertShown). Only surface a
          // fallback alert here if the upload error came from a path
          // that didn't already alert.
          if (!uploadError?.alertShown) {
            alert(
              'שלב 1 — העלאת תמונה נכשלה.\n\n' +
              'הודעה: ' + (uploadError?.message || 'אין הודעה') + '\n' +
              'דלי: ' + (uploadError?.bucketAttempted || 'lifeos-files / media') + '\n' +
              'נתיב: ' + (uploadError?.path || 'לא ידוע')
            );
          }
          setSaving(false);
          return; // CRITICAL: do NOT close the dialog
        }

        if (!uploadResult) {
          window.lastExpenseError = {
            time: new Date().toISOString(),
            stage: 'upload',
            message: 'uploadNow returned no URL',
          };
          alert(
            'שלב 1 — העלאת תמונה נכשלה.\n\n' +
            'הודעה: uploadNow החזיר ערך ריק (אין URL).\n' +
            'דלי: lifeos-files / media'
          );
          setSaving(false);
          return;
        }
        receipt_url = uploadResult;
        console.log('[EXPENSE] receipt_url:', receipt_url);
      }

      // ── Step 2: insert / update expense row ──────────────────────
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
      console.log('[EXPENSE] inserting row with payload:', payload);

      let savedRow = null;
      try {
        if (expense?.id) {
          savedRow = await updateExpense(expense.id, payload);
        } else {
          savedRow = await addExpense(userId, payload);
        }
        console.log('[EXPENSE] insert result:', { savedRow });
      } catch (insertError) {
        console.error('[EXPENSE] insert threw:', insertError);
        window.lastExpenseError = {
          time: new Date().toISOString(),
          stage: 'insert',
          message: insertError?.message || String(insertError),
          code: insertError?.code,
          stack: insertError?.stack,
        };
        alert(
          'שלב 2 — שמירה נכשלה.\n\n' +
          'הודעה: ' + (insertError?.message || 'אין הודעה') + '\n' +
          'קוד: ' + (insertError?.code || 'אין')
        );
        setSaving(false);
        return; // CRITICAL: do NOT close the dialog
      }

      // ── Step 3: success path — only here do we close ─────────────
      window.lastExpenseSuccess = {
        time: new Date().toISOString(),
        expense_id: savedRow?.id,
        receipt_url: savedRow?.receipt_url ? 'present' : 'absent',
      };
      toast.success((expense ? 'ההוצאה עודכנה' : 'ההוצאה נשמרה') + (receipt_url ? ' עם תמונה' : ''));
      setPendingBlob(null);
      onSaved?.(savedRow);
      closeForm('success');

    } catch (err) {
      window.lastExpenseError = {
        time: new Date().toISOString(),
        stage: 'uncaught',
        message: err?.message || String(err),
        stack: err?.stack,
      };
      console.error('[EXPENSE] UNCAUGHT:', err);
      alert(
        'שגיאה לא צפויה:\n\n' +
        (err?.message || 'אין הודעה') + '\n\n' +
        (err?.stack || '')
      );
      // do NOT close the dialog on uncaught error
    } finally {
      setSaving(false);
    }
  };

  // Existing callers reference handleSave — keep the name as an alias.
  const handleSave = handleSaveExpense;

  // Force-download the receipt instead of opening it in a new tab.
  // Supabase Storage URLs are cross-origin so the <a download> attribute
  // is silently ignored on most browsers — fetch the blob ourselves and
  // trigger a download via createObjectURL. Falls back to opening the
  // URL in a new tab when fetch fails (network / CORS / 404).
  const handleDownloadReceipt = async () => {
    const url = form.receipt_url;
    if (!url) return;
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const ext = (blob.type && blob.type.split('/')[1]) || 'jpg';
      const datePart = (form.date || todayISO()).replace(/-/g, '');
      const filename = `receipt_${datePart}.${ext}`;
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Give the browser a tick to start the download before revoking.
      setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
    } catch (err) {
      console.error('[ExpenseForm] download failed:', err);
      // Best-effort fallback: open in new tab so the user still has a
      // way to save the image manually.
      try { window.open(url, '_blank', 'noopener'); } catch {}
      alert('הורדה נכשלה: ' + (err?.message || 'שגיאה לא ידועה') + '\n\nפתחנו את הקובץ בלשונית חדשה במקום.');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !saving) closeForm('dialog-openchange'); }}>
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
              onClick={() => closeForm('cancel')}
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
