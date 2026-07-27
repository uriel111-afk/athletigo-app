// ═══════════════════════════════════════════════════════════════════
// Scheduling — placing an EXISTING task in the day, never copying it
// ═══════════════════════════════════════════════════════════════════
// The single most important rule of this layer: a task exists ONCE, in
// focus_nodes. Putting it in the schedule is not a new row anywhere — it is
// two columns on that same node, task_date + task_time, which have existed
// since migrations/focus_map.sql. So:
//
//   • the calendar block and the habit-matrix row are the SAME node id
//   • ticking it in either place writes the same focus_task_logs row
//   • renaming, deleting or re-scheduling it happens in exactly one place
//
// There is deliberately no "scheduled_items" table. A join table would let the
// two views drift apart, which is the bug this design exists to prevent.
//
// Recurring vs one-off, and what task_date means for each:
//   • one-off   — task_date IS the day it is due to happen. Rollover moves it.
//   • recurring — the day comes from frequency (daily / weekly+day_of_week /
//                 monthly), NOT from task_date. task_time is still honoured, so
//                 a daily habit set to 07:00 shows at 07:00 every day. Rollover
//                 must never touch these: "yesterday's run" is not owed today,
//                 it simply did not happen, and the week maths already knows.
// ═══════════════════════════════════════════════════════════════════

import { isoDate, addDays, weekDays, updateNode, dowOf } from './focus-api';

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
// The pinch zoom splits an hour into four. No schema change is involved:
// task_time is a `time` column, so ':15' is simply a value it could always
// hold. Quarter 0..3 ↔ minutes 0/15/30/45.
export const QUARTERS = [0, 1, 2, 3];
export const minuteOf = (t) => (t ? parseInt(String(t).slice(3, 5), 10) : null);
export const quarterOf = (t) => {
  const m = minuteOf(t);
  return m == null ? null : Math.floor(m / 15);
};
export const timeLabel = (h, q = 0) => `${pad2(h)}:${pad2(q * 15)}`;

// Tasks sitting in one quarter of one hour.
export const itemsAtQuarter = (timed, h, q) =>
  timed.filter(n => hourOf(n.task_time) === h && (quarterOf(n.task_time) ?? 0) === q);

// ─── Default duration ─────────────────────────────────────────────
// net_minutes already carries "how long this actually takes" (Stage 1), so a
// task brings its own default and scheduling never has to ask. 0 is a real
// value there — the "tracked only" contract — so it falls back to the slot
// size rather than being treated as missing.
export const DEFAULT_DURATION = 30;
export function durationOf(node) {
  const n = Number(node?.net_minutes);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DURATION;
}
// How many 15-minute rows a block covers, at least one.
export const slotSpan = (node) => Math.max(1, Math.round(durationOf(node) / 15));

// ─── Does this task belong on this date? ──────────────────────────
// Mirrors taskExpectedOn for recurring nodes and adds the one-off case, so the
// calendar and the matrix agree on which days a habit is "due".
export function occursOn(node, date) {
  if (!node || node.node_type !== 'task') return false;
  if (node.status && node.status !== 'active') return false;
  if (node.frequency === 'daily') return true;
  if (node.frequency === 'weekly') return node.day_of_week === dowOf(date);
  if (node.frequency === 'monthly') return new Date(date + 'T00:00:00').getDate() === 1;
  return String(node.task_date || '').slice(0, 10) === date;
}

// Actually PLACED on a date: it occurs that day AND carries an hour. This is
// the predicate for anything that claims "there is something at this time" —
// the month dots most of all. occursOn alone is true for every recurring habit
// on every day, so a month drawn from it dotted all 30 cells whether or not a
// single thing had been scheduled, which made the month view unreadable.
export const placedOn = (node, date) => occursOn(node, date) && !!node.task_time;

// Everything due on a date, split by whether it has a time yet.
export function dayItems(nodes = [], date, { excludeIds = new Set() } = {}) {
  const due = nodes.filter(n => occursOn(n, date) && !excludeIds.has(n.id));
  return {
    timed: due.filter(n => n.task_time).sort((a, b) => String(a.task_time).localeCompare(String(b.task_time))),
    untimed: due.filter(n => !n.task_time),
  };
}

// Tasks sitting at a given hour of a date.
export const itemsAtHour = (timed, h) => timed.filter(n => hourOf(n.task_time) === h);

// ─── Writes ───────────────────────────────────────────────────────
// Place a task at a time. For a one-off this also pins the DAY; for a
// recurring habit the day keeps coming from its frequency, so only the time is
// written (writing task_date on a daily habit would be meaningless noise).
export async function scheduleTask(node, date, hour, quarter = 0) {
  const patch = { task_time: timeLabel(hour, quarter) };
  if (!node.frequency) patch.task_date = date;
  await updateNode(node.id, patch);
  return patch;
}

// Take it back out of the hour grid. The task itself is untouched — it simply
// has no time yet, so it lands back in the drawer.
export async function unscheduleTask(node) {
  await updateNode(node.id, { task_time: null });
}

// Put a cleared time back, byte for byte. This is the undo of unscheduleTask:
// removing a block is one tap with no dialog, so the way back has to be exact
// and just as cheap — no re-deriving an hour from a grid row.
export async function restoreTaskTime(node, time) {
  await updateNode(node.id, { task_time: time || null });
}

// Undo of a placement. Both columns go back together, because scheduleTask
// writes both for a one-off — restoring only the time would leave a task on
// whatever day the drag moved it to.
export async function restorePlacement(node, prev = {}) {
  await updateNode(node.id, {
    task_date: prev.task_date ?? null,
    task_time: prev.task_time ?? null,
  });
}

// What a placement looked like before it was changed, for the undo above.
export const placementOf = (node) => ({
  task_date: node?.task_date ?? null,
  task_time: node?.task_time ?? null,
});

// Move a one-off to another day (used by the month view and by rollover).
export async function moveTaskToDay(node, date) {
  if (node.frequency) return;              // recurring days come from frequency
  await updateNode(node.id, { task_date: date });
}

// ─── Rollover ─────────────────────────────────────────────────────
// An undone one-off whose day has passed moves to today, so the schedule never
// silently loses work. Deliberately narrow:
//   • one-offs only (see the header note on recurring habits)
//   • status still 'active' — logTask() flips a one-off to 'done', so anything
//     already completed is excluded by that alone
//   • the time of day is kept, so a 09:00 task stays a 09:00 task
// Returns the nodes it moved, for the caller to report.
export function overdueOneoffs(nodes = [], today = isoDate()) {
  return nodes.filter(n =>
    n.node_type === 'task' &&
    (!n.status || n.status === 'active') &&
    !n.frequency &&
    n.task_date &&
    String(n.task_date).slice(0, 10) < today);
}

export async function rolloverOverdue(nodes = [], today = isoDate()) {
  const stale = overdueOneoffs(nodes, today);
  for (const n of stale) {
    try { await updateNode(n.id, { task_date: today }); }
    catch { /* one failure must not block the rest of the rollover */ }
  }
  return stale;
}

// Run the rollover at most once per calendar day per device. The guard is a
// localStorage stamp, not a DB flag: re-running it is harmless (the same rows
// would just be written again), so a cheap client-side guard is enough.
const ROLL_KEY = 'personal_rollover_day';
export async function rolloverOncePerDay(nodes = [], today = isoDate()) {
  try { if (localStorage.getItem(ROLL_KEY) === today) return []; } catch { /* private mode */ }
  const moved = await rolloverOverdue(nodes, today);
  try { localStorage.setItem(ROLL_KEY, today); } catch { /* private mode */ }
  return moved;
}

// ─── Free-slot maths for the day view ─────────────────────────────
// An hour is free when nothing is placed in it. Past hours of TODAY are marked
// separately so the UI can grey them instead of inviting a drop into the past.
export function hourState(h, itemCount, { date, today = isoDate(), nowHour = null }) {
  if (itemCount > 0) return 'busy';
  if (date < today) return 'past';
  if (date === today && nowHour != null && h < nowHour) return 'past';
  return 'free';
}

// ─── Week / month grids ───────────────────────────────────────────
export const weekOf = (date) => weekDays(date);

// The month as the weeks it ACTUALLY spans — 5 for most, 6 when the month
// starts late in the week. Returning a fixed 42 cells would force a sixth row
// that is usually empty, and the month view has to fit the screen without
// scrolling, so that wasted row is the difference between fitting and not.
export function monthWeeks(date) {
  const d = new Date(date + 'T00:00:00');
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const start = addDays(isoDate(first), -first.getDay());     // back to Sunday
  const weeks = Math.ceil((first.getDay() + daysInMonth) / 7);
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, i) => addDays(start, w * 7 + i)));
}

// Flat form, kept for callers that just want the cells.
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
// X = how many of those carry a task_time — i.e. exactly the tasks the month
//     view draws a dot for.
//
// Both numbers now run through occursOn, the same predicate the grid and the
// dots use, so the bar and the cells can no longer disagree. The old rule
// counted `frequency ? true : …`, which put EVERY recurring habit in the
// denominator whether or not it fell inside the period — a habit due only on
// Tuesdays inflated a week it never appeared in.
export function schedulingProgress(nodes = [], { date = isoDate(), view = 'day' } = {}) {
  const days = periodDays(date, view);
  const live = nodes.filter(n => n.node_type === 'task' && (!n.status || n.status === 'active'));
  const relevant = live.filter(n => days.some(d => occursOn(n, d)));
  const scheduled = relevant.filter(n => !!n.task_time);
  return { done: scheduled.length, total: relevant.length };
}
