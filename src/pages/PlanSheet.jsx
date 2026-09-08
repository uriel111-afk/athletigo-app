import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Play } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { AuthContext } from '@/lib/AuthContext';
import PageLoader from '@/components/PageLoader';
import { getMethodByEnglishId } from '@/constants/trainingMethods';
import {
  measurementKind,
  subMeasurementKind,
  isContainer,
  isTabataContainer,
  has,
} from '@/lib/exerciseMeasurement';
import { parseTabataData } from '@/lib/tabataSettings';
import { saveSetActual } from '@/lib/plannedSets';
import { duplicatePlan } from '@/lib/plansApi';
import { useClock } from '@/contexts/ClockContext';
import {
  resolveExerciseClock, useExerciseClock,
  InlineExerciseClock, ClockSwapPrompt,
} from '@/components/training/ExerciseClock';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

/**
 * PlanSheet — the workout execution screen, drawn as the printed
 * AthletiGo plan sheet with entry boxes added.
 *
 * The shell is the printed page: charcoal frame, cream paper, the
 * charcoal wedge / orange wordmark header band, the orange wedge at
 * the foot. Inside it every exercise is ONE line — tick, ordinal,
 * name, method pill, parameters, then the entry group starting at the
 * row's horizontal centre and running left. Nothing wraps to a second
 * line; detail that will not fit opens on a tap.
 *
 * DATA — every column already exists; no schema change, no migration.
 *   plan      → training_plans
 *   sections  → training_sections   (training_plan_id, section_name, "order")
 *   exercises → exercises           (training_plan_id, training_section_id, "order")
 *   results   → exercise_set_logs   via saveSetActual(), parented by
 *               workout_executions
 *   feeling   → workout_executions.self_rating (one value per workout)
 *
 * There is NO measurement-type column. The type is derived at read time
 * by measurementKind() in src/lib/exerciseMeasurement.js — the same
 * helper WorkoutSheet imports, so the two screens cannot disagree.
 *
 * CLOCKS are not built here. resolveExerciseClock / useExerciseClock /
 * InlineExerciseClock in components/training/ExerciseClock.jsx already
 * map an exercise's own time fields onto the shared ClockContext
 * engine; this screen only renders their launcher and their running
 * block. No second engine, no duplicated phase loop.
 */

// ── Palette — the printed sheet's own ────────────────────────────────
const CREAM       = '#FBF3EA';
const CHARCOAL    = '#2D2A26';
const ORANGE      = '#FF6F20';
const WHITE       = '#FFFFFF';
const CARD_BORDER = '#E0D4C2';
const STRIP       = '#FFE2CD';   // the 5px band across every card top
const DIVIDER     = '#F0E7DA';   // between rows
const MUTED       = '#8A8079';   // parameter text
const DESK        = '#EDE3D6';   // behind the sheet

const SANS = "'Rubik', system-ui, -apple-system, sans-serif";

// Section label card, on the RIGHT of every section.
const RAIL_W = 56;
// Entry boxes. Height is fixed; width comes from boxPlan() below.
const BOX_H  = 26;
// The one place a 44px touch target still applies: the page's own
// actions, which are not part of the ruled sheet.
const TOUCH  = 44;

/**
 * Box width BY COUNT. Half a row holds five boxes at most, so the
 * boxes get narrower as there are more of them rather than the strip
 * getting wider without limit.
 *   1-2 → 32px   3-4 → 28px   5+ → 24px
 *   gap 3px from four boxes up, otherwise 4px.
 * 24px still holds two digits at 12px.
 */
function boxPlan(count) {
  const n = Math.max(1, Number(count) || 1);
  return { w: n <= 2 ? 32 : n <= 4 ? 28 : 24, gap: n >= 4 ? 3 : 4 };
}

/**
 * METHOD PILLS — matched on the exercise's OWN mode value, Hebrew or
 * English. getMethodByMode() is deliberately NOT used for this: it
 * falls back to REPS for anything it does not know, which would paint
 * a "חזרות" pill onto every unlabelled row. An unknown mode gets no
 * pill at all.
 */
const PILLS = {
  'קומבו':   { id: 'combo',     bg: '#FAC775', fg: '#412402' },
  'combo':   { id: 'combo',     bg: '#FAC775', fg: '#412402' },
  'סופרסט':  { id: 'super_set', bg: '#CECBF6', fg: '#26215C' },
  'superset': { id: 'super_set', bg: '#CECBF6', fg: '#26215C' },
  'super_set': { id: 'super_set', bg: '#CECBF6', fg: '#26215C' },
  'טבטה':    { id: 'tabata',    bg: '#F7C1C1', fg: '#501313' },
  'tabata':  { id: 'tabata',    bg: '#F7C1C1', fg: '#501313' },
  'חזרות':   { id: 'reps',      bg: '#FFE2CD', fg: '#7A2E00' },
  'reps':    { id: 'reps',      bg: '#FFE2CD', fg: '#7A2E00' },
  'דרופסט':  { id: 'drop_set',  bg: '#F5C4B3', fg: '#4A1B0C' },
  'dropset': { id: 'drop_set',  bg: '#F5C4B3', fg: '#4A1B0C' },
  'drop_set': { id: 'drop_set',  bg: '#F5C4B3', fg: '#4A1B0C' },
};

/** The pill for a mode, or null. The label comes from the catalog. */
export function pillOf(mode) {
  const key = String(mode ?? '').trim().toLowerCase();
  if (!key) return null;
  const p = PILLS[key];
  if (!p) return null;
  return { ...p, label: getMethodByEnglishId(p.id).label };
}

function MethodPill({ pill }) {
  if (!pill) return null;
  return (
    <span style={{
      flexShrink: 0,
      background: pill.bg, color: pill.fg,
      fontSize: 10, lineHeight: 1.5, fontWeight: 500,
      borderRadius: 9, padding: '1px 6px',
      whiteSpace: 'nowrap',
    }}>{pill.label}</span>
  );
}

/**
 * Minutes first, then seconds, left to right — even on this RTL page.
 * 180 → 3:00, 20 → 0:20.
 */
function mmss(seconds) {
  const t = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

/** The exercise's OWN values, as the shortcut prints them. */
function clockLabel(spec) {
  if (!spec) return '';
  if (spec.kind === 'countdown') return mmss(spec.seconds);
  const bits = [mmss(spec.workSeconds)];
  if (spec.restSeconds > 0) bits.push(mmss(spec.restSeconds));
  const time = bits.join(' / ');
  return spec.rounds > 1 ? `${time} ×${spec.rounds}` : time;
}

/**
 * Which rows carry a shortcut, and what shape it takes.
 *
 * resolveExerciseClock() is the existing mapping and is not
 * re-implemented here — this only filters it:
 *   countdown            → a hold or a timed exercise: button + box,
 *                          the elapsed seconds are written back
 *   intervals / tabata   → a clock, not a measurement: button only
 *   stopwatch            → not a time value at all (rounds with no
 *                          seconds anywhere), so no shortcut
 */
function shortcutOf(exercise) {
  const spec = resolveExerciseClock(exercise);
  if (!spec || !spec.hasDuration) return null;
  if (spec.kind === 'stopwatch') return null;
  return spec;
}
const isClockOnly = (spec) => !!spec && (spec.kind === 'tabata' || spec.kind === 'intervals');

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
  const named = (arr) => (Array.isArray(arr) && arr.length ? arr : null);
  const list = named(td?.sub_exercises) || named(td?.exercises_in_rotation) || named(td?.stations);
  if (list) return { list, kind: 'exercises' };
  if (Array.isArray(td?.rounds) && td.rounds.length) {
    const flat = [];
    for (const r of td.rounds) for (const e of (r?.exercises || [])) flat.push(e);
    if (flat.length) {
      // rounds[] repeats the same movements once per round — de-duplicate
      // by name so a 5-round superset lists 2 exercises, not 10.
      const seen = new Set(); const uniq = [];
      for (const e of flat) {
        const k = e?.name || e?.exercise_name || '';
        if (seen.has(k)) continue; seen.add(k); uniq.push(e);
      }
      return { list: uniq, kind: 'exercises' };
    }
  }
  if (Array.isArray(td?.planned_sets) && td.planned_sets.length) {
    return { list: td.planned_sets, kind: 'sets' };
  }
  return { list: [], kind: 'exercises' };
}

/** A sub row label. Real name, else the set variation, else the set number. */
function subLabel(sub, kind, idx) {
  const n = sub?.exercise_name || sub?.name || sub?.variation_name;
  if (n && String(n).trim()) return String(n).trim();
  if (kind === 'sets') return `סט ${sub?.set_index ?? idx + 1}`;
  return 'תרגיל';
}

/**
 * ClockShortcut — the launcher, and the running block it opens.
 *
 * Owns NO timing. `useExerciseClock` is the existing controller hook
 * (ExerciseCard.jsx:1190 is the other caller) and it drives the shared
 * ClockContext engine, so a clock started from a row is the same clock
 * /clocks runs, complete with its wake lock and its notifications.
 *
 * The running block is portalled to the body because this route has no
 * TimerFooterBar — PlanSheet renders outside LayoutWrapper — and the
 * section cards clip their overflow.
 */
function ClockShortcut({ spec, setNumber, totalSets, onElapsed, disabled }) {
  const clock = useClock();
  // The hook's completion effect keys off this callback's identity, so
  // it has to be stable across the parent's renders.
  const latest = useRef(onElapsed);
  latest.current = onElapsed;
  const handleElapsed = useCallback((seconds) => {
    if (typeof latest.current === 'function') latest.current(seconds);
  }, []);
  const ec = useExerciseClock({ spec, clock, onElapsed: handleElapsed });
  if (!spec) return null;
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => { e.stopPropagation(); ec.launch(); }}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label={`הפעל שעון · ${clockLabel(spec)}`}
        style={{
          flexShrink: 0,
          display: 'inline-flex', alignItems: 'center', gap: 4,
          border: `0.5px solid ${ORANGE}`, borderRadius: 4,
          padding: '3px 6px', minHeight: BOX_H, height: BOX_H,
          background: WHITE, color: ORANGE,
          fontSize: 11, fontFamily: 'inherit', lineHeight: 1,
          boxSizing: 'border-box', whiteSpace: 'nowrap',
          cursor: disabled ? 'default' : 'pointer',
        }}
      >
        <Play size={9} fill={ORANGE} color={ORANGE} style={{ flexShrink: 0 }} />
        {/* Minutes first, then seconds, left to right — inside an RTL page. */}
        <span style={{ direction: 'ltr', unicodeBidi: 'isolate' }}>{clockLabel(spec)}</span>
      </button>

      <ClockSwapPrompt open={ec.swapOpen} onConfirm={ec.confirmSwap} onCancel={ec.cancelSwap} />

      {ec.owned && typeof document !== 'undefined' && createPortal(
        <div style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 12000,
          background: CREAM, borderTop: `1px solid ${CARD_BORDER}`,
          boxShadow: '0 -8px 22px rgba(0,0,0,0.16)',
          padding: '10px 12px calc(4px + env(safe-area-inset-bottom, 0px))',
        }}>
          <InlineExerciseClock
            spec={spec}
            clock={clock}
            setNumber={setNumber}
            totalSets={totalSets}
            onStop={ec.stopNow}
            onTogglePause={ec.togglePause}
          />
        </div>,
        document.body,
      )}
    </>
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
  // Live mirror of `values`, for handlers that must read the current
  // map without depending on it (the clock write-back).
  const valuesRef = useRef(values);
  valuesRef.current = values;
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
  // The row a tap opened, or null. Read-only detail — this is where the
  // text that does not fit on the single line lives.
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
        if (v != null) {
          // drill_index 0 is ambiguous — a plain row's own set, or the
          // FIRST sub of a container. Both keys are written for it, the
          // same way the tick branch below does, because only one of
          // them is ever read back: a container renders no top-level
          // boxes and a plain exercise renders no sub rows.
          const drill = l.drill_index ?? 0;
          if (drill === 0) next[`${l.exercise_id}:${l.set_number}`] = String(v);
          next[`${l.exercise_id}:sub${drill}:${l.set_number}`] = String(v);
          continue;
        }
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

  /**
   * A clock that measured something writes through the ORDINARY save
   * path — the same commit() a typed box uses, so nothing about
   * exercise_set_logs changes. It lands in the first empty box, or in
   * box 1 when every box is already filled.
   *
   * Only a countdown (a hold or a timed exercise) ever gets here: an
   * interval or tabata container is a clock, not a measurement, and
   * passes no callback at all.
   */
  const writeClockSeconds = useCallback((exerciseId, boxCount, payloadField, seconds) => {
    if (locked) return;
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    // Read through the ref rather than inside a setValues updater: the
    // updater has to stay pure, and it would otherwise fire the write
    // twice under StrictMode.
    const current = valuesRef.current;
    let slot = 1;
    for (let i = 1; i <= Math.max(1, boxCount); i += 1) {
      if (!has(current[`${exerciseId}:${i}`])) { slot = i; break; }
    }
    setValues((pv) => ({ ...pv, [`${exerciseId}:${slot}`]: String(seconds) }));
    commit(exerciseId, slot, String(seconds), payloadField);
  }, [commit, locked]);

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
  const planTitle = plan?.title || plan?.plan_name || 'תוכנית אימונים';

  // ── ROW — one flex line, never two, never wrapping. ────────────
  //    right to left: tick, ordinal, name, pill, parameters,
  //    flex:1 spacer, entry group.
  const rowLine = (last) => ({
    display: 'flex', alignItems: 'center', gap: 5,
    padding: '7px 8px',
    borderBottom: last ? 'none' : `1px solid ${DIVIDER}`,
  });
  // The only shrinkable thing on the row. Everything inside it except
  // the name itself refuses to shrink, so the name is what gives.
  const textGroup = {
    display: 'flex', alignItems: 'center', gap: 5,
    minWidth: 0, flexShrink: 1, overflow: 'hidden',
    cursor: 'pointer',
  };
  const ordinalStyle = { fontSize: 11, color: ORANGE, flexShrink: 0, lineHeight: 1.4 };
  const nameStyle = {
    fontSize: 12, fontWeight: 500, color: CHARCOAL, lineHeight: 1.4,
    minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  };
  // The bidi isolate stays: without it a label ending in a digit merges
  // with the target ("סט 1" + "15" read as "סט 115").
  const paramStyle = {
    fontSize: 11, color: MUTED, flexShrink: 0, lineHeight: 1.4,
    unicodeBidi: 'isolate', direction: 'rtl', whiteSpace: 'nowrap',
  };
  const starStyle = { fontSize: 10, color: ORANGE, flexShrink: 0, lineHeight: 1.4 };

  /**
   * What the text side can still afford.
   *
   * Half a row holds five boxes. At five the entry group is already
   * the whole half; at six it has crossed the centre line and grown
   * rightward, and only the name is allowed to shrink — measured at
   * 360px, a seven-box row leaves the name 0px and cuts the pill in
   * two. So the two smallest pieces step aside, in that order:
   *
   *   5+ boxes, or any row with a clock button → no parameter text
   *   6+ boxes                                 → no method pill
   *
   * Neither is lost: both are in the detail dialog a tap away, which
   * is where this sheet puts everything that will not fit on the line.
   * With that, the same seven-box row keeps a 37px name that ellipsises
   * instead of vanishing, and nothing is clipped.
   */
  const showParams = (boxCount, hasClock) => boxCount < 5 && !hasClock;
  const showPill = (boxCount) => boxCount < 6;

  // 13px on the page, 25px under the finger. The hit area cannot come
  // from padding — padding sits INSIDE the border, so it would draw a
  // 25px square. It comes from a transparent 25px button with the 13px
  // square inside it, and an equal negative margin hands the extra
  // space straight back to the layout, so the row still measures 13.
  const checkHit = {
    flexShrink: 0, width: 25, height: 25, minHeight: 25,
    margin: -6, padding: 0,
    background: 'transparent', border: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'inherit', cursor: locked ? 'default' : 'pointer',
  };
  const checkStyle = (on) => ({
    width: 13, height: 13, borderRadius: 3, boxSizing: 'border-box',
    border: `1px solid ${on ? ORANGE : (locked ? '#E2DAD0' : '#C1B4A3')}`,
    background: on ? ORANGE : WHITE,
    color: WHITE, fontSize: 9, fontWeight: 900, lineHeight: 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    opacity: locked && !on ? 0.75 : 1,
  });

  const box = (filled, bp) => ({
    flexShrink: 0,
    // minHeight as well as height: index.css puts min-height:44px on
    // every input, and a min-height beats a smaller height.
    width: bp.w, height: BOX_H, minHeight: BOX_H,
    textAlign: 'center', fontSize: 12, padding: '2px 0',
    border: `1px solid ${filled ? ORANGE : '#D5C8B6'}`,
    borderRadius: 3,
    background: filled ? '#FFF7F1' : WHITE,
    boxSizing: 'border-box',
    fontFamily: 'inherit', color: CHARCOAL,
    opacity: locked ? 0.75 : 1,
  });

  // Both cards: white, hairline border, 4px radius, a 5px strip on top.
  const cardShell = {
    background: WHITE, border: `0.5px solid ${CARD_BORDER}`,
    borderRadius: 4, overflow: 'hidden', boxSizing: 'border-box',
  };
  const cardStrip = { height: 5, background: STRIP, flexShrink: 0 };

  const openDetail = (d) => setDetail(d);

  // Ordinals run across the whole sheet, not per section.
  let ordinal = 0;

  return (
    <div
      dir="rtl"
      className="ps-page"
      style={{
        minHeight: '100dvh', background: DESK, color: CHARCOAL,
        fontFamily: SANS, textAlign: 'right',
        padding: 'calc(6px + env(safe-area-inset-top)) 4px calc(20px + env(safe-area-inset-bottom))',
        boxSizing: 'border-box',
      }}
    >
      {/* Rules that inline styles cannot express.
          1. The entry group starts at the row's horizontal CENTRE and
             runs left — width 50%, never shrinking. The centre line is
             a starting point, not an edge: min-width:max-content lets a
             group that needs more than half the row grow rightward past
             it instead of clipping a box or opening a scrollport.
          2. Spinner arrows would eat a 24px box.
          3. App.css carries a blanket `* { overflow-x: hidden }`, which
             makes every element its own scrollport. `clip` clips the
             same way and creates none. */
      }
      <style>{`
.ps-entry{width:50%;min-width:-webkit-max-content;min-width:max-content;flex-shrink:0;display:flex;justify-content:flex-start;align-items:center;flex-wrap:nowrap}
.ps-page input[type=number]{-moz-appearance:textfield}
.ps-page input[type=number]::-webkit-outer-spin-button,
.ps-page input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
html,body,#root,.ps-page,.ps-frame{overflow-x:clip}`}</style>

      {/* ── The sheet: charcoal frame, cream paper ─────────────────── */}
      <div className="ps-frame" style={{
        border: `7px solid ${CHARCOAL}`, borderRadius: 12,
        background: CHARCOAL, boxSizing: 'border-box',
      }}>
        <div style={{
          background: CREAM, borderRadius: 6, overflow: 'hidden',
          position: 'relative',
        }}>

          {/* ── Header band, 52px ──────────────────────────────────
              charcoal wedge top LEFT, orange wordmark block top
              RIGHT, the plan title between them. */}
          <div style={{ position: 'relative', height: 52, background: CREAM }}>
            <div style={{
              position: 'absolute', left: 0, top: 0, width: 120, height: 52,
              background: CHARCOAL,
              clipPath: 'polygon(0 0,100% 0,55% 100%,0 100%)',
              pointerEvents: 'none',
            }} />
            {/* The way back. This route has no app header, and the
                wedge is the one solid block with room for it. */}
            <button
              type="button"
              onClick={() => navigate(backTo)}
              aria-label="חזרה"
              style={{
                position: 'absolute', left: 0, top: 0, width: 52, height: 52,
                background: 'transparent', border: 'none', color: CREAM,
                fontSize: 19, lineHeight: 1, cursor: 'pointer',
                fontFamily: 'inherit', padding: 0, minHeight: 52,
              }}
            >←</button>

            <div style={{
              position: 'absolute', right: 0, top: 0, width: 96, height: 52,
              background: ORANGE,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{
                color: CREAM, fontSize: 13, letterSpacing: 1,
                fontWeight: 600, whiteSpace: 'nowrap', lineHeight: 1,
              }}>AthletiGo</span>
            </div>

            {/* To the LEFT of the orange block. */}
            <div style={{
              position: 'absolute', top: 0, right: 96, left: 120, height: 52,
              display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
              padding: '0 8px', minWidth: 0,
            }}>
              <span style={{
                fontSize: 15, fontWeight: 500, color: CHARCOAL, minWidth: 0,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{planTitle}</span>
            </div>
          </div>

          {/* Name and date, one white bar, packed right. */}
          <div style={{
            background: WHITE,
            borderTop: `0.5px solid ${CARD_BORDER}`,
            borderBottom: `0.5px solid ${CARD_BORDER}`,
            padding: '6px 9px', display: 'flex', alignItems: 'baseline',
            justifyContent: 'flex-start', gap: 10, minWidth: 0,
          }}>
            <span style={{
              fontSize: 12, fontWeight: 500, color: CHARCOAL, minWidth: 0,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{plan?.assigned_to_name || user?.full_name || 'מתאמן'}</span>
            <span style={{ fontSize: 11, color: MUTED, flexShrink: 0 }}>{todayLabel()}</span>
            {family && (
              <span style={{ fontSize: 11, color: ORANGE, flexShrink: 0 }}>
                אימון {family.position}/{family.total}
              </span>
            )}
          </div>

          {/* ── Sections ─────────────────────────────────────────── */}
          <div style={{ padding: '7px 5px 0' }}>
            {grouped.map(({ section, rows }) => {
              const cat = (section.category || section.section_name || '').trim();
              const rail = section.coach_notes || '';
              // Exactly this name, nothing fuzzy — one section renders
              // as prose and every other one is untouched.
              const isNotes = (section.section_name || '').trim() === 'הערות';
              const isShut = !!collapsed[section.id];
              const toggle = () => setCollapsed((c) => ({ ...c, [section.id]: !c[section.id] }));
              return (
                <div key={section.id} style={{
                  display: 'flex', gap: 5, marginBottom: 7, alignItems: 'stretch',
                }}>
                  {/* Label card — first child is RIGHTMOST in RTL. */}
                  <button
                    type="button"
                    onClick={toggle}
                    aria-expanded={!isShut}
                    style={{
                      ...cardShell, width: RAIL_W, flexShrink: 0,
                      padding: 0, minHeight: 0,
                      display: 'flex', flexDirection: 'column',
                      cursor: 'pointer', fontFamily: 'inherit', color: CHARCOAL,
                    }}
                  >
                    <div style={cardStrip} />
                    <div style={{
                      flex: 1, minHeight: 0,
                      padding: '5px 3px 6px',
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', gap: 2,
                    }}>
                      <span style={{
                        fontSize: 11, lineHeight: 1.25, fontWeight: 500,
                        overflowWrap: 'anywhere', maxWidth: '100%',
                      }}>{section.section_name || cat}</span>
                      <span style={{ fontSize: 9, color: MUTED, lineHeight: 1 }}>
                        {isShut ? '◂' : '▾'}
                      </span>
                      {isShut ? (
                        <span style={{ fontSize: 9, color: ORANGE, lineHeight: 1.2, whiteSpace: 'nowrap' }}>
                          {rows.length}
                        </span>
                      ) : rail ? (
                        <span style={{
                          fontSize: 9, color: ORANGE, lineHeight: 1.25,
                          overflowWrap: 'anywhere',
                        }}>{rail}</span>
                      ) : null}
                    </div>
                  </button>

                  {/* Content card — fills the rest. */}
                  {isShut ? null : (
                    <div style={{ ...cardShell, flex: 1, minWidth: 0 }}>
                      <div style={cardStrip} />
                      {rows.map((ex, i) => {
                        const last = i === rows.length - 1;

                        // ── A הערות row is a line of prose. Before the
                        //    ordinal is spent, so the numbering of real
                        //    exercises is not pushed along by a note.
                        if (isNotes) {
                          return (
                            <div key={ex.id} style={{
                              display: 'flex', gap: 5, alignItems: 'baseline',
                              padding: '7px 8px',
                              borderBottom: last ? 'none' : `1px solid ${DIVIDER}`,
                            }}>
                              <span style={starStyle}>✳</span>
                              <span style={{
                                fontSize: 11, color: CHARCOAL, lineHeight: 1.45,
                                minWidth: 0, overflowWrap: 'anywhere',
                              }}>{ex.exercise_name || ex.name || ''}</span>
                            </div>
                          );
                        }

                        const container = isContainer(ex, parseTabataData);
                        const td = container ? parseTabataData(ex.tabata_data) : null;
                        const { list: subs, kind: subKindOf } = container
                          ? subsOf(ex, td) : { list: [], kind: 'exercises' };
                        const m = measurementKind(ex, null, section);
                        const note = noteOf(ex);
                        const pill = pillOf(ex.mode);
                        const spec = shortcutOf(ex);
                        const clockOnly = isClockOnly(spec);
                        const isClock = isTabataContainer(ex);
                        const hasTarget = m.kind !== 'check' && m.target > 0;
                        const rowKind = container
                          ? 'container'
                          : (clockOnly ? 'clock' : (hasTarget ? m.kind : 'check'));
                        const boxCount = (rowKind === 'check' || rowKind === 'container' || rowKind === 'clock')
                          ? 0
                          : (rowKind === 'tally' ? 1 : m.sets);
                        // Containers and plain exercises share one running
                        // count. Sub rows get an asterisk, never a number.
                        ordinal += 1;
                        const myOrdinal = ordinal;
                        const rowParams = container ? '' : paramText({ ...m, kind: hasTarget ? m.kind : 'check' });
                        // ONE source for the header count AND the box count.
                        const rounds = roundsOf(ex, td);
                        // A planned_sets ladder IS the sets — one box per row.
                        const boxesPerSub = subKindOf === 'sets' ? 1 : rounds;
                        const exName = ex.exercise_name || ex.name || '';

                        // ── A CONTAINER ──────────────────────────────
                        if (container) {
                          return (
                            <div key={ex.id} style={{
                              background: '#FDF9F4',
                              borderRight: `2px solid ${ORANGE}`,
                              borderBottom: last ? 'none' : `1px solid ${DIVIDER}`,
                            }}>
                              <div style={rowLine(true)}>
                                <div
                                  style={textGroup}
                                  onClick={() => openDetail({
                                    name: exName, params: rounds > 1 ? `${rounds} סבבים` : '',
                                    method: pill?.label || null, note,
                                  })}
                                >
                                  <span style={ordinalStyle}>{myOrdinal}.</span>
                                  <span style={nameStyle} title={exName}>{exName}</span>
                                  <MethodPill pill={pill} />
                                  {/* The clock button already prints the
                                      round count, so it is not said twice. */}
                                  {rounds > 1 && !spec && <span style={paramStyle}>{`${rounds} סבבים`}</span>}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }} />
                                {spec && (
                                  <div className="ps-entry" style={{ gap: 4 }}>
                                    {/* A tabata or interval container is a
                                        clock, not a measurement: the button
                                        only, and nothing written back. */}
                                    <ClockShortcut
                                      spec={spec}
                                      setNumber={1}
                                      totalSets={rounds}
                                      disabled={false}
                                    />
                                  </div>
                                )}
                              </div>

                              {subs.map((sub, sidx) => {
                                const sm = subMeasurementKind(sub, section);
                                const subHasTarget = sm.kind !== 'check' && sm.target > 0;
                                // Inside a clock the numbers are the
                                // programme, shown but never editable.
                                const subEditable = subHasTarget && !isClock;
                                const subParams = paramText({ ...sm, kind: subHasTarget ? sm.kind : 'check' });
                                const lastSub = sidx === subs.length - 1;
                                const sbp = boxPlan(subEditable ? boxesPerSub : 0);
                                const subText = subLabel(sub, subKindOf, sidx);
                                const subKey = `${ex.id}:sub${sidx}`;
                                return (
                                  <div key={subKey} style={rowLine(lastSub)}>
                                    {/* Nothing to measure, and not a clock →
                                        the same tick a plain row gets. A
                                        tabata's sub rows stay blank: the
                                        container's own row carries the clock. */}
                                    {!subEditable && !isClock && (
                                      <button
                                        type="button"
                                        onClick={() => toggleSubCheck(ex.id, sidx)}
                                        disabled={locked}
                                        aria-pressed={!!checks[subKey]}
                                        aria-label="סמן כבוצע"
                                        style={checkHit}
                                      >
                                        <span style={checkStyle(!!checks[subKey])}>
                                          {checks[subKey] ? '✓' : ''}
                                        </span>
                                      </button>
                                    )}
                                    <div
                                      style={textGroup}
                                      onClick={() => openDetail({
                                        name: subText, params: subParams,
                                        method: pill?.label || null, note: null,
                                      })}
                                    >
                                      <span style={starStyle}>✳</span>
                                      <span style={nameStyle} title={subText}>{subText}</span>
                                      {subParams && showParams(subEditable ? boxesPerSub : 0, false) && (
                                        <span style={paramStyle}>{subParams}</span>
                                      )}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }} />
                                    {subEditable && (
                                      <div className="ps-entry" style={{ gap: sbp.gap }}>
                                        {Array.from({ length: boxesPerSub }).map((_, ri) => {
                                          const key = `${subKey}:${ri + 1}`;
                                          const v = values[key] ?? '';
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
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        }

                        // ── A PLAIN EXERCISE ROW ─────────────────────
                        const bp = boxPlan(boxCount);
                        return (
                          <div key={ex.id} style={rowLine(last)}>
                            {rowKind === 'check' && (
                              <button
                                type="button"
                                onClick={() => toggleCheck(ex.id)}
                                disabled={locked}
                                aria-pressed={!!checks[ex.id]}
                                aria-label="סמן כבוצע"
                                style={checkHit}
                              >
                                <span style={checkStyle(!!checks[ex.id])}>
                                  {checks[ex.id] ? '✓' : ''}
                                </span>
                              </button>
                            )}
                            <div
                              style={textGroup}
                              onClick={() => openDetail({
                                name: exName, params: rowParams,
                                method: pill?.label || null, note,
                              })}
                            >
                              <span style={ordinalStyle}>{myOrdinal}.</span>
                              <span style={nameStyle} title={exName}>{exName}</span>
                              {showPill(boxCount) && <MethodPill pill={pill} />}
                              {rowParams && showParams(boxCount, !!spec) && (
                                <span style={paramStyle}>{rowParams}</span>
                              )}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }} />
                            {(boxCount > 0 || spec) && (
                              <div className="ps-entry" style={{ gap: bp.gap }}>
                                {/* The button sits at the LEFT end of the
                                    group, past the boxes, so the boxes
                                    keep the centre line. */}
                                {Array.from({ length: boxCount }).map((_, si) => {
                                  const key = `${ex.id}:${si + 1}`;
                                  const v = values[key] ?? '';
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
                                {spec && (
                                  <ClockShortcut
                                    spec={spec}
                                    setNumber={1}
                                    totalSets={Math.max(1, boxCount)}
                                    disabled={locked}
                                    onElapsed={
                                      // A countdown measures; a clock-only
                                      // row writes nothing back.
                                      (!clockOnly && boxCount > 0)
                                        ? (seconds) => writeClockSeconds(ex.id, boxCount, m.payloadField, seconds)
                                        : undefined
                                    }
                                  />
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Feeling ──────────────────────────────────────────── */}
          <div style={{ padding: '0 5px' }}>
            <div style={{ ...cardShell, marginTop: 2 }}>
              <div style={cardStrip} />
              <div style={{ padding: '7px 8px 9px' }}>
                <div style={{ fontSize: 11, fontWeight: 500, marginBottom: 6 }}>תחושה</div>
                <div style={{ display: 'flex', gap: 3 }}>
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
                          flex: 1, minWidth: 0, height: 30, minHeight: 30,
                          border: `1px solid ${on ? ORANGE : (locked ? '#E2DAD0' : '#D9D0C4')}`,
                          background: on ? ORANGE : WHITE,
                          color: on ? WHITE : CHARCOAL,
                          fontSize: 12, fontWeight: 500, borderRadius: 3,
                          cursor: locked ? 'default' : 'pointer',
                          fontFamily: 'inherit', padding: 0,
                          opacity: locked && !on ? 0.75 : 1,
                        }}
                      >{n}</button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* אימון חדש — the only action on a locked sheet, and always
              available on an open one. Duplicates through the existing
              duplicatePlan and drops straight into the copy. */}
          <div style={{ padding: '8px 5px 0' }}>
            <button
              type="button"
              onClick={startNewWorkout}
              disabled={duplicating}
              style={{
                width: '100%', minHeight: TOUCH,
                border: 'none', borderRadius: 4,
                background: CHARCOAL, color: CREAM,
                fontSize: 14, fontWeight: 500, fontFamily: 'inherit',
                cursor: duplicating ? 'default' : 'pointer',
                opacity: duplicating ? 0.6 : 1,
              }}
            >{duplicating ? 'יוצר…' : 'אימון חדש מהתוכנית'}</button>

            {locked && (
              <div style={{ marginTop: 6, fontSize: 11, color: MUTED, textAlign: 'center' }}>
                האימון הזה כבר בוצע — לצפייה בלבד
              </div>
            )}
          </div>

          {/* Orange wedge, bottom LEFT — the foot of the printed page. */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <div style={{
              width: 90, height: 22, background: ORANGE,
              clipPath: 'polygon(0 0,55% 0,100% 100%,0 100%)',
              pointerEvents: 'none',
            }} />
          </div>
        </div>
      </div>

      {/* Tap detail — the whole stored name plus everything the single
          line could not show. Read only. */}
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
