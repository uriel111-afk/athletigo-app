import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { renderTemplateBody } from '@/lib/documentTemplates';

const COLORS = {
  bg: '#FFF9F0', card: '#FFFFFF', cardBorder: '#FFE5D0',
  accent: '#FF6F20', text: '#1a1a1a', textMuted: '#6b7280',
};
const primaryBtnStyle = {
  background: COLORS.accent, color: COLORS.card, border: 'none', borderRadius: 10,
  padding: 14, fontWeight: 700, fontSize: 15, cursor: 'pointer', width: '100%',
};
const secondaryBtnStyle = {
  background: COLORS.card, color: COLORS.accent, border: `1px solid ${COLORS.accent}`,
  borderRadius: 10, padding: 14, fontWeight: 700, fontSize: 15, cursor: 'pointer', width: '100%',
};

/**
 * Trainee-only one-way upgrade of photo_consent → 'allowed'.
 * Preserves the original decided_at and stamps upgraded_at = now.
 * Re-renders document_data.body_rendered so the saved JSON reflects
 * the new label everywhere (viewer + future PDF).
 */
export default function PhotoConsentUpgradeDialog({ open, onClose, doc, onUpgraded }) {
  const [saving, setSaving] = useState(false);

  if (!doc) return null;

  async function handleConfirm() {
    setSaving(true);
    try {
      const previousConsent = doc.document_data?.field_values?.photo_consent;
      // Preserve the original decided_at when present (object shape) or use
      // signed_at as a fallback (legacy string consent without a timestamp).
      const decidedAt = (previousConsent && typeof previousConsent === 'object' && previousConsent.decided_at)
        ? previousConsent.decided_at
        : (doc.signed_at || new Date().toISOString());

      const newConsent = {
        status: 'allowed',
        decided_at: decidedAt,
        upgraded_at: new Date().toISOString(),
      };

      const newFieldValues = {
        ...(doc.document_data?.field_values || {}),
        photo_consent: newConsent,
      };

      const newBody = renderTemplateBody(doc.document_type, newFieldValues, {
        trainee_name: doc.document_data?.trainee_name || '',
        signed_date: doc.signed_at
          ? new Date(doc.signed_at).toLocaleDateString('he-IL')
          : new Date().toLocaleDateString('he-IL'),
      });

      const { error } = await supabase
        .from('signed_documents')
        .update({
          document_data: {
            ...(doc.document_data || {}),
            field_values: newFieldValues,
            body_rendered: newBody,
          },
        })
        .eq('id', doc.id);

      if (error) {
        console.error('[PhotoConsentUpgrade] update error:', error);
        toast.error('העדכון נכשל: ' + (error.message || ''));
        return;
      }

      window.dispatchEvent(new CustomEvent('signed-documents-changed', { detail: { traineeId: doc.trainee_id } }));
      toast.success('האישור עודכן. תודה!');
      if (typeof onUpgraded === 'function') onUpgraded();
      onClose();
    } catch (e) {
      console.error('[PhotoConsentUpgrade] exception:', e);
      toast.error('שגיאה בלתי צפויה');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="max-w-sm" onInteractOutside={(e) => { if (saving) e.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle style={{ color: COLORS.text, fontWeight: 700, fontSize: 16 }}>
            שדרוג אישור שימוש בצילומים
          </DialogTitle>
        </DialogHeader>

        <div dir="rtl" style={{ background: COLORS.bg, padding: 14, borderRadius: 10, border: `1px solid ${COLORS.cardBorder}` }}>
          <p style={{ color: COLORS.text, fontSize: 14, lineHeight: 1.7, margin: '0 0 10px' }}>
            האם את/ה מאשר/ת כעת שימוש בצילומים ותכנים מהאימונים לצרכי שיווק של AthletiGo?
          </p>
          <p style={{ color: COLORS.textMuted, fontSize: 13, lineHeight: 1.6, margin: 0 }}>
            לאחר אישור, לא ניתן יהיה לבטלו דרך האפליקציה. לביטול יש לפנות ישירות למאמן.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12, direction: 'rtl' }}>
          <button onClick={() => onClose()} disabled={saving} style={{ ...secondaryBtnStyle, flex: 1 }}>
            ביטול
          </button>
          <button onClick={handleConfirm} disabled={saving} style={{ ...primaryBtnStyle, flex: 1 }}>
            {saving ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" />שומר...</> : 'כן, מאשר/ת'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
