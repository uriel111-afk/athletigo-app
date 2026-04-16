import React from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle, Download, X } from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";

const LABELS = {
  health_declaration: 'הצהרת בריאות',
  cooperation_agreement: 'הסכם שיתוף פעולה',
};

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
  if (!doc) return null;

  const title = LABELS[doc.document_type] || "מסמך";
  const data = doc.document_data || {};
  const signedDate = doc.signed_at ? format(new Date(doc.signed_at), "dd/MM/yyyy HH:mm", { locale: he }) : "—";

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] p-0 overflow-hidden" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg text-gray-900">{title}</span>
            <span className="flex items-center gap-1 text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-full">
              <CheckCircle className="w-3 h-3" />חתום
            </span>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100"><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        {/* Body */}
        <div className="p-4 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 180px)' }}>
          <div className="space-y-3">
            <div className="text-sm text-gray-500">נחתם ב: {signedDate}</div>
            {traineeName && <div className="text-sm"><span className="text-gray-500">שם: </span><span className="font-bold text-gray-900">{traineeName}</span></div>}

            {/* Health declaration answers */}
            {data.answers && Array.isArray(data.answers) && (
              <div className="mt-3 space-y-2">
                <h4 className="font-bold text-sm text-gray-800 border-b pb-1">שאלון בריאות</h4>
                {data.answers.map((ans, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm py-1">
                    <span className={`flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-full ${ans ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                      {ans ? 'כן' : 'לא'}
                    </span>
                    <span className="text-gray-700">{PAR_Q[i] || `שאלה ${i + 1}`}</span>
                  </div>
                ))}
              </div>
            )}

            {data.healthNotes && (
              <div className="mt-2 text-sm"><span className="text-gray-500 font-medium">הערות: </span><span className="text-gray-900">{data.healthNotes}</span></div>
            )}

            {data.hasYes && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 font-bold">
                נדרש אישור רפואי
              </div>
            )}

            {data.photoConsent !== undefined && (
              <div className="text-sm"><span className="text-gray-500 font-medium">הסכמה לתמונות: </span><span className="text-gray-900">{data.photoConsent ? 'כן' : 'לא'}</span></div>
            )}

            {/* Signature */}
            {doc.signature_data && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <p className="text-sm font-bold text-gray-700 mb-2">חתימה דיגיטלית</p>
                <img src={doc.signature_data} alt="חתימה" className="rounded-lg bg-white" style={{ maxWidth: 200, border: '1px solid #E0E0E0' }} />
                <p className="text-xs text-gray-400 mt-2">תאריך חתימה: {signedDate}</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 flex gap-3">
          <Button variant="outline" className="flex-1 rounded-xl h-11 text-sm" onClick={onClose}>סגור</Button>
          <Button className="flex-1 rounded-xl h-11 text-sm text-white" style={{ backgroundColor: '#FF6F20' }}
            onClick={() => {
              if (doc.file_url) { window.open(doc.file_url, '_blank'); }
              else { generateAndDownloadPDF(doc, traineeName); }
            }}>
            <Download className="w-4 h-4 ml-1.5" />הורד PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
