// ═══════════════════════════════════════════════════════════════════
// Priority engine — what is the next move, right now
// ═══════════════════════════════════════════════════════════════════
// score = life_impact * 3
//       + (task_kind === 'recurring' ? 4 : 0)
//       + urgency          (overdue/today 4, ≤3 days 3, ≤7 days 2, later 1, none 0)
//       + (is_fear_task ? 3 : 0)          ← the schema's name for "courage"
//       + min(defer_count, 3)
//       + domainBoost      (+2 when the branch had no execution in 3 days)
//
// Applied AFTER scoring, as a hard rule: a ONEOFF outranks a RECURRING node
// only if its due_date is today or in the past. A oneoff with no due date, or
// one due in the future, can never be proposed above a recurring node however
// high it scores. Tie-break: lower net_minutes first.
//
// net_minutes = 0 is a CONTRACT, not a duration: "tracked only, never
// proposed". Such a node is a passive STATE (sleeping seven hours), scored and
// shown on the board like any other habit, but excluded from pickNextMove —
// including from the oversized fallback — and never offered as a mode task.
//
// A habit that already met weekly_target this week stops receiving the
// domainBoost but stays fully available.
// ═══════════════════════════════════════════════════════════════════

import { isoDate, addDays } from './focus-api';

// The three time windows the day screen offers.
export const WINDOWS = [15, 60, 240];
export const DEFAULT_WINDOW = 60;

// How many moves a day can hold, by declared capacity.
export const CAPACITY_CAP = { full: Infinity, busy: 2, broken: 1 };
export const capacityCap = (capacity) => CAPACITY_CAP[capacity] ?? Infinity;

export const DOMAIN_STALE_DAYS = 3;
export const DEFER_COURAGE_AT = 3;   // defer_count hitting this flips is_fear_task

// ── Node predicates ───────────────────────────────────────────────
// A passive state: tracked, never proposed.
export const isPassive = (node) => Number(node?.net_minutes ?? 30) === 0;
export const isOneoff = (node) => node?.task_kind === 'oneoff';
export const isRecurring = (node) => !isOneoff(node);
export const netMinutes = (node) => Number(node?.net_minutes ?? 30);

// Open = an active task that is not already done. Bank items and inspiration
// items are metadata leaves, never proposable moves.
export function isOpen(node, { doneIds = new Set() } = {}) {
  if (!node || node.node_type !== 'task') return false;
  if (node.status && node.status !== 'active') return false;
  const tags = node.tags || [];
  if (tags.includes('בנק') || tags.includes('השראה')) return false;
  return !doneIds.has(node.id);
}

// ── Urgency from due_date ─────────────────────────────────────────
export function urgencyOf(node, today = isoDate()) {
  const due = node?.due_date ? String(node.due_date).slice(0, 10) : null;
  if (!due) return 0;
  if (due <= today) return 4;                      // overdue or due today
  if (due <= addDays(today, 3)) return 3;
  if (due <= addDays(today, 7)) return 2;
  return 1;
}

// ── Score, component by component ─────────────────────────────────
// ctx: { today, branchIdOf(node), lastBranchExec: {branchId: iso},
//        metThisWeek: Set<nodeId> }
export function scoreParts(node, ctx = {}) {
  const today = ctx.today || isoDate();
  const impact = Math.max(0, Number(node?.life_impact ?? 3));
  const branchId = ctx.branchIdOf ? ctx.branchIdOf(node) : node?.__branchId;
  const lastExec = branchId ? (ctx.lastBranchExec || {})[branchId] : null;
  const met = ctx.metThisWeek instanceof Set ? ctx.metThisWeek.has(node?.id) : false;
  // Stale = the whole branch has had no execution for DOMAIN_STALE_DAYS. A habit
  // that already met its weekly target forfeits the boost (it stays available).
  const stale = !met && (!lastExec || lastExec < addDays(today, -DOMAIN_STALE_DAYS));

  return {
    lifeImpact: impact * 3,
    recurring: isRecurring(node) ? 4 : 0,
    urgency: urgencyOf(node, today),
    courage: node?.is_fear_task ? 3 : 0,           // schema column for "courage"
    deferred: Math.min(Number(node?.defer_count || 0), 3),
    domainBoost: stale ? 2 : 0,
  };
}

export function scoreNode(node, ctx = {}) {
  const p = scoreParts(node, ctx);
  return p.lifeImpact + p.recurring + p.urgency + p.courage + p.deferred + p.domainBoost;
}

// Log-friendly breakdown — used by the report and by debugging.
export function explainScore(node, ctx = {}) {
  const parts = scoreParts(node, ctx);
  return {
    title: node?.title,
    task_kind: node?.task_kind || 'recurring',
    net_minutes: netMinutes(node),
    due_date: node?.due_date || null,
    is_fear_task: !!node?.is_fear_task,
    parts,
    total: Object.values(parts).reduce((a, b) => a + b, 0),
    tier: tierOf(node, ctx.today || isoDate()),
  };
}

// ── The hard rule, as a sort tier ─────────────────────────────────
// tier 1: recurring nodes, and oneoffs whose due_date is today or past.
// tier 0: every other oneoff (no due date, or due in the future).
// Sorting by tier first means a not-yet-due oneoff can never outrank a
// recurring node, whatever it scores.
export function tierOf(node, today = isoDate()) {
  if (isRecurring(node)) return 1;
  const due = node?.due_date ? String(node.due_date).slice(0, 10) : null;
  return due && due <= today ? 1 : 0;
}

// Ranked candidates, best first: tier desc → score desc → net_minutes asc.
export function rankNodes(nodes = [], ctx = {}) {
  const today = ctx.today || isoDate();
  return nodes
    .map(n => ({ node: n, score: scoreNode(n, ctx), tier: tierOf(n, today) }))
    .sort((a, b) =>
      (b.tier - a.tier) ||
      (b.score - a.score) ||
      (netMinutes(a.node) - netMinutes(b.node)) ||
      String(a.node.title || '').localeCompare(String(b.node.title || ''))
    );
}

// ── The next move ─────────────────────────────────────────────────
// ctx: { window, capacity, movesDone, today, doneIds, branchIdOf,
//        lastBranchExec, metThisWeek, excludeIds }
// Returns:
//   { node, score, parts, oversized:false }            a real fit
//   { node, score, parts, oversized:true }             nothing fit the window
//   { capped:true, cap, movesDone }                     the day is full
//   null                                                nothing open at all
export function pickNextMove(nodes = [], ctx = {}) {
  const today = ctx.today || isoDate();
  const window = Number(ctx.window || DEFAULT_WINDOW);
  const cap = capacityCap(ctx.capacity || 'full');
  const movesDone = Number(ctx.movesDone || 0);
  if (movesDone >= cap) return { capped: true, cap, movesDone };

  const exclude = ctx.excludeIds instanceof Set ? ctx.excludeIds : new Set(ctx.excludeIds || []);
  // Passive nodes (net_minutes 0) are filtered out HERE, before any ranking,
  // so they can reach neither the candidate list nor the fallback below.
  const open = nodes.filter(n =>
    isOpen(n, ctx) && !isPassive(n) && !exclude.has(n.id));
  if (!open.length) return null;

  const fits = open.filter(n => netMinutes(n) <= window);
  if (fits.length) {
    const best = rankNodes(fits, { ...ctx, today })[0];
    return { node: best.node, score: best.score, parts: scoreParts(best.node, { ...ctx, today }), oversized: false };
  }

  // Nothing fits the window → the smallest open node, flagged oversized.
  // Still drawn from `open`, so a passive node can never surface this way.
  const smallest = [...open].sort((a, b) =>
    (netMinutes(a) - netMinutes(b)) || (scoreNode(b, ctx) - scoreNode(a, ctx)))[0];
  return {
    node: smallest,
    score: scoreNode(smallest, { ...ctx, today }),
    parts: scoreParts(smallest, { ...ctx, today }),
    oversized: true,
  };
}

// Top N proposable nodes — powers the opportunity sheet.
export function topMoves(nodes = [], ctx = {}, n = 3) {
  const exclude = ctx.excludeIds instanceof Set ? ctx.excludeIds : new Set(ctx.excludeIds || []);
  const open = nodes.filter(x => isOpen(x, ctx) && !isPassive(x) && !exclude.has(x.id));
  const windowed = ctx.window ? open.filter(x => netMinutes(x) <= Number(ctx.window)) : open;
  return rankNodes(windowed.length ? windowed : open, ctx).slice(0, n);
}

// ── Filming day suggestion ────────────────────────────────────────
// Heuristic (the spec gave the signature, not the rule): filming is a batch
// job, so it wants the emptiest day still ahead this week. For every remaining
// day we count how many executions already sit there historically on the same
// weekday, and propose the lightest one. Returns null when the filming habit
// has already met its weekly target.
export function suggestFilmingDay(nodes = [], { executions = [], date = isoDate(), dayStates = [], titleMatch = /צילום/ } = {}) {
  const filming = nodes.find(n => n.node_type === 'task' && titleMatch.test(String(n.title || '')) && !isPassive(n));
  if (!filming) return null;

  const broken = new Set((dayStates || [])
    .filter(d => d?.capacity === 'broken').map(d => String(d.day).slice(0, 10)));
  // Remaining days of this week, today included, minus broken days.
  const dow = new Date(date + 'T00:00:00').getDay();
  const remaining = [];
  for (let i = 0; i <= 6 - dow; i++) {
    const d = addDays(date, i);
    if (!broken.has(d)) remaining.push(d);
  }
  if (!remaining.length) return null;

  const target = Math.max(1, Number(filming.weekly_target ?? 1));
  const doneThisWeek = (executions || []).filter(e => e.node_id === filming.id &&
    remaining.includes(String(e.day).slice(0, 10))).length;
  if (doneThisWeek >= target) return null;

  // Historical load per weekday, so "lightest" means lightest for this user.
  const loadByDow = [0, 0, 0, 0, 0, 0, 0];
  (executions || []).forEach(e => {
    const d = String(e.day || '').slice(0, 10);
    if (d) loadByDow[new Date(d + 'T00:00:00').getDay()]++;
  });
  const best = [...remaining].sort((a, b) =>
    (loadByDow[new Date(a + 'T00:00:00').getDay()] - loadByDow[new Date(b + 'T00:00:00').getDay()]) ||
    a.localeCompare(b))[0];

  return { node: filming, day: best, remaining: target - doneThisWeek };
}
