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
  // Pull the richer per-day fields too so the tracker can render a cell's
  // summary and the doc sheet can prefill an edit — all in one query.
  const { data, error } = await supabase
    .from('focus_task_logs')
    .select('node_id, log_date, status, summary, note, start_time, end_time, feeling, improve, reason')
    .eq('user_id', userId)
    .gte('log_date', from)
    .lte('log_date', to);
  if (error) {
    // The new columns may not exist yet (migration not applied). Fall back to
    // the legacy shape so EVERY Focus screen keeps working; rich fields simply
    // stay empty (logSetFrom treats a status-less row as done) until the
    // migration runs. Remove this fallback once the column is guaranteed live.
    const legacy = await supabase
      .from('focus_task_logs')
      .select('node_id, log_date')
      .eq('user_id', userId)
      .gte('log_date', from)
      .lte('log_date', to);
    if (legacy.error) throw legacy.error;
    return legacy.data || [];
  }
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
  // status:'done' + reason:null flips a previously-'skipped' day back to done.
  // Only these columns are written, so any saved summary/note/feeling on an
  // existing row is left intact by the upsert's ON CONFLICT DO UPDATE.
  let { error } = await supabase
    .from('focus_task_logs')
    .upsert([{ user_id: userId, node_id: node.id, log_date: dateIso, status: 'done', reason: null }], {
      onConflict: 'node_id,log_date',
    });
  if (error) {
    // status/reason may not exist yet (migration pending) → core upsert so the
    // business map + trackers can still mark done. Rich statuses arrive later.
    const r = await supabase
      .from('focus_task_logs')
      .upsert([{ user_id: userId, node_id: node.id, log_date: dateIso }], { onConflict: 'node_id,log_date' });
    if (r.error) throw r.error;
  }
  if (!node.frequency) {
    await updateNode(node.id, { status: 'done', done_at: new Date().toISOString() });
  }
}

// Save/overwrite the rich documentation for a done day. patch may hold any of
// { summary, note, start_time, end_time, feeling, improve }. Always marks the
// day done, so filling the sheet also completes the habit if it wasn't.
export async function logTaskDetails(userId, node, dateIso, patch = {}) {
  const clean = {};
  ['summary', 'note', 'start_time', 'end_time', 'feeling', 'improve'].forEach(k => {
    if (patch[k] !== undefined) clean[k] = patch[k] === '' ? null : patch[k];
  });
  const { error } = await supabase
    .from('focus_task_logs')
    .upsert([{ user_id: userId, node_id: node.id, log_date: dateIso, status: 'done', reason: null, ...clean }], {
      onConflict: 'node_id,log_date',
    });
  if (error) throw error;
  if (!node.frequency) {
    await updateNode(node.id, { status: 'done', done_at: new Date().toISOString() });
  }
}

// Record a NOT-done day with an optional reason + note as a 'skipped' row.
// It occupies the same (node_id, log_date) slot but never reads as done.
export async function skipTask(userId, node, dateIso, { reason = null, note = null } = {}) {
  const { error } = await supabase
    .from('focus_task_logs')
    .upsert([{ user_id: userId, node_id: node.id, log_date: dateIso, status: 'skipped', reason: reason || null, note: note || null }], {
      onConflict: 'node_id,log_date',
    });
  if (error) throw error;
  // A one-time task that was 'done' and is now marked skipped returns to active.
  if (!node.frequency && node.status === 'done') {
    await updateNode(node.id, { status: 'active', done_at: null });
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

// The personal world has no tables of its own — it is seeded INTO focus_nodes
// as a top-level arm next to the business arms (see seedPersonalArm below).
// Anything reading focus_nodes therefore gets the personal content too. The
// מיקוד map is business-only, so it strips this subtree on read.
// Returns the arm's id, or null when it was never seeded.
export function findPersonalArmId(nodes) {
  const root = nodes.find(n => n.node_type === 'root') || nodes.find(n => !n.parent_id);
  if (!root) return null;
  const arm = nodes.find(n =>
    n.parent_id === root.id && n.node_type !== 'task' && n.title === PERSONAL_ARM_TITLE);
  return arm ? arm.id : null;
}

// The personal arm plus everything under it, as a Set of ids.
export function personalSubtreeIds(nodes) {
  const armId = findPersonalArmId(nodes);
  if (!armId) return new Set();
  const kids = {};
  nodes.forEach(n => { if (n.parent_id) (kids[n.parent_id] = kids[n.parent_id] || []).push(n.id); });
  const out = new Set([armId]);
  const stack = [armId];
  while (stack.length) {
    const id = stack.pop();
    (kids[id] || []).forEach(c => { if (!out.has(c)) { out.add(c); stack.push(c); } });
  }
  return out;
}

// Business-only view of the tree: same rows, personal subtree removed. This is
// a READ filter — it never deletes anything, because the אישי tab reads the
// very same rows.
export function withoutPersonalArm(nodes) {
  const drop = personalSubtreeIds(nodes);
  return drop.size ? nodes.filter(n => !drop.has(n.id)) : nodes;
}

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

// ─── Personal domains (habit categories under the personal arm) ───
// A separate category layer BELOW the 'החיים שלי' arm. Habits live under
// one of these branches; the tracker groups rows by domain. Additive —
// the legacy PERSONAL_ARM_CHILDREN stay as-is.
// 'שינה' joins as its own domain rather than hiding under 'אכילה' — the
// seeder is title-idempotent, so adding a title here just creates the one
// missing branch for users who were already seeded.
export const PERSONAL_DOMAINS = ['שגרה', 'אכילה', 'שינה', 'תפילה', 'אימונים', 'חברים ומשפחה', 'תחביבים', 'משק בית'];

// Idempotently ensure the 7 domain branches exist under the personal arm.
// Creates the arm first if missing (via seedPersonalArm). Never deletes.
// Callers guard with a localStorage flag so it runs once per user.
export async function seedPersonalDomains(userId) {
  let nodes = await fetchNodes(userId);
  const root = nodes.find(n => n.node_type === 'root') || nodes.find(n => !n.parent_id);
  if (!root) return null;                          // no root → nothing to seed under
  let arm = nodes.find(n => n.parent_id === root.id && n.node_type !== 'task' && n.title === PERSONAL_ARM_TITLE);
  if (!arm) { arm = await seedPersonalArm(userId); nodes = await fetchNodes(userId); }
  if (!arm) return null;
  const existing = new Set(nodes.filter(n => n.parent_id === arm.id && n.node_type !== 'task').map(n => n.title));
  for (let i = 0; i < PERSONAL_DOMAINS.length; i++) {
    const title = PERSONAL_DOMAINS[i];
    if (!existing.has(title)) {
      await createNode(userId, { parent_id: arm.id, node_type: 'branch', title, sort_order: 200 + i });
    }
  }
  return arm;
}

// ─── Agreed personal habits (seeded once, idempotently) ───────────
// Each habit is an ordinary recurring task under its domain branch, born on
// the board (BOARD_TAG) exactly like a quick-added one. 'weekly: 5' uses the
// existing w:N mechanism: frequency stays 'daily' + a 'w:5' tag → 5 times a
// week on flexible days.
export const PERSONAL_HABIT_SEED = [
  { title: 'תפילת בוקר',        domain: 'תפילה',        frequency: 'daily' },
  { title: 'נגינה (30 דק׳)',     domain: 'תחביבים',      frequency: 'daily' },
  { title: 'קשר עם חברים',       domain: 'חברים ומשפחה', frequency: 'daily' },
  { title: 'ניקיון וקניות',       domain: 'משק בית',      frequency: 'daily' },
  { title: 'שינה (יעד 7 שעות)',  domain: 'שינה',         frequency: 'daily' },
  { title: 'אימון כוח',          domain: 'אימונים',      frequency: 'daily', weekly: 5 },
];

// Create any of the agreed habits that don't exist yet. Idempotent on two
// levels: the domain branches come from the title-checked seedPersonalDomains,
// and a habit is skipped when a task with the same title already exists
// ANYWHERE under the personal arm (so a habit the user moved between domains
// is never duplicated). Callers also guard with a localStorage flag to skip
// the extra read on every load. Returns the number actually created.
export async function seedPersonalHabits(userId, boardTag = BOARD_TAG) {
  await seedPersonalDomains(userId);            // ensures the arm + all domains
  const nodes = await fetchNodes(userId);
  const { children } = indexNodes(nodes);
  const root = nodes.find(n => n.node_type === 'root') || nodes.find(n => !n.parent_id);
  if (!root) return 0;
  const arm = nodes.find(n => n.parent_id === root.id && n.node_type !== 'task' && n.title === PERSONAL_ARM_TITLE);
  if (!arm) return 0;

  const existing = new Set(descendantTasks(arm.id, children).map(t => String(t.title || '').trim()));
  const domainByTitle = {};
  (children[arm.id] || []).forEach(b => { if (b.node_type !== 'task') domainByTitle[b.title] = b; });

  let created = 0;
  for (const spec of PERSONAL_HABIT_SEED) {
    if (existing.has(spec.title)) continue;             // already there → skip
    const domain = domainByTitle[spec.domain];
    if (!domain) continue;                              // domain missing → skip, never guess
    const tags = [boardTag];
    if (spec.weekly) tags.push(`w:${spec.weekly}`);
    await createNode(userId, {
      parent_id: domain.id, node_type: 'task', title: spec.title,
      frequency: spec.frequency, tags,
    });
    existing.add(spec.title);
    created++;
  }
  return created;
}

// ─── Per-habit task bank (sub-items under one habit) ──────────────
// No new table and no new concept: a bank item is a CHILD focus_node of the
// habit — node_type 'task' with NO frequency and no task_date/due_date, plus a
// 'בנק' tag. Consequences of that shape, all of them already-existing
// behaviour rather than new code:
//   • recurringTasks() needs a frequency → a bank item is never its own row.
//   • harvestToday()/todayStats() need a date → it never counts as "today's".
//   • the map's visibleChildrenOf() and the outline's walk() both stop at
//     task nodes → bank items don't clutter מיקוד or מתאר.
//   • it has a real node id → per-item, per-day completion is just an ordinary
//     focus_task_logs row, so streaks/notes/undo work with zero new plumbing.
export const BANK_TAG = 'בנק';

export function bankItemsOf(habitId, children) {
  return (children[habitId] || []).filter(n =>
    n.node_type === 'task' && (n.tags || []).includes(BANK_TAG));
}

export async function addBankItem(userId, habit, title, sortOrder = 0) {
  const t = String(title || '').trim();
  if (!t || !habit?.id) return null;
  return createNode(userId, {
    parent_id: habit.id, node_type: 'task', title: t,
    tags: [BANK_TAG], sort_order: sortOrder,
  });
}

// ─── רשימת השראה — the inspiration list ───────────────────────────
// Wish-list items (places to go / things to try or learn / experiences), NOT
// habits. Same trick as the task bank, one level up: the list is ONE container
// task under the personal arm and every item is a child task of it, with NO
// frequency and no task_date/due_date. Consequences, all existing behaviour:
//   • recurringTasks() needs a frequency → an item is never a matrix row.
//   • harvestToday()/todayStats()/occursOn() need a date → never "today's".
//   • the map's visibleChildrenOf() and the outline's walk() stop at task
//     nodes → the whole list is invisible on מיקוד and מתאר (only the single
//     container node exists there).
//   • bankItemsOf() matches BANK_TAG on a HABIT's children → items can never
//     show up in a task bank.
//   • completing one is the ordinary one-time completion path: logTask() sets
//     status 'done' + done_at (because there's no frequency), and the light
//     doc sheet writes summary/feeling on the focus_task_logs row.
// Only the two screens that FLATTEN descendant tasks (רשימה, בקרה) need to be
// told to skip these — see isHiddenLeafTask below.
export const INSPIRATION_TAG = 'השראה';
export const INSPIRATION_ROOT_TITLE = 'רשימת השראה';
export const INSPIRATION_CATEGORIES = [
  { key: 'place',      tag: 'cat:place',      label: 'מקומות',       emoji: '📍' },
  { key: 'learn',      tag: 'cat:learn',      label: 'לנסות/ללמוד',  emoji: '💡' },
  { key: 'experience', tag: 'cat:experience', label: 'חוויות',       emoji: '✨' },
];

// Tag-encoded per-item fields, following the existing 'w:5' / 'color:#hex'
// convention so no column has to be added:
//   cat:<key>    — which of the three categories the item belongs to
//   link:<url>   — the optional link / photo URL
export const catOf = (node) => {
  const t = (node?.tags || []).find(x => typeof x === 'string' && x.startsWith('cat:'));
  const key = t ? t.slice(4) : null;
  return INSPIRATION_CATEGORIES.some(c => c.key === key) ? key : INSPIRATION_CATEGORIES[0].key;
};
export const linkOf = (node) => {
  const t = (node?.tags || []).find(x => typeof x === 'string' && x.startsWith('link:'));
  return t ? t.slice(5) : '';
};
export const inspirationTags = (catKey, link) => {
  const tags = [INSPIRATION_TAG, `cat:${catKey}`];
  const url = String(link || '').trim();
  if (url) tags.push(`link:${url}`);
  return tags;
};

// Tasks that are metadata leaves of another feature rather than real tasks:
// habit task-bank items and inspiration items. The screens that flatten a
// whole subtree (FocusList, FocusControl) filter with this so their counts and
// lists stay about actual tasks.
export function isHiddenLeafTask(node) {
  const tags = node?.tags || [];
  return tags.includes(BANK_TAG) || tags.includes(INSPIRATION_TAG);
}

// The container node, created on demand (idempotent by title+tag under the arm).
export async function seedInspirationList(userId) {
  const nodes = await fetchNodes(userId);
  const root = nodes.find(n => n.node_type === 'root') || nodes.find(n => !n.parent_id);
  if (!root) return null;
  let arm = nodes.find(n => n.parent_id === root.id && n.node_type !== 'task' && n.title === PERSONAL_ARM_TITLE);
  if (!arm) { arm = await seedPersonalArm(userId); }
  if (!arm) return null;
  const existing = nodes.find(n => n.parent_id === arm.id && (n.tags || []).includes(INSPIRATION_TAG)
    && n.title === INSPIRATION_ROOT_TITLE);
  if (existing) return existing;
  return createNode(userId, {
    parent_id: arm.id, node_type: 'task', title: INSPIRATION_ROOT_TITLE,
    tags: [INSPIRATION_TAG], sort_order: 500,
  });
}

export function inspirationItemsOf(rootId, children) {
  return (children[rootId] || []).filter(n =>
    n.node_type === 'task' && (n.tags || []).includes(INSPIRATION_TAG));
}

export async function addInspirationItem(userId, rootId, { title, note, link, category }) {
  const t = String(title || '').trim();
  if (!t || !rootId) return null;
  return createNode(userId, {
    parent_id: rootId, node_type: 'task', title: t,
    note: String(note || '').trim() || null,
    tags: inspirationTags(category, link),
  });
}

// Per-node logs with NO date window — an inspiration item may have been
// completed long before the tracker's rolling 120-day fetch range.
export async function fetchLogsForNodes(nodeIds = []) {
  if (!nodeIds.length) return [];
  const { data, error } = await supabase
    .from('focus_task_logs')
    .select('node_id, log_date, status, summary, note, feeling')
    .in('node_id', nodeIds);
  if (error) return [];        // rich columns may be pending → no saved notes yet
  return data || [];
}

// The category branch a node belongs to = its ancestor whose parent is
// `armId` (one level under the arm). Used to group personal habits by
// domain, since topBranchOf() resolves to the arm itself. Falls back to
// the node's own top branch when it isn't under the arm.
export function branchUnderArm(node, byId, armId) {
  let cur = node, guard = 0;
  while (cur && guard++ < 50) {
    if (cur.parent_id === armId) return cur;
    cur = byId[cur.parent_id];
  }
  return null;
}

// ─── Personal board membership (tag-based, no schema change) ──────
// A focus_node is "on the board" when it carries this tag. Nothing else
// changes: the node still lives in its arm on the map/list/tracker.
export const BOARD_TAG = 'לוח';

// First-run curation: put every task under the 'החיים שלי' arm on the
// board, so the board opens showing ONLY the personal world. Business
// tasks join later by explicit add. Idempotent per task; run once (the
// caller guards with a localStorage flag so later removals stick).
export async function migratePersonalToBoard(userId, tag = BOARD_TAG) {
  const nodes = await fetchNodes(userId);
  const { children } = indexNodes(nodes);
  const root = nodes.find(n => n.node_type === 'root') || nodes.find(n => !n.parent_id);
  if (!root) return 0;
  const arm = nodes.find(n => n.parent_id === root.id && n.node_type !== 'task' && n.title === PERSONAL_ARM_TITLE);
  if (!arm) return 0;
  const tasks = descendantTasks(arm.id, children);
  let count = 0;
  for (const t of tasks) {
    const tags = t.tags || [];
    if (!tags.includes(tag)) { await updateNode(t.id, { tags: [...tags, tag] }); count++; }
  }
  return count;
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

// ─── Personal contacts — DELIBERATELY NOT HERE ────────────────────
// There used to be a second contacts write path here (list/add/update/delete
// on personal_contacts, using the relation + last_contacted columns) behind
// the FriendsContacts card. Contacts now live in ONE place: the קשרים screen
// at /personal/people, via @/lib/personal/personal-api — which owns the fuller
// shape (category / phone / birthday / contact_frequency / last_contact_date /
// notes) plus the personal_interactions log. See
// migrations/2026-07-25-contacts-consolidation.sql.

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

// Build a Set of "nodeId|log_date" for O(1) DONE lookups. A row counts as
// done ONLY when status is 'done'; a 'skipped' row records a not-done day
// (with a reason) and must NOT read as completed. Legacy rows (predating the
// status column) and any row missing status default to done. Because every
// completion check funnels through this Set (taskLoggedOn / todayStats /
// harvestToday / isDoneForDate) or through computeStreak (which calls this),
// filtering here fixes the whole "row exists ⇒ done" assumption in one place.
export function logSetFrom(logs) {
  return new Set(
    logs.filter(l => !l.status || l.status === 'done').map(l => `${l.node_id}|${l.log_date}`)
  );
}

// Full per-day rows keyed "nodeId|log_date" (done AND skipped) so a cell can
// render its saved summary and a sheet can prefill for edit. Later rows win.
export function logByKey(logs) {
  const m = {};
  logs.forEach(l => { m[`${l.node_id}|${l.log_date}`] = l; });
  return m;
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

    const wN = weeklyTargetOf(n);
    if (wN != null) {
      // Surface only while this week is still under target and not done today.
      if (!logSet.has(n.id + '|' + today) && weekDoneCount(n, logSet, today, today) < wN) push(main, n);
      return;
    }
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
    const wN = weeklyTargetOf(n);
    if (wN != null) { isDone = logSet.has(n.id + '|' + today); relevant = isDone || weekDoneCount(n, logSet, today, today) < wN; }
    else if (n.frequency === 'daily') { relevant = true; isDone = logSet.has(n.id + '|' + today); }
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
// ─── Weekly-N flexible habits ("N times/week, any days") ──────────
// Encoded WITHOUT a schema change: base frequency='daily' + a tag "w:N"
// (e.g. "w:5"). weeklyTargetOf → N (or null). All weekly-N handling lives in
// branches at the TOP of the stats helpers below, so the daily/weekly/monthly
// paths are byte-for-byte unchanged. Every count uses the done-only logSet, so
// 'skipped' rows never count — the status='done' filter is preserved.
export function weeklyTargetOf(task) {
  const t = (task?.tags || []).find(x => typeof x === 'string' && /^w:\d+$/.test(x));
  return t ? Math.max(1, parseInt(t.slice(2), 10)) : null;
}
// Done days in the Sun–Sat week containing dateIso, counted up to `upTo`.
export function weekDoneCount(task, logSet, dateIso, upTo = isoDate()) {
  return weekDays(dateIso).reduce((c, d) => (d <= upTo && logSet.has(task.id + '|' + d) ? c + 1 : c), 0);
}
// Matrix "expected/missed" box for one day. A weekly-N day is expected ONLY
// while its week is still under target (and the day isn't future or already
// done). Non-weekly-N habits defer to the unchanged taskExpectedOn.
export function isCellExpected(task, logSet, dateIso, today = isoDate()) {
  const N = weeklyTargetOf(task);
  if (N == null) return taskExpectedOn(task, dateIso);
  if (dateIso > today || logSet.has(task.id + '|' + dateIso)) return false;
  return weekDoneCount(task, logSet, dateIso, today) < N;
}
// "Needs action today" for a weekly-N habit (done today, or week still under
// target). Returns null for non-weekly-N so the caller keeps its own logic.
export function isRelevantToday(task, logSet, today = isoDate()) {
  const N = weeklyTargetOf(task);
  if (N == null) return null;
  return logSet.has(task.id + '|' + today) || weekDoneCount(task, logSet, today, today) < N;
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
  const N = weeklyTargetOf(n);
  if (N != null) {
    // Weekly-bucketed target: each elapsed week contributes expected=N and
    // done=min(N, done that week) — so "5/7" never penalises the rest days.
    const seen = new Set();
    let expected = 0, done = 0;
    dates.forEach(d => {
      const wk = weekDays(d)[0];
      if (seen.has(wk)) return;
      seen.add(wk);
      if (!weekDays(d).some(x => x <= upTo)) return;   // fully-future week
      expected += N;
      done += Math.min(N, weekDoneCount(n, logSet, d, upTo));
    });
    return { done, expected };
  }
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
  const N = weeklyTargetOf(n);
  if (N != null) {
    // Consecutive weeks meeting the target. The current (in-progress) week
    // counts only once met and never breaks the streak while still open.
    let streak = 0, wkStart = weekDays(today)[0], first = true, guard = 0;
    while (guard++ < 104) {
      const met = weekDoneCount(n, logSet, wkStart, today) >= N;
      if (met) streak++;
      else if (!first) break;
      first = false;
      wkStart = addDays(wkStart, -7);
    }
    return streak;
  }
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
