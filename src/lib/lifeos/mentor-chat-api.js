import { supabase } from '@/lib/supabaseClient';

// Calls the mentor-chat Edge Function. The function pulls fresh
// Supabase context server-side (with service role) and proxies the
// call to Claude — the Anthropic key never touches the browser.
//
// `history` is an array of { role: 'user' | 'assistant', content }.
// The server caps it at 20 turns and verifies the caller's JWT.
export async function askMentor(question, history = [], image = null) {
  const body = { question, history };
  // image: { url, path, bucket? } — server moves the file out of /chat
  // when the model decides it's a receipt/document.
  if (image && image.url && image.path) {
    body.image = {
      url: image.url,
      path: image.path,
      bucket: image.bucket || 'lifeos-files',
    };
  }
  const { data, error } = await supabase.functions.invoke('mentor-chat', { body });
  if (error) {
    const detail = error?.context?.error || error?.message || 'unknown';
    throw new Error(detail);
  }
  // Empty reply is OK if the server actually performed actions —
  // the UI shows "בוצע" chips even without text.
  if (!data?.reply && !(data?.actions?.length > 0)) {
    throw new Error('תשובה ריקה מהמנטור');
  }
  return data;
}
