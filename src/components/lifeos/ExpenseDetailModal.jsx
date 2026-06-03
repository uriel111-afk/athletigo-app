import React, { useState, useRef } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabaseClient';
import { compressImage } from '@/lib/imageCompression';
import { Camera, Image as ImageIcon, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { pushDebugLog } from '@/lib/debugLog';

const CATEGORY_LABELS = {
  housing:       'דיור 🏠',
  bills:         'חשבונות 💡',
  transport:     'תחבורה 🚗',
  insurance:     'ביטוחים 🛡️',
  food:          'אוכל 🍔',
  subscriptions: 'מנויים 📺',
  taxes:         'מיסים 💰',
  electronics:   'אלקטרוניקה 📱',
  cleaning:      'ניקיון 🧽',
  business:      'עסקי 💼',
  other:         'אחר 📦',
};

const PAYMENT_LABELS = {
  credit: 'אשראי',
  cash: 'מזומן',
  bank_transfer: 'העברה',
  check: "צ'ק",
  bit: 'ביט',
  paybox: 'פייבוקס',
};

export default function ExpenseDetailModal({
  expense,
  isOpen,
  onClose,
  onUpdated,
  onDelete,
  userId,
}) {
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  if (!expense) return null;

  async function handleFileSelect(file) {
    if (!file) return;
    setUploading(true);
    pushDebugLog('ExpenseDetailModal', 'upload-start', {
      expenseId: expense.id,
      fileSize: file.size,
      fileType: file.type,
    });

    try {
      const compressed = await compressImage(file);
      pushDebugLog('ExpenseDetailModal', 'compress-done', {
        compressedSize: compressed.size,
      });

      const path = `${userId}/expense-receipt-${expense.id}-${Date.now()}.jpg`;

      const { error: uploadErr } = await supabase.storage
        .from('lifeos-files')
        .upload(path, compressed, {
          contentType: 'image/jpeg',
          upsert: false,
        });

      if (uploadErr) {
        pushDebugLog('ExpenseDetailModal', 'upload-error', { message: uploadErr.message });
        toast.error('העלאת התמונה נכשלה');
        return;
      }

      const { data: urlData } = supabase.storage
        .from('lifeos-files')
        .getPublicUrl(path);

      const { error: updateErr } = await supabase
        .from('expenses')
        .update({ receipt_url: urlData.publicUrl })
        .eq('id', expense.id);

      if (updateErr) {
        pushDebugLog('ExpenseDetailModal', 'db-update-error', { message: updateErr.message });
        toast.error('שמירת הקבלה נכשלה');
        return;
      }

      // Fetch the single updated row directly from the DB so the
      // modal can refresh its own view immediately. Refetching the
      // whole list and looking up by id is a stale-closure trap:
      // `load()` is async, and any local `expenses.find(...)` runs
      // before the new data has landed in state. A targeted SELECT
      // returns the authoritative row including the new receipt_url.
      pushDebugLog('ExpenseDetailModal', 'fetch-updated-expense-start', {
        expenseId: expense.id,
      });
      const { data: updatedExpense, error: fetchErr } = await supabase
        .from('expenses')
        .select('*')
        .eq('id', expense.id)
        .single();
      if (fetchErr) {
        pushDebugLog('ExpenseDetailModal', 'fetch-updated-expense-error', {
          message: fetchErr.message,
        });
      } else {
        pushDebugLog('ExpenseDetailModal', 'fetch-updated-expense-success', {
          hasReceiptUrl: !!updatedExpense?.receipt_url,
        });
      }

      pushDebugLog('ExpenseDetailModal', 'upload-success', {
        receiptUrl: urlData.publicUrl,
      });
      toast.success('הקבלה נשמרה ✓');
      setShowPicker(false);
      pushDebugLog('ExpenseDetailModal', 'modal-refreshed-with-new-data', {
        receiptUrl: updatedExpense?.receipt_url || null,
      });
      onUpdated?.(updatedExpense || null);
    } catch (err) {
      pushDebugLog('ExpenseDetailModal', 'upload-exception', {
        message: err?.message || String(err),
      });
      toast.error('שגיאה: ' + (err?.message || 'שגיאה לא ידועה'));
    } finally {
      setUploading(false);
      if (cameraRef.current) cameraRef.current.value = '';
      if (galleryRef.current) galleryRef.current.value = '';
    }
  }

  async function handleRemoveReceipt() {
    if (!confirm('להסיר את הקבלה?')) return;
    const { error } = await supabase
      .from('expenses')
      .update({ receipt_url: null })
      .eq('id', expense.id);
    if (error) {
      toast.error('שגיאה בהסרת הקבלה');
      return;
    }
    // Same targeted-SELECT pattern as the upload path — keep the
    // modal authoritative without relying on a list-refetch race.
    const { data: updatedExpense } = await supabase
      .from('expenses')
      .select('*')
      .eq('id', expense.id)
      .single();
    toast.success('הקבלה הוסרה');
    onUpdated?.(updatedExpense || null);
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose?.(); }}>
      <DialogContent
        className="max-w-md max-h-[90vh] overflow-y-auto"
        dir="rtl"
        onPointerDownOutside={(e) => { if (uploading) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (uploading) e.preventDefault(); }}
      >
        <div className="space-y-4">
          <div className="flex items-baseline justify-between border-b border-orange-100 pb-3">
            <div className="text-3xl font-bold text-orange-600">
              ₪{Number(expense.amount || 0).toLocaleString('he-IL')}
            </div>
            <div className="text-sm text-gray-500">
              {expense.date ? new Date(expense.date).toLocaleDateString('he-IL') : ''}
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">קטגוריה</span>
              <span>{CATEGORY_LABELS[expense.category] || expense.category || '—'}</span>
            </div>
            {expense.subcategory && (
              <div className="flex justify-between">
                <span className="text-gray-500">תת-קטגוריה</span>
                <span>{expense.subcategory}</span>
              </div>
            )}
            {expense.description && (
              <div className="flex justify-between">
                <span className="text-gray-500">תיאור</span>
                <span className="text-right">{expense.description}</span>
              </div>
            )}
            {expense.payment_method && (
              <div className="flex justify-between">
                <span className="text-gray-500">תשלום</span>
                <span>{PAYMENT_LABELS[expense.payment_method] || expense.payment_method}</span>
              </div>
            )}
            {expense.notes && (
              <div>
                <div className="text-gray-500 mb-1">הערות</div>
                <div className="bg-gray-50 p-2 rounded text-gray-700 whitespace-pre-wrap">{expense.notes}</div>
              </div>
            )}
          </div>

          <div className="border-t border-orange-100 pt-3">
            <div className="font-medium mb-2">קבלה</div>

            {expense.receipt_url ? (
              <div>
                <a href={expense.receipt_url} target="_blank" rel="noopener noreferrer">
                  <img
                    src={expense.receipt_url}
                    alt="קבלה"
                    className="w-full rounded-lg border border-gray-200 cursor-pointer"
                  />
                </a>
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => setShowPicker(true)}
                    disabled={uploading}
                    className="flex-1 text-sm py-2 px-3 border border-orange-300 text-orange-600 rounded-lg"
                  >
                    החלף קבלה
                  </button>
                  <button
                    type="button"
                    onClick={handleRemoveReceipt}
                    disabled={uploading}
                    className="text-sm py-2 px-3 border border-red-300 text-red-600 rounded-lg"
                  >
                    הסר
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowPicker(true)}
                className="w-full py-3 border-2 border-dashed border-orange-300 text-orange-600 rounded-lg flex items-center justify-center gap-2"
              >
                <Camera size={20} />
                הוסף קבלה
              </button>
            )}
          </div>

          <div className="flex gap-2 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={() => onDelete?.(expense.id)}
              className="flex-1 py-2 border border-red-300 text-red-600 rounded-lg flex items-center justify-center gap-1"
            >
              <Trash2 size={16} />
              מחק
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 bg-orange-500 text-white rounded-lg"
            >
              סגור
            </button>
          </div>
        </div>

        {showPicker && (
          <div
            className="fixed inset-0 bg-black/50 flex items-end justify-center z-50"
            onClick={() => !uploading && setShowPicker(false)}
          >
            <div
              className="bg-white rounded-t-2xl w-full max-w-md p-4 space-y-2"
              onClick={(e) => e.stopPropagation()}
              dir="rtl"
            >
              <div className="text-center font-medium mb-3">בחר מקור תמונה</div>
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                disabled={uploading}
                className="w-full py-3 bg-orange-500 text-white rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Camera size={20} />
                צלם תמונה
              </button>
              <button
                type="button"
                onClick={() => galleryRef.current?.click()}
                disabled={uploading}
                className="w-full py-3 border border-orange-300 text-orange-600 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <ImageIcon size={20} />
                בחר מהגלריה
              </button>
              <button
                type="button"
                onClick={() => setShowPicker(false)}
                disabled={uploading}
                className="w-full py-2 text-gray-500"
              >
                ביטול
              </button>
              {uploading && (
                <div className="text-center text-sm text-orange-600">
                  מעלה תמונה...
                </div>
              )}
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={(e) => handleFileSelect(e.target.files?.[0])}
              />
              <input
                ref={galleryRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => handleFileSelect(e.target.files?.[0])}
              />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
