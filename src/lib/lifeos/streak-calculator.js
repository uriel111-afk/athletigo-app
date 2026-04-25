// ═══════════════════════════════════════════════════════════════════
// Streak Calculator — counts consecutive days of any activity
// ═══════════════════════════════════════════════════════════════════
// A day "counts" if the user did ANY of:
//   - added income or expense
//   - completed a task
//   - published content
//   - acted on a lead (created or status change)
//   - logged a community metric
// ═══════════════════════════════════════════════════════════════════

import { supabase } from '@/lib/supabaseClient';

const dayKey = (d) => new Date(d).toISOString().slice(0, 10);

export async function calculateStreak(userId) {
  const days = new Set();

  // Pull the last ~60 days of signals in parallel.
  const since = new Date();
  since.setDate(since.getDate() - 60);
  const sinceISO = since.toISOString().slice(0, 10);
  const sinceTS = since.toISOString();

  const [income, expenses, tasks, content, leads, community] = await Promise.all([
    supabase.from('income').select('date').eq('user_id', userId).gte('date', sinceISO),
    supabase.from('expenses').select('date').eq('user_id', userId).gte('date', sinceISO),
    supabase.from('life_os_tasks').select('completed_at').eq('user_id', userId).eq('status', 'completed').gte('completed_at', sinceTS),
    supabase.from('content_calendar').select('scheduled_date').eq('user_id', userId).eq('status', 'published').gte('scheduled_date', sinceISO),
    supabase.from('leads').select('created_at').eq('coach_id', userId).gte('created_at', sinceTS),
    supabase.from('community_metrics').select('date').eq('user_id', userId).gte('date', sinceISO),
  ]);

  (income.data || []).forEach(r => r.date && days.add(dayKey(r.date)));
  (expenses.data || []).forEach(r => r.date && days.add(dayKey(r.date)));
  (tasks.data || []).forEach(r => r.completed_at && days.add(dayKey(r.completed_at)));
  (content.data || []).forEach(r => r.scheduled_date && days.add(dayKey(r.scheduled_date)));
  (leads.data || []).forEach(r => r.created_at && days.add(dayKey(r.created_at)));
  (community.data || []).forEach(r => r.date && days.add(dayKey(r.date)));

  // Walk backwards from today. Break on first gap. Count today even if
  // empty so far — user might still act; count yesterday as required.
  const cursor = new Date();
  let streak = 0;
  // Include today optimistically only if there's already an activity.
  // Otherwise start from yesterday.
  if (days.has(dayKey(cursor))) {
    streak = 1;
    cursor.setDate(cursor.getDate() - 1);
  } else {
    cursor.setDate(cursor.getDate() - 1);
  }
  // Now count consecutive prior days.
  while (days.has(dayKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}
