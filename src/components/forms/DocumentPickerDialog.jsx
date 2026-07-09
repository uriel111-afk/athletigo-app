import React, { useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ChevronLeft } from 'lucide-react';
import { DOCUMENT_TYPES_LIST } from '@/lib/documentTemplates';
import AgreementFlowDialog from './AgreementFlowDialog';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';

const BUCKET = 'trainee-documents';
const MAX_SIZE_MB = 10;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

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
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

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
    if (template.isUpload) {
      // Upload-only type (doctor approval) — trigger the native file
      // picker. Deliberately NOT a nested Radix dialog. The hidden
      // <input> lives outside <Dialog> so it works while this one is open.
      fileInputRef.current?.click();
      return;
    }
    setAgreementKey(template.key);
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;
    if (!traineeId) { toast.error('חסר מזהה מתאמן'); return; }
    if (file.size > MAX_SIZE_BYTES) { toast.error(`הקובץ גדול מדי. מקסימום ${MAX_SIZE_MB} מגה`); return; }

    setUploading(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${traineeId}/doctor-approval-${Date.now()}-${safeName}`;

      const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(path, file);
      if (uploadErr) {
        console.error('[DoctorApproval] upload failed:', uploadErr);
        toast.error('העלאה נכשלה: ' + (uploadErr.message || ''));
        return;
      }

      // Long-lived signed URL so the viewer can open file_url directly.
      let fileUrl = path;
      try {
        const { data: signed } = await supabase.storage.from(BUCKET)
          .createSignedUrl(path, 60 * 60 * 24 * 365 * 5); // 5 years
        if (signed?.signedUrl) fileUrl = signed.signedUrl;
      } catch (urlErr) { console.warn('[DoctorApproval] signed url failed:', urlErr); }

      const { error: dbErr } = await supabase.from('signed_documents').insert({
        trainee_id: traineeId,
        coach_id: coachId ?? null,
        document_type: 'doctor_approval',
        document_data: {
          file_name: file.name,
          file_path: path,
          trainee_name: traineeName || null,
          uploaded_at: new Date().toISOString(),
          uploaded_by_coach_id: coachId ?? null,
        },
        signed_at: new Date().toISOString(),
        status: 'signed',
        is_locked: true,
        file_url: fileUrl,
      });
      if (dbErr) {
        console.error('[DoctorApproval] db insert failed:', dbErr);
        toast.error('שמירת המסמך נכשלה: ' + (dbErr.message || ''));
        await supabase.storage.from(BUCKET).remove([path]);
        return;
      }

      toast.success('אישור הרופא נשמר');
      window.dispatchEvent(new CustomEvent('signed-documents-changed', { detail: { traineeId } }));
      onClose();
    } catch (err) {
      console.error('[DoctorApproval] unexpected:', err);
      toast.error('שגיאה בלתי צפויה בהעלאה');
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      {/* Hidden native file input — outside <Dialog> so it survives the
          picker's open/close and is never inside a Radix focus-trap. */}
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleUpload}
        style={{ display: 'none' }}
        accept="image/*,application/pdf,.doc,.docx"
      />

      <Dialog open={open && !agreementKey} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle style={{ color: 'var(--ag-text)', fontWeight: 700, fontSize: 16 }}>
              בחר/י מסמך
            </DialogTitle>
          </DialogHeader>

          <div dir="rtl">
            {DOCUMENT_TYPES_LIST.map(template => (
              <div
                key={template.key}
                onClick={() => { if (!uploading) handlePick(template); }}
                style={{ ...cardStyle, opacity: uploading ? 0.6 : 1 }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handlePick(template); }}
              >
                <span style={{ fontSize: 24 }}>{template.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ color: 'var(--ag-text)', fontWeight: 700, fontSize: 14 }}>{template.title}</div>
                  <div style={{ color: '#6b7280', fontSize: 12, marginTop: 2 }}>
                    {template.useCustomForm ? 'שאלון בריאות מובנה'
                      : template.isUpload ? (uploading ? 'מעלה קובץ...' : 'העלאת קובץ (אישור רופא)')
                      : 'הסכם עם שדות מותאמים'}
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
