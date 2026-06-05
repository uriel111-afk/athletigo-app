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

// Reads existing trainee actuals for a single drill inside one
// workout execution. drillIndex defaults to 0 — single-exercise methods
// (pyramid / drop_set / delorme / time / reps / rest_pause) all live on
// drill 0. Multi-element methods (superset/circuit/combo/tabata) pass
// the inner-exercise index when they need to read a specific inner row.
// Returns a 1-based map keyed by set_number:
//   { 1: { reps, hold_seconds, weight_kg, completed }, ... }
// Empty object when nothing has been logged for that (exercise, drill).
export async function loadActualsForExercise(supabase, executionId, exerciseId, drillIndex = 0) {
  if (!supabase || !executionId || !exerciseId) return {};
  const { data, error } = await supabase
    .from('exercise_set_logs')
    .select('set_number, drill_index, reps_completed, time_completed, weight_used, completed')
    .eq('execution_id', executionId)
    .eq('exercise_id', exerciseId)
    .eq('drill_index', drillIndex);
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

// Same as loadActualsForExercise but returns a nested map keyed by
// drill_index → set_number, so multi-element methods can hydrate every
// inner exercise in a single round-trip:
//   { 0: { 1: {...}, 2: {...} }, 1: { 1: {...} }, ... }
// Single-exercise callers can keep using loadActualsForExercise (drill 0
// only) — this helper is for the super_set / circuit / combo / tabata
// renderers added in a later step.
export async function loadActualsByDrillForExercise(supabase, executionId, exerciseId) {
  if (!supabase || !executionId || !exerciseId) return {};
  const { data, error } = await supabase
    .from('exercise_set_logs')
    .select('set_number, drill_index, reps_completed, time_completed, weight_used, completed')
    .eq('execution_id', executionId)
    .eq('exercise_id', exerciseId);
  if (error || !Array.isArray(data)) return {};
  const byDrill = {};
  for (const row of data) {
    const d = Number.isFinite(row.drill_index) ? row.drill_index : 0;
    if (!byDrill[d]) byDrill[d] = {};
    byDrill[d][row.set_number] = {
      reps: row.reps_completed,
      hold_seconds: row.time_completed,
      weight_kg: row.weight_used,
      completed: !!row.completed,
    };
  }
  return byDrill;
}

// Upserts one (drill, set) actual + marks it completed. drillIndex
// defaults to 0 for single-exercise methods so the conflict target
// (execution_id, exercise_id, drill_index, set_number) — matching the
// DB unique index added by the 2026-06 migration — resolves cleanly
// regardless of whether the caller cares about drill_index. setIndex
// is 1-based; payload uses the pyramid-shaped keys (reps / hold_seconds
// / weight_kg) and is mapped onto the matching log columns.
export async function saveSetActual(supabase, executionId, exerciseId, drillIndex, setIndex, payload) {
  if (!supabase || !executionId || !exerciseId) return { error: 'missing ids' };
  const row = {
    execution_id: executionId,
    exercise_id: exerciseId,
    drill_index: Number.isFinite(drillIndex) ? drillIndex : 0,
    set_number: setIndex,
    reps_completed: payload?.reps ?? null,
    time_completed: payload?.hold_seconds ?? null,
    weight_used: payload?.weight_kg ?? null,
    completed: true,
  };
  const { error } = await supabase
    .from('exercise_set_logs')
    .upsert(row, { onConflict: 'execution_id,exercise_id,drill_index,set_number' });
  return { error };
}
