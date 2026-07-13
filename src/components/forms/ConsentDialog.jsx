import React, { useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import ConsentSection from '@/components/forms/ConsentSection';
import { saveConsents } from '@/lib/legalConsent';

// One-time consent prompt for returning trainees who never saw the
// onboarding consent section. Same two checkboxes; the required
// terms+privacy (and, for minors, the guardian signature) gate the save.
export default function ConsentDialog({
  open, onClose, traineeId, coachId, isMinor = false, onSaved,
}) {
  const [state, setState] = useState(null);
  const [saving, setSaving] = useState(false);
  const valid = !!state?.valid;

  const handleSave = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await saveConsents(traineeId, coachId, {
        termsPrivacyAccepted: state.termsPrivacyAccepted,
        photoAllowed: state.photoAllowed,
        isMinor,
        signerName: state.signerName,
        signerRelation: state.signerRelation,
        signatureData: state.signatureData,
      });
      toast.success('ההסכמות נשמרו');
      onSaved?.();
      onClose?.();
    } catch (e) {
      console.error('[ConsentDialog] save failed:', e);
      toast.error('שמירה נכשלה: ' + (e?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) onClose?.(); }}>
      <DialogContent className="max-w-md p-4" dir="rtl" onInteractOutside={(e) => e.preventDefault()}>
        <DialogTitle style={{ fontSize: 18, fontWeight: 800, textAlign: 'center' }}>אישור מסמכים והסכמות</DialogTitle>
        <DialogDescription className="sr-only">אישור תנאי שימוש, מדיניות פרטיות והסכמת צילום</DialogDescription>
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <ConsentSection isMinor={isMinor} onChange={setState} />
          <button
            type="button"
            onClick={handleSave}
            disabled={!valid || saving}
            style={{
              width: '100%', padding: '14px 16px', borderRadius: 12, border: 'none',
              background: valid ? 'var(--ag-accent)' : '#E5E7EB',
              color: valid ? '#FFFFFF' : '#9CA3AF',
              fontSize: 16, fontWeight: 800, cursor: valid ? 'pointer' : 'not-allowed',
            }}
          >
            {saving
              ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Loader2 size={16} className="animate-spin" /> שומר…</span>
              : 'שמירה ואישור'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
