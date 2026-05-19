import { supabase } from './supabaseClient';

// Real production schema we target:
//   workout_executions:  id, trainee_id, workout_template_id, plan_id,
//                        executed_at, self_rating, completion_percent,
//                        section_ratings (jsonb)
//   exercise_set_logs:   id, execution_id, exercise_id, set_number,
//                        reps_completed, time_completed, weight_used, notes
//
// Save model: workout state is held in memory during the active flow. On
// "שמור וסיים" we INSERT one workout_executions row + bulk-insert all
// exercise_set_logs at once. No in-progress rows live in the DB.

export async function getExecutionsForPlan(planId, traineeId) {
  const { data, error } = await supabase
    .from('workout_executions')
    .select('*')
    .eq('plan_id', planId)
    .eq('trainee_id', traineeId)
    .order('executed_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// Duplicate the master plan as a fresh, unfilled execution row owned
// by the trainee. The new execution shares the original plan_id, so
// every progress graph that groups by plan still sees this as another
// performance of the same workout (a new data point).
//
// Crucially: the per-exercise `completed` flag and the per-section
// `completed` flag live on the plan-shared `exercises` /
// `training_sections` rows, NOT inside workout_executions. If we only
// inserted the new execution row, the lined-page UI would still read
// `exercise.completed === true` from the previous performance and
// render every exercise as done. So we also reset those two flags
// for the plan before returning. Historical executions still keep
// their own `exercise_set_logs` rows (different execution_id), so
// previous performances are intact in WorkoutExecutionReadOnly — that
// component derives completion from set logs, not from these flags.
export async function createDuplicatedExecution({
  planId, traineeId, note = 'שוכפל על ידי המאמן',
}) {
  const { data, error } = await supabase
    .from('workout_executions')
    .insert({
      plan_id: planId,
      trainee_id: traineeId,
      workout_template_id: planId,
      executed_at: new Date().toISOString(),
      self_rating: null,
      completion_percent: 0,
      section_ratings: {},
      notes: note,
    })
    .select()
    .single();
  if (error) throw error;

  // Reset the plan-level completion flags so the duplicate opens
  // with every exercise/section as "לא בוצע". Best-effort — a
  // failure here doesn't invalidate the duplicate row itself, just
  // means the trainee may see stale completion ticks until the
  // first toggle clears them.
  try {
    await supabase
      .from('exercises')
      .update({ completed: false })
      .eq('training_plan_id', planId);
  } catch (e) {
    console.warn('[createDuplicatedExecution] exercises reset failed:', e?.message);
  }
  try {
    await supabase
      .from('training_sections')
      .update({ completed: false })
      .eq('training_plan_id', planId);
  } catch (e) {
    console.warn('[createDuplicatedExecution] sections reset failed:', e?.message);
  }

  return data;
}

// All executions for one trainee across every plan. Used by the coach
// view inside TraineeProfile to show a recent-executions list.
export async function getAllExecutionsForTrainee(traineeId) {
  const { data, error } = await supabase
    .from('workout_executions')
    .select('*')
    .eq('trainee_id', traineeId)
    .order('executed_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getExecutionWithSetLogs(executionId) {
  const [execRes, logsRes] = await Promise.all([
    supabase.from('workout_executions').select('*').eq('id', executionId).single(),
    supabase
      .from('exercise_set_logs')
      .select('*')
      .eq('execution_id', executionId)
      .order('exercise_id', { ascending: true })
      .order('set_number', { ascending: true }),
  ]);
  if (execRes.error) throw execRes.error;
  if (logsRes.error) throw logsRes.error;
  return { execution: execRes.data, setLogs: logsRes.data || [] };
}

// setLogs: [{ exercise_id, set_number, mode, value, note? }]
//   mode = 'reps' | 'seconds' | 'time' | 'kg' | 'weight'
// Empty / nullish values land as NULL in the matching column.
export async function saveCompletedWorkout({
  planId,
  traineeId,
  workoutTemplateId = null,
  selfRating,
  completionPercent,
  sectionRatings = {},
  setLogs = [],
}) {
  const { data: exec, error: insertErr } = await supabase
    .from('workout_executions')
    .insert({
      plan_id: planId,
      trainee_id: traineeId,
      workout_template_id: workoutTemplateId,
      executed_at: new Date().toISOString(),
      self_rating: selfRating,
      completion_percent: completionPercent,
      section_ratings: sectionRatings,
    })
    .select()
    .single();
  if (insertErr) throw insertErr;

  if (setLogs.length > 0) {
    const rows = setLogs.map((s) => {
      const row = {
        execution_id: exec.id,
        exercise_id: s.exercise_id,
        set_number: s.set_number,
        notes: s.note || null,
      };
      const v = s.value === '' || s.value == null ? null : Number(s.value);
      if (s.mode === 'seconds' || s.mode === 'time') row.time_completed = v;
      else if (s.mode === 'kg' || s.mode === 'weight') row.weight_used = v;
      else row.reps_completed = v;
      return row;
    });
    const { error: logsErr } = await supabase.from('exercise_set_logs').insert(rows);
    if (logsErr) throw logsErr;
  }
  return exec;
}

// The section_ratings JSONB shape grew an object form in step 1 of the
// progress-tracking rewrite. Old rows: `{ [sid]: number }` where number
// is avg(control, challenge). New rows: `{ [sid]: { control, challenge,
// avg, notes } }`. Every read site must go through this normalizer so
// old number-shaped rows still render the avg chip without code branching
// at every call site. avg is the canonical 0-10 score to display; the
// other fields are null/'' on legacy rows.
export function readSectionRating(v) {
  if (v == null) {
    return { avg: null, control: null, challenge: null, notes: '' };
  }
  if (typeof v === 'number') {
    return { avg: v, control: null, challenge: null, notes: '' };
  }
  if (typeof v === 'object') {
    return {
      avg: v.avg != null ? Number(v.avg) : null,
      control: v.control != null ? Number(v.control) : null,
      challenge: v.challenge != null ? Number(v.challenge) : null,
      notes: typeof v.notes === 'string' ? v.notes : '',
    };
  }
  return { avg: null, control: null, challenge: null, notes: '' };
}

// Per-exercise execution summary read helper. Mirror of the writer
// in UnifiedPlanBuilder.saveWorkoutExecution. Returns a fully-shaped
// object (all keys present, nulls/zeros for missing) so callers can
// destructure without conditional chaining. Tolerates execRow without
// the column (old rows pre step 2) and missing per-exercise keys
// (exercises the trainee never touched on that run).
export function readExerciseSummary(execRow, exerciseId) {
  const map = execRow && execRow.exercise_summaries;
  const v = map && typeof map === 'object' ? map[exerciseId] : null;
  if (!v || typeof v !== 'object') {
    return {
      planned_sets: null,
      done_sets: 0,
      planned_reps: null,
      total_reps_done: 0,
      total_reps_target: null,
      completion_pct: null,
      avg_difficulty: null,
    };
  }
  return {
    planned_sets: v.planned_sets ?? null,
    done_sets: Number(v.done_sets) || 0,
    planned_reps: v.planned_reps ?? null,
    total_reps_done: Number(v.total_reps_done) || 0,
    total_reps_target: v.total_reps_target ?? null,
    completion_pct: v.completion_pct ?? null,
    avg_difficulty: v.avg_difficulty ?? null,
  };
}

export function indexSetLogs(logs) {
  const byExercise = {};
  for (const log of logs || []) {
    if (!byExercise[log.exercise_id]) byExercise[log.exercise_id] = {};
    byExercise[log.exercise_id][log.set_number] = log;
  }
  return byExercise;
}

export function valueFromLog(log, mode) {
  if (!log) return '';
  if (mode === 'seconds' || mode === 'time') return log.time_completed ?? '';
  if (mode === 'kg' || mode === 'weight') return log.weight_used ?? '';
  return log.reps_completed ?? '';
}
