import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const { userId, newEmail } = await req.json();

    // Verify JWT (who is calling)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing auth header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_ANON_KEY') || '',
    );

    // Get caller identity
    const { data: { user: caller }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if caller is coach. Mirrors the create-trainee gate so any
    // user the rest of the app already treats as a coach (is_coach flag,
    // role 'coach', or role 'admin') passes here too.
    const { data: callerProfile } = await supabaseClient
      .from('users')
      .select('role, is_coach')
      .eq('id', caller.id)
      .single();

    const isCoach =
      callerProfile?.is_coach === true ||
      callerProfile?.role === 'coach' ||
      callerProfile?.role === 'admin';

    if (!isCoach) {
      return new Response(JSON.stringify({ error: 'Only coaches can update trainee email' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use admin client to update auth.users
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
    );

    // Update Auth (with email_confirm: true so no verification needed)
    const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      email: newEmail,
      email_confirm: true,
    });

    if (updateAuthError) throw updateAuthError;

    // Also update the users table to keep in sync
    const { error: updateTableError } = await supabaseAdmin
      .from('users')
      .update({ email: newEmail })
      .eq('id', userId);

    if (updateTableError) throw updateTableError;

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
