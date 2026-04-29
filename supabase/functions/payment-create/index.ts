import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Pick endpoint by MESHULAM_ENV ('sandbox' | 'production'). Default
// is production so existing deploys don't change behavior. Switch
// via:   supabase secrets set MESHULAM_ENV=sandbox
// Sandbox uses test cards (Meshulam's docs list them); no real
// charges and no real transaction emails.
const MESHULAM_ENV = (Deno.env.get('MESHULAM_ENV') || 'production').toLowerCase();
const MESHULAM_ENDPOINT = MESHULAM_ENV === 'sandbox'
  ? 'https://sandbox.meshulam.co.il/api/light/server/1.0/createPaymentProcess'
  : 'https://api.meshulam.co.il/api/light/server/1.0/createPaymentProcess';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Boot-time diagnostics — env presence + endpoint. Helpful when
    // a deploy lands without one of the secrets being copied over.
    console.log('[payment-create] env:', MESHULAM_ENV, 'endpoint:', MESHULAM_ENDPOINT);
    console.log(
      '[payment-create] secrets ok:',
      'MESHULAM_USER_ID', !!Deno.env.get('MESHULAM_USER_ID'),
      'MESHULAM_API_KEY', !!Deno.env.get('MESHULAM_API_KEY'),
    );

    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader) return json({ error: 'לא מורשה' }, 401);

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
    if (authError || !user) return json({ error: 'לא מורשה' }, 401);

    const body = await req.json().catch(() => ({}));
    console.log('[payment-create] request body:', JSON.stringify(body));
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) return json({ error: 'סכום לא תקין' }, 400);

    const description = (body.description || 'AthletiGo — מפגש אימון').toString();
    const sessionId = body.session_id || null;
    const traineeName = (body.trainee_name || user.user_metadata?.full_name || '').toString();
    const traineePhone = (body.trainee_phone || '').toString();
    const traineeEmail = (body.trainee_email || user.email || '').toString();
    const paymentType = (body.payment_type || 'single_session').toString();

    const admin = createClient(supabaseUrl, serviceRoleKey);

    let coachId: string | null = null;
    if (sessionId) {
      const { data } = await admin.from('sessions').select('coach_id').eq('id', sessionId).maybeSingle();
      coachId = data?.coach_id || null;
    }
    if (!coachId) {
      const { data } = await admin.from('users').select('coach_id').eq('id', user.id).maybeSingle();
      coachId = data?.coach_id || null;
    }

    const origin = req.headers.get('origin') || req.headers.get('referer')?.replace(/\/$/, '') || 'https://athletigo-coach.com';
    const notifyUrl = `${supabaseUrl}/functions/v1/payment-webhook`;
    const successUrl = sessionId
      ? `${origin}/TraineeHome?paid=1&session=${encodeURIComponent(sessionId)}`
      : `${origin}/TraineeHome?paid=1`;
    const cancelUrl = `${origin}/TraineeHome?paid=0`;

    const form = new FormData();
    // pageCode is the Grow payment-page identifier (configured in
    // the Grow dashboard), NOT the account user id. Sending the
    // user id here was the regression that made Grow reject the
    // request with "page not found"-style errors.
    form.append('pageCode', '1');
    form.append('userId', meshulamUserId);
    form.append('apiKey', meshulamApiKey);
    form.append('sum', amount.toFixed(2));
    form.append('description', description);
    if (traineeName) form.append('pageField[fullName]', traineeName);
    if (traineePhone) form.append('pageField[phone]', traineePhone);
    if (traineeEmail) form.append('pageField[email]', traineeEmail);
    form.append('successUrl', successUrl);
    form.append('cancelUrl', cancelUrl);
    form.append('notifyUrl', notifyUrl);
    form.append('cField1', sessionId || '');
    form.append('cField2', user.id);
    form.append('cField3', paymentType);

    // Echo the outbound payload so we can see exactly what hit Grow.
    // apiKey is masked so the production Edge Function logs don't
    // leak the secret if they're ever shared.
    const debugPayload: Record<string, string> = {};
    for (const [k, v] of form.entries()) {
      debugPayload[k] = (k === 'apiKey') ? '***' : (typeof v === 'string' ? v : String(v));
    }
    console.log('[payment-create] sending to Grow:', JSON.stringify(debugPayload));

    let meshulamRes;
    try {
      meshulamRes = await fetch(MESHULAM_ENDPOINT, { method: 'POST', body: form });
    } catch (e: any) {
      console.error('[payment-create] meshulam fetch failed:', e?.message);
      return json({ error: 'שירות התשלומים לא זמין כרגע' }, 502);
    }

    const meshulamJson = await meshulamRes.json().catch(() => null);
    console.log(
      '[payment-create] Grow response status:', meshulamRes.status,
      'body:', JSON.stringify(meshulamJson),
    );

    if (!meshulamJson || Number(meshulamJson.status) !== 1 || !meshulamJson?.data?.url) {
      console.error('[payment-create] meshulam error:', meshulamJson);
      const errMsg = meshulamJson?.err || meshulamJson?.data?.err || 'יצירת דף התשלום נכשלה';
      return json({ error: errMsg, details: meshulamJson }, 502);
    }

    const { url, processId } = meshulamJson.data;

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
    } catch (e: any) {
      console.warn('[payment-create] payments insert failed:', e?.message);
    }

    return json({ url, processId });
  } catch (err: any) {
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
