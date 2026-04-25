import { supabase } from '@/lib/supabaseClient';
import { updateTaskStatus } from '@/lib/lifeos/lifeos-api';

// ─── Date helpers (Sunday = 0, Saturday = 6) ─────────────────────

const todayISO = () => new Date().toISOString().slice(0, 10);

// First day (Sunday) of the week containing `date`.
export function weekStart(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

export function weekStartISO(date = new Date()) {
  return weekStart(date).toISOString().slice(0, 10);
}

// Returns 7 Date objects, Sunday → Saturday, for the week containing
// the given date.
export function weekDays(date = new Date()) {
  const start = weekStart(date);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

export function isoOf(d) {
  return d.toISOString().slice(0, 10);
}

export const HE_DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
export const HE_DAY_SHORT = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

// ─── Bulk fetch — pulls everything for a 7-day window ─────────────
//
// Returns one big object:
//   {
//     start: ISO of Sunday,
//     days: [{ date, iso, dow, sessions, tasks, household, habits,
//              habitLogs, meals, mealPlan, plan, score }, ...],
//     habits: [...]    // list of all active habits, used to render the row
//     summary: { ... } // weekly aggregates (avg score, best/worst day,…)
//   }
export async function fetchWeek(userId, coachId = userId, anchorDate = new Date()) {
  if (!userId) return null;

  const days = weekDays(anchorDate);
  const startISO = isoOf(days[0]);
  const endISO = isoOf(days[6]);

  const safe = async (fn, fallback) => {
    try { return await fn(); } catch { return fallback; }
  };

  const [
    sessionsRes, tasksDueRes, householdRes,
    habitsRes, habitLogsRes,
    mealsRes, mealPlanRes, weeklyPlanRes, checkinsRes,
  ] = await Promise.all([
    // Coach sessions where THIS user is the coach OR the trainee.
    safe(async () => {
      const { data } = await supabase
        .from('sessions')
        .select('id, date, time, type, status, trainee_id, notes, coach_id, service_id')
        .or(`coach_id.eq.${coachId},trainee_id.eq.${userId}`)
        .gte('date', startISO).lte('date', endISO);
      return data || [];
    }, []),

    // Open tasks with a due_date in this week, plus undated open tasks.
    safe(async () => {
      const { data } = await supabase
        .from('life_os_tasks')
        .select('id, title, status, priority, category, due_date, transferred_from, xp_reward, is_challenge')
        .eq('user_id', userId)
        .or(`due_date.gte.${startISO},due_date.is.null`)
        .lte('due_date', endISO)
        .neq('status', 'archived');
      return data || [];
    }, []),

    safe(async () => {
      const { data } = await supabase
        .from('personal_household_tasks')
        .select('id, name, icon, frequency, duration_minutes, last_done, next_due, assigned_days')
        .eq('user_id', userId);
      return data || [];
    }, []),

    safe(async () => {
      const { data } = await supabase
        .from('personal_habits')
        .select('id, name, icon, target_per_week, frequency, streak_current, streak_best')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: true });
      return data || [];
    }, []),

    safe(async () => {
      const { data } = await supabase
        .from('personal_habit_log')
        .select('id, habit_id, date, completed')
        .eq('user_id', userId)
        .gte('date', startISO).lte('date', endISO);
      return data || [];
    }, []),

    safe(async () => {
      const { data } = await supabase
        .from('personal_meals')
        .select('id, date, meal_type, description, rating')
        .eq('user_id', userId)
        .gte('date', startISO).lte('date', endISO);
      return data || [];
    }, []),

    safe(async () => {
      const { data } = await supabase
        .from('personal_meal_plan')
        .select('id, week_start, day_of_week, meal_type, description, prep_day')
        .eq('user_id', userId)
        .eq('week_start', startISO);
      return data || [];
    }, []),

    safe(async () => {
      const { data } = await supabase
        .from('personal_weekly_plan')
        .select('*')
        .eq('user_id', userId)
        .eq('week_start', startISO);
      return data || [];
    }, []),

    safe(async () => {
      const { data } = await supabase
        .from('personal_checkin')
        .select('*')
        .eq('user_id', userId)
        .gte('date', startISO).lte('date', endISO);
      return data || [];
    }, []),
  ]);

  // ── normalize per-day buckets ─────────────────────────────────────
  const habitsList = habitsRes;
  const habitLogByDay = {};
  habitLogsRes.forEach(l => {
    (habitLogByDay[l.date] ||= {})[l.habit_id] = !!l.completed;
  });

  const mealsByDay = {};
  mealsRes.forEach(m => (mealsByDay[m.date] ||= []).push(m));

  const mealPlanByDay = {};
  mealPlanRes.forEach(m => (mealPlanByDay[m.day_of_week] ||= []).push(m));

  const planByDay = {};
  weeklyPlanRes.forEach(p => (planByDay[p.day_of_week] ||= []).push(p));

  const checkinByDay = {};
  checkinsRes.forEach(c => { checkinByDay[c.date] = c; });

  const dayBlocks = days.map((d, dow) => {
    const iso = isoOf(d);

    const sessions = sessionsRes
      .filter(s => s.date === iso)
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

    // Task is shown on a day if its due_date matches. Undated tasks
    // bubble up to TODAY.
    const todayIsoNow = todayISO();
    const tasks = tasksDueRes.filter(t =>
      (t.due_date === iso) || (!t.due_date && iso === todayIsoNow)
    );

    // Household tasks for this day-of-week:
    //   - explicit assigned_days[] hit, OR
    //   - frequency-derived placement (legacy fallback)
    const household = householdRes.filter(h => {
      if (Array.isArray(h.assigned_days) && h.assigned_days.length > 0) {
        return h.assigned_days.includes(dow);
      }
      // fallback: daily → all days, weekly → Mon (1), etc.
      if (h.frequency === 'daily') return true;
      if (h.frequency === 'weekly') return dow === 1;
      if (h.frequency === 'biweekly') return dow === 1;
      if (h.frequency === 'every_3_days') return dow === 0 || dow === 3;
      if (h.frequency === 'twice_weekly') return dow === 0 || dow === 3;
      return false;
    });

    const habitLogs = habitLogByDay[iso] || {};
    const meals = mealsByDay[iso] || [];
    const mealPlan = mealPlanByDay[dow] || [];
    const plan = planByDay[dow] || [];
    const checkin = checkinByDay[iso] || null;

    return {
      date: d, iso, dow, isToday: iso === todayIsoNow,
      sessions, tasks, household, habitLogs, meals, mealPlan, plan, checkin,
    };
  });

  // ── per-day score (0-100) ─────────────────────────────────────────
  const scoredDays = dayBlocks.map(block => ({ ...block, score: scoreDay(block, habitsList) }));

  // ── weekly summary ────────────────────────────────────────────────
  const summary = buildSummary(scoredDays, habitsList);

  return {
    startISO,
    endISO,
    days: scoredDays,
    habits: habitsList,
    summary,
  };
}

// ─── Daily score (0–100) ─────────────────────────────────────────
//
// Rubric (matches the spec):
//   sleep ≥ 7h          → 15
//   trained             → 20
//   nutrition_score ≥ 4 → 15
//   learned             → 15
//   meditated           → 10
//   tasks_completed pct → 0–15  (linear: 100% = 15)
//   habits_done pct     → 0–10  (linear: 100% = 10)
function scoreDay(block, habitsList) {
  const c = block.checkin || {};
  let score = 0;
  if ((c.sleep_hours || 0) >= 7) score += 15;
  if (c.trained) score += 20;
  if ((c.nutrition_score || 0) >= 4) score += 15;
  if (c.learned) score += 15;
  if (c.meditated) score += 10;

  const totalTasks = block.tasks.length;
  if (totalTasks > 0) {
    const done = block.tasks.filter(t => t.status === 'completed').length;
    score += Math.round((done / totalTasks) * 15);
  }

  const totalHabits = (habitsList || []).length;
  if (totalHabits > 0) {
    const done = Object.values(block.habitLogs).filter(Boolean).length;
    score += Math.round((done / totalHabits) * 10);
  }

  return Math.min(100, score);
}

function buildSummary(days, habitsList) {
  const past = days.filter(d => d.iso <= todayISO());
  if (past.length === 0) return null;

  const avgScore = Math.round(
    past.reduce((s, d) => s + d.score, 0) / past.length
  );
  const bestDay = past.reduce((a, b) => (b.score > a.score ? b : a), past[0]);
  const worstDay = past.reduce((a, b) => (b.score < a.score ? b : a), past[0]);

  // Habit completion across the week.
  const habitTotals = {};
  habitsList.forEach(h => { habitTotals[h.id] = { habit: h, done: 0 }; });
  days.forEach(d => {
    Object.entries(d.habitLogs).forEach(([hid, ok]) => {
      if (ok && habitTotals[hid]) habitTotals[hid].done += 1;
    });
  });
  const habitArr = Object.values(habitTotals);
  const topHabit = habitArr.reduce((a, b) => (b.done > (a?.done || 0) ? b : a), null);
  const weakHabit = habitArr.reduce((a, b) => (b.done < (a?.done ?? 99) ? b : a), null);

  // Tasks: total / completed / transferred.
  let taskTotal = 0, taskDone = 0, taskTransferred = 0;
  days.forEach(d => {
    d.tasks.forEach(t => {
      taskTotal += 1;
      if (t.status === 'completed') taskDone += 1;
      if (t.transferred_from) taskTransferred += 1;
    });
  });

  return {
    avgScore,
    bestDay: { dow: bestDay.dow, score: bestDay.score, iso: bestDay.iso },
    worstDay: { dow: worstDay.dow, score: worstDay.score, iso: worstDay.iso },
    topHabit: topHabit ? { name: topHabit.habit.name, icon: topHabit.habit.icon, done: topHabit.done } : null,
    weakHabit: weakHabit ? { name: weakHabit.habit.name, icon: weakHabit.habit.icon, done: weakHabit.done } : null,
    taskTotal, taskDone, taskTransferred,
    taskPct: taskTotal > 0 ? Math.round((taskDone / taskTotal) * 100) : 0,
  };
}

// ─── Mutations ───────────────────────────────────────────────────

// Mark a life_os_tasks row completed (or back to pending). Delegates
// to lifeos-api.updateTaskStatus so the activity_log + momentum sync
// fans out for free — without it, completing tasks from the weekly
// board wouldn't bump the streak/heatmap on the financial app.
export async function setTaskStatus(taskId, status) {
  return await updateTaskStatus(taskId, status);
}

// Move a task from one date to another (or schedule it for the first
// time). The original date becomes `transferred_from` so the UI can
// flag it.
export async function transferTask(taskId, newDate, originalDate = null) {
  const { data, error } = await supabase
    .from('life_os_tasks')
    .update({
      due_date: newDate,
      transferred_from: originalDate,
    })
    .eq('id', taskId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Add a free-form item to next week's plan.
export async function addPlanItem(userId, payload) {
  const { data, error } = await supabase
    .from('personal_weekly_plan')
    .insert({ ...payload, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deletePlanItem(id) {
  const { error } = await supabase.from('personal_weekly_plan').delete().eq('id', id);
  if (error) throw error;
}

export async function togglePlanItemComplete(id, completed) {
  const { data, error } = await supabase
    .from('personal_weekly_plan')
    .update({ completed: !!completed })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Copy this week's plan into next week's slot. Returns count copied.
export async function copyWeekPlan(userId, fromWeekISO, toWeekISO) {
  const { data: rows, error } = await supabase
    .from('personal_weekly_plan')
    .select('day_of_week, item_type, item_id, title, time_slot, notes')
    .eq('user_id', userId)
    .eq('week_start', fromWeekISO);
  if (error) throw error;
  if (!rows || rows.length === 0) return 0;
  const inserts = rows.map(r => ({ ...r, user_id: userId, week_start: toWeekISO }));
  const { error: insErr } = await supabase
    .from('personal_weekly_plan')
    .upsert(inserts, { onConflict: 'user_id,week_start,day_of_week,item_type,title' });
  if (insErr) throw insErr;
  return inserts.length;
}

// Update a household task's assigned_days.
export async function setHouseholdAssignedDays(taskId, days) {
  const { data, error } = await supabase
    .from('personal_household_tasks')
    .update({ assigned_days: days })
    .eq('id', taskId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Quick create a task with a due_date.
export async function addDatedTask(userId, payload) {
  const { data, error } = await supabase
    .from('life_os_tasks')
    .insert({
      ...payload,
      user_id: userId,
      status: payload.status || 'pending',
      priority: payload.priority || 'medium',
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}
