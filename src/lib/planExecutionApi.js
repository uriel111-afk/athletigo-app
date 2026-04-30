import { supabase } from './supabaseClient';

export async function startOrResumeExecution(planId, traineeId, seriesId, totalExercises) {
  const { data: existing } = await supabase
    .from('workout_executions')
    .select('*, exercise_executions(*), section_executions(*)')
    .eq('plan_id', planId).eq('trainee_id', traineeId)
    .eq('status', 'in_progress').maybeSingle();
  if (existing) {
    const hours = (Date.now() - new Date(existing.started_at).getTime()) / 3600000;
    if (hours < 24) return { action: 'resume_prompt', execution: existing };
    await supabase.from('workout_executions')
      .update({ status: 'abandoned', abandoned_at: new Date().toISOString() })
      .eq('id', existing.id);
  }
  const { data, error } = await supabase.from('workout_executions')
    .insert({ plan_id: planId, trainee_id: traineeId, series_id: seriesId,
      total_exercises: totalExercises, status: 'in_progress' })
    .select().single();
  if (error) throw error;
  return { action: 'new', execution: data };
}

export async function markExerciseDone(executionId, sectionId, exerciseId, note) {
  const { data, error } = await supabase.from('exercise_executions')
    .upsert({ workout_execution_id: executionId, section_id: sectionId,
      exercise_id: exerciseId, is_completed: true, trainee_note: note || null,
      completed_at: new Date().toISOString() },
      { onConflict: 'workout_execution_id,exercise_id' })
    .select().single();
  if (error) throw error;
  const { count } = await supabase.from('exercise_executions')
    .select('*', { count: 'exact', head: true })
    .eq('workout_execution_id', executionId).eq('is_completed', true);
  await supabase.from('workout_executions')
    .update({ completed_exercises: count || 0 }).eq('id', executionId);
  return data;
}

export async function unmarkExercise(executionId, exerciseId) {
  await supabase.from('exercise_executions')
    .update({ is_completed: false, completed_at: null })
    .eq('workout_execution_id', executionId).eq('exercise_id', exerciseId);
  const { count } = await supabase.from('exercise_executions')
    .select('*', { count: 'exact', head: true })
    .eq('workout_execution_id', executionId).eq('is_completed', true);
  await supabase.from('workout_executions')
    .update({ completed_exercises: count || 0 }).eq('id', executionId);
}

export async function submitSectionRating(executionId, sectionId, challenge, control) {
  const avg = Math.round(((challenge + control) / 2) * 100) / 100;
  const { data, error } = await supabase.from('section_executions')
    .upsert({ workout_execution_id: executionId, section_id: sectionId,
      challenge_score: challenge, control_score: control, avg_score: avg,
      completed_at: new Date().toISOString() },
      { onConflict: 'workout_execution_id,section_id' })
    .select().single();
  if (error) throw error;
  return data;
}

export async function completeWorkout(executionId, feedback) {
  const { data: sections } = await supabase.from('section_executions')
    .select('avg_score').eq('workout_execution_id', executionId);
  const scored = (sections || []).filter(s => s.avg_score != null);
  const avg = scored.length > 0
    ? Math.round((scored.reduce((s, x) => s + Number(x.avg_score), 0) / scored.length) * 100) / 100
    : null;
  const { data, error } = await supabase.from('workout_executions')
    .update({ status: 'completed', completed_at: new Date().toISOString(),
      total_avg_score: avg, trainee_feedback: feedback || null })
    .eq('id', executionId).select().single();
  if (error) throw error;
  if (data.plan_id && avg != null) {
    const { data: plan } = await supabase.from('training_plans')
      .select('best_score, execution_count').eq('id', data.plan_id).single();
    if (plan) {
      const best = (!plan.best_score || avg > Number(plan.best_score)) ? avg : plan.best_score;
      await supabase.from('training_plans')
        .update({ best_score: best, execution_count: (plan.execution_count || 0) + 1 })
        .eq('id', data.plan_id);
    }
  }
  return data;
}

export async function getExecutionHistory(planId, traineeId) {
  const { data, error } = await supabase.from('workout_executions')
    .select('*, section_executions(*)').eq('plan_id', planId)
    .eq('trainee_id', traineeId).eq('status', 'completed')
    .order('completed_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getExecutionDetails(executionId) {
  const { data, error } = await supabase.from('workout_executions')
    .select('*, section_executions(*), exercise_executions(*)')
    .eq('id', executionId).single();
  if (error) throw error;
  return data;
}
