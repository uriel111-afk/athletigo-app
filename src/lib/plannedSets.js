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
// any falsy / unparseable / missing payload. Each set is normalized to
// the shape { set_index, reps?, hold_seconds?, weight_kg?, variation_id? }.
export function parsePlannedSets(exercise) {
  if (!exercise) return [];
  const td = parseTabataData(exercise.tabata_data);
  const raw = Array.isArray(td?.planned_sets) ? td.planned_sets : [];
  return raw.map((s, i) => {
    const out = { set_index: Number.isFinite(s?.set_index) ? s.set_index : i };
    if (s?.reps != null) out.reps = s.reps;
    if (s?.hold_seconds != null) out.hold_seconds = s.hold_seconds;
    if (s?.weight_kg != null) out.weight_kg = s.weight_kg;
    if (s?.variation_id != null) out.variation_id = s.variation_id;
    return out;
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
