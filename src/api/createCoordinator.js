import { supabase } from '@/lib/supabaseClient';

// Wraps the `create-coordinator` Edge Function. Master-coach-only on
// the server (verified by auth.uid()); the caller is mirrored by the
// master-only gate on the AllUsers team section.
export async function createCoordinator({ email, password, full_name }) {
  const { data, error } = await supabase.functions.invoke('create-coordinator', {
    body: {
      email: (email || '').trim(),
      password,
      full_name: (full_name || '').trim(),
    },
  });

  if (error || !data?.profile) {
    const msg = data?.error || error?.message || 'שגיאה ביצירת רכזת';
    throw new Error(msg);
  }

  return data.profile;
}
