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

  // Cross-app sync: bump monthly_sales on the matching revenue_stream
  // inside business_plan.revenue_streams JSONB, and log activity. Best
  // effort — failures don't block the income save.
  try {
    if (payload.product) {
      const productToStreamName = {
        dream_machine:    'Dream Machine',
        speed_rope:       'Speed Rope',
        freestyle_rope:   'Freestyle Rope',
        rings:            'Gymnastic Rings',
        resistance_bands: 'Resistance Bands',
        parallettes:      'Parallettes',
        personal_training: 'אימון אישי',
        online_coaching:  'ליווי אונליין',
        workshop:         'סדנאות',
        digital_course:   'קורסים דיגיטליים',
      };
      const streamName = productToStreamName[payload.product];
      if (streamName) {
        const { data: plan } = await supabase
          .from('business_plan')
          .select('id, revenue_streams')
          .eq('user_id', userId)
          .eq('status', 'active')
          .order('version', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (plan?.id && Array.isArray(plan.revenue_streams)) {
          const next = plan.revenue_streams.map(s =>
            s.name === streamName
              ? { ...s, monthly_sales: (Number(s.monthly_sales) || 0) + 1 }
              : s
          );
          await supabase
            .from('business_plan')
            .update({ revenue_streams: next, updated_at: new Date().toISOString() })
            .eq('id', plan.id);
        }
      }
    }
    await supabase.from('activity_log').insert({
      user_id: userId,
      action_type: 'income_added',
      category: payload.source || 'sales',
      revenue_generated: Number(payload.amount || 0),
      details: { product: payload.product, source: payload.source },
    });
  } catch (err) {
    console.warn('[addIncome] cross-app sync failed:', err?.message);
  }
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

  // Cross-app sync: completed tasks feed into momentum/heatmap and
  // nudge the streak forward.
  if (status === 'completed' && data?.user_id) {
    try {
      await supabase.from('activity_log').insert({
        user_id: data.user_id,
        action_type: 'task_completed',
        category: data.category || 'general',
        details: { task_id: id, title: data.title, xp: data.xp_reward },
      });
    } catch (err) {
      console.warn('[updateTaskStatus] activity log failed:', err?.message);
    }
  }
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

// ─── Trainee → Lead mirror ────────────────────────────────────────
// When a coach adds a brand-new trainee from the pro app, mirror them
// into the leads table as `converted` so they show up in the growth
// app's history. Idempotent on (user_id, name+phone).
export async function recordTraineeAsConvertedLead(coachUserId, trainee) {
  if (!coachUserId || !trainee?.full_name) return null;
  const phone = trainee.phone || '';
  const { data: existing } = await supabase
    .from('leads')
    .select('id')
    .eq('user_id', coachUserId)
    .eq('name', trainee.full_name)
    .eq('phone', phone)
    .maybeSingle();
  if (existing?.id) return existing;
  const { data, error } = await supabase
    .from('leads')
    .insert({
      user_id: coachUserId,
      name: trainee.full_name,
      phone,
      email: trainee.email || null,
      source: 'walk_in',
      status: 'converted',
      converted_at: new Date().toISOString(),
      notes: 'נוצר אוטומטית כשהמתאמן נוסף ב-Dashboard',
    })
    .select()
    .single();
  if (error) {
    console.warn('[recordTraineeAsConvertedLead] failed:', error.message);
    return null;
  }
  return data;
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

  // Cross-app sync: a lead just turned into "converted" with a known
  // revenue_if_converted → push the matching income row into the
  // financial app, plus an activity_log entry. Idempotent: we only
  // fire when the patch flips status=converted (we don't re-fire on
  // edits to an already-converted lead).
  if (patch?.status === 'converted' && data?.user_id && Number(data.revenue_if_converted) > 0) {
    try {
      // Map the lead's interest to an income source.
      const interestToSource = {
        online_coaching: 'online_coaching',
        course:          'course',
        workshop:        'workshop',
        coaching:        'training',
      };
      const source = interestToSource[data.interested_in] || 'product_sale';
      await supabase.from('income').insert({
        user_id: data.user_id,
        amount: Number(data.revenue_if_converted),
        source,
        product: data.interested_in || null,
        client_name: data.name || null,
        description: `נסגר מליד: ${data.name || ''}`,
        date: new Date().toISOString().slice(0, 10),
      });
      await supabase.from('activity_log').insert({
        user_id: data.user_id,
        action_type: 'lead_converted',
        category: 'sales',
        revenue_generated: Number(data.revenue_if_converted),
        details: { lead_id: id, name: data.name, product: data.interested_in },
      });
    } catch (err) {
      console.warn('[updateLead] cross-app sync failed:', err?.message);
    }
  }
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

  // Cross-app sync: log when content actually goes live so it counts
  // toward the financial dashboard's streak / weekly score.
  if (patch?.status === 'published' && data?.user_id) {
    try {
      await supabase.from('activity_log').insert({
        user_id: data.user_id,
        action_type: 'content_published',
        category: 'content',
        details: {
          content_id: id, title: data.title,
          platform: data.platform, content_type: data.content_type,
        },
      });
    } catch (err) {
      console.warn('[updateContentItem] activity log failed:', err?.message);
    }
  }
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
