import React, { useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import SignatureCanvas from '@/components/SignatureCanvas';
import { useFormDraft } from '@/hooks/useFormDraft';
import { useKeepScreenAwake } from '@/hooks/useKeepScreenAwake';
import DraftPrompt from '@/components/DraftPrompt';
import { DOCUMENT_TEMPLATES, renderTemplateBody } from '@/lib/documentTemplates';

// ── Brand tokens (match HealthDeclarationForm) ────────────────────────
const COLORS = {
  bg: '#FFF9F0',
  card: '#FFFFFF',
  cardBorder: '#FFE5D0',
  accent: '#FF6F20',
  text: '#1a1a1a',
  textMuted: '#6b7280',
};

const containerStyle = { background: COLORS.bg, color: COLORS.text, fontFamily: 'inherit', lineHeight: 1.7 };
const sectionHeader = (text) => (
  <h4 style={{ color: COLORS.accent, fontWeight: 700, fontSize: 17, margin: '20px 0 10px' }}>🔹 {text}</h4>
);
const cardStyle = {
  background: COLORS.card,
  border: `1px solid ${COLORS.cardBorder}`,
  borderRight: `3px solid ${COLORS.accent}`,
  borderRadius: 10,
  padding: '14px 16px',
  marginBottom: 12,
};
const highlightedCardStyle = {
  background: COLORS.bg,
  border: `2px solid ${COLORS.accent}`,
  borderRadius: 10,
  padding: '14px 16px',
  marginBottom: 12,
};
const bodyTextBoxStyle = {
  background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`, borderRadius: 10,
  padding: 16, whiteSpace: 'pre-wrap', color: COLORS.text, lineHeight: 1.75,
  fontSize: 14, maxHeight: '55vh', overflowY: 'auto',
};
const inputStyle = {
  width: '100%', padding: 10, borderRadius: 8, border: `1px solid ${COLORS.cardBorder}`,
  background: COLORS.card, color: COLORS.text, fontSize: 14, boxSizing: 'border-box',
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

function FieldInput({ field, value, onChange }) {
  if (field.type === 'textarea') {
    return (
      <textarea value={value ?? ''} onChange={e => onChange(e.target.value)}
        placeholder={field.placeholder || ''} rows={3}
        style={{ ...inputStyle, resize: 'vertical', minHeight: 70 }} />
    );
  }
  if (field.type === 'select') {
    return (
      <select value={value ?? ''} onChange={e => onChange(e.target.value)} style={inputStyle}>
        <option value="">— בחר —</option>
        {field.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
  if (field.type === 'radio') {
    return (
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {field.options.map(o => {
          const active = value === o.value;
          return (
            <button key={o.value} type="button" onClick={() => onChange(o.value)}
              style={{
                padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                border: active ? `1px solid ${COLORS.accent}` : `1px solid ${COLORS.cardBorder}`,
                background: active ? COLORS.bg : COLORS.card,
                color: active ? COLORS.accent : COLORS.textMuted,
                cursor: 'pointer',
              }}>
              {o.label}
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <input type={field.type || 'text'}
      value={value ?? ''} onChange={e => onChange(e.target.value)}
      placeholder={field.placeholder || ''} style={inputStyle} />
  );
}

function buildInitial(template) {
  const o = {};
  for (const f of (template.fields || [])) o[f.key] = f.default ?? '';
  return o;
}

function isFieldFilled(field, value) {
  if (!field.required) return true;
  if (value === null || value === undefined) return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  return true;
}

export default function AgreementFlowDialog({
  open, onClose, templateKey, traineeId, traineeName, coachId,
}) {
  const queryClient = useQueryClient();
  const template = DOCUMENT_TEMPLATES[templateKey];
  const initialData = useMemo(() => template ? buildInitial(template) : {}, [templateKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const {
    data: fieldValues, setData: setFieldValues,
    hasDraft, keepDraft, discardDraft, clearDraft,
  } = useFormDraft(`AgreementFlow_${templateKey}`, traineeId, open, initialData);

  useKeepScreenAwake(open);

  // Two steps only: 'fields' (coach inputs) → 'sign' (single unified sign screen).
  // The old 'preview' step was merged into 'sign' — the contract text, photo
  // consent, read checkbox, signature and both submit buttons all live there now.
  const [step, setStep] = useState('fields');
  // Default to 'deferred' — consent is now optional at signing time.
  const [photoConsent, setPhotoConsent] = useState('deferred');
  const [readAndUnderstood, setReadAndUnderstood] = useState(false);
  const [saving, setSaving] = useState(false);
  const sigRef = useRef(null);
  const today = new Date().toLocaleDateString('he-IL');

  // Reset wizard state when dialog opens
  React.useEffect(() => {
    if (open) {
      setStep('fields');
      setPhotoConsent('deferred');
      setReadAndUnderstood(false);
    }
  }, [open]);

  if (!template) return null;

  // Coach-side preview body (photo_consent placeholder stays empty)
  const previewBody = renderTemplateBody(templateKey, fieldValues, {
    trainee_name: traineeName || '',
    signed_date: today,
  });

  // At sign time, build the object-shape consent so the body shows the
  // chosen status with the decided_at date inline.
  const photoConsentObj = {
    status: photoConsent,
    decided_at: new Date().toISOString(),
    upgraded_at: null,
  };
  const mergedValues = { ...fieldValues, photo_consent: photoConsentObj };
  const signBody = renderTemplateBody(templateKey, mergedValues, {
    trainee_name: traineeName || '',
    signed_date: today,
  });

  const allRequiredFilled = (template.fields || []).every(f => isFieldFilled(f, fieldValues[f.key]));
  // Consent no longer gates submit — only the read-confirm + signature do.
  const canSign = readAndUnderstood;

  async function saveAgreement({ asSigned, signatureDataUrl }) {
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const valuesForSave = asSigned ? mergedValues : fieldValues;
      const bodyForSave = asSigned ? signBody : previewBody;
      const { error } = await supabase.from('signed_documents').insert({
        trainee_id: traineeId,
        coach_id: coachId ?? null,
        document_type: templateKey,
        document_data: {
          template_key: templateKey,
          field_values: valuesForSave,
          body_rendered: bodyForSave,
          trainee_name: traineeName,
          sent_at: now,
        },
        signature_data: asSigned ? signatureDataUrl : null,
        signed_at: asSigned ? now : null,
        status: asSigned ? 'signed' : 'pending',
        is_locked: !!asSigned,
      });
      if (error) {
        console.error('[AgreementFlow] save error:', error);
        toast.error('השמירה נכשלה: ' + (error.message || ''));
        return false;
      }
      clearDraft();
      window.dispatchEvent(new CustomEvent('signed-documents-changed', { detail: { traineeId } }));
      queryClient.invalidateQueries({ queryKey: ['signed-documents', traineeId] });
      return true;
    } catch (e) {
      console.error('[AgreementFlow] exception:', e);
      toast.error('שגיאה בלתי צפויה');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleSendForSignature() {
    const ok = await saveAgreement({ asSigned: false });
    if (ok) { toast.success('ההסכם נשלח לחתימה'); onClose(); }
  }

  async function handleSignNow() {
    if (!readAndUnderstood) { toast.error('יש לאשר שקראת והבנת'); return; }
    if (!sigRef.current?.hasSignature()) { toast.error('יש לחתום לפני שליחה'); return; }
    const sig = sigRef.current.getSignature();
    const ok = await saveAgreement({ asSigned: true, signatureDataUrl: sig });
    if (ok) { toast.success('ההסכם נחתם ונשמר'); onClose(); }
  }

  return (
    <>
      {open && hasDraft && step === 'fields' && (
        <DraftPrompt
          formLabel={`טופס הסכם — ${template?.title || ''}`}
          onResume={keepDraft}
          onNew={discardDraft}
          onDiscard={discardDraft}
        />
      )}
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="max-w-2xl" onInteractOutside={(e) => { if (saving) e.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle style={{ color: COLORS.text, fontWeight: 700, fontSize: 16 }}>
            {step === 'fields' ? `פרטי ההתקשרות — ${template.title}` : 'חתימה על ההסכם'}
          </DialogTitle>
        </DialogHeader>

        <div dir="rtl" style={{ ...containerStyle, padding: 4, maxHeight: '70vh', overflowY: 'auto' }}>

          {step === 'fields' && (
            <div style={cardStyle}>
              {(template.fields || []).map(field => (
                <div key={field.key} style={{ marginBottom: 12 }}>
                  <label style={labelStyle}>
                    {field.label}{field.required && <span style={{ color: COLORS.accent }}> *</span>}
                  </label>
                  <FieldInput
                    field={field}
                    value={fieldValues[field.key]}
                    onChange={(v) => setFieldValues(prev => ({ ...prev, [field.key]: v }))}
                  />
                </div>
              ))}
            </div>
          )}

          {step === 'sign' && (
            <div>
              {/* Coach-handover banner — this dialog is opened from coach-only picker */}
              <div style={{
                background: COLORS.bg, border: `2px solid ${COLORS.accent}`, borderRadius: 10,
                padding: 12, marginBottom: 12, color: COLORS.text, fontWeight: 600, fontSize: 14, textAlign: 'center',
              }}>
                מסור המכשיר למתאמן לחתימה
              </div>

              {/* Section 1 — Contract text */}
              {sectionHeader('נוסח ההסכם')}
              <div style={bodyTextBoxStyle}>{signBody}</div>

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
                  <input type="radio" name="photo_consent" checked={photoConsent === 'allowed'}
                    onChange={() => setPhotoConsent('allowed')}
                    style={{ accentColor: COLORS.accent, transform: 'scale(1.2)' }} />
                  <span style={{ color: COLORS.text, fontSize: 14 }}>מאשר/ת שימוש בצילומים ותכנים לצרכי שיווק</span>
                </label>
                <label style={radioRowStyle(photoConsent === 'denied')}>
                  <input type="radio" name="photo_consent" checked={photoConsent === 'denied'}
                    onChange={() => setPhotoConsent('denied')}
                    style={{ accentColor: COLORS.accent, transform: 'scale(1.2)' }} />
                  <span style={{ color: COLORS.text, fontSize: 14 }}>לא מאשר/ת כעת</span>
                </label>
                <label style={radioRowStyle(photoConsent === 'deferred')}>
                  <input type="radio" name="photo_consent" checked={photoConsent === 'deferred'}
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
          )}
        </div>

        {/* Footer / step controls */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', direction: 'rtl' }}>
          {step === 'fields' && (
            <>
              <button onClick={() => onClose()} disabled={saving}
                style={{ ...secondaryBtnStyle, flex: '1 1 100px' }}>
                ביטול
              </button>
              <button onClick={() => setStep('sign')} disabled={!allRequiredFilled || saving}
                style={{ ...primaryBtnStyle, flex: '1 1 140px', background: allRequiredFilled ? COLORS.accent : '#D1D5DB' }}>
                המשך →
              </button>
            </>
          )}
          {step === 'sign' && (
            <>
              <button onClick={() => setStep('fields')} disabled={saving}
                style={{ ...secondaryBtnStyle, flex: '1 1 100px' }}>
                ← חזור
              </button>
              <button onClick={handleSendForSignature} disabled={saving}
                style={{ ...secondaryBtnStyle, flex: '1 1 140px' }}>
                {saving ? 'שומר...' : 'שלח לחתימה מרחוק'}
              </button>
              <button onClick={handleSignNow} disabled={saving || !canSign}
                style={{ ...primaryBtnStyle, flex: '1 1 140px', background: (saving || !canSign) ? '#D1D5DB' : COLORS.accent }}>
                {saving ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" />שומר...</> : 'אשר וחתום'}
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
