// ═══════════════════════════════════════════════════════════════════
// Personal tab — Stage 1 data layer
// ═══════════════════════════════════════════════════════════════════
// Everything the day/board screens need beyond focus_nodes: per-execution
// logging, modes, the day's declared capacity, user-defined doc fields and the
// quick-capture inbox. Tables come from
// migrations/2026-07-25-personal-stage1.sql; RLS is owner-only on all of them.
//
// focus_task_logs is NOT replaced. It stays the one-row-per-day done/skipped
// record the matrix reads (UNIQUE (node_id, log_date)); focus_executions is the
// append-only history where two executions of one habit on one day are two
// rows. Every doc save writes BOTH.
// ═══════════════════════════════════════════════════════════════════

import { supabase } from '@/lib/supabaseClient';
import {
  isoDate, addDays, createNode, updateNode, fetchNodes, indexNodes,
  BOARD_TAG, BANK_TAG, PERSONAL_ARM_TITLE,
} from './focus-api';

// ─── focus_executions ─────────────────────────────────────────────
export async function fetchExecutions(userId, from, to = isoDate()) {
  const { data, error } = await supabase
    .from('focus_executions')
    .select('id, node_id, bank_item_id, day, started_at, ended_at, minutes, what_happened, satisfaction, improve_next, skipped_reason, custom')
    .eq('user_id', userId)
    .gte('day', from)
    .lte('day', to)
    .order('created_at', { ascending: true });
  if (error) return [];              // table missing → screens degrade, never crash
  return data || [];
}

// Append ONE execution. Never an upsert: a second execution of the same habit
// on the same day is a second row, by design.
export async function addExecution(userId, fields = {}) {
  const row = {
    user_id: userId,
    node_id: fields.node_id,
    bank_item_id: fields.bank_item_id || null,
    day: fields.day || isoDate(),
    started_at: fields.started_at || null,
    ended_at: fields.ended_at || null,
    minutes: fields.minutes ?? null,
    what_happened: fields.what_happened || null,
    satisfaction: fields.satisfaction ?? null,
    improve_next: fields.improve_next || null,
    skipped_reason: fields.skipped_reason || null,
    custom: fields.custom || {},
  };
  const { data, error } = await supabase.from('focus_executions').insert([row]).select().single();
  if (error) throw error;
  return data;
}

export async function deleteExecution(id) {
  const { error } = await supabase.from('focus_executions').delete().eq('id', id);
  if (error) throw error;
}

// Last execution day per BRANCH — feeds the priority engine's domainBoost.
export function lastExecByBranch(executions = [], nodes = []) {
  const { byId } = indexNodes(nodes);
  const branchOf = (nodeId) => {
    let cur = byId[nodeId], guard = 0;
    while (cur && guard++ < 50) {
      const p = byId[cur.parent_id];
      if (!p) return null;
      if (p.node_type !== 'task' && p.title === PERSONAL_ARM_TITLE) return cur.id;  // cur is the branch
      cur = p;
    }
    return null;
  };
  const out = {};
  executions.forEach(e => {
    const b = branchOf(e.node_id);
    if (!b) return;
    const d = String(e.day).slice(0, 10);
    if (!out[b] || d > out[b]) out[b] = d;
  });
  return out;
}

// The branch (child of the personal arm) a node sits under, by id.
export function branchIdOfFactory(nodes = []) {
  const { byId } = indexNodes(nodes);
  const arm = nodes.find(n => n.node_type !== 'task' && n.title === PERSONAL_ARM_TITLE);
  return (node) => {
    let cur = node, guard = 0;
    while (cur && guard++ < 50) {
      if (arm && cur.parent_id === arm.id) return cur.id;
      cur = byId[cur.parent_id];
    }
    return null;
  };
}

// ─── focus_modes ──────────────────────────────────────────────────
export async function fetchModes(userId) {
  const { data, error } = await supabase
    .from('focus_modes')
    .select('id, name, main_node_id, ramp_node_ids, sort_order, active')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true });
  if (error) return [];
  return (data || []).filter(m => m.active !== false);
}

export async function addMode(userId, { name, main_node_id = null, ramp_node_ids = [], sort_order = 100 }) {
  const { data, error } = await supabase
    .from('focus_modes')
    .insert([{ user_id: userId, name: String(name || '').trim(), main_node_id, ramp_node_ids, sort_order }])
    .select().single();
  if (error) throw error;
  return data;
}
export async function updateMode(id, patch) {
  const { error } = await supabase.from('focus_modes').update(patch).eq('id', id);
  if (error) throw error;
}
export async function deleteMode(id) {
  const { error } = await supabase.from('focus_modes').delete().eq('id', id);
  if (error) throw error;
}
export const rampIds = (mode) => {
  const r = mode?.ramp_node_ids;
  if (Array.isArray(r)) return r.map(String);
  if (typeof r === 'string') { try { return (JSON.parse(r) || []).map(String); } catch { return []; } }
  return [];
};

// ─── focus_day_state ──────────────────────────────────────────────
export async function fetchDayState(userId, day = isoDate()) {
  const { data, error } = await supabase
    .from('focus_day_state')
    .select('id, day, capacity, active_mode_id, moves_done')
    .eq('user_id', userId).eq('day', day).maybeSingle();
  if (error) return null;
  return data || null;
}

export async function fetchDayStates(userId, from, to = isoDate()) {
  const { data, error } = await supabase
    .from('focus_day_state')
    .select('day, capacity, active_mode_id, moves_done')
    .eq('user_id', userId).gte('day', from).lte('day', to);
  if (error) return [];
  return data || [];
}

// One row per (user, day) — the table's unique key makes this an upsert.
export async function saveDayState(userId, day, patch = {}) {
  const { data, error } = await supabase
    .from('focus_day_state')
    .upsert([{ user_id: userId, day, ...patch }], { onConflict: 'user_id,day' })
    .select().single();
  if (error) throw error;
  return data;
}

// ─── focus_custom_fields ──────────────────────────────────────────
export async function fetchCustomFields(userId) {
  const { data, error } = await supabase
    .from('focus_custom_fields')
    .select('id, label, field_type, options, sort_order')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true });
  if (error) return [];
  return data || [];
}
export async function addCustomField(userId, { label, field_type = 'text', options = [], sort_order = 100 }) {
  const { data, error } = await supabase
    .from('focus_custom_fields')
    .insert([{ user_id: userId, label: String(label || '').trim(), field_type, options, sort_order }])
    .select().single();
  if (error) throw error;
  return data;
}
export async function deleteCustomField(id) {
  const { error } = await supabase.from('focus_custom_fields').delete().eq('id', id);
  if (error) throw error;
}
export const CUSTOM_FIELD_TYPES = [
  { key: 'text', label: 'טקסט' },
  { key: 'number', label: 'מספר' },
  { key: 'scale', label: 'סקאלה 1-5' },
  { key: 'date', label: 'תאריך' },
  { key: 'select', label: 'בחירה מרשימה' },
];

// ─── focus_capture (quick ideas) ──────────────────────────────────
export async function addCapture(userId, line) {
  const t = String(line || '').trim();
  if (!t) return null;
  const { data, error } = await supabase
    .from('focus_capture').insert([{ user_id: userId, line: t }]).select().single();
  if (error) throw error;
  return data;
}
export async function fetchCapture(userId, { onlyUnsorted = true } = {}) {
  let q = supabase.from('focus_capture')
    .select('id, line, sorted, created_at')
    .eq('user_id', userId).order('created_at', { ascending: false });
  if (onlyUnsorted) q = q.eq('sorted', false);
  const { data, error } = await q;
  if (error) return [];
  return data || [];
}
export async function markCaptureSorted(id) {
  const { error } = await supabase.from('focus_capture').update({ sorted: true }).eq('id', id);
  if (error) throw error;
}

// ═══════════════════════════════════════════════════════════════════
// Extensibility — every structural add/change the UI offers
// ═══════════════════════════════════════════════════════════════════

// Defaults so a fast add stays one tap.
export const HABIT_DEFAULTS = {
  task_kind: 'recurring',
  measure_mode: 'count',
  weekly_target: 1,
  life_impact: 3,
  net_minutes: 30,
  due_date: null,
  success_criteria: '',
  first_step: '',
};

// A branch directly under the personal arm, optionally with its cycle goal.
export async function addBranch(userId, armId, { title, goal = '', metric_target = null, metric_unit = '', cycle_start = null, cycle_end = null, sort_order = 100 }) {
  const t = String(title || '').trim();
  if (!t || !armId) return null;
  return createNode(userId, {
    parent_id: armId, node_type: 'branch', title: t,
    note: goal || null,
    metric_target: metric_target === '' ? null : metric_target,
    metric_unit: metric_unit || null,
    metric_current: 0,
    cycle_start, cycle_end, sort_order,
  });
}

// A habit (recurring) or a one-off, under a branch. A recurring habit also gets
// frequency 'daily' + the board tag + the mirrored w:N tag, which is what makes
// the EXISTING matrix render it with correct weekly-N maths.
export async function addTask(userId, branchId, fields = {}) {
  const f = { ...HABIT_DEFAULTS, ...fields };
  const title = String(f.title || '').trim();
  if (!title || !branchId) return null;
  const oneoff = f.task_kind === 'oneoff';
  const target = Math.max(1, Number(f.weekly_target || 1));
  const tags = [BOARD_TAG];
  if (!oneoff) tags.push(`w:${target}`);
  return createNode(userId, {
    parent_id: branchId,
    node_type: 'task',
    title,
    frequency: oneoff ? null : 'daily',
    tags,
    task_kind: oneoff ? 'oneoff' : 'recurring',
    measure_mode: f.measure_mode === 'days' ? 'days' : 'count',
    weekly_target: target,
    life_impact: Math.max(1, Math.min(5, Number(f.life_impact || 3))),
    net_minutes: Math.max(0, Number(f.net_minutes ?? 30)),
    due_date: f.due_date || null,
    success_criteria: f.success_criteria || null,
    first_step: f.first_step || null,
    is_fear_task: !!f.is_fear_task,
    sort_order: Number(f.sort_order || 100),
  });
}

// A bank item: child of a habit, the existing 'בנק' tag, no frequency.
export async function addBankItemTo(userId, habitId, title, sortOrder = 100) {
  const t = String(title || '').trim();
  if (!t || !habitId) return null;
  return createNode(userId, {
    parent_id: habitId, node_type: 'task', title: t,
    tags: [BANK_TAG], sort_order: sortOrder,
  });
}

// ── Promote / demote, without losing executions ───────────────────
// Both operations only ever UPDATE the node (parent/tags/frequency), never
// delete and recreate, so focus_executions and focus_task_logs rows — which
// reference node_id — stay attached.
export async function promoteBankItemToHabit(userId, item, branchId, opts = {}) {
  const f = { ...HABIT_DEFAULTS, ...opts };
  const target = Math.max(1, Number(f.weekly_target || 1));
  const tags = [...new Set([...(item.tags || []).filter(t => t !== BANK_TAG), BOARD_TAG, `w:${target}`])];
  return updateNode(item.id, {
    parent_id: branchId || item.parent_id,
    frequency: 'daily',
    tags,
    task_kind: 'recurring',
    measure_mode: f.measure_mode === 'days' ? 'days' : 'count',
    weekly_target: target,
    life_impact: Math.max(1, Math.min(5, Number(f.life_impact || 3))),
    net_minutes: Math.max(0, Number(f.net_minutes ?? 30)),
  });
}

export async function demoteHabitToBankItem(habit, parentHabitId) {
  const tags = [...new Set([
    ...(habit.tags || []).filter(t => t !== BOARD_TAG && !/^w:\d+$/.test(t)),
    BANK_TAG,
  ])];
  return updateNode(habit.id, {
    parent_id: parentHabitId || habit.parent_id,
    frequency: null,
    tags,
  });
}

// defer_count++ , and at DEFER_COURAGE_AT it flips is_fear_task (the schema's
// "courage" flag) so the day screen can ask for a ten-minute first step.
export async function deferTask(node, { courageAt = 3 } = {}) {
  const next = Number(node.defer_count || 0) + 1;
  const patch = { defer_count: next };
  if (next >= courageAt) patch.is_fear_task = true;
  await updateNode(node.id, patch);
  return { defer_count: next, is_fear_task: patch.is_fear_task ?? !!node.is_fear_task };
}

export async function setFirstStep(nodeId, firstStep) {
  return updateNode(nodeId, { first_step: String(firstStep || '').trim() || null });
}

// ─── One-shot loader for the day/board screens ────────────────────
export async function loadPersonalDay(userId, { day = isoDate(), historyDays = 120 } = {}) {
  const from = addDays(day, -historyDays);
  const [nodes, executions, modes, dayState, dayStates, customFields] = await Promise.all([
    fetchNodes(userId),
    fetchExecutions(userId, from, day),
    fetchModes(userId),
    fetchDayState(userId, day),
    fetchDayStates(userId, from, day),
    fetchCustomFields(userId),
  ]);
  return { nodes, executions, modes, dayState, dayStates, customFields };
}
