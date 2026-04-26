import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// Renders the post-checkout result screen. Mounted in TraineeHome
// (which is also the successUrl/cancelUrl target the Edge Function
// hands to Meshulam). Two states driven by the `paid` query param:
//   ?paid=1[&session=<id>]  → success ✅
//   ?paid=0                 → failure ❌
// Anything else: render nothing.
//
// On dismiss we clean the URL so a refresh won't re-open the modal.
// On retry (failure path) we trigger another payment-create call
// for the same session, mirroring SessionPaymentBadge's flow.

export default function PaymentResultModal() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const paid = params.get('paid');
  const sessionId = params.get('session');

  const [open, setOpen] = useState(paid === '1' || paid === '0');
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (paid === '1' || paid === '0') setOpen(true);
  }, [paid]);

  const closeAndCleanUrl = () => {
    setOpen(false);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('paid');
      url.searchParams.delete('session');
      window.history.replaceState({}, '', url.pathname + (url.searchParams.toString() ? `?${url.searchParams}` : ''));
    } catch {}
  };

  const handleRetry = async () => {
    if (!sessionId) {
      closeAndCleanUrl();
      return;
    }
    setRetrying(true);
    try {
      const { data: session } = await supabase
        .from('sessions')
        .select('id, price, trainee_id')
        .eq('id', sessionId)
        .maybeSingle();
      if (!session?.price) { closeAndCleanUrl(); return; }

      const { data: { user } } = await supabase.auth.getUser();
      const { data: trainee } = user
        ? await supabase.from('users').select('full_name, email, phone').eq('id', user.id).maybeSingle()
        : { data: null };

      const { data, error } = await supabase.functions.invoke('payment-create', {
        body: {
          amount: Number(session.price),
          description: 'מפגש אימון — AthletiGo',
          session_id: session.id,
          trainee_name: trainee?.full_name || null,
          trainee_email: trainee?.email || null,
          trainee_phone: trainee?.phone || null,
          payment_type: 'single_session',
        },
      });
      if (error) throw error;
      const url = data?.url || data?.payment_url;
      if (url) {
        window.location.href = url;
        return;
      }
    } catch (e) {
      console.warn('[PaymentResultModal] retry failed:', e?.message);
    }
    setRetrying(false);
    closeAndCleanUrl();
  };

  if (!open) return null;
  const success = paid === '1';

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 11000,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          width: '100%', maxWidth: 420,
          background: '#FDF8F3', borderRadius: 24,
          padding: '32px 24px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
          textAlign: 'center',
          fontFamily: "'Barlow', 'Heebo', 'Assistant', sans-serif",
          direction: 'rtl',
        }}
      >
        <div style={{
          width: 88, height: 88, borderRadius: '50%',
          background: success ? '#E8F5E9' : '#FEE2E2',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px', fontSize: 48,
        }}>
          {success ? '✅' : '❌'}
        </div>

        <h2 style={{
          margin: 0, color: '#1a1a1a',
          fontSize: 24, fontWeight: 700,
        }}>
          {success ? 'התשלום התקבל בהצלחה!' : 'התשלום לא הושלם'}
        </h2>

        <p style={{
          margin: '12px 0 28px', color: '#555',
          fontSize: 16, lineHeight: 1.5,
        }}>
          {success
            ? 'המפגש אושר — נתראה באימון! 💪'
            : 'אפשר לנסות שוב או לחזור ולסיים מאוחר יותר.'}
        </p>

        {success ? (
          <button
            type="button"
            onClick={closeAndCleanUrl}
            style={primaryBtnStyle}
          >
            חזרה לדף הבית
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 10, flexDirection: 'column' }}>
            <button
              type="button"
              onClick={handleRetry}
              disabled={retrying}
              style={{
                ...primaryBtnStyle,
                opacity: retrying ? 0.7 : 1,
                cursor: retrying ? 'wait' : 'pointer',
              }}
            >
              {retrying ? 'פותח תשלום…' : 'נסה שוב 💳'}
            </button>
            <button
              type="button"
              onClick={closeAndCleanUrl}
              style={secondaryBtnStyle}
            >
              אחר כך
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const primaryBtnStyle = {
  width: '100%',
  padding: '14px 20px',
  borderRadius: 14,
  border: 'none',
  background: '#FF6F20',
  color: '#FFFFFF',
  fontSize: 16,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: "'Barlow', 'Heebo', 'Assistant', sans-serif",
  boxShadow: '0 2px 6px rgba(255, 111, 32, 0.25)',
};

const secondaryBtnStyle = {
  width: '100%',
  padding: '12px 20px',
  borderRadius: 14,
  border: '1px solid #F0E4D0',
  background: '#FFFFFF',
  color: '#555',
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: "'Barlow', 'Heebo', 'Assistant', sans-serif",
};
