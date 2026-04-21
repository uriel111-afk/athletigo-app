import React, { useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import SignatureCanvas from '@/components/SignatureCanvas';
import { renderTemplateBody } from '@/lib/documentTemplates';

// Brand tokens — match HealthDeclarationForm + AgreementFlowDialog
const COLORS = {
  bg: '#FFF9F0', card: '#FFFFFF', cardBorder: '#FFE5D0',
  accent: '#FF6F20', text: '#1a1a1a', textMuted: '#6b7280',
};
const sectionHeader = (text) => (
  <h4 style={{ color: COLORS.accent, fontWeight: 700, fontSize: 17, margin: '20px 0 10px' }}>🔹 {text}</h4>
);
const cardStyle = {
  background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`,
  borderRight: `3px solid ${COLORS.accent}`, borderRadius: 10,
  padding: '14px 16px', marginBottom: 12,
};
const highlightedCardStyle = {
  background: COLORS.bg, border: `2px solid ${COLORS.accent}`, borderRadius: 10,
  padding: '14px 16px', marginBottom: 12,
};
const bodyTextBoxStyle = {
  background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`, borderRadius: 10,
  padding: 16, whiteSpace: 'pre-wrap', color: COLORS.text, lineHeight: 1.75,
  fontSize: 14, maxHeight: '40vh', overflowY: 'auto',
};
const labelStyle = { display: 'block', fontSize: 13, fontWeight: 700, color: COLORS.text, marginBottom: 6 };
const primaryBtnStyle = {
  background: COLORS.accent, color: COLORS.card, border: 'none', borderRadius: 10,
  padding: 14, fontWeight: 700, fontSize: 15, cursor: 'pointer', width: '100%',
};
const secondaryBtnStyle = {
  background: COLORS.card, color: COLORS.accent, border: `1px solid ${COLORS.accent}`,
  borderRadius: 10, padding: 14, fontWeight: 700, fontSize: 15, cursor: 'pointer', width: '100%',
};
const radioRowStyle = (checked) => ({
  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px',
  borderRadius: 8, cursor: 'pointer',
  background: checked ? COLORS.bg : 'transparent',
  border: checked ? `1px solid ${COLORS.accent}` : '1px solid transparent',
  marginBottom: 6,
});

export default function SignPendingAgreementDialog({ open, onClose, doc, isCoachView = false }) {
  const sigRef = useRef(null);
  // Default to 'deferred' — consent optional at signing time.
  const [photoConsent, setPhotoConsent] = useState('deferred');
  const [readAndUnderstood, setReadAndUnderstood] = useState(false);
  const [saving, setSaving] = useState(false);
  const today = new Date().toLocaleDateString('he-IL');

  // Reset transient state every time the dialog opens with a new doc
  React.useEffect(() => {
    if (open) {
      setPhotoConsent('deferred');
      setReadAndUnderstood(false);
    }
  }, [open, doc?.id]);

  if (!doc) return null;

  // Re-render body live with the trainee's choice so they see the final
  // consent line as they pick it. Build the object-shape consent so the
  // saved document_data carries decided_at + (later) upgraded_at.
  const previousFieldValues = doc.document_data?.field_values || {};
  const photoConsentObj = {
    status: photoConsent,
    decided_at: new Date().toISOString(),
    upgraded_at: null,
  };
  const mergedValues = { ...previousFieldValues, photo_consent: photoConsentObj };
  const renderedBody = useMemo(
    () => renderTemplateBody(doc.document_type, mergedValues, {
      trainee_name: doc.document_data?.trainee_name || '',
      signed_date: today,
    }),
    [doc.document_type, mergedValues, doc.document_data?.trainee_name, today], // eslint-disable-line react-hooks/exhaustive-deps
  );

  async function handleSign() {
    if (!readAndUnderstood) { toast.error('יש לאשר שקראת והבנת'); return; }
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
          document_data: {
            ...(doc.document_data || {}),
            field_values: mergedValues,
            body_rendered: renderedBody,
          },
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
          <DialogTitle style={{ color: COLORS.text, fontWeight: 700, fontSize: 16 }}>
            חתימה על ההסכם
          </DialogTitle>
        </DialogHeader>

        <div dir="rtl" style={{ background: COLORS.bg, padding: 4, maxHeight: '70vh', overflowY: 'auto' }}>
          {isCoachView && (
            <div style={{
              background: COLORS.bg, border: `2px solid ${COLORS.accent}`, borderRadius: 10,
              padding: 12, marginBottom: 12, color: COLORS.text, fontWeight: 600, fontSize: 14, textAlign: 'center',
            }}>
              מסור המכשיר למתאמן לחתימה
            </div>
          )}

          {/* Section 1 — Contract text */}
          {sectionHeader('נוסח ההסכם')}
          <div style={bodyTextBoxStyle}>{renderedBody || '(תוכן ההסכם לא נמצא)'}</div>

          {/* Section 2 — Photo consent (optional, 3 choices, default deferred) */}
          <div style={highlightedCardStyle}>
            <div style={{ color: COLORS.accent, fontWeight: 700, fontSize: 15, marginBottom: 10 }}>
              🔹 שימוש בצילומים לצרכי שיווק (לא חובה)
            </div>
            <div style={{ color: COLORS.text, fontSize: 14, marginBottom: 12, lineHeight: 1.6 }}>
              ניתן לאשר כעת, לסרב, או להחליט בהמשך.
              ניתן לשדרג מ"לא מאשר/ת" ל"מאשר/ת" בכל שלב מאוחר יותר.
            </div>
            <label style={radioRowStyle(photoConsent === 'allowed')}>
              <input type="radio" name="photo_consent_pending" checked={photoConsent === 'allowed'}
                onChange={() => setPhotoConsent('allowed')}
                style={{ accentColor: COLORS.accent, transform: 'scale(1.2)' }} />
              <span style={{ color: COLORS.text, fontSize: 14 }}>מאשר/ת שימוש בצילומים ותכנים לצרכי שיווק</span>
            </label>
            <label style={radioRowStyle(photoConsent === 'denied')}>
              <input type="radio" name="photo_consent_pending" checked={photoConsent === 'denied'}
                onChange={() => setPhotoConsent('denied')}
                style={{ accentColor: COLORS.accent, transform: 'scale(1.2)' }} />
              <span style={{ color: COLORS.text, fontSize: 14 }}>לא מאשר/ת כעת</span>
            </label>
            <label style={radioRowStyle(photoConsent === 'deferred')}>
              <input type="radio" name="photo_consent_pending" checked={photoConsent === 'deferred'}
                onChange={() => setPhotoConsent('deferred')}
                style={{ accentColor: COLORS.accent, transform: 'scale(1.2)' }} />
              <span style={{ color: COLORS.text, fontSize: 14 }}>אחליט בהמשך</span>
            </label>
          </div>

          {/* Section 3 — Final confirmation */}
          {sectionHeader('אישור סופי')}
          <div style={cardStyle}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '6px 4px' }}>
              <input type="checkbox" checked={readAndUnderstood}
                onChange={(e) => setReadAndUnderstood(e.target.checked)}
                style={{ accentColor: COLORS.accent, transform: 'scale(1.2)' }} />
              <span style={{ color: COLORS.text, fontSize: 14 }}>קראתי והבנתי את ההסכם ואת תנאיו</span>
            </label>

            <div style={{ marginTop: 12, fontSize: 13, color: COLORS.textMuted }}>
              תאריך: <strong style={{ color: COLORS.text }}>{today}</strong>
            </div>

            <div style={{ marginTop: 10 }}>
              <label style={labelStyle}>חתימה</label>
              <SignatureCanvas ref={sigRef} />
              <button type="button"
                onClick={() => sigRef.current?.clear?.()}
                style={{
                  marginTop: 6, background: 'transparent', border: 'none', padding: 0,
                  color: COLORS.accent, fontSize: 13, cursor: 'pointer', textDecoration: 'underline',
                }}>
                נקה חתימה
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12, direction: 'rtl' }}>
          <button onClick={() => onClose()} disabled={saving} style={{ ...secondaryBtnStyle, flex: 1 }}>
            ביטול
          </button>
          <button onClick={handleSign} disabled={saving || !readAndUnderstood}
            style={{ ...primaryBtnStyle, flex: 1, background: (saving || !readAndUnderstood) ? '#D1D5DB' : COLORS.accent }}>
            {saving ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" />שומר...</> : 'אשר וחתום'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
