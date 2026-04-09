import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { CheckCircle, FileText, ShieldCheck, Loader2, Pen, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { he } from "date-fns/locale";

const HEALTH_DECLARATION_TEXT = `הצהרת בריאות — AthletiGo

אני החתום/ה מטה מצהיר/ה בזאת כי:

1. אני כשיר/ה מבחינה רפואית לעסוק בפעילות גופנית מאומצת.
2. לא ידוע לי על כל מחלה, פציעה, או מצב רפואי שיכול למנוע ממני להתאמן.
3. אני מודע/ת לכך שפעילות גופנית כרוכה בסיכונים מסוימים ואני נוטל/ת על עצמי את האחריות לכך.
4. אני מתחייב/ת לדווח למאמן על כל שינוי במצב בריאותי שעלול להשפיע על האימונים.
5. קיבלתי אישור רפואי לעסוק בפעילות גופנית (במקרה הצורך).

חתימה זו מהווה הסכמה לכל האמור לעיל.`;

const COOPERATION_AGREEMENT_TEXT = `הסכם שיתוף פעולה — AthletiGo

הסכם זה נערך בין המאמן האישי לבין המתאמן/ת:

1. מחויבות המתאמן/ת:
   • להגיע לאימונים בזמן ומוכן/ה.
   • לעקוב אחר תכנית האימונים שנקבעה.
   • לדווח על קשיים, כאבים, או שינויים במצב הגוף.
   • לשמור על אורח חיים בריא בין האימונים.

2. מחויבות המאמן:
   • להכין תכנית אימונים מותאמת אישית.
   • לעקוב אחר ההתקדמות ולהתאים את התכנית בהתאם.
   • לספק כלים, ידע והכוונה מקצועית.

3. ביטול שיעורים:
   • ביטול שיעור יש לעשות לפחות 24 שעות מראש.
   • ביטול ברגע האחרון עלול לגרום לחיוב מלא.

חתימה זו מהווה הסכמה לכל תנאי ההסכם.`;

// ---------- Signature Canvas ----------
const SignatureCanvas = forwardRef(function SignatureCanvas({ disabled }, ref) {
  const canvasRef = useRef(null);
  const [hasSignature, setHasSignature] = useState(false);
  const isDrawing = useRef(false);
  const lastPos = useRef(null);

  useImperativeHandle(ref, () => ({
    getSignature: () => {
      if (!hasSignature) return null;
      return canvasRef.current?.toDataURL('image/png') ?? null;
    },
    clear: () => {
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
        setHasSignature(false);
      }
    },
    hasSignature: () => hasSignature,
  }));

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - rect.left) * scaleX, y: (src.clientY - rect.top) * scaleY };
  };

  const startDraw = (e) => {
    if (disabled) return;
    e.preventDefault();
    isDrawing.current = true;
    lastPos.current = getPos(e);
  };

  const moveDraw = (e) => {
    if (!isDrawing.current || disabled) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    lastPos.current = pos;
    setHasSignature(true);
  };

  const stopDraw = () => { isDrawing.current = false; lastPos.current = null; };

  return (
    <div className="space-y-2">
      <div
        className="relative rounded-xl overflow-hidden"
        style={{
          border: `2px solid ${disabled ? '#E0E0E0' : '#FF6F20'}`,
          backgroundColor: disabled ? '#FAFAFA' : '#FFFFFF',
          cursor: disabled ? 'not-allowed' : 'crosshair',
        }}
      >
        <canvas
          ref={canvasRef}
          width={600}
          height={150}
          className="w-full touch-none block"
          onMouseDown={startDraw} onMouseMove={moveDraw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
          onTouchStart={startDraw} onTouchMove={moveDraw} onTouchEnd={stopDraw}
        />
        {!hasSignature && !disabled && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-sm font-medium flex items-center gap-2" style={{ color: '#CCCCCC' }}>
              <Pen className="w-4 h-4" /> חתום/י כאן
            </span>
          </div>
        )}
      </div>
      {!disabled && hasSignature && (
        <button
          type="button"
          onClick={() => {
            const canvas = canvasRef.current;
            if (canvas) {
              canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
              setHasSignature(false);
            }
          }}
          className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg"
          style={{ color: '#7D7D7D', border: '1px solid #E0E0E0' }}
        >
          <RotateCcw className="w-3.5 h-3.5" /> נקה חתימה
        </button>
      )}
    </div>
  );
});

// ---------- Form Card ----------
function FormCard({ title, content, fieldKey, signedAt, signatureData, onSign, isSigning }) {
  const sigRef = useRef(null);
  const isSigned = !!signedAt;

  const handleSign = () => {
    const sig = sigRef.current?.getSignature();
    if (!sig) { toast.error("נא לחתום לפני האישור"); return; }
    onSign(fieldKey, sig);
  };

  return (
    <div className="rounded-2xl overflow-hidden mb-6" style={{ border: `2px solid ${isSigned ? '#4CAF50' : '#E0E0E0'}` }}>
      <div className="p-4 flex items-center justify-between" style={{ backgroundColor: isSigned ? '#E8F5E9' : '#FFF8F3' }}>
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5" style={{ color: isSigned ? '#4CAF50' : '#FF6F20' }} />
          <h3 className="text-lg font-black" style={{ color: '#000000' }}>{title}</h3>
        </div>
        {isSigned && (
          <div className="flex items-center gap-1 text-sm font-bold" style={{ color: '#4CAF50' }}>
            <CheckCircle className="w-5 h-5" /> נחתם
          </div>
        )}
      </div>

      <div className="p-4">
        <div
          className="p-4 rounded-xl mb-4 text-sm leading-7 whitespace-pre-line overflow-y-auto"
          style={{ backgroundColor: '#FAFAFA', color: '#000000', border: '1px solid #E0E0E0', maxHeight: 200 }}
        >
          {content}
        </div>

        {isSigned ? (
          <div className="space-y-3">
            <p className="text-sm font-bold" style={{ color: '#4CAF50' }}>
              ✅ נחתם ב-{format(new Date(signedAt), 'dd/MM/yyyy HH:mm', { locale: he })}
            </p>
            {signatureData && (
              <div>
                <p className="text-xs font-bold mb-1" style={{ color: '#7D7D7D' }}>חתימה:</p>
                <img src={signatureData} alt="חתימה" className="rounded-xl max-h-20 bg-white"
                  style={{ border: '1px solid #E0E0E0' }} />
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-bold" style={{ color: '#000000' }}>חתום/י כאן:</p>
            <SignatureCanvas ref={sigRef} disabled={false} />
            <Button
              onClick={handleSign}
              disabled={isSigning}
              className="w-full rounded-xl py-4 font-bold text-white"
              style={{ backgroundColor: '#FF6F20' }}
            >
              {isSigning
                ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" />שומר...</>
                : <><ShieldCheck className="w-4 h-4 ml-2" />אני מאשר/ת וחותם/ת</>}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Page ----------
export default function Forms() {
  const [user, setUser] = useState(null);
  const [signingField, setSigningField] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(console.error);
  }, []);

  const signMutation = useMutation({
    mutationFn: ({ fieldKey, signatureData }) =>
      base44.auth.updateMe({
        [`${fieldKey}_signed_at`]: new Date().toISOString(),
        [`${fieldKey}_signature`]: signatureData,
      }),
    onSuccess: () => {
      base44.auth.me().then(setUser);
      toast.success("✅ הטופס נחתם בהצלחה");
    },
    onError: (err) => toast.error("❌ שגיאה: " + (err?.message || "נסה שוב")),
    onSettled: () => setSigningField(null),
  });

  const handleSign = async (fieldKey, signatureData) => {
    setSigningField(fieldKey);
    try { await signMutation.mutateAsync({ fieldKey, signatureData }); } catch {}
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FFFFFF' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#FF6F20' }} />
      </div>
    );
  }

  const formDefs = [
    {
      title: "הצהרת בריאות",
      content: HEALTH_DECLARATION_TEXT,
      fieldKey: "health_declaration",
      signedAt: user.health_declaration_signed_at,
      signatureData: user.health_declaration_signature,
    },
    {
      title: "הסכם שיתוף פעולה",
      content: COOPERATION_AGREEMENT_TEXT,
      fieldKey: "cooperation_agreement",
      signedAt: user.cooperation_agreement_signed_at,
      signatureData: user.cooperation_agreement_signature,
    },
  ];

  const signedCount = formDefs.filter(f => f.signedAt).length;

  return (
    <div className="min-h-screen w-full overflow-x-hidden pb-24" dir="rtl" style={{ backgroundColor: '#FFFFFF' }}>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-3xl font-black mb-1" style={{ color: '#000000', fontFamily: 'Montserrat, Heebo, sans-serif' }}>
            טפסים ומסמכים
          </h1>
          <p className="text-sm font-medium mb-2" style={{ color: '#7D7D7D' }}>{signedCount}/{formDefs.length} טפסים נחתמו</p>
          <div className="w-16 h-1 rounded-full" style={{ backgroundColor: '#FF6F20' }} />
        </div>

        <div className="mb-6 h-2 rounded-full" style={{ backgroundColor: '#E0E0E0' }}>
          <div
            className="h-2 rounded-full transition-all duration-500"
            style={{
              width: `${(signedCount / formDefs.length) * 100}%`,
              backgroundColor: signedCount === formDefs.length ? '#4CAF50' : '#FF6F20',
            }}
          />
        </div>

        {formDefs.map((form) => (
          <FormCard
            key={form.fieldKey}
            {...form}
            onSign={handleSign}
            isSigning={signingField === form.fieldKey}
          />
        ))}

        {signedCount === formDefs.length && (
          <div className="text-center p-6 rounded-2xl" style={{ backgroundColor: '#E8F5E9', border: '2px solid #4CAF50' }}>
            <CheckCircle className="w-12 h-12 mx-auto mb-3" style={{ color: '#4CAF50' }} />
            <h3 className="text-xl font-black" style={{ color: '#000000' }}>כל הטפסים נחתמו!</h3>
            <p className="text-sm mt-1" style={{ color: '#7D7D7D' }}>תיעוד הטפסים שמור בפרופיל שלך</p>
          </div>
        )}
      </div>
    </div>
  );
}
