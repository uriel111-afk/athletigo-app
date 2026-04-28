import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

// Display labels for the 8 PAR-Q questions stored in `health_declarations`.
// feels_healthy is the only inverted question — a "כן" answer is the
// healthy/positive outcome, a "לא" answer indicates concern.
const QUESTIONS = [
  { key: 'heart_disease',       label: 'מחלת לב' },
  { key: 'blood_pressure',      label: 'בעיות לחץ דם' },
  { key: 'joint_issues',        label: 'בעיות במפרקים / עמוד שדרה' },
  { key: 'asthma',              label: 'אסטמה / בעיות נשימה' },
  { key: 'medications',         label: 'תרופות באופן קבוע' },
  { key: 'medical_limitations', label: 'מגבלה רפואית כלשהי' },
  { key: 'recent_surgery',      label: 'ניתוח ב-12 החודשים האחרונים' },
  { key: 'feels_healthy',       label: 'מרגיש/ה בריא/ה ומסוגל/ת לפעילות', inverted: true },
];

// Color logic: a "concerning" answer is red, a "fine" answer is green.
// For a normal question, "כן" = concerning (red), "לא" = fine (green).
// For the inverted feels_healthy, "כן" = fine (green), "לא" = concerning (red).
const badgeColors = (value, inverted) => {
  const concerning = inverted ? !value : !!value;
  return concerning
    ? { bg: '#FEE2E2', color: '#B91C1C' }
    : { bg: '#DCFCE7', color: '#166534' };
};

const formatStamp = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('he-IL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

export default function HealthDeclarationViewer({ isOpen, onClose, traineeId, traineeName, traineePreHealthNote }) {
  const [loading, setLoading] = useState(false);
  const [record, setRecord] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen || !traineeId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setRecord(null);
    (async () => {
      const { data, error: err } = await supabase
        .from('health_declarations')
        .select('*')
        .eq('trainee_id', traineeId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (err) {
        setError(err.message || 'שגיאה בטעינת ההצהרה');
      } else {
        setRecord(data || null);
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
            position: 'absolute', top: 12, left: 12, width: 36, height: 36,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: '50%', border: 'none', background: '#f5f5f5',
            cursor: 'pointer', zIndex: 1,
          }}
        >
          <X style={{ width: 18, height: 18, color: '#6B7280' }} />
        </button>

        <div style={{ padding: '20px 20px 24px' }}>
          {/* Title */}
          <div style={{ paddingLeft: 40, marginBottom: 4 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#1a1a1a' }}>
              הצהרת בריאות חתומה
            </div>
            {traineeName && (
              <div style={{ fontSize: 14, color: '#6B7280', marginTop: 2 }}>
                {traineeName}
              </div>
            )}
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

          {!loading && !error && !record && (
            <div style={{ padding: 16, marginTop: 16, background: '#FFF9F0', color: '#FF6F20', borderRadius: 10, border: '1px solid #FFE5D0', fontSize: 14, textAlign: 'center' }}>
              לא נמצאה הצהרת בריאות חתומה למתאמן/ת.
            </div>
          )}

          {record && !loading && (
            <>
              {/* Signed-at pill */}
              {record.signed_at && (
                <div style={{ marginTop: 12, marginBottom: 14 }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: '#DCFCE7', color: '#166534',
                    padding: '4px 10px', borderRadius: 20,
                    fontSize: 12, fontWeight: 700,
                  }}>
                    ✓ נחתם {formatStamp(record.signed_at)}
                  </span>
                </div>
              )}

              {/* PAR-Q answers */}
              <div style={{
                marginTop: 6, padding: 14,
                background: '#fff', border: '1px solid #F0E4D0', borderRadius: 12,
              }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#FF6F20', marginBottom: 10 }}>
                  שאלון בריאות
                </div>
                {QUESTIONS.map((q) => {
                  const value = !!record[q.key];
                  const { bg, color } = badgeColors(value, q.inverted);
                  return (
                    <div key={q.key} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      gap: 10, padding: '7px 0', borderBottom: '1px solid #F8EFDF',
                    }}>
                      <span style={{ fontSize: 13, color: '#1a1a1a', flex: 1, lineHeight: 1.4 }}>
                        {q.label}
                      </span>
                      <span style={{
                        flexShrink: 0, fontSize: 12, fontWeight: 700,
                        padding: '3px 12px', borderRadius: 20,
                        background: bg, color,
                      }}>
                        {value ? 'כן' : 'לא'}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Additional notes from the declaration */}
              {record.additional_notes && record.additional_notes.trim() && (
                <div style={{
                  marginTop: 14, padding: 14,
                  background: '#FDF8F3', border: '1px solid #F0E4D0', borderRadius: 12,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#FF6F20', marginBottom: 6 }}>
                    הערות נוספות
                  </div>
                  <div style={{ fontSize: 14, color: '#1a1a1a', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {record.additional_notes}
                  </div>
                </div>
              )}

              {/* Pre-health note from the onboarding (users.pre_health_note) */}
              {traineePreHealthNote && traineePreHealthNote.trim() && traineePreHealthNote.trim() !== 'הכל תקין' && (
                <div style={{
                  marginTop: 14, padding: 14,
                  background: '#FFF9F0', border: '1px solid #FFE5D0', borderRadius: 12,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#FF6F20', marginBottom: 6 }}>
                    הערה רפואית מהאונבורדינג
                  </div>
                  <div style={{ fontSize: 14, color: '#1a1a1a', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {traineePreHealthNote}
                  </div>
                </div>
              )}

              {/* Signature image */}
              {record.signature_url && (
                <div style={{
                  marginTop: 14, padding: 14,
                  background: '#fff', border: '1px solid #F0E4D0', borderRadius: 12,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#FF6F20', marginBottom: 8 }}>
                    חתימה דיגיטלית
                  </div>
                  <img
                    src={record.signature_url}
                    alt="חתימה"
                    style={{
                      maxWidth: '100%', maxHeight: 100, objectFit: 'contain',
                      display: 'block', background: '#fff',
                      border: '1px solid #F0E4D0', borderRadius: 8, padding: 6,
                    }}
                  />
                </div>
              )}

              {/* Declaration confirmed */}
              {record.declaration_confirmed && (
                <div style={{
                  marginTop: 14, padding: '10px 14px',
                  background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10,
                  fontSize: 13, color: '#166534', fontWeight: 700,
                }}>
                  ✓ אישר/ה את הצהרת הבריאות
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
