// ═══════════════════════════════════════════════════════════════════
// Income streams — CRUD over a JSONB column on the users row.
// ═══════════════════════════════════════════════════════════════════
// Each stream:
//   { name, target_annual, actual_ytd, monthly_actual, growth_rate }
//
// Stored in `users.income_streams` JSONB. If that column doesn't exist
// on the live DB yet, getIncomeStreams falls back to [] and mutating
// helpers throw a clear error the caller can surface to the user (run
// the ALTER TABLE migration noted in the dashboard report).
// ═══════════════════════════════════════════════════════════════════

import { supabase } from '@/lib/supabaseClient';

const EMPTY = [];

const COLUMN_MISSING_CODE = '42703';

const normalizeStream = (s = {}) => ({
  name:           String(s.name || '').trim(),
  target_annual:  Number(s.target_annual)  || 0,
  actual_ytd:     Number(s.actual_ytd)     || 0,
  monthly_actual: Number(s.monthly_actual) || 0,
  growth_rate:    Number(s.growth_rate)    || 0,
});

export async function getIncomeStreams(userId) {
  if (!userId) return EMPTY;
  const { data, error } = await supabase
    .from('users')
    .select('income_streams')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    if (error.code === COLUMN_MISSING_CODE) return EMPTY;
    throw error;
  }
  return Array.isArray(data?.income_streams) ? data.income_streams : EMPTY;
}

// Idempotent on name — if a stream with the same name already exists,
// the existing array is returned unchanged.
export async function addIncomeStream(userId, { name, target_annual = 0 }) {
  if (!userId) throw new Error('userId required');
  const cleanName = String(name || '').trim();
  if (!cleanName) throw new Error('name required');

  const current = await getIncomeStreams(userId);
  if (current.some(s => s.name === cleanName)) return current;

  const next = [
    ...current,
    normalizeStream({ name: cleanName, target_annual }),
  ];
  const { error } = await supabase
    .from('users')
    .update({ income_streams: next })
    .eq('id', userId);
  if (error) throw error;
  return next;
}

// Patches one stream identified by its current name. Pass `name` in
// the patch to rename.
export async function updateIncomeStream(userId, streamName, patch = {}) {
  if (!userId) throw new Error('userId required');
  if (!streamName) throw new Error('streamName required');

  const current = await getIncomeStreams(userId);
  const next = current.map(s => {
    if (s.name !== streamName) return s;
    return normalizeStream({ ...s, ...patch });
  });
  const { error } = await supabase
    .from('users')
    .update({ income_streams: next })
    .eq('id', userId);
  if (error) throw error;
  return next;
}

export async function deleteIncomeStream(userId, streamName) {
  if (!userId) throw new Error('userId required');
  const current = await getIncomeStreams(userId);
  const next = current.filter(s => s.name !== streamName);
  const { error } = await supabase
    .from('users')
    .update({ income_streams: next })
    .eq('id', userId);
  if (error) throw error;
  return next;
}
