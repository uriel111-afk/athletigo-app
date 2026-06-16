import React, { useEffect, useRef, useState } from "react";
import { X, Download, CheckCircle } from "lucide-react";
import { DOCUMENT_TEMPLATES, resolvePhotoConsentLabel, getPhotoConsentStatus } from "@/lib/documentTemplates";
import PhotoConsentUpgradeDialog from "./forms/PhotoConsentUpgradeDialog";
import { downloadSignedDocument } from "@/lib/downloadSignedDocument";

const LABELS = {
  health_declaration: 'הצהרת בריאות',
  cooperation_agreement: 'הסכם שיתוף פעולה',
};

const HEALTH_TEMPLATE = `הצהרת בריאות לפעילות גופנית

אני החתום/ה מטה מצהיר/ת בזאת כי מילאתי את השאלון הבא בנוגע למצב בריאותי:

1. האם רופא אמר לך אי פעם שיש לך בעיה בלב ושעליך לבצע פעילות גופנית רק בהמלצת רופא?
2. האם אתה סובל מכאבים בחזה במנוחה או במאמץ?
3. האם אתה מאבד שיווי משקל בגלל סחרחורות או מאבד הכרה?
4. האם יש לך בעיית עצמות או מפרקים שעלולה להחמיר עם פעילות גופנית?
5. האם רופא רושם לך תרופות לחץ דם או לב?
6. האם אתה יודע על סיבה רפואית אחרת שבגללה אסור לך להתאמן?
7. האם עברת ניתוח בחצי השנה האחרונה?

הצהרה:
אני מצהיר/ת כי כל המידע שמסרתי הוא נכון ומדויק.
אני מודע/ת שפעילות גופנית כרוכה בסיכונים מסוימים ואני נוטל/ת על עצמי את האחריות לבריאותי.
אני מתחייב/ת לעדכן את המאמן על כל שינוי במצבי הבריאותי.`;

const COOP_TEMPLATE = `הסכם שיתוף פעולה — AthletiGo

חלקי כמאמן:
ללוות אותך בתהליך רכישת המיומנויות, להעצים אותך, לאתגר את היכולות שלך, לעודד אותך ולתמוך בך להשגת התוצאות.

תוצאות:
האימון מיועד להשגת תוצאות, בדגש על פיתוח היכולות שלך. אולם אינני יכול להתחייב לתוצאות מסוימות.

חלקך כמתאמן/ת:
עליך לפעול מתוך אחריות ומחויבות. אורך האימון הוא 60 דקות.

סודיות:
כל מידע או ידע שנמסר הוא סודי בהחלט.

הגנת פרטיות:
בהתאם לחוק הגנת הפרטיות התשמ"א-1981.

ביטול אימון:
יש לבטל אימון לפחות 24 שעות מראש דרך האפליקציה. ביטול באיחור — חיוב מלא.

כרטיסיות והרשמה חודשית:
כרטיסיית אימון בתוקף שלושה חודשים מיום הרכישה.

נטילת אחריות:
הנני מבין שפעילות גופנית כרוכה בסיכון מסוים.

תוקף ההסכם:
בתוקף לכל אורך תהליך האימון. ניתן לסיים בהודעה מראש של שני הצדדים.`;

const PAR_Q = [
  "בעיה בלב ופעילות רק בהמלצת רופא",
  "כאבים בחזה במנוחה או במאמץ",
  "איבוד שיווי משקל / סחרחורות",
  "בעיית עצמות או מפרקים",
  "תרופות לחץ דם או לב",
  "סיבה רפואית אחרת שאוסרת אימון",
  "ניתוח בחצי השנה האחרונה",
];

async function generateAndDownloadPDF(doc, traineeName) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const title = LABELS[doc.document_type] || "מסמך";
  pdf.setFontSize(18);
  pdf.text(title, 105, 20, { align: "center" });
  pdf.setFontSize(11);
  pdf.text(`שם: ${traineeName}`, 20, 35);
  pdf.text(`תאריך חתימה: ${new Date(doc.signed_at).toLocaleDateString("he-IL")}`, 20, 42);
  pdf.line(20, 47, 190, 47);
  let y = 55;
  const template = doc.document_type === 'health_declaration' ? HEALTH_TEMPLATE : COOP_TEMPLATE;
  const data = doc.document_data || {};
  const fullText = data.full_text || data.full_template || template;
  fullText.split('\n').forEach(line => {
    if (y > 270) { pdf.addPage(); y = 20; }
    pdf.text(line, 20, y, { maxWidth: 170 });
    y += 6;
  });
  if (doc.signature_data) {
    if (y > 240) { pdf.addPage(); y = 20; }
    pdf.line(20, y + 5, 100, y + 5);
    pdf.text("חתימה", 20, y + 12);
    try { pdf.addImage(doc.signature_data, "PNG", 20, y - 18, 70, 22); } catch {}
  }
  pdf.save(`${title}_חתום.pdf`);
}

export default function SignedDocumentViewer({ isOpen, onClose, doc, traineeName, currentUserId }) {
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const bodyRef = useRef(null);
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen || !doc) return null;

  const isAgreementTemplate = typeof doc.document_type === 'string' && doc.document_type.startsWith('agreement_');
  const title = DOCUMENT_TEMPLATES[doc.document_type]?.title || LABELS[doc.document_type] || "מסמך";
  const data = doc.document_data || {};
  const signedDate = doc.signed_at ? new Date(doc.signed_at).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  const isHealth = doc.document_type === 'health_declaration';

  // Agreement template (agreement_personal / agreement_group / agreement_online)
  // The body is fully rendered at signing time and stored in document_data.body_rendered.
  if (isAgreementTemplate) {
    const consent = data.field_values?.photo_consent;
    const consentStatus = consent ? getPhotoConsentStatus(consent) : null;
    const isTrainee = !!currentUserId && currentUserId === doc.trainee_id;
    // Upgrade only available to the trainee, only for object-shape consent
    // (legacy string consents have no decided_at to preserve), only when
    // the doc is signed and the current status is denied or deferred.
    const isUpgradable = isTrainee
      && doc.status === 'signed'
      && consent && typeof consent === 'object'
      && consentStatus !== 'allowed';
    const signedDateOnly = doc.signed_at ? new Date(doc.signed_at).toLocaleDateString('he-IL') : '';
    const signedTimeOnly = doc.signed_at
      ? new Date(doc.signed_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
      : '';

    const handleAgreementDownload = async () => {
      if (downloading) return;
      setDownloading(true);
      try {
        const rawName = (data.trainee_name || traineeName || 'document').trim();
        const dateStr = doc.signed_at ? new Date(doc.signed_at).toISOString().slice(0, 10) : 'unsigned';
        await downloadSignedDocument({
          existingUrl: doc.file_url || null,
          nodeRef: bodyRef,
          fileName: `${doc.document_type || 'agreement'}_${rawName}_${dateStr}`,
        });
      } finally {
        setDownloading(false);
      }
    };

    return (
      <div style={{
        position: 'fixed', inset: 0,
        background: 'white', zIndex: 9999,
        display: 'flex', flexDirection: 'column',
        direction: 'rtl',
      }}>
        {/* Sticky header — title on a SINGLE line via flex:1 + minWidth:0 + nowrap + ellipsis.
            Health-viewer tokens (#F0E4D0 border, 18/600/#1A1A1A title). */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid #F0E4D0',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          gap: 12, flexShrink: 0, background: 'white',
        }}>
          <div style={{
            flex: 1, minWidth: 0,
            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'nowrap',
          }}>
            <span style={{
              fontSize: 18, fontWeight: 600, color: '#1A1A1A',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              minWidth: 0, flex: 1,
            }}>{title}</span>
            {doc.signature_data && (
              <span style={{
                fontSize: 12, fontWeight: 700, color: '#fff',
                backgroundColor: '#16a34a',
                padding: '2px 10px', borderRadius: 20,
                display: 'inline-flex', alignItems: 'center', gap: 4,
                flexShrink: 0,
              }}>
                <CheckCircle style={{ width: 12, height: 12 }} />חתום
              </span>
            )}
          </div>
          <button onClick={onClose} aria-label="סגור" style={{
            width: 36, height: 36,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: '50%', border: 'none', background: 'transparent',
            cursor: 'pointer', color: '#888', flexShrink: 0,
          }}>
            <X style={{ width: 20, height: 20 }} />
          </button>
        </div>

        {/* Scrollable body — bodyRef is the snapshot target for the PDF generator. */}
        <div ref={bodyRef} style={{
          flex: 1, overflowY: 'auto', padding: 20,
          WebkitOverflowScrolling: 'touch', background: '#FFFFFF',
        }}>
          {/* Agreement body text — content UNCHANGED, only the box restyled */}
          <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>נוסח ההסכם</div>
          <div style={{
            whiteSpace: 'pre-wrap',
            background: '#FDF8F3',
            border: '1px solid #F0E4D0',
            borderRadius: 12,
            padding: 16,
            color: '#1a1a1a', lineHeight: 1.7, fontSize: 14,
            marginBottom: 16,
          }}>
            {data.body_rendered || '(תוכן ההסכם לא נמצא)'}
          </div>

          {/* Signature — centered, framed card matching HealthDeclarationViewer */}
          {doc.signature_data && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>חתימה</div>
              <div style={{
                padding: 12, borderRadius: 12,
                border: '1px solid #F0E4D0', background: '#FFFFFF',
                textAlign: 'center',
              }}>
                <img
                  src={doc.signature_data}
                  alt="חתימה"
                  style={{ maxWidth: '100%', maxHeight: 120, objectFit: 'contain' }}
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              </div>
            </div>
          )}

          {/* Photo consent — kept, restyled to match (#FDF8F3 / #F0E4D0 / radius 12) */}
          {consent && (
            <div style={{
              marginTop: 16, padding: 14,
              background: '#FDF8F3',
              border: isUpgradable ? '2px solid #FF6F20' : '1px solid #F0E4D0',
              borderRadius: 12,
            }}>
              <div style={{ color: '#FF6F20', fontWeight: 700, marginBottom: 6 }}>
                🔹 שימוש בצילומים לצרכי שיווק
              </div>
              <div style={{ color: '#1a1a1a', fontSize: 14, marginBottom: isUpgradable ? 12 : 0 }}>
                סטטוס נוכחי: {resolvePhotoConsentLabel(consent)}
              </div>
              {isUpgradable && (
                <button
                  onClick={() => setShowUpgrade(true)}
                  style={{
                    background: '#FF6F20', color: '#FFFFFF', border: 'none',
                    borderRadius: 10, padding: 12, fontWeight: 700, fontSize: 14,
                    cursor: 'pointer', width: '100%',
                  }}>
                  שדרג ל&quot;מאשר/ת שימוש בצילומים&quot;
                </button>
              )}
            </div>
          )}

          {/* Bottom signed-at trust pill — matches HealthDeclarationViewer */}
          {doc.signed_at && (
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <span style={{
                display: 'inline-block', padding: '6px 16px', borderRadius: 10,
                background: '#E8F5E9', color: '#2E7D32',
                fontSize: 13, fontWeight: 500,
              }}>
                ✓ נחתם ב-{signedDateOnly} בשעה {signedTimeOnly}
              </span>
            </div>
          )}
        </div>

        {/* Sticky footer — close + download. Download always available
            via the shared helper; it short-circuits to file_url when set,
            otherwise snapshots bodyRef and builds a PDF on demand. */}
        <div style={{
          padding: '16px 20px',
          borderTop: '1px solid #F0E4D0',
          display: 'flex', gap: 8, flexShrink: 0, background: 'white',
        }}>
          <button onClick={onClose} style={{
            flex: 1, height: 52, borderRadius: 12,
            border: '1px solid #F0E4D0', background: '#fff',
            fontSize: 16, fontWeight: 700, color: '#6B7280', cursor: 'pointer',
          }}>סגור</button>
          <button onClick={handleAgreementDownload} disabled={downloading} style={{
            flex: 1, height: 52, borderRadius: 12, border: 'none',
            background: downloading ? '#D1D5DB' : '#FF6F20',
            fontSize: 16, fontWeight: 700, color: '#fff',
            cursor: downloading ? 'wait' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            {downloading
              ? 'שומר...'
              : <><Download style={{ width: 18, height: 18 }} />הורד PDF</>}
          </button>
        </div>

        {showUpgrade && (
          <PhotoConsentUpgradeDialog
            open={showUpgrade}
            onClose={() => setShowUpgrade(false)}
            doc={doc}
          />
        )}
      </div>
    );
  }

  // Get full template — from saved data or hardcoded fallback
  const fullTemplate = data.full_text || data.full_template || (isHealth ? HEALTH_TEMPLATE : COOP_TEMPLATE);

  // Get questions list — from saved or fallback
  const questions = data.questions || PAR_Q;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'white', zIndex: 9999, display: 'flex', flexDirection: 'column', direction: 'rtl' }}>

      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: '#1a1a1a' }}>{title}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', backgroundColor: '#22c55e', padding: '2px 10px', borderRadius: 20, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <CheckCircle style={{ width: 12, height: 12 }} />חתום
            </span>
          </div>
          <div style={{ fontSize: 14, color: '#6B7280', marginTop: 2 }}>נחתם ב: {signedDate}</div>
        </div>
        <button onClick={onClose} style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', border: 'none', background: '#f5f5f5', cursor: 'pointer' }}>
          <X style={{ width: 20, height: 20, color: '#6B7280' }} />
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 20, WebkitOverflowScrolling: 'touch' }}>

        {/* Trainee name */}
        {traineeName && (
          <div style={{ marginBottom: 16 }}>
            <span style={{ fontSize: 14, color: '#666' }}>שם: </span>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#1a1a1a' }}>{data.signed_name || traineeName}</span>
          </div>
        )}

        {/* Full document template text */}
        <div style={{ whiteSpace: 'pre-line', fontSize: 15, lineHeight: 1.8, color: '#1a1a1a', marginBottom: 24, padding: 16, background: '#FAFAFA', borderRadius: 10, border: '1px solid #eee' }}>
          {fullTemplate}
        </div>

        {/* Health declaration — NEW format (v2): structured personal + health + checks */}
        {isHealth && data.health && data.personal && (
          <div style={{ marginBottom: 20 }}>
            {/* Personal */}
            <div style={{ background: '#FFF9F0', border: '1px solid #FFE5D0', borderRadius: 10, padding: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#FF6F20', marginBottom: 6 }}>פרטים אישיים</div>
              <div style={{ fontSize: 13, color: '#1a1a1a', lineHeight: 1.7 }}>
                <div>שם: <strong>{data.personal.full_name}</strong></div>
                {data.personal.id_number && <div>ת״ז: {data.personal.id_number}</div>}
                {data.personal.phone && <div>טלפון: {data.personal.phone}</div>}
                {data.personal.age && <div>גיל: {data.personal.age}</div>}
              </div>
            </div>

            {/* Health questionnaire */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#FF6F20', marginBottom: 6 }}>שאלון בריאות</div>
              {Object.entries(data.health).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
                  <span style={{ color: '#1a1a1a' }}>{k}</span>
                  <span style={{
                    fontWeight: 700, padding: '1px 10px', borderRadius: 20,
                    background: v === 'yes' ? '#FEE2E2' : '#DCFCE7',
                    color: v === 'yes' ? '#B91C1C' : '#166534',
                  }}>{v === 'yes' ? 'כן' : 'לא'}</span>
                </div>
              ))}
              {data.pregnancy && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
                  <span style={{ color: '#1a1a1a' }}>הריון</span>
                  <span style={{ fontWeight: 700, color: '#1a1a1a' }}>
                    {data.pregnancy === 'yes' ? 'כן' : data.pregnancy === 'no' ? 'לא' : 'לא רלוונטי'}
                  </span>
                </div>
              )}
              {data.critical?.doctor_restriction && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13, marginTop: 4, borderTop: '1px solid #FFE5D0', paddingTop: 8 }}>
                  <span style={{ color: '#FF6F20', fontWeight: 700 }}>המלצת רופא להגביל פעילות</span>
                  <span style={{
                    fontWeight: 700, padding: '1px 10px', borderRadius: 20,
                    background: data.critical.doctor_restriction === 'yes' ? '#FEE2E2' : '#DCFCE7',
                    color: data.critical.doctor_restriction === 'yes' ? '#B91C1C' : '#166534',
                  }}>{data.critical.doctor_restriction === 'yes' ? 'כן' : 'לא'}</span>
                </div>
              )}
            </div>

            {data.additional_details && (
              <div style={{ marginBottom: 12, padding: 10, background: '#FFF9F0', border: '1px solid #FF6F20', borderRadius: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#FF6F20', marginBottom: 4 }}>פירוט נוסף</div>
                <div style={{ fontSize: 13, color: '#1a1a1a' }}>{data.additional_details}</div>
              </div>
            )}

            {data.experience_level && (
              <div style={{ marginBottom: 12, fontSize: 13 }}>
                <span style={{ color: '#6B7280' }}>רמת ניסיון: </span>
                <strong style={{ color: '#1a1a1a' }}>{data.experience_level}</strong>
              </div>
            )}
          </div>
        )}

        {/* Health declaration — LEGACY format (v1): array of PAR-Q answers */}
        {isHealth && !data.health && data.answers && Array.isArray(data.answers) && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a1a', marginBottom: 12 }}>תשובות המתאמן:</div>
            {data.answers.map((ans, i) => {
              const q = questions[i] || `שאלה ${i + 1}`;
              return (
                <div key={i} style={{ marginBottom: 12, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ flexShrink: 0, fontSize: 13, fontWeight: 700, padding: '3px 10px', borderRadius: 20, backgroundColor: ans ? '#FEE2E2' : '#DCFCE7', color: ans ? '#B91C1C' : '#166534' }}>
                    {ans ? 'כן' : 'לא'}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a' }}>{q}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Health notes */}
        {data.healthNotes && (
          <div style={{ marginBottom: 16 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#666' }}>הערות בריאותיות: </span>
            <span style={{ fontSize: 15, color: '#1a1a1a' }}>{data.healthNotes}</span>
          </div>
        )}

        {/* Medical alert */}
        {data.hasYes && (
          <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: 12, fontSize: 14, fontWeight: 700, color: '#92400E', marginBottom: 16 }}>
            ⚠️ נדרש אישור רופא לפני תחילת האימונים
          </div>
        )}

        {/* Declaration confirmed */}
        {(data.declaration_confirmed || data.agreement_confirmed) && (
          <div style={{ background: '#f0fdf4', border: '1px solid #22c55e', borderRadius: 8, padding: '12px 16px', fontSize: 14, color: '#166534', marginBottom: 16 }}>
            ✓ {data.declaration_text || 'אני מצהיר/ת כי כל המידע שמסרתי הוא נכון ומדויק'}
          </div>
        )}

        {/* Photo consent */}
        {data.photoConsent !== undefined && (
          <div style={{ background: data.photoConsent ? '#f0fdf4' : '#FEF2F2', border: `1px solid ${data.photoConsent ? '#22c55e' : '#FECACA'}`, borderRadius: 8, padding: '12px 16px', fontSize: 14, fontWeight: 600, color: data.photoConsent ? '#166534' : '#991B1B', marginBottom: 16 }}>
            {data.photoConsent ? '✓ מסכים/ה לשימוש בתמונות לצורכי שיווק' : '✗ לא מסכים/ה לשימוש בתמונות'}
          </div>
        )}

        {/* Signature */}
        <div style={{ borderTop: '2px solid #eee', paddingTop: 20, marginTop: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#666', marginBottom: 8 }}>חתימה דיגיטלית</div>
          {doc.signature_data && (
            <img src={doc.signature_data} alt="חתימה" style={{ maxWidth: 220, height: 80, objectFit: 'contain', border: '1px solid #ddd', borderRadius: 8, background: 'white', padding: 8, display: 'block' }} />
          )}
          <div style={{ fontSize: 13, color: '#666', marginTop: 8 }}>שם: {data.signed_name || traineeName}</div>
          <div style={{ fontSize: 13, color: '#666' }}>תאריך: {signedDate}</div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '16px 20px', borderTop: '1px solid #eee', display: 'flex', gap: 8, flexShrink: 0, background: 'white' }}>
        <button onClick={onClose} style={{ flex: 1, height: 52, borderRadius: 12, border: '1px solid #E5E7EB', background: '#fff', fontSize: 16, fontWeight: 700, color: '#6B7280', cursor: 'pointer' }}>סגור</button>
        <button onClick={() => { if (doc.file_url) window.open(doc.file_url, '_blank'); else generateAndDownloadPDF(doc, traineeName); }}
          style={{ flex: 1, height: 52, borderRadius: 12, border: 'none', background: '#FF6F20', fontSize: 16, fontWeight: 700, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Download style={{ width: 18, height: 18 }} />הורד PDF
        </button>
      </div>
    </div>
  );
}
