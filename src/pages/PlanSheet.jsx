import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
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
const RAIL_W   = 68;
const TOUCH    = 44;
const ROW_H    = 46;
// Every row's entry area begins on the SAME vertical line: the info
// block is exactly this wide, the entry block takes the rest. No
// spacer, no margin-right:auto, no space-between.
const INFO_W   = '52%';

// Measurability is decided by the EXERCISE, never by the section it
// sits in. The section-name rule that used to live here hid the boxes
// on rows carrying a real target — a 60-second hold inside גמישות is
// a number the trainee fills in.
//
// The derivation itself lives in src/lib/exerciseMeasurement.js and is
// shared with WorkoutSheet, so the two screens cannot disagree.

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
        .select('exercise_id, set_number, reps_completed, time_completed, weight_used')
        .eq('execution_id', ex.id);
      const next = {}; const nextChecks = {};
      for (const l of logs || []) {
        const v = l.reps_completed ?? l.time_completed ?? l.weight_used;
        if (v != null) next[`${l.exercise_id}:${l.set_number}`] = String(v);
        else nextChecks[l.exercise_id] = true;
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
  // The two halves of every row. infoBlock is a FIXED width, which is
  // the whole fix for boxes drifting to the outer edge.
  // ── Row styles, matching the approved markup exactly. ──────────
  // The info block is width 52% flexShrink 0. The entry block is
  // flexShrink 0 with NO flex:1. No justifyContent, no spacer.
  const plainRow = {
    display: 'flex', alignItems: 'center', padding: '10px 9px',
    borderBottom: '1px solid #E0D4C2',
  };
  const infoBlock = {
    width: '52%', flexShrink: 0, minWidth: 0,
    display: 'flex', alignItems: 'baseline', gap: 9,
    overflow: 'hidden', whiteSpace: 'nowrap',
  };
  const ordinalStyle = {
    fontSize: 12, color: ORANGE, fontWeight: 500, flexShrink: 0,
  };
  const nameStyle = {
    fontSize: 16, color: CHARCOAL, fontWeight: 500,
    overflow: 'hidden', textOverflow: 'ellipsis',
  };
  const paramStyle = {
    fontSize: 13, color: CHARCOAL, flexShrink: 0,
  };
  // At 360px the card is far narrower than the 514px this was first
  // measured at. Without a cap a 7-box group is wider than the space
  // left of the 52% line, so it pushed past and drifted to the card
  // edge. maxWidth pins the group; the boxes then shrink to a 26px
  // floor; only past that does the group scroll inside itself.
  const entryBlock = {
    display: 'flex', gap: 4, flexShrink: 0,
    maxWidth: '48%',
    overflowX: 'auto', overflowY: 'hidden',
  };

  // ── Container: one wrapper, tinted, orange rail on its RIGHT. ───
  // 3px, not 4 — at 4 it read as a filled column rather than a rail.
  // marginRight 1 keeps it off the beige section label so the two do
  // not merge into one solid mass.
  const containerWrap = {
    background: '#FDF6EE', borderRight: `3px solid ${ORANGE}`,
    marginRight: 1,
    borderBottom: '1px solid #E0D4C2',
  };
  const containerHead = {
    padding: '8px 9px 4px', display: 'flex', alignItems: 'baseline', gap: 8,
    overflow: 'hidden', whiteSpace: 'nowrap',
  };
  const containerNum  = { fontSize: 12, color: ORANGE, fontWeight: 500, flexShrink: 0 };
  const containerName = { fontSize: 13, color: CHARCOAL, fontWeight: 500, flexShrink: 0 };
  const containerMeta = {
    fontSize: 11, color: MUTED,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  };

  // ── Sub row: same two blocks, plus an asterisk and an indent. ───
  // No borderBottom — the wrapper carries it.
  const subRow = {
    display: 'flex', alignItems: 'center',
  };
  const subInfo = {
    width: '52%', flexShrink: 0, minWidth: 0,
    display: 'flex', alignItems: 'baseline', paddingRight: 12,
    overflow: 'hidden', whiteSpace: 'nowrap',
  };
  const subStar  = { fontSize: 14, color: ORANGE, marginLeft: 6, flexShrink: 0 };
  const subName  = {
    fontSize: 15, color: CHARCOAL, fontWeight: 500, marginLeft: 8,
    overflow: 'hidden', textOverflow: 'ellipsis',
  };
  const subParam = { fontSize: 13, color: CHARCOAL, flexShrink: 0 };

  const checkStyle = (on) => ({
    flexShrink: 0, width: 32, height: 32, borderRadius: 5,
    border: `1.5px solid ${on ? ORANGE : (locked ? '#E2DAD0' : '#C9BCAB')}`,
    background: on ? ORANGE : (locked ? '#F4EEE6' : CREAM),
    color: WHITE, fontSize: 15, fontWeight: 900, lineHeight: 1,
    fontFamily: 'inherit', padding: 0, boxSizing: 'border-box',
    cursor: locked ? 'default' : 'pointer',
    opacity: locked && !on ? 0.75 : 1,
  });

  const box = (filled) => ({
    // 32 preferred, shrinking to 26 before the group scrolls.
    flex: '0 1 32px', minWidth: 26,
    width: 32, textAlign: "center", fontSize: 13, padding: "6px 0",
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
      style={{
        minHeight: '100dvh', background: CREAM, color: CHARCOAL,
        fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
        textAlign: 'right',
        padding: 'calc(12px + env(safe-area-inset-top)) 12px calc(24px + env(safe-area-inset-bottom))',
      }}
    >
      <div style={{ maxWidth: 720, margin: '0 auto' }}>

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
        <div style={{
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
          return (
            <div key={section.id} style={{ display: 'flex', marginBottom: 12 }}>
              {/* RIGHT rail — first child is rightmost in RTL. */}
              <div style={{
                width: RAIL_W, flexShrink: 0,
                background: BEIGE, border: `1.5px solid ${CHARCOAL}`,
                padding: '10px 4px', textAlign: 'center',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              }}>
                <span style={{ fontSize: 11, fontWeight: 800, lineHeight: 1.2, whiteSpace: 'nowrap' }}>
                  {section.section_name || cat}
                </span>
                {rail && (
                  <span style={{ fontSize: 10, color: ORANGE, fontWeight: 600, lineHeight: 1.3 }}>
                    {rail.length > 40 ? rail.slice(0, 38) + '…' : rail}
                  </span>
                )}
              </div>

              {/* LEFT column — the rows. width:100% + minWidth:0 so the
                  52% on every info block has a DEFINITE containing block
                  to resolve against. A percentage against an auto-sized
                  flex item is what silently fell back to content width. */}
              <div style={{
                flex: 1, width: '100%', minWidth: 0, background: WHITE,
                border: `1.5px solid ${CHARCOAL}`, borderInlineStart: 'none',
              }}>
                {rows.map((ex, i) => {
                  const container = isContainer(ex, parseTabataData);
                  const td = container ? parseTabataData(ex.tabata_data) : null;
                  const { list: subs, kind: subKindOf } = container
                    ? subsOf(ex, td) : { list: [], kind: "exercises" };
                  const m = measurementKind(ex);
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
                          const sm = subMeasurementKind(sub);
                          const subHasTarget = sm.kind !== "check" && sm.target > 0;
                          // Inside a clock the numbers are the programme,
                          // shown but never editable.
                          const subEditable = subHasTarget && !isClock;
                          const subParams = paramText({ ...sm, kind: subHasTarget ? sm.kind : "check" });
                          const last = sidx === subs.length - 1;
                          return (
                            <div
                              key={`${ex.id}:sub${sidx}`}
                              style={{ ...subRow, padding: last ? "7px 9px 10px" : "7px 9px" }}
                            >
                              <div style={subInfo}>
                                <span style={subStar}>✳</span>
                                <span style={subName}>{subLabel(sub, subKindOf, sidx)}</span>
                                {subParams && <span style={subParam}>{subParams}</span>}
                              </div>
                              <div style={entryBlock}>
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
                                      style={box(has(v))}
                                    />
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  }

                  // ── A PLAIN EXERCISE ROW ───────────────────────────
                  return (
                    <div key={ex.id} style={plainRow}>
                      <div style={infoBlock}>
                        <span style={ordinalStyle}>{myOrdinal}.</span>
                        <span style={nameStyle}>{ex.exercise_name || ex.name}</span>
                        {params && <span style={paramStyle}>{params}</span>}
                      </div>
                      <div style={entryBlock}>
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
                              style={box(has(v))}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
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
    </div>
  );
}
