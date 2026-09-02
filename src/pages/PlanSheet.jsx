import React, { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import { AuthContext } from '@/lib/AuthContext';
import PageLoader from '@/components/PageLoader';
import { getMethodByMode } from '@/constants/trainingMethods';
import {
  measurementKind,
  subMeasurementKind,
  innerExercisesOf,
  isContainer,
  isTabataContainer,
  has,
} from '@/lib/exerciseMeasurement';
import { parseTabataData } from '@/lib/tabataSettings';
import { saveSetActual } from '@/lib/plannedSets';
import { duplicatePlan } from '@/lib/plansApi';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

/**
 * PlanSheet — the workout execution screen, laid out like the printed
 * AthletiGo plan sheet.
 *
 * One open form, top to bottom. Nothing collapses, nothing expands.
 * Each section is two columns: a narrow beige label rail on the RIGHT
 * (RTL reading order) and the exercise rows on the left.
 *
 * DATA — every column already exists; no schema change, no migration.
 *   plan      → training_plans
 *   sections  → training_sections   (training_plan_id, section_name, "order")
 *   exercises → exercises           (training_section_id, "order")
 *   results   → exercise_set_logs   via saveSetActual(), parented by
 *               workout_executions
 *   feeling   → workout_executions.self_rating (one value per workout)
 *
 * There is NO measurement-type column. The type is derived at read time
 * by measurementKind() in src/lib/exerciseMeasurement.js — the same
 * helper WorkoutSheet imports, so the two screens cannot disagree.
 */

// ── Palette ──────────────────────────────────────────────────────────
const CREAM    = '#FBF3EA';
const CHARCOAL = '#2D2A26';
const BEIGE    = '#FDE3D2';
const ORANGE   = '#FF6F20';
const MUTED    = '#A89A88';
const WHITE    = '#FFFFFF';
// 68px so the longest Hebrew section name (תנועתיות) fits on one line
// at 11px. Tested against תנועתיות / מתיחות / גמישות / הערות / חימום / כוח.
// Section label column. 52 — Hebrew section names are short and this
// hands 8px back to the text side.
const RAIL_W   = 52;
// The FIXED entry column. Always this wide whatever the box count, so
// every row's first box lands on the same vertical line — the printed
// sheet's ruled column.
// Sized for exactly THREE boxes: 30*3 + 4*2. Up to three fit with no
// scrolling; four or more scroll horizontally inside the column, which
// keeps this width — and so keeps every row's first box on one line.
const BOX_W    = 30;
const BOX_H    = 38;
const BOX_GAP  = 4;
const ENTRY_W  = BOX_W * 3 + BOX_GAP * 2;   // 98
const TOUCH    = 44;
const ROW_H    = 46;
// No alignment line and no percentage width anywhere. The entry boxes
// sit immediately after the parameters in the same flex flow, and the
// leftover space stays empty at the card edge. A fixed 52% column could
// not hold four elements plus five boxes at 360px without clipping.

// Measurability is decided by the SECTION first, then the exercise.
// חימום / מתיחות / גמישות / תנועתיות / הערות are tick-only however
// many numbers their rows carry, because a 300-rep rope warmup does
// not belong in the progress graph. Everywhere else a row is measured
// only if it actually carries a number.
//
// The derivation itself lives in src/lib/exerciseMeasurement.js and is
// shared with WorkoutSheet, so the two screens cannot disagree — which
// is why the section is passed in rather than re-decided here.

/** "25X2" — reps X sets, capital X, plain text. */
function paramText(m) {
  if (m.kind === 'check') return '';
  if (m.kind === 'tally') return String(m.target || '');
  if (!m.target) return '';
  return m.sets > 1 ? `${m.target}X${m.sets}` : String(m.target);
}

/**
 * A note is ONLY a technical cue. If the coach's text reads like another
 * movement it belongs in its own row, so anything that looks like a list
 * of exercises is not rendered as a note.
 */
function noteOf(exercise) {
  const raw = exercise?.description || exercise?.notes || '';
  const t = String(raw).trim();
  if (!t) return '';
  if (t.includes('•') || t.includes('\n')) return '';
  return t;
}

/**
 * roundsOf — the SINGLE source for both the header count and the number
 * of entry boxes. They used to come from different expressions, so a
 * header saying 5 סבבים could sit above rows with a different box count.
 *
 * Priority on live data:
 *   exercises.rounds          superset "סופרסט" → 5
 *   exercises.sets            drop set "עליות מתח" → 7
 *   tabata_data.rounds[]      the per-round ladder, when columns are null
 *   tabata_data.planned_sets  the set ladder
 */
function roundsOf(exercise, td) {
  const n = Number(exercise?.rounds) || Number(exercise?.sets) || 0;
  if (n > 0) return n;
  if (Array.isArray(td?.rounds) && td.rounds.length) return td.rounds.length;
  if (Array.isArray(td?.planned_sets) && td.planned_sets.length) return td.planned_sets.length;
  return 1;
}

/**
 * subsOf — what a container actually holds.
 *
 *   kind "exercises" → real movements (sub_exercises / rounds[].exercises).
 *                      Each gets one box PER ROUND.
 *   kind "sets"      → a planned_sets ladder: the SAME movement at
 *                      descending loads. Those rows are sets, not
 *                      exercises, so each gets exactly ONE box and is
 *                      labelled by its variation or its set number.
 *
 * The drop set on live data has sub_exercises: 0 and a 7-entry
 * planned_sets whose items carry only { set_index, reps } — no name at
 * all. That is why every row read "תרגיל".
 */
function subsOf(exercise, td) {
  const named = (arr) => Array.isArray(arr) && arr.length ? arr : null;
  const list = named(td?.sub_exercises) || named(td?.exercises_in_rotation) || named(td?.stations);
  if (list) return { list, kind: "exercises" };
  if (Array.isArray(td?.rounds) && td.rounds.length) {
    const flat = [];
    for (const r of td.rounds) for (const e of (r?.exercises || [])) flat.push(e);
    if (flat.length) {
      // rounds[] repeats the same movements once per round — de-duplicate
      // by name so a 5-round superset lists 2 exercises, not 10.
      const seen = new Set(); const uniq = [];
      for (const e of flat) {
        const k = e?.name || e?.exercise_name || "";
        if (seen.has(k)) continue; seen.add(k); uniq.push(e);
      }
      return { list: uniq, kind: "exercises" };
    }
  }
  if (Array.isArray(td?.planned_sets) && td.planned_sets.length) {
    return { list: td.planned_sets, kind: "sets" };
  }
  return { list: [], kind: "exercises" };
}

/** A sub row label. Real name, else the set variation, else the set number. */
function subLabel(sub, kind, idx) {
  const n = sub?.exercise_name || sub?.name || sub?.variation_name;
  if (n && String(n).trim()) return String(n).trim();
  if (kind === "sets") return `סט ${sub?.set_index ?? idx + 1}`;
  return "תרגיל";
}

/**
 * A name that overflows is almost never one long name — it is a name
 * plus a clarification: "עליות מתח בשכיבה ( מוט נמוך או טבעות)". The
 * printed sheet puts the clarification on the muted line beneath, so
 * the name itself stays readable at a full size. This does the same.
 *
 * DISPLAY ONLY. The stored exercise_name is never touched — the long
 * press dialog still shows it whole, and every write still uses it.
 */
// The earliest of these wins; JS alternation already matches leftmost.
const SPLIT_AT = /[(·,]|\s-\s/;
const SPLIT_MIN = 16;

export function splitExerciseName(name) {
  const full = (name || "").trim();
  // A short name stays whole even when it holds a comma: splitting
  // "עליה לישיבה, איטי" buys no width and costs a line.
  if (full.length < SPLIT_MIN) return { head: full, tail: "" };
  const at = full.match(SPLIT_AT);
  if (!at) return { head: full, tail: "" };
  const head = full.slice(0, at.index).trim()
    .replace(/[\s,·(-]+$/, "")   // a trailing separator
    .replace(/\s*\)+$/, "")      // an unmatched closing bracket
    .trim();
  const tail = full.slice(at.index + at[0].length).trim()
    .replace(/^[\s,·)-]+/, "")
    // Brackets go everywhere in the tail, not just at its ends: a name
    // split on its first comma can leave a second, now unmatched, open
    // bracket mid-string ("וכפיפה לפנים( שפגט").
    .replace(/[()[\]]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  // A split that leaves no name is not a split.
  if (!head) return { head: full, tail: "" };
  return { head, tail };
}

/**
 * Long press — 500ms with the finger still — opens the detail dialog.
 * It is bound to the TEXT side of a row only, so the number boxes and
 * the tick button keep their ordinary tap behaviour, and a scroll
 * (more than 10px of travel) cancels it rather than firing.
 */
const LONG_PRESS_MS = 500;
const PRESS_SLOP_SQ = 100;

function PressableText({ onLongPress, style, children }) {
  const timer = useRef(null);
  const origin = useRef(null);
  const clear = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    origin.current = null;
  }, []);
  useEffect(() => clear, [clear]);
  const down = (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    clear();
    origin.current = { x: e.clientX, y: e.clientY };
    timer.current = setTimeout(() => { timer.current = null; onLongPress(); }, LONG_PRESS_MS);
  };
  const move = (e) => {
    if (!timer.current || !origin.current) return;
    const dx = e.clientX - origin.current.x;
    const dy = e.clientY - origin.current.y;
    if (dx * dx + dy * dy > PRESS_SLOP_SQ) clear();
  };
  return (
    <div
      style={{ ...style, WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={clear}
      onPointerLeave={clear}
      onPointerCancel={clear}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </div>
  );
}

/**
 * EntryColumn — the ruled column, fixed at three boxes wide.
 *
 * A fourth box does not shrink the set; it scrolls. The column keeps
 * ENTRY_W whatever it holds, which is what keeps every row's first box
 * on the same vertical line. Only this block scrolls sideways —
 * nothing else on the page does.
 *
 * The fade on the LEFT edge is the cue that more boxes are out there.
 * Left, because the boxes start at the column's right in RTL and run
 * off the far side. It appears only while there is something still to
 * reach, so a fully scrolled row shows no fade.
 */
function EntryColumn({ gap, fadeTo = '#FFFFFF', children }) {
  const ref = useRef(null);
  const [fade, setFade] = useState(false);
  const check = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const more = el.scrollWidth > el.clientWidth + 1;
    // RTL reports scrollLeft as 0 at the start and negative as it
    // scrolls away, so compare on the magnitude.
    const atEnd = Math.abs(el.scrollLeft) + el.clientWidth >= el.scrollWidth - 1;
    setFade(more && !atEnd);
  }, []);
  // No dependency array: re-check after every render, since the box
  // count changes with the data. setFade to the same boolean is a
  // no-op in React, so this settles immediately.
  useLayoutEffect(check);
  return (
    <div style={{ position: 'relative', width: ENTRY_W, flexShrink: 0 }}>
      <div
        ref={ref}
        className="ps-entry"
        onScroll={check}
        style={{
          display: 'flex', justifyContent: 'flex-start', gap,
          overflowX: 'auto', overflowY: 'hidden',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {children}
      </div>
      {fade && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', insetInlineEnd: 'auto', left: 0,
            top: 0, bottom: 0, width: 20, pointerEvents: 'none',
            background: `linear-gradient(to left, ${fadeTo}00, ${fadeTo})`,
          }}
        />
      )}
    </div>
  );
}

/**
 * FitText — sizes a single-line label by the width it ACTUALLY has.
 *
 * Character count was the original bug: a 12-character name kept 16px
 * and ellipsised anyway. A canvas measureText helper was the next
 * attempt and was measurably wrong — it under-estimated by 4-20px,
 * because the available width had to be reconstructed arithmetically
 * from constants and because the canvas resolves the web font
 * differently from the layout engine. Measured live: "מתיחה ל4 ראשי"
 * was sized 16px on a canvas estimate but needed 106px in a 102px slot.
 *
 * So this measures the real element in the real layout: render, compare
 * scrollWidth to clientWidth in useLayoutEffect, step down one size,
 * repeat. At most six passes, all before paint, so nothing flickers.
 * Only if the floor still overflows does it ellipsise.
 */
const FONT_STEPS = [16, 15, 14, 13, 12, 11];

// `title` defaults to the rendered text, but a split name passes the
// whole stored one, so hovering a shortened row still shows it all.
function FitText({ text, title, style, steps = FONT_STEPS }) {
  const ref = useRef(null);
  // `gen` exists only to guarantee a re-render. Setting the step index
  // back to 0 when it is ALREADY 0 is a no-op: React bails out, so the
  // measuring effect below — which has no dependency array, and so
  // runs only when something renders — never re-runs. That is exactly
  // the resize case, where a sheet first laid out wide would keep 16px
  // forever after a rotation into a narrow screen.
  const [fit, setFit] = useState({ i: 0, gen: 0, wrap: false });
  const { i, wrap } = fit;
  // A different string starts the search again from the top. Already
  // at the top on mount, so this stays a no-op there.
  useLayoutEffect(() => {
    setFit((f) => (f.i === 0 && !f.wrap ? f : { i: 0, gen: f.gen + 1, wrap: false }));
  }, [text]);
  // So does a new viewport width — and this one must re-render even
  // from 0, hence the gen bump.
  useEffect(() => {
    const again = () => setFit((f) => ({ i: 0, gen: f.gen + 1, wrap: false }));
    window.addEventListener('resize', again);
    return () => window.removeEventListener('resize', again);
  }, []);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Once wrapping, scrollWidth equals clientWidth and there is
    // nothing left to measure.
    if (wrap) return;
    if (el.scrollWidth <= el.clientWidth + 1) return;
    if (i < steps.length - 1) setFit((f) => ({ ...f, i: f.i + 1 }));
    // The floor is reached and it STILL does not fit. Height is free
    // and width is not, so the line wraps rather than losing its end
    // to an ellipsis. The row grows; nothing is hidden.
    else setFit((f) => ({ ...f, wrap: true }));
  });
  return (
    <span
      ref={ref}
      title={title ?? text}
      style={{
        ...style,
        fontSize: steps[i],
        minWidth: 0,
        whiteSpace: wrap ? 'normal' : 'nowrap',
        overflow: wrap ? 'visible' : 'hidden',
        textOverflow: wrap ? 'clip' : 'ellipsis',
        overflowWrap: 'anywhere',
      }}
    >
      {text}
    </span>
  );
}
const todayLabel = () => new Date().toLocaleDateString('he-IL');

export default function PlanSheet() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const planId = params.get('planId');
  // This route renders OUTSIDE LayoutWrapper, so there is no header
  // and no bottom nav — the sheet needs its own way back.
  const from = params.get('from');
  const backTo = from === 'myplan' ? '/myplan' : '/workouts';
  const { user } = useContext(AuthContext);

  const [values, setValues] = useState({});   // `${exId}:${setIdx}` → string
  const [checks, setChecks] = useState({});   // exId → bool
  const [feeling, setFeeling] = useState(null);
  const [execId, setExecId] = useState(null);
  // A plan whose performance is finished opens for VIEWING.
  const [locked, setLocked] = useState(false);
  const [family, setFamily] = useState(null);   // { position, total }
  const [duplicating, setDuplicating] = useState(false);
  // Collapsed sections, by id. Empty at mount → every section starts
  // EXPANDED. Deliberately not persisted anywhere.
  const [collapsed, setCollapsed] = useState({});
  // The row a long press opened, or null. Read-only detail — this is
  // the fallback for a name too long to fit even at 11px.
  const [detail, setDetail] = useState(null);


  // ── Plan + sections + exercises. Three reads, no embeds: this DB has
  //    no foreign keys, so PostgREST embeds are not available. ────────
  const { data, isLoading } = useQuery({
    queryKey: ['plan-sheet', planId],
    enabled: !!planId,
    queryFn: async () => {
      const { data: plan, error: pe } = await supabase
        .from('training_plans').select('*').eq('id', planId).single();
      if (pe) throw pe;
      const [{ data: secs }, { data: exs }] = await Promise.all([
        supabase.from('training_sections').select('*')
          .eq('training_plan_id', planId).order('order', { ascending: true }),
        supabase.from('exercises').select('*')
          .eq('training_plan_id', planId).order('order', { ascending: true }),
      ]);
      return { plan, sections: secs || [], exercises: exs || [] };
    },
  });

  // Existing results for this plan, so a reopened sheet shows what is
  // already filled rather than a blank page.
  useEffect(() => {
    if (!planId || !user?.id) return;
    (async () => {
      const { data: execs } = await supabase
        .from('workout_executions')
        .select('id, self_rating, executed_at')
        .eq('plan_id', planId).eq('trainee_id', user.id)
        .order('executed_at', { ascending: false }).limit(1);
      const ex = execs?.[0];
      if (!ex) return;
      setExecId(ex.id);
      if (ex.self_rating != null) setFeeling(Number(ex.self_rating));
      // Read-only once the performance is FINISHED — self_rating set.
      // NOT merely "an execution row exists": PlanSheet creates that row
      // on the FIRST keystroke, so that rule would lock a workout the
      // moment it was started and make an interrupted one unfinishable —
      // the opposite of the intent. self_rating is the only "the trainee
      // closed this out" signal on the live table.
      setLocked(ex.self_rating != null);
      const { data: logs } = await supabase
        .from('exercise_set_logs')
        .select('exercise_id, drill_index, set_number, reps_completed, time_completed, weight_used')
        .eq('execution_id', ex.id);
      const next = {}; const nextChecks = {};
      for (const l of logs || []) {
        const v = l.reps_completed ?? l.time_completed ?? l.weight_used;
        if (v != null) { next[`${l.exercise_id}:${l.set_number}`] = String(v); continue; }
        // A tick row carries no measurement. drill_index alone cannot
        // say whether it came from a top-level row or from sub 0, so
        // BOTH keys are set — which is safe, because only one of them
        // is ever read: a container never renders a top-level tick,
        // and a plain exercise has no sub rows.
        nextChecks[l.exercise_id] = true;
        nextChecks[`${l.exercise_id}:sub${l.drill_index ?? 0}`] = true;
      }
      setValues(next); setChecks(nextChecks);
    })();
  }, [planId, user?.id]);

  // ── The chain of performances ───────────────────────────────────
  // duplicatePlan sets parent_plan_id to the FAMILY ROOT, so the whole
  // family is the root itself plus everything pointing at it. Ordered
  // by created_at; nothing renders for a plan with no copies.
  useEffect(() => {
    const plan = data?.plan;
    if (!plan?.id) return;
    const root = plan.parent_plan_id || plan.id;
    (async () => {
      const { data: rows, error } = await supabase
        .from('training_plans')
        .select('id, created_at, status')
        .or(`id.eq.${root},parent_plan_id.eq.${root}`)
        .order('created_at', { ascending: true });
      if (error) { console.warn('[PlanSheet] family lookup failed:', error.message); return; }
      const live = (rows || []).filter((r) => r.status !== 'deleted');
      if (live.length < 2) { setFamily(null); return; }
      const idx = live.findIndex((r) => r.id === plan.id);
      if (idx < 0) { setFamily(null); return; }
      setFamily({ position: idx + 1, total: live.length });
    })();
  }, [data?.plan?.id, data?.plan?.parent_plan_id]);

  /** One execution row per workout, created on first entry. */
  const ensureExecution = useCallback(async () => {
    if (execId) return execId;
    const traineeId = user?.id || data?.plan?.assigned_to;
    if (!traineeId || !planId) return null;
    const { data: row, error } = await supabase
      .from('workout_executions')
      .insert({
        trainee_id: traineeId,
        plan_id: planId,
        workout_template_id: planId,
        executed_at: new Date().toISOString(),
        section_ratings: {},
        self_rating: null,
      })
      .select().single();
    if (error || !row?.id) {
      console.warn('[PlanSheet] execution create failed:', error?.message);
      return null;
    }
    setExecId(row.id);
    return row.id;
  }, [execId, user?.id, data?.plan?.assigned_to, planId]);

  const commit = useCallback(async (exerciseId, setIdx, raw, logField) => {
    if (locked) return;
    const id = await ensureExecution();
    if (!id) { toast.error('לא ניתן לשמור כרגע'); return; }
    const n = raw === '' ? null : Number(raw);
    const { error } = await saveSetActual(
      supabase, id, exerciseId, 0, setIdx,
      { [logField]: n },
      { allowEmpty: raw === '' },
    );
    if (error) { console.error('[PlanSheet] save failed:', error); toast.error('השמירה נכשלה'); }
  }, [ensureExecution, locked]);

  // A sub-exercise writes against the SAME exercise row, distinguished
  // by drill_index — the column exercise_set_logs already uses for
  // exactly this. saveSetActual upserts on
  // (execution_id, exercise_id, drill_index, set_number).
  const commitInner = useCallback(async (exerciseId, drillIdx, raw, payloadField, setNo = 1) => {
    if (locked) return;
    const id = await ensureExecution();
    if (!id) { toast.error('לא ניתן לשמור כרגע'); return; }
    const n = raw === '' ? null : Number(raw);
    const { error } = await saveSetActual(
      supabase, id, exerciseId, drillIdx, setNo,
      { [payloadField]: n },
      { allowEmpty: raw === '' },
    );
    if (error) { console.error('[PlanSheet] inner save failed:', error); toast.error('השמירה נכשלה'); }
  }, [ensureExecution, locked]);

  const toggleCheck = useCallback(async (exerciseId) => {
    if (locked) return;
    const nextVal = !checks[exerciseId];
    setChecks((p) => ({ ...p, [exerciseId]: nextVal }));
    const id = await ensureExecution();
    if (!id) return;
    // A check carries no measurement, so allowEmpty is required or the
    // empty-write guard in saveSetActual drops it.
    await saveSetActual(supabase, id, exerciseId, 0, 1, {}, { allowEmpty: true });
  }, [checks, ensureExecution, locked]);

  // A sub row's tick writes exactly where commitInner writes that sub's
  // numbers — same exercise_id, drill_index = the sub's index — only
  // with every measurement column null. No collision with the parent's
  // own drill_index 0 row: a container never renders a top-level tick,
  // so it never writes one.
  const toggleSubCheck = useCallback(async (exerciseId, drillIdx) => {
    if (locked) return;
    const key = `${exerciseId}:sub${drillIdx}`;
    setChecks((p) => ({ ...p, [key]: !p[key] }));
    const id = await ensureExecution();
    if (!id) return;
    await saveSetActual(supabase, id, exerciseId, drillIdx, 1, {}, { allowEmpty: true });
  }, [ensureExecution, locked]);

  const saveFeeling = useCallback(async (n) => {
    if (locked) return;
    setFeeling(n);
    const id = await ensureExecution();
    if (!id) return;
    const { error } = await supabase
      .from('workout_executions').update({ self_rating: n }).eq('id', id);
    if (error) { console.error('[PlanSheet] feeling save failed:', error); toast.error('השמירה נכשלה'); }
  }, [ensureExecution, locked]);

  // ── אימון חדש — duplicate this plan and train the copy ──────────
  // Uses the EXISTING duplicatePlan; no second copy function. The
  // date rides in via its nameSuffix option so performances are
  // tellable apart in a list without inventing a naming scheme.
  const startNewWorkout = useCallback(async () => {
    if (duplicating) return;
    const plan = data?.plan;
    if (!plan?.id) return;
    setDuplicating(true);
    try {
      const stamp = new Date().toLocaleDateString('he-IL');
      const created = await duplicatePlan(plan.id, {
        traineeId: user?.id || plan.assigned_to || undefined,
        traineeName: user?.full_name || plan.assigned_to_name || undefined,
        nameSuffix: ` — ${stamp}`,
      });
      if (!created?.id) throw new Error('לא התקבלה תוכנית חדשה');
      toast.success('אימון חדש נוצר');
      // Straight into the copy's sheet so training starts immediately.
      navigate(`/plan-sheet?planId=${encodeURIComponent(created.id)}${from ? `&from=${from}` : ''}`, { replace: true });
    } catch (e) {
      console.error('[PlanSheet] duplicate failed:', e);
      toast.error('יצירת האימון נכשלה: ' + (e?.message || 'נסה שוב'));
    } finally {
      setDuplicating(false);
    }
  }, [duplicating, data?.plan, user?.id, user?.full_name, navigate, from]);

  const grouped = useMemo(() => {
    if (!data) return [];
    return (data.sections || []).map((s) => ({
      section: s,
      rows: (data.exercises || []).filter((e) => e.training_section_id === s.id),
    })).filter((g) => g.rows.length > 0);
  }, [data]);

  if (!planId) return <div dir="rtl" style={{ padding: 24, background: CREAM }}>לא צוין מזהה תוכנית</div>;
  if (isLoading || !data) return <PageLoader />;

  const { plan } = data;
  // ── TWO flex children, and the ROW never wraps. ────────────────
  //    child 1: the text side, taking all remaining width.
  //    child 2: the FIXED 112px entry column.
  const plainRow = {
    display: 'flex', alignItems: 'center',
    padding: '10px 9px', borderBottom: '1px solid #E0D4C2',
  };
  // The text side is now a COLUMN: the name line, then the muted line
  // that carries the clarification split off the name. flex:1 moved up
  // here — on textGroup it would have flexed the name line vertically.
  const textColumn = { flex: 1, minWidth: 0 };
  const textGroup = {
    minWidth: 0, display: 'flex', alignItems: 'baseline',
    gap: 9, overflow: 'hidden',
  };
  // Indented past the ordinal so it sits under the name, not under
  // the number.
  // Two lines, then an ellipsis. A single nowrap line lost the end of
  // every clarification that ran past ~125px.
  const metaLine = {
    fontSize: 11, color: MUTED, marginTop: 2, paddingInlineStart: 22,
    lineHeight: 1.35,
    display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2,
    overflow: 'hidden', overflowWrap: 'anywhere',
  };
  const ordinalStyle = {
    fontSize: 12, color: ORANGE, fontWeight: 500, flexShrink: 0,
  };
  // Wrapping breaks the ruled column, so the name never wraps — it
  // steps its font size down by length instead. Ellipsis is the last
  // resort, only if it still will not fit.
  const nameStyle = { color: CHARCOAL, fontWeight: 500 };
  // No separator dot — the 9px gap is the separation. The bidi isolate
  // stays: without it a label ending in a digit merges with the target
  // ("סט 1" + "15" read as "סט 115").
  const paramStyle = {
    fontSize: 13, color: CHARCOAL, flexShrink: 0,
    unicodeBidi: "isolate", direction: "rtl", whiteSpace: "nowrap",
  };

  // ONE box size, whatever the count. Shrinking by count reached 12px,
  // where the number inside stopped being readable — which defeats the
  // point of writing it down. A row with more boxes than the column
  // holds scrolls instead of shrinking.
  const boxPlan = () => ({ w: BOX_W, gap: BOX_GAP });

  // ── Container: one wrapper, tinted, orange rail on its RIGHT. ───
  const containerWrap = {
    background: '#FDF6EE', borderRight: `2px solid ${ORANGE}`,
    marginRight: 3,
    borderBottom: '1px solid #E0D4C2',
  };
  const containerHead = {
    padding: '8px 9px 4px', display: 'flex', alignItems: 'baseline',
    gap: 9, minWidth: 0, overflow: 'hidden',
  };
  const containerNum  = { fontSize: 12, color: ORANGE, fontWeight: 500, flexShrink: 0 };
  const containerName = { fontSize: 13, color: CHARCOAL, fontWeight: 500, flexShrink: 0 };
  const containerMeta = {
    fontSize: 11, color: MUTED, minWidth: 0,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  };

  // ── Sub row: same shape, asterisk instead of an ordinal. ────────
  //    No borderBottom — the wrapper carries it.
  const subRow = {
    display: 'flex', alignItems: 'center',
    paddingInlineStart: 12,
  };
  const subStar  = { fontSize: 14, color: ORANGE, flexShrink: 0 };
  const subName  = { color: CHARCOAL, fontWeight: 500 };

  // ── A הערות section is prose, not exercises. Its rows carry no
  //    ordinal, no tick, no entry column, and wrap to as many lines
  //    as the text needs. Matched on the section name alone, so no
  //    other section changes shape.
  const notesRow = {
    display: 'flex', gap: 8, alignItems: 'baseline',
    padding: '9px 10px', borderBottom: '1px solid #E0D4C2',
  };
  const notesStar = { fontSize: 12, color: ORANGE, flexShrink: 0, lineHeight: 1.5 };
  const notesText = {
    fontSize: 12, color: CHARCOAL, fontWeight: 500, lineHeight: 1.5,
    minWidth: 0, overflowWrap: 'anywhere',
  };
  const subParam = {
    fontSize: 13, color: CHARCOAL, flexShrink: 0,
    unicodeBidi: "isolate", direction: "rtl", whiteSpace: "nowrap",
  };
  // A checkbox, not an entry box. A row with nothing to measure used
  // to render something that looked exactly like a number field and
  // took no number. It still sits at the column's start, so it lines
  // up with the first box of every measured row.
  const checkStyle = (on) => ({
    // minHeight for the same reason as the box: index.css gives every
    // button min-height:44px.
    flexShrink: 0, width: 22, height: 22, minHeight: 22, borderRadius: 4,
    border: `1.5px solid ${on ? ORANGE : (locked ? '#E2DAD0' : '#C9BCAB')}`,
    background: on ? ORANGE : (locked ? '#F4EEE6' : CREAM),
    color: WHITE, fontSize: 13, fontWeight: 900, lineHeight: 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'inherit', padding: 0, boxSizing: 'border-box',
    cursor: locked ? 'default' : 'pointer',
    opacity: locked && !on ? 0.75 : 1,
  });

  const box = (filled, bp) => ({
    flexShrink: 0,
    // minHeight as well as height: index.css puts min-height:44px on
    // every input, and a min-height beats a smaller height.
    width: bp.w, height: BOX_H, minHeight: BOX_H,
    textAlign: "center", fontSize: 13, padding: "6px 0",
    border: filled ? `1.5px solid ${ORANGE}` : "1.5px solid #C9BCAB",
    borderRadius: 5,
    background: filled ? "#FFF" : CREAM,
    boxSizing: "border-box",
    fontFamily: 'inherit', color: CHARCOAL,
    opacity: locked ? 0.75 : 1,
  });
  // Ordinals run across the whole sheet, not per section.
  let ordinal = 0;

  return (
    <div
      dir="rtl"
      className="ps-page"
      style={{
        minHeight: '100dvh', background: CREAM, color: CHARCOAL,
        fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
        textAlign: 'right',
        padding: 'calc(12px + env(safe-area-inset-top)) 0 calc(24px + env(safe-area-inset-bottom))',
      }}
    >
      {/* Two rules that inline styles cannot express.
          1. The fade is the scroll cue, so the native scrollbar is not
             wanted on top of it, and ::-webkit-scrollbar has no inline
             equivalent.
          2. App.css carries a blanket `* { overflow-x: hidden }`. That
             makes EVERY element its own scrollport, which is why the
             sticky header did not stick — it had no scrollport that
             actually scrolls. `clip` clips exactly the same way but
             creates no scrollport. Scoped to this page's own chain,
             and it leaves with the page when it unmounts. */}
      <style>{`.ps-entry{scrollbar-width:none;-ms-overflow-style:none}
.ps-entry::-webkit-scrollbar{display:none}
html,body,#root,.ps-page,.ps-frame{overflow-x:clip}`}</style>
      {/* Outer sheet — full bleed. No page padding and no max width:
          at 360px the old 12px page padding either side plus a
          centred frame cost 24px of content, which is 24px the
          exercise names now keep. Border and inner padding stay. */}
      <div className="ps-frame" style={{
        background: CREAM, border: `2px solid ${CHARCOAL}`,
        borderRadius: 12, padding: 11, boxSizing: 'border-box',
      }}>

        {/* ── Header ─────────────────────────────────────────────── */}
        <div style={{
          background: ORANGE, color: WHITE,
          border: `1.5px solid ${CHARCOAL}`, borderBottom: 'none',
          padding: '6px 14px', minHeight: TOUCH, boxSizing: 'border-box',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 18, fontWeight: 800 }}>תוכנית אימונים</span>
          <button
            type="button"
            onClick={() => navigate(backTo)}
            aria-label="חזרה"
            style={{
              flexShrink: 0, minWidth: TOUCH, height: TOUCH,
              background: 'transparent', border: 'none', color: WHITE,
              fontSize: 20, fontWeight: 800, cursor: 'pointer',
              fontFamily: 'inherit', padding: 0, lineHeight: 1,
            }}
          >
            ←
          </button>
        </div>
        {/* Sticky. The orange title scrolls away, this does not, so
            mid-sheet it is still clear whose plan this is. It sits
            below the safe-area inset rather than at a hard 0, so it
            does not end up under a notch or the browser chrome, and
            it is opaque so rows pass behind it rather than through. */}
        <div style={{
          position: 'sticky', top: 'env(safe-area-inset-top, 0px)', zIndex: 5,
          background: WHITE, border: `1.5px solid ${CHARCOAL}`,
          padding: '9px 14px', marginBottom: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: 14, fontWeight: 600,
        }}>
          <span>{plan?.assigned_to_name || user?.full_name || 'מתאמן'}</span>
          <span style={{ color: MUTED, fontWeight: 500 }}>{todayLabel()}</span>
        </div>

        {/* Where this performance sits in its family. Nothing renders
            for a plan with no copies. */}
        {family && (
          <div style={{
            background: WHITE, border: `1.5px solid ${CHARCOAL}`, borderTop: 'none',
            padding: '7px 14px', marginTop: -14, marginBottom: 14,
            fontSize: 13, fontWeight: 700, color: ORANGE,
          }}>
            אימון {family.position} מתוך {family.total}
          </div>
        )}

        {/* ── Sections ───────────────────────────────────────────── */}
        {grouped.map(({ section, rows }) => {
          const cat = (section.category || section.section_name || '').trim();
          const rail = section.coach_notes || '';
          // Exactly this name, nothing fuzzy — one section renders as
          // prose and every other one is untouched.
          const isNotes = (section.section_name || '').trim() === 'הערות';
          const isShut = !!collapsed[section.id];
          const toggle = () => setCollapsed((c) => ({ ...c, [section.id]: !c[section.id] }));
          return (
            <div key={section.id} style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              {/* RIGHT rail — first child is rightmost in RTL. Tapping it
                  collapses or expands the section. */}
              <button
                type="button"
                onClick={toggle}
                aria-expanded={!isShut}
                style={{
                  width: RAIL_W, flexShrink: 0,
                  background: BEIGE, border: `1.5px solid ${CHARCOAL}`,
                  borderRadius: 8,
                  padding: '10px 4px', textAlign: 'center',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  cursor: 'pointer', fontFamily: 'inherit', color: CHARCOAL,
                }}
              >
                {/* Fits itself down from 12px: תנועתיות needs more than
                    a 52px column gives at 12. */}
                <FitText
                  text={section.section_name || cat}
                  steps={[12, 11, 10, 9]}
                  style={{ fontWeight: 500, lineHeight: 1.2, maxWidth: "100%" }}
                />
                {/* Chevron shows the state: ▾ open, ◂ shut. */}
                <span style={{ fontSize: 10, color: CHARCOAL, lineHeight: 1 }}>
                  {isShut ? '◂' : '▾'}
                </span>
                {isShut ? (
                  /* Collapsed: the count replaces everything else. */
                  <span style={{ fontSize: 10, color: ORANGE, fontWeight: 500, lineHeight: 1.3, whiteSpace: 'nowrap' }}>
                    {rows.length} תרגילים
                  </span>
                ) : rail ? (
                  /* No character cap: the note wraps down the rail for
                     as long as it needs. Cutting it at 40 characters
                     hid most of a three-line coach note. */
                  <span style={{
                    fontSize: 10, color: ORANGE, fontWeight: 500,
                    lineHeight: 1.3, overflowWrap: 'anywhere',
                  }}>
                    {rail}
                  </span>
                ) : null}
              </button>

              {/* Collapsed → the label block is the whole section. */}
              {/* LEFT column — the rows. */}
              {isShut ? null : (
              <div style={{
                flex: 1, width: '100%', minWidth: 0, background: WHITE,
                border: `1.5px solid ${CHARCOAL}`, borderRadius: 8,
                overflow: 'hidden',
              }}>
                {rows.map((ex, i) => {
                  // ── A הערות row is a line of prose. Before the
                  //    ordinal is spent, so the numbering of real
                  //    exercises is not pushed along by a note.
                  if (isNotes) {
                    return (
                      <div key={ex.id} style={notesRow}>
                        <span style={notesStar}>✳</span>
                        <span style={notesText}>
                          {ex.exercise_name || ex.name || ''}
                        </span>
                      </div>
                    );
                  }
                  const container = isContainer(ex, parseTabataData);
                  const td = container ? parseTabataData(ex.tabata_data) : null;
                  const { list: subs, kind: subKindOf } = container
                    ? subsOf(ex, td) : { list: [], kind: "exercises" };
                  const m = measurementKind(ex, null, section);
                  const note = noteOf(ex);
                  const method = getMethodByMode(ex.mode);
                  const isClock = isTabataContainer(ex);
                  const hasTarget = m.kind !== "check" && m.target > 0;
                  const rowKind = container ? "container" : (hasTarget ? m.kind : "check");
                  const boxCount = (rowKind === "check" || rowKind === "container")
                    ? 0
                    : (rowKind === "tally" ? 1 : m.sets);
                  // Containers and plain exercises share one running count.
                  // Sub rows get an asterisk, never a number.
                  ordinal += 1;
                  const myOrdinal = ordinal;
                  const params = container ? "" : paramText({ ...m, kind: rowKind });
                  // Rounds for the container header, and one box per round
                  // for each sub-exercise.
                  // ONE source for the header count AND the box count.
                  const rounds = roundsOf(ex, td);
                  // A planned_sets ladder IS the sets — one box per row.
                  const boxesPerSub = subKindOf === "sets" ? 1 : rounds;
                  const headerBits = [
                    rounds > 1 ? `${rounds} סבבים` : null,
                    note || null,
                  ].filter(Boolean).join(" · ");

                  // ── A CONTAINER ────────────────────────────────────
                  if (container) {
                    return (
                      <div key={ex.id} style={containerWrap}>
                        <div style={containerHead}>
                          <span style={containerNum}>{myOrdinal}.</span>
                          <span style={containerName}>{method?.label || ex.exercise_name || ex.name}</span>
                          {headerBits && <span style={containerMeta}>{headerBits}</span>}
                        </div>

                        {subs.map((sub, sidx) => {
                          const sm = subMeasurementKind(sub, section);
                          const subHasTarget = sm.kind !== "check" && sm.target > 0;
                          // Inside a clock the numbers are the programme,
                          // shown but never editable.
                          const subEditable = subHasTarget && !isClock;
                          const subParams = paramText({ ...sm, kind: subHasTarget ? sm.kind : "check" });
                          const last = sidx === subs.length - 1;
                          const sbp = boxPlan(subEditable ? boxesPerSub : 0);
                          const subText = subLabel(sub, subKindOf, sidx);
                          const { head: subHead, tail: subTail } = splitExerciseName(subText);
                          return (
                            <div
                              key={`${ex.id}:sub${sidx}`}
                              style={{ ...subRow, padding: last ? "7px 9px 10px" : "7px 9px" }}
                            >
                              <PressableText
                                style={textColumn}
                                onLongPress={() => setDetail({
                                  name: subText,
                                  params: subParams,
                                  method: method?.label || null,
                                  note: null,
                                })}
                              >
                                <div style={textGroup}>
                                  <span style={subStar}>✳</span>
                                  <FitText text={subHead} title={subText} style={subName} />
                                  {subParams && <span style={subParam}>{subParams}</span>}
                                </div>
                                {subTail && <div style={metaLine}>{subTail}</div>}
                              </PressableText>
                              <EntryColumn gap={sbp.gap} fadeTo="#FDF6EE">
                                {/* Nothing to measure, and not a clock →
                                    the same tick the top-level rows get.
                                    A tabata's sub rows stay blank: the
                                    clock's own row carries that tick. */}
                                {!subEditable && !isClock && (
                                  <button
                                    type="button"
                                    onClick={() => toggleSubCheck(ex.id, sidx)}
                                    disabled={locked}
                                    aria-pressed={!!checks[`${ex.id}:sub${sidx}`]}
                                    style={checkStyle(!!checks[`${ex.id}:sub${sidx}`])}
                                  >
                                    {checks[`${ex.id}:sub${sidx}`] ? "✓" : ""}
                                  </button>
                                )}
                                {subEditable && Array.from({ length: boxesPerSub }).map((_, ri) => {
                                  const key = `${ex.id}:sub${sidx}:${ri + 1}`;
                                  const v = values[key] ?? "";
                                  return (
                                    <input
                                      key={key}
                                      type="number"
                                      inputMode="numeric"
                                      disabled={locked}
                                      value={v}
                                      onChange={(e) => setValues((pv) => ({ ...pv, [key]: e.target.value }))}
                                      onBlur={(e) => commitInner(ex.id, sidx, e.target.value, sm.payloadField, ri + 1)}
                                      style={box(has(v), sbp)}
                                    />
                                  );
                                })}
                              </EntryColumn>
                            </div>
                          );
                        })}
                      </div>
                    );
                  }

                  // ── A PLAIN EXERCISE ROW ───────────────────────────
                  const bp = boxPlan(rowKind === "check" ? 1 : boxCount);
                  const exName = ex.exercise_name || ex.name || "";
                  const { head: exHead, tail: exTail } = splitExerciseName(exName);
                  // The clarification comes first, then the coach cue.
                  const rowMeta = [exTail, note].filter(Boolean).join(" · ");
                  return (
                    <div key={ex.id} style={plainRow}>
                      <PressableText
                        style={textColumn}
                        onLongPress={() => setDetail({
                          name: exName,
                          params,
                          method: method?.label || null,
                          note,
                        })}
                      >
                        <div style={textGroup}>
                          <span style={ordinalStyle}>{myOrdinal}.</span>
                          <FitText text={exHead} title={exName} style={nameStyle} />
                          {params && <span style={paramStyle}>{params}</span>}
                        </div>
                        {rowMeta && <div style={metaLine}>{rowMeta}</div>}
                      </PressableText>
                      <EntryColumn gap={bp.gap}>
                        {rowKind === "check" ? (
                          <button
                            type="button"
                            onClick={() => toggleCheck(ex.id)}
                            disabled={locked}
                            aria-pressed={!!checks[ex.id]}
                            style={checkStyle(!!checks[ex.id])}
                          >
                            {checks[ex.id] ? "✓" : ""}
                          </button>
                        ) : Array.from({ length: boxCount }).map((_, si) => {
                          const key = `${ex.id}:${si + 1}`;
                          const v = values[key] ?? "";
                          return (
                            <input
                              key={key}
                              type="number"
                              inputMode="numeric"
                              disabled={locked}
                              value={v}
                              onChange={(e) => setValues((pv) => ({ ...pv, [key]: e.target.value }))}
                              onBlur={(e) => commit(ex.id, si + 1, e.target.value, m.payloadField)}
                              style={box(has(v), bp)}
                            />
                          );
                        })}
                      </EntryColumn>
                    </div>
                  );
                })}
              </div>
              )}
            </div>
          );
        })}

        {/* ── Feeling — full width, no rail, label above. ─────────── */}
        <div style={{
          background: WHITE, border: `1.5px solid ${CHARCOAL}`,
          padding: '10px 10px 12px', marginTop: 4,
        }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>תחושה</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {Array.from({ length: 10 }).map((_, i) => {
              const n = i + 1;
              const on = feeling === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => saveFeeling(n)}
                  disabled={locked}
                  style={{
                    flex: 1, minWidth: 0, height: TOUCH,
                    border: `1.5px solid ${on ? ORANGE : (locked ? '#E2DAD0' : '#D9D0C4')}`,
                    background: on ? ORANGE : (locked ? '#F4EEE6' : CREAM),
                    color: on ? WHITE : CHARCOAL,
                    fontSize: 15, fontWeight: 800, borderRadius: 6,
                    cursor: locked ? 'default' : 'pointer', fontFamily: 'inherit', padding: 0,
                    opacity: locked && !on ? 0.75 : 1,
                  }}
                >
                  {n}
                </button>
              );
            })}
          </div>
        </div>

        {/* אימון חדש — the only action on a locked sheet, and always
            available on an open one. Duplicates through the existing
            duplicatePlan and drops straight into the copy. */}
        <button
          type="button"
          onClick={startNewWorkout}
          disabled={duplicating}
          style={{
            width: '100%', minHeight: TOUCH + 6, marginTop: 12,
            border: `1.5px solid ${CHARCOAL}`,
            background: ORANGE, color: WHITE,
            fontSize: 17, fontWeight: 800, fontFamily: 'inherit',
            cursor: duplicating ? 'default' : 'pointer',
            opacity: duplicating ? 0.6 : 1,
          }}
        >
          {duplicating ? 'יוצר…' : 'אימון חדש'}
        </button>

        {locked && (
          <div style={{
            marginTop: 8, fontSize: 12, color: MUTED, textAlign: 'center',
          }}>
            האימון הזה כבר בוצע — לצפייה בלבד
          </div>
        )}

      </div>

      {/* Long press detail — the whole stored name, never the split
          one, plus what the row could not show. Read only. */}
      <Dialog open={!!detail} onOpenChange={(open) => { if (!open) setDetail(null); }}>
        <DialogContent
          // The shared DialogContent blocks Escape by default, because
          // forms must close through save. Nothing here is editable,
          // so a no-op handler lets Radix close on Escape as usual.
          onEscapeKeyDown={() => {}}
          style={{ maxWidth: 380 }}
        >
          <DialogHeader>
            <DialogTitle style={{
              fontSize: 17, lineHeight: 1.35, color: CHARCOAL,
              paddingInlineEnd: 26,
            }}>
              {detail?.name}
            </DialogTitle>
          </DialogHeader>
          <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
            {[
              ['מדדים', detail?.params],
              ['שיטה', detail?.method],
              ['הערה', detail?.note],
            ].filter(([, v]) => v).map(([label, v]) => (
              <div key={label} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <span style={{ fontSize: 12, color: MUTED, flexShrink: 0, minWidth: 46 }}>
                  {label}
                </span>
                <span style={{
                  fontSize: 14, color: CHARCOAL, fontWeight: 500,
                  unicodeBidi: 'isolate', direction: 'rtl',
                }}>
                  {v}
                </span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
