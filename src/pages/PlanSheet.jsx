import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import { AuthContext } from '@/lib/AuthContext';
import PageLoader from '@/components/PageLoader';
import { getMethodByMode } from '@/constants/trainingMethods';
import { measurementKind, has } from '@/lib/exerciseMeasurement';
import { saveSetActual } from '@/lib/plannedSets';

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
const RAIL_W   = 54;
const TOUCH    = 44;
// Every row's entry area starts on the same vertical line.
const ENTRY_AT = '52%';

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
    const id = await ensureExecution();
    if (!id) { toast.error('לא ניתן לשמור כרגע'); return; }
    const n = raw === '' ? null : Number(raw);
    const { error } = await saveSetActual(
      supabase, id, exerciseId, 0, setIdx,
      { [logField]: n },
      { allowEmpty: raw === '' },
    );
    if (error) { console.error('[PlanSheet] save failed:', error); toast.error('השמירה נכשלה'); }
  }, [ensureExecution]);

  const toggleCheck = useCallback(async (exerciseId) => {
    const nextVal = !checks[exerciseId];
    setChecks((p) => ({ ...p, [exerciseId]: nextVal }));
    const id = await ensureExecution();
    if (!id) return;
    // A check carries no measurement, so allowEmpty is required or the
    // empty-write guard in saveSetActual drops it.
    await saveSetActual(supabase, id, exerciseId, 0, 1, {}, { allowEmpty: true });
  }, [checks, ensureExecution]);

  const saveFeeling = useCallback(async (n) => {
    setFeeling(n);
    const id = await ensureExecution();
    if (!id) return;
    const { error } = await supabase
      .from('workout_executions').update({ self_rating: n }).eq('id', id);
    if (error) { console.error('[PlanSheet] feeling save failed:', error); toast.error('השמירה נכשלה'); }
  }, [ensureExecution]);

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
  const box = (filled) => ({
    width: 46, height: TOUCH, flexShrink: 0,
    border: `1.5px solid ${filled ? ORANGE : '#D9D0C4'}`,
    background: filled ? WHITE : CREAM,
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
                <span style={{ fontSize: 13, fontWeight: 800, lineHeight: 1.25, wordBreak: 'break-word' }}>
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
                  const m = measurementKind(ex);
                  const note = noteOf(ex);
                  const method = getMethodByMode(ex.mode);
                  const showPill = !!ex.mode && method?.mode === ex.mode;
                  const pillColor = section.color_theme || CHARCOAL;
                  if (m.kind !== 'check') ordinal += 1;
                  const myOrdinal = ordinal;
                  const boxCount = m.kind === 'tally' ? 1 : (m.kind === 'check' ? 0 : m.sets);

                  return (
                    <div
                      key={ex.id}
                      style={{
                        borderTop: i === 0 ? 'none' : `1px solid #E8E0D5`,
                        padding: '6px 8px',
                      }}
                    >
                      {/* The single line. */}
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        minHeight: TOUCH, whiteSpace: 'nowrap', overflow: 'hidden',
                      }}>
                        {m.kind === 'check' ? (
                          <button
                            type="button"
                            onClick={() => toggleCheck(ex.id)}
                            aria-pressed={!!checks[ex.id]}
                            style={{
                              flexShrink: 0, width: 26, height: 26, borderRadius: 5,
                              border: `1.5px solid ${checks[ex.id] ? ORANGE : '#D9D0C4'}`,
                              background: checks[ex.id] ? ORANGE : CREAM,
                              color: WHITE, fontSize: 15, fontWeight: 900,
                              lineHeight: 1, cursor: 'pointer', fontFamily: 'inherit', padding: 0,
                            }}
                          >
                            {checks[ex.id] ? '✓' : ''}
                          </button>
                        ) : (
                          <span style={{
                            flexShrink: 0, minWidth: 18, color: ORANGE,
                            fontSize: 15, fontWeight: 800,
                          }}>
                            {myOrdinal}
                          </span>
                        )}

                        {/* The most prominent thing. Truncates, never wraps. */}
                        <span style={{
                          flexShrink: 1, minWidth: 0, fontSize: 16, fontWeight: 500,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {ex.exercise_name || ex.name}
                        </span>

                        {/* Parameters, plain text, no box. */}
                        {paramText(m) && (
                          <span style={{ flexShrink: 0, fontSize: 13, fontWeight: 600, color: CHARCOAL }}>
                            {paramText(m)}
                          </span>
                        )}

                        {/* Method pill, coloured from the plan data. */}
                        {showPill && (
                          <span style={{
                            flexShrink: 0, fontSize: 10, fontWeight: 700,
                            padding: '2px 8px', borderRadius: 999,
                            background: pillColor, color: WHITE,
                          }}>
                            {method.label}
                          </span>
                        )}

                        {/* Entry area — always begins at the same line. */}
                        <span style={{ flex: 1, minWidth: 0 }} />
                        {boxCount > 0 && (
                          <span style={{
                            flexShrink: 0, display: 'flex', gap: 6,
                            marginInlineStart: `calc(${ENTRY_AT} - 100%)`,
                          }}>
                            {Array.from({ length: boxCount }).map((_, si) => {
                              const key = `${ex.id}:${si + 1}`;
                              const v = values[key] ?? '';
                              return (
                                <input
                                  key={key}
                                  type="number"
                                  inputMode="numeric"
                                  placeholder="–"
                                  value={v}
                                  onChange={(e) => setValues((p) => ({ ...p, [key]: e.target.value }))}
                                  onBlur={(e) => commit(ex.id, si + 1, e.target.value, m.payloadField)}
                                  style={box(has(v))}
                                />
                              );
                            })}
                          </span>
                        )}
                      </div>

                      {/* Second line, only for a technical cue. */}
                      {note && (
                        <div style={{
                          fontSize: 11, color: MUTED, paddingInlineStart: 34,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
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
                  style={{
                    flex: 1, minWidth: 0, height: TOUCH,
                    border: `1.5px solid ${on ? ORANGE : '#D9D0C4'}`,
                    background: on ? ORANGE : CREAM,
                    color: on ? WHITE : CHARCOAL,
                    fontSize: 15, fontWeight: 800, borderRadius: 6,
                    cursor: 'pointer', fontFamily: 'inherit', padding: 0,
                  }}
                >
                  {n}
                </button>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
