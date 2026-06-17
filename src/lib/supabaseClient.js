import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = "https://rrxcycidsojncpqlagsf.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyeGN5Y2lkc29qbmNwcWxhZ3NmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4NjAzNjIsImV4cCI6MjA5MDQzNjM2Mn0._tIaFuME7WzCH4s-aCvdJldoVfu-snFj4Wn5aumx7cI";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // No-op auth lock. The default lock uses navigator.locks with an
    // internal 'steal' fallback inside @supabase/auth-js — when the
    // Android Chrome camera intent unmounts and remounts our React
    // tree mid-upload, a fresh auth.getUser call from the new tree
    // STEALS the lock from the old tree's in-flight upload and
    // surfaces:
    //   "Lock broken by another request with the 'steal' option"
    // We have one auth context per tab and don't need
    // cross-call serialization. Running fn() directly removes the
    // failure mode without changing observable auth behavior.
    lock: async (_name, _acquireTimeout, fn) => fn(),
  },
});
