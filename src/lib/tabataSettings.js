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

/**
 * THE SET MODEL.
 *
 * A tabata SET is a GROUP of exercises performed together for N rounds
 * of work/rest. Between sets there is a longer rest, then the next
 * set. tabata_data carries it like this — TEXT column, no migration:
 *
 *   {"container_type":"tabata",
 *    "sets":[
 *      {"exercises":["עלייה לישיבה","טיפוס הרים"],
 *       "rounds":4,"work_time":"30","rest_time":"5"}],
 *    "rest_between_sets":"60"}
 *
 * readTabataSets normalises BOTH that and every legacy payload into
 * one canonical shape, so nothing downstream has to know which era a
 * row came from:
 *
 *   { sets: [{ exercises: [name…], rounds, work, rest }],
 *     restBetweenSets, legacy }
 *
 * Numbers come back as NUMBERS even though the JSON stores them as
 * strings, which is how every other value inside tabata_data is
 * written. Nothing here writes; existing rows are never modified.
 */
export function readTabataSets(exercise) {
  const td = parseTabataData(exercise?.tabata_data) || {};
  const num = (v, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  const nameOf = (e) => {
    if (typeof e === 'string') return e.trim();
    return String(e?.exercise_name || e?.name || e?.title || '').trim();
  };

  // ── 1. The new shape. ──────────────────────────────────────────
  if (Array.isArray(td.sets) && td.sets.length) {
    const sets = td.sets.map((s) => ({
      exercises: (Array.isArray(s?.exercises) ? s.exercises : []).map(nameOf).filter(Boolean),
      rounds: num(s?.rounds, 1),
      work: num(s?.work_time ?? s?.work_seconds, 0),
      rest: num(s?.rest_time ?? s?.rest_seconds, 0),
    }));
    return {
      sets,
      restBetweenSets: num(td.rest_between_sets, 0),
      legacy: false,
    };
  }

  // ── 2. Legacy with clock_settings — the rotation repeated for
  //       `sets` sets, which is what that payload has always meant.
  const cs = (td.clock_settings && typeof td.clock_settings === 'object') ? td.clock_settings : null;
  const rotation = (Array.isArray(td.exercises_in_rotation) && td.exercises_in_rotation.length)
    ? td.exercises_in_rotation.map(nameOf).filter(Boolean)
    : (Array.isArray(td.sub_exercises) ? td.sub_exercises.map(nameOf).filter(Boolean) : []);

  if (cs) {
    const count = Math.max(1, num(cs.sets, 1));
    const one = {
      exercises: rotation,
      rounds: num(cs.rounds, rotation.length || 1),
      work: num(cs.work_seconds, 0),
      rest: num(cs.rest_seconds, 0),
    };
    return {
      sets: Array.from({ length: count }, () => ({ ...one })),
      restBetweenSets: num(cs.rest_between_sets, 0),
      legacy: true,
    };
  }

  // ── 3. Legacy FLAT sub_exercises, each carrying its own times.
  //       The rotation IS the round list, so it reads as ONE set of
  //       as many rounds as there are movements, at the times the
  //       first timed movement prescribes.
  const flat = Array.isArray(td.sub_exercises) ? td.sub_exercises : [];
  const timed = flat.find((s) => num(s?.work_time) > 0);
  if (flat.length && timed) {
    return {
      sets: [{
        exercises: flat.map(nameOf).filter(Boolean),
        rounds: flat.length,
        work: num(timed.work_time, 0),
        rest: num(timed.rest_time, 0),
      }],
      restBetweenSets: 0,
      legacy: true,
    };
  }

  return { sets: [], restBetweenSets: 0, legacy: true };
}

/**
 * One set as the clock engine wants it. TabataTimer's cfg shape is
 * { prep, work, rest, rb, rounds, sets } — a single set here, so
 * sets:1 and rb:0. `prep` is left out on purpose: the lead-in has
 * already counted the trainee in.
 */
export function tabataSetToClockCfg(set) {
  if (!set) return null;
  return {
    work: Math.max(1, Number(set.work) || 0),
    rest: Math.max(0, Number(set.rest) || 0),
    rounds: Math.max(1, Number(set.rounds) || 1),
    sets: 1,
    rb: 0,
    prep: 0,
  };
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
