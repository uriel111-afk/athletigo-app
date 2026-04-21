import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { ChevronLeft } from 'lucide-react';
import { DOCUMENT_TYPES_LIST } from '@/lib/documentTemplates';
import AgreementFlowDialog from './AgreementFlowDialog';

const cardStyle = {
  background: '#FFF9F0',
  border: '1px solid #FFE5D0',
  borderRight: '3px solid #FF6F20',
  borderRadius: 10,
  padding: 14,
  marginBottom: 10,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  transition: 'background 0.15s',
};

export default function DocumentPickerDialog({
  open, onClose, traineeId, traineeName, coachId,
}) {
  const [agreementKey, setAgreementKey] = useState(null);

  async function handlePickHealth() {
    // Re-use the existing pending-row mechanism — DocumentSigningTab already
    // renders pending health_declaration rows with the inline form.
    try {
      const { error } = await supabase.from('signed_documents').insert({
        trainee_id: traineeId,
        coach_id: coachId ?? null,
        document_type: 'health_declaration',
        status: 'pending',
        is_locked: false,
      });
      if (error) {
        console.error('[DocumentPicker] insert health pending:', error);
        toast.error('שגיאה בהוספת הצהרת בריאות: ' + (error.message || ''));
        return;
      }
      window.dispatchEvent(new CustomEvent('signed-documents-changed', { detail: { traineeId } }));
      toast.success('הצהרת בריאות נוספה. פתח/י אותה ברשימה כדי למלא ולחתום.');
      onClose();
    } catch (e) {
      console.error('[DocumentPicker] exception:', e);
      toast.error('שגיאה בלתי צפויה');
    }
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
            <DialogTitle style={{ color: '#1a1a1a', fontWeight: 700, fontSize: 16 }}>
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
                  <div style={{ color: '#1a1a1a', fontWeight: 700, fontSize: 14 }}>{template.title}</div>
                  <div style={{ color: '#6b7280', fontSize: 12, marginTop: 2 }}>
                    {template.useCustomForm ? 'שאלון בריאות מובנה' : 'הסכם עם שדות מותאמים'}
                  </div>
                </div>
                <ChevronLeft style={{ width: 18, height: 18, color: '#FF6F20' }} />
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
