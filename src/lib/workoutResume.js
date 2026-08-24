// ────────────────────────────────────────────────────────────────
// "Put me back where I was" for the trainee workout screen.
//
// A workout is done with a phone in one hand: the screen locks, a call
// comes in, the app is swiped away. Coming back to the top of the plan
// with an empty form is the difference between finishing a workout and
// abandoning it. This module keeps a small resume point in
// localStorage — which plan, which exercise, which set, where the page
// was scrolled to, and a draft of any values not yet committed.
//
// localStorage only. Nothing here touches the DB: the draft is a
// safety net UNDER the existing save paths, never a replacement for
// them. If the DB already has a value, the DB wins on restore.
// ────────────────────────────────────────────────────────────────

const PREFIX = 'athletigo_workout_resume_';
// A resume point older than this is stale — a workout from last week
// should not reopen mid-set today.
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

const keyFor = (planId) => `${PREFIX}${planId}`;

export function readResume(planId) {
  if (!planId || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(keyFor(planId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const age = Date.now() - (Number(parsed.savedAt) || 0);
    if (!Number.isFinite(age) || age > MAX_AGE_MS) {
      localStorage.removeItem(keyFor(planId));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

// point: { exerciseId, setIdx, sectionId, scrollY, draft }
// Called on every change, so it stays cheap and never throws — a full
// or disabled localStorage must not break the workout screen.
export function writeResume(planId, point) {
  if (!planId || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(keyFor(planId), JSON.stringify({
      ...point,
      planId,
      savedAt: Date.now(),
    }));
  } catch {
    /* quota / private mode — the DB save paths are unaffected */
  }
}

export function clearResume(planId) {
  if (!planId || typeof localStorage === 'undefined') return;
  try { localStorage.removeItem(keyFor(planId)); } catch { /* ignore */ }
}

// Merge a draft under already-hydrated DB state. The DB is the source
// of truth for anything it holds; the draft only fills gaps — a value
// the trainee typed while offline, or in the seconds before a crash.
// Returns a NEW object; never mutates either input.
export function mergeDraftUnder(dbLogs, draft) {
  const base = dbLogs && typeof dbLogs === 'object' ? dbLogs : {};
  if (!draft || typeof draft !== 'object') return base;

  const out = { ...base };
  for (const [exId, sets] of Object.entries(draft)) {
    if (!sets || typeof sets !== 'object') continue;
    const existingEx = out[exId] || {};
    const mergedEx = { ...existingEx };
    for (const [setIdx, draftRow] of Object.entries(sets)) {
      if (!draftRow || typeof draftRow !== 'object') continue;
      const dbRow = existingEx[setIdx];
      if (!dbRow) { mergedEx[setIdx] = { ...draftRow }; continue; }
      // Field by field: keep the DB value when it holds one, otherwise
      // take the draft's.
      const merged = { ...dbRow };
      for (const [field, val] of Object.entries(draftRow)) {
        const dbVal = dbRow[field];
        if (dbVal == null || dbVal === '') merged[field] = val;
      }
      mergedEx[setIdx] = merged;
    }
    out[exId] = mergedEx;
  }
  return out;
}

// Does this draft hold anything a save has not yet taken? Drives the
// "you have unsaved values" exit guard.
export function draftHasValues(draft) {
  if (!draft || typeof draft !== 'object') return false;
  for (const sets of Object.values(draft)) {
    if (!sets || typeof sets !== 'object') continue;
    for (const row of Object.values(sets)) {
      if (!row || typeof row !== 'object') continue;
      if (row.reps_completed != null && row.reps_completed !== '') return true;
      if (row.time_completed != null && row.time_completed !== '') return true;
      if (row.weight_used != null && row.weight_used !== '') return true;
    }
  }
  return false;
}

// ────────────────────────────────────────────────────────────────
// Where the trainee actually IS: which plan, and whether the workout
// sheet itself is open.
//
// This is separate from the resume point above, and it has to be,
// because the resume point can only be written while
// UnifiedPlanBuilder is mounted — and the whole problem is that after
// the screen goes off, it isn't. Something has to say "there was a
// workout open" before any of that code runs.
//
// localStorage, deliberately. The workout screen used to be remembered
// in sessionStorage, which does not survive the Android WebView being
// killed — exactly the case this is for. sessionStorage also only ever
// recorded the plan FOLDER, never that the sheet was open inside it,
// so even a plain reload dropped the trainee back to the folder page.
// ────────────────────────────────────────────────────────────────

const OPEN_KEY = 'athletigo_open_workout';

export function readOpenWorkout() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(OPEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.planId) return null;
    const age = Date.now() - (Number(parsed.savedAt) || 0);
    if (!Number.isFinite(age) || age > MAX_AGE_MS) {
      localStorage.removeItem(OPEN_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

// active = true means the workout sheet is open, not just the folder.
export function writeOpenWorkout(planId, active) {
  if (!planId || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(OPEN_KEY, JSON.stringify({
      planId, active: !!active, savedAt: Date.now(),
    }));
  } catch {
    /* quota / private mode */
  }
}

export function clearOpenWorkout() {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.removeItem(OPEN_KEY); } catch { /* ignore */ }
}

// ────────────────────────────────────────────────────────────────
// One-shot "open on the graph" request.
//
// The finish dialog's "צפה בתוצאות" used to save and drop the trainee
// at the top of the plan folder, with the graph collapsed several
// scrolls below — four taps between finishing a workout and seeing
// what it did to the trend. This flag carries the intent across the
// unmount: set on the way out, consumed once on the way in.
//
// sessionStorage is right here, unlike the resume pointer: this is a
// single navigation inside one session, not a state that has to
// survive the app being killed.
// ────────────────────────────────────────────────────────────────

const GRAPH_FOCUS_KEY = 'athletigo_focus_graph';

export function requestGraphFocus() {
  if (typeof sessionStorage === 'undefined') return;
  try { sessionStorage.setItem(GRAPH_FOCUS_KEY, '1'); } catch { /* ignore */ }
}

// Reads AND clears — a request is honoured exactly once.
export function takeGraphFocus() {
  if (typeof sessionStorage === 'undefined') return false;
  try {
    const v = sessionStorage.getItem(GRAPH_FOCUS_KEY);
    if (v) sessionStorage.removeItem(GRAPH_FOCUS_KEY);
    return !!v;
  } catch {
    return false;
  }
}
