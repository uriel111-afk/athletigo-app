import { getMethodByMode } from '@/constants/trainingMethods';

/**
 * exerciseMeasurement — the ONE place that decides whether an exercise
 * is measured, and by which number.
 *
 * Extracted from WorkoutSheet.jsx:60-135 so PlanSheet and WorkoutSheet
 * cannot drift apart. Both import from here; neither keeps a copy.
 *
 * The SECTION decides first, then the exercise.
 *
 * Carrying a number is not the same as being worth recording. A
 * 300-rep rope warmup carries one and does not want a box, and every
 * stray box becomes noise in the progress graph later. So the warmup,
 * stretching, mobility and flexibility sections are tick-only however
 * many numbers their exercises hold, and measurement belongs to the
 * strength work.
 *
 * This reverses an earlier rule that let a one-minute hold inside
 * גמישות keep its box. That trade is accepted deliberately: those
 * holds are ticks now.
 */

export const has = (v) => v != null && v !== '';

/** The fields whose presence makes a row worth entering a number into. */
export const MEASURABLE_FIELDS = ['reps', 'static_hold_time', 'work_time', 'weight', 'rounds'];

/**
 * Sections that never measure, whatever their exercises carry.
 *
 * The Hebrew names are what `section_name` holds. The English ones are
 * legacy values that live in `category` on older rows — section_name
 * is Hebrew throughout, so both fields have to be read to catch them.
 * Checked against live data: every pairing agrees (חימום||warmup,
 * תנועתיות||mobility, גמישות||flexibility, כוח||strength), so reading
 * either field can never disagree with the other.
 */
export const UNMEASURED_SECTIONS = new Set([
  'חימום', 'מתיחות', 'גמישות', 'תנועתיות', 'הערות',
  'warmup', 'mobility', 'flexibility',
]);

/** Both names a section answers to, trimmed and case-folded. */
function sectionKeys(section) {
  if (!section) return [];
  if (typeof section === 'string') return [section.trim().toLowerCase()];
  return [section.section_name, section.category]
    .map((v) => String(v ?? '').trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Does this section measure at all? An unknown or missing section
 * falls through to the exercise, so a caller that has no section in
 * hand behaves exactly as before.
 */
export function isMeasuredSection(section) {
  const keys = sectionKeys(section);
  if (!keys.length) return true;
  return !keys.some((k) => UNMEASURED_SECTIONS.has(k));
}

/**
 * Multi-exercise methods take ONE row in the running numbering and
 * carry a single box counting rounds (or sets).
 *
 * Tabata is deliberately NOT here: it is a clock, not a measurement,
 * so it stays check-only. That is the single exception to "the
 * exercise decides".
 */
export const MULTI_VARIANTS = new Set(['super_set', 'combo', 'circuit', 'rest_pause']);

export function variantOf(exercise) {
  const method = getMethodByMode(exercise?.mode);
  if (!method || method.mode !== exercise?.mode) return 'single';
  return method.english_id;
}

/** A tabata container — a clock, never an entry row. */
export function isTabataContainer(exercise) {
  return variantOf(exercise) === 'tabata';
}

/**
 * Priority:
 *   0. a section that never measures → tick, whatever the row carries
 *   1. a tabata container            → never measured (it is a clock)
 *   2. track_for_measurement = true  → measured, whatever else says
 *   3. any measurable value present  → measured
 *   4. a superset / combo / circuit / rest-pause block → measured,
 *      it owns one box for its rounds
 *   5. otherwise                     → a tick, nothing to measure
 *
 * The section outranks track_for_measurement on purpose: the point of
 * the rule is that nothing in a warmup reaches the progress graph.
 */
export function isMeasurable(exercise, section = null) {
  if (!isMeasuredSection(section)) return false;
  if (isTabataContainer(exercise)) return false;
  if (exercise?.track_for_measurement === true) return true;
  if (MEASURABLE_FIELDS.some((f) => has(exercise?.[f]))) return true;
  return MULTI_VARIANTS.has(variantOf(exercise));
}

/**
 * The one number this exercise is measured by, in the order a trainee
 * reads them off a printed page:
 *   reps → static_hold_time → work_time → weight → rounds
 *
 * `logField` is the exercise_set_logs column; `payloadField` is the key
 * saveSetActual() expects for that same column.
 */
export function primaryMetric(exercise) {
  if (has(exercise?.reps)) {
    return { key: 'reps', mode: 'reps', target: Number(exercise.reps) || 0, logField: 'reps_completed', payloadField: 'reps', isTime: false, unit: null };
  }
  if (has(exercise?.static_hold_time)) {
    return { key: 'hold', mode: 'seconds', target: Number(exercise.static_hold_time) || 0, logField: 'time_completed', payloadField: 'hold_seconds', isTime: true, unit: null };
  }
  if (has(exercise?.work_time)) {
    return { key: 'work', mode: 'seconds', target: Number(exercise.work_time) || 0, logField: 'time_completed', payloadField: 'hold_seconds', isTime: true, unit: null };
  }
  if (has(exercise?.weight)) {
    return { key: 'weight', mode: 'kg', target: Number(exercise.weight) || 0, logField: 'weight_used', payloadField: 'weight_kg', isTime: false, unit: 'ק"ג' };
  }
  // Rounds are counted, so they ride the reps column — the same slot
  // the existing round-completion marker already writes to.
  if (has(exercise?.rounds)) {
    return { key: 'rounds', mode: 'reps', target: Number(exercise.rounds) || 0, logField: 'reps_completed', payloadField: 'reps', isTime: false, unit: 'סבבים' };
  }
  return null;
}

/**
 * The plan-sheet view of the same decision, in the four kinds that
 * screen renders:
 *
 *   check → no boxes, a tick at the right of the row
 *   reps  → one box per set, target printed as repsXsets
 *   time  → one box per set, seconds, same format
 *   tally → ONE box, a single target, no sets (rounds accumulate
 *           across the whole workout)
 *
 * Built on isMeasurable + primaryMetric so it can never disagree with
 * WorkoutSheet.
 */
export function measurementKind(exercise, setCount = null, section = null) {
  if (!isMeasurable(exercise, section)) return { kind: 'check' };
  const metric = primaryMetric(exercise);
  if (!metric) return { kind: 'check' };
  const sets = setCount ?? (Number(exercise?.sets) || 1);
  if (metric.key === 'rounds') {
    return { kind: 'tally', target: metric.target, sets: 1, payloadField: metric.payloadField };
  }
  return {
    kind: metric.isTime ? 'time' : 'reps',
    target: metric.target,
    sets,
    payloadField: metric.payloadField,
  };
}

/**
 * The inner exercises of a multi-exercise block, whichever shape the
 * editor happened to write them in.
 *
 * WorkoutSheet.jsx keeps its own identical copy. Wiring it to this one
 * would mean editing that file, which the current task forbids — fold
 * it in next time WorkoutSheet is legitimately open.
 */
export function innerExercisesOf(exercise, parseTabataData) {
  const td = parseTabataData(exercise?.tabata_data) || {};
  if (Array.isArray(td.exercises_in_rotation) && td.exercises_in_rotation.length) return td.exercises_in_rotation;
  if (Array.isArray(td.sub_exercises) && td.sub_exercises.length) return td.sub_exercises;
  if (Array.isArray(td.stations) && td.stations.length) return td.stations;
  if (Array.isArray(td.rounds) && td.rounds.length) {
    const flat = [];
    for (const r of td.rounds) for (const e of (r?.exercises || [])) flat.push(e);
    if (flat.length) return flat;
  }
  if (Array.isArray(td.planned_sets) && td.planned_sets.length) return td.planned_sets;
  return [];
}

/**
 * A sub-exercise inside a container carries its own numbers, as STRINGS
 * in the tabata_data JSON. Same four kinds as measurementKind.
 */
export function subMeasurementKind(sub, section = null) {
  // A superset sitting in חימום is still a warmup, so its inner rows
  // are ticks like everything else there.
  if (!isMeasuredSection(section)) return { kind: 'check' };
  if (has(sub?.reps)) {
    return { kind: 'reps', target: Number(sub.reps) || 0, sets: 1, payloadField: 'reps' };
  }
  if (has(sub?.hold_seconds)) {
    return { kind: 'time', target: Number(sub.hold_seconds) || 0, sets: 1, payloadField: 'hold_seconds' };
  }
  if (has(sub?.work_time)) {
    return { kind: 'time', target: Number(sub.work_time) || 0, sets: 1, payloadField: 'hold_seconds' };
  }
  return { kind: 'check' };
}

/** True when this exercise renders as a container of sub-exercises. */
export function isContainer(exercise, parseTabataData) {
  const v = variantOf(exercise);
  if (v === 'single') return false;
  return innerExercisesOf(exercise, parseTabataData).length > 0;
}
