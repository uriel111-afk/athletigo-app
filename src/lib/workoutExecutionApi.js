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

// Coach-side: duplicate the master plan as a fresh, unfilled execution
// row owned by the trainee. Used by the "שכפל אימון למתאמן" button on
// the master card in WorkoutFolderDetail. The resulting row appears in
// the trainee's executions list immediately so they can open it later.
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
