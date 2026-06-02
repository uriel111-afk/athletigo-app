import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://rrxcycidsojncpqlagsf.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyeGN5Y2lkc29qbmNwcWxhZ3NmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4NjAzNjIsImV4cCI6MjA5MDQzNjM2Mn0._tIaFuME7WzCH4s-aCvdJldoVfu-snFj4Wn5aumx7cI";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
