import { supabase } from '@/lib/supabaseClient';
import { isoDate, addDays } from '@/lib/lifeos/focus-api';

// ═══════════════════════════════════════════════════════════════════
// focus_weeks — the week bar's three free-text lines
// ═══════════════════════════════════════════════════════════════════
// One row per user per week: focus / reward / affirmation, surfaced as
// מיקוד / פרס / משפט. See migrations/2026-07-29-focus-weeks.sql.
//
// The week PERCENTAGE is NOT stored here. It is derived from the same
// executions the board already loads, so the bar cannot drift from the
// matrix under it.
//
// Every read is defensive: until the migration is run the table does not
// exist and PostgREST answers 404/42P01. That must degrade to "no text
// yet", never to a broken tab — the personal board is the landing screen.
// ═══════════════════════════════════════════════════════════════════

// Sunday-anchored, matching weekOf/liveWeekDays elsewhere in lifeos.
export function weekStartOf(date = isoDate()) {
  const d = new Date(date + 'T00:00:00');
  return addDays(date, -d.getDay());
}

const MISSING = new Set(['42P01', 'PGRST205', 'PGRST202']);
const isMissingTable = (e) =>
  !!e && (MISSING.has(e.code) || /focus_weeks/i.test(e.message || '') && /(does not exist|schema cache)/i.test(e.message || ''));

export async function fetchFocusWeek(userId, weekStart) {
  if (!userId || !weekStart) return null;
  const { data, error } = await supabase
    .from('focus_weeks')
    .select('id,week_start,focus,reward,affirmation')
    .eq('user_id', userId)
    .eq('week_start', weekStart)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) {
      console.warn('[focus-weeks] table missing — run migrations/2026-07-29-focus-weeks.sql');
      return null;
    }
    throw error;
  }
  return data || null;
}

// Upsert on the (user_id, week_start) unique constraint, so editing the
// same week twice updates rather than inserting a second row.
export async function saveFocusWeek(userId, weekStart, patch) {
  if (!userId || !weekStart) return null;
  const { data, error } = await supabase
    .from('focus_weeks')
    .upsert({ user_id: userId, week_start: weekStart, ...patch },
            { onConflict: 'user_id,week_start' })
    .select('id,week_start,focus,reward,affirmation')
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) {
      console.warn('[focus-weeks] table missing — run migrations/2026-07-29-focus-weeks.sql');
      return null;
    }
    throw error;
  }
  return data || null;
}
