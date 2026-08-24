import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp, Check } from 'lucide-react';
import { formatTime } from '@/lib/formatTime';
import { resolveSetCount } from '@/lib/plannedSets';
import { getMethodByMode } from '@/constants/trainingMethods';
import { normalizeSectionType } from '@/lib/sectionTypes';
import { useClock } from '@/contexts/ClockContext';
import {
  resolveTabataClockSettings, resolveTabataRotation, parseTabataData,
  estimateTabataTotalSeconds,
} from '@/lib/tabataSettings';
import ScrollPickerPopup, { REPS_OPTIONS, WEIGHT_OPTIONS } from '@/components/ScrollPickerPopup';
import { TimeEntryPopup } from '@/components/TimeEntry';

// ────────────────────────────────────────────────────────────────
// The trainee's workout sheet.
//
// One open form, read top to bottom, like a printed training program.
// No section is collapsible — a trainee mid-set should never have to
// hunt for the exercise they are standing in front of. The only thing
// that opens and closes is a multi-exercise block (superset, combo,
// circuit, tabata, rest-pause), because those genuinely contain a list.
//
// This is a NEW surface. ExerciseCard is untouched and still serves the
// coach and the legacy paths; nothing here writes to the DB directly —
// every value goes out through the callbacks the parent already owns
// (onSetValue → saveSetActual, onToggleDone), so the persistence work
// done earlier holds for this screen unchanged.
// ────────────────────────────────────────────────────────────────

const C = {
  frame:        '#2D2A26',
  page:         '#FBF3EA',
  card:         '#FFFFFF',
  cardBorder:   '#E8DBCB',
  band:         '#FFE2CD',
  number:       '#C2521A',
  dot:          '#DED5C8',
  note:         '#9B958B',
  ink:          '#2D2A26',
  orange:       '#FF6F20',
  aboveBg:      '#EDF7EF',
  aboveBorder:  '#BFE3C9',
  aboveText:    '#15803D',
  belowBg:      '#FDF2EA',
  belowBorder:  '#F3D9C4',
  belowText:    '#C2521A',
  emptyBg:      '#FBF7F2',
  emptyBorder:  '#DED5C8',
  activeRowBg:  '#FFFAF5',
};

const SANS = "'Rubik', system-ui, sans-serif";

// A section's type is stored in training_sections.category (there is
// no section_type column), and it can hold either a canonical id or one
// of several legacy Hebrew strings — normalizeSectionType resolves both.
// The name is checked as well, because a coach can call a warmup
// section anything they like and the category may be left at "custom".
const CHECK_ONLY_TYPES = new Set(['warmup', 'flexibility']);
const CHECK_ONLY_WORDS = ['חימום', 'מתיח', 'גמיש', 'שחרור'];

// normalizeSectionType only knows the canonical ids and a handful of
// English legacy keys — but UnifiedPlanBuilder defaults new sections to
// the HEBREW string "חימום", which it resolves to "custom". So the raw
// category is matched against the Hebrew words too, here rather than in
// the shared helper: widening normalizeSectionType would change what
// the coach's screens render as well.
function sectionTypeOf(section) {
  const raw = (section?.category || '').trim();
  const normalized = normalizeSectionType(raw);
  if (normalized !== 'custom') return normalized;
  if (raw.includes('כוח')) return 'strength';
  if (CHECK_ONLY_WORDS.some((w) => raw.includes(w))) return 'warmup';
  return normalized;
}

// Warmup / stretching / flexibility: ticked, not measured.
function isCheckOnlySection(section) {
  if (CHECK_ONLY_TYPES.has(sectionTypeOf(section))) return true;
  const name = section?.section_name || '';
  return CHECK_ONLY_WORDS.some((w) => name.includes(w));
}

// Multi-exercise methods take ONE row in the running numbering and
// carry a single fill box that counts rounds (or sets).
const MULTI_VARIANTS = new Set(['super_set', 'combo', 'circuit', 'tabata', 'rest_pause']);

function variantOf(exercise) {
  const method = getMethodByMode(exercise?.mode);
  if (!method || method.mode !== exercise?.mode) return 'single';
  return method.english_id;
}

// The inner exercises of a multi-exercise block, whichever shape the
// editor happened to write them in.
function innerExercisesOf(exercise) {
  const td = parseTabataData(exercise?.tabata_data) || {};
  if (Array.isArray(td.exercises_in_rotation) && td.exercises_in_rotation.length) return td.exercises_in_rotation;
  if (Array.isArray(td.sub_exercises) && td.sub_exercises.length) return td.sub_exercises;
  if (Array.isArray(td.stations) && td.stations.length) return td.stations;
  if (Array.isArray(td.rounds) && td.rounds.length) {
    const flat = [];
    for (const r of td.rounds) for (const e of (r?.exercises || [])) flat.push(e);
    if (flat.length) return flat;
  }
  if (Array.isArray(td.planned_sets) && td.planned_sets.length) return td.planned_sets;
  return [];
}

const has = (v) => v != null && v !== '';

// The one number this exercise is measured by. reps first, then time,
// then weight — the order a trainee would read them off a page.
function primaryMetric(exercise) {
  if (has(exercise?.reps)) {
    return { key: 'reps', mode: 'reps', target: Number(exercise.reps) || 0, logField: 'reps_completed', isTime: false };
  }
  const secs = exercise?.static_hold_time ?? exercise?.work_time;
  if (has(secs)) {
    return { key: 'time', mode: 'seconds', target: Number(secs) || 0, logField: 'time_completed', isTime: true };
  }
  if (has(exercise?.weight)) {
    return { key: 'weight', mode: 'kg', target: Number(exercise.weight) || 0, logField: 'weight_used', isTime: false };
  }
  return null;
}

// The bold parameter run that follows the exercise name.
function paramBits(exercise) {
  const bits = [];
  const sets = resolveSetCount(exercise);
  if (sets > 1) bits.push(`${sets} סטים`);
  if (has(exercise?.reps)) bits.push(`${exercise.reps} חזרות`);
  const hold = exercise?.static_hold_time ?? exercise?.work_time;
  if (has(hold)) bits.push(formatTime(hold));
  if (has(exercise?.weight)) bits.push(`${exercise.weight} ק"ג`);
  if (has(exercise?.rest_time)) bits.push(`מנוחה ${formatTime(exercise.rest_time)}`);
  if (has(exercise?.tempo)) bits.push(`טמפו ${exercise.tempo}`);
  if (has(exercise?.rpe)) bits.push(`RPE ${exercise.rpe}`);
  return bits;
}

function formatFor(metric, n) {
  if (n == null || n === '') return '';
  return metric?.isTime ? (formatTime(n) || String(n)) : String(n);
}

// ── One fill box ────────────────────────────────────────────────
function FillBox({ value, target, active, readOnly, metric, onTap, wide = false }) {
  const filled = has(value);
  const num = filled ? Number(value) : null;

  let style;
  if (active && !filled) {
    style = { background: '#FFFFFF', border: `2px solid ${C.orange}`, color: C.orange };
  } else if (!filled) {
    style = { background: C.emptyBg, border: `1px dashed ${C.emptyBorder}`, color: C.note };
  } else if (target > 0 && num >= target) {
    style = { background: C.aboveBg, border: `1px solid ${C.aboveBorder}`, color: C.aboveText };
  } else {
    style = { background: C.belowBg, border: `1px solid ${C.belowBorder}`, color: C.belowText };
  }

  return (
    <button
      type="button"
      disabled={readOnly}
      onClick={(e) => { e.stopPropagation(); if (!readOnly) onTap(); }}
      style={{
        flex: wide ? 1 : '0 0 38px',
        minWidth: 0,
        height: 34,
        borderRadius: 8,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: SANS, fontSize: 13, fontWeight: 700,
        padding: 0,
        cursor: readOnly ? 'default' : 'pointer',
        ...style,
      }}
    >
      {filled ? formatFor(metric, value) : '–'}
    </button>
  );
}

// ── All-sets panel (used when a row has more than four sets) ─────
function AllSetsPanel({ open, title, sets, metric, onPick, onClose }) {
  if (!open) return null;
  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 6000,
      }}
    >
      <div dir="rtl" style={{
        background: C.page, width: '100%', maxWidth: 520,
        borderTopLeftRadius: 20, borderTopRightRadius: 20,
        padding: '16px 16px calc(env(safe-area-inset-bottom, 0px) + 18px)',
        maxHeight: '75vh', overflowY: 'auto',
      }}>
        <div style={{
          fontFamily: SANS, fontSize: 15, fontWeight: 800, color: C.ink,
          textAlign: 'center', marginBottom: 12,
        }}>{title}</div>

        {sets.map((s) => (
          <button
            key={s.index}
            type="button"
            onClick={() => onPick(s.index)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', marginBottom: 8,
              background: C.card, border: `1px solid ${C.cardBorder}`,
              borderRadius: 10, cursor: 'pointer', fontFamily: SANS,
              textAlign: 'right',
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 800, color: C.number, minWidth: 44 }}>
              סט {s.index + 1}
            </span>
            <span style={{ flex: 1, fontSize: 13, color: C.note }}>
              יעד {formatFor(metric, s.target) || '—'}
            </span>
            <span style={{
              fontSize: 14, fontWeight: 800,
              color: has(s.value) ? C.ink : C.note,
            }}>
              {has(s.value) ? formatFor(metric, s.value) : 'הזן'}
            </span>
          </button>
        ))}

        <button
          type="button"
          onClick={onClose}
          style={{
            width: '100%', height: 44, borderRadius: 10, marginTop: 4,
            border: `1px solid ${C.cardBorder}`, background: C.card,
            fontFamily: SANS, fontSize: 14, fontWeight: 700, color: C.note,
            cursor: 'pointer',
          }}
        >סגור</button>
      </div>
    </div>
  );
}

// ── Tabata control strip (shown when a tabata row is opened) ─────
function TabataPanel({ exercise, rotationCount }) {
  const navigate = useNavigate();
  const clock = useClock();
  const saved = useMemo(() => resolveTabataClockSettings(exercise), [exercise]);

  // A trainee tweak applies to THIS launch only. The coach's plan row
  // is never rewritten from here.
  const [override, setOverride] = useState(null);
  const [editing, setEditing] = useState(false);
  const settings = override || saved;

  const total = estimateTabataTotalSeconds(settings);

  const cells = [
    { label: 'תרגילים', value: String(rotationCount) },
    { label: 'עבודה',   value: formatTime(settings.work_seconds) },
    { label: 'מנוחה',   value: formatTime(settings.rest_seconds) },
    { label: 'סטים',    value: String(settings.sets) },
    { label: 'בין סטים', value: formatTime(settings.rest_between_sets) },
  ];

  const launch = () => {
    if (!clock?.startTabata) {
      console.error('[WorkoutSheet] startTabata unavailable — missing ClockProvider?');
      return;
    }
    clock.startTabata({
      work_seconds: settings.work_seconds,
      rest_seconds: settings.rest_seconds,
      rounds: settings.rounds,
      sets: settings.sets,
      rest_between_sets: settings.rest_between_sets,
      exercises_in_rotation: resolveTabataRotation(exercise),
    });
    navigate('/clocks');
  };

  const editField = (key, label, isTime) => (
    <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontFamily: SANS }}>
      <span style={{ color: C.note, minWidth: 62 }}>{label}</span>
      <input
        type="number"
        min="0"
        value={settings[key] ?? ''}
        onChange={(e) => {
          const n = e.target.value === '' ? 0 : Number(e.target.value);
          setOverride({ ...settings, [key]: n });
        }}
        style={{
          width: 64, height: 30, textAlign: 'center', borderRadius: 6,
          border: `1px solid ${C.cardBorder}`, background: '#FFFFFF',
          fontFamily: SANS, fontSize: 14, fontWeight: 700, color: C.ink,
        }}
      />
      <span style={{ color: C.note, fontSize: 11 }}>{isTime ? 'שנ׳' : ''}</span>
    </label>
  );

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {cells.map((c) => (
          <div key={c.label} style={{
            flex: 1, minWidth: 0, background: C.emptyBg,
            border: `1px solid ${C.cardBorder}`, borderRadius: 8,
            padding: '6px 2px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 9.5, color: C.note, fontFamily: SANS, fontWeight: 700 }}>{c.label}</div>
            <div style={{ fontSize: 14, color: C.ink, fontFamily: SANS, fontWeight: 800, lineHeight: 1.2 }}>{c.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
        <button
          type="button"
          onClick={launch}
          style={{
            flex: 1, height: 40, borderRadius: 10, border: 'none',
            background: C.orange, color: '#FFFFFF',
            fontFamily: SANS, fontSize: 14, fontWeight: 800, cursor: 'pointer',
          }}
        >הפעל שעון</button>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          style={{
            width: 64, height: 40, borderRadius: 10,
            border: `1px solid ${C.cardBorder}`, background: '#FFFFFF',
            fontFamily: SANS, fontSize: 12, fontWeight: 700, color: C.note,
            cursor: 'pointer',
          }}
        >שינוי</button>
      </div>

      {editing && (
        <div style={{
          marginTop: 8, padding: 10, borderRadius: 10,
          background: '#FFFFFF', border: `1px solid ${C.cardBorder}`,
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          {editField('work_seconds', 'עבודה', true)}
          {editField('rest_seconds', 'מנוחה', true)}
          {editField('rounds', 'סבבים', false)}
          {editField('sets', 'סטים', false)}
          {editField('rest_between_sets', 'בין סטים', true)}
          <div style={{ fontSize: 10.5, color: C.note, fontFamily: SANS }}>
            השינוי חל על ההפעלה הזאת בלבד ואינו משנה את התוכנית.
          </div>
        </div>
      )}

      {total != null && (
        <div style={{
          marginTop: 6, fontFamily: SANS, fontSize: 11.5, color: C.note, textAlign: 'center',
        }}>
          משך כולל משוער: {formatTime(total)}
        </div>
      )}
    </div>
  );
}

// ── One exercise row ────────────────────────────────────────────
function ExerciseRow({
  exercise, runningIndex, checkOnly, readOnly, markedComplete,
  logs, isActive, onOpenEntry, onToggleDone, expanded, onToggleExpanded,
}) {
  const variant = variantOf(exercise);
  const isMulti = MULTI_VARIANTS.has(variant);
  const inner = isMulti ? innerExercisesOf(exercise) : [];
  const metric = primaryMetric(exercise);
  const setCount = resolveSetCount(exercise);

  // A multi-exercise block gets ONE box that counts its rounds/sets.
  const boxCount = isMulti ? 1 : setCount;
  const doneCount = (() => {
    let n = 0;
    for (let i = 0; i < setCount; i++) if (logs?.[i]?.done) n++;
    return n;
  })();
  // markedComplete comes from exercise_executions for THIS run. It
  // matters for the ticked-only sections: those write no set-log row
  // (there is no measurement to store), so after a reload the tick can
  // only be recovered from the completion table.
  const completed = markedComplete || (setCount > 0 && doneCount >= setCount);

  const valueAt = (i) => (metric ? logs?.[i]?.[metric.logField] : null);

  const nameSize = isActive ? 15 : 14;

  const bits = paramBits(exercise);
  // exercises.notes is the coach's דגשים for this row. (There is no
  // coach_notes column on exercises — only on plans and sections.)
  const notes = exercise?.notes || '';

  return (
    <div style={{
      borderTop: `1px solid ${C.cardBorder}`,
      background: isActive ? C.activeRowBg : 'transparent',
      borderRight: isActive ? `3px solid ${C.orange}` : '3px solid transparent',
      opacity: completed ? 0.65 : 1,
      padding: '9px 10px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>

        {/* RIGHT column — number, name, params, notes */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 6 }}>
            <span style={{
              fontFamily: SANS, fontSize: nameSize, fontWeight: 800, color: C.number,
            }}>{runningIndex}.</span>
            <span style={{
              fontFamily: SANS, fontSize: nameSize, fontWeight: isActive ? 700 : 600,
              color: C.ink, wordBreak: 'break-word',
            }}>{exercise?.exercise_name || 'תרגיל'}</span>

            {bits.map((b, i) => (
              <React.Fragment key={`${b}-${i}`}>
                <span style={{ color: C.dot, fontSize: nameSize }}>·</span>
                <span style={{
                  fontFamily: SANS, fontSize: nameSize - 1, fontWeight: 700, color: C.ink,
                }}>{b}</span>
              </React.Fragment>
            ))}

            {isMulti && inner.length > 0 && (
              <>
                <span style={{ color: C.dot, fontSize: nameSize }}>·</span>
                <span style={{ fontFamily: SANS, fontSize: nameSize - 1, fontWeight: 700, color: C.number }}>
                  {inner.length} תרגילים
                </span>
              </>
            )}
          </div>

          {notes && (
            <div style={{
              fontFamily: SANS, fontSize: 11.5, color: C.note,
              marginTop: 2, lineHeight: 1.45, wordBreak: 'break-word',
            }}>{notes}</div>
          )}
        </div>

        {checkOnly ? (
          // Warmup / stretching / flexibility: ticked, not measured.
          <button
            type="button"
            disabled={readOnly}
            onClick={() => onToggleDone(exercise, 0, !completed)}
            aria-label={completed ? 'בוצע' : 'סמן כבוצע'}
            style={{
              flexShrink: 0, width: 30, height: 30, borderRadius: 8,
              border: completed ? 'none' : `1.5px solid ${C.emptyBorder}`,
              background: completed ? C.aboveBg : C.emptyBg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: readOnly ? 'default' : 'pointer', padding: 0,
            }}
          >
            {completed && <Check size={17} color={C.aboveText} strokeWidth={3} />}
          </button>
        ) : (
          <>
            {/* MIDDLE column — the numeric target */}
            <div style={{
              flex: '0 0 48px', width: 48, textAlign: 'center',
              fontFamily: SANS, fontSize: 13, fontWeight: 700, color: C.note,
              paddingTop: 6,
            }}>
              {metric && metric.target > 0 ? formatFor(metric, metric.target) : '—'}
            </div>

            {/* LEFT column — the fill boxes */}
            <div style={{ flex: '0 0 172px', width: 172, paddingTop: 2 }}>
              {boxCount > 4 ? (
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => onOpenEntry({ exercise, metric, mode: 'panel' })}
                  style={{
                    width: '100%', height: 34, borderRadius: 8,
                    border: `1px solid ${C.cardBorder}`, background: C.card,
                    fontFamily: SANS, fontSize: 12.5, fontWeight: 700, color: C.ink,
                    cursor: readOnly ? 'default' : 'pointer',
                  }}
                >
                  {doneCount} / {setCount} סטים
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 5 }}>
                  {Array.from({ length: boxCount }, (_, i) => (
                    <FillBox
                      key={i}
                      value={valueAt(i)}
                      target={metric?.target ?? 0}
                      metric={metric}
                      active={!completed && i === doneCount}
                      readOnly={readOnly || !metric}
                      wide={boxCount <= 2}
                      onTap={() => onOpenEntry({ exercise, metric, setIdx: i, mode: 'single' })}
                    />
                  ))}
                </div>
              )}
            </div>

            {isMulti && (
              <button
                type="button"
                onClick={() => onToggleExpanded(exercise.id)}
                aria-label={expanded ? 'סגור' : 'פתח'}
                style={{
                  flexShrink: 0, width: 28, height: 28, borderRadius: 8, marginTop: 3,
                  border: `1px solid ${C.cardBorder}`, background: C.card,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', padding: 0,
                }}
              >
                {expanded ? <ChevronUp size={15} color={C.note} /> : <ChevronDown size={15} color={C.note} />}
              </button>
            )}
          </>
        )}
      </div>

      {/* Opened multi-exercise block — inner list, renumbered from 1 */}
      {isMulti && expanded && (
        <div style={{
          marginTop: 8, marginRight: 18,
          borderRight: `2px solid ${C.band}`, paddingRight: 10,
        }}>
          {inner.map((sub, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'baseline', gap: 6, padding: '3px 0',
            }}>
              <span style={{ fontFamily: SANS, fontSize: 12, fontWeight: 800, color: C.number }}>{i + 1}.</span>
              <span style={{ fontFamily: SANS, fontSize: 12.5, color: C.ink }}>
                {sub?.name || sub?.exercise_name || sub?.variation_name || 'תרגיל'}
              </span>
              {has(sub?.reps) && (
                <>
                  <span style={{ color: C.dot }}>·</span>
                  <span style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, color: C.ink }}>{sub.reps} חזרות</span>
                </>
              )}
              {has(sub?.hold_seconds) && (
                <>
                  <span style={{ color: C.dot }}>·</span>
                  <span style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, color: C.ink }}>{formatTime(sub.hold_seconds)}</span>
                </>
              )}
            </div>
          ))}

          {variant === 'tabata' && (
            <TabataPanel exercise={exercise} rotationCount={inner.length} />
          )}
        </div>
      )}
    </div>
  );
}

// ── The sheet ───────────────────────────────────────────────────
export default function WorkoutSheet({
  planName = 'תוכנית אימונים',
  sections = [],
  exercises = [],
  setLogs = {},
  execCompletion = {},
  readOnly = false,
  saving = false,
  onSetValue,
  onToggleDone,
  onFinish,
}) {
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [entry, setEntry] = useState(null);     // { exercise, metric, setIdx, mode }

  const toggleExpanded = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Sections in order, each with its exercises in order, and one
  // running number that continues across section boundaries.
  const laidOut = useMemo(() => {
    const ordered = [...sections].filter(Boolean).sort(
      (a, b) => (a.order ?? a.sort_order ?? 0) - (b.order ?? b.sort_order ?? 0)
    );
    let running = 0;
    return ordered.map((section) => {
      const rows = exercises
        .filter((e) => e && e.training_section_id === section.id)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((exercise) => ({ exercise, runningIndex: ++running }));
      return {
        section,
        rows,
        checkOnly: isCheckOnlySection(section),
        // Column headers ride the band in strength sections only.
        showColumnHeaders: sectionTypeOf(section) === 'strength',
      };
    });
  }, [sections, exercises]);

  // The active row is the first one that is not fully done — the place
  // the trainee is standing right now.
  const activeExerciseId = useMemo(() => {
    for (const { rows } of laidOut) {
      for (const { exercise } of rows) {
        if (execCompletion[exercise.id]) continue;
        const total = resolveSetCount(exercise);
        const logs = setLogs[exercise.id] || {};
        let done = 0;
        for (let i = 0; i < total; i++) if (logs[i]?.done) done++;
        if (done < total) return exercise.id;
      }
    }
    return null;
  }, [laidOut, setLogs, execCompletion]);

  const jumpToActive = () => {
    if (!activeExerciseId || typeof document === 'undefined') return;
    const el = document.querySelector(`[data-sheet-exercise="${activeExerciseId}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const commit = (exercise, setIdx, value, metric) => {
    if (typeof onSetValue === 'function') onSetValue(exercise, setIdx, value, metric?.mode || 'reps');
    setEntry(null);
  };

  const entryLogs = entry ? (setLogs[entry.exercise.id] || {}) : {};
  const entryMetric = entry?.metric;
  const entrySetCount = entry ? resolveSetCount(entry.exercise) : 0;

  return (
    <div dir="rtl" style={{ background: C.frame, padding: 6, minHeight: '100%' }}>
      <div style={{
        background: C.page, borderRadius: 10, overflow: 'hidden',
        position: 'relative', paddingBottom: 96,
      }}>

        {/* Top strip — dark triangle on the LEFT, orange block with the
            logo on the RIGHT. */}
        <div style={{ position: 'relative', height: 54, background: C.page }}>
          <div style={{
            position: 'absolute', insetInlineEnd: 0, top: 0,
            height: 54, minWidth: 148, background: C.orange,
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '0 16px 0 22px',
            clipPath: 'polygon(0 0, 100% 0, 100% 100%, 14% 100%)',
          }}>
            <img
              src="/icon-192.png"
              alt=""
              width={26}
              height={26}
              style={{ borderRadius: 6, flexShrink: 0 }}
            />
            <span style={{
              fontFamily: SANS, fontSize: 15, fontWeight: 900, color: '#FFFFFF',
              letterSpacing: 0.3,
            }}>AthletiGo</span>
          </div>

          <div style={{
            position: 'absolute', insetInlineStart: 0, top: 0,
            width: 74, height: 54, background: C.frame,
            clipPath: 'polygon(0 0, 100% 0, 0 100%)',
          }} />
        </div>

        {/* Title, on its own line under the strip */}
        <div style={{
          fontFamily: SANS, fontSize: 20, fontWeight: 900, color: C.ink,
          padding: '12px 14px 10px',
        }}>
          {planName || 'תוכנית אימונים'}
        </div>

        {/* Sections */}
        <div style={{ padding: '0 10px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {laidOut.map(({ section, rows, checkOnly, showColumnHeaders }) => (
            <div key={section.id} style={{
              background: C.card, border: `1px solid ${C.cardBorder}`,
              borderRadius: 12, overflow: 'hidden',
            }}>
              <div style={{
                background: C.band, padding: '8px 10px',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{
                  flex: 1, minWidth: 0, fontFamily: SANS, fontSize: 14,
                  fontWeight: 800, color: C.ink,
                }}>{section.section_name || 'מקטע'}</span>

                {/* Column headers live on the band, in the strength
                    section only — that is the one a trainee reads as a
                    target-vs-actual table. */}
                {!checkOnly && showColumnHeaders && (
                  <>
                    <span style={{
                      flex: '0 0 48px', width: 48, textAlign: 'center',
                      fontFamily: SANS, fontSize: 10.5, fontWeight: 800, color: C.number,
                    }}>יעד</span>
                    <span style={{
                      flex: '0 0 172px', width: 172, textAlign: 'center',
                      fontFamily: SANS, fontSize: 10.5, fontWeight: 800, color: C.number,
                    }}>ביצוע בפועל</span>
                  </>
                )}
              </div>

              {rows.length === 0 ? (
                <div style={{
                  padding: '12px 10px', fontFamily: SANS, fontSize: 12, color: C.note,
                }}>אין תרגילים במקטע הזה</div>
              ) : rows.map(({ exercise, runningIndex }) => (
                <div key={exercise.id} data-sheet-exercise={exercise.id}>
                  <ExerciseRow
                    exercise={exercise}
                    runningIndex={runningIndex}
                    checkOnly={checkOnly}
                    readOnly={readOnly}
                    logs={setLogs[exercise.id] || {}}
                    markedComplete={!!execCompletion[exercise.id]}
                    isActive={exercise.id === activeExerciseId}
                    expanded={expandedIds.has(exercise.id)}
                    onToggleExpanded={toggleExpanded}
                    onOpenEntry={setEntry}
                    onToggleDone={onToggleDone}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Orange diagonal, bottom right of the page */}
        <div style={{
          position: 'absolute', insetInlineEnd: 0, bottom: 0,
          width: 120, height: 76, background: C.orange, opacity: 0.9,
          clipPath: 'polygon(100% 0, 100% 100%, 0 100%)',
          pointerEvents: 'none',
        }} />
      </div>

      {/* Fixed bottom bar — stays put while the sheet scrolls */}
      {!readOnly && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
          background: C.page, borderTop: `1px solid ${C.cardBorder}`,
          boxShadow: '0 -6px 12px rgba(0,0,0,0.06)',
          padding: '8px 10px',
          paddingBottom: 'max(env(safe-area-inset-bottom), 8px)',
          display: 'flex', gap: 8, alignItems: 'center',
        }}>
          <button
            type="button"
            disabled={saving}
            onClick={() => onFinish && onFinish()}
            style={{
              flex: 1, height: 46, borderRadius: 12, border: 'none',
              background: C.orange, color: '#FFFFFF',
              fontFamily: SANS, fontSize: 15, fontWeight: 800,
              cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1,
            }}
          >{saving ? 'שומר…' : 'סיום ושמירת האימון'}</button>

          <button
            type="button"
            onClick={jumpToActive}
            disabled={!activeExerciseId}
            style={{
              flex: '0 0 116px', height: 46, borderRadius: 12,
              border: `1px solid ${C.cardBorder}`, background: C.card,
              fontFamily: SANS, fontSize: 13, fontWeight: 700,
              color: activeExerciseId ? C.ink : C.note,
              cursor: activeExerciseId ? 'pointer' : 'default',
            }}
          >לתרגיל הבא</button>
        </div>
      )}

      {/* Entry surfaces — one popup shared by every row */}
      <AllSetsPanel
        open={entry?.mode === 'panel'}
        title={entry ? (entry.exercise.exercise_name || 'תרגיל') : ''}
        metric={entryMetric}
        sets={Array.from({ length: entrySetCount }, (_, i) => ({
          index: i,
          target: entryMetric?.target ?? 0,
          value: entryMetric ? entryLogs?.[i]?.[entryMetric.logField] : null,
        }))}
        onPick={(idx) => setEntry((e) => (e ? { ...e, mode: 'single', setIdx: idx } : e))}
        onClose={() => setEntry(null)}
      />

      <TimeEntryPopup
        isOpen={entry?.mode === 'single' && !!entryMetric?.isTime}
        value={entryMetric ? entryLogs?.[entry.setIdx]?.[entryMetric.logField] ?? entryMetric.target : null}
        title={entry ? `${entry.exercise.exercise_name || ''} · סט ${(entry.setIdx ?? 0) + 1}` : ''}
        onClose={() => setEntry(null)}
        onSelect={(v) => entry && commit(entry.exercise, entry.setIdx, v, entryMetric)}
      />

      <ScrollPickerPopup
        isOpen={entry?.mode === 'single' && !!entryMetric && !entryMetric.isTime}
        value={entryMetric ? entryLogs?.[entry.setIdx]?.[entryMetric.logField] ?? entryMetric.target : null}
        options={entryMetric?.key === 'weight' ? WEIGHT_OPTIONS : REPS_OPTIONS}
        title={entry ? `${entry.exercise.exercise_name || ''} · סט ${(entry.setIdx ?? 0) + 1}` : ''}
        onClose={() => setEntry(null)}
        onSelect={(v) => entry && commit(entry.exercise, entry.setIdx, v, entryMetric)}
      />
    </div>
  );
}
