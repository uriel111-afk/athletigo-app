// ────────────────────────────────────────────────────────────────
// Tabata configuration readers.
//
// Extracted verbatim from ExerciseCard so the new workout sheet can
// read the SAME settings without forking them — a second copy of these
// fallback chains is exactly how the two surfaces would start
// disagreeing about what a tabata is. ExerciseCard now imports them
// from here.
//
// These only READ what the coach configured. Nothing here starts,
// stops or configures a clock — launching still goes through the
// ClockContext exactly as before.
// ────────────────────────────────────────────────────────────────

export const TABATA_DEFAULT_CLOCK = {
  work_seconds: 20,
  rest_seconds: 10,
  rounds: 8,
  sets: 1,
  rest_between_sets: 60,
};

// tabata_data is TEXT-serialised JSON in the live DB. Parse defensively
// so null / bad JSON / already-an-object all flow through one shape.
export function parseTabataData(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// Resolves clock settings out of tabata_data.clock_settings, falling
// back to the legacy direct columns on the exercise row, and finally to
// the defaults above. Always returns a fully-populated object.
export function resolveTabataClockSettings(exercise) {
  const td = parseTabataData(exercise?.tabata_data) || {};
  const cs = (td.clock_settings && typeof td.clock_settings === 'object') ? td.clock_settings : null;
  const pick = (snakeKey, legacyCol) => {
    if (cs && Number.isFinite(cs[snakeKey])) return cs[snakeKey];
    const legacy = exercise?.[legacyCol];
    return Number.isFinite(Number(legacy)) ? Number(legacy) : TABATA_DEFAULT_CLOCK[snakeKey];
  };
  return {
    work_seconds:      pick('work_seconds',      'work_seconds'),
    rest_seconds:      pick('rest_seconds',      'rest_seconds'),
    rounds:            pick('rounds',            'rounds'),
    sets:              pick('sets',              'sets'),
    rest_between_sets: pick('rest_between_sets', 'rest_between_sets'),
  };
}

export function resolveTabataRotation(exercise) {
  const td = parseTabataData(exercise?.tabata_data) || {};
  if (Array.isArray(td.exercises_in_rotation) && td.exercises_in_rotation.length > 0) {
    return td.exercises_in_rotation;
  }
  // Legacy: older tabata rows stored the rotation as sub_exercises.
  if (Array.isArray(td.sub_exercises) && td.sub_exercises.length > 0) {
    return td.sub_exercises.map((s) => ({
      name: s?.name || s?.exercise_name || s?.title || '',
    }));
  }
  return [];
}

// True when an exercise carries the new tabata shape (rotation array or
// clock_settings object). Legacy rows with neither fall back to the old
// render path in ExerciseCard.
export function hasNewTabataShape(exercise) {
  const td = parseTabataData(exercise?.tabata_data) || {};
  return Array.isArray(td.exercises_in_rotation)
      || (td.clock_settings && typeof td.clock_settings === 'object');
}

// Estimated wall-clock length of the whole tabata block, in seconds:
//   (work + rest) × rounds × sets + rest_between_sets × (sets - 1)
// Displayed under the launcher so the trainee knows what they are
// committing to before pressing start.
export function estimateTabataTotalSeconds(settings) {
  const s = settings || {};
  const work = Number(s.work_seconds) || 0;
  const rest = Number(s.rest_seconds) || 0;
  const rounds = Number(s.rounds) || 0;
  const sets = Math.max(1, Number(s.sets) || 1);
  const between = Number(s.rest_between_sets) || 0;
  const total = (work + rest) * rounds * sets + between * (sets - 1);
  return total > 0 ? total : null;
}
