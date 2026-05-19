import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { notifyExerciseCompleted } from "@/functions/notificationTriggers";
import { useActiveTimer } from "@/contexts/ActiveTimerContext";

// Stripe + border palette per exercise variant. The trainee execution
// stripe flips to green once `exercise.completed` becomes true
// (UnifiedPlanBuilder bumps that flag when every set in `setLog` is
// done — see toggleSetDone).
const VARIANT_COLORS = {
  normal:   { stripe: '#FF6F20', border: '#F0E4D0', tint: '#FFF5EE' },
  list:     { stripe: '#7F47B5', border: '#e9d5ff', tint: '#F5F3FF' },
  tabata:   { stripe: '#3B82F6', border: '#BFDBFE', tint: '#EFF6FF' },
  done:     { stripe: '#16a34a', border: '#bbf7d0', tint: '#F0FDF4' },
};

// `tabata_data` is TEXT-serialised JSON in the live DB. Parse defensively
// so a stray null / bad JSON / already-an-object input all flow through
// the same downstream shape: { container_type, sub_exercises, work_time, ... }.
function parseTabataData(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// Identifies the variant the card should render as. The DB stores
// `mode = 'טבטה'` for tabata and `mode ∈ {'סופרסט','קומבו','רשימה'}`
// for child-list rows; both shapes carry their children inside
// `tabata_data.sub_exercises` even when mode is non-tabata (the
// editor reuses the same JSONB shape, just with `container_type =
// 'superset'`/'combo'/'list').
function getVariant(exercise) {
  if (exercise.mode === 'טבטה') return 'tabata';
  if (['סופרסט', 'קומבו', 'רשימה'].includes(exercise.mode)) return 'list';
  return 'normal';
}

// Walks the historical fallback chain for sub-exercises. Order matters:
// `tabata_data.sub_exercises` is the canonical store; the rest are
// legacy paths that earlier editor versions wrote to.
function getSubExercises(exercise) {
  const td = parseTabataData(exercise.tabata_data);
  if (td && typeof td === 'object') {
    // The canonical key, plus every other plausible name the editor
    // has used over time — pick the first array we find that is non-empty.
    for (const key of ['sub_exercises', 'exercises', 'items', 'children', 'block_exercises', 'list']) {
      if (Array.isArray(td[key]) && td[key].length) return td[key];
    }
    // Nested blocks structure (legacy)
    if (Array.isArray(td.blocks)) {
      const out = [];
      td.blocks.forEach(b => (b.block_exercises || b.exercises || []).forEach(be => out.push(be)));
      if (out.length) return out;
    }
  }
  // Direct columns on the exercise row
  for (const key of ['sub_exercises', 'superset_exercises', 'combo_exercises', 'tabata_exercises', 'exercises']) {
    const v = exercise[key];
    if (Array.isArray(v) && v.length) return v;
  }
  // exercise_list — TEXT-serialised JSON in this DB
  if (typeof exercise.exercise_list === 'string' && exercise.exercise_list.trim()) {
    try {
      const parsed = JSON.parse(exercise.exercise_list);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch {}
  }
  return [];
}

// Coerces seconds-or-formatted into total seconds. Returns null for
// missing / zero so callers can omit empty params.
function toSeconds(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'string' && v.includes(':')) {
    const [m, s] = v.split(':').map(Number);
    const total = (m || 0) * 60 + (s || 0);
    return total > 0 ? total : null;
  }
  const n = parseInt(v, 10);
  return Number.isNaN(n) || n <= 0 ? null : n;
}

function fmtMMSS(totalSec) {
  if (!totalSec || totalSec <= 0) return null;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Treat 0, "0", "", null, undefined as "absent" — those chips are
// hidden so the grid only shows meaningful prescribed params.
function hasValue(v) {
  if (v == null) return false;
  if (typeof v === 'string') return v.trim() !== '' && v !== '0';
  if (typeof v === 'number') return v !== 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

// Hebrew label + unit per param column. Sequence here drives the
// order chips render in (no `param_order` column in this DB).
const PARAM_DEFS = [
  { key: 'sets',                   label: 'סטים',              unit: 'סטים' },
  { key: 'reps',                   label: 'חזרות',             unit: 'חז׳' },
  { key: 'weight',                 label: 'משקל',              unit: 'ק״ג' },
  // rest_time is the plain "rest" param (between sets in normal mode,
  // between rounds in tabata). Used to share its label with
  // rest_between_sets — fixed to plain 'מנוחה' so the two distinct
  // fields never render under the same label.
  { key: 'rest_time',              label: 'מנוחה',              unit: 'שנ׳', isTime: true },
  { key: 'work_time',              label: 'זמן עבודה',          unit: 'שנ׳', isTime: true },
  { key: 'rest_between_sets',      label: 'מנוחה בין סטים',     unit: 'שנ׳', isTime: true },
  { key: 'rest_between_exercises', label: 'מנוחה בין תרגילים', unit: 'שנ׳', isTime: true },
  { key: 'static_hold_time',       label: 'החזקה',              unit: 'שנ׳', isTime: true },
  { key: 'rpe',                    label: 'RPE',               unit: '/ 10' },
  { key: 'tempo',                  label: 'טמפו',              unit: null },
  { key: 'side',                   label: 'צד',                unit: null },
  { key: 'grip',                   label: 'אחיזה',             unit: null },
  { key: 'body_position',          label: 'מיקום גוף',          unit: null },
  { key: 'range_of_motion',        label: 'טווח תנועה',         unit: null },
  { key: 'equipment',              label: 'ציוד',              unit: null },
];

function formatParamValue(def, raw) {
  if (def.isTime) {
    const s = toSeconds(raw);
    return s != null ? String(s) : null;
  }
  if (Array.isArray(raw)) return raw.filter(Boolean).join(', ');
  return String(raw);
}

// Maps a sub-exercise (the row inside tabata_data.sub_exercises) to
// the abstract { type, value, label } shape used by the list-variant
// table. The schema has no target_type/target_value columns, so we
// derive the type from whichever prescribed field is populated:
//   reps     → "X חזרות" (or sub.reps_label if the coach overrode it,
//              e.g. "X קפיצות" for jump-rope drills)
//   work_time→ "X שניות"
//   distance → "X מטר"   (JSONB-only, no column needed)
//   weight   → "X ק״ג"
// Returns null when no recognisable target exists, so the caller can
// render a dash without guessing units.
function getDrillTarget(sub) {
  if (!sub) return null;
  if (hasValue(sub.reps)) {
    const label = (typeof sub.reps_label === 'string' && sub.reps_label.trim()) ? sub.reps_label.trim() : 'חזרות';
    return { type: 'reps', value: sub.reps, label, display: `${sub.reps} ${label}` };
  }
  const work = toSeconds(sub.work_time);
  if (work != null) {
    return { type: 'time', value: work, label: 'שניות', display: `${work} שניות` };
  }
  if (hasValue(sub.distance)) {
    return { type: 'distance', value: sub.distance, label: 'מטר', display: `${sub.distance} מטר` };
  }
  if (hasValue(sub.weight)) {
    return { type: 'weight', value: sub.weight, label: 'ק״ג', display: `${sub.weight} ק״ג` };
  }
  return null;
}

// Pulls a stable display name from a sub-exercise across the many
// legacy field names different editor versions wrote.
function getDrillName(sub, index) {
  const candidates = [sub?.name, sub?.exercise_name, sub?.exerciseName, sub?.title, sub?.label, sub?.displayName];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return `תרגיל ${index + 1}`;
}

// Resolves the prescribed columns for a normal-variant set table.
// Returns an ordered list of { key, label, value } — only columns with
// a meaningful prescribed value appear, so a bodyweight rep-only
// exercise renders just חזרות/✓ without empty משקל/זמן cells. `time`
// reads work_time (the seconds the trainee should hold/work per set).
function resolveNormalColumns(exercise) {
  const cols = [];
  if (hasValue(exercise.reps)) {
    cols.push({ key: 'reps', label: 'חזרות', value: String(exercise.reps) });
  }
  if (hasValue(exercise.weight)) {
    cols.push({ key: 'weight', label: 'משקל', value: String(exercise.weight) });
  }
  const workSec = toSeconds(exercise.work_time);
  if (workSec != null) {
    cols.push({ key: 'time', label: 'זמן', value: String(workSec) });
  }
  return cols;
}

// ── Sub components ────────────────────────────────────────────────

// Vertical list row for the open-card body. Spec'd layout:
// label (14 / #888) on the right (RTL), value (17 / 500 / #1a1a1a) +
// unit (12 / 400 / #888) on the left, with a hairline separator.
// `isLast` drops the bottom border so the last row in a group sits
// flush against whatever follows it (sub-exercises list / coach note).
function ParamListRow({ label, value, unit, isLast }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 10,
      padding: '11px 0',
      borderBottom: isLast ? 'none' : '0.5px solid #F4EDE0',
      direction: 'rtl',
    }}>
      <span style={{ fontSize: 14, color: '#888' }}>{label}</span>
      <span>
        <span style={{ fontSize: 17, fontWeight: 500, color: '#1a1a1a' }}>{value}</span>
        {unit && (
          <span style={{ fontSize: 12, fontWeight: 400, color: '#888', marginInlineStart: 4 }}>
            {unit}
          </span>
        )}
      </span>
    </div>
  );
}

function ParamChip({ label, value, unit, valueColor }) {
  return (
    <div style={{
      background: '#FFFFFF',
      border: '1.5px solid #F0E4D0',
      borderRadius: 10,
      padding: '9px 11px',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{ fontSize: 12, color: '#888', fontWeight: 500, marginBottom: 3 }}>
        {label}
      </div>
      <div style={{
        fontSize: 20,
        fontWeight: 700,
        color: valueColor || '#1a1a1a',
        fontFamily: "'Barlow Condensed', sans-serif",
        lineHeight: 1.1,
        letterSpacing: '0.3px',
      }}>
        {value}
        {unit && (
          <span style={{ fontSize: 13, color: '#888', fontWeight: 500, marginInlineStart: 4 }}>
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

function CoachNoteBox({ text }) {
  if (!text) return null;
  return (
    <div style={{
      background: '#FFFFFF',
      border: '1.5px solid #F0E4D0',
      borderRadius: 10,
      padding: '10px 12px',
      marginTop: 10,
    }}>
      <div style={{ fontSize: 12, color: '#aaa', fontWeight: 600, marginBottom: 4 }}>
        💬 הערת מאמן
      </div>
      <div style={{ fontSize: 14, color: '#444', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
        {text}
      </div>
    </div>
  );
}

function SetCheckbox({ checked, color, onToggle }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      aria-checked={checked}
      role="checkbox"
      style={{
        width: 26, height: 26, borderRadius: 7,
        border: `2.5px solid ${checked ? '#16a34a' : color}`,
        background: checked ? '#16a34a' : '#FFFFFF',
        color: '#FFFFFF',
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 0,
        fontSize: 15, fontWeight: 900, lineHeight: 1,
        transition: 'background 0.15s, border-color 0.15s',
      }}
    >
      {checked ? '✓' : ''}
    </button>
  );
}

function ActionButton({ icon, label, color, borderColor, onClick }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick?.(e); }}
      style={{
        height: 36,
        borderRadius: 9,
        border: `1.5px solid ${borderColor}`,
        background: '#FFFFFF',
        color,
        fontSize: 13, fontWeight: 600,
        padding: '0 14px',
        cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontFamily: 'inherit',
        whiteSpace: 'nowrap',
      }}
    >
      <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>{icon}</span>
      {label}
    </button>
  );
}

function SubExerciseItem({ index, sub, accentColor, accentTint }) {
  // The editor has used several different field names for the sub-
  // exercise display name over time. Try them all, treat empty/
  // whitespace as missing, and fall back to a numeric placeholder
  // so an item is never visually blank.
  const pickName = (...candidates) => {
    for (const c of candidates) {
      if (typeof c === 'string' && c.trim()) return c.trim();
    }
    return null;
  };
  const name = pickName(
    sub?.name, sub?.exercise_name, sub?.exerciseName,
    sub?.title, sub?.label, sub?.displayName,
    sub?.exercise?.name, sub?.exercise?.exercise_name,
  ) || `תרגיל ${index}`;
  const desc = sub.description || sub.notes || sub.coach_notes || null;
  const reps   = hasValue(sub.reps)      ? `${sub.reps} חז׳` : null;
  const weight = hasValue(sub.weight)    ? `${sub.weight} ק״ג` : null;
  const rest   = toSeconds(sub.rest_time);
  const restLabel = rest ? `מנוחה ${rest} שנ׳` : null;
  const work   = toSeconds(sub.work_time);
  const workLabel = work ? `עבודה ${work} שנ׳` : null;
  const meta = [reps, weight, restLabel, workLabel].filter(Boolean).join(' · ');

  return (
    <div style={{
      padding: '10px 12px',
      borderTop: `1px solid ${accentTint}`,
      background: '#FFFFFF',
      display: 'flex', alignItems: 'flex-start', gap: 10,
    }}>
      <div style={{
        width: 26, height: 26, borderRadius: '50%',
        background: accentTint, color: accentColor,
        fontSize: 13, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, fontFamily: "'Barlow Condensed', sans-serif",
      }}>{index}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a', wordBreak: 'break-word' }}>
          {name}
        </div>
        {meta && (
          <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>
            {meta}
          </div>
        )}
        {desc && (
          <div style={{ fontSize: 12, color: '#999', marginTop: 4, lineHeight: 1.4 }}>
            {desc}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────

export default function ExerciseCard({
  exercise,
  // Shared callbacks
  onToggleComplete,
  onEdit,
  onDelete,
  onDuplicate,
  onRename,
  // Mode-controlling props. Either pass `mode` directly OR rely on the
  // legacy `canEdit` boolean (true → coach edit, false → trainee).
  mode,
  canEdit = false,
  isCoach = false,
  plan,
  traineeProgress,
  // Per-set state — driven by parent UnifiedPlanBuilder.
  setLog,
  onSetLogChange: _onSetLogChange,
  onSetToggleDone,
  // Per-drill-per-set state for list-variant exercises. Each cell is
  // a boolean inside drillSetLog[setIdx][drillIdx]. Local-state only —
  // not persisted to exercise_set_logs (no drill_index column).
  drillSetLog,
  onDrillSetToggleDone,
}) {
  const queryClient = useQueryClient();
  // Tabata launch hands cfg → ActiveTimerContext.pendingTabataCfg,
  // then opens the TabataTimer overlay on its SETTINGS screen so the
  // trainee verifies + sets prep-time, instead of jumping straight to
  // a running timer.
  const activeTimer = useActiveTimer();
  const [expanded, setExpanded] = useState(false);
  const [renaming, setRenaming] = useState(false);

  if (!exercise) return null;

  // Resolve the run-mode: explicit `mode` prop wins, else fall back
  // to `canEdit` (the prop SectionCard passes in today).
  const resolvedMode = mode || (canEdit ? 'coach' : 'trainee');
  const isCoachMode = resolvedMode === 'coach';

  const variant = getVariant(exercise);
  const completed = !!exercise.completed;
  const colors = completed ? VARIANT_COLORS.done : VARIANT_COLORS[variant];

  const name = exercise.exercise_name || exercise.name || 'תרגיל';
  const td = parseTabataData(exercise.tabata_data);
  const subExercises = getSubExercises(exercise);
  const description = exercise.description || exercise.notes || exercise.coach_notes || null;

  // Diagnostic logger — fires once per render of a container exercise
  // so the actual sub_exercises shape lands in DevTools when the bug
  // we're chasing has empty items. Keep cheap & guarded so production
  // doesn't get spammed by normal-mode rows.
  if ((variant === 'tabata' || variant === 'list') && typeof window !== 'undefined') {
    // eslint-disable-next-line no-console
    console.log('[ExerciseCard]', {
      name,
      mode: exercise.mode,
      variant,
      tabata_data_type: typeof exercise.tabata_data,
      tabata_data_parsed: td,
      sub_exercises_keys: td && typeof td === 'object' ? Object.keys(td) : null,
      sub_exercises_resolved: subExercises,
      sub_exercises_count: subExercises.length,
      first_sub_keys: subExercises[0] ? Object.keys(subExercises[0]) : null,
    });
  }

  // Single source of truth for the param items rendered on this card.
  // Returns an ordered array where each entry has:
  //   key   — stable identifier (param column name)
  //   pill  — short Hebrew text for the closed-card pill
  //   label — fuller label for the open-card list row
  //   value — the numeric/string value as a plain string
  //   unit  — optional unit suffix for the list row (שנ' / ק"ג ...)
  // Only filled params are returned — skipping happens here, callers
  // just map. Order is the spec'd "timer params first, body params
  // after" sequence and is identical for both the pills and the
  // expanded list rows.
  const buildParamItems = () => {
    const cs = td?.clock_settings || null;
    const items = [];

    const workSec = toSeconds(cs?.work_seconds ?? exercise.work_time);
    if (workSec != null) items.push({
      key: 'work_time', label: 'זמן עבודה', value: String(workSec), unit: 'שנ\'',
      pill: `עבודה ${workSec} שנ'`,
    });

    const restSec = toSeconds(cs?.rest_seconds ?? exercise.rest_time);
    if (restSec != null) items.push({
      key: 'rest_time', label: 'מנוחה', value: String(restSec), unit: 'שנ\'',
      pill: `מנוחה ${restSec} שנ'`,
    });

    const roundsVal = cs?.rounds ?? exercise.rounds;
    if (hasValue(roundsVal)) items.push({
      key: 'rounds', label: 'מספר סבבים', value: String(roundsVal), unit: null,
      pill: `${roundsVal} סבבים`,
    });

    const setsVal = cs?.sets ?? exercise.sets;
    if (hasValue(setsVal)) items.push({
      key: 'sets', label: 'מספר סטים', value: String(setsVal), unit: null,
      pill: `${setsVal} סטים`,
    });

    // rest_between_sets — no DB column; from clock_settings or legacy
    // top-level tabata_data.
    const rbsSec = toSeconds(cs?.rest_between_sets ?? td?.rest_between_sets ?? exercise.rest_between_sets);
    if (rbsSec != null) items.push({
      key: 'rest_between_sets', label: 'מנוחה בין סטים', value: String(rbsSec), unit: 'שנ\'',
      pill: `בין סטים ${rbsSec} שנ'`,
    });

    const rbeSec = toSeconds(exercise.rest_between_exercises);
    if (rbeSec != null) items.push({
      key: 'rest_between_exercises', label: 'מנוחה בין תרגילים', value: String(rbeSec), unit: 'שנ\'',
      pill: `בין תרגילים ${rbeSec} שנ'`,
    });

    if (hasValue(exercise.reps)) items.push({
      key: 'reps', label: 'חזרות', value: String(exercise.reps), unit: null,
      pill: `${exercise.reps} חזרות`,
    });

    if (hasValue(exercise.weight)) items.push({
      key: 'weight', label: 'משקל', value: String(exercise.weight), unit: 'ק"ג',
      pill: `${exercise.weight} ק"ג`,
    });

    const shtSec = toSeconds(exercise.static_hold_time);
    if (shtSec != null) items.push({
      key: 'static_hold_time', label: 'החזקה', value: String(shtSec), unit: 'שנ\'',
      pill: `החזקה ${shtSec} שנ'`,
    });

    if (hasValue(exercise.rpe)) items.push({
      key: 'rpe', label: 'RPE', value: String(exercise.rpe), unit: null,
      pill: `RPE ${exercise.rpe}`,
    });

    if (hasValue(exercise.tempo)) items.push({
      key: 'tempo', label: 'טמפו', value: String(exercise.tempo), unit: null,
      pill: `טמפו ${exercise.tempo}`,
    });

    return items;
  };

  const paramItems = buildParamItems();

  // Closed-card pill bits — for the title-line indicator. completed
  // wins outright (a single "הושלם" pill). Tabata collapses to a
  // single summary pill ("טבטה · {rounds} סבבים · {count} תרגילים")
  // since the OPEN card already lays out the full clock values; the
  // closed card duplicates were too dense to scan. Other variants
  // (including סופרסט) keep the per-param pill list as before.
  const summaryPills = (() => {
    if (completed) return ['✓ הושלם'];

    if (variant === 'tabata') {
      // Rounds: prefer the canonical tabata_data.clock_settings,
      // fall back to the legacy top-level tabata_data.rounds, then
      // to the exercise column.
      const cs = td?.clock_settings || null;
      const rounds = cs?.rounds ?? td?.rounds ?? exercise?.rounds ?? null;
      const count = subExercises.length;
      const parts = ['טבטה'];
      if (hasValue(rounds))  parts.push(`${rounds} סבבים`);
      if (count > 0)         parts.push(`${count} תרגילים`);
      return [parts.join(' · ')];
    }

    const bits = paramItems.map((it) => it.pill);
    if (variant === 'list') {
      const count = subExercises.length;
      if (count > 0) {
        bits.push(`${count} תרגילים`);
        bits.push('סופרסט');
      }
    }
    return bits;
  })();

  // Per-set checkbox row state (trainee mode). The parent owns the
  // actual toggle handler — we just read from `setLog` and forward.
  const totalSets = Math.max(1, parseInt(exercise.sets, 10) || 1);
  const isSetDone = (idx) => !!(setLog?.[idx]?.done);

  const handleSetToggle = (idx) => {
    if (typeof onSetToggleDone !== 'function') return;
    onSetToggleDone(exercise, idx);
    // When this toggle completes the last open set, fire the
    // "exercise completed" notification (best-effort, never blocks).
    const aboutToComplete = !isSetDone(idx);
    if (aboutToComplete && !completed) {
      let doneCount = 0;
      for (let i = 0; i < totalSets; i++) {
        if (i === idx) { doneCount++; continue; }
        if (isSetDone(i)) doneCount++;
      }
      if (doneCount === totalSets && plan?.created_by) {
        (async () => {
          try {
            const me = await base44.auth.me();
            if (!me?.id) return;
            await notifyExerciseCompleted({
              coachId: plan.created_by,
              traineeId: me.id,
              traineeName: me.full_name,
              exerciseName: name,
            });
            queryClient.invalidateQueries({ queryKey: ['notifications'] });
          } catch {}
        })();
      }
    }
  };

  // Tabata-specific derived values for the expanded view.
  const tabataTotal = (() => {
    if (variant !== 'tabata' || !td) return null;
    const w = parseInt(td.work_time ?? td.work_sec ?? 0, 10) || 0;
    const r = parseInt(td.rest_time ?? td.rest_sec ?? 0, 10) || 0;
    const rounds = parseInt(td.rounds ?? 0, 10) || 0;
    const sets   = parseInt(td.sets ?? 1, 10) || 1;
    const rbs    = parseInt(td.rest_between_sets ?? 0, 10) || 0;
    if (w === 0 && r === 0 && rounds === 0) return null;
    const perSet = (w + r) * rounds;
    const total = perSet * sets + rbs * Math.max(0, sets - 1);
    return total > 0 ? total : null;
  })();

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div style={{
      borderRadius: 11,
      border: `1.5px solid ${colors.border}`,
      overflow: 'hidden',
      marginBottom: isCoachMode ? 7 : 5,
      background: '#FFFFFF',
      display: 'flex',
      direction: 'rtl',
    }}>
      {/* Left vertical stripe */}
      <div style={{
        width: isCoachMode ? 6 : 4,
        background: colors.stripe,
        flexShrink: 0,
      }} aria-hidden />

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Header — collapsed/header row */}
        <div
          onClick={() => setExpanded(v => !v)}
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setExpanded(v => !v);
            }
          }}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            padding: isCoachMode ? '12px 13px' : '10px 11px',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          {/* Master checkbox: in trainee mode it mirrors `completed`
              (driven by per-set toggles below); in coach mode it
              renders as a decorative state indicator only. */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (isCoachMode) return;
              // Trainee: tapping the master checkbox is a shortcut that
              // toggles the parent's exercise-completed flag.
              if (onToggleComplete) onToggleComplete(exercise);
            }}
            aria-checked={completed}
            role="checkbox"
            disabled={isCoachMode}
            style={{
              width: 26, height: 26, borderRadius: 7,
              border: `2.5px solid ${completed ? '#16a34a' : colors.stripe}`,
              background: completed ? '#16a34a' : '#FFFFFF',
              color: '#FFFFFF',
              cursor: isCoachMode ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 0, flexShrink: 0, marginTop: 1,
              fontSize: 15, fontWeight: 900, lineHeight: 1,
            }}
          >{completed ? '✓' : ''}</button>

          <div style={{ flex: 1, minWidth: 0 }}>
            {renaming ? (
              <input
                autoFocus
                defaultValue={name}
                onClick={(e) => e.stopPropagation()}
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  setRenaming(false);
                  if (next && next !== name && onRename) onRename(exercise.id, next);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.target.blur();
                  if (e.key === 'Escape') { e.target.value = name; e.target.blur(); }
                }}
                style={{
                  fontSize: 16, fontWeight: 700, color: '#1a1a1a',
                  width: '100%', border: 'none',
                  borderBottom: `2px solid ${colors.stripe}`,
                  background: 'transparent', outline: 'none',
                  fontFamily: 'inherit', padding: '2px 0', direction: 'rtl',
                }}
              />
            ) : (
              <div style={{
                fontSize: 16, fontWeight: 700,
                fontFamily: "'Barlow', system-ui, sans-serif",
                color: completed ? '#aaa' : '#1a1a1a',
                textDecoration: completed ? 'line-through' : 'none',
                lineHeight: 1.3,
                wordBreak: 'break-word',
              }}>
                {name}
              </div>
            )}
            {summaryPills.length > 0 && (
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
                marginTop: 5,
                direction: 'rtl',
              }}>
                {summaryPills.map((text, i) => (
                  <span
                    key={i}
                    style={{
                      display: 'inline-block',
                      background: completed ? '#DCFCE7' : '#FFF0E4',
                      color: completed ? '#15803D' : '#993C1D',
                      fontSize: 12,
                      padding: '4px 9px',
                      borderRadius: 8,
                      whiteSpace: 'nowrap',
                      fontWeight: 500,
                    }}
                  >{text}</span>
                ))}
              </div>
            )}
          </div>

          <span aria-hidden style={{
            color: colors.stripe,
            fontSize: 14,
            transition: 'transform 0.2s',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            flexShrink: 0, marginTop: 4,
          }}>▼</span>
        </div>

        {/* Expanded body */}
        {expanded && (
          <div style={{
            background: '#FAFAFA',
            borderTop: `1px solid ${colors.border}`,
            padding: isCoachMode ? '12px 13px' : '10px 11px',
          }}>
            {/* Tabata — coach mode keeps the legacy detailed view
                (badge, full grid, total-time tile, sub list). */}
            {variant === 'tabata' && isCoachMode && (
              <>
                <div style={{
                  background: '#EFF6FF',
                  border: '1.5px solid #BFDBFE',
                  borderRadius: 10,
                  padding: '8px 12px',
                  fontSize: 14, color: '#3B82F6',
                  fontWeight: 700, textAlign: 'center',
                  marginBottom: 10,
                }}>
                  ⏱ פרוטוקול טבטה
                </div>

                {paramItems.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    {paramItems.map((it, i) => (
                      <ParamListRow
                        key={it.key}
                        label={it.label}
                        value={it.value}
                        unit={it.unit}
                        isLast={i === paramItems.length - 1}
                      />
                    ))}
                  </div>
                )}

                {tabataTotal && (
                  <div style={{
                    background: '#dcfce7',
                    border: '1.5px solid #86efac',
                    borderRadius: 10,
                    padding: '8px 12px',
                    textAlign: 'center',
                    marginBottom: 10,
                  }}>
                    <div style={{
                      fontFamily: "'Barlow Condensed', sans-serif",
                      fontSize: 22, fontWeight: 700, color: '#16a34a',
                      lineHeight: 1.1, letterSpacing: '0.5px',
                    }}>
                      {fmtMMSS(tabataTotal)} דקות
                    </div>
                    <div style={{ fontSize: 12, color: '#16a34a', fontWeight: 600, marginTop: 2 }}>
                      זמן כולל ({td?.sets || 1} סטים + מנוחות)
                    </div>
                  </div>
                )}

                {subExercises.length > 0 && (
                  <div style={{
                    border: '1.5px solid #BFDBFE',
                    borderRadius: 10,
                    overflow: 'hidden',
                    marginBottom: 10,
                  }}>
                    <div style={{
                      background: '#EFF6FF',
                      padding: '8px 12px',
                      fontSize: 13, fontWeight: 700, color: '#3B82F6',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <span>🏃 תרגילים לביצוע בסבבים</span>
                      <span style={{ fontWeight: 500 }}>{subExercises.length}</span>
                    </div>
                    {subExercises.map((sub, i) => (
                      <SubExerciseItem
                        key={sub.id || `sub-${i}`}
                        index={i + 1}
                        sub={sub}
                        accentColor="#3B82F6"
                        accentTint="#EFF6FF"
                      />
                    ))}
                  </div>
                )}

                <CoachNoteBox text={description} />
              </>
            )}

            {/* Tabata — trainee minimal layout: setting tiles (2 per
                row) + numbered drill list + "הפעל שעון טבטה" button
                that hands the timing off to the shared ClockContext
                (FloatingClockBar shows the running timer above the
                bottom nav). No per-set checkboxes — the timer drives
                completion, not manual taps. */}
            {variant === 'tabata' && !isCoachMode && (() => {
              // Multi-source read: prefer the canonical
              // tabata_data.clock_settings (new), fall back to legacy
              // top-level tabata_data keys (work_time/work_sec/...)
              // for rows saved with the old shape, finally fall back
              // to the direct exercise columns (work_time/rest_time/
              // rounds/sets). Two existing tabata rows in production
              // landed without clock_settings — the column fallback
              // keeps them working. rest_between_sets has no DB
              // column, so only the JSONB sources matter for it.
              const cs = td?.clock_settings || null;
              const pickInt = (...candidates) => {
                for (const c of candidates) {
                  if (c == null || c === '') continue;
                  const n = parseInt(c, 10);
                  if (Number.isFinite(n)) return n;
                }
                return 0;
              };
              const workSec = pickInt(cs?.work_seconds, td?.work_time, td?.work_sec, exercise?.work_time);
              const restSec = pickInt(cs?.rest_seconds, td?.rest_time, td?.rest_sec, exercise?.rest_time);
              const rounds  = pickInt(cs?.rounds, td?.rounds, exercise?.rounds);
              const sets    = pickInt(cs?.sets,   td?.sets,   exercise?.sets) || 1;
              const setRest = pickInt(cs?.rest_between_sets, td?.rest_between_sets);
              const canStart = workSec > 0 && rounds > 0
                && typeof activeTimer?.setPendingTabataCfg === 'function'
                && typeof activeTimer?.setShowTabata === 'function';

              return (
                <>
                  {paramItems.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      {paramItems.map((it, i) => (
                        <ParamListRow
                          key={it.key}
                          label={it.label}
                          value={it.value}
                          unit={it.unit}
                          isLast={i === paramItems.length - 1}
                        />
                      ))}
                    </div>
                  )}

                  {subExercises.length === 0 ? (
                    // Defensive: tabata without sub_exercises is rare
                    // but legal (the coach defined the timer but not
                    // the rotation). Show a soft notice instead of an
                    // empty gap so the trainee knows the timer is the
                    // whole point.
                    <div style={{
                      padding: 12, textAlign: 'center',
                      background: '#FFFFFF', borderRadius: 10,
                      border: '1px dashed #F2EDE3',
                      fontSize: 12, color: '#888',
                      marginBottom: 10,
                    }}>אין רשימת תרגילים מוגדרת לסבב — הפעל את השעון לפי ההגדרות</div>
                  ) : (
                    <div style={{
                      border: '1px solid #F2EDE3',
                      borderRadius: 10,
                      overflow: 'hidden',
                      background: '#FFFFFF',
                      marginBottom: 10,
                    }}>
                      <div style={{
                        background: '#FFF9F0',
                        padding: '8px 12px',
                        fontSize: 11, fontWeight: 700, color: '#999',
                      }}>
                        תרגילים בסבב
                      </div>
                      {subExercises.map((sub, i) => (
                        <div key={sub.id || `sub-${i}`} style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '10px 12px',
                          borderTop: '1px solid #F2EDE3',
                          fontSize: 13, color: '#1a1a1a',
                        }}>
                          <div style={{
                            width: 24, height: 24, borderRadius: '50%',
                            background: '#FFF5EE', color: '#FF6F20',
                            fontSize: 12, fontWeight: 700,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontFamily: "'Barlow Condensed', sans-serif",
                            flexShrink: 0,
                          }}>{i + 1}</div>
                          <div style={{ flex: 1, fontWeight: 600, wordBreak: 'break-word' }}>
                            {getDrillName(sub, i)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!canStart) return;
                      // Map coach-prescribed tabata_data → TabataTimer's
                      // internal cfg shape ({prep, work, rest, rb, rounds,
                      // sets}). prep stays at the timer's default 10s
                      // unless the trainee changes it on the settings
                      // screen. `source` lets the settings screen show
                      // the "מאמן" banner.
                      const prefill = {
                        prep: 10,
                        work: workSec,
                        rest: restSec,
                        rb: setRest,
                        rounds,
                        sets,
                        source: 'workout_exercise',
                      };
                      console.log('[TabataClock] prefilling with coach values:', prefill);
                      activeTimer.setPendingTabataCfg(prefill);
                      activeTimer.setShowTabata(true);
                    }}
                    disabled={!canStart}
                    style={{
                      width: '100%',
                      height: 44,
                      borderRadius: 10,
                      border: 'none',
                      background: canStart ? '#FF6F20' : '#E5E7EB',
                      color: canStart ? '#FFFFFF' : '#999',
                      fontSize: 15, fontWeight: 700,
                      cursor: canStart ? 'pointer' : 'not-allowed',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      fontFamily: 'inherit',
                    }}
                  >
                    <span aria-hidden style={{ fontSize: 16 }}>⏱</span>
                    הפעל שעון טבטה
                  </button>

                  <CoachNoteBox text={description} />
                </>
              );
            })()}

            {/* List/superset variant — coach mode retains the legacy
                cards so the editor view is unchanged. */}
            {variant === 'list' && isCoachMode && (
              <>
                {paramItems.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    {paramItems.map((it, i) => (
                      <ParamListRow
                        key={it.key}
                        label={it.label}
                        value={it.value}
                        unit={it.unit}
                        isLast={i === paramItems.length - 1}
                      />
                    ))}
                  </div>
                )}

                {subExercises.length > 0 && (
                  <div style={{
                    border: '1.5px solid #e9d5ff',
                    borderRadius: 10,
                    overflow: 'hidden',
                    marginBottom: 10,
                  }}>
                    <div style={{
                      background: '#F5F3FF',
                      padding: '8px 12px',
                      fontSize: 13, fontWeight: 700, color: '#7F47B5',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <span>📋 רשימת תרגילים</span>
                      <span style={{ fontWeight: 500 }}>{subExercises.length} תרגילים</span>
                    </div>
                    {subExercises.map((sub, i) => (
                      <SubExerciseItem
                        key={sub.id || `sub-${i}`}
                        index={i + 1}
                        sub={sub}
                        accentColor="#7F47B5"
                        accentTint="#F5F3FF"
                      />
                    ))}
                  </div>
                )}

                <CoachNoteBox text={description} />
              </>
            )}

            {/* List/superset variant — trainee dynamic table. Columns:
                תרגיל | יעד | סט 1 | ... | סט N. Each cell in the set
                columns is an independent checkbox tracked in
                drillSetLog[setIdx][drillIdx]. Completion of all
                (drill × set) cells flips exercise.completed via the
                parent's onDrillSetToggleDone, which in turn drives
                the existing section-feedback popup logic. */}
            {variant === 'list' && !isCoachMode && (() => {
              const drills = subExercises;
              const restSec = toSeconds(td?.rest_between_sets) ?? toSeconds(exercise.rest_time);
              const isDrillSetDone = (di, si) => !!(drillSetLog?.[si]?.[di]);
              const handleDrillToggle = (di, si) => {
                if (typeof onDrillSetToggleDone !== 'function') return;
                onDrillSetToggleDone(exercise, si, di, drills.length, totalSets);
              };
              return (
                <>
                  {drills.length === 0 ? (
                    <div style={{
                      padding: 16, textAlign: 'center',
                      background: '#FFFFFF', borderRadius: 10,
                      border: '1px dashed #e9d5ff',
                      fontSize: 13, color: '#888',
                    }}>אין תרגילים ברשימה</div>
                  ) : (
                    <div style={{
                      border: '1px solid #F2EDE3',
                      borderRadius: 10,
                      overflow: 'hidden',
                      background: '#FFFFFF',
                    }}>
                      {/* Header */}
                      <div style={{
                        display: 'flex',
                        background: '#FFF9F0',
                        fontSize: 11, fontWeight: 700, color: '#999',
                      }}>
                        <div style={{ flex: 2, padding: '8px 10px', textAlign: 'right' }}>תרגיל</div>
                        <div style={{ flex: 1, padding: '8px 6px', textAlign: 'center' }}>יעד</div>
                        {Array.from({ length: totalSets }).map((_, si) => (
                          <div key={si} style={{ width: 42, padding: '8px 4px', textAlign: 'center' }}>
                            סט {si + 1}
                          </div>
                        ))}
                      </div>
                      {/* One row per drill */}
                      {drills.map((sub, di) => {
                        const target = getDrillTarget(sub);
                        return (
                          <div key={sub.id || `drill-${di}`} style={{
                            display: 'flex', alignItems: 'center',
                            fontSize: 12,
                            borderTop: '1px solid #F2EDE3',
                          }}>
                            <div style={{
                              flex: 2, padding: '10px',
                              textAlign: 'right', fontWeight: 600,
                              color: '#1a1a1a', wordBreak: 'break-word',
                            }}>{getDrillName(sub, di)}</div>
                            <div style={{
                              flex: 1, padding: '10px 6px',
                              textAlign: 'center', color: '#666',
                            }}>{target ? target.display : '—'}</div>
                            {Array.from({ length: totalSets }).map((_, si) => (
                              <div key={si} style={{
                                width: 42, padding: '8px 4px',
                                display: 'flex', justifyContent: 'center',
                                background: isDrillSetDone(di, si) ? '#F0FDF4' : 'transparent',
                              }}>
                                <SetCheckbox
                                  checked={isDrillSetDone(di, si)}
                                  color={colors.stripe}
                                  onToggle={() => handleDrillToggle(di, si)}
                                />
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Inter-set rest banner — same pattern as normal. */}
                  {totalSets > 1 && restSec != null && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      marginTop: 12,
                      background: '#FFF9F0',
                      borderRadius: 8,
                      padding: 9,
                    }}>
                      <span style={{ fontSize: 14, color: '#FF6F20' }} aria-hidden>⏱</span>
                      <span style={{ fontSize: 12, color: '#888', fontWeight: 600 }}>
                        מנוחה {restSec} שנ׳ בין הסטים
                      </span>
                    </div>
                  )}

                  <CoachNoteBox text={description} />
                </>
              );
            })()}

            {/* Normal variant — coach mode now shares the same vertical
                list layout as the trainee tabata tiles below: one row
                per filled param, in the shared `paramItems` order. */}
            {variant === 'normal' && isCoachMode && (
              <>
                {paramItems.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    {paramItems.map((it, i) => (
                      <ParamListRow
                        key={it.key}
                        label={it.label}
                        value={it.value}
                        unit={it.unit}
                        isLast={i === paramItems.length - 1}
                      />
                    ))}
                  </div>
                )}

                <CoachNoteBox text={description} />
              </>
            )}

            {/* Normal variant — trainee table. Columns are derived from
                whichever prescribed values actually exist on the
                exercise (reps/weight/time), so a bodyweight reps-only
                row doesn't render empty משקל/זמן columns. The ✓
                column is the per-set toggle that drives
                exercise.completed via the parent's toggleSetDone. */}
            {variant === 'normal' && !isCoachMode && (() => {
              const cols = resolveNormalColumns(exercise);
              const restSec = toSeconds(exercise.rest_time);
              return (
                <>
                  <div style={{
                    border: '1px solid #F2EDE3',
                    borderRadius: 10,
                    overflow: 'hidden',
                    background: '#FFFFFF',
                  }}>
                    {/* Header */}
                    <div style={{
                      display: 'flex',
                      background: '#FFF9F0',
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#999',
                    }}>
                      <div style={{ flex: 1, padding: '8px 6px', textAlign: 'center' }}>סט</div>
                      {cols.map(c => (
                        <div key={c.key} style={{ flex: 1, padding: '8px 6px', textAlign: 'center' }}>
                          {c.label}
                        </div>
                      ))}
                      <div style={{ width: 44, padding: '8px 6px', textAlign: 'center' }}>✓</div>
                    </div>
                    {/* Set rows */}
                    {Array.from({ length: totalSets }).map((_, si) => (
                      <div key={si} style={{
                        display: 'flex',
                        alignItems: 'center',
                        fontSize: 13,
                        borderTop: '1px solid #F2EDE3',
                        background: isSetDone(si) ? '#F0FDF4' : '#FFFFFF',
                      }}>
                        <div style={{
                          flex: 1, padding: '10px 6px', textAlign: 'center',
                          fontFamily: "'Barlow Condensed', sans-serif",
                          fontWeight: 700, color: '#666',
                        }}>{si + 1}</div>
                        {cols.map(c => (
                          <div key={c.key} style={{
                            flex: 1, padding: '10px 6px', textAlign: 'center',
                            color: '#1a1a1a', fontWeight: 600,
                          }}>{c.value}</div>
                        ))}
                        <div style={{
                          width: 44, padding: '8px 6px',
                          display: 'flex', justifyContent: 'center',
                        }}>
                          <SetCheckbox
                            checked={isSetDone(si)}
                            color={colors.stripe}
                            onToggle={() => handleSetToggle(si)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Inter-set rest banner — only meaningful when there's
                      more than one set AND a rest_time prescribed. */}
                  {totalSets > 1 && restSec != null && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      marginTop: 12,
                      background: '#FFF9F0',
                      borderRadius: 8,
                      padding: 9,
                    }}>
                      <span style={{ fontSize: 14, color: '#FF6F20' }} aria-hidden>⏱</span>
                      <span style={{ fontSize: 12, color: '#888', fontWeight: 600 }}>
                        מנוחה {restSec} שנ׳ בין הסטים
                      </span>
                    </div>
                  )}

                  <CoachNoteBox text={description} />
                </>
              );
            })()}

            {/* Action buttons — coach mode only.
                שנה שם renders unconditionally so the row always has the
                4th action; if `onRename` isn't wired by the parent the
                inline rename still updates local state and discards on
                blur. שכפל also renders for every variant (the
                normal-only gate was over-strict — coaches asked to
                duplicate supersets/tabata too). */}
            {isCoachMode && (
              <div style={{
                marginTop: 12,
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
              }}>
                {onEdit && (
                  <ActionButton
                    icon="✏"
                    label="ערוך"
                    color={colors.stripe}
                    borderColor={colors.border}
                    onClick={() => onEdit(exercise)}
                  />
                )}
                {onDuplicate && (
                  <ActionButton
                    icon="⧉"
                    label="שכפל"
                    color="#555"
                    borderColor="#F0E4D0"
                    onClick={() => onDuplicate(exercise)}
                  />
                )}
                <ActionButton
                  icon="✎"
                  label="שנה שם"
                  color="#555"
                  borderColor="#F0E4D0"
                  onClick={() => setRenaming(true)}
                />
                {onDelete && (
                  <ActionButton
                    icon="🗑"
                    label="מחק"
                    color="#dc2626"
                    borderColor="#fecaca"
                    onClick={() => {
                      if (window.confirm('למחוק תרגיל זה?')) onDelete(exercise);
                    }}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
