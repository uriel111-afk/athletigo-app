import { supabase } from '@/lib/supabaseClient';

// Wraps the `create-coach` Edge Function. Admin-only on the server;
// this caller is mirrored by the admin gate on the AllUsers button.
export async function createCoach({ email, password, full_name, phone }) {
  const { data, error } = await supabase.functions.invoke('create-coach', {
    body: {
      email,
      password,
      full_name,
      phone: phone || null,
    },
  });

  if (error || !data?.profile) {
    const msg = data?.error || error?.message || 'שגיאה ביצירת מאמן';
    throw new Error(msg);
  }

  return data.profile;
}
