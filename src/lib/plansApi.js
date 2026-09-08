import { supabase } from './supabaseClient';
import { prepareExerciseData } from './exercisePayload';

export async function getPlanWithDetails(planId) {
  const { data: plan, error: pErr } = await supabase
    .from('training_plans').select('*')
    .eq('id', planId).neq('status', 'deleted').single();
  if (pErr) throw pErr;

  const { data: sections } = await supabase
    .from('training_sections').select('*')
    .eq('training_plan_id', planId).order('order', { ascending: true });

  const sectionIds = (sections || []).map(s => s.id);
  let exercises = [];
  if (sectionIds.length > 0) {
    const { data: exData } = await supabase
      .from('exercises').select('*')
      .in('training_section_id', sectionIds).order('order', { ascending: true });
    exercises = exData || [];
  }

  return {
    ...plan,
    sections: (sections || []).map(sec => ({
      ...sec,
      exercises: exercises.filter(ex => ex.training_section_id === sec.id),
    })),
  };
}

export async function getPlansForTrainee(traineeId) {
  const { data, error } = await supabase
    .from('training_plans').select('*')
    .eq('assigned_to', traineeId).neq('status', 'deleted')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getPlanFamily(planId) {
  const { data: plan } = await supabase
    .from('training_plans').select('id, parent_plan_id')
    .eq('id', planId).neq('status', 'deleted').single();
  if (!plan) return [];
  const rootId = plan.parent_plan_id || plan.id;
  const { data } = await supabase
    .from('training_plans').select('*')
    .or(`id.eq.${rootId},parent_plan_id.eq.${rootId}`)
    .neq('status', 'deleted').order('created_at', { ascending: true });
  return data || [];
}

export async function updateCoachNotes(table, id, notes) {
  const { error } = await supabase.from(table).update({ coach_private_notes: notes }).eq('id', id);
  if (error) throw error;
}

// ── Plan duplication — the ONLY implementation in the app ────────────
// Every "שכפל" / "העתק לתלמיד" entry point routes here. Three call
// sites used to do their own `insert({ ...rest })` shallow copy, which
// produced a plan row with ZERO sections and ZERO exercises that was
// otherwise byte-identical to its source (same assigned_to, coach_id,
// created_by, parent_plan_id). That made the copy indistinguishable
// from the original in every list, which is how a coach came to delete
// the source believing it was the copy. See the 2026-07-29 incident.
//
// Invariants this function guarantees:
//   1. DEEP — a new training_sections row per source section and a new
//      exercises row per source exercise. Every id is freshly minted by
//      the DB; no source uuid is ever reused in the copy.
//   2. IDENTIFIABLE — parent_plan_id is ALWAYS set (source's own parent
//      when the source is itself a copy, else the source id). A copy can
//      never inherit a null parent_plan_id, so the עותק badge always
//      renders and the delete confirmation always knows what it is.
//   3. NON-DESTRUCTIVE — reads the source, writes only new rows. Nothing
//      in this function updates or deletes anything keyed to the source.
//
// Exercises are fetched by training_plan_id (the live link, always
// populated) rather than through the section list, so an exercise whose
// training_section_id is null still lands in the copy and the source /
// copy exercise counts always match.
export async function duplicatePlan(sourcePlanId, options = {}) {
  const {
    traineeId,          // undefined → keep the source's assignee
    traineeName,        // optional display name for the new assignee
    nameSuffix = ' (עותק)',
  } = options;

  const { data: source, error: sErr } = await supabase
    .from('training_plans').select('*')
    .eq('id', sourcePlanId).neq('status', 'deleted').single();
  if (sErr) throw sErr;

  const [{ data: srcSections }, { data: srcExercises }] = await Promise.all([
    supabase.from('training_sections').select('*')
      .eq('training_plan_id', sourcePlanId).order('order', { ascending: true }),
    supabase.from('exercises').select('*')
      .eq('training_plan_id', sourcePlanId).order('order', { ascending: true }),
  ]);

  // Invariant 2 — a copy is ALWAYS attributable to a root plan.
  const rootId = source.parent_plan_id || source.id;

  const {
    id: _srcId, created_at: _sc, updated_at: _su,
    best_score: _sb, execution_count: _se, ...rest
  } = source;

  const baseName = source.plan_name || source.title || 'תוכנית';
  const { data: newPlan, error: pErr } = await supabase
    .from('training_plans')
    .insert({
      ...rest,
      parent_plan_id: rootId,
      assigned_to: traineeId ?? source.assigned_to ?? null,
      assigned_to_name: traineeId
        ? (traineeName ?? null)
        : (source.assigned_to_name ?? null),
      plan_name: baseName + nameSuffix,
      title: (source.title || baseName) + nameSuffix,
      best_score: null,
      execution_count: 0,
    })
    .select().single();
  if (pErr) throw pErr;

  // Explicit oldSectionId → newSectionId map. Never reuse a source uuid.
  const sectionIdMap = new Map();
  for (const sec of srcSections || []) {
    const { id: oldSecId, training_plan_id: _stp, created_at: _sca, ...secRest } = sec;
    const { data: newSec, error: secErr } = await supabase
      .from('training_sections')
      .insert({ ...secRest, training_plan_id: newPlan.id })
      .select().single();
    if (secErr) throw secErr;
    sectionIdMap.set(oldSecId, newSec.id);
  }

  for (const ex of srcExercises || []) {
    const {
      id: srcExId, training_section_id: oldSecId, training_plan_id: _etp,
      created_at: _eca, completed: _ec, source_exercise_id: srcLink, ...exRest
    } = ex;
    const { error: exErr } = await supabase.from('exercises').insert({
      ...exRest,
      training_plan_id: newPlan.id,
      training_section_id: oldSecId ? (sectionIdMap.get(oldSecId) ?? null) : null,
      // Always point at the FAMILY ROOT, never at the intermediate copy
      // we happen to be duplicating. If the source is itself a copy it
      // already carries the root id — inherit it. Otherwise the source
      // IS the root. So alpha -> A -> B all resolve to the alpha id.
      source_exercise_id: srcLink ?? srcExId,
      // `completed` is deliberately NOT written. Per-execution
      // completion lives in exercise_executions.is_completed, keyed by
      // workout_execution_id — the column on `exercises` is global
      // across every trainee and every run, so it is never authored.
    });
    if (exErr) throw exErr;
  }

  return newPlan;
}

// ═════════════════════════════════════════════════════════════════════
// createPlanFromSpec — the ingestion channel.
//
// Takes a whole workout as a plain object and lands it as a plan row,
// its sections in order, and its exercises remapped onto the new
// section ids. It is the same three-level walk duplicatePlan does, and
// deliberately the same shape: read nothing, insert plan, insert
// sections keeping an explicit index → new-id map, insert exercises
// through that map. There is no second insert path.
//
// It writes through supabase.from(...).insert() directly, NOT through
// base44Client's createEntity. That wrapper retries by DROPPING any
// column Postgres rejects (base44Client.js:42), which turns a typo into
// silently missing data. Everything here is validated up front instead
// and throws on an unknown key.
// ═════════════════════════════════════════════════════════════════════

/**
 * THE SPEC SHAPE
 * ==============
 * Column names below are the live ones. Anything omitted is null.
 *
 * ── PLAN LEVEL → training_plans ──────────────────────────────────
 *   title              text      REQUIRED
 *   plan_name          text      defaults to title
 *   description        text
 *   goal_focus         string[]  the column is TEXT, not jsonb — the
 *                                array is JSON.stringify'd into it,
 *                                which is what the live rows hold
 *   weekly_days        string[]  a REAL text[]; passed through as an
 *                                array, not stringified
 *   difficulty_level   text
 *   duration_weeks     integer
 *   plan_type          text
 *   difficulty         text
 *   status             text      defaults 'פעילה'
 *   is_template        boolean   defaults false
 *   start_date         date      defaults today, YYYY-MM-DD
 *   series_id          uuid
 *   parent_plan_id     uuid      leave null; this is an original, not
 *                                a copy in a duplication chain
 *   preview_text       text      derived from the exercise names if
 *                                not supplied
 *   exercises_count    integer   derived from the spec if not supplied
 *
 * ── IDENTITY ─────────────────────────────────────────────────────
 *   coachId    uuid  REQUIRED. Written to BOTH created_by and
 *                    coach_id. Never defaulted, never hardcoded — the
 *                    call site reads it from AuthContext.
 *   traineeId  uuid  optional → assigned_to.
 *   assigned_to_name and created_by_name are NOT accepted from the
 *   caller. They are read from users.full_name for those two ids.
 *
 * ── SECTION LEVEL → training_sections, in array order ─────────────
 *   sections: [{
 *     section_name   text   REQUIRED
 *     category       text   defaults to section_name
 *     description    text
 *     coach_notes    text   the note down the section rail
 *     color_theme    text   defaults to getSectionColor(index)
 *     icon           text
 *     tracking_mode  text   defaults 'full'
 *     exercises: [ ... ]
 *   }]
 *   "order" is 1-based array position and is the column every reader
 *   sorts by. order_index is dead on live data (0 everywhere) and is
 *   written 0 to match. training_sections.exercises is a json column
 *   that is [] on every live row; it is not written.
 *
 * ── EXERCISE LEVEL → exercises, in array order within its section ─
 *   {
 *     name                   text     REQUIRED → written to BOTH
 *                                     name and exercise_name, the way
 *                                     every live row has them
 *     mode                   text     a value from
 *                                     constants/trainingMethods.js:
 *                                     חזרות, רשימה, טבטה, סופרסט,
 *                                     קומבו, פירמידה, דרופסט,
 *                                     רסטפאוז, מחזורי, דלורם.
 *                                     null means a plain exercise.
 *     sets                   integer
 *     reps                   integer
 *     rounds                 integer
 *     static_hold_time       integer  seconds
 *     work_time              TEXT     the column is text — 120 is
 *                                     coerced to "120"
 *     rest_time              TEXT     same
 *     weight                 numeric
 *     weight_type            text
 *     side                   text     e.g. דו־צדדי, לסירוגין
 *     range_of_motion        text
 *     body_position          text
 *     equipment              text
 *     grip                   text
 *     tempo                  text
 *     emphasis               text
 *     rpe                    integer
 *     rest_between_sets      integer
 *     rest_between_exercises integer
 *     description            text     the hint shown under the row.
 *                                     PlanSheet reads description
 *                                     first and notes second.
 *     notes                  text
 *     track_for_measurement  boolean
 *     sub_exercises: [ ... ]           NOT a column — see below
 *   }
 *   "order" is 1-based PER SECTION, which is how live data numbers
 *   them; the running number across a plan is computed in the UI.
 *   order_index is written 0, as on live rows.
 *   `completed` is never written. It is global across every trainee
 *   and every run; per-run completion lives in exercise_executions.
 *
 * ── SUB-EXERCISES → exercises.tabata_data ────────────────────────
 *   There is no child table. A superset, combo, dropset or tabata is
 *   ONE exercises row whose children live inside the TEXT column
 *   tabata_data as a JSON string. Two containers, matching the two
 *   live examples:
 *
 *     mode סופרסט / קומבו / דרופסט →
 *       {"container_type":"list","sub_exercises":[
 *          {"id":"…","exercise_name":"סיבוב ראש","reps":"5",
 *           "range_of_motion":"מלא"}, … ]}
 *
 *     mode טבטה →
 *       {"container_type":"tabata","sub_exercises":[
 *          {"id":"…","exercise_name":"עליה לישיבה",
 *           "work_time":"30","rest_time":"5"}, … ]}
 *
 *   Every number INSIDE tabata_data is a STRING, unlike the integer
 *   columns on the row itself. That is what the builder writes and
 *   what every reader parses.
 *   Order inside the parent is ARRAY POSITION — there is no order
 *   field on a sub-exercise, and the result write-back keys off that
 *   index as exercise_set_logs.drill_index.
 *   Accepted per sub: name (or exercise_name), reps, work_time,
 *   rest_time, hold_seconds, side, range_of_motion, description.
 *   description is the coach's hint for THAT movement; PlanSheet
 *   renders it under the sub row in regular grey, the same as a
 *   top-level hint.
 *   tabata_preview is written from the movement names, ' • ' joined.
 *
 * ── TABATA SETS → the current shape, mode טבטה only ──────────────
 *   A SET is a GROUP of exercises performed together for N rounds of
 *   work/rest; a rest between sets; then the next set. Supply it on
 *   the exercise as `tabata_sets`, with `rest_between_sets` beside it:
 *
 *     { name: 'טבטה בטן', mode: 'טבטה',
 *       rest_between_sets: 60,
 *       tabata_sets: [
 *         { exercises: ['עלייה לישיבה','טיפוס הרים'],
 *           rounds: 4, work_time: 30, rest_time: 5 },
 *       ] }
 *
 *   serialises to
 *
 *     {"container_type":"tabata",
 *      "sets":[{"exercises":["עלייה לישיבה","טיפוס הרים"],
 *               "rounds":4,"work_time":"30","rest_time":"5"}],
 *      "rest_between_sets":"60"}
 *
 *   Validated: exercises must be a non-empty list of non-empty names;
 *   rounds a whole number of at least 1; work_time numeric and above
 *   zero; rest_time numeric, defaulting to "0". An unknown key inside
 *   a set throws like any other. Supplying tabata_sets on a non-tabata
 *   mode throws, and so does supplying both tabata_sets and
 *   sub_exercises.
 *
 *   BACKWARD COMPATIBLE. The legacy flat sub_exercises payload is
 *   still accepted and still written byte-for-byte as it was; readers
 *   treat it as a single set. No existing row is modified.
 *
 * Returns the created training_plans row.
 */

// Modes whose sub_exercises serialise as a tabata clock rather than a
// plain list. Hebrew is what `mode` actually holds; the english_id
// spellings are accepted so a caller can use either.
const TABATA_MODES = new Set(['טבטה', 'tabata']);
// Modes that carry sub-exercises at all.
const CONTAINER_MODES = new Set([
  'טבטה', 'tabata',
  'סופרסט', 'superset', 'super_set',
  'קומבו', 'combo',
  'דרופסט', 'dropset', 'drop_set',
  'פירמידה', 'pyramid',
  'רסטפאוז', 'rest_pause',
  'מחזורי', 'circuit',
  'דלורם', 'delorme',
  'רשימה', 'exercise_list',
]);

const modeKey = (m) => String(m ?? '').trim().toLowerCase();

/**
 * The live column set for a table, used to reject an unknown key
 * BEFORE anything is inserted.
 *
 * information_schema.columns is the right source and is what the task
 * asks for, but it is not reachable from the app: PostgREST does not
 * expose the information_schema profile (406) and the OpenAPI document
 * that carries the catalog is service_role only. So the column set is
 * read the one way an anon/authenticated client can read it — one row
 * of the table itself. PostgREST returns every column the role may
 * select, so the keys of a single row ARE the column list.
 *
 * If the table is empty, or RLS hides every row, that probe yields
 * nothing and the documented fallback list below is used instead. A
 * key in neither source throws.
 */
const COLUMN_FALLBACK = {
  training_plans: [
    'id', 'created_at', 'updated_at', 'title', 'description', 'difficulty',
    'plan_type', 'is_template', 'status', 'created_by', 'plan_name',
    'assigned_to', 'assigned_to_name', 'created_by_name', 'goal_focus',
    'start_date', 'progress_percentage', 'exercises_count', 'preview_text',
    'series_id', 'parent_plan_id', 'weekly_days', 'difficulty_level',
    'duration_weeks', 'coach_id',
  ],
  training_sections: [
    'id', 'created_at', 'updated_at', 'title', 'description', 'order_index',
    'plan_id', 'exercises', 'created_by', 'training_plan_id', 'section_name',
    'category', 'color_theme', 'icon', 'order', 'completed', 'coach_notes',
    'tracking_mode', 'coach_id',
  ],
  exercises: [
    'id', 'created_at', 'updated_at', 'name', 'description', 'category',
    'muscle_group', 'difficulty', 'video_url', 'image_url', 'instructions',
    'tips', 'created_by', 'training_plan_id', 'training_section_id',
    'exercise_name', 'sets', 'reps', 'weight', 'rest_time', 'work_time',
    'rpe', 'mode', 'weight_type', 'order', 'completed', 'tabata_data',
    'tabata_preview', 'control_rating', 'difficulty_rating', 'actual_result',
    'rounds', 'tempo', 'superset_rounds', 'combo_sets', 'trainee_media_urls',
    'was_deducted', 'params', 'body_position', 'equipment', 'static_hold',
    'side', 'range_of_motion', 'grip', 'rest_between_sets',
    'rest_between_exercises', 'exercise_list', 'emphasis', 'tabata_config',
    'notes', 'order_index', 'static_hold_time', 'coach_id',
    'track_for_measurement', 'source_exercise_id',
  ],
};

const columnCache = new Map();

async function columnsOf(table) {
  if (columnCache.has(table)) return columnCache.get(table);
  let cols = null;
  const { data, error } = await supabase.from(table).select('*').limit(1);
  if (error) {
    throw new Error(
      `[createPlanFromSpec] cannot read the column list of "${table}": ${error.message}`,
    );
  }
  if (Array.isArray(data) && data.length && data[0] && typeof data[0] === 'object') {
    cols = new Set(Object.keys(data[0]));
  } else {
    console.warn(
      `[createPlanFromSpec] "${table}" returned no row to read columns from; `
      + 'falling back to the documented column list.',
    );
    cols = new Set(COLUMN_FALLBACK[table] || []);
  }
  columnCache.set(table, cols);
  return cols;
}

/**
 * The keys a SPEC may carry, per level.
 *
 * Validating the built payloads alone is not enough. The builders read
 * named fields rather than spreading the spec, so a key the spec
 * carries and the builder does not know about never reaches a payload
 * at all — it would be dropped even more quietly than base44Client
 * drops one, because Postgres would never even see it. A typo like
 * `statichold_time` has to be loud.
 *
 * So the spec is checked on the way IN, and the payloads on the way
 * OUT. Both throw.
 */
const SPEC_KEYS = {
  plan: new Set([
    'coachId', 'traineeId', 'sections',
    'title', 'plan_name', 'description', 'goal_focus', 'weekly_days',
    'difficulty_level', 'duration_weeks', 'plan_type', 'difficulty',
    'status', 'is_template', 'start_date', 'series_id', 'parent_plan_id',
    'preview_text', 'exercises_count',
  ]),
  section: new Set([
    'section_name', 'category', 'description', 'coach_notes',
    'color_theme', 'icon', 'tracking_mode', 'exercises',
  ]),
  exercise: new Set([
    'name', 'exercise_name', 'mode', 'sets', 'reps', 'rounds',
    'static_hold_time', 'work_time', 'rest_time', 'weight', 'weight_type',
    'rpe', 'rest_between_sets', 'rest_between_exercises', 'side',
    'range_of_motion', 'body_position', 'equipment', 'grip', 'tempo',
    'emphasis', 'description', 'notes', 'track_for_measurement',
    'sub_exercises', 'tabata_sets',
  ]),
  sub: new Set([
    'name', 'exercise_name', 'reps', 'work_time', 'rest_time',
    'hold_seconds', 'side', 'range_of_motion', 'description',
  ]),
  // One block of the tabata sets shape.
  tabataSet: new Set(['exercises', 'rounds', 'work_time', 'rest_time']),
};

function assertKnownSpecKeys(level, obj, where) {
  const allowed = SPEC_KEYS[level];
  for (const key of Object.keys(obj || {})) {
    if (!allowed.has(key)) {
      throw new Error(
        `[createPlanFromSpec] unknown ${level} key "${key}"`
        + `${where ? ` (${where})` : ''}. Nothing was inserted. `
        + `Known ${level} keys: ${[...allowed].join(', ')}.`,
      );
    }
  }
}

/**
 * Throws on the FIRST unknown key, naming the key and the table. This
 * is the whole point of the function: base44Client would have dropped
 * that key and inserted the rest, leaving a row that looks fine and is
 * missing a column of the coach's workout.
 */
function assertKnownColumns(table, payload, cols, where) {
  for (const key of Object.keys(payload)) {
    if (!cols.has(key)) {
      throw new Error(
        `[createPlanFromSpec] unknown column "${key}" on table "${table}"`
        + `${where ? ` (${where})` : ''}. Nothing was inserted. `
        + 'Fix the spec or the mapping — do NOT let this key be dropped.',
      );
    }
  }
}

/** Integers throw rather than coerce to null, so nothing is lost quietly. */
function intOrNull(value, field, where) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(
      `[createPlanFromSpec] "${field}" must be a number${where ? ` (${where})` : ''}, `
      + `got ${JSON.stringify(value)}`,
    );
  }
  return Math.round(n);
}

function numOrNull(value, field, where) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(
      `[createPlanFromSpec] "${field}" must be a number${where ? ` (${where})` : ''}, `
      + `got ${JSON.stringify(value)}`,
    );
  }
  return n;
}

/** work_time / rest_time are TEXT columns. 120 → "120". */
function textOrNull(value) {
  if (value == null || value === '') return null;
  return String(value);
}

let subSeq = 0;
/** Ids in the live rows are Date.now()-shaped; a counter keeps a batch unique. */
const makeSubId = () => `${Date.now()}${(subSeq += 1).toString(36)}`;

/**
 * One sub-exercise, in the shape the live rows use. Keys that carry
 * nothing are omitted rather than written null — that is how the
 * builder writes them, and readers test for presence.
 */
function buildSub(sub, isTabata) {
  const name = String(sub?.exercise_name ?? sub?.name ?? '').trim();
  if (!name) throw new Error('[createPlanFromSpec] every sub-exercise needs a name');
  const out = { id: makeSubId(), exercise_name: name };
  // Numbers inside tabata_data are STRINGS.
  const put = (k, v) => { if (v != null && v !== '') out[k] = String(v); };
  if (isTabata) {
    put('work_time', sub.work_time);
    put('rest_time', sub.rest_time);
  } else {
    put('reps', sub.reps);
    put('work_time', sub.work_time);
    put('rest_time', sub.rest_time);
    put('hold_seconds', sub.hold_seconds);
  }
  put('side', sub.side);
  put('range_of_motion', sub.range_of_motion);
  // The coach's hint for THIS movement. PlanSheet renders it under the
  // sub row in the same regular grey a top-level hint gets.
  put('description', sub.description);
  return out;
}

/**
 * THE TABATA SETS SHAPE.
 *
 * A SET is a GROUP of exercises performed together for N rounds of
 * work/rest; a rest between sets; then the next set. Serialised into
 * the existing TEXT column, no migration:
 *
 *   {"container_type":"tabata",
 *    "sets":[{"exercises":["עלייה לישיבה","טיפוס הרים"],
 *             "rounds":4,"work_time":"30","rest_time":"5"}],
 *    "rest_between_sets":"60"}
 *
 * Validated hard, because a malformed set is a clock that runs the
 * wrong workout:
 *   exercises   non-empty array of non-empty names
 *   rounds      an integer, at least 1
 *   work_time   numeric, required — a set with no work has nothing to run
 *   rest_time   numeric, optional, defaults to "0"
 * Unknown keys throw, the same as everywhere else in this function.
 *
 * Times are written as STRINGS, which is how every number inside
 * tabata_data is stored.
 */
function buildTabataSets(blocks, restBetweenSets, where) {
  const numeric = (v, field, at, { required = false } = {}) => {
    if (v == null || v === '') {
      if (required) {
        throw new Error(`[createPlanFromSpec] ${at} needs a ${field}`);
      }
      return null;
    }
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) {
      throw new Error(
        `[createPlanFromSpec] ${at} ${field} must be numeric, got ${JSON.stringify(v)}`,
      );
    }
    return n;
  };

  const sets = blocks.map((b, i) => {
    const at = `${where}, tabata set ${i + 1}`;
    assertKnownSpecKeys('tabataSet', b, at);

    const names = (Array.isArray(b?.exercises) ? b.exercises : [])
      .map((x) => String(typeof x === 'string' ? x : (x?.name ?? x?.exercise_name ?? '')).trim())
      .filter(Boolean);
    if (!names.length) {
      throw new Error(`[createPlanFromSpec] ${at} needs a non-empty exercises list`);
    }

    const rounds = numeric(b?.rounds, 'rounds', at, { required: true });
    if (!Number.isInteger(rounds) || rounds < 1) {
      throw new Error(
        `[createPlanFromSpec] ${at} rounds must be a whole number of at least 1, `
        + `got ${JSON.stringify(b?.rounds)}`,
      );
    }
    const work = numeric(b?.work_time, 'work_time', at, { required: true });
    if (work <= 0) {
      throw new Error(`[createPlanFromSpec] ${at} work_time must be greater than 0`);
    }
    const rest = numeric(b?.rest_time, 'rest_time', at) ?? 0;

    return {
      exercises: names,
      rounds,
      work_time: String(work),
      rest_time: String(rest),
    };
  });

  const between = numeric(restBetweenSets, 'rest_between_sets', where) ?? 0;
  return {
    container_type: 'tabata',
    sets,
    rest_between_sets: String(between),
  };
}

/** The bulleted plan summary, in the format the live rows carry. */
function buildPreviewText(names) {
  const shown = names.slice(0, 5).map((n) => `• ${n}`);
  const rest = names.length - shown.length;
  return rest > 0 ? `${shown.join('\n')}\n+ עוד ${rest}` : shown.join('\n');
}

/** users.full_name for an id, or null. Throws if the id resolves to nothing. */
async function fullNameOf(userId, role) {
  if (!userId) return null;
  const { data, error } = await supabase
    .from('users').select('id, full_name').eq('id', userId).maybeSingle();
  if (error) {
    throw new Error(`[createPlanFromSpec] could not read the ${role} user row: ${error.message}`);
  }
  if (!data) {
    throw new Error(
      `[createPlanFromSpec] ${role} id ${userId} matches no row in users. `
      + 'Refusing to write a name for an id that does not exist.',
    );
  }
  const name = String(data.full_name ?? '').trim();
  return name || null;
}

export async function createPlanFromSpec(spec) {
  if (!spec || typeof spec !== 'object') {
    throw new Error('[createPlanFromSpec] spec is required');
  }
  const coachId = spec.coachId ?? null;
  if (!coachId) {
    throw new Error(
      '[createPlanFromSpec] coachId is required and is never defaulted. '
      + 'Read it from AuthContext at the call site.',
    );
  }
  const traineeId = spec.traineeId ?? null;
  const title = String(spec.title ?? '').trim();
  if (!title) throw new Error('[createPlanFromSpec] title is required');
  const sections = Array.isArray(spec.sections) ? spec.sections : [];
  if (!sections.length) throw new Error('[createPlanFromSpec] at least one section is required');

  // ── Reject an unrecognised spec key before anything else happens.
  assertKnownSpecKeys('plan', spec, 'plan level');
  sections.forEach((s, si) => {
    const at = `section ${si + 1} "${s?.section_name ?? ''}"`;
    assertKnownSpecKeys('section', s, at);
    (Array.isArray(s?.exercises) ? s.exercises : []).forEach((e, ei) => {
      assertKnownSpecKeys('exercise', e, `${at}, exercise ${ei + 1}`);
      (Array.isArray(e?.sub_exercises) ? e.sub_exercises : []).forEach((sub, bi) => {
        assertKnownSpecKeys('sub', sub, `${at}, exercise ${ei + 1}, sub ${bi + 1}`);
      });
    });
  });

  // ── Names come from the users table, never from the caller. ────────
  const [assignedToName, createdByName] = await Promise.all([
    fullNameOf(traineeId, 'trainee'),
    fullNameOf(coachId, 'coach'),
  ]);

  // ── Build every payload BEFORE inserting anything, so validation
  //    can reject the whole spec without leaving a half-written plan.
  const flatNames = [];
  for (const s of sections) {
    for (const e of (Array.isArray(s.exercises) ? s.exercises : [])) {
      flatNames.push(String(e?.name ?? e?.exercise_name ?? '').trim());
    }
  }

  const planPayload = {
    title,
    plan_name: spec.plan_name ?? title,
    description: spec.description ?? null,
    // TEXT column holding a JSON array as a string — see the shape doc.
    goal_focus: Array.isArray(spec.goal_focus) && spec.goal_focus.length
      ? JSON.stringify(spec.goal_focus)
      : (spec.goal_focus ?? null),
    // A genuine text[]; passed through as an array.
    weekly_days: Array.isArray(spec.weekly_days) ? spec.weekly_days : [],
    difficulty_level: spec.difficulty_level ?? null,
    duration_weeks: intOrNull(spec.duration_weeks, 'duration_weeks'),
    plan_type: spec.plan_type ?? null,
    difficulty: spec.difficulty ?? null,
    status: spec.status ?? 'פעילה',
    is_template: spec.is_template === true,
    start_date: spec.start_date ?? new Date().toISOString().split('T')[0],
    series_id: spec.series_id ?? null,
    parent_plan_id: spec.parent_plan_id ?? null,
    assigned_to: traineeId,
    assigned_to_name: assignedToName,
    created_by: coachId,
    created_by_name: createdByName,
    coach_id: coachId,
    progress_percentage: 0,
    // Denormalised copies the plan lists read directly.
    exercises_count: spec.exercises_count ?? flatNames.length,
    preview_text: spec.preview_text ?? buildPreviewText(flatNames),
  };

  const sectionPayloads = sections.map((s, i) => {
    const sectionName = String(s?.section_name ?? '').trim();
    if (!sectionName) {
      throw new Error(`[createPlanFromSpec] section ${i + 1} has no section_name`);
    }
    return {
      section_name: sectionName,
      category: s.category ?? sectionName,
      description: s.description ?? null,
      coach_notes: s.coach_notes ?? null,
      color_theme: s.color_theme ?? getSectionColor(i),
      icon: s.icon ?? null,
      tracking_mode: s.tracking_mode ?? 'full',
      // 1-based array position — the column every reader sorts by.
      order: i + 1,
      order_index: 0,
      completed: false,
      coach_id: coachId,
      // training_plan_id is filled in after the plan row exists.
      training_plan_id: null,
    };
  });

  // Exercises are built with a null training_section_id placeholder.
  // Validation is about KEYS, and the key set does not change when the
  // real id is filled in after the sections are inserted.
  const exercisePayloads = [];
  sections.forEach((s, si) => {
    const rows = Array.isArray(s.exercises) ? s.exercises : [];
    rows.forEach((e, ei) => {
      const where = `section ${si + 1} "${s.section_name}", exercise ${ei + 1}`;
      const name = String(e?.name ?? e?.exercise_name ?? '').trim();
      if (!name) throw new Error(`[createPlanFromSpec] ${where} has no name`);

      const mode = e.mode ?? null;
      const subs = Array.isArray(e.sub_exercises) ? e.sub_exercises : [];
      const setBlocks = Array.isArray(e.tabata_sets) ? e.tabata_sets : [];
      if ((subs.length || setBlocks.length) && !CONTAINER_MODES.has(modeKey(mode))) {
        throw new Error(
          `[createPlanFromSpec] ${where} supplies sub_exercises or tabata_sets `
          + `but its mode is ${JSON.stringify(mode)}, which is not a container `
          + 'method. Set mode to one of טבטה / סופרסט / קומבו / דרופסט (or '
          + 'another method from constants/trainingMethods.js).',
        );
      }
      const isTabata = TABATA_MODES.has(modeKey(mode));
      if (setBlocks.length && !isTabata) {
        throw new Error(
          `[createPlanFromSpec] ${where} supplies tabata_sets but its mode is `
          + `${JSON.stringify(mode)}. The sets shape belongs to טבטה only; a `
          + 'superset, combo or dropset uses sub_exercises.',
        );
      }
      if (setBlocks.length && subs.length) {
        throw new Error(
          `[createPlanFromSpec] ${where} supplies BOTH tabata_sets and `
          + 'sub_exercises. Pick one — sets is the current shape, '
          + 'sub_exercises the legacy flat one.',
        );
      }

      // The sets shape when given; otherwise the legacy flat list,
      // which is still accepted and still written exactly as before.
      let tabataData = null;
      let previewNames = [];
      if (setBlocks.length) {
        const payload = buildTabataSets(setBlocks, e.rest_between_sets, where);
        tabataData = JSON.stringify(payload);
        // De-duplicated across sets: the preview names the movements,
        // not every repetition of them.
        previewNames = [...new Set(payload.sets.flatMap((b) => b.exercises))];
      } else if (subs.length) {
        const built = subs.map((sub) => buildSub(sub, isTabata));
        tabataData = JSON.stringify({
          container_type: isTabata ? 'tabata' : 'list',
          sub_exercises: built,
        });
        previewNames = built.map((b) => b.exercise_name);
      }

      const row = {
        // Live rows carry the same string in both columns.
        name,
        exercise_name: name,
        mode,
        sets: intOrNull(e.sets, 'sets', where),
        reps: intOrNull(e.reps, 'reps', where),
        rounds: intOrNull(e.rounds, 'rounds', where),
        static_hold_time: intOrNull(e.static_hold_time, 'static_hold_time', where),
        // TEXT columns.
        work_time: textOrNull(e.work_time),
        rest_time: textOrNull(e.rest_time),
        weight: numOrNull(e.weight, 'weight', where),
        weight_type: e.weight_type ?? null,
        rpe: intOrNull(e.rpe, 'rpe', where),
        rest_between_sets: intOrNull(e.rest_between_sets, 'rest_between_sets', where),
        rest_between_exercises:
          intOrNull(e.rest_between_exercises, 'rest_between_exercises', where),
        side: e.side ?? null,
        range_of_motion: e.range_of_motion ?? null,
        body_position: e.body_position ?? null,
        equipment: e.equipment ?? null,
        grip: e.grip ?? null,
        tempo: e.tempo ?? null,
        emphasis: e.emphasis ?? null,
        description: e.description ?? null,
        notes: e.notes ?? null,
        track_for_measurement: e.track_for_measurement === true,
        tabata_data: tabataData,
        // The movement names, in order, whichever shape carried them.
        tabata_preview: previewNames.length ? previewNames.join(' • ') : null,
        // 1-based PER SECTION, as on live rows.
        order: ei + 1,
        order_index: 0,
        coach_id: coachId,
        training_plan_id: null,
        training_section_id: null,
      };
      // `completed` is stripped and '' becomes null, through the same
      // choke point the coach's own editor uses.
      exercisePayloads.push({ sectionIndex: si, row: prepareExerciseData(row) });
    });
  });

  // ── Validate EVERY key of EVERY payload before the first insert. ──
  const [planCols, sectionCols, exerciseCols] = await Promise.all([
    columnsOf('training_plans'),
    columnsOf('training_sections'),
    columnsOf('exercises'),
  ]);
  assertKnownColumns('training_plans', planPayload, planCols, 'plan row');
  sectionPayloads.forEach((p, i) => {
    assertKnownColumns('training_sections', p, sectionCols, `section ${i + 1}`);
  });
  exercisePayloads.forEach(({ row }, i) => {
    assertKnownColumns('exercises', row, exerciseCols, `exercise ${i + 1}`);
  });

  // ── Insert, plan → sections → exercises, same walk as duplicatePlan.
  const { data: newPlan, error: pErr } = await supabase
    .from('training_plans').insert(planPayload).select().single();
  if (pErr) throw pErr;

  // Explicit array-index → new section id map. Never reuse a spec index
  // as anything but a lookup key.
  const sectionIdByIndex = new Map();
  for (let i = 0; i < sectionPayloads.length; i += 1) {
    const { data: newSec, error: sErr } = await supabase
      .from('training_sections')
      .insert({ ...sectionPayloads[i], training_plan_id: newPlan.id })
      .select().single();
    if (sErr) {
      throw new Error(
        `[createPlanFromSpec] section ${i + 1} failed: ${sErr.message}. `
        + `Plan ${newPlan.id} was already created and is now partial — `
        + 'there is no rollback here, the same as duplicatePlan.',
      );
    }
    sectionIdByIndex.set(i, newSec.id);
  }

  for (let i = 0; i < exercisePayloads.length; i += 1) {
    const { sectionIndex, row } = exercisePayloads[i];
    const { error: eErr } = await supabase.from('exercises').insert({
      ...row,
      training_plan_id: newPlan.id,
      training_section_id: sectionIdByIndex.get(sectionIndex) ?? null,
    });
    if (eErr) {
      throw new Error(
        `[createPlanFromSpec] exercise ${i + 1} failed: ${eErr.message}. `
        + `Plan ${newPlan.id} was already created and is now partial — `
        + 'there is no rollback here, the same as duplicatePlan.',
      );
    }
  }

  return newPlan;
}

// ── Soft delete ──────────────────────────────────────────────────────
// The ONLY way a plan is removed. Flips status to 'deleted' on that one
// row and touches nothing else — no cascade into training_sections,
// exercises or workout_executions. Every list read filters the value
// OUT with .neq('status','deleted') rather than filtering an active
// value IN, because statuses are mixed Hebrew and English.
//
// There is no deleted_at column on training_plans; do not add one to
// this payload — the write is silently dropped.
export async function softDeletePlan(planId) {
  const { error } = await supabase
    .from('training_plans').update({ status: 'deleted' }).eq('id', planId);
  if (error) throw error;
}

// Does any live plan point at this one as its parent?
export async function planHasCopies(planId) {
  const { data, error } = await supabase
    .from('training_plans').select('id')
    .eq('parent_plan_id', planId).neq('status', 'deleted').limit(1);
  if (error) return false;
  return (data || []).length > 0;
}

// Delete confirmation text. Copies and originals-with-copies get an
// explicit reassurance about what is NOT affected. No variant claims
// the action is irreversible — soft delete is recoverable.
export async function buildPlanDeleteMessage(plan) {
  const name = plan?.plan_name || plan?.title || '';
  if (plan?.parent_plan_id) {
    return 'למחוק את העותק בלבד? תוכנית המקור לא תושפע.';
  }
  if (plan?.id && await planHasCopies(plan.id)) {
    return 'לתוכנית הזאת יש עותקים. מחיקה שלה לא תמחק אותם.';
  }
  return `למחוק את התוכנית "${name}"?`;
}

// AthletiGo brand palette — 10 perceptually distinct hex strings
// keyed off the section's index in its plan. Brand orange first,
// navy second so the two most-distinctive AthletiGo tones bookend
// the most-visible sections. Returned as a flat string by
// getSectionColor so SectionCard's both branches drive every
// derived style (border / accent / text / chevron) from one value.
export const SECTION_COLORS = [
  '#FF6F20',   // כתום — צבע המותג
  '#1E3A5F',   // נייבי כהה
  '#22c55e',   // ירוק
  '#FF6F20CC', // כתום שקוף (גוון שני)
  '#0EA5E9',   // תכלת
  '#F59E0B',   // זהב
  '#7C3AED',   // סגול
  '#EF4444',   // אדום
  '#0D9488',   // ירוק-כחול
  '#1E3A5F99', // נייבי בהיר
];

export function getSectionColor(index) {
  return SECTION_COLORS[index % SECTION_COLORS.length];
}

export async function setTraineeCanEdit(planId, canEdit) {
  const { error } = await supabase.from('training_plans').update({ trainee_can_edit: canEdit }).eq('id', planId);
  if (error) throw error;
}
