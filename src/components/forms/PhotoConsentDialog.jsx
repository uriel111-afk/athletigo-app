import React from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import PhotoConsentStep from '@/components/forms/PhotoConsentStep';

// Thin dialog wrapper around PhotoConsentStep — used for returning
// trainees (one-time prompt on TraineeHome) and for editing/revoking
// consent from the gallery settings card. Onboarding uses PhotoConsentStep
// inline (not this dialog).
export default function PhotoConsentDialog({
  open, onClose, traineeId, coachId, isMinor = false, childName = '',
  initial = null, source = 'dialog', onSaved,
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DialogContent className="max-w-md p-4" dir="rtl">
        <DialogTitle className="sr-only">הסכמות צילום</DialogTitle>
        <DialogDescription className="sr-only">אישור תיעוד ושימוש בצילומים</DialogDescription>
        <PhotoConsentStep
          traineeId={traineeId}
          coachId={coachId}
          isMinor={isMinor}
          childName={childName}
          initial={initial}
          source={source}
          onSaved={(consent) => { onSaved?.(consent); onClose?.(); }}
        />
      </DialogContent>
    </Dialog>
  );
}
