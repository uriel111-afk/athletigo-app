import React, { useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import SignatureCanvas from '@/components/SignatureCanvas';

export default function SignPendingAgreementDialog({ open, onClose, doc }) {
  const sigRef = useRef(null);
  const [confirmRead, setConfirmRead] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!doc) return null;

  const renderedBody = doc.document_data?.body_rendered || '';

  async function handleSign() {
    if (!confirmRead) { toast.error('יש לאשר שקראת והבנת'); return; }
    if (!sigRef.current?.hasSignature()) { toast.error('יש לחתום לפני שליחה'); return; }
    const sig = sigRef.current.getSignature();
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('signed_documents')
        .update({
          signature_data: sig,
          signed_at: now,
          status: 'signed',
          is_locked: true,
        })
        .eq('id', doc.id);
      if (error) {
        console.error('[SignPending] update error:', error);
        toast.error('השמירה נכשלה: ' + (error.message || ''));
        return;
      }
      window.dispatchEvent(new CustomEvent('signed-documents-changed', { detail: { traineeId: doc.trainee_id } }));
      toast.success('ההסכם נחתם ונשמר');
      onClose();
    } catch (e) {
      console.error('[SignPending] exception:', e);
      toast.error('שגיאה בלתי צפויה');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="max-w-2xl" onInteractOutside={(e) => { if (saving) e.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle style={{ color: '#1a1a1a', fontWeight: 700, fontSize: 16 }}>
            חתימה על הסכם
          </DialogTitle>
        </DialogHeader>

        <div dir="rtl" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <div style={{
            background: '#FFF9F0', border: '1px solid #FF6F20', borderRadius: 10,
            padding: 12, marginBottom: 12, color: '#1a1a1a', fontWeight: 600, fontSize: 14,
          }}>
            עיין/י בהסכם, סמן/י שקראת והבנת, וחתום/י למטה.
          </div>

          <div style={{
            whiteSpace: 'pre-wrap', background: '#FFFFFF',
            border: '1px solid #FFE5D0', borderRadius: 8, padding: 14,
            maxHeight: '40vh', overflow: 'auto',
            color: '#1a1a1a', lineHeight: 1.7, fontSize: 13, marginBottom: 12,
          }}>
            {renderedBody || '(תוכן ההסכם לא נמצא)'}
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={confirmRead} onChange={e => setConfirmRead(e.target.checked)}
              style={{ accentColor: '#FF6F20', width: 18, height: 18 }} />
            <span style={{ color: '#1a1a1a', fontSize: 14 }}>קראתי והבנתי את ההסכם</span>
          </label>

          <div style={{ marginBottom: 4 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#1a1a1a', marginBottom: 6 }}>
              חתימה דיגיטלית
            </label>
            <SignatureCanvas ref={sigRef} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12, direction: 'rtl' }}>
          <Button variant="outline" onClick={() => onClose()} disabled={saving}
            style={{ flex: 1, borderColor: '#FFE5D0', color: '#6b7280' }}>
            ביטול
          </Button>
          <Button onClick={handleSign} disabled={saving || !confirmRead}
            style={{ flex: 1, background: (saving || !confirmRead) ? '#D1D5DB' : '#FF6F20', color: '#FFFFFF' }}>
            {saving ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" />שומר...</> : 'אשר וחתום'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
