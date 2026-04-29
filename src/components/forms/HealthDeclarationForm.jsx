import React, { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/lib/supabaseClient";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import OnboardingProgressBar from "@/components/OnboardingProgressBar";

// Standard PAR-Q-style screening, 8 yes/no questions per the casual
// onboarding spec. Trainee must tick the confirmation checkbox AND
// sign on the canvas before "חתום ואשר" enables. On save, inserts
// into `health_declarations` and (if a session id was passed) flips
// that session from pending_approval → confirmed.
//
// Signature is saved as a base64 data URL in `health_declarations.signature_data`
// — no Supabase Storage upload. The data URL renders directly in <img src=...>,
// so consumers (HealthDeclarationViewer, SignedDocumentViewer) don't care
// whether it's a hosted file or inline base64. Sidesteps "bucket not found"
// failures and missing-RLS issues entirely.

const QUESTIONS = [
  { key: 'heart_disease',       label: 'האם אובחנת אי פעם עם מחלת לב?' },
  { key: 'blood_pressure',      label: 'האם יש לך בעיות לחץ דם?' },
  { key: 'joint_issues',        label: 'האם יש לך בעיות במפרקים או בעמוד השדרה?' },
  { key: 'asthma',              label: 'האם יש לך אסטמה או בעיות נשימה?' },
  { key: 'medications',         label: 'האם אתה נוטל תרופות באופן קבוע?' },
  { key: 'medical_limitations', label: 'האם יש לך מגבלה רפואית כלשהי שהמאמן צריך לדעת עליה?' },
  { key: 'recent_surgery',      label: 'האם עברת ניתוח ב-12 החודשים האחרונים?' },
  // feels_healthy is the only inverted question — defaults to false
  // (red "לא") and the trainee must explicitly tap "כן" (orange) to
  // unlock the submit button. Other questions paint the same way:
  // "yes" red = concern, "no" green = reassurance. Inverted swaps
  // those roles so a positive affirmation matches the brand orange.
  { key: 'feels_healthy',       label: 'האם אתה מרגיש בריא ומסוגל לבצע פעילות גופנית?', inverted: true },
];

export default function HealthDeclarationForm({
  isOpen,
  onClose,
  trainee,           // { id, full_name, birth_date }
  coachId,           // owner for RLS (user_id column)
  sessionId,         // optional — if present, link declaration to session
  autoConfirmSession = true, // when false, skip the status flip + coach
                             // notification — caller will gate confirmation
                             // through a separate path (e.g. payment).
  onSigned,          // optional — fires after a successful save
}) {
  // Initial answer map — every question defaults to false. The
  // inverted feels_healthy used to default true, but we now require
  // the trainee to explicitly tap "כן" so the form can't be sent
  // with a stale "I'm fine" they never confirmed. The submit gate
  // below enforces it.
  const initialAnswers = () => Object.fromEntries(
    QUESTIONS.map((q) => [q.key, false])
  );

  const [answers, setAnswers] = useState(initialAnswers());
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);

  // Reset form when reopened so a stale answer set doesn't carry over.
  useEffect(() => {
    if (!isOpen) return;
    setAnswers(initialAnswers());
    setAdditionalNotes('');
    setConfirmed(false);
    setHasSignature(false);
  }, [isOpen]);

  // ── Signature canvas ────────────────────────────────────────────
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [hasSignature, setHasSignature] = useState(false);

  // Translate touch / mouse coords to canvas-relative px (handles
  // CSS-vs-internal-resolution scaling so the line follows the finger).
  const getPos = (e) => {
    const c = canvasRef.current;
    const rect = c.getBoundingClientRect();
    const clientX = e.touches?.[0]?.clientX ?? e.clientX;
    const clientY = e.touches?.[0]?.clientY ?? e.clientY;
    return {
      x: (clientX - rect.left) * (c.width / rect.width),
      y: (clientY - rect.top)  * (c.height / rect.height),
    };
  };

  const startDraw = (e) => {
    e.preventDefault?.();
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1A1A1A';
    drawing.current = true;
  };

  const draw = (e) => {
    if (!drawing.current) return;
    e.preventDefault?.();
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasSignature) setHasSignature(true);
  };

  const endDraw = () => { drawing.current = false; };

  const clearSignature = () => {
    const c = canvasRef.current;
    if (!c) return;
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
    setHasSignature(false);
  };

  // Refs for scroll-to-error — when "חתום ואשר" is tapped without
  // checking the box / signing, we both toast AND scroll the
  // missing field into view + add a red border for that one tick.
  const confirmRef = useRef(null);
  const signatureBoxRef = useRef(null);

  // ── Save ────────────────────────────────────────────────────────
  // Trainee must affirm feels_healthy === true before submission.
  // The button below is also disabled visually so this is a
  // belt-and-suspenders gate.
  const feelsHealthy = answers.feels_healthy === true;
  const canSubmit = confirmed && hasSignature && feelsHealthy && !saving;

  const focusFirstError = () => {
    const target = !confirmed
      ? confirmRef.current
      : (!hasSignature ? signatureBoxRef.current : null);
    if (!target) return;
    try {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch { /* old browsers — best-effort */ }
  };

  const handleSubmit = async () => {
    if (!canSubmit) {
      // feelsHealthy gate runs first — without it the trainee can't
      // submit at all, so it deserves the most explicit toast.
      if (!feelsHealthy)      toast.error('יש לאשר שאתה מרגיש בריא ומסוגל לפעילות');
      else if (!confirmed)    toast.error('נא לאשר את הצהרת הבריאות');
      else if (!hasSignature) toast.error('נא לחתום בתיבת החתימה');
      focusFirstError();
      return;
    }
    setSaving(true);
    try {
      // Capture the signature as a data URL — written straight to the DB
      // in `signature_data`. No Storage upload (no bucket dependency, no
      // RLS surface). Same string is reused for the signed_documents mirror.
      const signatureDataUrl = canvasRef.current.toDataURL('image/png');
      console.log('[HealthDec] signature captured, length:', signatureDataUrl.length);

      const payload = {
        user_id: coachId || null,
        trainee_id: trainee?.id || null,
        full_name: trainee?.full_name || '',
        birth_date: trainee?.birth_date || null,
        heart_disease: !!answers.heart_disease,
        blood_pressure: !!answers.blood_pressure,
        joint_issues: !!answers.joint_issues,
        asthma: !!answers.asthma,
        medications: !!answers.medications,
        medical_limitations: !!answers.medical_limitations,
        recent_surgery: !!answers.recent_surgery,
        // The submit gate guarantees feels_healthy === true here,
        // but `!== false` is the safest fallback for the rare race
        // where the answers map is in flight.
        feels_healthy: answers.feels_healthy === true,
        additional_notes: additionalNotes || null,
        declaration_confirmed: true,
        signature_data: signatureDataUrl,
        signed_at: new Date().toISOString(),
      };
      console.log('[HealthDec] inserting declaration with keys:', Object.keys(payload));
      const { data: inserted, error } = await supabase
        .from('health_declarations')
        .insert(payload)
        .select()
        .single();
      if (error) {
        console.error('[HealthDec] declaration insert failed:', error.message);
        throw error;
      }
      console.log('[HealthDec] declaration saved OK, id:', inserted?.id);

      // Link the declaration to the session. When autoConfirmSession
      // is true (legacy/no-price flow), also flip status to 'confirmed'
      // and notify the coach. When false, the caller is gating
      // confirmation through a separate step (typically payment) — the
      // session must stay in 'pending_approval' until that step completes.
      //
      // Defense-in-depth: regardless of the prop, never flip status
      // for a session that still owes payment. We re-read price /
      // payment_status from the row right before the update, so a
      // stale or wrong autoConfirmSession from the caller cannot
      // bypass the payment gate.
      let safeAutoConfirm = autoConfirmSession;
      if (sessionId && safeAutoConfirm) {
        try {
          const { data: pre } = await supabase
            .from('sessions')
            .select('price, payment_status')
            .eq('id', sessionId)
            .maybeSingle();
          const pricedAndUnpaid = Number(pre?.price || 0) > 0
                                  && pre?.payment_status !== 'paid';
          if (pricedAndUnpaid) {
            safeAutoConfirm = false;
            console.warn('[HealthDeclaration] auto-confirm blocked: session needs payment');
          }
        } catch (e) {
          console.warn('[HealthDeclaration] price recheck failed:', e?.message);
        }
      }

      if (sessionId) {
        try {
          await supabase
            .from('sessions')
            .update(safeAutoConfirm
              ? { status: 'confirmed', health_declaration_id: inserted?.id }
              : { health_declaration_id: inserted?.id })
            .eq('id', sessionId);
        } catch (e) {
          console.warn('[HealthDeclaration] session update failed:', e?.message);
        }
        // Notify the coach so the green session_confirmed popup
        // surfaces via PopupNotificationManager next time they open
        // the dashboard. Best-effort. Skipped when payment-gated —
        // payment-webhook fires its own notification on success.
        if (coachId && safeAutoConfirm) {
          try {
            // Re-read the session to compose a friendly date label.
            const { data: srow } = await supabase
              .from('sessions').select('date, time').eq('id', sessionId).maybeSingle();
            const d = srow?.date ? new Date(srow.date) : null;
            const dateLabel = d && !Number.isNaN(d.getTime())
              ? `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
              : '';
            const timeLabel = (srow?.time || '').slice(0, 5);
            const traineeName = trainee?.full_name || 'המתאמן/ת';
            // Minimal columns only — if `link`/`data` are missing on the
            // live notifications schema the insert silently 400'd before.
            await supabase.from('notifications').insert({
              user_id: coachId,
              type: 'session_confirmed',
              title: '✅ מפגש אושר',
              message: `${traineeName} אישר/ה את המפגש${dateLabel ? ` ב-${dateLabel}` : ''}${timeLabel ? ` בשעה ${timeLabel}` : ''}`,
              is_read: false,
            });
            console.log('[HealthDec] coach notification sent OK');
          } catch (e) {
            console.warn('[HealthDec] coach notification failed:', e?.message);
          }
        }
      }

      // Mirror into documents so the coach finds the signed declaration
      // in the trainee's "מסמכים" tab too. Minimal columns only — older
      // installs may not have document_data / file_url / health_declaration_id,
      // which silently 400'd the insert before. The signed_documents row
      // below carries the rich payload (signature, answers).
      try {
        const { error: docErr } = await supabase.from('documents').insert({
          trainee_id: trainee?.id || null,
          user_id: coachId || null,
          name: `הצהרת בריאות — ${trainee?.full_name || ''}`.trim(),
          type: 'health_declaration',
          category: 'medical',
        });
        if (docErr) throw docErr;
        console.log('[HealthDec] document saved OK');
      } catch (e) {
        console.warn('[HealthDec] document insert failed:', e?.message);
      }

      // Mirror into signed_documents so DocumentSigningTab in the
      // trainee profile renders this with the standard signed-card UI
      // (label + green "חתום ✓" badge + click-to-view modal with the
      // signature image). The structure mirrors what
      // DocumentSigningTab writes itself.
      try {
        await supabase.from('signed_documents').insert({
          trainee_id: trainee?.id || null,
          coach_id: coachId || null,
          document_type: 'health_declaration',
          document_data: {
            version: 1,
            source: 'casual_onboarding',
            questions: QUESTIONS.map((q) => ({
              key: q.key, label: q.label, answer: !!answers[q.key],
            })),
            additional_notes: additionalNotes || null,
            declaration_confirmed: true,
            signed_name: trainee?.full_name || '',
          },
          signature_data: signatureDataUrl,
          signed_at: new Date().toISOString(),
          status: 'signed',
          is_locked: true,
        });
        console.log('[HealthDec] signed_documents mirror OK');
      } catch (e) {
        console.warn('[HealthDec] signed_documents mirror failed:', e?.message);
      }

      toast.success('הצהרת הבריאות נחתמה בהצלחה');
      onSigned?.(inserted);
      onClose?.();
    } catch (err) {
      console.error('[HealthDeclaration] save error:', err);
      toast.error('שגיאה בשמירה: ' + (err?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  // Initialize canvas at mount time. Internal resolution is doubled
  // so on retina screens the signature isn't blurry.
  const setupCanvas = (node) => {
    canvasRef.current = node;
    if (!node) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = node.clientWidth;
    const cssH = node.clientHeight;
    node.width  = Math.round(cssW * dpr);
    node.height = Math.round(cssH * dpr);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !saving) onClose?.(); }}>
      <DialogContent
        className="max-w-md p-0"
        onInteractOutside={(e) => { if (saving) e.preventDefault(); }}
      >
        <DialogTitle className="sr-only">הצהרת בריאות</DialogTitle>
        <DialogDescription className="sr-only">
          טופס הצהרת בריאות לפני אישור מפגש אימון
        </DialogDescription>

        {/* No maxHeight / overflowY here on purpose — the dialog
            primitive's inner wrapper already provides the scroll
            container with overflow-y-auto + overscroll-contain.
            A second scroll container nested inside it fought the
            outer one and trapped touch gestures on mobile, so the
            trainee couldn't reach the signature pad / submit
            button. Plain styling only now. */}
        <div dir="rtl" style={{
          background: '#FDF8F3',
          borderRadius: 14,
          fontFamily: "'Heebo', 'Assistant', sans-serif",
        }}>
          {/* Header */}
          <div style={{
            padding: '14px 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderBottom: '1px solid #F0E4D0',
            background: '#FFFFFF',
            borderTopLeftRadius: 14, borderTopRightRadius: 14,
            position: 'sticky', top: 0, zIndex: 1,
          }}>
            <button
              type="button"
              onClick={() => !saving && onClose?.()}
              aria-label="סגור"
              style={{ width: 32, height: 32, borderRadius: 999, border: 'none', background: 'transparent', cursor: 'pointer' }}
            >
              <X size={18} />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <img
                src="/logoR.png"
                alt=""
                style={{ height: 28, width: 'auto', objectFit: 'contain', filter: 'brightness(0)' }}
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
              <div style={{ fontSize: 16, fontWeight: 800, color: '#1A1A1A' }}>הצהרת בריאות</div>
            </div>
            <div style={{ width: 32 }} />
          </div>

          {/* Outer onboarding progress — health is step 3 of 4. */}
          <OnboardingProgressBar currentStep="health" />

          {/* Body */}
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Identity */}
            <div style={{ background: '#FFFFFF', border: '1px solid #F0E4D0', borderRadius: 12, padding: 12 }}>
              <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>שם מלא</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1A1A' }}>{trainee?.full_name || '—'}</div>
              {trainee?.birth_date && (
                <>
                  <div style={{ fontSize: 13, color: '#888', marginTop: 8, marginBottom: 4 }}>תאריך לידה</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1A1A' }}>
                    {(() => {
                      const d = new Date(trainee.birth_date);
                      if (Number.isNaN(d.getTime())) return trainee.birth_date;
                      return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
                    })()}
                  </div>
                </>
              )}
            </div>

            {/* Questions
                Two visual modes per question:
                  • normal (heart_disease, blood_pressure, ...) —
                    "yes" is the worrying answer, painted red. "no"
                    is the reassuring answer, painted green.
                  • inverted (feels_healthy) — "no" is the worrying
                    answer, painted red. "yes" is the affirmation,
                    painted in brand orange. Required to submit, so
                    a small warning banner appears underneath while
                    the answer is still "no". */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {QUESTIONS.map((q) => {
                const value = answers[q.key];
                const setValue = (next) => setAnswers((prev) => ({ ...prev, [q.key]: next }));

                // Per-mode colour pair. inverted questions swap the
                // affirmative + concerning roles; the unselected
                // state stays the same neutral grey for both.
                const noActive  = q.inverted
                  ? { border: '2px solid #DC2626', bg: '#DC2626', fg: '#FFFFFF' }
                  : { border: '2px solid #16a34a', bg: '#16a34a', fg: '#FFFFFF' };
                const yesActive = q.inverted
                  ? { border: '2px solid #FF6F20', bg: '#FF6F20', fg: '#FFFFFF' }
                  : { border: '2px solid #DC2626', bg: '#DC2626', fg: '#FFFFFF' };
                const inactive  = { border: '2px solid #E5E7EB', bg: '#FFFFFF', fg: '#6B7280' };

                const noStyle  = value === false ? noActive  : inactive;
                const yesStyle = value === true  ? yesActive : inactive;

                return (
                  <div key={q.key}>
                    <div style={{
                      background: '#FFFFFF', border: '1px solid #F0E4D0',
                      borderRadius: 12, padding: 10,
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1A1A', textAlign: 'right', flex: 1 }}>
                        {q.label}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={() => setValue(false)}
                          style={{
                            padding: '6px 14px', borderRadius: 8,
                            border: noStyle.border,
                            background: noStyle.bg,
                            color: noStyle.fg,
                            fontSize: 12, fontWeight: 700, cursor: 'pointer',
                          }}
                        >לא</button>
                        <button
                          type="button"
                          onClick={() => setValue(true)}
                          style={{
                            padding: '6px 14px', borderRadius: 8,
                            border: yesStyle.border,
                            background: yesStyle.bg,
                            color: yesStyle.fg,
                            fontSize: 12, fontWeight: 700, cursor: 'pointer',
                          }}
                        >כן</button>
                      </div>
                    </div>

                    {/* Required-yes warning under feels_healthy when
                        the trainee is still on the default 'no'. */}
                    {q.inverted && value === false && (
                      <div style={{
                        marginTop: 6,
                        padding: '8px 12px',
                        background: '#FEE2E2',
                        borderRadius: 8,
                        fontSize: 12,
                        color: '#991B1B',
                        lineHeight: 1.5,
                      }}>
                        ⚠ חובה לאשר שאתה מרגיש בריא ומסוגל כדי להמשיך.
                        אם אינך מרגיש בריא — צור קשר עם המאמן לפני המפגש.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Free-form notes */}
            <div style={{ background: '#FFFFFF', border: '1px solid #F0E4D0', borderRadius: 12, padding: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1A1A', marginBottom: 6 }}>
                פירוט נוסף (אם יש)
              </div>
              <textarea
                value={additionalNotes}
                onChange={(e) => setAdditionalNotes(e.target.value)}
                rows={3}
                placeholder="ניתן לציין כאן פציעות, רגישויות או כל מידע נוסף שחשוב למאמן..."
                style={{
                  width: '100%', resize: 'vertical', minHeight: 70,
                  padding: '8px 10px', borderRadius: 10,
                  border: '1px solid #E5E7EB', background: '#FFFFFF',
                  fontSize: 13, color: '#1A1A1A', outline: 'none',
                  boxSizing: 'border-box', textAlign: 'right',
                  fontFamily: "'Heebo', 'Assistant', sans-serif",
                }}
              />
            </div>

            {/* Confirmation checkbox — gets a red border when the
                user hits submit without checking it. confirmRef
                lets focusFirstError() scroll it into view. */}
            <label
              ref={confirmRef}
              data-error={!confirmed || undefined}
              style={{
                background: '#FDF8F3',
                border: `1px solid ${!confirmed ? '#FF6F20' : '#F0E4D0'}`,
                borderRadius: 14, padding: 16,
                display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                style={{ marginTop: 2, width: 24, height: 24, accentColor: '#FF6F20', flexShrink: 0 }}
              />
              <span style={{ fontSize: 14, color: '#1A1A1A', lineHeight: 1.6 }}>
                אני מצהיר/ה כי כל הפרטים שנמסרו נכונים ומדויקים. אני לוקח/ת
                אחריות מלאה על מצבי הבריאותי ומאשר/ת כי קראתי והבנתי את תוכן
                הצהרה זו.
              </span>
            </label>

            {/* Signature */}
            <div
              ref={signatureBoxRef}
              data-error={!hasSignature || undefined}
              style={{ background: '#FFFFFF', border: '1px solid #F0E4D0', borderRadius: 12, padding: 12 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1A1A' }}>חתימה</div>
                <button
                  type="button"
                  onClick={clearSignature}
                  style={{
                    padding: '4px 10px', borderRadius: 8, border: '1px solid #E5E7EB',
                    background: 'transparent', color: '#6B7280',
                    fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  }}
                >נקה</button>
              </div>
              <canvas
                ref={setupCanvas}
                onMouseDown={startDraw}
                onMouseMove={draw}
                onMouseUp={endDraw}
                onMouseLeave={endDraw}
                onTouchStart={startDraw}
                onTouchMove={draw}
                onTouchEnd={endDraw}
                style={{
                  width: '100%', height: 140,
                  borderRadius: 10,
                  border: '1px dashed #C4C4C4',
                  background: '#FAFAFA',
                  cursor: 'crosshair',
                  touchAction: 'none',
                  display: 'block',
                }}
              />
              {!hasSignature && (
                <div style={{ fontSize: 11, color: '#9CA3AF', textAlign: 'center', marginTop: 6 }}>
                  חתום/חתמי כאן באצבע או בעכבר
                </div>
              )}
            </div>

            {/* Submit */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              style={{
                width: '100%', padding: '12px 16px', borderRadius: 12, border: 'none',
                background: canSubmit ? '#FF6F20' : '#E5E7EB',
                color: canSubmit ? '#FFFFFF' : '#9CA3AF',
                fontSize: 15, fontWeight: 800,
                cursor: canSubmit ? 'pointer' : 'not-allowed',
                fontFamily: "'Heebo', 'Assistant', sans-serif",
                marginBottom: 4,
              }}
            >
              {saving
                ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Loader2 size={16} className="animate-spin" /> שומר...
                  </span>
                : 'חתום ואשר'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
