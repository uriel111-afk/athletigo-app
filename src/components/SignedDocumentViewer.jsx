import React, { useEffect } from "react";
import { X, Download, CheckCircle } from "lucide-react";

const LABELS = {
  health_declaration: 'הצהרת בריאות',
  cooperation_agreement: 'הסכם שיתוף פעולה',
};

const PAR_Q = [
  "האם רופא אמר לך שיש לך בעיה בלב ושעליך לבצע פעילות גופנית רק בהמלצת רופא?",
  "האם אתה סובל מכאבים בחזה במנוחה או במאמץ?",
  "האם אתה מאבד שיווי משקל בגלל סחרחורות או מאבד הכרה?",
  "האם יש לך בעיית עצמות או מפרקים שעלולה להחמיר עם פעילות גופנית?",
  "האם רופא רושם לך תרופות לחץ דם או לב?",
  "האם אתה יודע על סיבה רפואית אחרת שבגללה אסור לך להתאמן?",
  "האם עברת ניתוח בחצי השנה האחרונה?",
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
  if (doc.document_data) {
    const data = doc.document_data;
    if (data.answers && Array.isArray(data.answers)) {
      data.answers.forEach((ans, i) => {
        if (y > 250) { pdf.addPage(); y = 20; }
        pdf.text(`${PAR_Q[i] || `שאלה ${i + 1}`}: ${ans ? "כן" : "לא"}`, 20, y);
        y += 8;
      });
    }
    if (data.healthNotes) { pdf.text(`הערות: ${data.healthNotes}`, 20, y); y += 8; }
    if (data.photoConsent !== undefined) { pdf.text(`הסכמה לשימוש בתמונות: ${data.photoConsent ? "כן" : "לא"}`, 20, y); y += 8; }
  }
  if (doc.signature_data) {
    pdf.line(20, 260, 100, 260);
    pdf.text("חתימה", 20, 267);
    pdf.text(`תאריך: ${new Date(doc.signed_at).toLocaleDateString("he-IL")}`, 120, 267);
    try { pdf.addImage(doc.signature_data, "PNG", 20, 238, 70, 22); } catch {}
  }
  pdf.save(`${title}_חתום.pdf`);
}

export default function SignedDocumentViewer({ isOpen, onClose, doc, traineeName }) {
  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) { document.body.style.overflow = 'hidden'; }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen || !doc) return null;

  const title = LABELS[doc.document_type] || "מסמך";
  const data = doc.document_data || {};
  const signedDate = doc.signed_at ? new Date(doc.signed_at).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'white', zIndex: 9999, display: 'flex', flexDirection: 'column', direction: 'rtl' }}>

      {/* ── Header ── */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#1a1a1a' }}>{title}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', backgroundColor: '#22c55e', padding: '2px 10px', borderRadius: 20, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <CheckCircle style={{ width: 12, height: 12 }} />חתום
            </span>
          </div>
          <div style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>נחתם ב: {signedDate}</div>
        </div>
        <button onClick={onClose} style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', border: 'none', background: '#f5f5f5', cursor: 'pointer' }}>
          <X style={{ width: 20, height: 20, color: '#6B7280' }} />
        </button>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 20, WebkitOverflowScrolling: 'touch' }}>

        {/* Trainee details */}
        {traineeName && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>שם</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#1a1a1a' }}>{traineeName}</div>
          </div>
        )}
        <div style={{ height: 1, background: '#eee', marginBottom: 20 }} />

        {/* Health declaration answers */}
        {data.answers && Array.isArray(data.answers) && (
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a', marginBottom: 12 }}>שאלון בריאות (PAR-Q)</div>
            {data.answers.map((ans, i) => (
              <div key={i} style={{ marginBottom: 14, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{
                  flexShrink: 0, fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                  backgroundColor: ans ? '#FEE2E2' : '#DCFCE7', color: ans ? '#B91C1C' : '#166534',
                }}>{ans ? 'כן' : 'לא'}</span>
                <div>
                  <div style={{ fontSize: 13, color: '#666', marginBottom: 2 }}>שאלה {i + 1}</div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: '#1a1a1a', lineHeight: 1.5 }}>{PAR_Q[i]}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {data.healthNotes && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>הערות בריאותיות</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#1a1a1a' }}>{data.healthNotes}</div>
          </div>
        )}

        {data.hasYes && (
          <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: 12, fontSize: 14, fontWeight: 700, color: '#92400E', marginBottom: 16 }}>
            נדרש אישור רפואי לפני תחילת האימונים
          </div>
        )}

        {data.photoConsent !== undefined && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>הסכמה לשימוש בתמונות</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#1a1a1a' }}>{data.photoConsent ? 'כן — מסכים/ה' : 'לא'}</div>
          </div>
        )}

        {/* Signature */}
        <div style={{ marginTop: 32, padding: 20, background: '#F9F9F9', borderRadius: 12, border: '1px solid #eee' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a', marginBottom: 12 }}>חתימה דיגיטלית</div>
          {doc.signature_data && (
            <img src={doc.signature_data} alt="חתימה" style={{ maxWidth: '100%', height: 80, objectFit: 'contain', border: '1px solid #ddd', borderRadius: 8, background: 'white', padding: 8 }} />
          )}
          <div style={{ fontSize: 13, color: '#666', marginTop: 8 }}>תאריך: {signedDate}</div>
          {traineeName && <div style={{ fontSize: 13, color: '#666' }}>שם: {traineeName}</div>}
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{ padding: '16px 20px', borderTop: '1px solid #eee', display: 'flex', gap: 8, flexShrink: 0, background: 'white' }}>
        <button onClick={onClose} style={{ flex: 1, height: 52, borderRadius: 12, border: '1px solid #E5E7EB', background: '#fff', fontSize: 16, fontWeight: 700, color: '#6B7280', cursor: 'pointer' }}>
          סגור
        </button>
        <button onClick={() => { if (doc.file_url) window.open(doc.file_url, '_blank'); else generateAndDownloadPDF(doc, traineeName); }}
          style={{ flex: 1, height: 52, borderRadius: 12, border: 'none', background: '#FF6F20', fontSize: 16, fontWeight: 700, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Download style={{ width: 18, height: 18 }} />הורד PDF
        </button>
      </div>
    </div>
  );
}
