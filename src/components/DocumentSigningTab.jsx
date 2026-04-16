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

const PAR_Q_QUESTIONS = [
  "האם רופא אמר לך אי פעם שיש לך בעיה בלב ושעליך לבצע פעילות גופנית רק בהמלצת רופא?",
  "האם אתה סובל מכאבים בחזה במנוחה או במאמץ?",
  "האם אתה מאבד שיווי משקל בגלל סחרחורות או מאבד הכרה?",
  "האם יש לך בעיית עצמות או מפרקים שעלולה להחמיר עם פעילות גופנית?",
  "האם רופא רושם לך תרופות לחץ דם או לב?",
  "האם אתה יודע על סיבה רפואית אחרת שבגללה אסור לך להתאמן?",
  "האם עברת ניתוח בחצי השנה האחרונה?",
];

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

function HealthDeclarationForm({ user, onSign, isSigning }) {
  const [answers, setAnswers] = useState(PAR_Q_QUESTIONS.map(() => null));
  const [healthNotes, setHealthNotes] = useState("");
  const sigRef = useRef(null);
  const formRef = useRef(null);
  const hasYes = answers.some(a => a === true);
  const allAnswered = answers.every(a => a !== null);

  const handleSign = async () => {
    if (!allAnswered) { toast.error("יש לענות על כל השאלות"); return; }
    if (!sigRef.current?.hasSignature()) { toast.error("יש לחתום לפני השליחה"); return; }
    const sig = sigRef.current.getSignature();
    const pdfFile = await generatePdfFromRef(formRef.current, `הצהרת_בריאות_${user.full_name}_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    // Build full_text with questions + answers inline
    const fullText = `הצהרת בריאות לפעילות גופנית\n\nשם: ${user.full_name}\nתאריך: ${format(new Date(), 'dd/MM/yyyy')}\n\nשאלון PAR-Q:\n` +
      PAR_Q_QUESTIONS.map((q, i) => `${i+1}. ${q} — ${answers[i] ? 'כן' : 'לא'}`).join('\n') +
      (healthNotes ? `\n\nהערות: ${healthNotes}` : '') +
      `\n\nהצהרה:\nאני החתום/ה מטה מצהיר/ה כי כל המידע שמסרתי לעיל הוא נכון ומדויק.\nאני מודע/ת שפעילות גופנית כרוכה בסיכונים מסוימים ואני נוטל/ת על עצמי את האחריות לבריאותי.`;

    await onSign('health_declaration', sig, pdfFile, {
      full_text: fullText,
      questions: PAR_Q_QUESTIONS,
      answers,
      healthNotes,
      hasYes,
      declaration_text: 'אני מצהיר/ת כי כל המידע שמסרתי הוא נכון ומדויק',
      declaration_confirmed: true,
      signed_name: user.full_name,
    });
  };

  return (
    <div>
      <div ref={formRef} className="bg-white p-5 space-y-5" dir="rtl">
        <div className="text-center border-b pb-4">
          <h3 className="text-lg font-black text-gray-900">הצהרת בריאות לפעילות גופנית</h3>
          <p className="text-xs text-gray-400 mt-1">AthletiGo — שאלון PAR-Q</p>
        </div>

        <div className="space-y-1 text-sm">
          <div className="text-right py-1"><span className="text-gray-500 font-medium">שם מלא: </span><span className="text-gray-900">{user.full_name}</span></div>
          <div className="text-right py-1"><span className="text-gray-500 font-medium">תאריך: </span><span className="text-gray-900">{format(new Date(), 'dd/MM/yyyy')}</span></div>
          {user.phone && <div className="text-right py-1"><span className="text-gray-500 font-medium">טלפון: </span><span className="text-gray-900">{user.phone}</span></div>}
        </div>

        <div className="space-y-3">
          <h4 className="font-bold text-sm text-gray-800 border-b pb-1">שאלון בריאות</h4>
          {PAR_Q_QUESTIONS.map((q, i) => (
            <div key={i} className="bg-gray-50 rounded-lg p-3">
              <p className="text-sm text-gray-800 mb-2 text-right">{i + 1}. {q}</p>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => { const n = [...answers]; n[i] = false; setAnswers(n); }}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold border transition-all ${answers[i] === false ? 'bg-green-100 border-green-400 text-green-800' : 'bg-white border-gray-200 text-gray-500'}`}>
                  לא
                </button>
                <button type="button" onClick={() => { const n = [...answers]; n[i] = true; setAnswers(n); }}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold border transition-all ${answers[i] === true ? 'bg-red-100 border-red-400 text-red-800' : 'bg-white border-gray-200 text-gray-500'}`}>
                  כן
                </button>
              </div>
            </div>
          ))}
        </div>

        {hasYes && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-right">
              <p className="text-sm font-bold text-amber-800">חשוב: עליך להציג אישור רפואי לפני תחילת האימונים.</p>
              <p className="text-xs text-amber-600 mt-1">עניתם "כן" על אחת השאלות. יש להתייעץ עם רופא ולהציג אישור בכתב למאמן.</p>
            </div>
          </div>
        )}

        <div>
          <label className="text-sm font-medium text-gray-600 block mb-1 text-right">הערות בריאותיות נוספות (אופציונלי)</label>
          <textarea value={healthNotes} onChange={e => setHealthNotes(e.target.value)} rows={2}
            className="w-full rounded-lg border border-gray-200 p-2 text-sm text-right resize-none" placeholder="תרופות, אלרגיות, פציעות קודמות..." />
        </div>

        <div className="bg-gray-50 rounded-xl p-4 text-right">
          <h4 className="font-bold text-sm text-gray-800 mb-2">הצהרת המתאמן/ת</h4>
          <p className="text-xs text-gray-600 leading-relaxed">
            אני החתום/ה מטה מצהיר/ה כי כל המידע שמסרתי לעיל הוא נכון ומדויק.
            אני מודע/ת שפעילות גופנית כרוכה בסיכונים מסוימים ואני נוטל/ת על עצמי את האחריות לבריאותי.
            אני מתחייב/ת לעדכן את המאמן על כל שינוי במצבי הבריאותי.
            {hasYes && " אני מתחייב/ת להציג אישור רפואי בכתב לפני תחילת האימונים."}
          </p>
        </div>

        <div>
          <label className="text-sm font-bold text-gray-700 block mb-2 text-right">חתימה דיגיטלית</label>
          <SignatureCanvas ref={sigRef} />
        </div>
      </div>

      <div className="px-5 pb-5 bg-white">
        <Button onClick={handleSign} disabled={isSigning || !allAnswered}
          className="w-full rounded-xl py-3 font-bold text-white min-h-[48px] text-base"
          style={{ backgroundColor: '#FF6F20' }}>
          {isSigning ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" />שומר...</> : 'אני מאשר/ת וחותם/ת'}
        </Button>
      </div>
    </div>
  );
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

export default function DocumentSigningTab({ effectiveUser, isCoach, onUserUpdate }) {
  const [signingType, setSigning] = useState(null);
  const [expandedDoc, setExpandedDoc] = useState(null);
  const [signedDocs, setSignedDocs] = useState([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [viewingDoc, setViewingDoc] = useState(null);

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

  if (!user) return null;

  // Build docs list: one cooperation_agreement + all health_declarations (newest first)
  const coopRecord = signedDocs.find(d => d.document_type === 'cooperation_agreement');
  const healthRecords = signedDocs.filter(d => d.document_type === 'health_declaration').sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const docs = [
    {
      key: 'cooperation_agreement',
      label: 'הסכם שיתוף פעולה',
      signedAt: coopRecord?.signed_at || null,
      sigData: coopRecord?.signature_data || null,
      pdfUrl: coopRecord?.file_url || null,
      metadata: coopRecord?.document_data || null,
      record: coopRecord || null,
    },
    ...healthRecords.map((r, idx) => ({
      key: `health_declaration_${r.id}`,
      docType: 'health_declaration',
      label: `הצהרת בריאות${healthRecords.length > 1 ? ` ${new Date(r.created_at).getFullYear()}` : ''}`,
      signedAt: r.signed_at || null,
      sigData: r.signature_data || null,
      pdfUrl: r.file_url || null,
      metadata: r.document_data || null,
      record: r,
      recordId: r.id,
    })),
  ];

  // If no health declaration exists at all, show a pending placeholder
  if (healthRecords.length === 0) {
    docs.push({ key: 'health_declaration_new', docType: 'health_declaration', label: 'הצהרת בריאות', signedAt: null, sigData: null, pdfUrl: null, metadata: null, record: null });
  }

  const signedCount = docs.filter(d => d.signedAt).length;
  const totalDocs = docs.length;

  // Coach adds a new health declaration
  const handleAddHealthDeclaration = async () => {
    try {
      await supabase.from('signed_documents').insert({
        trainee_id: user.id,
        coach_id: user.coach_id || null,
        document_type: 'health_declaration',
        status: 'pending',
        is_locked: false,
      });
      toast.success("הצהרת בריאות חדשה נוספה למתאמן");
      await fetchDocs();
    } catch (e) {
      toast.error("שגיאה: " + (e?.message || "נסה שוב"));
    }
  };

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

      // 2. Save to signed_documents table
      const { error } = await supabase
        .from('signed_documents')
        .upsert({
          trainee_id: user.id,
          coach_id: user.coach_id || null,
          document_type: docType,
          document_data: metadata || {},
          signature_data: signatureDataUrl,
          signed_at: new Date().toISOString(),
          status: 'signed',
          is_locked: true,
          file_url: pdfUrl || null,
        }, { onConflict: 'trainee_id,document_type' });

      if (error) throw error;

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
          {isCoach && (
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" style={{ borderColor: '#FF6F20', color: '#FF6F20' }} onClick={handleAddHealthDeclaration}>
              + הצהרת בריאות
            </Button>
          )}
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${signedCount === totalDocs ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
            {signedCount}/{totalDocs} נחתמו
          </span>
        </div>
      </div>

      {docs.map(doc => {
        const isSigned = !!doc.signedAt;
        const isExpanded = expandedDoc === doc.key;
        const canSign = !isCoach && !isSigned;

        return (
          <div key={doc.key} className="bg-white rounded-xl border-2 shadow-sm overflow-hidden"
            style={{ borderColor: isSigned ? '#4CAF50' : '#FF6F20' }}>

            {/* Header */}
            <button onClick={() => setExpandedDoc(isExpanded ? null : doc.key)}
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
                {isSigned ? (
                  <span className="flex items-center gap-1 text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-full">
                    <CheckCircle className="w-3 h-3" /> נחתם
                  </span>
                ) : (
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
                  onClick={(e) => { e.stopPropagation(); setViewingDoc(doc.record); }}>
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

            {/* Expanded: signing form */}
            {!isSigned && isExpanded && canSign && (
              <div className="border-t border-gray-100">
                {(doc.key.startsWith('health_declaration') || doc.docType === 'health_declaration') ? (
                  <HealthDeclarationForm user={user} onSign={handleSign} isSigning={signingType === doc.key} />
                ) : (
                  <CooperationAgreementForm user={user} onSign={handleSign} isSigning={signingType === doc.key} />
                )}
              </div>
            )}

            {/* Coach viewing unsigned doc */}
            {!isSigned && isExpanded && isCoach && (
              <div className="p-4 border-t border-gray-100 text-center">
                <p className="text-sm text-gray-500">המתאמן/ת טרם חתם/ה על טופס זה.</p>
                <p className="text-xs text-gray-400 mt-1">החתימה מתבצעת בצד של המתאמן/ת.</p>
              </div>
            )}
          </div>
        );
      })}

      {/* Signed document viewer modal */}
      <SignedDocumentViewer
        isOpen={!!viewingDoc}
        onClose={() => setViewingDoc(null)}
        doc={viewingDoc}
        traineeName={user?.full_name}
      />
    </div>
  );
}
