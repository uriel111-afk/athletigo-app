import { supabase } from '@/lib/supabaseClient';
import { getCurrentPB, normalizeExerciseName } from '@/lib/goalsApi';

/**
 * roadmap_stations — an ordered ladder of thresholds on ONE exercise
 * for ONE trainee. The LAST station by sort_order is the goal; there
 * is no separate goals row anywhere in this file.
 *
 * WHO WRITES WHAT
 *   status / reached_at   the DATABASE, never this file. Two triggers
 *                         own the clear: trg_clear_roadmap_stations
 *                         fires on a personal_records insert, and
 *                         trg_stamp_station_if_already_cleared fires
 *                         when a coach adds a station the trainee has
 *                         already passed. Nothing here sets either
 *                         column — the RLS policy is coach-only and
 *                         the trainee holds no write grant at all.
 *   everything else       the coach editor, and only it. Every write
 *                         below carries coach_id, because
 *                         coach_manage_stations keys on
 *                         auth.uid() = coach_id and a NULL there
 *                         makes the row unwritable by anyone.
 *
 * The exercise link is the free-text name, normalised with the one
 * shared normalizeExerciseName — the same rule the SQL side applies
 * as public.ag_norm_exercise_name().
 */

export const STATION_STATUS = { PLANNED: 'planned', REACHED: 'reached' };

// Every station of a trainee, ascending. Read-only.
export async function listStations(traineeId) {
  if (!traineeId) return [];
  const { data, error } = await supabase
    .from('roadmap_stations')
    .select('*')
    .eq('trainee_id', traineeId)
    .order('exercise_name', { ascending: true })
    .order('sort_order', { ascending: true });
  if (error) {
    console.warn('[roadmapApi] listStations failed:', error.message);
    return [];
  }
  return data || [];
}

// Group a flat station list into one ladder per exercise. Each ladder
// is { exerciseName, stations, goal, currentIndex, unit }:
//   goal          the last station by sort_order
//   currentIndex  the first station still planned — the one the
//                 trainee is working on. -1 when the whole ladder is
//                 cleared.
export function groupIntoLadders(stations) {
  const byExercise = new Map();
  for (const s of stations || []) {
    const key = normalizeExerciseName(s.exercise_name);
    if (!byExercise.has(key)) byExercise.set(key, []);
    byExercise.get(key).push(s);
  }
  const ladders = [];
  for (const rows of byExercise.values()) {
    const sorted = [...rows].sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
    );
    const currentIndex = sorted.findIndex(
      (s) => s.status !== STATION_STATUS.REACHED
    );
    ladders.push({
      exerciseName: sorted[0]?.exercise_name || '',
      stations: sorted,
      goal: sorted[sorted.length - 1] || null,
      currentIndex,
      unit: sorted.find((s) => s.unit)?.unit || null,
    });
  }
  return ladders;
}

// The trainee's current best for a ladder. Straight through to the
// existing records read — no second implementation, no second query
// shape. Returns 0 when there is no record yet.
export async function ladderPB(traineeId, exerciseName) {
  return getCurrentPB(traineeId, exerciseName);
}

// One PB per distinct exercise across a whole station list, so a map
// with several ladders issues one read per ladder and no more.
export async function pbsForStations(traineeId, stations) {
  const names = [];
  const seen = new Set();
  for (const s of stations || []) {
    const key = normalizeExerciseName(s.exercise_name);
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(s.exercise_name);
  }
  const out = {};
  await Promise.all(names.map(async (name) => {
    out[normalizeExerciseName(name)] = await getCurrentPB(traineeId, name);
  }));
  return out;
}

// ── Coach writes ───────────────────────────────────────────────────
// coachId is REQUIRED on every one of these. Callers read it from
// AuthContext; it is never defaulted and never hardcoded.

export async function createStation({
  traineeId, coachId, exerciseName, label, threshold, unit, sortOrder,
}) {
  if (!traineeId) throw new Error('חסר מתאמן');
  if (!coachId) throw new Error('חסר מאמן — לא ניתן לשמור תחנה');
  const { data, error } = await supabase
    .from('roadmap_stations')
    .insert({
      trainee_id: traineeId,
      coach_id: coachId,
      exercise_name: (exerciseName || '').trim(),
      label: (label || '').trim(),
      threshold: Number(threshold),
      unit: unit || null,
      sort_order: Number(sortOrder) || 1,
      // status and reached_at are left to the database. The BEFORE
      // INSERT trigger stamps them when the trainee is already past
      // this threshold.
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateStation(id, { exerciseName, label, threshold, unit }) {
  if (!id) throw new Error('חסר מזהה תחנה');
  const patch = {};
  if (exerciseName !== undefined) patch.exercise_name = (exerciseName || '').trim();
  if (label !== undefined) patch.label = (label || '').trim();
  if (threshold !== undefined) patch.threshold = Number(threshold);
  if (unit !== undefined) patch.unit = unit || null;
  const { error } = await supabase
    .from('roadmap_stations')
    .update(patch)
    .eq('id', id);
  if (error) throw error;
}

export async function deleteStation(id) {
  if (!id) return;
  const { error } = await supabase
    .from('roadmap_stations')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// Persist a new order. The array is the ladder in its new order; each
// row gets its index + 1. One update per row — this DB has no bulk
// upsert path we can lean on, and a ladder is a handful of rows.
export async function reorderStations(orderedIds) {
  const ids = (orderedIds || []).filter(Boolean);
  for (let i = 0; i < ids.length; i += 1) {
    const { error } = await supabase
      .from('roadmap_stations')
      .update({ sort_order: i + 1 })
      .eq('id', ids[i]);
    if (error) throw error;
  }
}
