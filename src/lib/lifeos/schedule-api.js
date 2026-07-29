// ═══════════════════════════════════════════════════════════════════
// Scheduling — a placement is a ROW, not two columns on the task
// ═══════════════════════════════════════════════════════════════════
// Placement moved OUT of focus_nodes into focus_placements
// (migrations/2026-07-29-focus-placements.sql). focus_nodes.task_date and
// focus_nodes.task_time still exist in the database and are deliberately left
// alone — nothing in this layer reads or writes them any more.
//
// What that buys, and why the old "no second table" rule was dropped:
//   • a RECURRING node can be placed on a specific date. The old writer
//     refused to set task_date when node.frequency was set, so a daily habit
//     had exactly one global time for every day it ever occurred.
//   • the SAME node can be placed twice on one date. Two columns on the node
//     could only ever describe one placement. There is deliberately NO unique
//     constraint on (node_id, date).
//   • a placement carries its own duration_minutes, so "how long this block
//     is" stopped being guessed from net_minutes.
//
// What did NOT move:
//   focus_task_logs   — still ONE done/skipped mark per (node_id, log_date).
//                       The habit matrix reads it exactly as before.
//   focus_executions  — still the append-only history the week maths counts.
//
// Because focus_task_logs is per DAY and placements are per BLOCK, the two
// cannot be kept in step by hand. setPlacementDone() below is the ONE writer
// for all three tables, so the calendar and the board cannot drift.
// ═══════════════════════════════════════════════════════════════════

import { supabase } from '@/lib/supabaseClient';
import { isoDate, addDays, weekDays, dowOf, logTask, unlogTask } from './focus-api';
import { addExecution } from './personal-day-api';

// ─── raw-result logging ───────────────────────────────────────────
// Every Supabase call this module makes prints its payload BEFORE the round
// trip and the raw { data, error } AFTER it, under one tag, so a failed write
// is visible in the console without a network tab.
const logRaw = (tag, payload) => {
  console.log(`[schedule-api] ${tag} → request`, payload);
  return (res) => {
    console.log(`[schedule-api] ${tag} ← raw`, { data: res?.data, error: res?.error });
    return res;
  };
};

// The visible hour axis. 06:00..23:00 — matches the existing FocusCalendar so
// both screens describe the same day.
export const DAY_START = 6;
export const DAY_END = 23;
export const HOURS = Array.from({ length: DAY_END - DAY_START + 1 }, (_, i) => i + DAY_START);

export const pad2 = (n) => String(n).padStart(2, '0');
export const hhmm = (t) => (t ? String(t).slice(0, 5) : null);
export const hourOf = (t) => (t ? parseInt(String(t).slice(0, 2), 10) : null);
export const hourLabel = (h) => `${pad2(h)}:00`;

// ─── 15-minute resolution ─────────────────────────────────────────
// start_time is a `time` column, so ':15' is a value it could always hold.
// Quarter 0..3 ↔ minutes 0/15/30/45.
export const QUARTERS = [0, 1, 2, 3];
export const minuteOf = (t) => (t ? parseInt(String(t).slice(3, 5), 10) : null);
export const quarterOf = (t) => {
  const m = minuteOf(t);
  return m == null ? null : Math.floor(m / 15);
};
export const timeLabel = (h, q = 0) => `${pad2(h)}:${pad2(q * 15)}`;

// The table default. A placement always carries duration_minutes (NOT NULL),
// so this is a guard against a malformed row, not a fallback chain.
export const DEFAULT_DURATION = 30;

// ─── shapes ───────────────────────────────────────────────────────
// A placement row as this module hands it around:
//   { id, user_id, node_id, date, start_time, duration_minutes, done_at,
//     created_at, node: { id, title, tags, frequency } }
export const startOf = (p) => hhmm(p?.start_time);
export const dateOf = (p) => String(p?.date || '').slice(0, 10);
export const isPlacementDone = (p) => !!p?.done_at;

// ─── duration ─────────────────────────────────────────────────────
// Reads the placement and nothing else. The old net_minutes fallback is gone:
// a block's length is now its own stored fact, not an estimate borrowed from
// the task definition.
export function durationOf(placement) {
  const n = Number(placement?.duration_minutes);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DURATION;
}
// How many 15-minute rows a block covers, at least one.
export const slotSpan = (placement) => Math.max(1, Math.round(durationOf(placement) / 15));

// The task drawer still shows "how long this usually takes" next to an
// UNPLACED task, where there is no placement to read. That is an estimate off
// the node, deliberately kept separate from durationOf so the two can never be
// confused for one another.
export function estimateMinutes(node) {
  const n = Number(node?.net_minutes);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DURATION;
}

// ─── who is writing ───────────────────────────────────────────────
// RLS is user_id = auth.uid() on every policy, so an insert has to carry the
// id. Resolved from the session rather than threaded through every caller.
async function currentUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const id = data?.user?.id;
  if (!id) throw new Error('no authenticated user');
  return id;
}

// ─── reads ────────────────────────────────────────────────────────
const PLACEMENT_SELECT =
  'id, user_id, node_id, date, start_time, duration_minutes, done_at, created_at, node:focus_nodes ( id, title, tags, frequency )';

// Every placement in a date window, each joined with its node's title, tags
// and frequency. Ordered so the grid gets them in reading order.
export async function getPlacements(userId, fromDate, toDate) {
  const done = logRaw('getPlacements select', { userId, fromDate, toDate });
  const res = await supabase
    .from('focus_placements')
    .select(PLACEMENT_SELECT)
    .eq('user_id', userId)
    .gte('date', fromDate)
    .lte('date', toDate)
    .order('date', { ascending: true })
    .order('start_time', { ascending: true });
  done(res);
  if (res.error) throw res.error;
  return res.data || [];
}

// ─── filtering, for the grid ──────────────────────────────────────
export const placementsOn = (placements = [], date) =>
  placements.filter(p => dateOf(p) === date);

// Kept under its old name so the calendar reads the same: everything on a
// date. There is no 'untimed' half any more — a placement without a time
// cannot exist, and unplaced tasks live in the drawer.
export function dayItems(placements = [], date) {
  return { timed: placementsOn(placements, date), untimed: [] };
}

export const itemsAtHour = (timed = [], h) =>
  timed.filter(p => hourOf(p.start_time) === h);

export const itemsAtQuarter = (timed = [], h, q) =>
  timed.filter(p => hourOf(p.start_time) === h && (quarterOf(p.start_time) ?? 0) === q);

// "Is anything actually booked on this day" — what the month dots draw.
export const placedOn = (placements = [], date) => placementsOn(placements, date).length > 0;

// The node ids that have at least one placement anywhere in the loaded window.
// The drawer uses it for "N ממתינות" and for the scheduled marker on a row.
export const placedNodeIds = (placements = []) => new Set(placements.map(p => p.node_id));

// ─── writes ───────────────────────────────────────────────────────
// Place a task. Works for recurring nodes exactly as it does for one-offs —
// the old refusal based on node.frequency is gone, because the date lives on
// the placement now and no longer contradicts the node's own recurrence.
export async function scheduleTask(nodeId, date, startTime, durationMinutes = DEFAULT_DURATION) {
  const user_id = await currentUserId();
  const row = {
    user_id,
    node_id: nodeId,
    date,
    start_time: startTime,
    duration_minutes: durationMinutes ?? DEFAULT_DURATION,
  };
  const done = logRaw('scheduleTask insert', row);
  const res = await supabase.from('focus_placements').insert([row]).select(PLACEMENT_SELECT).single();
  done(res);
  if (res.error) throw res.error;
  return res.data;
}

// Move ONE placement. The node is untouched — moving a block never edits the
// task, which is the whole point of the row existing.
export async function movePlacement(placementId, date, startTime) {
  const patch = { date, start_time: startTime };
  const done = logRaw('movePlacement update', { placementId, patch });
  const res = await supabase
    .from('focus_placements').update(patch).eq('id', placementId).select(PLACEMENT_SELECT).single();
  done(res);
  if (res.error) throw res.error;
  return res.data;
}

export async function resizePlacement(placementId, durationMinutes) {
  const patch = { duration_minutes: durationMinutes };
  const done = logRaw('resizePlacement update', { placementId, patch });
  const res = await supabase
    .from('focus_placements').update(patch).eq('id', placementId).select(PLACEMENT_SELECT).single();
  done(res);
  if (res.error) throw res.error;
  return res.data;
}

// Take a block out of the day. Deletes the placement and nothing else: the
// task itself, its day mark and its execution history all survive.
export async function unschedule(placementId) {
  const done = logRaw('unschedule delete', { placementId });
  const res = await supabase.from('focus_placements').delete().eq('id', placementId).select('id');
  done(res);
  if (res.error) throw res.error;
  return res.data;
}

// Undo of unschedule. A deleted row cannot come back with its own id, so this
// re-places the same node at the same minute for the same length.
export async function restorePlacement(prev = {}) {
  if (!prev?.node_id || !prev?.date || !prev?.start_time) return null;
  return scheduleTask(prev.node_id, dateOf(prev), startOf(prev), durationOf(prev));
}

// What a placement looked like before it was changed, for the undos above.
export const snapshotOf = (p) => ({
  id: p?.id ?? null,
  node_id: p?.node_id ?? null,
  date: dateOf(p),
  start_time: startOf(p),
  duration_minutes: durationOf(p),
});

// ═══════════════════════════════════════════════════════════════════
// The done flow — ONE writer for all three tables
// ═══════════════════════════════════════════════════════════════════
// Ticking a block writes:
//   1. focus_placements.done_at          — this block, specifically
//   2. focus_task_logs  (node, date)     — the day mark the matrix draws
//   3. focus_executions                  — one row, the history counted weekly
//
// Unticking reverses all three, with one asymmetry that matters: the day mark
// is shared by every placement of that node on that date, so it may only be
// deleted once NO other placement of that node on that date is still done.
// Clearing the second of two blocks must not un-tick the day.
export async function setPlacementDone(placement, done, { userId, node } = {}) {
  const uid = userId || await currentUserId();
  const nodeId = placement.node_id;
  const day = dateOf(placement);
  // The node is needed by logTask/unlogTask to decide whether a one-off also
  // flips focus_nodes.status. Fall back to the joined stub when not supplied.
  const nodeRow = node || placement.node || { id: nodeId };

  // ── 1. the placement itself ──
  const stamp = done ? new Date().toISOString() : null;
  const doneLog = logRaw('setPlacementDone update', { placementId: placement.id, done_at: stamp });
  const res = await supabase
    .from('focus_placements').update({ done_at: stamp }).eq('id', placement.id).select(PLACEMENT_SELECT).single();
  doneLog(res);
  if (res.error) throw res.error;

  if (done) {
    // ── 2. the day mark ──
    console.log('[schedule-api] setPlacementDone → logTask', { nodeId, day });
    await logTask(uid, nodeRow, day);
    // ── 3. one execution ──
    const exec = await addExecution(uid, { node_id: nodeId, day, minutes: durationOf(placement) });
    console.log('[schedule-api] setPlacementDone ← addExecution raw', exec);
    return res.data;
  }

  // ── 2. the day mark, only when nothing else on that day still holds it ──
  const peersLog = logRaw('setPlacementDone peers select', { nodeId, day, exclude: placement.id });
  const peers = await supabase
    .from('focus_placements')
    .select('id, done_at')
    .eq('node_id', nodeId)
    .eq('date', day)
    .not('done_at', 'is', null)
    .neq('id', placement.id);
  peersLog(peers);
  if (peers.error) throw peers.error;

  if (!(peers.data || []).length) {
    console.log('[schedule-api] setPlacementDone → unlogTask (no peer still done)', { nodeId, day });
    await unlogTask(nodeRow, day);
  } else {
    console.log('[schedule-api] setPlacementDone → day mark KEPT', { nodeId, day, peers: peers.data.length });
  }

  // ── 3. drop the newest execution of that node on that day ──
  const exLog = logRaw('setPlacementDone executions select', { nodeId, day });
  const ex = await supabase
    .from('focus_executions')
    .select('id, created_at')
    .eq('node_id', nodeId)
    .eq('day', day)
    .order('created_at', { ascending: false })
    .limit(1);
  exLog(ex);
  const victim = (ex.data || [])[0];
  if (victim) {
    const delLog = logRaw('setPlacementDone executions delete', { id: victim.id });
    delLog(await supabase.from('focus_executions').delete().eq('id', victim.id).select('id'));
  }
  return res.data;
}

// ─── Rollover ─────────────────────────────────────────────────────
// An undone placement whose day has passed moves to today, so the schedule
// never silently loses work. Deliberately narrow:
//   • one-offs only — a missed recurring day is not owed today, it simply did
//     not happen, and the week maths already knows
//   • not already done
//   • the time of day is kept, so a 09:00 block stays a 09:00 block
export function overduePlacements(placements = [], today = isoDate()) {
  return placements.filter(p =>
    !p.done_at &&
    !p.node?.frequency &&
    dateOf(p) < today);
}

export async function rolloverOverdue(placements = [], today = isoDate()) {
  const stale = overduePlacements(placements, today);
  for (const p of stale) {
    try { await movePlacement(p.id, today, startOf(p)); }
    catch { /* one failure must not block the rest of the rollover */ }
  }
  return stale;
}

// Run the rollover at most once per calendar day per device. The guard is a
// localStorage stamp, not a DB flag: re-running it is harmless.
const ROLL_KEY = 'personal_rollover_day';
export async function rolloverOncePerDay(placements = [], today = isoDate()) {
  try { if (localStorage.getItem(ROLL_KEY) === today) return []; } catch { /* private mode */ }
  const moved = await rolloverOverdue(placements, today);
  try { localStorage.setItem(ROLL_KEY, today); } catch { /* private mode */ }
  return moved;
}

// ─── Does this task belong on this date? ──────────────────────────
// Still node-level, and still needed: the "X/Y שובצו" denominator asks which
// tasks are DUE in a period, which is a property of the task, not of any
// placement. For a one-off this now reads due_date first — task_date is no
// longer written by anything.
export function occursOn(node, date) {
  if (!node || node.node_type !== 'task') return false;
  if (node.status && node.status !== 'active') return false;
  if (node.frequency === 'daily') return true;
  if (node.frequency === 'weekly') return node.day_of_week === dowOf(date);
  if (node.frequency === 'monthly') return new Date(date + 'T00:00:00').getDate() === 1;
  return String(node.due_date || node.task_date || '').slice(0, 10) === date;
}

// ─── Free-slot maths for the day view ─────────────────────────────
export function hourState(h, itemCount, { date, today = isoDate(), nowHour = null }) {
  if (itemCount > 0) return 'busy';
  if (date < today) return 'past';
  if (date === today && nowHour != null && h < nowHour) return 'past';
  return 'free';
}

// ─── Week / month grids ───────────────────────────────────────────
export const weekOf = (date) => weekDays(date);

// The month as the weeks it ACTUALLY spans — 5 for most, 6 when the month
// starts late in the week. A fixed 42 cells would force a sixth row that is
// usually empty, and the month view has to fit without scrolling.
export function monthWeeks(date) {
  const d = new Date(date + 'T00:00:00');
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const start = addDays(isoDate(first), -first.getDay());     // back to Sunday
  const weeks = Math.ceil((first.getDay() + daysInMonth) / 7);
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, i) => addDays(start, w * 7 + i)));
}

export const monthGrid = (date) => monthWeeks(date).flat();

export const sameMonth = (a, b) => a.slice(0, 7) === b.slice(0, 7);

// Every real day of the month `date` falls in — not the 42-cell grid, which
// carries neighbouring months in its corners.
export function monthDays(date) {
  const d = new Date(date + 'T00:00:00');
  const n = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const first = `${date.slice(0, 7)}-`;
  return Array.from({ length: n }, (_, i) => first + pad2(i + 1));
}

// The days the current view is showing: the week, or the month.
export const periodDays = (date = isoDate(), view = 'day') =>
  (view === 'month' ? monthDays(date) : weekDays(date));

// ─── "X/Y שובצו" ──────────────────────────────────────────────────
// Y = tasks that genuinely OCCUR somewhere in the visible period.
// X = how many of those have at least one placement inside it.
// Both numbers still run through occursOn, so the bar and the cells agree;
// only the numerator changed source, from a task_time column to the rows.
export function schedulingProgress(nodes = [], placements = [], { date = isoDate(), view = 'day' } = {}) {
  const days = periodDays(date, view);
  const inPeriod = new Set(days);
  const placedIds = new Set(placements.filter(p => inPeriod.has(dateOf(p))).map(p => p.node_id));
  const live = nodes.filter(n => n.node_type === 'task' && (!n.status || n.status === 'active'));
  const relevant = live.filter(n => days.some(d => occursOn(n, d)));
  const scheduled = relevant.filter(n => placedIds.has(n.id));
  return { done: scheduled.length, total: relevant.length };
}
