import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// Creates a coordinator (רכזת) team member. Uses the admin API
// (service role) to create the auth user, then inserts the profile
// row with role 'coordinator'. Gated to the master coach only.
//
// Mirrors the create-coach pattern. Deploy:
//   supabase functions deploy create-coordinator
const MASTER_COACH_ID = '67b0093d-d4ca-4059-8572-26f020bef1eb';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status,
    });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'לא מורשה' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Verify caller identity from their JWT.
    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: callerAuth }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !callerAuth) return json({ error: 'לא מורשה' }, 401);

    // Only the master coach may create coordinators.
    if (callerAuth.id !== MASTER_COACH_ID) {
      return json({ error: 'רק מנהל-העל יכול ליצור רכזת' }, 403);
    }

    const body = await req.json();
    const { email, password, full_name } = body || {};
    if (!email || !password || !full_name) {
      return json({ error: 'אימייל, סיסמה ושם מלא הם שדות חובה' }, 400);
    }
    if (String(password).length < 6) {
      return json({ error: 'הסיסמה חייבת להכיל לפחות 6 תווים' }, 400);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Step 1: create the auth user (email auto-confirmed, no email sent).
    const { data: authData, error: createAuthError } = await supabaseAdmin.auth.admin.createUser({
      email: String(email).trim(),
      password: String(password),
      email_confirm: true,
    });
    if (createAuthError || !authData?.user) {
      const msg = createAuthError?.message || 'שגיאה ביצירת משתמש';
      const friendly = /already|registered|duplicate/i.test(msg)
        ? 'משתמש עם אימייל זה כבר קיים' : msg;
      return json({ error: friendly }, 400);
    }

    const authUserId = authData.user.id;

    // Step 2: insert the coordinator profile row. coach_id = the master
    // coach so the coordinator is owned by them (future admin-sees-all).
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('users')
      .insert({
        id: authUserId,
        email: String(email).trim(),
        full_name: String(full_name).trim(),
        role: 'coordinator',
        is_coach: false,
        coach_id: MASTER_COACH_ID,
        client_status: 'active',
        onboarding_completed: true,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (profileError) {
      // Roll back the auth user so we don't leave an orphan.
      await supabaseAdmin.auth.admin.deleteUser(authUserId);
      return json({ error: 'שגיאה בשמירת פרופיל הרכזת: ' + profileError.message }, 500);
    }

    return json({ user: authData.user, profile }, 200);
  } catch (err: any) {
    return json({ error: err?.message || 'שגיאה פנימית' }, 500);
  }
});
