import React, { useRef, useState } from 'react';
import { Paperclip, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import { compressImage } from '@/lib/imageCompression';
import { LIFEOS_COLORS } from '@/lib/lifeos/lifeos-constants';

// Atomic per-row receipt upload. Mirrors the documents-tab pattern:
// pick file → compress → upload to Storage → UPDATE expenses SET
// receipt_url all in one shot, with no form state to preserve between
// steps. If anything fails or the page is killed mid-upload, the
// expense row still exists and the user just taps the 📎 again to
// retry — no orphan state, no race.

export default function ExpenseReceiptButton({
  expenseId,
  userId,
  currentReceiptUrl,
  onUpdated,
  iconSize = 14,
}) {
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);
  const [showPicker, setShowPicker] = useState(false);
  const [uploading, setUploading] = useState(false);

  const openPicker = (e) => {
    e?.stopPropagation();
    setShowPicker(true);
  };

  async function handleFile(file) {
    if (!file || !expenseId || !userId) return;
    setUploading(true);
    try {
      const compressed = await compressImage(file);
      const path = `${userId}/expense-receipt-${expenseId}-${Date.now()}.jpg`;

      const { error: uploadErr } = await supabase.storage
        .from('lifeos-files')
        .upload(path, compressed, {
          contentType: 'image/jpeg',
          upsert: true,
        });
      if (uploadErr) {
        toast.error('העלאת התמונה נכשלה: ' + (uploadErr.message || 'שגיאה'));
        return;
      }

      const { data: urlData } = supabase.storage
        .from('lifeos-files')
        .getPublicUrl(path);
      const publicUrl = urlData?.publicUrl;
      if (!publicUrl) {
        toast.error('קבלת ה-URL נכשלה');
        return;
      }

      const { error: updateErr } = await supabase
        .from('expenses')
        .update({ receipt_url: publicUrl })
        .eq('id', expenseId);
      if (updateErr) {
        toast.error('שמירת קישור הקבלה נכשלה: ' + (updateErr.message || ''));
        return;
      }

      toast.success('הקבלה נשמרה ✓');
      setShowPicker(false);
      onUpdated?.();
    } catch (err) {
      console.error('[ExpenseReceiptButton] upload threw:', err);
      toast.error('שגיאה: ' + (err?.message || 'שגיאה לא ידועה'));
    } finally {
      setUploading(false);
      // Reset input values so picking the same file again triggers
      // onChange.
      if (cameraRef.current) cameraRef.current.value = '';
      if (galleryRef.current) galleryRef.current.value = '';
    }
  }

  const hasReceipt = !!currentReceiptUrl;

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        aria-label={hasReceipt ? 'צפה / החלף קבלה' : 'הוסף קבלה'}
        title={hasReceipt ? 'צפה / החלף קבלה' : 'הוסף קבלה'}
        style={{
          width: 28, height: 28, borderRadius: 8, border: 'none',
          background: 'transparent',
          color: hasReceipt ? LIFEOS_COLORS.primary : '#9CA3AF',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        <Paperclip size={iconSize} />
      </button>

      <Dialog open={showPicker} onOpenChange={(open) => {
        if (!uploading) setShowPicker(open);
      }}>
        <DialogContent
          dir="rtl"
          className="max-w-sm"
          onPointerDownOutside={(e) => { if (uploading) e.preventDefault(); }}
          onEscapeKeyDown={(e) => { if (uploading) e.preventDefault(); }}
        >
          <DialogHeader>
            <DialogTitle style={{ fontSize: 16, fontWeight: 800, textAlign: 'right' }}>
              {hasReceipt ? 'קבלה' : 'הוסף קבלה'}
            </DialogTitle>
          </DialogHeader>

          {hasReceipt && (
            <div style={{
              border: `1px solid ${LIFEOS_COLORS.border}`,
              borderRadius: 10, padding: 6, marginBottom: 8,
            }}>
              <img
                src={currentReceiptUrl}
                alt="קבלה"
                style={{
                  width: '100%', maxHeight: 280,
                  objectFit: 'contain', borderRadius: 6, display: 'block',
                }}
              />
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }} dir="rtl">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              disabled={uploading}
              style={pickerBtn(uploading)}
            >
              <span style={{ fontSize: 16, lineHeight: 1 }}>📷</span>
              <span>צלם</span>
            </button>
            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              disabled={uploading}
              style={pickerBtn(uploading)}
            >
              <span style={{ fontSize: 16, lineHeight: 1 }}>🖼️</span>
              <span>גלריה</span>
            </button>
          </div>

          {uploading && (
            <div style={{
              marginTop: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: 10, borderRadius: 8,
              background: '#FFF8F3', color: LIFEOS_COLORS.primary,
              fontSize: 13, fontWeight: 700, direction: 'rtl',
            }}>
              <Loader2 size={14} className="animate-spin" />
              <span>מעלה את הקבלה...</span>
            </div>
          )}

          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => handleFile(e.target.files?.[0])}
            style={{ display: 'none' }}
          />
          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            onChange={(e) => handleFile(e.target.files?.[0])}
            style={{ display: 'none' }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function pickerBtn(disabled) {
  return {
    flex: 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '10px 12px',
    borderRadius: 10,
    border: `1px dashed ${LIFEOS_COLORS.primary}`,
    backgroundColor: '#FFF8F3', color: LIFEOS_COLORS.primary,
    fontSize: 13, fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    fontFamily: 'inherit',
  };
}
