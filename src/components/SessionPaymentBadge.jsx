import React, { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";

// Renders the per-session payment status + (when applicable) the
// "שלם 💳" CTA.
//
// Modes — driven by `coachView`:
//   coachView=true  — coach reading a trainee's session card.
//                     Shows the price + a colored payment-status
//                     badge (paid green / pending orange / unpaid
//                     red / null gray "ללא תשלום"). No pay button.
//   coachView=false — trainee. NEVER shows the status badge —
//                     a trainee shouldn't see "ממתין לתשלום" /
//                     "לא שולם" framing on their own sessions.
//                     Renders one of three things:
//                       • pay button when price > 0 and unpaid
//                       • muted "✓ אישרת והוסדר" line when paid
//                       • nothing when the coach overrode payment
//                         (the trainee doesn't need to know the
//                         coach waived it)
//
// Pay flow: invokes the Edge Function `payment-create` with the
// session id + amount + trainee identity. The function should
// return { url } pointing at the Grow checkout page; we redirect.
// If the function isn't deployed yet, the catch surfaces a clear
// "תשלומים אינם זמינים כרגע" toast — graceful degradation.

export default function SessionPaymentBadge({ session, trainee, coachView }) {
  const [paying, setPaying] = useState(false);
  const price = Number(session?.price || 0);
  const status = session?.payment_status || null;
  const hasPrice = price > 0;
  if (!hasPrice && !coachView) return null;
  if (!hasPrice && coachView) {
    return (
      <span style={{
        display: 'inline-block', padding: '2px 8px', borderRadius: 14,
        background: '#F3F4F6', color: '#6B7280',
        fontSize: 11, fontWeight: 600,
      }}>ללא תשלום</span>
    );
  }

  const isPaid       = status === 'paid';
  const isPending    = status === 'pending';
  const isOverride   = status === 'override_no_payment';
  const isUnpaid     = status === 'unpaid' || status == null;

  // Visual: badge color follows the status. Orange (#FF6F20) for
  // pending matches the brand primary so the "shelm" CTA below
  // visually anchors to its own status color. Trainee view never
  // reads `badge` — the early returns below cover every case.
  const badge = isPaid
    ? { bg: '#E8F5E9', fg: '#15803D', label: `שולם ✓ — ${price}₪` }
    : isPending
      ? { bg: '#FFF1E6', fg: '#FF6F20', label: `ממתין לתשלום — ${price}₪` }
      : isOverride
        ? { bg: '#FEE2E2', fg: '#B91C1C', label: 'הושלם ללא תשלום' }
        : { bg: '#FEE2E2', fg: '#B91C1C', label: `לא שולם — ${price}₪` };

  const handlePay = async () => {
    if (!session?.id || price <= 0) return;
    setPaying(true);
    try {
      // Mark the session as 'pending' optimistically so the badge
      // flips while the Grow checkout opens. The webhook will
      // promote it to 'paid' on completion (or back to 'unpaid' on
      // a cancel/timeout via a TTL job).
      try {
        await supabase
          .from('sessions')
          .update({ payment_status: 'pending' })
          .eq('id', session.id);
      } catch (e) { console.warn('[Pay] optimistic update failed:', e?.message); }

      console.log('[Payment] invoking payment-create with:', {
        amount: price, session_id: session.id, trainee_name: trainee?.full_name,
        trainee_email: trainee?.email, trainee_phone: trainee?.phone,
      });
      const { data, error } = await supabase.functions.invoke('payment-create', {
        body: {
          amount: price,
          description: 'מפגש אימון — AthletiGo',
          session_id: session.id,
          trainee_id: trainee?.id || null,
          trainee_name: trainee?.full_name || trainee?.name || '',
          trainee_email: trainee?.email || '',
          trainee_phone: trainee?.phone || '',
          payment_type: 'single_session',
        },
      });
      console.log('[Payment] response:', data, error);

      const url = data?.url || data?.payment_url;
      if (url) {
        // Open the Grow checkout. Same-tab redirect is the most
        // reliable pattern across mobile browsers (popups get blocked).
        window.location.href = url;
        return;
      }

      // Pull the real reason out of supabase-js's FunctionsHttpError
      // so the toast surfaces *why* the function refused (e.g. missing
      // MESHULAM secrets, invalid amount, expired auth) instead of the
      // generic fallback.
      let detailMsg = '';
      try {
        const body = await error?.context?.json?.();
        detailMsg = body?.error || body?.message || '';
      } catch {}
      if (!detailMsg && data?.error) detailMsg = data.error;
      if (!detailMsg && error?.message) detailMsg = error.message;
      console.error('[Payment] no checkout URL returned:', { data, error, detailMsg });
      throw new Error(detailMsg || 'לא התקבלה כתובת תשלום מהשרת');
    } catch (err) {
      console.error('[Pay] failed:', err);
      // Revert the optimistic 'pending' since payment never started.
      try {
        await supabase
          .from('sessions')
          .update({ payment_status: 'unpaid' })
          .eq('id', session.id);
      } catch {}
      toast.error(err?.message
        ? `שגיאה ביצירת דף תשלום: ${err.message}`
        : 'תשלומים אינם זמינים כרגע. נסה/י שוב מאוחר יותר.');
      setPaying(false);
    }
  };

  // ─── Trainee view ─────────────────────────────────────────────
  // The trainee never sees the "שולם / ממתין לתשלום / לא שולם"
  // labels. Three cases:
  //   • Coach overrode payment → render nothing. The trainee
  //     doesn't need to know about the override; their session
  //     just appears as a normal completed row elsewhere.
  //   • Already paid           → muted "✓ אישרת והוסדר" line
  //                              (no price, no "שולם" wording).
  //   • Otherwise (unpaid / null / pending) → just the pay button.
  if (!coachView) {
    if (isOverride) return null;
    if (isPaid) {
      return (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '4px 10px', borderRadius: 12,
          background: '#F3F4F6', color: '#16a34a',
          fontSize: 12, fontWeight: 600,
          fontFamily: "'Heebo', 'Assistant', sans-serif",
        }}>
          ✓ אישרת והוסדר
        </span>
      );
    }
    if (price <= 0) return null;
    return (
      <button
        type="button"
        onClick={handlePay}
        disabled={paying}
        style={{
          padding: '10px 18px', borderRadius: 14, border: 'none',
          background: '#FF6F20', color: '#FFFFFF',
          fontSize: 16, fontWeight: 600,
          cursor: paying ? 'wait' : 'pointer',
          opacity: paying ? 0.7 : 1,
          fontFamily: "'Barlow', 'Heebo', 'Assistant', sans-serif",
          boxShadow: '0 2px 6px rgba(255, 111, 32, 0.25)',
        }}
      >
        {paying ? 'פותח תשלום…' : `שלם ${price}₪ 💳`}
      </button>
    );
  }

  // ─── Coach view ───────────────────────────────────────────────
  // Full status palette + price label. No pay button (coaches
  // don't pay on behalf of trainees through this badge).
  return (
    <span style={{
      display: 'inline-block', padding: '4px 12px', borderRadius: 14,
      background: badge.bg, color: badge.fg,
      fontSize: 12, fontWeight: 700,
    }}>{badge.label}</span>
  );
}
