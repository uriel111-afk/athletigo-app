import React, { useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabaseClient";
import OnboardingProgressBar from "@/components/OnboardingProgressBar";

// Soft hand-off between the onboarding questionnaire and the health
// declaration form. Sets expectations ("הבריאות שלך חשובה לנו…"),
// captures one short open-text note (pre_health_note), and only
// then opens the formal PAR-Q form. Portal-based custom overlay so
// it sits above any other dialogs without Radix modality conflicts.

export default function PreHealthScreen({ isOpen, traineeId, onContinue, onClose }) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;
  if (typeof document === 'undefined' || !document.body) return null;

  const handleContinue = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const trimmed = note.trim();
      if (traineeId && trimmed) {
        try {
          await supabase.from('users')
            .update({ pre_health_note: trimmed })
            .eq('id', traineeId);
          console.log('[Onboarding] step → pre_health note saved');
        } catch (e) {
          console.warn('[PreHealth] note save failed:', e?.message);
        }
      }
      console.log('[Onboarding] step → health_declaration (after pre_health)');
      onContinue?.();
    } finally {
      setSaving(false);
    }
  };

  const node = (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        zIndex: 11000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
        fontFamily: "'Heebo', 'Assistant', sans-serif",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onPointerDownCapture={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 420,
          background: '#FDF8F3',
          borderRadius: 24,
          boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
          direction: 'rtl',
          maxHeight: '90vh',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Outer 4-of-5 step indicator (details → questionnaire →
            pre_health → health → payment). Shows the trainee where
            they are without the health form's bigger chrome. */}
        <OnboardingProgressBar currentStep="pre_health" />

        <div style={{ padding: '8px 24px 24px', overflowY: 'auto' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }} aria-hidden>🤝</div>
            <div style={{
              fontSize: 24, fontWeight: 700, color: '#1A1A1A',
              marginBottom: 8,
            }}>לפני שמתחילים</div>
            <div style={{
              fontSize: 15, color: '#555', lineHeight: 1.7,
              marginBottom: 20,
            }}>
              הבריאות שלך חשובה לנו מעל הכל.
              <br />
              לפני שנתחיל את המסע ביחד, נרצה לוודא שאנחנו מכירים את הגוף שלך — כדי לבנות תוכנית שמתאימה בדיוק לך ושומרת עליך.
            </div>
          </div>

          <div style={{
            background: '#FFFFFF',
            borderRadius: 14,
            padding: 16,
            border: '1px solid #F0E4D0',
            marginBottom: 20,
          }}>
            <div style={{
              fontSize: 14, fontWeight: 600, color: '#1A1A1A',
              marginBottom: 8, textAlign: 'right',
            }}>
              האם יש כאב, פציעה או מגבלה שחשוב שנדע עליהם?
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="למשל: כאבי גב תחתון, פציעת ברך ישנה, אסטמה... או פשוט ׳הכל תקין׳ 😊"
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 12,
                border: '1px solid #F0E4D0', background: '#FAFAFA',
                fontSize: 14, color: '#1A1A1A',
                direction: 'rtl', textAlign: 'right',
                minHeight: 80, resize: 'vertical',
                outline: 'none', boxSizing: 'border-box',
                fontFamily: "'Heebo', 'Assistant', sans-serif",
              }}
            />
          </div>

          <button
            type="button"
            onClick={handleContinue}
            disabled={saving}
            style={{
              width: '100%', padding: '14px 18px',
              borderRadius: 14, border: 'none',
              background: '#FF6F20', color: '#FFFFFF',
              fontSize: 16, fontWeight: 600,
              cursor: saving ? 'wait' : 'pointer',
              opacity: saving ? 0.7 : 1,
              fontFamily: "'Heebo', 'Assistant', sans-serif",
              boxShadow: '0 2px 6px rgba(255, 111, 32, 0.25)',
            }}
          >
            {saving ? 'שומר…' : 'המשך להצהרת בריאות 📋'}
          </button>

          <div style={{
            fontSize: 12, color: '#888',
            marginTop: 12, textAlign: 'center',
          }}>
            זה טופס קצר וסטנדרטי — לוקח פחות מדקה
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
