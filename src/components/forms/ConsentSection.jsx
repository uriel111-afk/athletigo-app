import React, { useEffect, useState } from 'react';
import SignaturePad from '@/components/forms/SignaturePad';
import LegalDocModal from '@/components/forms/LegalDocModal';
import { CONSENT_COPY as CC } from '@/content/legal/consentCopy';

// The onboarding / returning-trainee consent section: two big
// thumb-friendly checkboxes with brand-orange doc links, plus the
// guardian block (name + relation + signature) for minors. Manages its
// own state and reports it up via onChange; the parent gates the finish
// button on `valid` and calls saveConsents() with the reported values.
export default function ConsentSection({ isMinor = false, initial = null, onChange }) {
  const [terms, setTerms] = useState(!!initial?.termsPrivacyAccepted);
  const [photo, setPhoto] = useState(initial?.photoAllowed ?? false);
  const [signerName, setSignerName] = useState(initial?.signerName || '');
  const [signerRelation, setSignerRelation] = useState(initial?.signerRelation || '');
  const [signatureData, setSignatureData] = useState(initial?.signatureData || null);
  const [openDoc, setOpenDoc] = useState(null); // 'terms' | 'privacy' | 'photo' | null

  const guardianOk = !isMinor || (signerName.trim() && signerRelation && signatureData);
  const valid = terms && guardianOk;

  useEffect(() => {
    onChange?.({
      termsPrivacyAccepted: terms,
      photoAllowed: photo,
      isMinor,
      signerName: signerName.trim(),
      signerRelation,
      signatureData,
      valid,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terms, photo, signerName, signerRelation, signatureData, isMinor, valid]);

  const t = isMinor ? CC.terms.minor : CC.terms.adult;
  const p = isMinor ? CC.photo.minor : CC.photo.adult;

  return (
    <div dir="rtl" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {isMinor && (
        <div style={{ background: '#FFF3E0', borderRadius: 10, padding: 12, fontSize: 13, color: '#E65100', lineHeight: 1.6 }}>
          ⚠️ {CC.minorBanner}
        </div>
      )}

      {/* Checkbox 1 — required: terms + privacy */}
      <CheckRow checked={terms} onToggle={() => setTerms(v => !v)}>
        {t.pre}
        <Link onClick={() => setOpenDoc('terms')}>{CC.terms.termsLink}</Link>
        {t.mid}
        <Link onClick={() => setOpenDoc('privacy')}>{CC.terms.privacyLink}</Link>
        {t.post}
        <span style={{ color: 'var(--ag-error)' }}> *</span>
      </CheckRow>

      {/* Checkbox 2 — optional: photo documentation + marketing */}
      <div>
        <CheckRow checked={photo} onToggle={() => setPhoto(v => !v)}>
          {p.pre}
          <Link onClick={() => setOpenDoc('photo')}>{CC.photo.link}</Link>
          {p.post}
        </CheckRow>
        <div style={{ fontSize: 12, color: 'var(--ag-text-soft)', marginTop: 4, marginInlineStart: 40 }}>
          {CC.photo.note}
        </div>
      </div>

      {/* Guardian block — minors only */}
      {isMinor && (
        <div style={{ background: '#FFFFFF', border: '1px solid var(--ag-border)', borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 13, color: 'var(--ag-text-soft)', marginBottom: 4 }}>{CC.signerNameLabel} *</div>
          <input
            value={signerName}
            onChange={(e) => setSignerName(e.target.value)}
            placeholder="שם מלא"
            style={inputStyle}
          />
          <div style={{ fontSize: 13, color: 'var(--ag-text-soft)', marginTop: 12, marginBottom: 6 }}>{CC.relationLabel} *</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {CC.RELATION_OPTIONS.map((r) => {
              const active = signerRelation === r;
              return (
                <button key={r} type="button" onClick={() => setSignerRelation(active ? '' : r)}
                  style={{
                    padding: '8px 16px', borderRadius: 999, fontSize: 13, fontWeight: active ? 700 : 500,
                    background: active ? 'var(--ag-accent)' : '#FFFFFF',
                    color: active ? '#FFFFFF' : 'var(--ag-text-soft)',
                    border: active ? '1px solid var(--ag-accent)' : '1px solid var(--ag-border)', cursor: 'pointer',
                  }}>{r}</button>
              );
            })}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ag-text)', marginTop: 14, marginBottom: 6 }}>{CC.signatureLabel} *</div>
          <SignaturePad onChange={setSignatureData} />
        </div>
      )}

      <LegalDocModal docKey={openDoc} open={!!openDoc} onClose={() => setOpenDoc(null)} />
    </div>
  );
}

function CheckRow({ checked, onToggle, children }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer',
      background: '#FFFFFF', border: `1px solid ${checked ? 'var(--ag-accent)' : 'var(--ag-border)'}`,
      borderRadius: 14, padding: 14,
    }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        style={{ marginTop: 2, width: 26, height: 26, accentColor: 'var(--ag-accent)', flexShrink: 0, cursor: 'pointer' }}
      />
      <span style={{ fontSize: 14, color: 'var(--ag-text)', lineHeight: 1.6 }}>{children}</span>
    </label>
  );
}

function Link({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick(); }}
      style={{
        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
        color: 'var(--ag-accent)', fontWeight: 700, textDecoration: 'underline',
        fontSize: 14, fontFamily: 'inherit',
      }}
    >{children}</button>
  );
}

const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #E5E7EB',
  background: '#FFFFFF', fontSize: 14, color: 'var(--ag-text)', outline: 'none',
  boxSizing: 'border-box', textAlign: 'right', direction: 'rtl',
};
