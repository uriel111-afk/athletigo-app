// Helpers for reading and writing the planned_sets array that lives
// inside the exercises.tabata_data JSON payload. `tabata_data` is a
// TEXT column storing serialized JSON (NOT JSONB) — every read needs
// defensive parsing, every write needs serialization. Keep all the
// shape concerns local to this file so the rest of the app sees a
// clean array.

function parseTabataData(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// Given an exercise row, return the planned_sets array. Returns [] for
// any falsy / unparseable / missing payload. Preserves every field on
// the saved row (variation_name, tempo, rpe, rest_seconds, …) so the
// edit form can hydrate fully — set_index is normalised to a 1-based
// ordinal when missing.
export function parsePlannedSets(exercise) {
  if (!exercise) return [];
  const td = parseTabataData(exercise.tabata_data);
  const raw = Array.isArray(td?.planned_sets) ? td.planned_sets : [];
  return raw.map((s, i) => {
    const src = (s && typeof s === 'object') ? s : {};
    return {
      ...src,
      set_index: Number.isFinite(src.set_index) ? src.set_index : i + 1,
    };
  });
}

// Given an array of planned sets, return a tabata_data fragment ready
// to merge with any existing payload. Callers should not stringify
// this — pass it to mergeIntoTabataData.
export function buildPlannedSetsPayload(setsArray) {
  const safe = Array.isArray(setsArray) ? setsArray : [];
  const normalized = safe.map((s, i) => {
    const out = { set_index: Number.isFinite(s?.set_index) ? s.set_index : i };
    if (s?.reps != null) out.reps = s.reps;
    if (s?.hold_seconds != null) out.hold_seconds = s.hold_seconds;
    if (s?.weight_kg != null) out.weight_kg = s.weight_kg;
    if (s?.variation_id != null) out.variation_id = s.variation_id;
    return out;
  });
  return { planned_sets: normalized };
}

// Parse the existing tabata_data string (or null), shallow-merge the
// new fragment on top, and return a JSON string ready to write back
// to the DB.
export function mergeIntoTabataData(existingTabataDataStringOrNull, fragment) {
  const base = parseTabataData(existingTabataDataStringOrNull) || {};
  const merged = { ...base, ...(fragment || {}) };
  return JSON.stringify(merged);
}

// Reads existing trainee actuals for a single exercise inside one
// workout execution. Returns a 1-based map keyed by set_number:
//   { 1: { reps, hold_seconds, weight_kg, completed }, ... }
// Empty object when the execution / exercise has no logged sets yet.
// supabase is passed in so this module stays free of any client
// initialisation — callers route through the app's existing client.
export async function loadActualsForExercise(supabase, executionId, exerciseId) {
  if (!supabase || !executionId || !exerciseId) return {};
  const { data, error } = await supabase
    .from('exercise_set_logs')
    .select('set_number, reps_completed, time_completed, weight_used, completed')
    .eq('execution_id', executionId)
    .eq('exercise_id', exerciseId);
  if (error || !Array.isArray(data)) return {};
  const map = {};
  for (const row of data) {
    map[row.set_number] = {
      reps: row.reps_completed,
      hold_seconds: row.time_completed,
      weight_kg: row.weight_used,
      completed: !!row.completed,
    };
  }
  return map;
}

// Upserts one set's actuals + marks it completed. setIndex is 1-based.
// Payload accepts the pyramid-shaped keys (reps / hold_seconds /
// weight_kg) and writes them into the exercise_set_logs columns
// (reps_completed / time_completed / weight_used).
export async function saveSetActual(supabase, executionId, exerciseId, setIndex, payload) {
  if (!supabase || !executionId || !exerciseId) return { error: 'missing ids' };
  const row = {
    execution_id: executionId,
    exercise_id: exerciseId,
    set_number: setIndex,
    reps_completed: payload?.reps ?? null,
    time_completed: payload?.hold_seconds ?? null,
    weight_used: payload?.weight_kg ?? null,
    completed: true,
  };
  const { error } = await supabase
    .from('exercise_set_logs')
    .upsert(row, { onConflict: 'execution_id,exercise_id,set_number' });
  return { error };
}
