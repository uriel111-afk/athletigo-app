import React, { useCallback, useEffect, useState } from 'react';
import { FileText, ChevronLeft } from 'lucide-react';
import LegalDocModal from '@/components/forms/LegalDocModal';
import PhotoConsentDialog from '@/components/forms/PhotoConsentDialog';
import { LEGAL_DOC_LIST } from '@/content/legal';
import { loadLegalConsents } from '@/lib/legalConsent';
import { hasDocumentationConsent, hasMarketingConsent, isMinorFromBirthDate } from '@/lib/photoConsent';

// "מסמכים והסכמות" — settings card in the trainee's documents tab.
// Links to every legal document + shows current consent state, with a
// change/revoke control for photo consent. Read for coaches, editable
// for the trainee viewing their own profile (isSelf).
const fmt = (iso) => {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('he-IL'); } catch { return ''; }
};

export default function ConsentSettingsCard({ traineeId, coachId, isSelf = false }) {
  const [c, setC] = useState(null);
  const [openDoc, setOpenDoc] = useState(null);
  const [photoOpen, setPhotoOpen] = useState(false);

  const reload = useCallback(async () => {
    if (!traineeId) return;
    setC(await loadLegalConsents(traineeId));
  }, [traineeId]);
  useEffect(() => { reload(); }, [reload]);

  const termsOk = !!c?.terms?.accepted;
  const privacyOk = !!c?.privacy?.accepted;
  const docOk = hasDocumentationConsent(c?.photo);
  const mktOk = hasMarketingConsent(c?.photo);
  const isMinor = isMinorFromBirthDate(c?.birthDate);

  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #F0E4D0', borderRadius: 12, padding: 14, marginBottom: 16 }} dir="rtl">
      <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ag-text)', marginBottom: 10 }}>מסמכים והסכמות</div>

      {/* Document links */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
        {LEGAL_DOC_LIST.map((doc) => (
          <button key={doc.id} type="button" onClick={() => setOpenDoc(doc.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'right',
              padding: '10px 12px', borderRadius: 10, border: '1px solid var(--ag-border)',
              background: '#FAFAFA', cursor: 'pointer', fontSize: 14, color: 'var(--ag-text)', fontWeight: 600,
            }}>
            <FileText size={16} style={{ color: 'var(--ag-accent)', flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{doc.title}</span>
            <ChevronLeft size={16} style={{ color: 'var(--ag-text-soft)' }} />
          </button>
        ))}
      </div>

      {/* Consent status */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
        <StatusRow label="תנאי שימוש" ok={termsOk} extra={termsOk ? fmt(c?.terms?.accepted_at) : ''} />
        <StatusRow label="מדיניות פרטיות" ok={privacyOk} extra={privacyOk ? fmt(c?.privacy?.accepted_at) : ''} />
        <StatusRow label="תיעוד אימונים (צילום)" ok={docOk} />
        <StatusRow label="שימוש שיווקי" ok={mktOk} />
      </div>

      {/* Change / revoke photo consent */}
      <button type="button" onClick={() => setPhotoOpen(true)}
        style={{
          marginTop: 14, width: '100%', padding: 12, borderRadius: 10, border: '1px solid var(--ag-accent)',
          background: '#FFF7ED', color: 'var(--ag-accent)', fontWeight: 700, fontSize: 14, cursor: 'pointer',
        }}>
        עדכון / ביטול הסכמת צילום
      </button>

      <LegalDocModal docKey={openDoc} open={!!openDoc} onClose={() => setOpenDoc(null)} />
      <PhotoConsentDialog
        open={photoOpen}
        onClose={() => setPhotoOpen(false)}
        traineeId={traineeId}
        coachId={coachId}
        isMinor={isMinor}
        childName={c?.fullName || ''}
        initial={c?.photo || null}
        source="settings"
        onSaved={() => { setPhotoOpen(false); reload(); }}
      />
    </div>
  );
}

function StatusRow({ label, ok, extra }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ color: 'var(--ag-text-soft)' }}>{label}</span>
      <span style={{ fontWeight: 700, color: ok ? '#1D9E75' : '#C62828' }}>
        {ok ? 'מאושר' : 'לא מאושר'}{extra ? ` · ${extra}` : ''}
      </span>
    </div>
  );
}
