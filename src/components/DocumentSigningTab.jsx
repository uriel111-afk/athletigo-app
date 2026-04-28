import React, { useState, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Loader2, FileText, CheckCircle, Download, Eye, ChevronDown, ChevronUp, AlertTriangle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import SignatureCanvas from "./SignatureCanvas";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import SignedDocumentViewer from "./SignedDocumentViewer";
import HealthDeclarationViewer from "./HealthDeclarationViewer";
import HealthDeclarationFormModal from "./forms/HealthDeclarationForm";
import SignPendingAgreementDialog from "./forms/SignPendingAgreementDialog";
import { DOCUMENT_TEMPLATES } from "@/lib/documentTemplates";

async function generatePdfFromRef(ref, fileName) {
  const canvas = await html2canvas(ref, { scale: 2, useCORS: true, backgroundColor: '#FFFFFF' });
  const imgData = canvas.toDataURL('image/jpeg', 0.85);
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageW = 210;
  const margin = 10;
  const contentW = pageW - margin * 2;
  const imgH = (canvas.height / canvas.width) * contentW;
  let y = margin;
  const pageH = 297 - margin * 2;

  // Multi-page support
  if (imgH <= pageH) {
    pdf.addImage(imgData, 'JPEG', margin, y, contentW, imgH);
  } else {
    // Split across pages
    const totalPages = Math.ceil(imgH / pageH);
    for (let p = 0; p < totalPages; p++) {
      if (p > 0) pdf.addPage();
      const srcY = (p * pageH / imgH) * canvas.height;
      const srcH = Math.min((pageH / imgH) * canvas.height, canvas.height - srcY);
      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = srcH;
      sliceCanvas.getContext('2d').drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH);
      const sliceData = sliceCanvas.toDataURL('image/jpeg', 0.85);
      const sliceH = (srcH / canvas.width) * contentW;
      pdf.addImage(sliceData, 'JPEG', margin, margin, contentW, sliceH);
    }
  }

  return new File([pdf.output('blob')], fileName, { type: 'application/pdf' });
}

function CooperationAgreementForm({ user, onSign, isSigning }) {
  const [photoConsent, setPhotoConsent] = useState(false);
  const sigRef = useRef(null);
  const formRef = useRef(null);

  const handleSign = async () => {
    if (!sigRef.current?.hasSignature()) { toast.error("יש לחתום לפני השליחה"); return; }
    const sig = sigRef.current.getSignature();
    const pdfFile = await generatePdfFromRef(formRef.current, `הסכם_שיתוף_פעולה_${user.full_name}_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    const agreementText = `הסכם שיתוף פעולה — AthletiGo\n\nשם: ${user.full_name}\nתאריך: ${format(new Date(), 'dd/MM/yyyy')}\n\nחלקי כמאמן:\nללוות אותך בתהליך רכישת המיומנויות, להעצים אותך, לאתגר את היכולות שלך, לעודד אותך ולתמוך בך.\n\nתוצאות:\nהאימון מיועד להשגת תוצאות, בדגש על פיתוח היכולות שלך.\n\nחלקך כמתאמן/ת:\nעליך לפעול מתוך אחריות ומחויבות. אורך האימון הוא 60 דקות.\n\nסודיות:\nכל מידע שנמסר הוא סודי בהחלט.\n\nהגנת פרטיות:\nבהתאם לחוק הגנת הפרטיות התשמ"א-1981.\n\nביטול אימון:\nיש לבטל לפחות 24 שעות מראש. ביטול באיחור — חיוב מלא.\n\nכרטיסיות והרשמה חודשית:\nכרטיסייה בתוקף 3 חודשים.\n\nנטילת אחריות:\nהנני מבין שפעילות גופנית כרוכה בסיכון מסוים.\n\nתוקף ההסכם:\nבתוקף לכל אורך תהליך האימון.\n\nהסכמה לתמונות: ${photoConsent ? 'כן' : 'לא'}`;

    await onSign('cooperation_agreement', sig, pdfFile, {
      full_text: agreementText,
      photoConsent,
      agreement_confirmed: true,
      signed_name: user.full_name,
    });
  };

  const name = user.full_name || "המתאמן/ת";

  return (
    <div>
      <div ref={formRef} className="bg-white p-5 space-y-4 text-right text-sm text-gray-700 leading-relaxed" dir="rtl">
        <div className="text-center border-b pb-4">
          <h3 className="text-lg font-black text-gray-900">הסכם שיתוף פעולה</h3>
          <p className="text-xs text-gray-400 mt-1">AthletiGo</p>
        </div>

        <div className="space-y-1">
          <div className="py-1"><span className="text-gray-500 font-medium">שם מלא: </span><span className="text-gray-900">{user.full_name}</span></div>
          <div className="py-1"><span className="text-gray-500 font-medium">תאריך: </span><span className="text-gray-900">{format(new Date(), 'dd/MM/yyyy')}</span></div>
        </div>

        <p>שלום {name},<br />
        אני מברך אותך על ההחלטה לעבור איתי את התהליך הספורטיבי שלך. יש לי הערכה רבה לכל אדם שמאמין ובוחר בפיתוח כושר ושמירה על אורח חיים בריא לטווח הארוך.<br />
        ברוכים הבאים, הגעת למקום המקצועי ביותר ללמידת מיומנויות כושר.<br />
        חשוב להבין שהמידע אותו אתה מבקש ללמוד מצריך זמן הסתגלות, עבודה עצמאית והשקעה בתזונה. אלו המרכיבים המשפיעים ביותר על התוצאות.<br />
        אני כאן ללוות אותך, לתת לך מוטיבציה ולהשתמש במיטב הכישורים שלי כדי לצמצם את הזמן להשגת התוצאות. יחד אנחנו יכולים לעשות זאת, ובזמן שיא.</p>

        <div>
          <h4 className="font-bold text-gray-900 mb-1">חלקי כמאמן</h4>
          <p>ללוות אותך בתהליך רכישת המיומנויות, להעצים אותך, לאתגר את היכולות שלך, לעודד אותך ולתמוך בך להשגת התוצאות. לספק לך כלים אפקטיביים שיסייעו בהגשמת מטרותיך. להיות איתך בכנות מלאה ולהביא את מיטב היכולות והכישורים שלי לכל מפגש או אימון. לשמור על כללי האתיקה המקצועית שלי כמאמן.</p>
        </div>

        <div>
          <h4 className="font-bold text-gray-900 mb-1">תוצאות</h4>
          <p>האימון מיועד להשגת תוצאות, בדגש על פיתוח היכולות שלך. אולם אינני יכול להתחייב לתוצאות מסוימות. הציפייה שלי היא שתפיק תוצאות מסוימות מכל פגישה. אם אתה מרגיש שזה לא המצב, אבקש שתעדכן אותי ונבדוק כיצד אפשר לשפר את האימון.<br />
          אני מתחייב להיענות לכל אתגר שהאימון איתך יציב בפניי. אני שמח ומתרגש לצאת איתך לתהליך של שינוי, צמיחה והגשמה עצמית.</p>
        </div>

        <div>
          <h4 className="font-bold text-gray-900 mb-1">חלקך כמתאמן/ת</h4>
          <p>עליך לפעול מתוך אחריות ומחויבות ליצירת פריצת דרך בחייך בעזרת הכלים אותם תלמד. למלא את משימות האימון במלואן ולהרגיל את עצמך למשמעת עצמית שמטרתה להשיג מטרות. עליך להקפיד על רצף אימונים ולעמוד בלוח הזמנים שקבענו ולהקדיש תשומת לב לגוף שלך בעולם הספורט. אורך האימון הוא 60 דקות.</p>
        </div>

        <div>
          <h4 className="font-bold text-gray-900 mb-1">סודיות</h4>
          <p>כל מידע או ידע שנמסר על ידי הוא סודי בהחלט. השימוש בו מותר למטרות אישיות בלבד. לא אמסור שום פרט משיחותינו לאף אדם אחר, אך ישנם מקרים שבהם אני כן מוסר מידע: התייעצויות שלי עם מספר מצומצם של קולגות. לאנשים אלה אני מספר לעתים מה מתרחש באימון, ללא שם וללא פרטים מזהים.</p>
        </div>

        <div>
          <h4 className="font-bold text-gray-900 mb-1">הגנת פרטיות</h4>
          <p>אני מתחייב לשמור על פרטיותך בהתאם לחוק הגנת הפרטיות התשמ"א-1981. כל המידע האישי שלך נשמר במערכת מאובטחת ולא יועבר לצד שלישי ללא הסכמתך המפורשת, למעט במקרים שמחויבים על פי חוק.</p>
        </div>

        <div>
          <h4 className="font-bold text-gray-900 mb-1">ביטול אימון</h4>
          <p>אני מתכונן לאימונים שלנו וגם מסרב ללקוחות אחרים המבקשים להתאמן באותו זמן. לכן אבקש לבטל אימון מוקדם ככל הניתן, ובכל מקרה לפחות 24 שעות מראש דרך האפליקציה. עבור ביטול של אימון פחות מ-24 שעות מראש, מכל סיבה שהיא, אגבה תשלום מלא עבור האימון.<br />
          אפשר לבוא לא מרגישים טוב, עייפים או מוטרדים לאימון — במקרים רבים זה עשוי להיות יעיל וחיוני מאוד.<br />
          במקרה ותחילת האימון תתאחר, נשתמש בזמן שנותר ואני אעשה כמיטב יכולתי להאריך את זמן האימון, בהתאם ללוח הזמנים שלי.</p>
        </div>

        <div>
          <h4 className="font-bold text-gray-900 mb-1">כרטיסיות והרשמה חודשית</h4>
          <p>בהרשמה חודשית, הפסקת ההרשמה תחל מסוף חודש ההרשמה. כרטיסיית אימון היא בתוקף של שלושה חודשים מיום הרכישה. ביטול הכרטיסייה לפני סיומה תחושב בעלות של 350 ש"ח למפגש שבוצע.</p>
        </div>

        <div>
          <h4 className="font-bold text-gray-900 mb-1">נטילת אחריות</h4>
          <p>הנני מבין שפעילות גופנית כרוכה בסיכון מסוים, ואני נוטל אחריות על מצבי הגופני בכפוף להצהרת הבריאות שמסרתי. המאמן יפעל לפי כללי הבטיחות המקצועיים בתחום, ויעשה כל מאמץ לצמצם סיכונים.</p>
        </div>

        <div>
          <h4 className="font-bold text-gray-900 mb-1">תוקף ההסכם</h4>
          <p>הסכם זה בתוקף לכל אורך תהליך האימון. ניתן לסיים את ההסכם בהודעה מראש של שני הצדדים.</p>
        </div>

        <div className="bg-gray-50 rounded-xl p-3 flex items-start gap-3">
          <input type="checkbox" checked={photoConsent} onChange={e => setPhotoConsent(e.target.checked)}
            className="w-5 h-5 mt-0.5 rounded border-gray-300 flex-shrink-0" />
          <p className="text-xs text-gray-600">אני מסכים/ה שהמאמן ישתמש בתמונות וסרטונים שלי לצורכי שיווק וקידום. אני יכול/ה לחזור בי מהסכמה זו בכל עת על ידי פנייה למאמן.</p>
        </div>

        <div className="bg-orange-50 rounded-xl p-3 border border-orange-100">
          <p className="text-xs font-bold text-gray-800">לאחר שקראתי והסכמתי עם כל האמור לעיל, אני מבקש/ת להתחיל את התהליך.</p>
        </div>

        <div>
          <label className="text-sm font-bold text-gray-700 block mb-2">חתימה דיגיטלית</label>
          <SignatureCanvas ref={sigRef} />
        </div>
      </div>

      <div className="px-5 pb-5 bg-white">
        <Button onClick={handleSign} disabled={isSigning}
          className="w-full rounded-xl py-3 font-bold text-white min-h-[48px] text-base"
          style={{ backgroundColor: '#FF6F20' }}>
          {isSigning ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" />שומר...</> : 'אני מאשר/ת וחותם/ת'}
        </Button>
      </div>
    </div>
  );
}

export default function DocumentSigningTab({ effectiveUser, isCoach, onUserUpdate, currentUserId }) {
  const [signingType, setSigning] = useState(null);
  const [expandedDoc, setExpandedDoc] = useState(null);
  const [signedDocs, setSignedDocs] = useState([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [viewingDoc, setViewingDoc] = useState(null);
  const [viewingHealth, setViewingHealth] = useState(false);
  const [signingHealth, setSigningHealth] = useState(false);

  const user = effectiveUser;

  // Fetch signed documents from signed_documents table
  const fetchDocs = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from('signed_documents')
        .select('*')
        .eq('trainee_id', user.id)
        .order('created_at', { ascending: true });
      if (error) console.error("[DocumentSigning] Fetch error:", error);
      setSignedDocs(data || []);
    } catch (e) {
      console.error("[DocumentSigning] Fetch exception:", e);
    } finally {
      setDocsLoading(false);
    }
  }, [user?.id]);

  React.useEffect(() => { fetchDocs(); }, [fetchDocs]);

  // Refetch when AgreementFlowDialog / DocumentPickerDialog / SignPending
  // dispatches the cross-component refresh signal (the docs list isn't
  // wired through TanStack Query, so invalidateQueries doesn't reach it).
  React.useEffect(() => {
    const onChange = (e) => {
      if (!user?.id) return;
      if (e?.detail?.traineeId && e.detail.traineeId !== user.id) return;
      fetchDocs();
    };
    window.addEventListener('signed-documents-changed', onChange);
    return () => window.removeEventListener('signed-documents-changed', onChange);
  }, [user?.id, fetchDocs]);

  // Realtime — cross-device sync. Coach signs on laptop → trainee phone
  // refreshes the list without a manual reload.
  React.useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`signed-docs-${user.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'signed_documents',
        filter: `trainee_id=eq.${user.id}`
      }, () => fetchDocs())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [user?.id, fetchDocs]);

  // Local UI state for the agreement-sign flow (trainee opens a pending agreement)
  const [signingPendingDoc, setSigningPendingDoc] = useState(null);

  if (!user) return null;

  // Build docs list: every row in signed_documents becomes its own list entry.
  // Group by document_type for the latest/old badge calculation. The unique
  // constraint on (trainee_id, document_type) was dropped so multiple signed
  // rows of the same type accumulate as history.
  const formatDocDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('he-IL');
  };

  const titleForType = (type) => {
    if (DOCUMENT_TEMPLATES[type]?.title) return DOCUMENT_TEMPLATES[type].title;
    if (type === 'cooperation_agreement') return 'הסכם שיתוף פעולה';
    if (type === 'health_declaration')    return 'הצהרת בריאות';
    return type;
  };

  // Group docs by type, sort newest-first within each group
  const grouped = new Map();
  for (const r of signedDocs) {
    const t = r.document_type;
    if (!grouped.has(t)) grouped.set(t, []);
    grouped.get(t).push(r);
  }
  for (const arr of grouped.values()) {
    arr.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  // Map each row to a docs[] entry, computing latest/old badge per type.
  const docs = [];
  for (const [type, arr] of grouped.entries()) {
    const baseTitle = titleForType(type);
    const signedRowsInGroup = arr.filter(r => r.status === 'signed');
    const latestSignedId = signedRowsInGroup[0]?.id; // newest signed = current
    arr.forEach((r) => {
      let badge = null;
      if (r.status === 'pending') badge = 'pending';
      else if (r.status === 'signed' && r.id === latestSignedId) badge = 'current';
      else if (r.status === 'signed') badge = 'old';
      docs.push({
        key: `${type}_${r.id}`,
        docType: type,
        label: arr.length > 1
          ? `${baseTitle} — ${formatDocDate(r.signed_at || r.created_at)}`
          : baseTitle,
        signedAt: r.signed_at || null,
        sigData: r.signature_data || null,
        pdfUrl: r.file_url || null,
        metadata: r.document_data || null,
        record: r,
        recordId: r.id,
        badge,
      });
    });
  }

  // Pending placeholders for the two built-in types when no row of that type
  // exists yet (lets the trainee see them as call-to-action items).
  if (!grouped.has('cooperation_agreement')) {
    docs.unshift({ key: 'cooperation_agreement_new', docType: 'cooperation_agreement', label: 'הסכם שיתוף פעולה', signedAt: null, sigData: null, pdfUrl: null, metadata: null, record: null, badge: null });
  }
  if (!grouped.has('health_declaration')) {
    docs.push({ key: 'health_declaration_new', docType: 'health_declaration', label: 'הצהרת בריאות', signedAt: null, sigData: null, pdfUrl: null, metadata: null, record: null, badge: null });
  }

  const signedCount = docs.filter(d => d.signedAt).length;
  const totalDocs = docs.length;

  // (handleAddHealthDeclaration removed — same pending-row insert now
  // happens via DocumentPickerDialog's 'הצהרת בריאות' card in the
  // top-level "+ הוסף מסמך לחתימה" menu on TraineeProfile.)

  const handleDeleteDocument = async (docId, isSigned) => {
    if (isSigned) {
      const confirmed = window.confirm('האם למחוק מסמך חתום? פעולה זו אינה הפיכה.');
      if (!confirmed) return;
    }
    try {
      const { error } = await supabase.from('signed_documents').delete().eq('id', docId);
      if (error) throw error;
      toast.success("המסמך נמחק");
      await fetchDocs();
    } catch (e) {
      toast.error("שגיאה במחיקה: " + (e?.message || "נסה שוב"));
    }
  };

  const handleSign = async (docType, signatureDataUrl, pdfFile, metadata) => {
    setSigning(docType);
    try {
      // 1. Upload PDF (best-effort — never blocks signing)
      let pdfUrl = null;
      try {
        const result = await base44.integrations.UploadFile({ file: pdfFile });
        pdfUrl = result.file_url;
      } catch {
        try {
          const fileName = `documents/${user.id}/${docType}_${Date.now()}.pdf`;
          const { error: storageErr } = await supabase.storage
            .from('media')
            .upload(fileName, pdfFile, { contentType: 'application/pdf', upsert: true });
          if (!storageErr) {
            const { data: urlData } = supabase.storage.from('media').getPublicUrl(fileName);
            pdfUrl = urlData?.publicUrl || null;
          }
        } catch {}
      }

      // 2. Save to signed_documents table — plain INSERT (the unique
      // constraint on (trainee_id, document_type) was removed in Supabase),
      // so every signing creates a new row and full history is preserved.
      const { error } = await supabase
        .from('signed_documents')
        .insert({
          trainee_id: user.id,
          coach_id: user.coach_id || null,
          document_type: docType,
          document_data: metadata || {},
          signature_data: signatureDataUrl,
          signed_at: new Date().toISOString(),
          status: 'signed',
          is_locked: true,
          file_url: pdfUrl || null,
        });

      if (error) throw error;

      // Clean up any pending placeholder rows for this trainee+docType so the
      // list doesn't show "ממתין לחתימה" alongside the freshly signed entry.
      try {
        await supabase
          .from('signed_documents')
          .delete()
          .eq('trainee_id', user.id)
          .eq('document_type', docType)
          .eq('status', 'pending');
      } catch (cleanupErr) {
        console.warn('[DocumentSigning] pending cleanup failed:', cleanupErr);
      }

      toast.success("המסמך נחתם ונשמר בהצלחה");
      setExpandedDoc(null);
      await fetchDocs();
      if (onUserUpdate) onUserUpdate();
    } catch (error) {
      console.error("[DocumentSigning] Error:", error);
      toast.error("שגיאה בשמירת הטופס: " + (error?.message || "נסה שוב"));
    } finally {
      setSigning(null);
    }
  };

  return (
    <div className="space-y-4 w-full">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <FileText className="w-5 h-5 text-[#FF6F20]" />טפסים ומסמכים
        </h2>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${signedCount === totalDocs ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
            {signedCount}/{totalDocs} נחתמו
          </span>
        </div>
      </div>

      {docs.map(doc => {
        const isSigned = !!doc.signedAt;
        const isExpanded = expandedDoc === doc.key;
        const canSign = !isSigned;
        const isAgreementType = typeof doc.docType === 'string' && doc.docType.startsWith('agreement_');
        const isPendingAgreement = isAgreementType && doc.record && doc.record.status === 'pending';

        // Pending agreement rows get a prominent CTA layout — body is already
        // rendered into doc.metadata.body_rendered, so the dedicated dialog
        // just has to capture a signature against the existing row id.
        if (isPendingAgreement) {
          const sentAt = doc.record.document_data?.sent_at || doc.record.created_at;
          return (
            <div key={doc.key}
              style={{
                background: '#FFF9F0', border: '2px solid #FF6F20', borderRadius: 10,
                padding: 14, marginBottom: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                flexWrap: 'wrap',
              }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#1a1a1a', fontWeight: 700, fontSize: 14 }}>{doc.label}</div>
                <div style={{ color: '#6b7280', fontSize: 12, marginTop: 2 }}>
                  נשלח: {format(new Date(sentAt), 'dd/MM/yyyy HH:mm', { locale: he })}
                </div>
              </div>
              <span style={{
                fontSize: 11, fontWeight: 700, color: '#FF6F20',
                background: '#FFFFFF', border: '1px solid #FF6F20',
                padding: '2px 8px', borderRadius: 12,
              }}>ממתין לחתימה</span>
              <Button onClick={() => setSigningPendingDoc(doc.record)} size="sm"
                style={{ background: '#FF6F20', color: '#FFFFFF' }}>
                חתום על ההסכם
              </Button>
              {isCoach && (
                <button onClick={() => handleDeleteDocument(doc.record.id, false)}
                  className="p-1 rounded-full hover:bg-red-50 transition-colors" title="מחק מסמך">
                  <Trash2 className="w-4 h-4 text-red-400 hover:text-red-600" />
                </button>
              )}
            </div>
          );
        }

        return (
          <div key={doc.key} className="bg-white rounded-xl border-2 shadow-sm overflow-hidden"
            style={{ borderColor: isSigned ? '#4CAF50' : '#FF6F20' }}>

            {/* Header */}
            <button onClick={() => {
                // Health declaration uses the canonical modal form for both
                // trainee onboarding and coach hand-the-phone-over flows —
                // open it directly instead of expanding inline.
                if (!isSigned && doc.docType === 'health_declaration' && canSign) {
                  setSigningHealth(true);
                  return;
                }
                setExpandedDoc(isExpanded ? null : doc.key);
              }}
              className="w-full p-4 flex items-center justify-between bg-gray-50/30 hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5" style={{ color: isSigned ? '#4CAF50' : '#FF6F20' }} />
                <span className="font-bold text-sm text-gray-900">{doc.label}</span>
              </div>
              <div className="flex items-center gap-2">
                {isCoach && doc.record?.id && (
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteDocument(doc.record.id, isSigned); }}
                    className="p-1 rounded-full hover:bg-red-50 transition-colors" title="מחק מסמך">
                    <Trash2 className="w-4 h-4 text-red-400 hover:text-red-600" />
                  </button>
                )}
                {/* Status / lifecycle badge */}
                {doc.badge === 'current' && (
                  <span className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full"
                    style={{ background: '#DCFCE7', color: '#16a34a' }}>
                    <CheckCircle className="w-3 h-3" /> נוכחי
                  </span>
                )}
                {doc.badge === 'old' && (
                  <span className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full"
                    style={{ background: '#F3F4F6', color: '#6b7280' }}>
                    ישן
                  </span>
                )}
                {doc.badge === 'pending' && (
                  <span className="text-xs font-bold px-2 py-1 rounded-full"
                    style={{ background: '#FFF9F0', color: '#FF6F20', border: '1px solid #FF6F20' }}>
                    ממתין לחתימה
                  </span>
                )}
                {!doc.badge && !isSigned && (
                  <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-full">ממתין לחתימה</span>
                )}
                {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </div>
            </button>

            {/* Signed info */}
            {isSigned && !isExpanded && (
              <div className="px-4 pb-3 flex items-center justify-between">
                <p className="text-xs text-gray-500">נחתם ב-{format(new Date(doc.signedAt), 'dd/MM/yyyy HH:mm', { locale: he })}</p>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1" style={{ borderColor: '#FF6F20', color: '#FF6F20' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (doc.docType === 'health_declaration') setViewingHealth(true);
                    else setViewingDoc(doc.record);
                  }}>
                  <Eye className="w-3 h-3" />צפה במסמך החתום
                </Button>
              </div>
            )}

            {/* Expanded: signed view */}
            {isSigned && isExpanded && (
              <div className="p-4 border-t border-gray-100 space-y-3">
                <div className="text-right text-sm py-1">
                  <span className="text-gray-500 font-medium">תאריך חתימה: </span>
                  <span className="text-gray-900">{format(new Date(doc.signedAt), 'dd/MM/yyyy HH:mm', { locale: he })}</span>
                </div>
                {doc.sigData && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1 text-right">חתימה:</p>
                    <img src={doc.sigData} alt="חתימה" className="h-16 border rounded-lg bg-white" style={{ border: '1px solid #E0E0E0' }} />
                  </div>
                )}
                {doc.pdfUrl ? (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="h-9 text-xs gap-1 flex-1" onClick={() => window.open(doc.pdfUrl, '_blank')}>
                      <Eye className="w-3.5 h-3.5" />צפייה ב-PDF
                    </Button>
                    <Button variant="outline" size="sm" className="h-9 text-xs gap-1 flex-1" onClick={() => {
                      const a = document.createElement('a'); a.href = doc.pdfUrl; a.download = `${doc.label}.pdf`; a.click();
                    }}>
                      <Download className="w-3.5 h-3.5" />הורד PDF
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 text-center">PDF לא זמין — החתימה נשמרה במערכת</p>
                )}
              </div>
            )}

            {/* Expanded: signing form (trainee fills directly, or coach hands the phone over).
                Health declaration is handled via the canonical modal opened
                from the row's header click — only the cooperation/agreement
                forms still render inline here. */}
            {!isSigned && isExpanded && canSign && doc.docType !== 'health_declaration' && (
              <div className="border-t border-gray-100">
                {isCoach && (
                  <div style={{ background: '#FFF9F0', borderBottom: '1px solid #FFE5D0', padding: '10px 16px', fontSize: 12, color: '#1a1a1a', textAlign: 'right' }}>
                    מילוי בנוכחות מאמן — מסור את המכשיר למתאמן/ת לחתימה. החתימה והנתונים נשמרים תחת חשבון המתאמן/ת.
                  </div>
                )}
                <CooperationAgreementForm user={user} onSign={handleSign} isSigning={signingType === doc.key} />
              </div>
            )}
          </div>
        );
      })}

      {/* Signed document viewer modal — used for cooperation/agreement docs */}
      <SignedDocumentViewer
        isOpen={!!viewingDoc}
        onClose={() => setViewingDoc(null)}
        doc={viewingDoc}
        traineeName={user?.full_name}
        currentUserId={currentUserId}
      />

      {/* Dedicated health-declaration viewer — fetches the latest row from
          health_declarations and renders the PAR-Q answers + signature +
          notes, including pre_health_note from the trainee's onboarding. */}
      <HealthDeclarationViewer
        isOpen={viewingHealth}
        onClose={() => setViewingHealth(false)}
        traineeId={user?.id}
        traineeName={user?.full_name}
        traineePreHealthNote={user?.pre_health_note}
      />

      {/* Canonical health declaration form — same component the trainee
          fills out during casual onboarding (TraineeHome.jsx) and the
          PreHealthScreen handoff. Saves to health_declarations,
          documents, and signed_documents in one shot. */}
      <HealthDeclarationFormModal
        isOpen={signingHealth}
        onClose={() => setSigningHealth(false)}
        trainee={{ id: user?.id, full_name: user?.full_name, birth_date: user?.birth_date }}
        coachId={isCoach ? currentUserId : (user?.coach_id || null)}
        autoConfirmSession={false}
        onSigned={() => { setSigningHealth(false); fetchDocs(); }}
      />

      {/* Sign-pending-agreement modal (opened from the prominent pending row) */}
      {signingPendingDoc && (
        <SignPendingAgreementDialog
          open={!!signingPendingDoc}
          onClose={() => setSigningPendingDoc(null)}
          doc={signingPendingDoc}
          isCoachView={isCoach}
        />
      )}
    </div>
  );
}
