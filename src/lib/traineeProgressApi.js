import { supabase } from './supabaseClient';

export async function upsertTraineeProgress({
  traineeId,
  exerciseId,
  planId = null,
  sessionId = null,
  completed = null,
  feedback = null,
}) {
  if (!traineeId || !exerciseId) {
    throw new Error('upsertTraineeProgress: traineeId and exerciseId required');
  }
  const row = { trainee_id: traineeId, exercise_id: exerciseId };
  if (planId) row.plan_id = planId;
  if (sessionId) row.session_id = sessionId;
  if (completed !== null) row.completed = !!completed;
  if (feedback !== null) row.feedback = feedback;
  const { data, error } = await supabase
    .from('trainee_exercise_progress')
    .upsert(row, { onConflict: 'trainee_id,exercise_id' })
    .select()
    .single();
  if (error) {
    if (error.code === '42P01') {
      console.warn('[traineeProgressApi] trainee_exercise_progress missing — run migration in Supabase.');
    }
    throw error;
  }
  return data;
}

export async function getTraineeProgressForPlan(traineeId, planId) {
  if (!traineeId || !planId) return [];
  const { data, error } = await supabase
    .from('trainee_exercise_progress')
    .select('exercise_id, completed, feedback, updated_at')
    .eq('trainee_id', traineeId)
    .eq('plan_id', planId);
  if (error) {
    if (error.code === '42P01') {
      console.warn('[traineeProgressApi] trainee_exercise_progress missing.');
      return [];
    }
    throw error;
  }
  return data || [];
}

export async function bulkUpsertProgress(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const { data, error } = await supabase
    .from('trainee_exercise_progress')
    .upsert(rows, { onConflict: 'trainee_id,exercise_id' })
    .select();
  if (error) {
    if (error.code === '42P01') {
      console.warn('[traineeProgressApi] trainee_exercise_progress missing.');
      return [];
    }
    throw error;
  }
  return data || [];
}
