import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

// Full-sentence Hebrew prompts per the latest spec — match the
// onboarding HealthDeclarationForm so the viewer reads the same
// way the trainee saw the questions when they signed.
// feels_healthy is the only inverted question — a "כן" answer is the
// healthy/positive outcome, a "לא" answer indicates concern.
const QUESTIONS = [
  { key: 'heart_disease',       text: 'האם אובחנה מחלת לב?' },
  { key: 'blood_pressure',      text: 'האם יש בעיות לחץ דם?' },
  { key: 'joint_issues',        text: 'האם יש בעיות במפרקים או בעמוד השדרה?' },
  { key: 'asthma',              text: 'האם יש אסטמה או בעיות נשימה?' },
  { key: 'medications',         text: 'האם נלקחות תרופות באופן קבוע?' },
  { key: 'medical_limitations', text: 'האם יש מגבלה רפואית שהמאמן צריך לדעת עליה?' },
  { key: 'recent_surgery',      text: 'האם בוצע ניתוח ב-12 החודשים האחרונים?' },
  { key: 'feels_healthy',       text: 'האם התחושה היא בריאות טובה ויכולת לפעילות גופנית?', inverted: true },
];

// Three-state badge: green/red/grey. A null/undefined value (the row
// doesn't carry that key at all) renders as "לא נענה" in grey, NOT
// silently coerced to "לא" — that prevented the coach from telling
// "trainee said no" from "trainee never saw this question."
const answerBadge = (value, inverted) => {
  if (value === null || value === undefined) {
    return { label: 'לא נענה', bg: '#F5F5F5', color: '#888888' };
  }
  const truthy = !!value;
  const concerning = inverted ? !truthy : truthy;
  return {
    label: truthy ? 'כן' : 'לא',
    bg: concerning ? '#FFEBEE' : '#E8F5E9',
    color: concerning ? '#C62828' : '#2E7D32',
  };
};

const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('he-IL');
};

const fmtTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
};

export default function HealthDeclarationViewer({ isOpen, onClose, traineeId, traineeName, traineePreHealthNote }) {
  const [loading, setLoading] = useState(false);
  const [record, setRecord] = useState(null);
  const [docFallback, setDocFallback] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen || !traineeId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setRecord(null);
    setDocFallback(null);
    (async () => {
      // Primary source — health_declarations row (the canonical table
      // every save writes to). Fallback to the documents row for the
      // signature file_url + any answers the user might have only
      // mirrored into document_data on legacy installs.
      const [decRes, docRes] = await Promise.all([
        supabase.from('health_declarations')
          .select('*')
          .eq('trainee_id', traineeId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from('documents')
          .select('*')
          .eq('trainee_id', traineeId)
          .eq('type', 'health_declaration')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      if (decRes.error) {
        setError(decRes.error.message || 'שגיאה בטעינת ההצהרה');
      } else {
        setRecord(decRes.data || null);
        setDocFallback(docRes.data || null);
        // Spec asks for explicit logging while debugging save paths.
        // Stays in production — useful when a coach reports a missing
        // declaration; one click and they can copy the console.
        console.log('[HealthDec] loaded:', decRes.data);
        console.log('[HealthDec] doc:', docRes.data);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [isOpen, traineeId]);

  // Lock body scroll while open so background can't move under the overlay.
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  if (!isOpen) return null;

  // Merge: declaration row preferred, document_data answers as fallback
  // (older rows that only mirrored answers into the documents table's
  // JSONB column). Fields not present in either resolve to undefined
  // → the badge renders as "לא נענה".
  const docData = (() => {
    const raw = docFallback?.document_data;
    if (!raw) return null;
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); } catch { return null; }
    }
    return raw;
  })();
  const merged = record || docData?.answers || docData || null;
  const signedAt = merged?.signed_at || merged?.created_at || record?.created_at;
  const signatureUrl = record?.signature_url || docFallback?.file_url || merged?.signature_url;

  const overlay = (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, direction: 'rtl',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 14, width: '100%', maxWidth: 400,
          maxHeight: '85vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch',
          boxShadow: '0 10px 30px rgba(0,0,0,0.18)', position: 'relative',
        }}
      >
        {/* Close button — top-left for RTL */}
        <button
          onClick={onClose}
          aria-label="סגור"
          style={{
            position: 'absolute', top: 10, left: 10, width: 36, height: 36,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: '50%', border: 'none', background: 'transparent',
            cursor: 'pointer', zIndex: 1, fontSize: 22, color: '#888',
          }}
        >
          <X style={{ width: 20, height: 20 }} />
        </button>

        <div style={{ padding: '20px 20px 24px' }}>
          {/* Centered title — name + signed date in subtitle so the
              header is one compact unit instead of two stacked rows. */}
          <div style={{ textAlign: 'center', marginBottom: 16, paddingInline: 36 }}>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#1A1A1A' }}>
              📋 הצהרת בריאות
            </div>
            <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>
              {(merged?.full_name || traineeName || '').trim()}
              {signedAt ? ` • ${fmtDate(signedAt)}` : ''}
            </div>
          </div>

          {loading && (
            <div style={{ padding: 30, textAlign: 'center', color: '#6B7280', fontSize: 14 }}>
              טוען...
            </div>
          )}

          {error && !loading && (
            <div style={{ padding: 16, marginTop: 16, background: '#FEF2F2', color: '#B91C1C', borderRadius: 10, border: '1px solid #FECACA', fontSize: 14 }}>
              {error}
            </div>
          )}

          {!loading && !error && !merged && (
            <div style={{ padding: 16, marginTop: 16, background: '#FFF9F0', color: '#FF6F20', borderRadius: 10, border: '1px solid #FFE5D0', fontSize: 14, textAlign: 'center' }}>
              לא נמצאה הצהרת בריאות חתומה.
            </div>
          )}

          {merged && !loading && (
            <>
              {/* PAR-Q answers — every question always renders. Missing
                  values surface as "לא נענה" so partial / legacy rows
                  don't pretend to be a "לא" answer. */}
              <div style={{ borderTop: '1px solid #F0E4D0', paddingTop: 12 }}>
                {QUESTIONS.map((q) => {
                  const value = merged[q.key];
                  const { label, bg, color } = answerBadge(value, q.inverted);
                  return (
                    <div key={q.key} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      gap: 10, padding: '10px 0', borderBottom: '1px solid #F0E4D0',
                    }}>
                      <div style={{ fontSize: 14, color: '#1A1A1A', flex: 1, lineHeight: 1.4, paddingLeft: 12 }}>
                        {q.text}
                      </div>
                      <div style={{
                        fontSize: 13, fontWeight: 600,
                        padding: '4px 12px', borderRadius: 10,
                        background: bg, color, whiteSpace: 'nowrap', flexShrink: 0,
                      }}>
                        {label}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Additional notes from the declaration */}
              {(merged.additional_notes || merged.notes) && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>פירוט נוסף</div>
                  <div style={{
                    padding: 12, borderRadius: 12, background: '#FDF8F3',
                    fontSize: 14, color: '#1A1A1A', lineHeight: 1.6, whiteSpace: 'pre-wrap',
                  }}>
                    {merged.additional_notes || merged.notes}
                  </div>
                </div>
              )}

              {/* Pre-health note from onboarding (users.pre_health_note) */}
              {traineePreHealthNote && traineePreHealthNote.trim() && traineePreHealthNote.trim() !== 'הכל תקין' && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>הערות בריאות (מתהליך ההרשמה)</div>
                  <div style={{
                    padding: 12, borderRadius: 12, background: '#FDF8F3',
                    fontSize: 14, color: '#1A1A1A', lineHeight: 1.6, whiteSpace: 'pre-wrap',
                  }}>
                    {traineePreHealthNote}
                  </div>
                </div>
              )}

              {/* Signature image — falls through health_declarations →
                  documents.file_url so older rows that stored only the
                  PNG in documents still render. */}
              {signatureUrl && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>חתימה</div>
                  <div style={{
                    padding: 12, borderRadius: 12, border: '1px solid #F0E4D0',
                    background: 'white', textAlign: 'center',
                  }}>
                    <img
                      src={signatureUrl}
                      alt="חתימה"
                      style={{ maxWidth: '100%', maxHeight: 120, objectFit: 'contain' }}
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  </div>
                </div>
              )}

              {/* Signed timestamp — at the bottom per the latest spec
                  (was at the top in the previous version). One pill,
                  date + time. */}
              {signedAt && (
                <div style={{ marginTop: 16, textAlign: 'center' }}>
                  <span style={{
                    display: 'inline-block', padding: '6px 16px', borderRadius: 10,
                    background: '#E8F5E9', color: '#2E7D32',
                    fontSize: 13, fontWeight: 500,
                  }}>
                    ✓ נחתם ב-{fmtDate(signedAt)} בשעה {fmtTime(signedAt)}
                  </span>
                </div>
              )}

              {/* Declaration confirmed line — quotes the exact wording
                  shown above the signature canvas during signing. */}
              {merged.declaration_confirmed && (
                <div style={{ marginTop: 12, textAlign: 'center', fontSize: 12, color: '#888' }}>
                  ✓ "כל הפרטים שנמסרו נכונים ומדויקים"
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
