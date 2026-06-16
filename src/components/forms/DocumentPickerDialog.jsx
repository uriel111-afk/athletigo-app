import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ChevronLeft } from 'lucide-react';
import { DOCUMENT_TYPES_LIST } from '@/lib/documentTemplates';
import AgreementFlowDialog from './AgreementFlowDialog';

const cardStyle = {
  background: 'var(--ag-bg)',
  border: '1px solid #FFE5D0',
  borderRight: '3px solid var(--ag-accent)',
  borderRadius: 10,
  padding: 14,
  marginBottom: 10,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  transition: 'background 0.15s',
  WebkitTapHighlightColor: 'rgba(255,111,32,0.15)',
  touchAction: 'manipulation',
};

export default function DocumentPickerDialog({
  open, onClose, traineeId, traineeName, coachId, onPickHealth,
}) {
  const [agreementKey, setAgreementKey] = useState(null);

  function handlePickHealth() {
    // Close the picker first; the parent owns the HealthDeclarationForm
    // dialog. The short delay lets Radix tear down this dialog's
    // focus-trap before the next one mounts — necessary on the Android
    // WebView where two simultaneous focus traps can swallow taps.
    onClose();
    setTimeout(() => onPickHealth?.(), 120);
  }

  function handlePick(template) {
    if (template.useCustomForm) {
      handlePickHealth();
      return;
    }
    setAgreementKey(template.key);
  }

  return (
    <>
      <Dialog open={open && !agreementKey} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle style={{ color: 'var(--ag-text)', fontWeight: 700, fontSize: 16 }}>
              בחר/י מסמך לחתימה
            </DialogTitle>
          </DialogHeader>

          <div dir="rtl">
            {DOCUMENT_TYPES_LIST.map(template => (
              <div
                key={template.key}
                onClick={() => handlePick(template)}
                style={cardStyle}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handlePick(template); }}
              >
                <span style={{ fontSize: 24 }}>{template.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ color: 'var(--ag-text)', fontWeight: 700, fontSize: 14 }}>{template.title}</div>
                  <div style={{ color: '#6b7280', fontSize: 12, marginTop: 2 }}>
                    {template.useCustomForm ? 'שאלון בריאות מובנה' : 'הסכם עם שדות מותאמים'}
                  </div>
                </div>
                <ChevronLeft style={{ width: 18, height: 18, color: 'var(--ag-accent)' }} />
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {agreementKey && (
        <AgreementFlowDialog
          open={!!agreementKey}
          onClose={() => { setAgreementKey(null); onClose(); }}
          templateKey={agreementKey}
          traineeId={traineeId}
          traineeName={traineeName}
          coachId={coachId}
        />
      )}
    </>
  );
}
