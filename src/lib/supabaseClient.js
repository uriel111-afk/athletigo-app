import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://rrxcycidsojncpqlagsf.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyeGN5Y2lkc29qbmNwcWxhZ3NmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4NjAzNjIsImV4cCI6MjA5MDQzNjM2Mn0._tIaFuME7WzCH4s-aCvdJldoVfu-snFj4Wn5aumx7cI";

// No-op lock for @supabase/auth-js. The default lock uses
// navigator.locks with an internal 'steal' fallback — when the
// Android Chrome camera intent unmounts and remounts our React tree
// mid-upload, the freshly mounted tree's auth refresh STEALS the lock
// held by the old tree's in-flight upload, breaking it with:
//   "Lock broken by another request with the 'steal' option"
// We have one auth context per tab; cross-call serialization isn't
// load-bearing here. Running fn() directly removes the failure mode
// without changing observable auth behavior.
const noLock = async (_name, _acquireTimeout, fn) => fn();

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    lock: noLock,
  },
});
