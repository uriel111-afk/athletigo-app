import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';

// Minimal "coach note about this trainee" dialog. Writes to the
// existing users.additional_notes column — no new schema. Reused by
// the group hub member action sheet, but designed so any future
// quick-note entry point can mount the same dialog with the same
// props (traineeId + currentNote → textarea → save).
//
// Cache invalidation matches the keys other AllUsers / Dashboard
// flows fire when they mutate users — without specific knowledge of
// every shared key, broad prefix invalidation keeps the surfaces in
// sync without a manual refresh.
export default function TraineeNoteDialog({
  isOpen,
  onClose,
  traineeId,
  traineeName,
  currentNote = '',
}) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState(currentNote || '');

  // Reset the local draft each time the dialog opens for a new
  // trainee — without this, switching from member A to member B
  // would keep A's typed text on B's textarea.
  useEffect(() => {
    if (!isOpen) return;
    setNote(currentNote || '');
  }, [isOpen, traineeId, currentNote]);

  const saveMutation = useMutation({
    mutationFn: async (nextNote) => {
      if (!traineeId) throw new Error('חסר מתאמן');
      return base44.entities.User.update(traineeId, {
        additional_notes: nextNote == null ? null : String(nextNote),
      });
    },
    onSuccess: () => {
      // Match the keys other user-mutating flows touch so the trainee's
      // profile, the coach lists, and any cached client stats reflect
      // the new note without a manual refresh.
      queryClient.invalidateQueries({ queryKey: ['all-trainees'] });
      queryClient.invalidateQueries({ queryKey: ['users-list'] });
      queryClient.invalidateQueries({ queryKey: ['trainee', traineeId] });
      toast.success('✅ ההערה נשמרה');
      onClose && onClose();
    },
    onError: (err) => {
      console.error('[TraineeNoteDialog] save failed:', err);
      toast.error('❌ שגיאה בשמירה: ' + (err?.message || 'נסה שוב'));
    },
  });

  return (
    <Dialog
      open={!!isOpen}
      onOpenChange={(o) => { if (!o && !saveMutation.isPending) onClose && onClose(); }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>הערה על {traineeName || 'מתאמן'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4" dir="rtl">
          <div>
            <Label className="text-xs font-bold text-gray-600 mb-1 block">
              הערה (נשמרת בפרטי המתאמן)
            </Label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="כתוב כאן הערה אישית על המתאמן…"
              disabled={saveMutation.isPending}
              rows={6}
              style={{
                width: '100%', padding: '12px 14px',
                borderRadius: 12,
                border: '1.5px solid #F0E4D0',
                fontSize: 14, direction: 'rtl',
                background: saveMutation.isPending ? '#F5F5F5' : 'white',
                outline: 'none', boxSizing: 'border-box',
                fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
                resize: 'vertical', minHeight: 120,
              }}
            />
            <div style={{ fontSize: 11, color: '#888', marginTop: 6 }}>
              נשמרת ב-`additional_notes` של המתאמן — נראית גם בפרופיל.
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              type="button"
              variant="outline"
              onClick={() => { if (!saveMutation.isPending) onClose && onClose(); }}
              disabled={saveMutation.isPending}
              className="flex-1 font-bold rounded-xl min-h-[44px]"
            >
              ביטול
            </Button>
            <Button
              type="button"
              onClick={() => saveMutation.mutate(note.trim() || null)}
              disabled={saveMutation.isPending}
              className="flex-1 font-bold text-white rounded-xl min-h-[44px]"
              style={{ backgroundColor: '#FF6F20' }}
            >
              {saveMutation.isPending
                ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" />שומר…</>
                : 'שמור הערה'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
