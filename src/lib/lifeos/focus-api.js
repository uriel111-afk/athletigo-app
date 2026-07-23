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

// ─── Month / week grid helpers (Tracker) ──────────────────────────
export const HEB_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

// Every ISO date in the month that contains `iso`.
export function monthDays(iso) {
  const d = new Date(iso + 'T00:00:00');
  const y = d.getFullYear(), m = d.getMonth();
  const n = new Date(y, m + 1, 0).getDate();
  return Array.from({ length: n }, (_, i) => isoDate(new Date(y, m, i + 1)));
}
// The 7 ISO dates (Sun→Sat) of the week that contains `iso`.
export function weekDays(iso) {
  const d = new Date(iso + 'T00:00:00');
  const start = addDays(iso, -d.getDay());
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}
// 'YYYY-MM' → Hebrew "month year".
export function monthLabel(iso) {
  const d = new Date(iso + 'T00:00:00');
  return `${HEB_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// ─── Optional documentation note formatter ────────────────────────
// Combine the optional fields into ONE formatted focus_node_notes body.
// Returns '' when the coach filled nothing meaningful in (caller skips
// saving). `time` (auto-recorded completion time) is only appended when
// there's other content — a bare timestamp never forces a save.
export function formatDocNote({ number, feeling, insight, minutes, time } = {}) {
  const parts = [];
  const num = String(number || '').trim();
  if (num) parts.push(`📊 ${num}`);
  const mins = Number(minutes || 0);
  if (mins > 0) parts.push(`⏱️ ${mins} דק׳`);
  const f = Number(feeling || 0);
  if (f > 0) parts.push(`תחושה: ${'●'.repeat(f)}${'○'.repeat(Math.max(0, 5 - f))} (${f}/5)`);
  const ins = String(insight || '').trim();
  if (ins) parts.push(`💡 ${ins}`);
  if (!parts.length) return '';               // nothing filled → skip
  const t = String(time || '').trim();
  if (t) parts.push(`🕐 ${t}`);
  return parts.join('\n');
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

// All feed notes created on a given LOCAL day, across every node —
// newest first. Powers the personal board's day-summary feed. Boundaries
// are the local midnight → next midnight, converted to UTC for the query.
export async function fetchNotesForDate(userId, dateIso = isoDate()) {
  const from = new Date(dateIso + 'T00:00:00');
  const to = new Date(dateIso + 'T00:00:00');
  to.setDate(to.getDate() + 1);
  const { data, error } = await supabase
    .from('focus_node_notes')
    .select('id, node_id, content, created_at')
    .eq('user_id', userId)
    .gte('created_at', from.toISOString())
    .lt('created_at', to.toISOString())
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
// The current auth uid (the value RLS compares user_id against). The
// app's `user.id` should equal this, but link fetch/delete must agree on
// the SAME predicate or you get rows you can see but can't delete.
export async function getAuthUid() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id || null;
}

// Fetch links by the SAME predicate RLS uses (auth.uid() = user_id) — no
// client-side user_id filter, so every fetched row is guaranteed
// deletable. (The old `.eq('user_id', appUserId)` could diverge from
// auth.uid() and surface undeletable rows.)
export async function fetchLinks() {
  const { data, error } = await supabase
    .from('focus_node_links')
    .select('id, from_node, to_node');
  if (error) throw error;
  return data || [];
}

export async function getLinkById(id) {
  const { data } = await supabase
    .from('focus_node_links')
    .select('id, user_id, from_node, to_node')
    .eq('id', id)
    .maybeSingle();
  return data || null;
}

// One-time ownership repair: any link the session can see whose user_id
// differs from auth.uid() gets fixed. (Rows fully invisible under RLS
// cannot be repaired from the client — those need a service-role run.)
export async function repairLinkOwnership() {
  const authUid = await getAuthUid();
  if (!authUid) return { authUid: null, seen: 0, wrong: 0, fixed: 0 };
  const { data } = await supabase.from('focus_node_links').select('id, user_id');
  const rows = data || [];
  const wrong = rows.filter(r => r.user_id !== authUid);
  let fixed = 0;
  for (const r of wrong) {
    const { data: upd } = await supabase.from('focus_node_links').update({ user_id: authUid }).eq('id', r.id).select('id');
    if ((upd || []).length) fixed++;
  }
  return { authUid, seen: rows.length, wrong: wrong.length, fixed };
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

// Delete by id only (RLS enforces ownership). Returns the number of rows
// ACTUALLY deleted — 0 means RLS/ownership blocked it or it was already
// gone, so callers can surface a real reason instead of failing silently.
export async function deleteLink(id) {
  const { data, error } = await supabase.from('focus_node_links').delete().eq('id', id).select('id');
  if (error) throw error;
  return (data || []).length;
}

// Re-route a link: replace one endpoint column (from_node/to_node) in place.
export async function updateLinkEndpoint(id, patch) {
  const { data, error } = await supabase
    .from('focus_node_links')
    .update(patch)
    .eq('id', id)
    .select('id, from_node, to_node');
  if (error) throw error;
  return (data && data[0]) || null;
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

// ─── Personal arm seed (החיים שלי) ────────────────────────────────
// The personal world is just focus_nodes: a top-level branch under the
// root with three child branches. Seeded once, idempotently, from the
// app on first load — no new tables, no migration.
export const PERSONAL_ARM_TITLE = 'החיים שלי';
export const PERSONAL_ARM_CHILDREN = ['בית וסדר', 'משפחה וחברים', 'בריאות והרגלים'];

// Ensure the personal arm exists. Returns the arm node (existing or
// freshly created), or null when there's no root yet to hang it under.
// Idempotent: a second call finds the existing branch and does nothing.
export async function seedPersonalArm(userId) {
  const nodes = await fetchNodes(userId);
  const root = nodes.find(n => n.node_type === 'root') || nodes.find(n => !n.parent_id);
  if (!root) return null;                       // no root → nothing to seed under
  const existing = nodes.find(n =>
    n.parent_id === root.id && n.node_type !== 'task' && n.title === PERSONAL_ARM_TITLE);
  if (existing) return existing;                // already seeded → idempotent
  const arm = await createNode(userId, {
    parent_id: root.id, node_type: 'branch', title: PERSONAL_ARM_TITLE, sort_order: 100,
  });
  for (let i = 0; i < PERSONAL_ARM_CHILDREN.length; i++) {
    await createNode(userId, {
      parent_id: arm.id, node_type: 'branch', title: PERSONAL_ARM_CHILDREN[i], sort_order: i,
    });
  }
  return arm;
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

// ─── Tracker helpers (per-task recurring grid) ────────────────────
// Recurring tasks only (daily/weekly/monthly), still active.
export function recurringTasks(nodes) {
  return nodes.filter(n => n.node_type === 'task' && n.status === 'active'
    && (n.frequency === 'daily' || n.frequency === 'weekly' || n.frequency === 'monthly'));
}
// Is this recurring task expected on `date`? (monthly → the 1st only.)
export function taskExpectedOn(n, date) {
  if (n.frequency === 'daily') return true;
  if (n.frequency === 'weekly') return n.day_of_week === dowOf(date);
  if (n.frequency === 'monthly') return new Date(date + 'T00:00:00').getDate() === 1;
  return false;
}
// Was it logged/done for `date`? (monthly → any log that month.)
export function taskLoggedOn(n, logSet, date) {
  if (n.frequency === 'monthly') {
    const ym = date.slice(0, 7);
    return [...logSet].some(k => k.startsWith(n.id + '|' + ym));
  }
  return logSet.has(n.id + '|' + date);
}
// {done, expected} for one task across a list of dates, counting only
// dates on/before `upTo` (future days don't drag the percentage down).
export function taskMonthStats(n, logSet, dates, upTo = isoDate()) {
  let expected = 0, done = 0;
  dates.forEach(d => {
    if (d > upTo) return;
    if (taskExpectedOn(n, d)) { expected++; if (taskLoggedOn(n, logSet, d)) done++; }
  });
  return { done, expected };
}
// Current streak: walking back from today over EXPECTED days only, count
// consecutive expected days that were logged. An unmet expected day (in
// the past) breaks it; today-not-yet-done doesn't zero a real streak.
export function taskStreak(n, logSet, today = isoDate()) {
  let streak = 0, cursor = today, guard = 0, started = false;
  while (guard++ < 400) {
    if (taskExpectedOn(n, cursor)) {
      const done = taskLoggedOn(n, logSet, cursor);
      if (done) { streak++; started = true; }
      else if (started || cursor !== today) break; // past miss ends it
    }
    cursor = addDays(cursor, -1);
  }
  return streak;
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
