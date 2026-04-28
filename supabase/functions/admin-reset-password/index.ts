// Edge Function: admin-reset-password
//
// Coach invokes from src/pages/TraineeProfile.jsx via
// `supabase.functions.invoke('admin-reset-password', {
//    body: { trainee_id, new_password }
//  })`.
//
// Uses the service-role key (server-side only) to call
// supabase.auth.admin.updateUserById, the only API that can change
// another user's password directly. The service-role key MUST stay
// in the Edge Function's environment — never ship it to the client.
//
// SECURITY NOTE: this function does NOT verify the caller is the
// coach who owns the trainee. For a multi-coach production setup,
// add a JWT check (req.headers.authorization) plus a lookup that
// confirms users.coach_id === <caller> before updating. For a
// single-coach deployment, the implicit "you're authenticated"
// check from anon-key invocation is sufficient.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { trainee_id, new_password } = await req.json();

    if (!trainee_id || !new_password) {
      return new Response(
        JSON.stringify({ error: 'trainee_id and new_password required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (typeof new_password !== 'string' || new_password.length < 6) {
      return new Response(
        JSON.stringify({ error: 'Password must be at least 6 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { error } = await admin.auth.admin.updateUserById(trainee_id, {
      password: new_password,
    });

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
