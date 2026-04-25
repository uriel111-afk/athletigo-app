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

// ─────────────────────────────────────────────────────────────────
// Cross-app sync helpers — keep the financial app and the coach app
// in step. Each helper is idempotent: it checks for an existing row
// before inserting so calling it twice never duplicates data.
// ─────────────────────────────────────────────────────────────────

// (1) New package or product sale on the coach side → auto-add to income.
//     Idempotent on (user_id, client_name, date, amount).
export async function syncPackageToIncome(userId, pkg) {
  if (!userId || !pkg) return null;
  const amount = Number(pkg.final_price ?? pkg.price ?? 0);
  if (amount <= 0) return null;
  const date = (pkg.start_date || pkg.created_at || new Date().toISOString()).slice(0, 10);
  const clientName = pkg.trainee_name || pkg.client_name || null;
  // Map coach package types → financial source enum.
  const typ = (pkg.service_type || pkg.package_type || '').toString();
  const source = typ.includes('קבוצ') ? 'training'
               : typ.includes('אונליין') || typ.includes('online') ? 'online_coaching'
               : typ.includes('סדנה') || typ.includes('workshop') ? 'workshop'
               : typ.includes('קורס') || typ.includes('course') ? 'course'
               : typ.includes('מוצר') || typ.includes('product') ? 'product_sale'
               : 'training';
  // Dup check
  const { data: existing } = await supabase
    .from('income')
    .select('id')
    .eq('user_id', userId)
    .eq('amount', amount)
    .eq('date', date)
    .eq('client_name', clientName)
    .maybeSingle();
  if (existing?.id) {
    console.log('[syncPackageToIncome] dup skipped:', existing.id);
    return existing;
  }
  console.log('[syncPackageToIncome] inserting:', { amount, source, clientName, date });
  const { data, error } = await supabase.from('income').insert({
    user_id: userId,
    amount,
    source,
    product: pkg.package_name || pkg.product || null,
    client_name: clientName,
    description: `מכירה: ${pkg.package_name || pkg.product || ''}`.trim(),
    date,
  }).select().maybeSingle();
  if (error) console.warn('[syncPackageToIncome] failed:', error.message);
  return data || null;
}

// One-shot historical backfill. Walks every client_services row owned
// by the coach and runs syncPackageToIncome on each. The dup check
// inside syncPackageToIncome makes this safe to run repeatedly. Used
// by the "סנכרן נתונים היסטוריים" button in LifeOSSettings to bring
// pre-Life-OS package sales into the income table so the financial
// dashboard and the professional Reports screen show the same totals.
//
// Returns { scanned, inserted, skipped, errors }.
export async function syncHistoricalData(coachId) {
  if (!coachId) return { scanned: 0, inserted: 0, skipped: 0, errors: 0 };

  const { data: pkgs, error } = await supabase
    .from('client_services')
    .select(`
      id, trainee_id, package_name, package_type, service_type,
      final_price, payment_method, start_date, created_at,
      trainee:trainee_id(full_name)
    `)
    .eq('coach_id', coachId);
  if (error) throw error;

  let inserted = 0, skipped = 0, errors = 0;
  for (const pkg of (pkgs || [])) {
    const enriched = { ...pkg, trainee_name: pkg.trainee?.full_name || null };
    try {
      // Dup check inside syncPackageToIncome: any existing income row
      // matching (user_id, amount, date, client_name) is treated as
      // already-synced. We classify the result by checking whether it
      // returned an existing row vs a freshly inserted one.
      const before = await supabase
        .from('income').select('id', { head: true, count: 'exact' })
        .eq('user_id', coachId)
        .eq('amount', Number(pkg.final_price || 0))
        .eq('date', (pkg.start_date || pkg.created_at || '').slice(0, 10))
        .eq('client_name', enriched.trainee_name);
      const existedBefore = (before.count || 0) > 0;

      const result = await syncPackageToIncome(coachId, enriched);
      if (!result) { errors += 1; continue; }
      if (existedBefore) skipped += 1;
      else inserted += 1;
    } catch (err) {
      console.warn('[syncHistoricalData] row failed:', pkg.id, err?.message);
      errors += 1;
    }
  }

  // Refresh the active business plan's monthly revenue so the goal
  // chart on /lifeos catches the freshly imported rows.
  try { await syncCurrentMonthlyRevenue(coachId); } catch (_) {}

  return { scanned: pkgs?.length || 0, inserted, skipped, errors };
}

// (2) New trainee user (role=trainee) → auto-add converted lead.
//     Idempotent on (coach_id, full_name, status='converted').
export async function syncTraineeToLead(coachId, trainee) {
  if (!coachId || !trainee?.full_name) return null;
  const { data: existing } = await supabase
    .from('leads')
    .select('id')
    .eq('coach_id', coachId)
    .eq('full_name', trainee.full_name)
    .eq('status', 'converted')
    .maybeSingle();
  if (existing?.id) {
    console.log('[syncTraineeToLead] dup skipped:', existing.id);
    return existing;
  }
  console.log('[syncTraineeToLead] inserting:', trainee.full_name);
  const baseRow = {
    coach_id: coachId,
    full_name: trainee.full_name,
    phone: trainee.phone || null,
    email: trainee.email || null,
    status: 'converted',
    source: 'app',
  };
  let { data, error } = await supabase
    .from('leads')
    .insert({ ...baseRow, converted_at: new Date().toISOString() })
    .select()
    .maybeSingle();
  if (error && /column .* does not exist/i.test(error.message || '')) {
    ({ data, error } = await supabase.from('leads').insert(baseRow).select().maybeSingle());
  }
  if (error) console.warn('[syncTraineeToLead] failed:', error.message);
  return data || null;
}

// (3) Bump funnel_tracking purchase counter when a lead converts.
export async function syncFunnelOnConversion(userId, productLabel) {
  if (!userId || !productLabel) return;
  try {
    const { data: row } = await supabase
      .from('funnel_tracking')
      .select('id, contact_count')
      .eq('user_id', userId)
      .eq('product', productLabel)
      .eq('stage', 'purchase')
      .maybeSingle();
    if (row?.id) {
      await supabase
        .from('funnel_tracking')
        .update({ contact_count: (Number(row.contact_count) || 0) + 1 })
        .eq('id', row.id);
    } else {
      await supabase.from('funnel_tracking').insert({
        user_id: userId, product: productLabel,
        stage: 'purchase', contact_count: 1,
      });
    }
  } catch (e) {
    console.warn('[syncFunnelOnConversion] failed:', e?.message);
  }
}

// (4) Recompute business_plan.current_monthly_revenue from this
//     month's income rows. Best-effort; column may not exist.
export async function syncCurrentMonthlyRevenue(userId) {
  if (!userId) return;
  try {
    const { start, end } = monthRange(new Date());
    const { data: rows } = await supabase
      .from('income')
      .select('amount')
      .eq('user_id', userId)
      .gte('date', start)
      .lte('date', end);
    const total = (rows || []).reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const { data: plan } = await supabase
      .from('business_plan')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (plan?.id) {
      const { error } = await supabase
        .from('business_plan')
        .update({ current_monthly_revenue: total })
        .eq('id', plan.id);
      if (error && error.code !== '42703') {
        // 42703 = column doesn't exist; silently skip if so
        console.warn('[syncCurrentMonthlyRevenue] update failed:', error.message);
      }
    }
  } catch (e) {
    console.warn('[syncCurrentMonthlyRevenue] failed:', e?.message);
  }
}

// Convenience wrapper — call this from any place that mutates a
// cross-app entity. The `kind` argument picks which sub-sync to run.
export async function syncCrossApp(kind, userId, payload) {
  switch (kind) {
    case 'package':       return syncPackageToIncome(userId, payload);
    case 'trainee':       return syncTraineeToLead(userId, payload);
    case 'funnel':        return syncFunnelOnConversion(userId, payload);
    case 'monthly':       return syncCurrentMonthlyRevenue(userId);
    default:
      console.warn('[syncCrossApp] unknown kind:', kind);
  }
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
    // Refresh current_monthly_revenue on the active business_plan
    syncCurrentMonthlyRevenue(userId);
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

export async function deleteRecurring(id) {
  const { error } = await supabase.from('recurring_payments').delete().eq('id', id);
  if (error) throw error;
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

export async function deleteInstallment(id) {
  const { error } = await supabase.from('installments').delete().eq('id', id);
  if (error) throw error;
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

export async function updateDocument(id, patch) {
  const { data, error } = await supabase
    .from('documents')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteDocument(id) {
  const { error } = await supabase.from('documents').delete().eq('id', id);
  if (error) throw error;
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

export async function updateTask(id, patch) {
  const { data, error } = await supabase
    .from('life_os_tasks')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTask(id) {
  const { error } = await supabase.from('life_os_tasks').delete().eq('id', id);
  if (error) throw error;
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

// `recordTraineeAsConvertedLead` was a duplicate of `syncTraineeToLead`
// from when two windows worked in parallel — both inserted into leads
// with status='converted'. The canonical implementation is
// syncTraineeToLead (line 137). Keep this alias for any old caller
// that imports the old name; it just forwards.
export const recordTraineeAsConvertedLead = (coachId, trainee) =>
  syncTraineeToLead(coachId, trainee);

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

// `userId` here is actually the coach_id — the legacy `leads` table
// is keyed by coach_id, not user_id. We accept the same arg name to
// avoid churn at every call site.
export async function listLeads(userId, { status } = {}) {
  let q = supabase.from('leads').select('*').eq('coach_id', userId);
  if (status) q = q.eq('status', status);
  q = q.order('created_at', { ascending: false });
  const { data, error } = await q;
  if (error) throw error;
  // Normalize: surface `name` (used by Wave-2 UI) from `full_name`.
  return (data || []).map(r => ({ ...r, name: r.full_name || r.name }));
}

export async function addLead(userId, payload) {
  // Translate Wave-2 field names → legacy schema.
  const row = { ...payload, coach_id: userId };
  if (payload.name && !payload.full_name) row.full_name = payload.name;
  delete row.name;
  delete row.user_id;
  const { data, error } = await supabase
    .from('leads')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return { ...data, name: data.full_name || data.name };
}

export async function updateLead(id, patch) {
  // Translate `name` → `full_name` and strip `user_id` if a caller
  // accidentally passes Wave-2 field names.
  const row = { ...patch };
  if (patch.name && !patch.full_name) row.full_name = patch.name;
  delete row.name;
  delete row.user_id;
  const { data, error } = await supabase
    .from('leads')
    .update(row)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;

  // Cross-app sync: a lead just turned into "converted" with a known
  // revenue_if_converted → push the matching income row into the
  // financial app, plus an activity_log entry. coach_id is the lead's
  // owner here (legacy schema).
  if (patch?.status === 'converted' && data?.coach_id && Number(data.revenue_if_converted) > 0) {
    try {
      // Map the lead's interest to an income source.
      const interestToSource = {
        online_coaching: 'online_coaching',
        course:          'course',
        workshop:        'workshop',
        coaching:        'training',
      };
      const source = interestToSource[data.interested_in] || 'product_sale';
      const leadName = data.full_name || data.name || '';
      await supabase.from('income').insert({
        user_id: data.coach_id,
        amount: Number(data.revenue_if_converted),
        source,
        product: data.interested_in || null,
        client_name: leadName || null,
        description: `נסגר מליד: ${leadName}`,
        date: new Date().toISOString().slice(0, 10),
      });
      await supabase.from('activity_log').insert({
        user_id: data.coach_id,
        action_type: 'lead_converted',
        category: 'sales',
        revenue_generated: Number(data.revenue_if_converted),
        details: { lead_id: id, name: leadName, product: data.interested_in },
      });
      // Bump funnel_tracking purchase counter for the matching product
      const interestToFunnel = {
        online_coaching: 'ליווי אונליין',
        workshop:        'סדנאות',
        course:          'קורסים דיגיטליים',
        coaching:        'אימון אישי',
      };
      const funnelLabel = interestToFunnel[data.interested_in] || data.interested_in || null;
      // leads.coach_id is the owner — not user_id (which doesn't exist
      // on this legacy table). Both helpers expect the coach's auth uid.
      if (funnelLabel) await syncFunnelOnConversion(data.coach_id, funnelLabel);
      syncCurrentMonthlyRevenue(data.coach_id);
    } catch (err) {
      console.warn('[updateLead] cross-app sync failed:', err?.message);
    }
  }
  return data;
}

export async function deleteLead(id) {
  const { error } = await supabase.from('leads').delete().eq('id', id);
  if (error) throw error;
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
  // Cross-app sync — published content adds an activity_log row so
  // the AI brain + heatmap reflect it. Best-effort.
  if (data?.status === 'published') {
    try {
      const { syncContentToActivity } = await import('@/lib/lifeos/sync-engine');
      await syncContentToActivity(data);
    } catch (e) {
      console.warn('[addContentItem] content sync failed:', e?.message);
    }
  }
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

export async function deleteContentItem(id) {
  const { error } = await supabase.from('content_calendar').delete().eq('id', id);
  if (error) throw error;
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

export async function updateCommunityMetric(id, patch) {
  const { data, error } = await supabase
    .from('community_metrics')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCommunityMetric(id) {
  const { error } = await supabase.from('community_metrics').delete().eq('id', id);
  if (error) throw error;
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
