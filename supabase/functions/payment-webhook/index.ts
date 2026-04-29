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
    console.log(
      '[payment-webhook] received:',
      req.method,
      'content-type:', req.headers.get('content-type') || '(none)',
    );
    const contentType = (req.headers.get('content-type') || '').toLowerCase();
    let payload: Record<string, any> = {};
    try {
      if (contentType.includes('application/json')) {
        payload = await req.json();
      } else {
        const form = await req.formData();
        for (const [k, v] of form.entries()) payload[k] = typeof v === 'string' ? v : String(v);
      }
    } catch (e: any) {
      console.error('[payment-webhook] body parse failed:', e?.message);
    }

    console.log('[payment-webhook] payload:', payload);

    const status = Number(payload.status ?? payload.statusCode ?? 0);
    const processId = payload.processId || payload.process_id || payload.processToken || null;
    const transactionId = payload.transactionId || payload.asmachta || payload.transaction_id || null;
    const paidAmount = Number(payload.paymentSum ?? payload.sum ?? payload.amount ?? 0);
    const cFieldSession = payload.cField1 || null;
    const cFieldTrainee = payload.cField2 || null;
    const cFieldType = payload.cField3 || null;

    if (!processId && !cFieldSession) {
      console.error('[payment-webhook] no processId or cField1; aborting');
      return text('OK', 200);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    let paymentRow: any = null;
    if (processId) {
      const { data } = await admin.from('payments').select('*').eq('process_id', processId).maybeSingle();
      paymentRow = data;
    }
    if (!paymentRow && cFieldSession) {
      const { data } = await admin.from('payments').select('*').eq('session_id', cFieldSession).order('created_at', { ascending: false }).limit(1);
      paymentRow = data?.[0] || null;
    }

    const isSuccess = status === 1;

    // Receipt URL — Grow/Meshulam exposes the receipt under its
    // public link domain keyed by transaction id. Built only on
    // success so failed/cancelled rows stay null.
    const receiptUrl = (isSuccess && transactionId)
      ? `https://grow.link/receipt/${encodeURIComponent(transactionId)}`
      : null;

    if (paymentRow?.id) {
      try {
        await admin.from('payments').update({
          status: isSuccess ? 'completed' : (status === 0 ? 'cancelled' : 'failed'),
          transaction_id: transactionId,
          raw_callback: payload,
          completed_at: isSuccess ? new Date().toISOString() : null,
          receipt_url: receiptUrl,
        }).eq('id', paymentRow.id);
      } catch (e: any) {
        console.warn('[payment-webhook] payments update failed:', e?.message);
      }
    } else {
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
          receipt_url: receiptUrl,
        });
      } catch (e: any) {
        console.warn('[payment-webhook] orphan payment insert failed:', e?.message);
      }
    }

    const sessionId = paymentRow?.session_id || cFieldSession;
    if (sessionId) {
      try {
        await admin.from('sessions').update({
          payment_status: isSuccess ? 'paid' : 'unpaid',
          ...(isSuccess ? { status: 'confirmed' } : {}),
          payment_id: paymentRow?.id || null,
        }).eq('id', sessionId);
      } catch (e: any) {
        console.warn('[payment-webhook] session update failed:', e?.message);
      }
    }

    if (isSuccess) {
      const coachId = paymentRow?.user_id || null;
      const traineeId = paymentRow?.trainee_id || cFieldTrainee || null;
      const amount = Number(paymentRow?.amount || paidAmount || 0);

      let traineeName = '';
      if (traineeId) {
        try {
          const { data } = await admin.from('users').select('full_name').eq('id', traineeId).maybeSingle();
          traineeName = data?.full_name || '';
        } catch {}
      }

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
        } catch (e: any) {
          console.warn('[payment-webhook] income insert failed:', e?.message);
        }
      }

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
        } catch (e: any) {
          console.warn('[payment-webhook] notification insert failed:', e?.message);
        }
      }

      // Mirror the receipt into the documents table so the coach
      // finds it in the trainee's "מסמכים" tab and the trainee can
      // re-open it from their own profile. Best-effort.
      if (receiptUrl && (coachId || traineeId)) {
        try {
          await admin.from('documents').insert({
            user_id: coachId || null,
            trainee_id: traineeId || null,
            name: `קבלה — ${traineeName || 'מתאמן/ת'} — ${amount}₪`,
            type: 'receipt',
            category: 'financial',
            file_url: receiptUrl,
            created_at: new Date().toISOString(),
          });
        } catch (e: any) {
          console.warn('[payment-webhook] documents receipt insert failed:', e?.message);
        }
      }
    }

    return text('OK', 200);
  } catch (err: any) {
    console.error('[payment-webhook] unexpected:', err);
    return text('OK', 200);
  }
});

function text(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
  });
}
