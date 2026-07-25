// ═══════════════════════════════════════════════════════════════════
// Week maths for the personal habits — executions, not day-marks
// ═══════════════════════════════════════════════════════════════════
// The habit matrix keeps working off focus_task_logs (one row per day,
// done/skipped). THIS module works off focus_executions, where several rows
// per node per day are legal, and answers the weekly questions:
//
//   measure_mode 'count' → how many EXECUTIONS happened this week
//   measure_mode 'days'  → how many DISTINCT DAYS had at least one execution
//
// A week is MET when the count reaches weekly_target, regardless of how the
// executions are spread across the days.
//
// Two rules apply on top:
//   • Grace day — one per habit per week. A week that finishes exactly one
//     short of target does not break the streak (it is not "met", but the
//     streak survives). Two or more short breaks it.
//   • Broken days are excluded ENTIRELY: a day whose focus_day_state.capacity
//     is 'broken' contributes nothing to the count and is not treated as a
//     missed day either. It is as if the day did not exist.
// ═══════════════════════════════════════════════════════════════════

import { isoDate, addDays, weekDays } from './focus-api';

export const GRACE_DAYS_PER_WEEK = 1;

const dayOf = (e) => String(e?.day || '').slice(0, 10);
const targetOf = (node) => Math.max(1, Number(node?.weekly_target ?? 1));
export const measureOf = (node) => (node?.measure_mode === 'days' ? 'days' : 'count');

// Set of 'YYYY-MM-DD' the user marked as a broken day. Accepts either an array
// of focus_day_state rows or an already-built Set.
export function brokenSet(dayStates) {
  if (dayStates instanceof Set) return dayStates;
  return new Set((dayStates || [])
    .filter(d => d && d.capacity === 'broken')
    .map(d => String(d.day).slice(0, 10)));
}

// The 7 ISO dates of the week containing `date`, minus broken days.
export function liveWeekDays(date = isoDate(), broken = new Set()) {
  return weekDays(date).filter(d => !broken.has(d));
}

// ── The core count ────────────────────────────────────────────────
// 'count' → total executions in the week; 'days' → distinct days with ≥1.
// Broken days never contribute.
export function countThisWeek(node, executions = [], { date = isoDate(), dayStates = [] } = {}) {
  if (!node?.id) return 0;
  const broken = brokenSet(dayStates);
  const week = new Set(liveWeekDays(date, broken));
  const mine = (executions || []).filter(e => e.node_id === node.id && week.has(dayOf(e)));
  if (measureOf(node) === 'days') return new Set(mine.map(dayOf)).size;
  return mine.length;
}

// Met = the count reached the target. Spread does not matter.
export function isWeekMet(node, executions = [], opts = {}) {
  return countThisWeek(node, executions, opts) >= targetOf(node);
}

// How far off target this week is (0 when met or over).
export function shortfall(node, executions = [], opts = {}) {
  return Math.max(0, targetOf(node) - countThisWeek(node, executions, opts));
}

// Did this week survive on the grace day? (exactly one short of target)
export function usedGrace(node, executions = [], opts = {}) {
  return shortfall(node, executions, opts) === GRACE_DAYS_PER_WEEK;
}

// A week keeps a streak alive when it is met OR when it is within the single
// grace day. The CURRENT (in-progress) week never breaks a streak.
export function weekKeepsStreak(node, executions, opts = {}) {
  return shortfall(node, executions, opts) <= GRACE_DAYS_PER_WEEK;
}

// Consecutive weeks (walking back from `date`) that kept the streak alive.
// The in-progress week counts only once actually met, and never breaks it.
export function streakWeeks(node, executions = [], { date = isoDate(), dayStates = [], maxWeeks = 104 } = {}) {
  if (!node?.id) return 0;
  let streak = 0;
  let cursor = weekDays(date)[0];
  let first = true;
  for (let i = 0; i < maxWeeks; i++) {
    const opts = { date: cursor, dayStates };
    if (first) {
      if (isWeekMet(node, executions, opts)) streak++;
      first = false;
    } else if (isWeekMet(node, executions, opts)) {
      streak++;
    } else if (weekKeepsStreak(node, executions, opts)) {
      // Grace: the streak survives this week but the week itself adds nothing.
    } else {
      break;
    }
    cursor = addDays(cursor, -7);
  }
  return streak;
}

// ── Display helper for the board rows ─────────────────────────────
// '3/5' for 'count', '4/6 ימים' for 'days'.
export function weekProgressLabel(node, executions = [], opts = {}) {
  const n = countThisWeek(node, executions, opts);
  const t = targetOf(node);
  return measureOf(node) === 'days' ? `${n}/${t} ימים` : `${n}/${t}`;
}

// Map of nodeId → { count, target, met, label } for a whole habit list, so a
// screen can render every row without re-scanning the executions each time.
export function weekProgressMap(nodes = [], executions = [], opts = {}) {
  const out = {};
  nodes.forEach(n => {
    const count = countThisWeek(n, executions, opts);
    const target = targetOf(n);
    out[n.id] = {
      count, target,
      met: count >= target,
      mode: measureOf(n),
      label: measureOf(n) === 'days' ? `${count}/${target} ימים` : `${count}/${target}`,
    };
  });
  return out;
}

// ── Per-cell execution counts for the matrix ──────────────────────
// 'nodeId|YYYY-MM-DD' → how many executions that day. The matrix renders the
// number inside the cell when it is 2 or more.
export function execCountMap(executions = []) {
  const m = {};
  (executions || []).forEach(e => {
    if (!e?.node_id) return;
    const k = `${e.node_id}|${dayOf(e)}`;
    m[k] = (m[k] || 0) + 1;
  });
  return m;
}

// Minutes invested per node this week (for the review screens later).
export function minutesThisWeek(node, executions = [], { date = isoDate(), dayStates = [] } = {}) {
  const broken = brokenSet(dayStates);
  const week = new Set(liveWeekDays(date, broken));
  return (executions || []).reduce((s, e) => (
    e.node_id === node?.id && week.has(dayOf(e)) ? s + Number(e.minutes || 0) : s
  ), 0);
}
