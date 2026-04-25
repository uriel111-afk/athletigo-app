// ═══════════════════════════════════════════════════════════════════
// Personal app — Supabase API layer
// ═══════════════════════════════════════════════════════════════════

import { supabase } from '@/lib/supabaseClient';

const todayISO = () => new Date().toISOString().slice(0, 10);

// ─── Daily check-in ──────────────────────────────────────────────

export async function getCheckin(userId, date = todayISO()) {
  const { data, error } = await supabase
    .from('personal_checkin')
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listCheckins(userId, { sinceDate } = {}) {
  let q = supabase.from('personal_checkin').select('*').eq('user_id', userId);
  if (sinceDate) q = q.gte('date', sinceDate);
  q = q.order('date', { ascending: false });
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function upsertCheckin(userId, payload) {
  const date = payload.date || todayISO();
  const { data, error } = await supabase
    .from('personal_checkin')
    .upsert({ ...payload, user_id: userId, date }, { onConflict: 'user_id,date' })
    .select()
    .single();
  if (error) throw error;

  // Cross-app sync: feed the financial app's streak/score.
  try {
    const inserts = [];
    if (payload.trained) inserts.push({
      user_id: userId, action_type: 'personal_training',
      category: 'health', details: { type: payload.training_type || null },
    });
    if (payload.content_created) inserts.push({
      user_id: userId, action_type: 'content_created',
      category: 'content', details: { from: 'checkin' },
    });
    if (payload.learned) inserts.push({
      user_id: userId, action_type: 'learning',
      category: 'growth',
      details: { topic: payload.learned_topic, minutes: payload.learn_duration_minutes },
    });
    if (inserts.length) await supabase.from('activity_log').insert(inserts);
  } catch (err) {
    console.warn('[upsertCheckin] activity log failed:', err?.message);
  }

  return data;
}

// ─── Habits ──────────────────────────────────────────────────────

export async function listHabits(userId, { onlyActive = true } = {}) {
  let q = supabase.from('personal_habits').select('*').eq('user_id', userId);
  if (onlyActive) q = q.eq('is_active', true);
  q = q.order('sort_order', { ascending: true });
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function addHabit(userId, payload) {
  const { data, error } = await supabase
    .from('personal_habits')
    .insert({ ...payload, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateHabit(id, patch) {
  const { data, error } = await supabase
    .from('personal_habits')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteHabit(id) {
  const { error } = await supabase.from('personal_habits').delete().eq('id', id);
  if (error) throw error;
}

// ─── Habit log ───────────────────────────────────────────────────

export async function listHabitLogs(userId, { sinceDate, habitId } = {}) {
  let q = supabase.from('personal_habit_log').select('*').eq('user_id', userId);
  if (sinceDate) q = q.gte('date', sinceDate);
  if (habitId) q = q.eq('habit_id', habitId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function toggleHabitLog(userId, habitId, date = todayISO()) {
  // UPSERT a log row; flip completed.
  const { data: existing } = await supabase
    .from('personal_habit_log')
    .select('id, completed')
    .eq('habit_id', habitId)
    .eq('date', date)
    .maybeSingle();
  if (existing?.id) {
    const { data, error } = await supabase
      .from('personal_habit_log')
      .update({ completed: !existing.completed })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase
    .from('personal_habit_log')
    .insert({ user_id: userId, habit_id: habitId, date, completed: true })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Contacts + interactions ─────────────────────────────────────

export async function listContacts(userId) {
  const { data, error } = await supabase
    .from('personal_contacts')
    .select('*')
    .eq('user_id', userId)
    .order('name');
  if (error) throw error;
  return data || [];
}

export async function addContact(userId, payload) {
  const { data, error } = await supabase
    .from('personal_contacts')
    .insert({ ...payload, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateContact(id, patch) {
  const { data, error } = await supabase
    .from('personal_contacts')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteContact(id) {
  const { error } = await supabase.from('personal_contacts').delete().eq('id', id);
  if (error) throw error;
}

export async function logInteraction(userId, contactId, payload = {}) {
  const date = payload.date || todayISO();
  const [{ error: insErr }] = [
    await supabase.from('personal_interactions').insert({
      user_id: userId, contact_id: contactId, date, type: payload.type || 'call',
      notes: payload.notes || null,
    }),
  ];
  if (insErr) throw insErr;
  // Bump the contact's last_contact_date.
  await supabase
    .from('personal_contacts')
    .update({ last_contact_date: date })
    .eq('id', contactId);
}

export async function listInteractions(userId, contactId) {
  let q = supabase.from('personal_interactions').select('*').eq('user_id', userId);
  if (contactId) q = q.eq('contact_id', contactId);
  q = q.order('date', { ascending: false });
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function updateInteraction(id, patch) {
  const { data, error } = await supabase
    .from('personal_interactions')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteInteraction(id) {
  const { error } = await supabase.from('personal_interactions').delete().eq('id', id);
  if (error) throw error;
}

// ─── Goals ───────────────────────────────────────────────────────

export async function listGoals(userId, { status = 'active' } = {}) {
  let q = supabase.from('personal_goals').select('*').eq('user_id', userId);
  if (status) q = q.eq('status', status);
  q = q.order('created_at', { ascending: false });
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function addGoal(userId, payload) {
  const { data, error } = await supabase
    .from('personal_goals')
    .insert({ ...payload, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateGoal(id, patch) {
  const { data, error } = await supabase
    .from('personal_goals')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteGoal(id) {
  const { error } = await supabase.from('personal_goals').delete().eq('id', id);
  if (error) throw error;
}

// ─── Learning + library ──────────────────────────────────────────

export async function listLearning(userId, { sinceDate } = {}) {
  let q = supabase.from('personal_learning_log').select('*').eq('user_id', userId);
  if (sinceDate) q = q.gte('date', sinceDate);
  q = q.order('date', { ascending: false });
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function addLearning(userId, payload) {
  const { data, error } = await supabase
    .from('personal_learning_log')
    .insert({ ...payload, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  // Activity log
  try {
    await supabase.from('activity_log').insert({
      user_id: userId, action_type: 'learning', category: 'growth',
      details: { topic: payload.topic, minutes: payload.duration_minutes },
    });
  } catch {}
  return data;
}

export async function updateLearning(id, patch) {
  const { data, error } = await supabase
    .from('personal_learning_log')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteLearning(id) {
  const { error } = await supabase.from('personal_learning_log').delete().eq('id', id);
  if (error) throw error;
}

export async function listLibrary(userId) {
  const { data, error } = await supabase
    .from('personal_library')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function addLibraryItem(userId, payload) {
  const { data, error } = await supabase
    .from('personal_library')
    .insert({ ...payload, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateLibraryItem(id, patch) {
  const { data, error } = await supabase
    .from('personal_library')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteLibraryItem(id) {
  const { error } = await supabase.from('personal_library').delete().eq('id', id);
  if (error) throw error;
}

// ─── Personal training log ───────────────────────────────────────

export async function listTrainingLog(userId, { limit = 60 } = {}) {
  const { data, error } = await supabase
    .from('personal_training_log')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function addTrainingEntry(userId, payload) {
  const { data, error } = await supabase
    .from('personal_training_log')
    .insert({ ...payload, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  try {
    await supabase.from('activity_log').insert({
      user_id: userId, action_type: 'personal_training', category: 'health',
      details: { type: payload.training_type, minutes: payload.duration_minutes },
    });
  } catch {}
  return data;
}

export async function updateTrainingEntry(id, patch) {
  const { data, error } = await supabase
    .from('personal_training_log')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTrainingEntry(id) {
  const { error } = await supabase.from('personal_training_log').delete().eq('id', id);
  if (error) throw error;
}

// ─── Meals + plan + shopping ─────────────────────────────────────

export async function listMeals(userId, { sinceDate } = {}) {
  let q = supabase.from('personal_meals').select('*').eq('user_id', userId);
  if (sinceDate) q = q.gte('date', sinceDate);
  q = q.order('date', { ascending: false });
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function addMeal(userId, payload) {
  const { data, error } = await supabase
    .from('personal_meals')
    .insert({ ...payload, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateMeal(id, patch) {
  const { data, error } = await supabase
    .from('personal_meals')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteMeal(id) {
  const { error } = await supabase.from('personal_meals').delete().eq('id', id);
  if (error) throw error;
}

export async function listMealPlan(userId, weekStart) {
  let q = supabase.from('personal_meal_plan').select('*').eq('user_id', userId);
  if (weekStart) q = q.eq('week_start', weekStart);
  q = q.order('day_of_week').order('meal_type');
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function upsertMealPlanEntry(userId, payload) {
  const { data, error } = await supabase
    .from('personal_meal_plan')
    .insert({ ...payload, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteMealPlanEntry(id) {
  const { error } = await supabase.from('personal_meal_plan').delete().eq('id', id);
  if (error) throw error;
}

export async function listShopping(userId) {
  const { data, error } = await supabase
    .from('personal_shopping_list')
    .select('*')
    .eq('user_id', userId)
    .order('is_bought')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function addShoppingItem(userId, payload) {
  const { data, error } = await supabase
    .from('personal_shopping_list')
    .insert({ ...payload, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function toggleShoppingItem(id, current) {
  const { data, error } = await supabase
    .from('personal_shopping_list')
    .update({ is_bought: !current })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateShoppingItem(id, patch) {
  const { data, error } = await supabase
    .from('personal_shopping_list')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteShoppingItem(id) {
  const { error } = await supabase.from('personal_shopping_list').delete().eq('id', id);
  if (error) throw error;
}

export async function clearBoughtShopping(userId) {
  const { error } = await supabase
    .from('personal_shopping_list')
    .delete()
    .eq('user_id', userId)
    .eq('is_bought', true);
  if (error) throw error;
}

// ─── Household ───────────────────────────────────────────────────

export async function listHouseholdTasks(userId) {
  const { data, error } = await supabase
    .from('personal_household_tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('frequency');
  if (error) throw error;
  return data || [];
}

export async function addHouseholdTask(userId, payload) {
  const { data, error } = await supabase
    .from('personal_household_tasks')
    .insert({ ...payload, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateHouseholdTask(id, patch) {
  const { data, error } = await supabase
    .from('personal_household_tasks')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// History of completed household tasks. Optionally scoped to a single
// task_id; otherwise returns the latest `limit` completions.
export async function listHouseholdLogs(userId, { taskId, sinceDate, limit = 60 } = {}) {
  let q = supabase.from('personal_household_log').select('*').eq('user_id', userId);
  if (taskId) q = q.eq('task_id', taskId);
  if (sinceDate) q = q.gte('date', sinceDate);
  q = q.order('date', { ascending: false }).limit(limit);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function deleteHouseholdTask(id) {
  const { error } = await supabase.from('personal_household_tasks').delete().eq('id', id);
  if (error) throw error;
}

// Mark a household task done. Updates last_done + next_due based on
// frequency; logs into personal_household_log.
export async function markHouseholdDone(userId, task) {
  const today = todayISO();
  const freqDays = {
    daily: 1, every_2_days: 2, every_3_days: 3,
    twice_weekly: 3, weekly: 7, biweekly: 14, monthly: 30,
  };
  const days = freqDays[task.frequency] || 7;
  const next = new Date();
  next.setDate(next.getDate() + days);

  await supabase.from('personal_household_log').insert({
    user_id: userId, task_id: task.id, date: today,
    completed: true, duration_minutes: task.duration_minutes || null,
  });
  const { data, error } = await supabase
    .from('personal_household_tasks')
    .update({ last_done: today, next_due: next.toISOString().slice(0, 10) })
    .eq('id', task.id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
