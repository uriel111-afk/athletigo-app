import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Play } from 'lucide-react';
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
import { parseTabataData, readTabataSets, tabataSetToClockCfg } from '@/lib/tabataSettings';
import { saveSetActual } from '@/lib/plannedSets';
import { duplicatePlan } from '@/lib/plansApi';
import { useClock } from '@/contexts/ClockContext';
import { useActiveTimer } from '@/contexts/ActiveTimerContext';
import { formatDuration, LTR_TIME } from '@/lib/duration';
import ClockLeadIn from '@/components/training/ClockLeadIn';
import {
  resolveExerciseClock, useExerciseClock,
  InlineExerciseClock, ClockSwapPrompt,
} from '@/components/training/ExerciseClock';
import {
  Dialog, DialogContent,
} from '@/components/ui/dialog';

/**
 * PlanSheet — the workout execution screen, drawn as the printed
 * AthletiGo plan sheet with entry boxes added.
 *
 * THE LAW OF THE SHEET: data bold, instructions regular. Every number
 * a trainee reads or writes is set large and at weight 500; every
 * instruction — the coach's hint, the unit under a number — is small,
 * regular, and grey.
 *
 * A row is ONE flex line plus, when the coach wrote one, a hint line
 * beneath it. Right to left: tick, ordinal, name, method pill, the
 * param block, a 16px spacer, the entry group. Only the name shrinks.
 * Anything that will not fit opens on a tap.
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
const DIVIDER     = '#F0E7DA';   // between rows
const MUTED       = '#8A8079';   // hints and unit labels
const DESK        = '#EDE3D6';   // behind the sheet
// The container title band, and the tap dialog's header.
const BAND_BG     = '#FFF4EA';
const BAND_LINE   = '#F0C9A8';
// Save + target feedback.
const GREEN       = '#0F6E56';
const UNDER       = '#D85A30';
const BOX_IDLE    = '#D5C8B6';

const SANS = "'Rubik', system-ui, -apple-system, sans-serif";

// Section label card, on the RIGHT of every section.
const RAIL_W = 56;
// The charcoal header wedge. Its clip-path runs 55% wide at the
// bottom, so only the left 55% is solid for the full 52px.
const WEDGE_W = 120;
// Entry boxes. Height is fixed; width comes from boxPlan() below.
const BOX_H  = 30;
// The one place a 44px touch target still applies: the page's own
// actions, which are not part of the ruled sheet.
const TOUCH  = 44;

/**
 * SECTION COLOURS — one hue per section, carried by the card border,
 * the 4px strip across the top, and the label card.
 *
 * Matched loosely: trimmed, and with or without a trailing colon,
 * against section_name first and category second. Anything unknown
 * takes the חימום palette.
 */
const SECTION_THEMES = {
  'חימום':  { hue: '#FF6F20', bg: '#FFE2CD', fg: '#7A2E00' },
  'מתיחות': { hue: '#EF9F27', bg: '#FAEEDA', fg: '#633806' },
  'כוח':    { hue: '#2D2A26', bg: '#F1EFE8', fg: '#2D2A26' },
  'גמישות': { hue: '#D85A30', bg: '#FAECE7', fg: '#4A1B0C' },
  'הערות':  { hue: '#888780', bg: '#F1EFE8', fg: '#444441' },
};
const DEFAULT_THEME = SECTION_THEMES['חימום'];

/** Trimmed, trailing colon (ASCII or full-width) removed. */
const looseName = (s) => String(s ?? '').trim().replace(/[:：]+\s*$/, '').trim();

export function themeOf(section) {
  const a = looseName(section?.section_name);
  const b = looseName(section?.category);
  return SECTION_THEMES[a] || SECTION_THEMES[b] || DEFAULT_THEME;
}

/**
 * Box width BY COUNT, and the entry group never clips.
 *   1 box → 36px    2-4 → 28px    5+ → 24px
 * Height is fixed so a row's height does not move with its box count.
 */
function boxPlan(count) {
  const n = Math.max(1, Number(count) || 1);
  return { w: n === 1 ? 36 : n <= 4 ? 28 : 24, gap: n >= 5 ? 3 : 4 };
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
      fontSize: 10, lineHeight: 1.6, fontWeight: 500,
      borderRadius: 9, padding: '1px 7px',
      whiteSpace: 'nowrap',
    }}>{pill.label}</span>
  );
}

/**
 * THE PARAM BLOCK — the number the coach prescribed, set big, with its
 * unit underneath in small grey. The number is the data; the label is
 * the instruction.
 *
 * SETS ARE NEVER PRINTED here when the row has entry boxes: the box
 * count IS the sets, and saying it twice was the old "25X2". A
 * check-only row has no boxes to count, so its sets go to the hint.
 */
function ParamBlock({ value, label, size = 19 }) {
  if (value == null || value === '') return null;
  return (
    <div style={{
      flexShrink: 0, textAlign: 'center',
      marginInlineStart: 2,   // the 8px separation from the name
    }}>
      <div style={{
        fontSize: size, fontWeight: 500, color: CHARCOAL, lineHeight: 1.05,
        direction: 'ltr', unicodeBidi: 'isolate', whiteSpace: 'nowrap',
      }}>{value}</div>
      {label && (
        <div style={{
          fontSize: 9, fontWeight: 400, color: MUTED, lineHeight: 1.3,
          whiteSpace: 'nowrap',
        }}>{label}</div>
      )}
    </div>
  );
}

/**
 * The coach's hint. Its own line under the row, indented past the
 * ordinal so it reads as belonging to the name above it. REGULAR
 * weight — it is an instruction, not data.
 */
function HintLine({ text, indent }) {
  if (!text) return null;
  return (
    <div style={{
      fontSize: 11, fontWeight: 400, color: MUTED, lineHeight: 1.45,
      paddingInlineStart: indent, paddingBottom: 6, marginTop: -2,
      overflowWrap: 'anywhere',
    }}>{text}</div>
  );
}

// Durations are formatted by src/lib/duration.js — the ONE formatter.
// The local formatDuration() that used to live here was the fourth copy in the
// app and the reason the same 45 seconds read four different ways.

/** The exercise's OWN values, as the shortcut prints them. */
function clockLabel(spec) {
  if (!spec) return '';
  if (spec.kind === 'countdown') return formatDuration(spec.seconds);
  const bits = [formatDuration(spec.workSeconds)];
  if (spec.restSeconds > 0) bits.push(formatDuration(spec.restSeconds));
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

/**
 * The param block for a top-level row, derived from the SAME
 * measurementKind the boxes are derived from, so the printed target
 * and the entry strip can never disagree.
 *
 * A time row is labelled by which column actually carried it:
 * static_hold_time reads החזקה, work_time reads זמן.
 */
function paramOf(exercise, m, kind) {
  if (kind === 'check' || !m || !m.target) return null;
  if (kind === 'tally') return { value: String(m.target), label: 'סבבים', size: 19 };
  if (kind === 'time') {
    return {
      value: formatDuration(m.target),
      label: has(exercise?.static_hold_time) ? 'החזקה' : 'זמן',
      size: 17,
    };
  }
  return { value: String(m.target), label: 'חזרות', size: 19 };
}

/** The same, for a sub-exercise inside a container. */
function subParamOf(sub, sm, size = 16) {
  if (!sm || sm.kind === 'check' || !sm.target) return null;
  if (sm.kind === 'time') {
    return {
      value: formatDuration(sm.target),
      label: has(sub?.hold_seconds) ? 'החזקה' : 'זמן',
      size: size - 2,
    };
  }
  return { value: String(sm.target), label: 'חזרות', size };
}

/**
 * A note is ONLY a technical cue. If the coach's text reads like another
 * movement it belongs in its own row, so anything that looks like a list
 * of exercises is not rendered as a note.
 */
function noteOf(carrier) {
  const raw = carrier?.description || carrier?.notes || '';
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
 * The border a box wears once its value has been SAVED.
 *   at or above the coach's target → green
 *   below it                       → the warm orange-red
 * No target to compare against (a tally, or a coach who prescribed no
 * number) → green, because saving is the whole achievement there.
 * Nothing saved yet → the idle rule.
 */
function boxBorder(savedValue, target) {
  if (!has(savedValue)) return BOX_IDLE;
  const t = Number(target);
  if (!Number.isFinite(t) || t <= 0) return GREEN;
  return Number(savedValue) >= t ? GREEN : UNDER;
}

/** The green save control. Appears beside a box the moment it is typed in. */
function SaveDot({ onClick, size = 22, title = 'שמור' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
      aria-label={title}
      title={title}
      style={{
        flexShrink: 0, width: size, height: size, minHeight: size,
        borderRadius: '50%', border: 'none', background: GREEN,
        color: WHITE, padding: 0, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'inherit',
      }}
    >
      <Check size={Math.round(size * 0.6)} strokeWidth={3} color={WHITE} />
    </button>
  );
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
function ClockShortcut({
  spec, exerciseName, setNumber, totalSets, onElapsed, disabled, render,
}) {
  const clock = useClock();
  const { setPendingTabataCfg, setShowTabata } = useActiveTimer() || {};
  // The lead-in's working copy of the values. Non-null only between
  // the tap and the clock actually starting, and thrown away after —
  // this is what keeps a שינוי scoped to the run.
  const [runSpec, setRunSpec] = useState(null);
  const [leadIn, setLeadIn] = useState(false);
  // The hook's completion effect keys off this callback's identity, so
  // it has to be stable across the parent's renders.
  const latest = useRef(onElapsed);
  latest.current = onElapsed;
  const handleElapsed = useCallback((seconds) => {
    if (typeof latest.current === 'function') latest.current(seconds);
  }, []);
  // The hook drives the SHARED ClockContext engine. It is given the
  // run's values, so an edited lead-in starts the edited clock.
  const ec = useExerciseClock({ spec: runSpec || spec, clock, onElapsed: handleElapsed });

  // Lead-in finished. A tabata hands off to the full TabataTimer
  // overlay — the very component the clocks tab shows, already mounted
  // globally in App.jsx (GlobalTabata) and driven by the one-shot
  // pendingTabataCfg bus, whose `source: 'workout_exercise'` flag stops
  // TabataTimer persisting these values over the trainee's own saved
  // clock settings. Everything else runs on ClockContext, where
  // useExerciseClock already owns the swap prompt and the write-back.
  const startNow = useCallback((values) => {
    setLeadIn(false);
    const v = values || spec;
    setRunSpec(v);
    if (v?.kind === 'tabata' && setPendingTabataCfg && setShowTabata) {
      setPendingTabataCfg({
        work: v.workSeconds,
        rest: v.restSeconds,
        rounds: v.rounds,
        sets: v.sets || 1,
        rb: v.restBetweenSets || 0,
        // The lead-in has already counted the trainee in.
        prep: 0,
        source: 'workout_exercise',
      });
      setShowTabata(true);
      return;
    }
    // Deferred a tick so the hook sees the new spec before it starts.
    setTimeout(() => ec.launch(), 0);
  }, [spec, ec, setPendingTabataCfg, setShowTabata]);

  if (!spec) return null;

  const effective = runSpec || spec;
  const open = () => { setRunSpec(spec); setLeadIn(true); };

  return (
    <>
      {render ? render(open) : (
        <button
          type="button"
          disabled={disabled}
          onClick={(e) => { e.stopPropagation(); open(); }}
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
          {/* Minutes first, then seconds, left to right — in an RTL page. */}
          <span style={LTR_TIME}>{clockLabel(spec)}</span>
        </button>
      )}

      <ClockLeadIn
        open={leadIn}
        exerciseName={exerciseName}
        spec={effective}
        onCancel={() => { setLeadIn(false); setRunSpec(null); }}
        onConfirm={startNow}
      />

      {/* The existing running-clock swap prompt, untouched. */}
      <ClockSwapPrompt open={ec.swapOpen} onConfirm={ec.confirmSwap} onCancel={ec.cancelSwap} />

      {ec.owned && typeof document !== 'undefined' && createPortal(
        <div style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 12000,
          background: CREAM, borderTop: `1px solid ${CARD_BORDER}`,
          boxShadow: '0 -8px 22px rgba(0,0,0,0.16)',
          padding: '10px 12px calc(4px + env(safe-area-inset-bottom, 0px))',
        }}>
          <InlineExerciseClock
            spec={effective}
            clock={clock}
            setNumber={setNumber}
            totalSets={totalSets}
            onStop={() => { ec.stopNow(); setRunSpec(null); }}
            onTogglePause={ec.togglePause}
          />
        </div>,
        document.body,
      )}
    </>
  );
}

/**
 * TABATA SETS — the block design.
 *
 * A SET is a GROUP of exercises performed together for N rounds of
 * work/rest. Each set renders as its own block: an orange set tag, the
 * set's movement names on the tinted band, then a bar carrying play
 * plus rounds / work / rest as number-over-label. Between two sets, a
 * dashed rest row.
 *
 * readTabataSets() normalises the new sets[] payload AND every legacy
 * flat one into the same shape, so a row written years ago renders here
 * as a single set without being modified.
 */
function TabataSets({ exercise, exerciseName, model, disabled }) {
  const { sets, restBetweenSets } = model;
  if (!sets.length) return null;
  return (
    <div>
      {sets.map((set, i) => {
        const spec = {
          kind: 'tabata',
          label: 'טבטה',
          workSeconds: set.work,
          restSeconds: set.rest,
          rounds: set.rounds,
          sets: 1,
          restBetweenSets: 0,
          hasDuration: true,
        };
        return (
          <React.Fragment key={`set${i}`}>
            {i > 0 && restBetweenSets > 0 && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 6, padding: '6px 9px',
                borderTop: `1px dashed ${BAND_LINE}`,
                borderBottom: `1px dashed ${BAND_LINE}`,
                background: WHITE,
              }}>
                <span style={{ fontSize: 11, fontWeight: 400, color: MUTED }}>מנוחה</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: CHARCOAL, ...LTR_TIME }}>
                  {formatDuration(restBetweenSets)}
                </span>
              </div>
            )}

            {/* The set's movements, on the tinted band. */}
            <div style={{
              background: BAND_BG, borderBottom: `0.5px solid ${BAND_LINE}`,
              padding: '7px 9px',
              display: 'flex', alignItems: 'flex-start', gap: 7,
            }}>
              <span style={{
                flexShrink: 0, background: ORANGE, color: WHITE,
                fontSize: 10, fontWeight: 500, borderRadius: 4,
                padding: '2px 7px', lineHeight: 1.5, whiteSpace: 'nowrap',
              }}>{`סט ${i + 1}`}</span>
              <span style={{
                fontSize: 13, fontWeight: 500, color: CHARCOAL,
                lineHeight: 1.45, minWidth: 0, overflowWrap: 'anywhere',
              }}>{set.exercises.join(' · ')}</span>
            </div>

            {/* The bar: play, then the numbers over their labels. */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '7px 9px',
              borderBottom: i === sets.length - 1 ? 'none' : `0.5px solid ${DIVIDER}`,
              background: WHITE,
            }}>
              <ClockShortcut
                spec={spec}
                exerciseName={`${exerciseName} · סט ${i + 1}`}
                setNumber={i + 1}
                totalSets={sets.length}
                disabled={disabled}
                render={(open) => (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); open(); }}
                    onPointerDown={(e) => e.stopPropagation()}
                    aria-label={`הפעל סט ${i + 1}`}
                    style={{
                      flexShrink: 0, width: 34, height: 34, minHeight: 34,
                      borderRadius: '50%', border: 'none', background: ORANGE,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: disabled ? 'default' : 'pointer', padding: 0,
                    }}
                  >
                    <Play size={15} fill={WHITE} color={WHITE} />
                  </button>
                )}
              />
              <ParamBlock value={String(set.rounds)} label="סבבים" size={17} />
              <ParamBlock value={formatDuration(set.work)} label="עבודה" size={17} />
              {set.rest > 0 && (
                <ParamBlock value={formatDuration(set.rest)} label="מנוחה" size={17} />
              )}
              <div style={{ flexGrow: 1 }} />
            </div>
          </React.Fragment>
        );
      })}
    </div>
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
  // What is actually IN the database for each key. A box whose value
  // differs from this is dirty and shows its save control; a box that
  // matches wears the target-feedback border. Kept separate from
  // `values` so "typed" and "saved" are never confused.
  const [saved, setSaved] = useState({});
  // Live mirrors, for handlers that must read the current maps without
  // depending on them (the clock write-back, the row save control).
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const savedRef = useRef(saved);
  savedRef.current = saved;
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
  // The row a tap opened, or null. Carries everything the enlarged
  // view needs, including its own save function.
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
          // FIRST sub of a container. Both keys are written for it,
          // because only one of them is ever read back: a container
          // renders no top-level boxes and a plain exercise renders no
          // sub rows.
          const drill = l.drill_index ?? 0;
          if (drill === 0) next[`${l.exercise_id}:${l.set_number}`] = String(v);
          next[`${l.exercise_id}:sub${drill}:${l.set_number}`] = String(v);
          continue;
        }
        // A tick row carries no measurement. Same ambiguity, same
        // both-keys answer.
        nextChecks[l.exercise_id] = true;
        nextChecks[`${l.exercise_id}:sub${l.drill_index ?? 0}`] = true;
      }
      // Everything read back IS what the database holds, so it starts
      // life saved — the boxes open wearing their target feedback and
      // no save control.
      setValues(next); setSaved(next); setChecks(nextChecks);
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

  /**
   * The ONE write. Every box on the sheet and every box in the dialog
   * goes through here, and it is the same saveSetActual call the
   * screen has always made — drill_index 0 for a plain row, the sub's
   * index for a sub row. On success the key is marked saved, which is
   * what retires its save control and paints its target feedback.
   */
  const commitKey = useCallback(async (key, exerciseId, drillIdx, setNo, raw, payloadField) => {
    if (locked) return false;
    const id = await ensureExecution();
    if (!id) { toast.error('לא ניתן לשמור כרגע'); return false; }
    const n = raw === '' ? null : Number(raw);
    const { error } = await saveSetActual(
      supabase, id, exerciseId, drillIdx, setNo,
      { [payloadField]: n },
      { allowEmpty: raw === '' },
    );
    if (error) {
      console.error('[PlanSheet] save failed:', error);
      toast.error('השמירה נכשלה');
      return false;
    }
    setSaved((p) => ({ ...p, [key]: raw }));
    return true;
  }, [ensureExecution, locked]);

  /** Save every box of one row that differs from what is stored. */
  const saveRow = useCallback(async (entries) => {
    const v = valuesRef.current; const s = savedRef.current;
    const dirty = entries.filter((e) => has(v[e.key]) && v[e.key] !== s[e.key]);
    if (!dirty.length) return;
    let ok = 0;
    for (const e of dirty) {
      // Sequential on purpose: saveSetActual upserts on
      // (execution_id, exercise_id, drill_index, set_number) and the
      // first write is what creates the execution row.
      const done = await commitKey(e.key, e.exerciseId, e.drillIdx, e.setNo, v[e.key], e.payloadField);
      if (done) ok += 1;
    }
    if (ok) toast.success(ok > 1 ? `${ok} ערכים נשמרו` : 'נשמר');
  }, [commitKey]);

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

  // A sub row's tick writes exactly where a sub's numbers write — same
  // exercise_id, drill_index = the sub's index — only with every
  // measurement column null. No collision with the parent's own
  // drill_index 0 row: a container never renders a top-level tick.
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
   * path. It lands in the first empty box, or in box 1 when every box
   * is already filled. Only a countdown ever gets here: an interval or
   * tabata container is a clock, not a measurement.
   */
  const writeClockSeconds = useCallback((exerciseId, boxCount, payloadField, seconds) => {
    if (locked) return;
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    const current = valuesRef.current;
    let slot = 1;
    for (let i = 1; i <= Math.max(1, boxCount); i += 1) {
      if (!has(current[`${exerciseId}:${i}`])) { slot = i; break; }
    }
    const key = `${exerciseId}:${slot}`;
    setValues((pv) => ({ ...pv, [key]: String(seconds) }));
    commitKey(key, exerciseId, 0, slot, String(seconds), payloadField);
  }, [commitKey, locked]);

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

  // ── ROW — ONE flat flex line, plus a hint line when there is one.
  //    right to left: tick, ordinal, name, pill, param block,
  //    a 16px spacer, the entry group.
  //
  // The row is FLAT. The text used to sit in a nested flex box, which
  // hid the name's own flex-basis from the row's layout and made the
  // name the first thing squeezed.
  const rowLine = {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '8px 9px 7px',
  };
  const ordinalStyle = { fontSize: 13, color: ORANGE, flexShrink: 0, lineHeight: 1.3 };
  // The ONLY shrinking element on the row. Everything else refuses.
  const nameStyle = (size) => ({
    fontSize: size, fontWeight: 500, color: CHARCOAL, lineHeight: 1.3,
    flexShrink: 1, minWidth: 0,
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  });
  // At LEAST 16px, and it takes any slack so the entry group stays at
  // the left edge of the row.
  const spacerStyle = { flexGrow: 1, flexShrink: 0, flexBasis: 16, minWidth: 16 };
  const starStyle = { fontSize: 11, color: ORANGE, flexShrink: 0, lineHeight: 1.3 };

  /**
   * What the text side can still afford at 360px.
   *
   * The pill and the param block never shrink, so on a row carrying a
   * lot of boxes they have to step aside or the name goes to zero and
   * they get cut in half. Both are in the tap dialog, which is where
   * this sheet puts everything that will not fit on the line.
   */
  const showPill = (boxCount) => boxCount < 5;
  const showParam = (boxCount) => boxCount < 6;

  // 13px on the page, 25px under the finger. The hit area cannot come
  // from padding — padding sits INSIDE the border, so it would draw a
  // 25px square. It comes from a transparent 25px button with the 13px
  // square inside it, and an equal negative margin hands the extra
  // space straight back to the layout.
  const checkHit = {
    flexShrink: 0, width: 25, height: 25, minHeight: 25,
    margin: -6, padding: 0,
    background: 'transparent', border: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'inherit', cursor: locked ? 'default' : 'pointer',
  };
  const checkStyle = (on) => ({
    width: 13, height: 13, borderRadius: 3, boxSizing: 'border-box',
    border: `1px solid ${on ? GREEN : (locked ? '#E2DAD0' : '#C1B4A3')}`,
    background: on ? GREEN : WHITE,
    color: WHITE, fontSize: 9, fontWeight: 900, lineHeight: 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    opacity: locked && !on ? 0.75 : 1,
  });

  const boxStyle = (key, target, w, h = BOX_H) => ({
    flexShrink: 0,
    // minHeight as well as height: index.css puts min-height:44px on
    // every input, and a min-height beats a smaller height.
    width: w, height: h, minHeight: h,
    textAlign: 'center', fontSize: 13, fontWeight: 500, padding: '2px 0',
    border: `1px solid ${boxBorder(saved[key], target)}`,
    borderRadius: 4,
    background: WHITE,
    boxSizing: 'border-box',
    fontFamily: 'inherit', color: CHARCOAL,
    opacity: locked ? 0.75 : 1,
  });

  /** Does this row hold anything typed but not yet stored? */
  const rowIsDirty = (entries) =>
    entries.some((e) => has(values[e.key]) && values[e.key] !== saved[e.key]);

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
          1. The entry group never shrinks and never clips: min-width
             max-content keeps every box at full width, and the row's
             name is the only thing that gives.
          2. Spinner arrows would eat a 24px box.
          3. App.css carries a blanket `* { overflow-x: hidden }`, which
             makes every element its own scrollport. `clip` clips the
             same way and creates none. */
      }
      <style>{`
.ps-entry{flex:0 0 auto;min-width:-webkit-max-content;min-width:max-content;display:flex;justify-content:flex-start;align-items:center;flex-wrap:nowrap}
.ps-page input[type=number],.ps-dlg input[type=number]{-moz-appearance:textfield}
.ps-page input[type=number]::-webkit-outer-spin-button,
.ps-page input[type=number]::-webkit-inner-spin-button,
.ps-dlg input[type=number]::-webkit-outer-spin-button,
.ps-dlg input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
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
              The charcoal wedge holds the real logo. The orange block
              on the right is the way back — on an RTL page "back" sits
              at the start of the reading direction. */}
          <div style={{ position: 'relative', height: 52, background: CREAM }}>
            <div style={{
              position: 'absolute', left: 0, top: 0, width: WEDGE_W, height: 52,
              background: CHARCOAL,
              clipPath: 'polygon(0 0,100% 0,55% 100%,0 100%)',
              pointerEvents: 'none',
            }} />
            {/* The logo, centred on both axes with even padding.
                It is centred in the wedge's SOLID column — the left
                55%, the only part that runs the full 52px — not in the
                wedge's bounding box. The shape tapers from 55% to
                100%, so a mark centred in the box would have its
                bottom-left corner cut off by the diagonal. Its own
                white is used as-is: the loading screen's
                /logoR-black.png would be invisible on charcoal. */}
            <div style={{
              position: 'absolute', left: 0, top: 0,
              width: Math.round(WEDGE_W * 0.55), height: 52,
              padding: 9, boxSizing: 'border-box',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none',
            }}>
              <img
                src="/logoR.png"
                alt="AthletiGo"
                style={{
                  maxWidth: '100%', maxHeight: '100%',
                  objectFit: 'contain', display: 'block',
                }}
              />
            </div>

            <button
              type="button"
              onClick={() => navigate(backTo)}
              aria-label="חזרה"
              style={{
                position: 'absolute', right: 0, top: 0, width: 96, height: 52,
                background: ORANGE, border: 'none', color: CREAM,
                fontSize: 22, lineHeight: 1, cursor: 'pointer',
                fontFamily: 'inherit', padding: 0, minHeight: 52,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >→</button>

            {/* Between the wedge and the orange block. */}
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
              const theme = themeOf(section);
              const cat = (section.category || section.section_name || '').trim();
              const rail = section.coach_notes || '';
              const isNotes = looseName(section.section_name) === 'הערות';
              const isShut = !!collapsed[section.id];
              const toggle = () => setCollapsed((c) => ({ ...c, [section.id]: !c[section.id] }));
              // One hue: the card border, the 4px strip, the label card.
              const cardShell = {
                background: WHITE, border: `1px solid ${theme.hue}`,
                borderRadius: 5, overflow: 'hidden', boxSizing: 'border-box',
              };
              const strip = { height: 4, background: theme.hue, flexShrink: 0 };
              return (
                <div key={section.id} style={{
                  display: 'flex', gap: 5, marginBottom: 8, alignItems: 'stretch',
                }}>
                  {/* Label card — first child is RIGHTMOST in RTL. */}
                  <button
                    type="button"
                    onClick={toggle}
                    aria-expanded={!isShut}
                    style={{
                      ...cardShell, width: RAIL_W, flexShrink: 0,
                      background: theme.bg, color: theme.fg,
                      padding: 0, minHeight: 0,
                      display: 'flex', flexDirection: 'column',
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    <div style={strip} />
                    <div style={{
                      flex: 1, minHeight: 0,
                      padding: '6px 3px 7px',
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', gap: 3,
                    }}>
                      <span style={{
                        fontSize: 11, lineHeight: 1.25, fontWeight: 500,
                        overflowWrap: 'anywhere', maxWidth: '100%',
                      }}>{section.section_name || cat}</span>
                      <span style={{ fontSize: 9, lineHeight: 1, opacity: 0.7 }}>
                        {isShut ? '◂' : '▾'}
                      </span>
                      {isShut ? (
                        <span style={{ fontSize: 9, lineHeight: 1.2, whiteSpace: 'nowrap', opacity: 0.85 }}>
                          {rows.length}
                        </span>
                      ) : rail ? (
                        <span style={{
                          fontSize: 9, lineHeight: 1.3, opacity: 0.85,
                          overflowWrap: 'anywhere',
                        }}>{rail}</span>
                      ) : null}
                    </div>
                  </button>

                  {/* Content card — fills the rest. */}
                  {isShut ? null : (
                    <div style={{ ...cardShell, flex: 1, minWidth: 0 }}>
                      <div style={strip} />
                      {rows.map((ex, i) => {
                        const last = i === rows.length - 1;
                        const rowEdge = last ? 'none' : `1px solid ${DIVIDER}`;

                        // ── A הערות row is a line of prose. Before the
                        //    ordinal is spent, so the numbering of real
                        //    exercises is not pushed along by a note.
                        if (isNotes) {
                          return (
                            <div key={ex.id} style={{
                              display: 'flex', gap: 6, alignItems: 'baseline',
                              padding: '8px 9px', borderBottom: rowEdge,
                            }}>
                              <span style={starStyle}>✳</span>
                              <span style={{
                                fontSize: 12, fontWeight: 400, color: CHARCOAL,
                                lineHeight: 1.5, minWidth: 0, overflowWrap: 'anywhere',
                              }}>{ex.exercise_name || ex.name || ''}</span>
                            </div>
                          );
                        }

                        const container = isContainer(ex, parseTabataData);
                        const td = container ? parseTabataData(ex.tabata_data) : null;
                        const { list: subs, kind: subKindOf } = container
                          ? subsOf(ex, td) : { list: [], kind: 'exercises' };
                        const m = measurementKind(ex, null, section);
                        const pill = pillOf(ex.mode);
                        const spec = shortcutOf(ex);
                        const clockOnly = isClockOnly(spec);
                        const isClock = isTabataContainer(ex);
                        // Normalised sets — new sets[] shape or any
                        // legacy payload, read the same way.
                        const tabataModel = isClock ? readTabataSets(ex) : { sets: [], restBetweenSets: 0 };
                        const hasTarget = m.kind !== 'check' && m.target > 0;
                        const rowKind = container
                          ? 'container'
                          : (clockOnly ? 'clock' : (hasTarget ? m.kind : 'check'));
                        const boxCount = (rowKind === 'check' || rowKind === 'container' || rowKind === 'clock')
                          ? 0
                          : (rowKind === 'tally' ? 1 : m.sets);
                        ordinal += 1;
                        const myOrdinal = ordinal;
                        const rounds = roundsOf(ex, td);
                        const boxesPerSub = subKindOf === 'sets' ? 1 : rounds;
                        const exName = ex.exercise_name || ex.name || '';
                        const param = container
                          ? (rounds > 1 && !spec ? { value: String(rounds), label: 'סבבים', size: 19 } : null)
                          : paramOf(ex, m, rowKind);
                        // A check-only row has no boxes to count its
                        // sets, so the sets go where instructions live.
                        const setsNote = (rowKind === 'check' && Number(ex.sets) > 1)
                          ? `${ex.sets} סטים` : '';
                        const hint = [noteOf(ex), setsNote].filter(Boolean).join(' · ');

                        // ── A CONTAINER ──────────────────────────────
                        if (container) {
                          // Superset, combo and dropset put their title
                          // on a tinted band; the tabata clock keeps the
                          // plain treatment.
                          const banded = !isClock;
                          return (
                            <div key={ex.id} style={{ borderBottom: rowEdge }}>
                              <div
                                onClick={() => openDetail({
                                  ordinal: myOrdinal, name: exName, pill, param, hint,
                                  entries: [], target: null,
                                })}
                                style={{
                                  background: banded ? BAND_BG : WHITE,
                                  borderBottom: banded
                                    ? `0.5px solid ${BAND_LINE}`
                                    : `0.5px solid ${DIVIDER}`,
                                  cursor: 'pointer',
                                }}
                              >
                                <div style={rowLine}>
                                  <span style={ordinalStyle}>{myOrdinal}.</span>
                                  <span style={nameStyle(16)} title={exName}>{exName}</span>
                                  <MethodPill pill={pill} />
                                  <ParamBlock {...(param || {})} />
                                  <div style={spacerStyle} />
                                  {spec && !isClock && (
                                    <div
                                      className="ps-entry"
                                      style={{ gap: 4 }}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {/* An interval container is a clock,
                                          not a measurement: the button
                                          only, nothing written back. A
                                          TABATA carries its play buttons
                                          per set, in the block below. */}
                                      <ClockShortcut
                                        spec={spec}
                                        exerciseName={exName}
                                        setNumber={1}
                                        totalSets={rounds}
                                        disabled={false}
                                      />
                                    </div>
                                  )}
                                </div>
                                <HintLine text={hint} indent={22} />
                              </div>

                              {/* A tabata renders as SET BLOCKS, each with
                                  its own play. Legacy flat payloads come
                                  through readTabataSets as one set. */}
                              {isClock && tabataModel.sets.length > 0 && (
                                <TabataSets
                                  exercise={ex}
                                  exerciseName={exName}
                                  model={tabataModel}
                                  disabled={locked}
                                />
                              )}

                              {(isClock && tabataModel.sets.length > 0 ? [] : subs).map((sub, sidx) => {
                                const sm = subMeasurementKind(sub, section);
                                const subHasTarget = sm.kind !== 'check' && sm.target > 0;
                                // Inside a clock the numbers are the
                                // programme, shown but never editable.
                                const subEditable = subHasTarget && !isClock;
                                const subParam = subParamOf(sub, sm, 16);
                                const lastSub = sidx === subs.length - 1;
                                const sbp = boxPlan(subEditable ? boxesPerSub : 0);
                                const subText = subLabel(sub, subKindOf, sidx);
                                const subKey = `${ex.id}:sub${sidx}`;
                                const subHint = noteOf(sub);
                                const subEntries = subEditable
                                  ? Array.from({ length: boxesPerSub }).map((_, ri) => ({
                                    key: `${subKey}:${ri + 1}`,
                                    exerciseId: ex.id, drillIdx: sidx, setNo: ri + 1,
                                    payloadField: sm.payloadField,
                                    setLabel: `סט ${ri + 1}`,
                                  }))
                                  : [];
                                const showTick = !subEditable && !isClock;
                                return (
                                  <div
                                    key={subKey}
                                    onClick={() => openDetail({
                                      ordinal: null, name: subText, pill: null,
                                      param: subParam, hint: subHint,
                                      entries: subEntries, target: sm.target,
                                    })}
                                    style={{
                                      background: WHITE, cursor: 'pointer',
                                      borderBottom: lastSub ? 'none' : `0.5px solid ${DIVIDER}`,
                                    }}
                                  >
                                    <div style={rowLine}>
                                      {showTick && (
                                        <button
                                          type="button"
                                          onClick={(e) => { e.stopPropagation(); toggleSubCheck(ex.id, sidx); }}
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
                                      <span style={starStyle}>✳</span>
                                      <span style={nameStyle(14)} title={subText}>{subText}</span>
                                      {showParam(subEntries.length) && <ParamBlock {...(subParam || {})} />}
                                      <div style={spacerStyle} />
                                      {subEditable && (
                                        <div
                                          className="ps-entry"
                                          style={{ gap: sbp.gap }}
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          {subEntries.map((en) => (
                                            <input
                                              key={en.key}
                                              type="number"
                                              inputMode="numeric"
                                              disabled={locked}
                                              value={values[en.key] ?? ''}
                                              onChange={(e) => setValues((pv) => ({ ...pv, [en.key]: e.target.value }))}
                                              style={boxStyle(en.key, sm.target, sbp.w)}
                                            />
                                          ))}
                                          {!locked && rowIsDirty(subEntries) && (
                                            <SaveDot onClick={() => saveRow(subEntries)} />
                                          )}
                                        </div>
                                      )}
                                    </div>
                                    <HintLine text={subHint} indent={showTick ? 41 : 22} />
                                  </div>
                                );
                              })}
                            </div>
                          );
                        }

                        // ── A PLAIN EXERCISE ROW ─────────────────────
                        const bp = boxPlan(boxCount);
                        const entries = Array.from({ length: boxCount }).map((_, si) => ({
                          key: `${ex.id}:${si + 1}`,
                          exerciseId: ex.id, drillIdx: 0, setNo: si + 1,
                          payloadField: m.payloadField,
                          setLabel: `סט ${si + 1}`,
                        }));
                        return (
                          <div
                            key={ex.id}
                            onClick={() => openDetail({
                              ordinal: myOrdinal, name: exName, pill, param, hint,
                              entries, target: m.target,
                            })}
                            style={{ borderBottom: rowEdge, cursor: 'pointer' }}
                          >
                            <div style={rowLine}>
                              {rowKind === 'check' && (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); toggleCheck(ex.id); }}
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
                              <span style={ordinalStyle}>{myOrdinal}.</span>
                              <span style={nameStyle(16)} title={exName}>{exName}</span>
                              {showPill(boxCount) && <MethodPill pill={pill} />}
                              {showParam(boxCount) && <ParamBlock {...(param || {})} />}
                              <div style={spacerStyle} />
                              {(boxCount > 0 || spec) && (
                                <div
                                  className="ps-entry"
                                  style={{ gap: bp.gap }}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {entries.map((en) => (
                                    <input
                                      key={en.key}
                                      type="number"
                                      inputMode="numeric"
                                      disabled={locked}
                                      value={values[en.key] ?? ''}
                                      onChange={(e) => setValues((pv) => ({ ...pv, [en.key]: e.target.value }))}
                                      style={boxStyle(en.key, m.target, bp.w)}
                                    />
                                  ))}
                                  {!locked && rowIsDirty(entries) && (
                                    <SaveDot onClick={() => saveRow(entries)} />
                                  )}
                                  {spec && (
                                    <ClockShortcut
                                      spec={spec}
                                      exerciseName={exName}
                                      setNumber={1}
                                      totalSets={Math.max(1, boxCount)}
                                      disabled={locked}
                                      onElapsed={
                                        (!clockOnly && boxCount > 0)
                                          ? (seconds) => writeClockSeconds(ex.id, boxCount, m.payloadField, seconds)
                                          : undefined
                                      }
                                    />
                                  )}
                                </div>
                              )}
                            </div>
                            <HintLine text={hint} indent={rowKind === 'check' ? 41 : 22} />
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
            <div style={{
              background: WHITE, border: `1px solid ${CARD_BORDER}`,
              borderRadius: 5, overflow: 'hidden', marginTop: 2,
            }}>
              <div style={{ height: 4, background: CARD_BORDER }} />
              <div style={{ padding: '8px 9px 10px' }}>
                <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 7 }}>תחושה</div>
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
                          flex: 1, minWidth: 0, height: 32, minHeight: 32,
                          border: `1px solid ${on ? ORANGE : (locked ? '#E2DAD0' : '#D9D0C4')}`,
                          background: on ? ORANGE : WHITE,
                          color: on ? WHITE : CHARCOAL,
                          fontSize: 13, fontWeight: 500, borderRadius: 4,
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
              available on an open one. */}
          <div style={{ padding: '8px 5px 0' }}>
            <button
              type="button"
              onClick={startNewWorkout}
              disabled={duplicating}
              style={{
                width: '100%', minHeight: TOUCH,
                border: 'none', borderRadius: 5,
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

      {/* ── The tap dialog — the row, enlarged ──────────────────────
          The header repeats the row on the same tinted band a container
          title wears, with the FULL name wrapping instead of
          ellipsising. The body carries the hint and every entry box at
          a size a thumb can hit. One save at the foot, not one per box:
          inside the dialog the trainee is filling a whole exercise. */}
      <Dialog open={!!detail} onOpenChange={(open) => { if (!open) setDetail(null); }}>
        <DialogContent
          className="ps-dlg"
          // The shared DialogContent blocks Escape by default, because
          // forms must close through save. This one is safe to dismiss.
          onEscapeKeyDown={() => {}}
          style={{ maxWidth: 400 }}
        >
          {detail && (
            <div dir="rtl" style={{ fontFamily: SANS }}>
              {/* Full bleed over the shared p-6 padding. */}
              <div style={{
                margin: '-24px -24px 0',
                background: BAND_BG, borderBottom: `1px solid ${BAND_LINE}`,
                padding: '16px 44px 14px 16px',
                display: 'flex', alignItems: 'flex-start', gap: 8,
              }}>
                {detail.ordinal != null && (
                  <span style={{ ...ordinalStyle, fontSize: 14, lineHeight: 1.45 }}>
                    {detail.ordinal}.
                  </span>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 17, fontWeight: 500, color: CHARCOAL, lineHeight: 1.4,
                    // The whole name, wrapping. Nothing truncated here —
                    // this dialog is where the sheet stops abbreviating.
                    whiteSpace: 'normal', overflowWrap: 'anywhere',
                  }}>{detail.name}</div>
                  {detail.pill && (
                    <div style={{ marginTop: 6 }}><MethodPill pill={detail.pill} /></div>
                  )}
                </div>
                {detail.param && (
                  <ParamBlock {...detail.param} size={(detail.param.size || 19) + 3} />
                )}
              </div>

              <div style={{ paddingTop: 14 }}>
                {detail.hint && (
                  <div style={{
                    fontSize: 12, fontWeight: 400, color: MUTED,
                    lineHeight: 1.6, marginBottom: 14, overflowWrap: 'anywhere',
                  }}>{detail.hint}</div>
                )}

                {detail.entries.length > 0 ? (
                  <div style={{
                    display: 'flex', flexWrap: 'wrap', gap: 10,
                    justifyContent: 'flex-start',
                  }}>
                    {detail.entries.map((en) => (
                      <div key={en.key} style={{ textAlign: 'center' }}>
                        <input
                          type="number"
                          inputMode="numeric"
                          disabled={locked}
                          value={values[en.key] ?? ''}
                          onChange={(e) => setValues((pv) => ({ ...pv, [en.key]: e.target.value }))}
                          style={{
                            width: 52, height: 44, minHeight: 44,
                            textAlign: 'center', fontSize: 18, fontWeight: 500,
                            border: `1.5px solid ${boxBorder(saved[en.key], detail.target)}`,
                            borderRadius: 6, background: WHITE,
                            boxSizing: 'border-box', fontFamily: 'inherit',
                            color: CHARCOAL, padding: 0,
                            opacity: locked ? 0.75 : 1,
                          }}
                        />
                        <div style={{
                          fontSize: 10, fontWeight: 400, color: MUTED,
                          marginTop: 4, whiteSpace: 'nowrap',
                        }}>{en.setLabel}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: MUTED }}>
                    אין ערכים להזנה בתרגיל הזה
                  </div>
                )}
              </div>

              <div style={{
                display: 'flex', gap: 8, marginTop: 18,
                paddingTop: 14, borderTop: `1px solid ${DIVIDER}`,
              }}>
                {detail.entries.length > 0 && !locked && (
                  <button
                    type="button"
                    onClick={async () => { await saveRow(detail.entries); setDetail(null); }}
                    style={{
                      flex: 2, minHeight: TOUCH, borderRadius: 8, border: 'none',
                      background: GREEN, color: WHITE,
                      fontSize: 15, fontWeight: 500, fontFamily: 'inherit',
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'center', gap: 7,
                    }}
                  >
                    <Check size={17} strokeWidth={3} color={WHITE} />
                    שמור
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDetail(null)}
                  style={{
                    flex: 1, minHeight: TOUCH, borderRadius: 8,
                    border: `1px solid ${CARD_BORDER}`,
                    background: WHITE, color: MUTED,
                    fontSize: 15, fontWeight: 400, fontFamily: 'inherit',
                    cursor: 'pointer',
                  }}
                >סגור</button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
