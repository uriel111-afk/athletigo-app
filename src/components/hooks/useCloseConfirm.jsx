import { useState, useCallback } from "react";

/**
 * Hook for confirming dialog close when form has unsaved changes.
 *
 * Usage:
 *   const { confirmClose, ConfirmDialog } = useCloseConfirm(hasChanges, onActualClose);
 *   <Dialog onOpenChange={(open) => { if (!open) confirmClose(); }}>
 *     ...
 *     {ConfirmDialog}
 *   </Dialog>
 */
export function useCloseConfirm(hasChanges, onConfirmedClose) {
  const [showConfirm, setShowConfirm] = useState(false);

  const confirmClose = useCallback(() => {
    if (hasChanges) {
      setShowConfirm(true);
    } else {
      onConfirmedClose();
    }
  }, [hasChanges, onConfirmedClose]);

  const handleConfirm = useCallback(() => {
    setShowConfirm(false);
    onConfirmedClose();
  }, [onConfirmedClose]);

  const handleCancel = useCallback(() => {
    setShowConfirm(false);
  }, []);

  // Inline confirm overlay
  const ConfirmDialog = showConfirm ? (
    <div className="absolute inset-0 z-50 bg-black/40 flex items-center justify-center rounded-xl" dir="rtl">
      <div className="bg-white rounded-xl p-5 mx-4 shadow-xl max-w-sm w-full space-y-3">
        <h3 className="text-base font-bold text-gray-900 text-right">סגירת טופס</h3>
        <p className="text-sm text-gray-600 text-right">הנתונים שהזנת יאבדו. האם לסגור?</p>
        <div className="flex gap-2">
          <button onClick={handleCancel}
            className="flex-1 py-2 rounded-lg border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50">
            חזרה לטופס
          </button>
          <button onClick={handleConfirm}
            className="flex-1 py-2 rounded-lg bg-red-500 text-white text-sm font-bold hover:bg-red-600">
            כן, סגור
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirmClose, ConfirmDialog };
}
