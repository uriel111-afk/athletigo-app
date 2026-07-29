import { supabase } from './supabaseClient';

// ── Per-execution exercise completion ────────────────────────────────
// The ONLY place a "this exercise is done" fact is stored.
//
// exercises.completed used to carry this, but that column is global:
// one row per exercise, shared by every trainee assigned the plan and
// by every run of it. Ticking an exercise on Monday left it ticked on
// Tuesday, and a copy inherited the source's ticks. Completion is a
// property of a RUN, so it belongs on exercise_executions keyed by
// workout_execution_id.
//
// These two helpers touch only columns from the verified live schema:
//   exercise_executions: id, workout_execution_id, section_id,
//                        exercise_id, is_completed, trainee_note,
//                        completed_at
// The older helpers below (startOrResumeExecution / markExerciseDone /
// completeWorkout) reference columns that do not exist on the live
// tables and have no callers; they are left untouched but unused.
//
// A read-then-write is used instead of upsert(onConflict) because there
// is no verified unique index on (workout_execution_id, exercise_id).
export async function setExerciseCompletion(executionId, { exerciseId, sectionId, isCompleted }) {
  if (!executionId || !exerciseId) return null;

  const { data: existing, error: findErr } = await supabase
    .from('exercise_executions')
    .select('id')
    .eq('workout_execution_id', executionId)
    .eq('exercise_id', exerciseId)
    .limit(1);
  if (findErr) throw findErr;

  const patch = {
    is_completed: !!isCompleted,
    completed_at: isCompleted ? new Date().toISOString() : null,
  };

  if (existing && existing.length > 0) {
    const { error } = await supabase
      .from('exercise_executions').update(patch).eq('id', existing[0].id);
    if (error) throw error;
    return existing[0].id;
  }

  const { data, error } = await supabase
    .from('exercise_executions')
    .insert({
      workout_execution_id: executionId,
      exercise_id: exerciseId,
      section_id: sectionId || null,
      ...patch,
    })
    .select('id').single();
  if (error) throw error;
  return data?.id ?? null;
}

// { [exercise_id]: true } for one execution. Absent id === not done.
export async function loadExerciseCompletion(executionId) {
  if (!executionId) return {};
  const { data, error } = await supabase
    .from('exercise_executions')
    .select('exercise_id, is_completed')
    .eq('workout_execution_id', executionId);
  if (error) {
    console.warn('[planExecutionApi] completion load failed:', error.message);
    return {};
  }
  const map = {};
  for (const row of data || []) {
    if (row?.exercise_id) map[row.exercise_id] = !!row.is_completed;
  }
  return map;
}

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
      .select('best_score, execution_count')
      .eq('id', data.plan_id).neq('status', 'deleted').single();
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
