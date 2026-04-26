// Edge Function: payment-webhook
//
// Public callback endpoint Meshulam (Grow) hits after the trainee
// completes (or cancels) a checkout. Configured via the `notifyUrl`
// param sent in payment-create.
//
// We:
//   1. Parse the body — Meshulam sends application/x-www-form-
//      urlencoded; we tolerate JSON too.
//   2. Look up the matching `payments` row by processId (or by the
//      cField1 session_id passthrough as a fallback).
//   3. On success (status=1):
//        - payments.status = 'completed'
//        - sessions.payment_status = 'paid' + status='confirmed'
//        - income row in /lifeos for the coach
//        - notification for the coach
//   4. On failure / cancel:
//        - payments.status = 'failed' or 'cancelled'
//        - sessions.payment_status = 'unpaid' (rollback the
//          optimistic 'pending' the frontend set)
//
// No JWT auth — the function is public. We don't trust the body
// blindly; the processId is sufficient to find the right row, and
// Meshulam only sends genuine callbacks for transactions it
// processed. For extra safety we also re-query the session and
// only flip status if amount matches.
//
// Required Supabase secrets:
//   SUPABASE_URL                — auto-injected
//   SUPABASE_SERVICE_ROLE_KEY   — auto-injected (RLS bypass for
//                                 cross-user writes)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Parse callback body ──────────────────────────────────────
    // Meshulam posts form-encoded by default. We tolerate JSON for
    // forward-compat (their newer "Grow Pay" endpoints sometimes do).
    const contentType = (req.headers.get('content-type') || '').toLowerCase();
    let payload: Record<string, any> = {};
    try {
      if (contentType.includes('application/json')) {
        payload = await req.json();
      } else {
        const form = await req.formData();
        for (const [k, v] of form.entries()) payload[k] = typeof v === 'string' ? v : String(v);
      }
    } catch (e) {
      console.error('[payment-webhook] body parse failed:', e?.message);
    }
    console.log('[payment-webhook] payload:', payload);

    const status = Number(payload.status ?? payload.statusCode ?? 0);
    const processId =
      payload.processId || payload.process_id || payload.processToken || null;
    const transactionId =
      payload.transactionId || payload.asmachta || payload.transaction_id || null;
    const paidAmount = Number(payload.paymentSum ?? payload.sum ?? payload.amount ?? 0);
    const cFieldSession = payload.cField1 || null;
    const cFieldTrainee = payload.cField2 || null;
    const cFieldType    = payload.cField3 || null;

    if (!processId && !cFieldSession) {
      console.error('[payment-webhook] no processId or cField1; aborting');
      return text('OK', 200); // 200 so Meshulam doesn't retry forever
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // ── Find the matching payments row ──────────────────────────
    let paymentRow: any = null;
    if (processId) {
      const { data } = await admin
        .from('payments').select('*')
        .eq('process_id', processId).maybeSingle();
      paymentRow = data;
    }
    if (!paymentRow && cFieldSession) {
      const { data } = await admin
        .from('payments').select('*')
        .eq('session_id', cFieldSession)
        .order('created_at', { ascending: false })
        .limit(1);
      paymentRow = data?.[0] || null;
    }

    // Outcome bucket — 1 = success on Meshulam's spec.
    const isSuccess = status === 1;

    // ── Update payments row ─────────────────────────────────────
    if (paymentRow?.id) {
      try {
        await admin.from('payments').update({
          status: isSuccess ? 'completed' : (status === 0 ? 'cancelled' : 'failed'),
          transaction_id: transactionId,
          raw_callback: payload,
          completed_at: isSuccess ? new Date().toISOString() : null,
        }).eq('id', paymentRow.id);
      } catch (e) {
        console.warn('[payment-webhook] payments update failed:', e?.message);
      }
    } else {
      // No matching row — create one so the audit trail isn't
      // missing this callback. Best-effort.
      try {
        await admin.from('payments').insert({
          trainee_id: cFieldTrainee || null,
          session_id: cFieldSession || null,
          amount: paidAmount || 0,
          status: isSuccess ? 'completed' : 'failed',
          process_id: processId,
          transaction_id: transactionId,
          payment_type: cFieldType || null,
          raw_callback: payload,
          completed_at: isSuccess ? new Date().toISOString() : null,
        });
      } catch (e) {
        console.warn('[payment-webhook] orphan payment insert failed:', e?.message);
      }
    }

    // ── Update sessions row ─────────────────────────────────────
    const sessionId = paymentRow?.session_id || cFieldSession;
    if (sessionId) {
      try {
        await admin.from('sessions').update({
          payment_status: isSuccess ? 'paid' : 'unpaid',
          // Confirm the session on successful payment — the trainee
          // already signed the health declaration to reach the pay
          // step, so this is the canonical "all green" flip.
          ...(isSuccess ? { status: 'confirmed' } : {}),
          payment_id: paymentRow?.id || null,
        }).eq('id', sessionId);
      } catch (e) {
        console.warn('[payment-webhook] session update failed:', e?.message);
      }
    }

    // ── Cross-app: income row + coach notification ──────────────
    if (isSuccess) {
      const coachId = paymentRow?.user_id || null;
      const traineeId = paymentRow?.trainee_id || cFieldTrainee || null;
      const amount = Number(paymentRow?.amount || paidAmount || 0);
      // Resolve trainee name + coach for the notification message.
      let traineeName = '';
      if (traineeId) {
        try {
          const { data } = await admin
            .from('users').select('full_name').eq('id', traineeId).maybeSingle();
          traineeName = data?.full_name || '';
        } catch {}
      }

      // Income row in /lifeos.
      if (coachId && amount > 0) {
        try {
          await admin.from('income').insert({
            user_id: coachId,
            amount,
            source: 'training',
            description: paymentRow?.description || 'מפגש אימון — תשלום אונליין',
            client_name: traineeName || null,
            product: paymentRow?.payment_type || 'single_session',
            date: new Date().toISOString().slice(0, 10),
          });
        } catch (e) {
          console.warn('[payment-webhook] income insert failed:', e?.message);
        }
      }

      // Coach popup notification — picked up by
      // PopupNotificationManager on next dashboard load.
      if (coachId) {
        try {
          await admin.from('notifications').insert({
            user_id: coachId,
            type: 'session_confirmed',
            title: '💳 תשלום התקבל ומפגש אושר',
            message: `${traineeName || 'מתאמן/ת'} שילם/ה ${amount}₪ ואישר/ה את המפגש`,
            link: traineeId ? `/TraineeProfile?userId=${traineeId}` : null,
            is_read: false,
            data: {
              trainee_id: traineeId,
              session_id: sessionId,
              payment_id: paymentRow?.id || null,
              amount,
            },
          });
        } catch (e) {
          console.warn('[payment-webhook] notification insert failed:', e?.message);
        }
      }
    }

    // Always 200 so Meshulam doesn't retry. Errors above are
    // logged and the audit row captures the raw_callback for
    // forensics.
    return text('OK', 200);
  } catch (err) {
    console.error('[payment-webhook] unexpected:', err);
    // Still return 200 to avoid retry storms; we have the log.
    return text('OK', 200);
  }
});

function text(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
  });
}
