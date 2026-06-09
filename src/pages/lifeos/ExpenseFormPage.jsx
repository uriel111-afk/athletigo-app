import React, { useContext, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import {
  EXPENSE_CATEGORIES, PAYMENT_METHODS, LIFEOS_COLORS,
} from '@/lib/lifeos/lifeos-constants';
import { addExpense, deleteExpense } from '@/lib/lifeos/lifeos-api';
import { supabase } from '@/lib/supabaseClient';
import { compressImage } from '@/lib/imageCompression';
import { pushDebugLog } from '@/lib/debugLog';
import { AuthContext } from '@/lib/AuthContext';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';

// Full-page version of ExpenseForm — used for NEW expenses only.
// Lives on its own route (/lifeos/expenses/new) so that the native
// camera/gallery intent on iOS can't close a parent Dialog when focus
// returns. Edit mode still uses the in-place ExpenseForm Dialog.

const isNativePlatform = Capacitor.isNativePlatform();

const makeLocalId = () => {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch {}
  return `pf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

const todayISO = () => new Date().toISOString().slice(0, 10);

const initialForm = () => ({
  amount: '',
  category: '',
  subcategory: '',
  description: '',
  date: todayISO(),
  payment_method: '',
  notes: '',
  is_recurring: false,
  recurring_frequency: 'monthly',
  recurring_until: '',
});

const defaultRecurringUntil = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
};

// Shared with the Dialog ExpenseForm — same key so a draft started in
// the page can also be resumed by the dialog (and vice versa).
const draftKey = (userId) => `expense-form-draft-${userId || 'anon'}`;

const isDraftMeaningful = (draft) =>
  draft && Object.values(draft).some(v => v !== '' && v != null);

export default function ExpenseFormPage() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const userId = user?.id;

  const [form, setForm] = useState(initialForm());
  const [saving, setSaving] = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });

  // Mirror of pendingFiles for the unmount cleanup effect (avoids
  // stale-closure issues when revoking object URLs on tear-down).
  const pendingFilesRef = useRef([]);
  useEffect(() => { pendingFilesRef.current = pendingFiles; }, [pendingFiles]);

  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  // Single-shot mount initialiser — load any draft.
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!userId) return;
    if (initializedRef.current) return;
    initializedRef.current = true;
    pushDebugLog('ExpenseFormPage', 'mount', { userIdPresent: !!userId });
    let draft = null;
    try {
      const raw = sessionStorage.getItem(draftKey(userId));
      if (raw) draft = JSON.parse(raw);
    } catch {}
    if (isDraftMeaningful(draft)) {
      pushDebugLog('ExpenseFormPage', 'draft-restored');
      setForm({ ...initialForm(), ...draft });
      toast.success('טיוטה נטענה');
    }
  }, [userId]);

  // Persist draft on every change.
  useEffect(() => {
    if (!userId) return;
    try {
      sessionStorage.setItem(draftKey(userId), JSON.stringify(form));
    } catch {}
  }, [form, userId]);

  // Unmount safety net — revoke any outstanding object URLs.
  useEffect(() => {
    return () => {
      pendingFilesRef.current.forEach(pf => {
        try { URL.revokeObjectURL(pf.previewUrl); } catch {}
      });
      pushDebugLog('ExpenseFormPage', 'unmount');
    };
  }, []);

  const set = (patch) => setForm(prev => ({ ...prev, ...patch }));

  const clearDraft = () => {
    if (!userId) return;
    try { sessionStorage.removeItem(draftKey(userId)); } catch {}
  };

  const goBack = () => {
    // Revoke any pending object URLs before navigating away.
    pendingFilesRef.current.forEach(pf => {
      try { URL.revokeObjectURL(pf.previewUrl); } catch {}
    });
    clearDraft();
    navigate('/lifeos/expenses');
  };

  // ─── Pending-file helpers ──────────────────────────────────────
  const addPendingFiles = (files) => {
    const next = [];
    for (const f of files) {
      if (!f) continue;
      next.push({
        id: makeLocalId(),
        file: f,
        previewUrl: URL.createObjectURL(f),
      });
    }
    if (next.length) setPendingFiles(prev => [...prev, ...next]);
  };

  const removePendingFile = (id) => {
    setPendingFiles(prev => {
      const target = prev.find(p => p.id === id);
      if (target) { try { URL.revokeObjectURL(target.previewUrl); } catch {} }
      return prev.filter(p => p.id !== id);
    });
  };

  async function pickWithNativeCamera(source) {
    try {
      const image = await Camera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
        width: 1600,
        saveToGallery: false,
      });
      const byteString = atob(image.base64String);
      const mimeString = `image/${image.format}`;
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
      const blob = new Blob([ab], { type: mimeString });
      const file = new File([blob], `photo-${Date.now()}.${image.format}`, { type: mimeString });
      addPendingFiles([file]);
    } catch (err) {
      if (err?.message?.includes('cancelled')) return;
      toast.error('שגיאה במצלמה: ' + (err?.message || ''));
    }
  }

  const pickFile = (source) => {
    if (isNativePlatform) {
      pickWithNativeCamera(source);
    } else if (source === 'camera') {
      cameraInputRef.current?.click();
    } else {
      galleryInputRef.current?.click();
    }
  };

  const handleHiddenInputChange = (e) => {
    const files = Array.from(e.target.files || []);
    addPendingFiles(files);
    if (e.target) e.target.value = '';
  };

  // Uploads one pending file (compress → storage → lifeos_files row).
  // Returns { path, rowId } so the caller can roll back on later failure.
  async function uploadOnePendingFile(file, expenseId) {
    const isImage = (file.type || '').startsWith('image/');
    let toUpload = file;
    let mimeType = file.type || 'application/octet-stream';
    let extension = (file.name?.split('.').pop() || 'bin').toLowerCase();

    if (isImage) {
      toUpload = await compressImage(file);
      mimeType = 'image/jpeg';
      extension = 'jpg';
    }

    const rand = Math.random().toString(36).slice(2, 7);
    const path = `${userId}/expense-${expenseId}-${Date.now()}-${rand}.${extension}`;

    const { error: uploadErr } = await supabase.storage
      .from('lifeos-files')
      .upload(path, toUpload, { contentType: mimeType, upsert: false });
    if (uploadErr) throw new Error('storage: ' + uploadErr.message);

    const { data: urlData } = supabase.storage
      .from('lifeos-files')
      .getPublicUrl(path);
    const fileUrl = urlData?.publicUrl;
    if (!fileUrl) {
      try { await supabase.storage.from('lifeos-files').remove([path]); } catch {}
      throw new Error('public URL missing');
    }

    const { data: inserted, error: insertErr } = await supabase
      .from('lifeos_files')
      .insert({
        owner_user_id: userId,
        entity_type: 'expense',
        entity_id: expenseId,
        file_url: fileUrl,
        file_name: file.name || `expense-${Date.now()}.${extension}`,
        file_type: isImage ? 'image' : (mimeType.startsWith('video/') ? 'video' : 'other'),
        file_size: toUpload.size,
        mime_type: mimeType,
      })
      .select()
      .single();
    if (insertErr) {
      try { await supabase.storage.from('lifeos-files').remove([path]); } catch {}
      throw new Error('db: ' + insertErr.message);
    }

    return { path, rowId: inserted?.id };
  }

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
    setUploadProgress({ done: 0, total: pendingFiles.length });
    try {
      const payload = {
        amount,
        category: form.category,
        subcategory: form.subcategory || null,
        description: form.description || null,
        date: form.date,
        payment_method: form.payment_method || null,
        notes: form.notes || null,
        is_recurring: !!form.is_recurring,
        recurring_frequency: form.is_recurring ? (form.recurring_frequency || 'monthly') : null,
        recurring_until: form.is_recurring && form.recurring_until ? form.recurring_until : null,
      };

      let savedRow = null;
      try {
        savedRow = await addExpense(userId, payload);
      } catch (insertError) {
        window.lastExpenseError = {
          time: new Date().toISOString(),
          stage: 'insert',
          message: insertError?.message || String(insertError),
          code: insertError?.code,
        };
        pushDebugLog('ExpenseFormPage', 'save-insert-throw', {
          message: insertError?.message || String(insertError),
        });
        alert(
          'שמירת ההוצאה נכשלה.\n\n' +
          'הודעה: ' + (insertError?.message || 'אין הודעה') + '\n' +
          'קוד: ' + (insertError?.code || 'אין')
        );
        setSaving(false);
        setUploadProgress({ done: 0, total: 0 });
        return;
      }

      // Atomic receipt uploads — any failure rolls back the whole save.
      const uploaded = [];
      const failures = [];
      if (pendingFiles.length > 0) {
        for (let i = 0; i < pendingFiles.length; i++) {
          const pf = pendingFiles[i];
          try {
            const result = await uploadOnePendingFile(pf.file, savedRow.id);
            uploaded.push(result);
            setUploadProgress({ done: i + 1, total: pendingFiles.length });
          } catch (uploadErr) {
            pushDebugLog('ExpenseFormPage', 'upload-file-failed', {
              index: i, message: uploadErr?.message || String(uploadErr),
            });
            failures.push({ pf, err: uploadErr });
            break;
          }
        }
      }

      if (failures.length > 0) {
        try { await deleteExpense(savedRow.id); } catch {}
        for (const u of uploaded) {
          try { await supabase.storage.from('lifeos-files').remove([u.path]); } catch {}
          if (u.rowId) {
            try { await supabase.from('lifeos_files').delete().eq('id', u.rowId); } catch {}
          }
        }
        toast.error('ההוצאה לא נשמרה — שגיאה בהעלאת תמונה. נסה שוב.');
        setSaving(false);
        setUploadProgress({ done: 0, total: 0 });
        return;
      }

      pendingFiles.forEach(pf => {
        try { URL.revokeObjectURL(pf.previewUrl); } catch {}
      });
      setPendingFiles([]);
      setUploadProgress({ done: 0, total: 0 });

      window.lastExpenseSuccess = {
        time: new Date().toISOString(),
        expense_id: savedRow?.id,
        receipts_uploaded: uploaded.length,
      };
      pushDebugLog('ExpenseFormPage', 'save-success', {
        id: savedRow?.id,
        receipts_uploaded: uploaded.length,
      });
      toast.success('ההוצאה נשמרה');
      clearDraft();
      navigate('/lifeos/expenses');

    } catch (err) {
      window.lastExpenseError = {
        time: new Date().toISOString(),
        stage: 'uncaught',
        message: err?.message || String(err),
        stack: err?.stack,
      };
      pushDebugLog('ExpenseFormPage', 'save-uncaught', {
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

  return (
    <LifeOSLayout title="הוצאה חדשה">
      {/* Hidden file inputs — sit at the top of the page tree so the
          camera intent's focus return on iOS can't tear them down. */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleHiddenInputChange}
        style={{ display: 'none' }}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleHiddenInputChange}
        style={{ display: 'none' }}
      />

      <div style={{ padding: '0 14px' }}>
        <button
          onClick={goBack}
          disabled={saving}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: 'transparent', border: 'none',
            padding: '4px 0 12px',
            color: LIFEOS_COLORS.textSecondary,
            fontSize: 13, fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.5 : 1,
            fontFamily: 'inherit',
          }}
        >
          <ChevronRight size={18} />
          <span>חזרה להוצאות</span>
        </button>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Amount */}
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

          {/* Category */}
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

          {/* Subcategory */}
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

          {/* Date + Payment method */}
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

          {/* Recurring */}
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

          {/* Receipts */}
          <div>
            <label style={labelStyle}>קבלות</label>
            {pendingFiles.length > 0 && (
              <div style={{
                display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10,
              }}>
                {pendingFiles.map(pf => (
                  <div key={pf.id} style={{
                    position: 'relative', width: 72, height: 72,
                    borderRadius: 8, overflow: 'hidden',
                    border: `1px solid ${LIFEOS_COLORS.border}`,
                  }}>
                    <img
                      src={pf.previewUrl}
                      alt="קבלה"
                      style={{
                        width: '100%', height: '100%', objectFit: 'cover',
                        display: 'block',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => removePendingFile(pf.id)}
                      aria-label="הסר תמונה"
                      disabled={saving}
                      style={{
                        position: 'absolute', top: -6, left: -6,
                        width: 22, height: 22, borderRadius: '50%',
                        border: '2px solid #FFFFFF',
                        background: 'var(--ag-error)', color: '#FFFFFF',
                        fontSize: 12, lineHeight: 1, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: 0, fontFamily: 'inherit',
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => pickFile('camera')}
                disabled={saving}
                style={receiptPickerBtn(saving)}
                aria-label="צלם"
              >
                <span style={{ fontSize: 16, lineHeight: 1 }}>📷</span>
                <span>צלם</span>
              </button>
              <button
                type="button"
                onClick={() => pickFile('gallery')}
                disabled={saving}
                style={receiptPickerBtn(saving)}
                aria-label="בחר מהגלריה"
              >
                <span style={{ fontSize: 16, lineHeight: 1 }}>🖼️</span>
                <span>גלריה</span>
              </button>
            </div>
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 10, paddingTop: 8 }}>
            <button
              onClick={goBack}
              disabled={saving}
              style={btnSecondary}
            >
              ביטול
            </button>
            <button
              onClick={handleSaveExpense}
              disabled={saving}
              style={btnPrimary}
            >
              {saving
                ? (uploadProgress.total > 0
                    ? `שומר... (${uploadProgress.done}/${uploadProgress.total} תמונות הועלו)`
                    : <Loader2 className="w-5 h-5 animate-spin" style={{ margin: '0 auto' }} />)
                : 'שמור הוצאה'}
            </button>
          </div>
        </div>
      </div>
    </LifeOSLayout>
  );
}

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
  fontFamily: 'inherit',
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
  fontFamily: 'inherit',
};

const receiptPickerBtn = (disabled) => ({
  flex: 1,
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '10px 12px',
  borderRadius: 10,
  border: `1px dashed ${LIFEOS_COLORS.primary}`,
  backgroundColor: '#FFF8F3',
  color: LIFEOS_COLORS.primary,
  fontSize: 13, fontWeight: 700,
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.6 : 1,
  fontFamily: 'inherit',
});
