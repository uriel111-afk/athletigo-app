import { supabase } from '@/lib/supabaseClient';

// Calls the mentor-chat Edge Function. The function pulls fresh
// Supabase context server-side (with service role) and proxies the
// call to Claude — the Anthropic key never touches the browser.
//
// `history` is an array of { role: 'user' | 'assistant', content }.
// The server caps it at 20 turns and verifies the caller's JWT.
export async function askMentor(question, history = []) {
  const { data, error } = await supabase.functions.invoke('mentor-chat', {
    body: { question, history },
  });
  if (error) {
    const detail = error?.context?.error || error?.message || 'unknown';
    throw new Error(detail);
  }
  if (!data?.reply) {
    throw new Error('תשובה ריקה מהמנטור');
  }
  return data;
}
