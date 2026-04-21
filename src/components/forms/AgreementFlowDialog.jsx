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
import { DraftBanner } from '@/components/DraftBanner';
import { DOCUMENT_TEMPLATES, renderTemplateBody } from '@/lib/documentTemplates';

const inputStyle = {
  width: '100%', padding: 10, borderRadius: 8, border: '1px solid #FFE5D0',
  background: '#FFFFFF', color: '#1a1a1a', fontSize: 14, boxSizing: 'border-box',
};
const labelStyle = { display: 'block', fontSize: 13, fontWeight: 700, color: '#1a1a1a', marginBottom: 6 };
const cardStyle = {
  background: '#FFF9F0', border: '1px solid #FFE5D0', borderRadius: 10,
  padding: 14, marginBottom: 12,
};

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
                border: active ? '1px solid #FF6F20' : '1px solid #FFE5D0',
                background: active ? '#FFF9F0' : '#FFFFFF',
                color: active ? '#FF6F20' : '#6b7280',
                cursor: 'pointer',
              }}>
              {o.label}
            </button>
          );
        })}
      </div>
    );
  }
  // text / number / date
  return (
    <input type={field.type || 'text'}
      value={value ?? ''} onChange={e => onChange(e.target.value)}
      placeholder={field.placeholder || ''} style={inputStyle} />
  );
}

function buildInitial(template) {
  const o = {};
  for (const f of (template.fields || [])) {
    o[f.key] = f.default ?? '';
  }
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

  const [step, setStep] = useState('fields'); // fields → preview → sign
  const [confirmRead, setConfirmRead] = useState(false);
  const [saving, setSaving] = useState(false);
  const sigRef = useRef(null);

  // Reset wizard state when dialog opens
  React.useEffect(() => {
    if (open) {
      setStep('fields');
      setConfirmRead(false);
    }
  }, [open]);

  if (!template) return null;

  const renderedBody = renderTemplateBody(templateKey, fieldValues, {
    trainee_name: traineeName || '',
    signed_date: new Date().toLocaleDateString('he-IL'),
  });

  const allRequiredFilled = (template.fields || []).every(f => isFieldFilled(f, fieldValues[f.key]));

  async function saveAgreement({ asSigned, signatureDataUrl }) {
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase.from('signed_documents').insert({
        trainee_id: traineeId,
        coach_id: coachId ?? null,
        document_type: templateKey,
        document_data: {
          template_key: templateKey,
          field_values: fieldValues,
          body_rendered: renderedBody,
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
      // Notify DocumentSigningTab to refetch (it doesn't use TanStack for the docs list)
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
    if (ok) {
      toast.success('ההסכם נשלח לחתימה');
      onClose();
    }
  }

  async function handleSignNow() {
    if (!confirmRead) { toast.error('יש לאשר שקראת והבנת'); return; }
    if (!sigRef.current?.hasSignature()) { toast.error('יש לחתום לפני שליחה'); return; }
    const sig = sigRef.current.getSignature();
    const ok = await saveAgreement({ asSigned: true, signatureDataUrl: sig });
    if (ok) {
      toast.success('ההסכם נחתם ונשמר');
      onClose();
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="max-w-2xl" onInteractOutside={(e) => { if (saving) e.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle style={{ color: '#1a1a1a', fontWeight: 700, fontSize: 16 }}>
            {step === 'fields' && `פרטי ההתקשרות — ${template.title}`}
            {step === 'preview' && 'בדיקה אחרונה — לפני חתימה'}
            {step === 'sign' && 'חתימה'}
          </DialogTitle>
        </DialogHeader>

        <div dir="rtl" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {hasDraft && step === 'fields' && (
            <DraftBanner onContinue={keepDraft} onDiscard={discardDraft} />
          )}

          {step === 'fields' && (
            <div style={cardStyle}>
              {(template.fields || []).map(field => (
                <div key={field.key} style={{ marginBottom: 12 }}>
                  <label style={labelStyle}>
                    {field.label}{field.required && <span style={{ color: '#FF6F20' }}> *</span>}
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

          {step === 'preview' && (
            <div style={{
              whiteSpace: 'pre-wrap', background: '#FFFFFF',
              border: '1px solid #FFE5D0', borderRadius: 8, padding: 16,
              maxHeight: '60vh', overflow: 'auto',
              color: '#1a1a1a', lineHeight: 1.7, fontSize: 14,
            }}>
              {renderedBody}
            </div>
          )}

          {step === 'sign' && (
            <div>
              <div style={{
                background: '#FFF9F0', border: '1px solid #FF6F20', borderRadius: 10,
                padding: 12, marginBottom: 12, color: '#1a1a1a', fontWeight: 600, fontSize: 14,
              }}>
                מסור המכשיר למתאמן לחתימה
              </div>

              <div style={{
                whiteSpace: 'pre-wrap', background: '#FFFFFF',
                border: '1px solid #FFE5D0', borderRadius: 8, padding: 14,
                maxHeight: '40vh', overflow: 'auto',
                color: '#1a1a1a', lineHeight: 1.7, fontSize: 13, marginBottom: 12,
              }}>
                {renderedBody}
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer' }}>
                <input type="checkbox" checked={confirmRead} onChange={e => setConfirmRead(e.target.checked)}
                  style={{ accentColor: '#FF6F20', width: 18, height: 18 }} />
                <span style={{ color: '#1a1a1a', fontSize: 14 }}>קראתי והבנתי את ההסכם</span>
              </label>

              <div style={{ marginBottom: 4 }}>
                <label style={labelStyle}>חתימה דיגיטלית</label>
                <SignatureCanvas ref={sigRef} />
              </div>
            </div>
          )}
        </div>

        {/* Footer / step controls */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', direction: 'rtl' }}>
          {step === 'fields' && (
            <>
              <Button variant="outline" onClick={() => onClose()} disabled={saving}
                style={{ flex: 1, borderColor: '#FFE5D0', color: '#6b7280' }}>
                ביטול
              </Button>
              <Button onClick={() => setStep('preview')} disabled={!allRequiredFilled || saving}
                style={{ flex: 1, background: allRequiredFilled ? '#FF6F20' : '#D1D5DB', color: '#FFFFFF' }}>
                המשך
              </Button>
            </>
          )}
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={() => setStep('fields')} disabled={saving}
                style={{ flex: 1, borderColor: '#FFE5D0', color: '#6b7280' }}>
                ← חזור לעריכה
              </Button>
              <Button variant="outline" onClick={handleSendForSignature} disabled={saving}
                style={{ flex: 1, borderColor: '#FF6F20', color: '#FF6F20', background: '#FFFFFF' }}>
                {saving ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" />שומר...</> : 'שלח לחתימה מרחוק'}
              </Button>
              <Button onClick={() => setStep('sign')} disabled={saving}
                style={{ flex: 1, background: '#FF6F20', color: '#FFFFFF' }}>
                חתום עכשיו
              </Button>
            </>
          )}
          {step === 'sign' && (
            <>
              <Button variant="outline" onClick={() => setStep('preview')} disabled={saving}
                style={{ flex: 1, borderColor: '#FFE5D0', color: '#6b7280' }}>
                חזור
              </Button>
              <Button onClick={handleSignNow} disabled={saving || !confirmRead}
                style={{ flex: 1, background: (saving || !confirmRead) ? '#D1D5DB' : '#FF6F20', color: '#FFFFFF' }}>
                {saving ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" />שומר...</> : 'אשר וחתום'}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
