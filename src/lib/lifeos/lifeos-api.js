// ═══════════════════════════════════════════════════════════════════
// Life OS — Supabase API layer
// ═══════════════════════════════════════════════════════════════════
// Thin async helpers over the 11 Life OS tables. Every function
// accepts userId as the first arg so the caller can pass the coach's
// auth uid explicitly. All queries rely on Supabase RLS for row
// isolation, but we still scope by user_id on the client to keep
// queries fast and to avoid accidental cross-row reads during
// dev/testing.
// ═══════════════════════════════════════════════════════════════════

import { supabase } from '@/lib/supabaseClient';

// ─── Helpers ─────────────────────────────────────────────────────

const monthRange = (dateLike) => {
  const d = dateLike ? new Date(dateLike) : new Date();
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const iso = (x) => x.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
};

// ─── Expenses ────────────────────────────────────────────────────

export async function listExpenses(userId, { from, to, category } = {}) {
  let q = supabase.from('expenses').select('*').eq('user_id', userId);
  if (from) q = q.gte('date', from);
  if (to) q = q.lte('date', to);
  if (category) q = q.eq('category', category);
  q = q.order('date', { ascending: false });
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function listExpensesForMonth(userId, dateLike) {
  const { start, end } = monthRange(dateLike);
  return listExpenses(userId, { from: start, to: end });
}

export async function addExpense(userId, payload) {
  const { data, error } = await supabase
    .from('expenses')
    .insert({ ...payload, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateExpense(id, patch) {
  const { data, error } = await supabase
    .from('expenses')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteExpense(id) {
  const { error } = await supabase.from('expenses').delete().eq('id', id);
  if (error) throw error;
}

// ─── Income ──────────────────────────────────────────────────────

export async function listIncome(userId, { from, to, product } = {}) {
  let q = supabase.from('income').select('*').eq('user_id', userId);
  if (from) q = q.gte('date', from);
  if (to) q = q.lte('date', to);
  if (product) q = q.eq('product', product);
  q = q.order('date', { ascending: false });
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function listIncomeForMonth(userId, dateLike) {
  const { start, end } = monthRange(dateLike);
  return listIncome(userId, { from: start, to: end });
}

export async function addIncome(userId, payload) {
  const { data, error } = await supabase
    .from('income')
    .insert({ ...payload, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateIncome(id, patch) {
  const { data, error } = await supabase
    .from('income')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteIncome(id) {
  const { error } = await supabase.from('income').delete().eq('id', id);
  if (error) throw error;
}

// ─── Recurring payments ──────────────────────────────────────────

export async function listRecurring(userId, { onlyActive = false } = {}) {
  let q = supabase.from('recurring_payments').select('*').eq('user_id', userId);
  if (onlyActive) q = q.eq('is_active', true);
  q = q.order('category').order('name');
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function addRecurring(userId, payload) {
  const { data, error } = await supabase
    .from('recurring_payments')
    .insert({ ...payload, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateRecurring(id, patch) {
  const { data, error } = await supabase
    .from('recurring_payments')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Installments ────────────────────────────────────────────────

export async function listInstallments(userId) {
  const { data, error } = await supabase
    .from('installments')
    .select('*')
    .eq('user_id', userId)
    .order('end_date');
  if (error) throw error;
  return data || [];
}

export async function addInstallment(userId, payload) {
  const { data, error } = await supabase
    .from('installments')
    .insert({ ...payload, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateInstallment(id, patch) {
  const { data, error } = await supabase
    .from('installments')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Documents ───────────────────────────────────────────────────

export async function listDocuments(userId, { category } = {}) {
  let q = supabase.from('documents').select('*').eq('user_id', userId);
  if (category) q = q.eq('category', category);
  q = q.order('created_at', { ascending: false });
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function addDocument(userId, payload) {
  const { data, error } = await supabase
    .from('documents')
    .insert({ ...payload, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function uploadDocumentFile(file) {
  const ext = file.name.split('.').pop();
  const path = `life-os-docs/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage
    .from('media')
    .upload(path, file, { upsert: true });
  if (error) throw error;
  const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(path);
  return { file_url: publicUrl, file_size: file.size };
}

// ─── Tasks & Challenges ──────────────────────────────────────────

export async function listTasks(userId, { status, isChallenge } = {}) {
  let q = supabase.from('life_os_tasks').select('*').eq('user_id', userId);
  if (status) q = q.eq('status', status);
  if (typeof isChallenge === 'boolean') q = q.eq('is_challenge', isChallenge);
  q = q.order('created_at', { ascending: false });
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function addTask(userId, payload) {
  const { data, error } = await supabase
    .from('life_os_tasks')
    .insert({ ...payload, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function completeTask(id) {
  const { data, error } = await supabase
    .from('life_os_tasks')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTaskStatus(id, status) {
  const patch = { status };
  if (status === 'completed') patch.completed_at = new Date().toISOString();
  const { data, error } = await supabase
    .from('life_os_tasks')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Sum of XP earned from completed challenge tasks.
export async function getTotalXP(userId) {
  const { data, error } = await supabase
    .from('life_os_tasks')
    .select('xp_reward')
    .eq('user_id', userId)
    .eq('status', 'completed');
  if (error) throw error;
  return (data || []).reduce((sum, r) => sum + (r.xp_reward || 0), 0);
}

// ─── Activity log ────────────────────────────────────────────────

export async function listRecentActivity(userId, { limit = 20 } = {}) {
  const { data, error } = await supabase
    .from('activity_log')
    .select('*')
    .eq('user_id', userId)
    .order('logged_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function logActivity(userId, payload) {
  const { data, error } = await supabase
    .from('activity_log')
    .insert({ ...payload, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Business plan ───────────────────────────────────────────────

export async function getBusinessPlan(userId) {
  const { data, error } = await supabase
    .from('business_plan')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateBusinessPlan(id, patch) {
  const { data, error } = await supabase
    .from('business_plan')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Mentor messages ─────────────────────────────────────────────

export async function listMentorMessages(userId, { unreadOnly = false } = {}) {
  let q = supabase.from('mentor_messages').select('*').eq('user_id', userId);
  if (unreadOnly) q = q.eq('is_read', false);
  q = q.order('created_at', { ascending: false });
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

// Picks the highest-priority unread mentor message for the hero card.
export async function getFeaturedMentorMessage(userId) {
  const priorityRank = { critical: 4, high: 3, medium: 2, low: 1 };
  const messages = await listMentorMessages(userId, { unreadOnly: true });
  if (!messages.length) {
    // Fallback: just get the most recent regardless of read-state.
    const all = await listMentorMessages(userId);
    return all[0] || null;
  }
  return messages.sort(
    (a, b) => (priorityRank[b.priority] || 0) - (priorityRank[a.priority] || 0)
  )[0];
}

export async function markMentorMessageRead(id) {
  const { error } = await supabase
    .from('mentor_messages')
    .update({ is_read: true })
    .eq('id', id);
  if (error) throw error;
}

export async function markMentorMessageActedOn(id) {
  const { error } = await supabase
    .from('mentor_messages')
    .update({ is_acted_on: true, is_read: true })
    .eq('id', id);
  if (error) throw error;
}

// ─── Aggregate summaries (used by dashboard) ─────────────────────

// Returns { income, expenses, net } for the given month.
export async function getMonthlySummary(userId, dateLike) {
  const [incomeRows, expenseRows] = await Promise.all([
    listIncomeForMonth(userId, dateLike),
    listExpensesForMonth(userId, dateLike),
  ]);
  const sum = (rows) => rows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const income = sum(incomeRows);
  const expenses = sum(expenseRows);
  return { income, expenses, net: income - expenses, incomeRows, expenseRows };
}

// Returns annual income for the current year — used by the yearly
// goal progress bar on the dashboard.
export async function getAnnualIncome(userId, year = new Date().getFullYear()) {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const rows = await listIncome(userId, { from, to });
  return rows.reduce((s, r) => s + Number(r.amount || 0), 0);
}

// ─────────────────────────────────────────────────────────────────
// Leads
// ─────────────────────────────────────────────────────────────────

export async function listLeads(userId, { status } = {}) {
  let q = supabase.from('leads').select('*').eq('user_id', userId);
  if (status) q = q.eq('status', status);
  q = q.order('created_at', { ascending: false });
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function addLead(userId, payload) {
  const { data, error } = await supabase
    .from('leads')
    .insert({ ...payload, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateLead(id, patch) {
  const { data, error } = await supabase
    .from('leads')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─────────────────────────────────────────────────────────────────
// Content calendar
// ─────────────────────────────────────────────────────────────────

export async function listContentItems(userId, { status, fromDate, toDate } = {}) {
  let q = supabase.from('content_calendar').select('*').eq('user_id', userId);
  if (status) q = q.eq('status', status);
  if (fromDate) q = q.gte('scheduled_date', fromDate);
  if (toDate) q = q.lte('scheduled_date', toDate);
  q = q.order('scheduled_date', { ascending: false });
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function addContentItem(userId, payload) {
  const { data, error } = await supabase
    .from('content_calendar')
    .insert({ ...payload, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateContentItem(id, patch) {
  const { data, error } = await supabase
    .from('content_calendar')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─────────────────────────────────────────────────────────────────
// Community metrics
// ─────────────────────────────────────────────────────────────────

export async function listCommunityMetrics(userId, { platform, limit = 30 } = {}) {
  let q = supabase.from('community_metrics').select('*').eq('user_id', userId);
  if (platform) q = q.eq('platform', platform);
  q = q.order('date', { ascending: false }).limit(limit);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function addCommunityMetric(userId, payload) {
  const { data, error } = await supabase
    .from('community_metrics')
    .insert({ ...payload, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─────────────────────────────────────────────────────────────────
// Courses
// ─────────────────────────────────────────────────────────────────

export async function listCourses(userId, { status } = {}) {
  let q = supabase.from('courses').select('*').eq('user_id', userId);
  if (status) q = q.eq('status', status);
  q = q.order('created_at', { ascending: false });
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function addCourse(userId, payload) {
  const { data, error } = await supabase
    .from('courses')
    .insert({ ...payload, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCourse(id, patch) {
  const { data, error } = await supabase
    .from('courses')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
