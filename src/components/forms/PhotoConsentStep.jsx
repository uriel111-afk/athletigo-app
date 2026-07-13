import React, { useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import SignaturePad from '@/components/forms/SignaturePad';
import { PHOTO_CONSENT_CONTENT as C } from '@/content/photoConsent';
import { CONSENT, savePhotoConsent } from '@/lib/photoConsent';

// Mandatory onboarding photo-consent surface (also reused inside a
// dialog for returning trainees + settings). TWO separate consents —
// documentation (required to proceed; refusing disables the gallery)
// and marketing (optional, defaults to not-approved). For minors both
// are signed by the guardian: name + relation + signature required
// before save.
//
// Self-contained persistence via savePhotoConsent(); parent only wires
// onSaved / onSkip and chrome.
export default function PhotoConsentStep({
  traineeId,
  coachId,
  isMinor = false,
  childName = '',
  initial = null,          // prefill when editing existing consent
  source = 'onboarding',
  submitLabel,
  showSkip = false,        // minor onboarding: allow "guardian later"
  onSaved,
  onSkip,
}) {
  const [documentation, setDocumentation] = useState(initial?.documentation ?? null);
  const [marketing, setMarketing] = useState(initial?.marketing ?? CONSENT.DENIED);
  const [signerName, setSignerName] = useState(initial?.signer_name || '');
  const [signerRelation, setSignerRelation] = useState(initial?.signer_relation || '');
  const [signatureData, setSignatureData] = useState(initial?.signature_data || null);
  const [saving, setSaving] = useState(false);

  const guardianOk = !isMinor || (signerName.trim() && signerRelation && signatureData);
  const canSave = documentation !== null && guardianOk && !saving;

  const handleSave = async () => {
    if (!canSave) {
      if (documentation === null) toast.error('יש לבחור אם לאשר תיעוד אימונים');
      else if (isMinor && !signerName.trim()) toast.error('יש למלא שם הורה / אפוטרופוס');
      else if (isMinor && !signerRelation) toast.error('יש לבחור קרבה');
      else if (isMinor && !signatureData) toast.error('נדרשת חתימת הורה / אפוטרופוס');
      return;
    }
    setSaving(true);
    try {
      const consent = await savePhotoConsent(traineeId, coachId, {
        documentation, marketing, isMinor,
        signerName: signerName.trim(), signerRelation, signatureData, source,
      });
      toast.success('הסכמות הצילום נשמרו');
      onSaved?.(consent);
    } catch (e) {
      console.error('[PhotoConsentStep] save failed:', e);
      toast.error('שמירה נכשלה: ' + (e?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div dir="rtl" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 44, marginBottom: 8 }} aria-hidden>📸</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ag-text)' }}>{C.title}</div>
        <div style={{ fontSize: 14, color: '#555', lineHeight: 1.7, marginTop: 8 }}>{C.explainer}</div>
      </div>

      {/* Minor banner */}
      {isMinor && (
        <div style={{ background: '#FFF3E0', borderRadius: 10, padding: 12, fontSize: 13, color: '#E65100', lineHeight: 1.6 }}>
          ⚠️ {C.minor.banner}{childName ? ` (${childName})` : ''}
        </div>
      )}

      {/* 1) Documentation — required */}
      <div style={cardStyle}>
        <div style={headingStyle}>{C.documentation.heading} <span style={{ color: 'var(--ag-error)' }}>*</span></div>
        <ChoiceRow
          value={documentation}
          onAllow={() => setDocumentation(CONSENT.ALLOWED)}
          onDeny={() => setDocumentation(CONSENT.DENIED)}
          allowLabel={C.documentation.allowLabel}
          denyLabel={C.documentation.denyLabel}
        />
        {documentation === CONSENT.DENIED && (
          <div style={hintStyle}>{C.documentation.denyHint}</div>
        )}
      </div>

      {/* 2) Marketing — optional, default denied */}
      <div style={cardStyle}>
        <div style={headingStyle}>{C.marketing.heading}</div>
        <ChoiceRow
          value={marketing}
          onAllow={() => setMarketing(CONSENT.ALLOWED)}
          onDeny={() => setMarketing(CONSENT.DENIED)}
          allowLabel={C.marketing.allowLabel}
          denyLabel={C.marketing.denyLabel}
        />
        <div style={hintStyle}>{C.marketing.note}</div>
      </div>

      {/* Minor guardian block */}
      {isMinor && (
        <div style={cardStyle}>
          <div style={{ fontSize: 13, color: 'var(--ag-text-soft)', marginBottom: 4 }}>{C.minor.signerNameLabel} *</div>
          <input
            value={signerName}
            onChange={(e) => setSignerName(e.target.value)}
            placeholder="שם מלא"
            style={inputStyle}
          />
          <div style={{ fontSize: 13, color: 'var(--ag-text-soft)', marginTop: 12, marginBottom: 6 }}>{C.minor.relationLabel} *</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {C.RELATION_OPTIONS.map((r) => {
              const active = signerRelation === r;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setSignerRelation(active ? '' : r)}
                  style={{
                    padding: '8px 16px', borderRadius: 999, fontSize: 13,
                    fontWeight: active ? 700 : 500,
                    background: active ? 'var(--ag-accent)' : '#FFFFFF',
                    color: active ? '#FFFFFF' : 'var(--ag-text-soft)',
                    border: active ? '1px solid var(--ag-accent)' : '1px solid var(--ag-border)',
                    cursor: 'pointer',
                  }}
                >{r}</button>
              );
            })}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ag-text)', marginTop: 14, marginBottom: 6 }}>{C.minor.signatureLabel} *</div>
          <SignaturePad onChange={setSignatureData} />
        </div>
      )}

      {/* Save */}
      <button
        type="button"
        onClick={handleSave}
        disabled={!canSave}
        style={{
          width: '100%', padding: '14px 16px', borderRadius: 12, border: 'none',
          background: canSave ? 'var(--ag-accent)' : '#E5E7EB',
          color: canSave ? '#FFFFFF' : '#9CA3AF',
          fontSize: 16, fontWeight: 800, cursor: canSave ? 'pointer' : 'not-allowed',
        }}
      >
        {saving
          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Loader2 size={16} className="animate-spin" /> שומר…</span>
          : (submitLabel || C.saveLabel)}
      </button>

      {/* Minor onboarding escape hatch — guardian not present now. */}
      {showSkip && isMinor && (
        <button
          type="button"
          onClick={() => onSkip?.()}
          disabled={saving}
          style={{ background: 'transparent', border: 'none', color: 'var(--ag-text-soft)', fontSize: 13, textDecoration: 'underline', cursor: 'pointer' }}
        >
          {C.minor.skipLabel}
        </button>
      )}
    </div>
  );
}

function ChoiceRow({ value, onAllow, onDeny, allowLabel, denyLabel }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <ChoiceButton active={value === CONSENT.ALLOWED} color="var(--ag-accent)" bg="#FFEDD5" onClick={onAllow} label={allowLabel} />
      <ChoiceButton active={value === CONSENT.DENIED} color="var(--ag-error)" bg="#FEE2E2" onClick={onDeny} label={denyLabel} />
    </div>
  );
}

function ChoiceButton({ active, color, bg, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'right', padding: '12px 14px', borderRadius: 12,
        border: active ? `1.5px solid ${color}` : '1px solid #E5E7EB',
        background: active ? bg : '#FFFFFF',
        color: active ? color : 'var(--ag-text)',
        fontSize: 14, fontWeight: active ? 700 : 500, cursor: 'pointer', lineHeight: 1.5,
      }}
    >
      {active ? '✓ ' : ''}{label}
    </button>
  );
}

const cardStyle = { background: '#FFFFFF', border: '1px solid var(--ag-border)', borderRadius: 14, padding: 14 };
const headingStyle = { fontSize: 15, fontWeight: 700, color: 'var(--ag-text)', marginBottom: 10 };
const hintStyle = { fontSize: 12, color: 'var(--ag-text-soft)', marginTop: 8, lineHeight: 1.5 };
const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #E5E7EB',
  background: '#FFFFFF', fontSize: 14, color: 'var(--ag-text)', outline: 'none',
  boxSizing: 'border-box', textAlign: 'right', direction: 'rtl',
};
