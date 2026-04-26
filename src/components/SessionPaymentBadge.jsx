import React, { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";

// Renders the per-session payment status + (when applicable) the
// "שלם 💳" CTA. Used on every session card the trainee sees so any
// priced session has a clear path to payment.
//
// Modes — driven by props:
//   coachView=true  — coach reading a trainee's session card.
//                     Shows the price + a colored payment-status
//                     badge (paid green / pending orange / unpaid
//                     red / null gray "ללא תשלום"). No pay button.
//   coachView=false — trainee. Shows price + status, plus a
//                     "שלם" CTA when payment_status is
//                     'unpaid' or null (and price > 0).
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

  const isPaid    = status === 'paid';
  const isPending = status === 'pending';
  const isUnpaid  = status === 'unpaid' || status == null;

  // Visual: badge color follows the status. Orange (#FF6F20) for
  // pending matches the brand primary so the "shelm" CTA below
  // visually anchors to its own status color.
  const badge = isPaid
    ? { bg: '#E8F5E9', fg: '#15803D', label: `שולם ✓ — ${price}₪` }
    : isPending
      ? { bg: '#FFF1E6', fg: '#FF6F20', label: `ממתין לתשלום — ${price}₪` }
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

      console.log('[Payment] invoking payment-create:', {
        amount: price, session_id: session.id, trainee_name: trainee?.full_name,
      });
      const { data, error } = await supabase.functions.invoke('payment-create', {
        body: {
          amount: price,
          description: 'מפגש אימון — AthletiGo',
          session_id: session.id,
          trainee_id: trainee?.id || null,
          trainee_name: trainee?.full_name || null,
          trainee_email: trainee?.email || null,
          trainee_phone: trainee?.phone || null,
          payment_type: 'single_session',
        },
      });
      console.log('[Payment] result:', data, error);
      if (error) throw error;
      const url = data?.url || data?.payment_url;
      if (!url) {
        throw new Error('לא התקבלה כתובת תשלום מהשרת');
      }
      // Open the Grow checkout. Same-tab redirect is the most
      // reliable pattern across mobile browsers (popups get blocked).
      window.location.href = url;
    } catch (err) {
      console.error('[Pay] failed:', err);
      // Revert the optimistic 'pending' since payment never started.
      try {
        await supabase
          .from('sessions')
          .update({ payment_status: 'unpaid' })
          .eq('id', session.id);
      } catch {}
      toast.error('תשלומים אינם זמינים כרגע. נסה/י שוב מאוחר יותר.');
      setPaying(false);
    }
  };

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{
        display: 'inline-block', padding: '4px 12px', borderRadius: 14,
        background: badge.bg, color: badge.fg,
        fontSize: 12, fontWeight: 700,
      }}>{badge.label}</span>
      {!coachView && isUnpaid && (
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
      )}
    </div>
  );
}
