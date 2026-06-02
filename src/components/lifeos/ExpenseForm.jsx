import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  EXPENSE_CATEGORIES, PAYMENT_METHODS, LIFEOS_COLORS,
} from '@/lib/lifeos/lifeos-constants';
import { addExpense, updateExpense } from '@/lib/lifeos/lifeos-api';
import SmartCamera from '@/components/lifeos/SmartCamera';
import { pushDebugLog, readDebugLog, clearDebugLog, formatDebugLog } from '@/lib/debugLog';

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
  is_recurring: false,
  recurring_frequency: 'monthly',
  recurring_until: '',
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
  is_recurring: !!row.is_recurring,
  recurring_frequency: row.recurring_frequency || 'monthly',
  recurring_until: row.recurring_until || '',
});

// Default end date when the user switches to "עד תאריך": one year out.
const defaultRecurringUntil = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
};

// sessionStorage key for the in-progress draft. Per-user so multiple
// accounts on the same browser don't bleed into each other. Only used
// for NEW expenses (edit mode loads from the row, never from draft).
const draftKey = (userId) => `expense-form-draft-${userId || 'anon'}`;

const isDraftMeaningful = (draft) => draft && Object.values(draft).some(v => v !== '' && v != null);

export default function ExpenseForm({ isOpen, onClose, userId, onSaved, expense = null }) {
  const [form, setForm] = useState(initialForm());
  const [saving, setSaving] = useState(false);
  // True while SmartCamera is compressing / uploading. We lock the
  // save button during this window so the user can't fire
  // addExpense with an empty receipt_url before the upload's
  // onUploaded callback has had a chance to populate the form.
  const [cameraBusy, setCameraBusy] = useState(false);

  // Diagnostic: log mount + unmount to a localStorage-backed rolling
  // log (survives iOS PWA WebView reload, unlike the console).
  useEffect(() => {
    const draftRaw = (() => {
      try { return sessionStorage.getItem(draftKey(userId)); } catch { return null; }
    })();
    pushDebugLog('ExpenseForm', 'mount', {
      hasDraft: !!draftRaw,
      draftPreview: draftRaw ? draftRaw.slice(0, 200) : null,
      userIdPresent: !!userId,
      expenseEdit: !!expense,
    });
    return () => {
      pushDebugLog('ExpenseForm', 'unmount');
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset form whenever the dialog opens — pre-fill if editing OR
  // restore from a sessionStorage draft if one exists (new-expense
  // mode only). The draft now carries receipt_url + receipt_path +
  // receipt_bucket alongside the regular fields, so an Activity
  // destruction recovery shows the previously-uploaded photo without
  // any IndexedDB round-trip.
  useEffect(() => {
    pushDebugLog('ExpenseForm', 'reset-effect-trigger', {
      isOpen, expenseId: expense?.id || null, userId: userId || null,
    });
    if (!isOpen) return;
    if (expense) {
      setForm(formFromRow(expense));
    } else {
      let draft = null;
      try {
        const raw = sessionStorage.getItem(draftKey(userId));
        if (raw) draft = JSON.parse(raw);
      } catch {}
      if (isDraftMeaningful(draft)) {
        setForm({ ...initialForm(), ...draft });
        toast.success('טיוטה נטענה');
      } else {
        setForm(initialForm());
      }
    }
  }, [isOpen, expense?.id, userId]);

  // Persist form state to sessionStorage on every change — but only in
  // new-expense mode. Skipped in edit mode so we don't overwrite the
  // draft with the existing row's values.
  useEffect(() => {
    if (!isOpen || expense) return;
    try {
      sessionStorage.setItem(draftKey(userId), JSON.stringify(form));
    } catch {}
  }, [form, isOpen, expense, userId]);

  // State-change diagnostics (rolling log).
  useEffect(() => {
    pushDebugLog('ExpenseForm', 'is_recurring-changed', { value: form.is_recurring });
  }, [form.is_recurring]);

  useEffect(() => {
    pushDebugLog('ExpenseForm', 'receipt-changed', {
      hasUrl: !!form.receipt_url,
    });
  }, [form.receipt_url]);

  // Debug panel state — read-only viewer for the rolling log.
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugText, setDebugText] = useState('');
  const refreshDebug = () => setDebugText(formatDebugLog(readDebugLog()));

  const set = (patch) => setForm(prev => ({ ...prev, ...patch }));

  // Clear the draft from sessionStorage. Called on every close path
  // (success, cancel, dialog-openchange) so a fresh form open after a
  // clean close starts empty.
  const clearDraft = () => {
    if (expense || !userId) return; // skip in edit mode
    try {
      sessionStorage.removeItem(draftKey(userId));
    } catch {}
  };

  // Single chokepoint for closing the form. Clears the sessionStorage
  // draft (text fields only) on any close — fresh re-open starts empty.
  // Storage cleanup of orphan receipts is owned by SmartCamera itself
  // (its X button + replace-photo paths), not by the form close path.
  const closeForm = (source) => {
    pushDebugLog('ExpenseForm', 'closeForm-called', { source });
    clearDraft();
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
      const receipt_url = form.receipt_url || null;

      // Photos are uploaded inside SmartCamera the moment the user
      // picks them — by the time we get here the URL is already a
      // public Storage object. Save is a single DB write.
      pushDebugLog('ExpenseForm', 'save-start', {
        hasReceiptUrl: !!receipt_url,
        urlPreview: receipt_url ? String(receipt_url).slice(0, 80) : null,
      });

      const payload = {
        amount,
        category: form.category,
        subcategory: form.subcategory || null,
        description: form.description || null,
        date: form.date,
        payment_method: form.payment_method || null,
        notes: form.notes || null,
        receipt_url: receipt_url,
        is_recurring: !!form.is_recurring,
        recurring_frequency: form.is_recurring ? (form.recurring_frequency || 'monthly') : null,
        recurring_until: form.is_recurring && form.recurring_until ? form.recurring_until : null,
      };

      let savedRow = null;
      try {
        if (expense?.id) {
          savedRow = await updateExpense(expense.id, payload);
        } else {
          savedRow = await addExpense(userId, payload);
        }
      } catch (insertError) {
        window.lastExpenseError = {
          time: new Date().toISOString(),
          stage: 'insert',
          message: insertError?.message || String(insertError),
          code: insertError?.code,
          stack: insertError?.stack,
        };
        pushDebugLog('ExpenseForm', 'save-insert-throw', {
          message: insertError?.message || String(insertError),
          code: insertError?.code,
        });
        alert(
          'שמירת ההוצאה נכשלה.\n\n' +
          'הודעה: ' + (insertError?.message || 'אין הודעה') + '\n' +
          'קוד: ' + (insertError?.code || 'אין')
        );
        setSaving(false);
        return; // CRITICAL: do NOT close the dialog
      }

      window.lastExpenseSuccess = {
        time: new Date().toISOString(),
        expense_id: savedRow?.id,
        receipt_url: savedRow?.receipt_url ? 'present' : 'absent',
      };
      pushDebugLog('ExpenseForm', 'save-success', {
        id: savedRow?.id,
        receiptSaved: !!savedRow?.receipt_url,
      });
      toast.success((expense ? 'ההוצאה עודכנה' : 'ההוצאה נשמרה') + (receipt_url ? ' עם תמונה' : ''));
      onSaved?.(savedRow);
      closeForm('success');

    } catch (err) {
      window.lastExpenseError = {
        time: new Date().toISOString(),
        stage: 'uncaught',
        message: err?.message || String(err),
        stack: err?.stack,
      };
      pushDebugLog('ExpenseForm', 'save-uncaught', {
        message: err?.message || String(err),
      });
      alert(
        'שגיאה לא צפויה:\n\n' +
        (err?.message || 'אין הודעה') + '\n\n' +
        (err?.stack || '')
      );
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
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open && !saving) closeForm('dialog-openchange');
    }}>
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

          {/* Recurring toggle */}
          <div>
            <label style={labelStyle}>סוג הוצאה</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => set({ is_recurring: false, recurring_until: '' })}
                style={{
                  flex: 1, padding: '10px 12px', borderRadius: 10,
                  border: `1px solid ${!form.is_recurring ? LIFEOS_COLORS.primary : LIFEOS_COLORS.border}`,
                  backgroundColor: !form.is_recurring ? LIFEOS_COLORS.primary : '#FFFFFF',
                  color: !form.is_recurring ? '#FFFFFF' : LIFEOS_COLORS.textPrimary,
                  fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >חד פעמית</button>
              <button
                type="button"
                onClick={() => set({ is_recurring: true })}
                style={{
                  flex: 1, padding: '10px 12px', borderRadius: 10,
                  border: `1px solid ${form.is_recurring ? LIFEOS_COLORS.primary : LIFEOS_COLORS.border}`,
                  backgroundColor: form.is_recurring ? LIFEOS_COLORS.primary : '#FFFFFF',
                  color: form.is_recurring ? '#FFFFFF' : LIFEOS_COLORS.textPrimary,
                  fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >🔁 קבועה</button>
            </div>
          </div>

          {/* Recurring details — frequency + end-date — only when recurring */}
          {form.is_recurring && (
            <div style={{
              padding: 12, borderRadius: 10,
              backgroundColor: '#FFF8F3',
              border: `1px dashed ${LIFEOS_COLORS.primary}`,
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <div>
                <label style={labelStyle}>תדירות</label>
                <select
                  value={form.recurring_frequency}
                  onChange={(e) => set({ recurring_frequency: e.target.value })}
                  style={inputStyle}
                >
                  <option value="monthly">חודשי</option>
                  <option value="weekly">שבועי</option>
                  <option value="yearly">שנתי</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>תקופה</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => set({ recurring_until: '' })}
                    style={{
                      flex: 1, padding: '8px 10px', borderRadius: 8,
                      border: `1px solid ${!form.recurring_until ? LIFEOS_COLORS.primary : LIFEOS_COLORS.border}`,
                      backgroundColor: !form.recurring_until ? LIFEOS_COLORS.primary : '#FFFFFF',
                      color: !form.recurring_until ? '#FFFFFF' : LIFEOS_COLORS.textPrimary,
                      fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >ללא הגבלה</button>
                  <button
                    type="button"
                    onClick={() => set({ recurring_until: form.recurring_until || defaultRecurringUntil() })}
                    style={{
                      flex: 1, padding: '8px 10px', borderRadius: 8,
                      border: `1px solid ${form.recurring_until ? LIFEOS_COLORS.primary : LIFEOS_COLORS.border}`,
                      backgroundColor: form.recurring_until ? LIFEOS_COLORS.primary : '#FFFFFF',
                      color: form.recurring_until ? '#FFFFFF' : LIFEOS_COLORS.textPrimary,
                      fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >עד תאריך</button>
                </div>
                {form.recurring_until && (
                  <input
                    type="date"
                    value={form.recurring_until}
                    onChange={(e) => set({ recurring_until: e.target.value })}
                    min={form.date}
                    style={{ ...inputStyle, marginTop: 8 }}
                  />
                )}
              </div>
            </div>
          )}

          {/* Receipt photo — SmartCamera is the unified picker + preview.
              `key` forces a fresh SmartCamera mount when the form opens
              on a different expense so the previous expense's initialUrl
              doesn't bleed in. Hydration values come from form fields
              (receipt_url/path/bucket) which are loaded either from the
              row (edit mode) or from the sessionStorage draft (recovery
              after Activity destruction). */}
          <div>
            <label style={labelStyle}>קבלה</label>
            <SmartCamera
              key={expense?.id || 'new-expense'}
              compact
              initialUrl={form.receipt_url || null}
              onUploaded={({ url }) => {
                pushDebugLog('ExpenseForm', 'onUploaded-received', {
                  url: String(url).slice(0, 80),
                });
                setForm(prev => ({ ...prev, receipt_url: url }));
              }}
              onCleared={() => {
                pushDebugLog('ExpenseForm', 'onCleared-received');
                setForm(prev => ({ ...prev, receipt_url: '' }));
              }}
              onBusyChange={setCameraBusy}
            />
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
              disabled={saving || cameraBusy}
              style={{
                ...btnPrimary,
                // Greyed out + non-orange while SmartCamera is still
                // compressing/uploading — prevents the save-race that
                // dropped receipt_url before the upload's onUploaded
                // callback could populate it.
                ...(cameraBusy ? {
                  backgroundColor: '#B0B0B0',
                  cursor: 'not-allowed',
                } : null),
              }}
            >
              {saving
                ? <Loader2 className="w-5 h-5 animate-spin" style={{ margin: '0 auto' }} />
                : (cameraBusy ? 'ממתין לתמונה...' : 'שמור הוצאה')}
            </button>
          </div>

          {/* Debug — read the localStorage rolling log. Visible to the
              user so we can capture iOS reload sequences. Remove once
              the silent-close bug is identified. */}
          <button
            type="button"
            onClick={() => { setDebugOpen(v => !v); refreshDebug(); }}
            style={{
              background: 'transparent', border: 'none',
              color: '#9CA3AF', fontSize: 10,
              cursor: 'pointer', textDecoration: 'underline',
              alignSelf: 'center', marginTop: 4,
            }}
          >
            {debugOpen ? 'הסתר Debug' : 'Debug log'}
          </button>
          {debugOpen && (
            <div style={{
              background: '#F5F5F5', padding: 8, borderRadius: 6,
              fontSize: 10, fontFamily: 'monospace',
              maxHeight: 220, overflowY: 'auto',
              whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              direction: 'ltr',
            }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 6, position: 'sticky', top: 0, background: '#F5F5F5' }}>
                <button
                  type="button"
                  onClick={refreshDebug}
                  style={{ background: '#374151', color: 'white', border: 'none', borderRadius: 4, padding: '2px 6px', fontSize: 10, cursor: 'pointer' }}
                >Refresh</button>
                <button
                  type="button"
                  onClick={() => { clearDebugLog(); refreshDebug(); }}
                  style={{ background: '#dc2626', color: 'white', border: 'none', borderRadius: 4, padding: '2px 6px', fontSize: 10, cursor: 'pointer' }}
                >Clear</button>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      navigator.clipboard?.writeText(debugText);
                    } catch {}
                  }}
                  style={{ background: '#0EA5E9', color: 'white', border: 'none', borderRadius: 4, padding: '2px 6px', fontSize: 10, cursor: 'pointer' }}
                >Copy</button>
              </div>
              {debugText || '(empty — tap Refresh)'}
            </div>
          )}
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
