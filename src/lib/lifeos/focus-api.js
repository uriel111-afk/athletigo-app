// ═══════════════════════════════════════════════════════════════════
// Focus Map (מפת מיקוד) — Supabase API + shared logic
// ═══════════════════════════════════════════════════════════════════
// Fetch the whole node tree once; build the hierarchy client-side.
// Every write scopes by user_id; RLS enforces isolation server-side.
// The `sessions` table is READ-ONLY here — never written.
// ═══════════════════════════════════════════════════════════════════

import { supabase } from '@/lib/supabaseClient';

// ─── Lumen tokens (feature-local so screens stay consistent) ──────
export const FOCUS = {
  bg: '#FBF3EA',
  card: '#FFFFFF',
  orange: '#FF6F20',
  orangeGrad: 'linear-gradient(135deg,#FF6F20,#FF8A42)',
  border: '#F0E4D0',
  ink: '#1a1a1a',
  muted: '#888888',
  edge: '#F0C9A8',
  edgeSel: '#D85A30',
  session: '#3B82F6',
  amber: '#EF9F27',
  red: '#E24B4A',
  neu: '4px 4px 10px rgba(200,180,150,0.4), -4px -4px 10px rgba(255,255,255,0.9)',
};

// ─── Urgency colours (everywhere a task renders) ──────────────────
export function urgencyStyle(node) {
  const p = Number(node?.priority || 0);
  let background = '#FFFFFF';
  let border = FOCUS.border;
  if (p === 2) { background = '#FCEBEB'; border = '#E24B4A'; }
  else if (p === 1) { background = '#FAEEDA'; border = '#EF9F27'; }
  const style = { background, border: `1px solid ${border}` };
  // Fear task keeps a red RIGHT accent on top of any colour.
  if (node?.is_fear_task) style.borderRight = '4px solid #E24B4A';
  return style;
}

// ─── Tag chip palette — hashed by tag name ────────────────────────
const TAG_PALETTE = [
  { bg: '#FFF0E4', fg: '#993C1D' },
  { bg: '#E1F5EE', fg: '#085041' },
  { bg: '#EEEDFE', fg: '#3C3489' },
  { bg: '#FBEAF0', fg: '#72243E' },
  { bg: '#E6F1FB', fg: '#0C447C' },
  { bg: '#FAEEDA', fg: '#633806' },
];
export function tagColor(tag) {
  const s = String(tag || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return TAG_PALETTE[h % TAG_PALETTE.length];
}

export const PRIORITY_CHIPS = [
  { value: 0, label: 'רגיל' },
  { value: 1, label: 'דחוף' },
  { value: 2, label: 'קריטי' },
];

export const HEB_DAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']; // 0=ראשון
export const HEB_DAYS_FULL = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

// ─── Date helpers (local, YYYY-MM-DD) ─────────────────────────────
export function isoDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return isoDate(d);
}
export function dowOf(iso) {
  return new Date(iso + 'T00:00:00').getDay();
}
export function hebrewDateLabel(iso = isoDate()) {
  try {
    return new Intl.DateTimeFormat('he-IL', {
      weekday: 'long', day: 'numeric', month: 'long',
    }).format(new Date(iso + 'T00:00:00'));
  } catch { return iso; }
}

// ═══════════════════════════════════════════════════════════════════
// Reads
// ═══════════════════════════════════════════════════════════════════
export async function fetchNodes(userId) {
  const { data, error } = await supabase
    .from('focus_nodes')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function fetchLogs(userId, from, to) {
  const { data, error } = await supabase
    .from('focus_task_logs')
    .select('node_id, log_date')
    .eq('user_id', userId)
    .gte('log_date', from)
    .lte('log_date', to);
  if (error) throw error;
  return data || [];
}

export async function fetchNotes(nodeId) {
  const { data, error } = await supabase
    .from('focus_node_notes')
    .select('*')
    .eq('node_id', nodeId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// Set of node ids that have at least one feed note (for the list icon).
export async function fetchNoteNodeIds(userId) {
  const { data, error } = await supabase
    .from('focus_node_notes')
    .select('node_id')
    .eq('user_id', userId);
  if (error) throw error;
  return new Set((data || []).map(r => r.node_id));
}

// ─── Cross-links (visual references only) ─────────────────────────
export async function fetchLinks(userId) {
  const { data, error } = await supabase
    .from('focus_node_links')
    .select('id, from_node, to_node')
    .eq('user_id', userId);
  if (error) throw error;
  return data || [];
}

export async function createLink(userId, fromNode, toNode) {
  // Links are undirected. Normalize the pair so (a,b) and (b,a) collapse
  // onto the same row via the UNIQUE(from_node,to_node) constraint.
  const [f, t] = fromNode < toNode ? [fromNode, toNode] : [toNode, fromNode];
  const { data, error } = await supabase
    .from('focus_node_links')
    .insert([{ user_id: userId, from_node: f, to_node: t }])
    .select()
    .maybeSingle();
  if (error) {
    if (error.code === '23505') return null; // already linked — fine
    throw error;
  }
  return data;
}

export async function deleteLink(id) {
  const { error } = await supabase.from('focus_node_links').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchIdeas(userId) {
  const { data, error } = await supabase
    .from('idea_inbox')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'inbox')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// Sessions for a date — READ ONLY. No PostgREST embeds: fetch trainee
// ids, then hydrate names from `users` (full_name) separately.
export async function fetchSessionsForDate(userId, dateIso) {
  // NOTE: the session-type column is `session_type` (there is no
  // `sessions.type` column — selecting it returns PostgREST 42703 / 400).
  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('id, coach_id, trainee_id, date, time, status, session_type, participants, group_name')
    .eq('coach_id', userId)
    .eq('date', dateIso);
  if (error) throw error;
  const rows = sessions || [];

  const traineeIds = [...new Set(rows.map(r => r.trainee_id).filter(Boolean))];
  let nameById = {};
  if (traineeIds.length) {
    const { data: users } = await supabase
      .from('users')
      .select('id, full_name')
      .in('id', traineeIds);
    nameById = Object.fromEntries((users || []).map(u => [u.id, u.full_name]));
  }
  return rows.map(r => ({
    ...r,
    displayName: r.group_name || nameById[r.trainee_id] || 'מתאמן',
  }));
}

// ═══════════════════════════════════════════════════════════════════
// Writes
// ═══════════════════════════════════════════════════════════════════
export async function createNode(userId, fields) {
  const { data, error } = await supabase
    .from('focus_nodes')
    .insert([{ user_id: userId, ...fields }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateNode(id, patch) {
  const { data, error } = await supabase
    .from('focus_nodes')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteNode(id) {
  // FK on delete cascade removes descendants + notes + logs.
  const { error } = await supabase.from('focus_nodes').delete().eq('id', id);
  if (error) throw error;
}

export async function addNote(userId, nodeId, content) {
  const { data, error } = await supabase
    .from('focus_node_notes')
    .insert([{ user_id: userId, node_id: nodeId, content }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Mark a task complete for a date. Recurring → log only. One-time
// (no frequency) → log + set status done.
export async function logTask(userId, node, dateIso = isoDate()) {
  const { error } = await supabase
    .from('focus_task_logs')
    .upsert([{ user_id: userId, node_id: node.id, log_date: dateIso }], {
      onConflict: 'node_id,log_date',
    });
  if (error) throw error;
  if (!node.frequency) {
    await updateNode(node.id, { status: 'done', done_at: new Date().toISOString() });
  }
}

export async function unlogTask(node, dateIso = isoDate()) {
  const { error } = await supabase
    .from('focus_task_logs')
    .delete()
    .eq('node_id', node.id)
    .eq('log_date', dateIso);
  if (error) throw error;
  if (!node.frequency && node.status === 'done') {
    await updateNode(node.id, { status: 'active', done_at: null });
  }
}

// Clear saved coords for a set of nodes → they fall back to auto layout.
export async function clearPositions(ids) {
  if (!ids.length) return;
  const { error } = await supabase
    .from('focus_nodes')
    .update({ pos_x: null, pos_y: null })
    .in('id', ids);
  if (error) throw error;
}

export async function addIdea(userId, content) {
  const { data, error } = await supabase
    .from('idea_inbox')
    .insert([{ user_id: userId, content }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateIdea(id, patch) {
  const { error } = await supabase.from('idea_inbox').update(patch).eq('id', id);
  if (error) throw error;
}

// ═══════════════════════════════════════════════════════════════════
// Client-side hierarchy helpers
// ═══════════════════════════════════════════════════════════════════
export function indexNodes(nodes) {
  const byId = {};
  const children = {};
  nodes.forEach(n => { byId[n.id] = n; children[n.id] = []; });
  nodes.forEach(n => {
    if (n.parent_id && children[n.parent_id]) children[n.parent_id].push(n);
  });
  // Stable sort each child list by sort_order then created_at.
  Object.values(children).forEach(list => list.sort((a, b) =>
    (a.sort_order - b.sort_order) || (a.created_at < b.created_at ? -1 : 1)));
  const roots = nodes.filter(n => !n.parent_id);
  return { byId, children, roots };
}

// Breadcrumb ancestor titles (root → parent), excluding the node itself.
export function ancestorsOf(node, byId) {
  const chain = [];
  let cur = node ? byId[node.parent_id] : null;
  let guard = 0;
  while (cur && guard++ < 50) {
    chain.unshift(cur);
    cur = byId[cur.parent_id];
  }
  return chain;
}

// The top-level branch a node belongs to (direct child of a root).
export function topBranchOf(node, byId) {
  let cur = node;
  let guard = 0;
  while (cur && byId[cur.parent_id] && byId[cur.parent_id].parent_id && guard++ < 50) {
    cur = byId[cur.parent_id];
  }
  // cur is now a direct child of a root (or a root itself)
  return cur;
}

// ─── Arm color-coding ─────────────────────────────────────────────
// Each top-level branch (arm) gets a color by sort order; the whole
// subtree inherits it. A branch may override via a 'color:#hex' tag.
export const ARM_PALETTE = ['#FF6F20', '#3B82F6', '#16a34a', '#9333EA', '#D97706', '#DB2777'];

export function colorTag(node) {
  const t = (node?.tags || []).find(x => typeof x === 'string' && x.startsWith('color:'));
  return t ? t.slice(6) : null;
}

const hexToRgb = (hex) => {
  let h = String(hex || '').replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h || '0', 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export function darken(hex, k = 0.72) {
  const [r, g, b] = hexToRgb(hex);
  const f = (x) => Math.round(x * k);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
export function hexAlpha(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

// Map of top-level-branch id → arm color, assigned by sort order (with
// per-branch 'color:#hex' overrides). Screens iterate roots' children in
// the same sorted order, so indices — and colors — line up everywhere.
export function armColorMap(children, roots) {
  const map = {};
  const tops = [];
  roots.forEach(r => (children[r.id] || []).forEach(c => { if (c.node_type !== 'task') tops.push(c); }));
  tops.forEach((b, i) => { map[b.id] = colorTag(b) || ARM_PALETTE[i % ARM_PALETTE.length]; });
  return map;
}
// The arm color a node inherits (null for the root itself).
export function armColorFor(node, byId, armMap) {
  const top = topBranchOf(node, byId);
  return top ? (armMap[top.id] || null) : null;
}

// All descendant task nodes under a node (inclusive of task children).
export function descendantTasks(nodeId, children) {
  const out = [];
  const walk = (id) => (children[id] || []).forEach(c => {
    if (c.node_type === 'task') out.push(c);
    walk(c.id);
  });
  walk(nodeId);
  return out;
}

export function allDescendants(nodeId, children) {
  const out = [];
  const walk = (id) => (children[id] || []).forEach(c => { out.push(c); walk(c.id); });
  walk(nodeId);
  return out;
}

// Is a recurring/one-time task "done" for the given date?
export function isDoneForDate(node, logSet, dateIso) {
  if (node.frequency === 'monthly') {
    // any log in the same month counts
    const ym = dateIso.slice(0, 7);
    return [...logSet].some(k => k.startsWith(node.id + '|' + ym));
  }
  return logSet.has(node.id + '|' + dateIso);
}

// Build a Set of "nodeId|log_date" for O(1) lookups.
export function logSetFrom(logs) {
  return new Set(logs.map(l => `${l.node_id}|${l.log_date}`));
}

// ─── Today harvest ────────────────────────────────────────────────
// Returns { overdue, rollover, main } arrays of task nodes.
export function harvestToday(nodes, logSet, today = isoDate()) {
  const dow = dowOf(today);
  const dom = new Date(today + 'T00:00:00').getDate();
  const ym = today.slice(0, 7);
  const tasks = nodes.filter(n => n.node_type === 'task' && n.status === 'active');

  const overdue = [];
  const rollover = [];
  const main = [];
  const seen = new Set();
  const push = (arr, n) => { if (!seen.has(n.id)) { seen.add(n.id); arr.push(n); } };

  tasks.forEach(n => {
    // Overdue deadline pinned above everything.
    if (n.due_date && n.due_date < today) { push(overdue, n); return; }

    if (n.frequency === 'daily') {
      if (!logSet.has(n.id + '|' + today)) push(main, n);
    } else if (n.frequency === 'weekly') {
      if (n.day_of_week === dow && !logSet.has(n.id + '|' + today)) push(main, n);
    } else if (n.frequency === 'monthly') {
      const loggedThisMonth = [...logSet].some(k => k.startsWith(n.id + '|' + ym));
      if (dom >= 1 && dom <= 3 && !loggedThisMonth) push(main, n);
    } else {
      // one-time
      if (n.task_date === today) push(main, n);
      else if (n.task_date && n.task_date < today) push(rollover, n);
    }
  });

  // Order main: fear → priority desc → rest (stable).
  main.sort((a, b) => {
    if (!!b.is_fear_task !== !!a.is_fear_task) return a.is_fear_task ? -1 : 1;
    return (b.priority || 0) - (a.priority || 0);
  });
  return { overdue, rollover, main };
}

// Does an active task occur on a given date (recurring or one-time)?
export function occursOn(n, date) {
  if (n.node_type !== 'task' || n.status !== 'active') return false;
  if (n.frequency === 'daily') return true;
  if (n.frequency === 'weekly') return n.day_of_week === dowOf(date);
  if (n.frequency === 'monthly') { const d = new Date(date + 'T00:00:00').getDate(); return d >= 1 && d <= 3; }
  return n.task_date === date;
}

// Ring stats for today: how many "relevant today" tasks are done.
export function todayStats(nodes, logSet, today = isoDate()) {
  const dow = dowOf(today);
  const dom = new Date(today + 'T00:00:00').getDate();
  const ym = today.slice(0, 7);
  const tasks = nodes.filter(n => n.node_type === 'task' && (n.status === 'active' || n.status === 'done'));
  let total = 0, done = 0;
  tasks.forEach(n => {
    let relevant = false;
    let isDone = false;
    if (n.frequency === 'daily') { relevant = true; isDone = logSet.has(n.id + '|' + today); }
    else if (n.frequency === 'weekly') { relevant = n.day_of_week === dow; isDone = logSet.has(n.id + '|' + today); }
    else if (n.frequency === 'monthly') { relevant = dom >= 1 && dom <= 3; isDone = [...logSet].some(k => k.startsWith(n.id + '|' + ym)); }
    else {
      relevant = (n.task_date && n.task_date <= today) || (n.due_date && n.due_date < today);
      isDone = logSet.has(n.id + '|' + today) || n.status === 'done';
    }
    if (relevant) { total++; if (isDone) done++; }
  });
  return { done, total };
}

// Streak: consecutive days (ending today or yesterday) on which every
// active daily task was logged. Requires logs covering the window.
export function computeStreak(nodes, logs, today = isoDate()) {
  const dailies = nodes.filter(n => n.node_type === 'task' && n.status === 'active' && n.frequency === 'daily');
  if (!dailies.length) return 0;
  const set = logSetFrom(logs);
  const allDone = (day) => dailies.every(n => set.has(n.id + '|' + day));
  let streak = 0;
  let cursor = today;
  // If today isn't complete yet, start the count from yesterday so an
  // in-progress day doesn't zero a real streak.
  if (!allDone(cursor)) cursor = addDays(cursor, -1);
  let guard = 0;
  while (allDone(cursor) && guard++ < 400) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}
