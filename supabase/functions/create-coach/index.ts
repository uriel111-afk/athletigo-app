import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'לא מורשה' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Verify caller is an authenticated admin
    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: callerAuth }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !callerAuth) {
      return new Response(JSON.stringify({ error: 'לא מורשה' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: callerProfile } = await supabaseAdmin
      .from('users')
      .select('id, role')
      .eq('id', callerAuth.id)
      .single();

    if (callerProfile?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'רק מנהל-על יכול ליצור מאמנים' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      });
    }

    const body = await req.json();
    const { email, password, full_name, phone } = body;

    if (!email || !password || !full_name) {
      return new Response(JSON.stringify({ error: 'אימייל, סיסמה ושם מלא הם שדות חובה' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // Step 1: Create auth user (email auto-confirmed, no confirmation email sent)
    const { data: authData, error: createAuthError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createAuthError || !authData.user) {
      return new Response(JSON.stringify({ error: createAuthError?.message || 'שגיאה ביצירת משתמש' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const authUserId = authData.user.id;

    // Step 2: Insert profile into users table
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('users')
      .insert({
        id: authUserId,
        email,
        full_name,
        phone: phone || null,
        role: 'coach',
        is_coach: true,
        coach_id: null,
        client_status: null,
        onboarding_completed: true,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (profileError) {
      // Cleanup: delete the auth user so we don't leave an orphan
      await supabaseAdmin.auth.admin.deleteUser(authUserId);
      return new Response(JSON.stringify({ error: 'שגיאה בשמירת פרופיל המאמן: ' + profileError.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    return new Response(JSON.stringify({ user: authData.user, profile }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'שגיאה פנימית' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
