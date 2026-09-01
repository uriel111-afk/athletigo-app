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
  const commitInner = useCallback(async (exerciseId, drillIdx, raw, payloadField) => {
    if (locked) return;
    const id = await ensureExecution();
    if (!id) { toast.error('לא ניתן לשמור כרגע'); return; }
    const n = raw === '' ? null : Number(raw);
    const { error } = await saveSetActual(
      supabase, id, exerciseId, drillIdx, 1,
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
  const rowStyle = {
    display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
    minHeight: ROW_H,
  };
  // Measured in a browser at 390px before shipping. On that width the
  // card is 264px, so the 52% line lands at x=207 in every row.
  const infoBlock = {
    width: INFO_W, flexShrink: 0, minWidth: 0,
    display: 'flex', alignItems: 'center', gap: 6,
    overflow: 'hidden', whiteSpace: 'nowrap',
  };
  // SHRINK-TO-FIT, never flex:1. flex:1 is what stretched the boxes to
  // the card edge. maxWidth caps it at the complement of INFO_W so a
  // 5-set row scrolls inside its own half instead of overflowing.
  const entryBlock = {
    flexShrink: 0, maxWidth: '48%',
    display: 'flex', gap: 5,
    overflowX: 'auto', overflowY: 'hidden',
  };
  const ordinalStyle = {
    flexShrink: 0, minWidth: 18, color: ORANGE, fontSize: 15, fontWeight: 800,
  };
  // flex:1 so the name takes every pixel the params and pill leave,
  // and truncates only when it genuinely exceeds that.
  const nameStyle = {
    flex: 1, minWidth: 0, fontSize: 16, fontWeight: 500,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  };
  // flexShrink:0 on both so they never steal the name’s width.
  const paramStyle = {
    flexShrink: 0, fontSize: 12, fontWeight: 700, color: CHARCOAL,
  };
  const pillStyle = (bg) => ({
    flexShrink: 0, fontSize: 9, fontWeight: 700,
    padding: '2px 6px', borderRadius: 999, background: bg, color: WHITE,
  });
  const checkStyle = (on) => ({
    flexShrink: 0, width: 26, height: 26, borderRadius: 5,
    border: `1.5px solid ${on ? ORANGE : (locked ? '#E2DAD0' : '#D9D0C4')}`,
    background: on ? ORANGE : (locked ? '#F4EEE6' : CREAM),
    color: WHITE, fontSize: 15, fontWeight: 900,
    lineHeight: 1, fontFamily: 'inherit', padding: 0,
    cursor: locked ? 'default' : 'pointer',
    opacity: locked && !on ? 0.75 : 1,
  });
  const box = (filled) => ({
    // border-box matters: without it the border and the number-input
    // padding pushed each box ~7px wider and three of them overflowed
    // the card.
    boxSizing: 'border-box',
    width: 38, height: TOUCH, flexShrink: 0,
    // Locked → visibly muted, so a viewed sheet never looks fillable.
    border: `1.5px solid ${locked ? '#E2DAD0' : (filled ? ORANGE : '#D9D0C4')}`,
    background: locked ? '#F4EEE6' : (filled ? WHITE : CREAM),
    opacity: locked ? 0.75 : 1,
    borderRadius: 6, textAlign: 'center',
    fontSize: 15, fontWeight: 700, color: CHARCOAL,
    fontFamily: 'inherit', outline: 'none', padding: 0,
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

              {/* LEFT column — the rows. */}
              <div style={{
                flex: 1, minWidth: 0, background: WHITE,
                border: `1.5px solid ${CHARCOAL}`, borderInlineStart: 'none',
              }}>
                {rows.map((ex, i) => {
                  const container = isContainer(ex, parseTabataData);
                  const subs = container ? innerExercisesOf(ex, parseTabataData) : [];
                  const m = measurementKind(ex);
                  const note = noteOf(ex);
                  const method = getMethodByMode(ex.mode);
                  const showPill = !!ex.mode && method?.mode === ex.mode;
                  const pillColor = section.color_theme || CHARCOAL;
                  // A measured row with no visible target would be a lone
                  // empty box the trainee cannot interpret. It becomes a tick.
                  // A TABATA is a clock, not a measurement: its container
                  // row takes the tick and its sub-exercises are listed for
                  // reading only, with their work times shown but no boxes.
                  const isClock = isTabataContainer(ex);
                  const hasTarget = m.kind !== "check" && m.target > 0;
                  const rowKind = container
                    ? (isClock ? "check" : "container")
                    : (hasTarget ? m.kind : "check");
                  const boxCount = (rowKind === "check" || rowKind === "container")
                    ? 0
                    : (rowKind === "tally" ? 1 : m.sets);
                  if (rowKind !== "check") ordinal += 1;
                  const myOrdinal = ordinal;

                  return (
                    <div
                      key={ex.id}
                      style={{
                        borderTop: i === 0 ? "none" : "1px solid #E8E0D5",
                        padding: "4px 8px",
                      }}
                    >
                      {/* Two flex children, never a spacer: a fixed 52%
                          info block, then the entry block. That is what
                          puts every row’s boxes on one vertical line. */}
                      <div style={rowStyle}>
                        <div style={infoBlock}>
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
                          ) : (
                            <span style={ordinalStyle}>{myOrdinal}</span>
                          )}

                          {/* name → parameters → pill, right to left. */}
                          <span style={nameStyle}>{ex.exercise_name || ex.name}</span>
                          {!container && paramText({ ...m, kind: rowKind }) && (
                            <span style={paramStyle}>{paramText({ ...m, kind: rowKind })}</span>
                          )}
                          {showPill && (
                            <span style={pillStyle(pillColor)}>{method.label}</span>
                          )}
                        </div>

                        <div style={entryBlock}>
                          {Array.from({ length: boxCount }).map((_, si) => {
                            const key = `${ex.id}:${si + 1}`;
                            const v = values[key] ?? "";
                            return (
                              <input
                                key={key}
                                type="number"
                                inputMode="numeric"
                                placeholder="–"
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

                      {/* Container: one row per sub-exercise beneath,
                          indented, each with its own params and its own
                          boxes on the same 52% line. Nothing sits beside
                          the container name, so nothing can overlap it. */}
                      {container && subs.map((sub, sidx) => {
                        const sm = subMeasurementKind(sub);
                        const subHasTarget = sm.kind !== "check" && sm.target > 0;
                        // Inside a clock the numbers are the programme, not
                        // something to enter — shown, never editable.
                        const subKind = (subHasTarget && !isClock) ? sm.kind : "check";
                        const subParams = paramText({ ...sm, kind: subHasTarget ? sm.kind : "check" });
                        const subName = sub?.exercise_name || sub?.name || "תרגיל";
                        const subKey = `${ex.id}:sub${sidx}`;
                        return (
                          <div
                            key={subKey}
                            style={rowStyle}
                          >
                            <div style={{ ...infoBlock, paddingInlineStart: 26 }}>
                              <span style={{ flexShrink: 0, color: MUTED, fontSize: 13 }}>•</span>
                              <span style={{ ...nameStyle, fontSize: 14 }}>{subName}</span>
                              {subParams && (
                                <span style={paramStyle}>{subParams}</span>
                              )}
                            </div>
                            <div style={entryBlock}>
                              {subKind !== "check" && (() => {
                                const key = `${ex.id}:sub${sidx}:1`;
                                const v = values[key] ?? "";
                                return (
                                  <input
                                    type="number"
                                    inputMode="numeric"
                                    placeholder="–"
                                    disabled={locked}
                                    value={v}
                                    onChange={(e) => setValues((pv) => ({ ...pv, [key]: e.target.value }))}
                                    onBlur={(e) => commitInner(ex.id, sidx, e.target.value, sm.payloadField)}
                                    style={box(has(v))}
                                  />
                                );
                              })()}
                            </div>
                          </div>
                        );
                      })}

                      {/* Second line, only for a technical cue. */}
                      {note && (
                        <div style={{
                          fontSize: 11, color: MUTED, paddingInlineStart: 34,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {note}
                        </div>
                      )}
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
