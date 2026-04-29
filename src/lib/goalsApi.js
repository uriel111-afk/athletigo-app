import { supabase } from '@/lib/supabaseClient';

// Helper layer around the goals table for the new goal↔records flow.
// All status writes use the Hebrew canonical values that already
// live in the schema:
//   'פעיל'  = active   (default)
//   'הושג'  = achieved (cancellation by goal completion)
//   'בוטל'  = cancelled (manual cancel)

export const GOAL_STATUS = {
  ACTIVE: 'פעיל',
  ACHIEVED: 'הושג',
  CANCELLED: 'בוטל',
};

// Pull the active goal for a trainee+exercise pair (at most one).
// Returns null when there isn't one.
export async function getActiveGoal(traineeId, exerciseName) {
  if (!traineeId || !exerciseName) return null;
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('trainee_id', traineeId)
    .eq('exercise_name', exerciseName)
    .eq('status', GOAL_STATUS.ACTIVE)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn('[goalsApi] getActiveGoal failed:', error.message);
    return null;
  }
  return data || null;
}

// Pull the trainee's all-time best PB for a given exercise — used as
// starting_value when creating a new goal so the progress bar has a
// real anchor instead of zero.
export async function getCurrentPB(traineeId, exerciseName) {
  if (!traineeId || !exerciseName) return 0;
  const { data, error } = await supabase
    .from('personal_records')
    .select('value')
    .eq('trainee_id', traineeId)
    .eq('name', exerciseName)
    .or('status.is.null,status.neq.deleted')
    .order('value', { ascending: false })
    .limit(1);
  if (error) {
    console.warn('[goalsApi] getCurrentPB failed:', error.message);
    return 0;
  }
  return Number(data?.[0]?.value) || 0;
}

// Cancel any prior active goal for the same exercise so only one
// goal is in flight per trainee+exercise at any moment.
export async function cancelActiveGoals(traineeId, exerciseName) {
  if (!traineeId || !exerciseName) return;
  try {
    const { error } = await supabase
      .from('goals')
      .update({ status: GOAL_STATUS.CANCELLED, updated_at: new Date().toISOString() })
      .eq('trainee_id', traineeId)
      .eq('exercise_name', exerciseName)
      .eq('status', GOAL_STATUS.ACTIVE);
    if (error) {
      console.warn('[goalsApi] cancelActiveGoals failed:', error.message);
    }
  } catch (e) {
    console.warn('[goalsApi] cancelActiveGoals threw:', e?.message);
  }
}

// After a personal_records insert, check whether the new value
// achieves the active goal. Returns { achieved, goal } so the
// caller can show a celebration popup. Always best-effort.
export async function checkAchievement(traineeId, exerciseName, newValue) {
  const goal = await getActiveGoal(traineeId, exerciseName);
  if (!goal) return { achieved: false, goal: null };
  const target = Number(goal.target_value);
  if (!Number.isFinite(target)) return { achieved: false, goal };
  if (Number(newValue) >= target) {
    try {
      const { error } = await supabase
        .from('goals')
        .update({
          status: GOAL_STATUS.ACHIEVED,
          completed_at: new Date().toISOString(),
          current_value: String(newValue),
          updated_at: new Date().toISOString(),
        })
        .eq('id', goal.id);
      if (error) {
        console.warn('[goalsApi] mark achieved failed:', error.message);
        return { achieved: false, goal };
      }
      return {
        achieved: true,
        goal: {
          ...goal,
          status: GOAL_STATUS.ACHIEVED,
          completed_at: new Date().toISOString(),
        },
      };
    } catch (e) {
      console.warn('[goalsApi] mark achieved threw:', e?.message);
      return { achieved: false, goal };
    }
  }
  return { achieved: false, goal };
}
