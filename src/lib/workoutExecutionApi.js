import { supabase } from './supabaseClient';
import {
  startOrResumeExecution,
  markExerciseDone,
  unmarkExercise,
  submitSectionRating,
  completeWorkout,
  getExecutionHistory,
  getExecutionDetails,
} from './planExecutionApi';

export {
  startOrResumeExecution,
  markExerciseDone,
  unmarkExercise,
  submitSectionRating,
  completeWorkout,
  getExecutionHistory,
  getExecutionDetails,
};

export async function createExecution(planId, traineeId, totalExercises) {
  return startOrResumeExecution(planId, traineeId, null, totalExercises);
}

// Per-set log save. `mode` is the exercise's input mode and decides which
// numeric column the value lands in. We upsert on (execution, exercise, set)
// so editing the same set just updates the row.
export async function saveSetLog(executionId, exerciseId, setNumber, mode, value, note = null) {
  const payload = {
    execution_id: executionId,
    exercise_id: exerciseId,
    set_number: setNumber,
    notes: note,
  };
  const numeric = value === '' || value == null ? null : Number(value);
  if (mode === 'seconds' || mode === 'time') payload.time_completed = numeric;
  else if (mode === 'kg' || mode === 'weight') payload.weight_used = numeric;
  else payload.reps_completed = numeric;

  const { error } = await supabase
    .from('exercise_set_logs')
    .upsert(payload, { onConflict: 'execution_id,exercise_id,set_number' });
  if (error) throw error;
}

export async function getSetLogs(executionId) {
  const { data, error } = await supabase
    .from('exercise_set_logs')
    .select('*')
    .eq('execution_id', executionId)
    .order('exercise_id', { ascending: true })
    .order('set_number', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getExecutionsForPlan(planId, traineeId) {
  const { data, error } = await supabase
    .from('workout_executions')
    .select('*, section_executions(*)')
    .eq('plan_id', planId)
    .eq('trainee_id', traineeId)
    .order('started_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// Reads logged values for one exercise inside one execution and returns
// them indexed by set_number. The execution view uses this to pre-fill the
// per-set inputs (in active mode) or render them read-only (review mode).
export function indexSetLogs(logs) {
  const byExercise = {};
  for (const log of logs || []) {
    if (!byExercise[log.exercise_id]) byExercise[log.exercise_id] = {};
    byExercise[log.exercise_id][log.set_number] = log;
  }
  return byExercise;
}
