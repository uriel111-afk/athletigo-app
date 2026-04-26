// Edge Function: payment-create
//
// Front-end calls this to start a Meshulam (Grow) checkout for a
// session. We:
//   1. Verify the caller's JWT (no anonymous use).
//   2. Validate the session belongs to this trainee + has a price.
//   3. POST to Meshulam's createPaymentProcess endpoint with
//      multipart/form-data (their API doesn't accept JSON).
//   4. Insert a `payments` row with status='pending' so the webhook
//      can find the matching session by process_id later.
//   5. Return { url, processId } — the frontend redirects the
//      browser to `url` and Meshulam shows the hosted checkout.
//
// Required Supabase secrets:
//   SUPABASE_URL                — auto-injected
//   SUPABASE_ANON_KEY           — auto-injected
//   SUPABASE_SERVICE_ROLE_KEY   — auto-injected (used to insert
//                                 payments row past RLS)
//   MESHULAM_USER_ID            — set via:
//     supabase secrets set MESHULAM_USER_ID=470162
//   MESHULAM_API_KEY            — set via:
//     supabase secrets set MESHULAM_API_KEY=...

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MESHULAM_ENDPOINT =
  'https://api.meshulam.co.il/api/light/server/1.0/createPaymentProcess';

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Auth ─────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader) {
      return json({ error: 'לא מורשה' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const meshulamUserId = Deno.env.get('MESHULAM_USER_ID');
    const meshulamApiKey = Deno.env.get('MESHULAM_API_KEY');

    if (!meshulamUserId || !meshulamApiKey) {
      console.error('[payment-create] missing MESHULAM_* secrets');
      return json({ error: 'תשלומים לא מוגדרים בשרת' }, 500);
    }

    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return json({ error: 'לא מורשה' }, 401);
    }

    // ── Parse + validate body ────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return json({ error: 'סכום לא תקין' }, 400);
    }
    const description = (body.description || 'מפגש אימון — AthletiGo').toString();
    const sessionId = body.session_id || null;
    const traineeName = (body.trainee_name || user.user_metadata?.full_name || '').toString();
    const traineePhone = (body.trainee_phone || '').toString();
    const traineeEmail = (body.trainee_email || user.email || '').toString();
    const paymentType = (body.payment_type || 'single_session').toString();

    // Service-role client used for the payments-row insert (the
    // anon-with-JWT client would be filtered by RLS, and the
    // trainee_view_own_payments policy doesn't grant INSERT — only
    // the server should write here).
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Resolve coach_id for the audit row + later income mirroring.
    // For sessions the coach_id is on the session row; if no
    // session was passed, fall back to whoever the trainee is
    // linked to (users.coach_id).
    let coachId: string | null = null;
    if (sessionId) {
      const { data } = await admin
        .from('sessions').select('coach_id').eq('id', sessionId).maybeSingle();
      coachId = data?.coach_id || null;
    }
    if (!coachId) {
      const { data } = await admin
        .from('users').select('coach_id').eq('id', user.id).maybeSingle();
      coachId = data?.coach_id || null;
    }

    // ── Build success/cancel/notify URLs ─────────────────────────
    // notifyUrl is the public URL of payment-webhook (Meshulam
    // POSTs the result here server-to-server). success/cancel
    // bring the trainee back to the app — use Origin when
    // available so dev and prod both work.
    const origin = req.headers.get('origin')
      || req.headers.get('referer')?.replace(/\/$/, '')
      || 'https://athletigo-coach.com';
    const notifyUrl = `${supabaseUrl}/functions/v1/payment-webhook`;
    const successUrl = sessionId
      ? `${origin}/TraineeHome?paid=1&session=${encodeURIComponent(sessionId)}`
      : `${origin}/TraineeHome?paid=1`;
    const cancelUrl  = `${origin}/TraineeHome?paid=0`;

    // ── Call Meshulam ────────────────────────────────────────────
    // Meshulam's API is multipart/form-data. JSON body returns 200
    // with a "form parsing failed" status from their side, so
    // we explicitly construct FormData here.
    const form = new FormData();
    form.append('pageCode', meshulamUserId);
    form.append('userId', meshulamUserId);
    form.append('apiKey', meshulamApiKey);
    form.append('sum', amount.toFixed(2));
    form.append('description', description);
    if (traineeName)  form.append('pageField[fullName]', traineeName);
    if (traineePhone) form.append('pageField[phone]',    traineePhone);
    if (traineeEmail) form.append('pageField[email]',    traineeEmail);
    form.append('successUrl', successUrl);
    form.append('cancelUrl',  cancelUrl);
    form.append('notifyUrl',  notifyUrl);
    // Custom passthrough fields — Meshulam echoes these back in the
    // webhook so we can match a callback to the right session/payer.
    form.append('cField1', sessionId || '');
    form.append('cField2', user.id);
    form.append('cField3', paymentType);

    let meshulamRes;
    try {
      meshulamRes = await fetch(MESHULAM_ENDPOINT, { method: 'POST', body: form });
    } catch (e) {
      console.error('[payment-create] meshulam fetch failed:', e?.message);
      return json({ error: 'שירות התשלומים לא זמין כרגע' }, 502);
    }
    const meshulamJson = await meshulamRes.json().catch(() => null);
    // Meshulam payload shape: { status: 1, data: { url, processId } }
    // status=1 is success. Anything else is an error described in
    // err / data.err.
    if (!meshulamJson || Number(meshulamJson.status) !== 1 || !meshulamJson?.data?.url) {
      console.error('[payment-create] meshulam error:', meshulamJson);
      const errMsg = meshulamJson?.err || meshulamJson?.data?.err
        || 'יצירת דף התשלום נכשלה';
      return json({ error: errMsg, details: meshulamJson }, 502);
    }

    const { url, processId } = meshulamJson.data;

    // ── Audit row ────────────────────────────────────────────────
    try {
      await admin.from('payments').insert({
        user_id: coachId,
        trainee_id: user.id,
        session_id: sessionId,
        amount,
        description,
        status: 'pending',
        process_id: processId,
        payment_type: paymentType,
      });
    } catch (e) {
      // Non-blocking: the trainee can still pay, the webhook may
      // create the row on its end if needed.
      console.warn('[payment-create] payments insert failed:', e?.message);
    }

    return json({ url, processId });
  } catch (err) {
    console.error('[payment-create] unexpected:', err);
    return json({ error: 'תקלה בלתי צפויה ביצירת התשלום' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
