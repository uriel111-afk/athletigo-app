import React, { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { MoreHorizontal, Copy, Trash2, Edit2, CircleCheck, Check, Timer, Zap } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { notifyExerciseCompleted } from "@/functions/notificationTriggers";
import { useActiveTimer } from "@/contexts/ActiveTimerContext";
import { useClock } from "@/contexts/ClockContext";
import { useSmartBackHandler } from "@/hooks/useSmartBack";
import { getMethodByMode } from '../../constants/trainingMethods';
import { parsePlannedSets, loadActualsForExercise, loadActualsByDrillForExercise, saveSetActual } from '../../lib/plannedSets';
import { UNIT_COLORS } from '../../constants/unitColors';
import { supabase } from '../../lib/supabaseClient';
import ScrollPickerPopup, { REPS_OPTIONS, SECONDS_OPTIONS } from '../ScrollPickerPopup';

// Stripe + border palette per exercise variant. The trainee execution
// stripe flips to green once `exercise.completed` becomes true
// (UnifiedPlanBuilder bumps that flag when every set in `setLog` is
// done — see toggleSetDone).
const VARIANT_COLORS = {
  normal:     { stripe: '#FF6F20', border: '#F0E4D0', tint: '#FFF5EE' },
  list:       { stripe: '#FF6F20', border: '#F0E4D0', tint: '#FFF5EE' },
  tabata:     { stripe: '#FF6F20', border: '#F0E4D0', tint: '#FFF5EE' },
  done:       { stripe: '#16A34A', border: '#BBF7D0', tint: '#F0FDF4' },
  pyramid:    { stripe: '#FF6F20', border: '#F0E4D0', tint: '#FFF5EE' },
  drop_set:   { stripe: '#FF6F20', border: '#F0E4D0', tint: '#FFF5EE' },
  rest_pause: { stripe: '#FF6F20', border: '#F0E4D0', tint: '#FFF5EE' },
  circuit:    { stripe: '#FF6F20', border: '#F0E4D0', tint: '#FFF5EE' },
  delorme:    { stripe: '#FF6F20', border: '#F0E4D0', tint: '#FFF5EE' },
  none:       { stripe: '#FF6F20', border: '#F0E4D0', tint: '#FFF5EE' },
  reps_new:   { stripe: '#FF6F20', border: '#F0E4D0', tint: '#FFF5EE' },
  super_set:  { stripe: '#FF6F20', border: '#F0E4D0', tint: '#FFF5EE' },
  combo:      { stripe: '#FF6F20', border: '#F0E4D0', tint: '#FFF5EE' },
};

// Phase 3 — single brand token source. All dispatchers reference
// these instead of declaring local palette constants. Done state
// gets green; everything else is brand orange.
const BRAND = {
  stripeActive:  '#FF6F20',
  stripeDone:    '#16A34A',
  stripeNeutral: '#E8E0D8',
  cardBg:        '#FFFFFF',
  cardBorder:    '#F0E4D0',
  panelBg:       '#FFF6EE',
  panelBorder:   '#F0E4D0',
  innerBorder:   '#FFE5D0',
  tagBg:         '#FFF0E4',
  tagText:       '#7A3A0F',
  textPrimary:   '#1a1a1a',
  textMuted:     '#888888',
  value:         '#FF6F20',
};

// Shared type-scale for the open exercise card. Foundation step —
// not yet applied by any variant render. Adopting variant-by-variant
// in follow-up commits.
const T = {
  name:     { fontSize: 26, fontWeight: 800, fontFamily: "'Barlow Condensed'" },
  setLabel: { fontSize: 19, color: '#777' },
  setValue: { fontSize: 32, fontWeight: 800, fontFamily: "'Barlow Condensed'" },
  hero:     { fontSize: 52, fontWeight: 800, fontFamily: "'Barlow Condensed'", lineHeight: 1 },
  heroLbl:  { fontSize: 13, color: '#a08a6a' },
  heading:  { fontSize: 15, fontWeight: 600 },
};

// Reusable full-width progress bar for the open exercise card. Pure
// presentational — caller passes the already-computed completion %
// and the method color. Foundation step — not yet wired into any
// variant.
function ProgressBar({ percent, color }) {
  const p = Math.max(0, Math.min(100, Math.round(percent || 0)));
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 8 }}>
        <span style={{ color: '#999' }}>השלמה</span>
        <span style={{ color, fontWeight: 700 }}>{p}%</span>
      </div>
      <div style={{ height: 10, borderRadius: 6, background: '#F0E0CC', overflow: 'hidden' }}>
        <div style={{ height: 10, borderRadius: 6, background: color, width: p + '%' }} />
      </div>
    </div>
  );
}

// Trainee actual-input on the active item. Placeholder shows the
// coach's target; an empty field on save is interpreted as "hit the
// target" by the upstream save logic. stopPropagation on the wrapper
// keeps row-level tap handlers (mark-done / advance) from firing
// while the trainee types. Used by NONE/REPS, PYRAMID/DROP_SET/
// DELORME, and REST_PAUSE active rows — never appears on completed
// or pending items.
function ActualInput({ target, value, unit, color = '#FF6F20', onChange }) {
  const stopProp = (e) => e.stopPropagation();
  // Base for +/− math: typed value wins, else the target, else 0.
  // Display + comparisons round to integers so chips/buttons always
  // land on whole numbers even when targets carry trailing zeros.
  const baseNum = Number(value ?? target ?? 0) || 0;
  const handleMinus = () => onChange(Math.max(0, Math.round(baseNum) - 1));
  const handlePlus = () => onChange(Math.round(baseNum) + 1);

  // Quick-pick chips: 9 numbers centered on the target (clamped at 0),
  // or 1..12 when no target was provided. Range is generated each render
  // since target rarely changes mid-set.
  const chips = (() => {
    const tNum = Number(target);
    if (target != null && Number.isFinite(tNum)) {
      const t = Math.round(tNum);
      const start = Math.max(0, t - 4);
      return Array.from({ length: 9 }, (_, i) => start + i);
    }
    return Array.from({ length: 12 }, (_, i) => i + 1);
  })();

  // What's "selected" in the strip: prefer the typed value, otherwise
  // the target. Null when neither — strip shows no selection.
  const selectedNum = value != null
    ? Math.round(Number(value))
    : (target != null ? Math.round(Number(target)) : null);
  const targetNum = target != null && Number.isFinite(Number(target))
    ? Math.round(Number(target))
    : null;

  const btnStyle = {
    width: 30,
    height: 30,
    borderRadius: 8,
    border: `1.5px solid ${color}`,
    background: `${color}15`,
    color,
    fontSize: 18,
    fontWeight: 800,
    fontFamily: 'inherit',
    cursor: 'pointer',
    lineHeight: 1,
    padding: 0,
    flexShrink: 0,
  };

  return (
    <span
      style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}
      onClick={stopProp}
    >
      {/* Row 1 — − input + unit */}
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <button
          type="button"
          onClick={(e) => { stopProp(e); handleMinus(); }}
          style={btnStyle}
        >−</button>
        <input
          type="number"
          inputMode="numeric"
          placeholder={target != null ? String(Math.round(Number(target))) : ''}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          style={{
            width: 64,
            textAlign: 'center',
            fontFamily: "'Barlow Condensed'",
            fontWeight: 800,
            fontSize: 26,
            color: '#1a1a1a',
            border: `1.5px solid ${color}`,
            borderRadius: 10,
            padding: '4px 0',
            background: '#FFFFFF',
            outline: 'none',
          }}
        />
        <button
          type="button"
          onClick={(e) => { stopProp(e); handlePlus(); }}
          style={btnStyle}
        >+</button>
        {unit && <span style={{ fontSize: 12, color: '#888' }}>{unit}</span>}
      </span>

      {/* Row 2 — horizontal quick-pick strip. width: 170 + maxWidth:100%
          so two ActualInputs side-by-side fit within typical phone
          viewports without forcing horizontal page scroll. Scrollbar
          hidden across browsers. */}
      <span
        style={{
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          padding: '4px 0',
          width: 170,
          maxWidth: '100%',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {chips.map((n) => {
          const isSelected = selectedNum != null && n === selectedNum;
          const isTarget = targetNum != null && n === targetNum;
          return (
            <button
              key={n}
              type="button"
              onClick={(e) => { stopProp(e); onChange(n); }}
              style={{
                minWidth: 34,
                height: 30,
                borderRadius: 8,
                border: isSelected
                  ? `1.5px solid ${color}`
                  : isTarget
                    ? `1.5px solid ${color}`
                    : '1px solid #E8E0D8',
                background: isSelected ? color : '#FFFFFF',
                color: isSelected ? '#FFFFFF' : '#888',
                fontSize: 15,
                fontWeight: 700,
                fontFamily: 'inherit',
                cursor: 'pointer',
                padding: 0,
                flexShrink: 0,
              }}
            >
              {n}
            </button>
          );
        })}
      </span>
    </span>
  );
}

// Catalog of method variants that share the planned_sets data shape.
// `closedLabel` of null hides the method tag chip on the closed card
// (NONE / REPS use just the numeric summary, no chip). variationRequired
// surfaces a trainee-side warning when a set's variation_name is empty.
const PLANNED_SETS_METHODS = {
  pyramid:   { label: 'פירמידה', headerText: 'סטים בפירמידה', closedLabel: 'פירמידה' },
  drop_set:  { label: 'דרופ סט', headerText: 'סטים בדרופ סט', closedLabel: 'דרופ סט', variationRequired: true },
  delorme:   { label: 'דלורם',   headerText: 'סטים בדלורם',   closedLabel: 'דלורם',   variationRequired: true },
  none:      { label: 'תרגיל',   headerText: 'סטים בתרגיל',   closedLabel: null },
  reps_new:  { label: 'חזרות',   headerText: 'סטים בתרגיל',   closedLabel: null },
};

// REST_PAUSE uses a different visual layout (horizontal mini-set
// row with rest dividers between cells, single variation band at
// top). Kept in a separate dispatch table from PLANNED_SETS_METHODS
// so the closed-card + open-card render gates can pick the right
// renderer without messing with the existing pyramid-family layout.
const HORIZONTAL_MINISETS_METHODS = {
  rest_pause: { label: 'רסט פאוז', closedLabel: 'רסט פאוז' },
};

// SUPERSET / COMBO use a rounds-based layout: vertical list of round
// cards, each carrying the same sequence of exercises with a connector
// ("ואז" for superset, "←" for combo) between adjacent exercises.
// pluralLabel renders the count headline (Hebrew counts shift form for
// 2+). topHint is a single-line strip above the round list (combo only).
const ROUNDS_METHODS = {
  super_set: {
    label: 'סופרסט',
    closedLabel: 'סופר סט',
    // Phase 3 — closed-card chip palette unified to brand orange.
    palette: {
      outer: '#FFF6EE',
      border: '#F0E4D0',
      stripe: '#FF6F20',
      text: '#7A3A0F',
      textSoft: '#7A3A0F',
    },
    roundLabel: 'סט סופר',
    pluralLabel: 'סטים סופר',
    connector: 'ואז',
    connectorStyle: 'text',
    topHint: null,
  },
  combo: {
    label: 'קומבו',
    closedLabel: 'קומבו',
    palette: {
      outer: '#FFF6EE',
      border: '#F0E4D0',
      stripe: '#FF6F20',
      text: '#7A3A0F',
      textSoft: '#7A3A0F',
    },
    roundLabel: 'חזרה',
    pluralLabel: 'חזרות',
    connector: '←',
    connectorStyle: 'arrow',
    topHint: 'רצף זורם · ללא מנוחה',
  },
};

// CIRCUIT uses a horizontal station strip + a round-progression
// indicator.
const STATIONS_METHODS = {
  circuit: {
    label: 'אימון מחזורי',
    closedLabel: 'מחזורי',
    // Phase 3 — closed-card chip palette unified to brand orange.
    palette: {
      outer: '#FFF6EE',
      border: '#F0E4D0',
      stripe: '#FF6F20',
      text: '#7A3A0F',
      textSoft: '#7A3A0F',
    },
  },
};

// Per-station type → color. Lightweight subset of UNIT_COLOR_BY_FIELD
// scoped to the two valid station types ('reps' / 'time').
const STATION_TYPE_COLORS = {
  reps: { stripe: '#D97706', tint: '#FFFBEB', textSecondary: '#92400E', label: 'חזרות' },
  time: { stripe: '#14B8A6', tint: '#F0FDFA', textSecondary: '#0F766E', label: 'שניות' },
};

// TABATA uses a "control panel" layout: rotation list + 5 clock
// stats + a launcher button. The actual clock lives in /clocks; the
// card just configures it. Detection relies on the new shape
// (exercises_in_rotation / clock_settings) so legacy tabata rows with
// only sub_exercises continue routing to the existing legacy block.
const TABATA_DEFAULT_CLOCK = {
  work_seconds: 20,
  rest_seconds: 10,
  rounds: 8,
  sets: 1,
  rest_between_sets: 60,
};
// Resolves clock settings out of tabata_data.clock_settings, falling
// back to the legacy direct columns on the exercise row, and finally
// to the defaults above. Always returns a fully-populated object.
function resolveTabataClockSettings(exercise) {
  const td = parseTabataData(exercise?.tabata_data) || {};
  const cs = (td.clock_settings && typeof td.clock_settings === 'object') ? td.clock_settings : null;
  const pick = (snakeKey, legacyCol) => {
    if (cs && Number.isFinite(cs[snakeKey])) return cs[snakeKey];
    const legacy = exercise?.[legacyCol];
    return Number.isFinite(Number(legacy)) ? Number(legacy) : TABATA_DEFAULT_CLOCK[snakeKey];
  };
  return {
    work_seconds:      pick('work_seconds',      'work_seconds'),
    rest_seconds:      pick('rest_seconds',      'rest_seconds'),
    rounds:            pick('rounds',            'rounds'),
    sets:              pick('sets',              'sets'),
    rest_between_sets: pick('rest_between_sets', 'rest_between_sets'),
  };
}
function resolveTabataRotation(exercise) {
  const td = parseTabataData(exercise?.tabata_data) || {};
  if (Array.isArray(td.exercises_in_rotation) && td.exercises_in_rotation.length > 0) {
    return td.exercises_in_rotation;
  }
  // Legacy: older tabata rows stored the rotation as sub_exercises.
  if (Array.isArray(td.sub_exercises) && td.sub_exercises.length > 0) {
    return td.sub_exercises.map((s) => ({
      name: s?.name || s?.exercise_name || s?.title || '',
    }));
  }
  return [];
}
// True when an exercise has the new tabata shape that the new renderer
// understands (any of: exercises_in_rotation array, clock_settings
// object). Legacy rows without either fall through to the old render.
function hasNewTabataShape(exercise) {
  const td = parseTabataData(exercise?.tabata_data) || {};
  return Array.isArray(td.exercises_in_rotation)
      || (td.clock_settings && typeof td.clock_settings === 'object');
}

// Per-field unit palette + Hebrew label. Drives both the closed-card
// dominant-unit display and the column tinting inside open-card rows.
const UNIT_COLOR_BY_FIELD = {
  reps:            { stripe: '#D97706', textPrimary: '#92400E', tint: '#FFFBEB', label: 'חזרות' },
  hold_seconds:    { stripe: '#14B8A6', textPrimary: '#0F766E', tint: '#F0FDFA', label: 'שניות' },
  weight_kg:       { stripe: '#7C3AED', textPrimary: '#5B21B6', tint: '#FAF5FF', label: 'ק"ג' },
  rpe:             { stripe: '#0EA5E9', textPrimary: '#075985', tint: '#F0F9FF', label: 'RPE' },
  rest_seconds:    { stripe: '#14B8A6', textPrimary: '#0F766E', tint: '#F0FDFA', label: 'מנוחה' },
  sets:            { stripe: '#6b7280', textPrimary: '#374151', tint: '#FAFAFA', label: 'סטים' },
  rounds:          { stripe: '#6b7280', textPrimary: '#374151', tint: '#FAFAFA', label: 'סבבים' },
  tempo:           { stripe: '#6b7280', textPrimary: '#374151', tint: '#FAFAFA', label: 'טמפו' },
  body_position:   { stripe: '#6b7280', textPrimary: '#374151', tint: '#FAFAFA', label: 'מנח גוף' },
  grip:            { stripe: '#6b7280', textPrimary: '#374151', tint: '#FAFAFA', label: 'אחיזה' },
  equipment:       { stripe: '#6b7280', textPrimary: '#374151', tint: '#FAFAFA', label: 'ציוד' },
  load_type:       { stripe: '#6b7280', textPrimary: '#374151', tint: '#FAFAFA', label: 'סוג עומס' },
  side:            { stripe: '#6b7280', textPrimary: '#374151', tint: '#FAFAFA', label: 'צד' },
  notes:           { stripe: '#6b7280', textPrimary: '#374151', tint: '#FAFAFA', label: 'דגשים' },
  foot_position:   { stripe: '#6b7280', textPrimary: '#374151', tint: '#FAFAFA', label: 'מנח רגליים' },
  range_of_motion: { stripe: '#6b7280', textPrimary: '#374151', tint: '#FAFAFA', label: 'טווח תנועה' },
};

// Fields with numeric input (subject to +/- counters + actual/planned
// display). Text fields render as planned-only display chips.
const NUMERIC_FIELDS = new Set([
  'reps', 'hold_seconds', 'weight_kg', 'rpe', 'rest_seconds', 'sets', 'rounds',
]);

// Default fallback when an exercise predates the set_fields convention.
// Preserves the pre-STEP-9 pyramid display (reps + seconds).
const DEFAULT_SET_FIELDS_FALLBACK = ['reps', 'hold_seconds'];

// Pull set_fields out of an exercise's tabata_data, with the fallback
// applied when the row doesn't carry one.
function getSetFields(exercise) {
  const td = parseTabataData(exercise?.tabata_data);
  if (Array.isArray(td?.set_fields) && td.set_fields.length > 0) return td.set_fields;
  return DEFAULT_SET_FIELDS_FALLBACK;
}

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
  // Phase 6 — mode-first dispatch. If the row's `mode` resolves to a
  // known method we return its variant unconditionally, regardless of
  // whether tabata_data is populated. This guarantees that a freshly
  // created exercise (mode set, no planned_sets / rounds / stations yet)
  // routes to its correct dispatcher and surfaces an empty-state
  // placeholder instead of falling through to 'normal' with a blank body.
  // Null/empty mode → NONE (ללא שיטה) regardless of data presence.
  if (exercise?.mode == null || exercise?.mode === '') {
    return 'none';
  }
  // getMethodByMode falls back to REPS when the mode string doesn't
  // match a known method; the `methodInfo.mode === exercise.mode`
  // guard keeps unknown modes flowing into the legacy container
  // detection below instead of being silently coerced to 'reps_new'.
  const methodInfo = getMethodByMode(exercise.mode);
  if (methodInfo && methodInfo.mode === exercise.mode) {
    const englishId = methodInfo.english_id;
    if (englishId === 'pyramid')       return 'pyramid';
    if (englishId === 'drop_set')      return 'drop_set';
    if (englishId === 'rest_pause')    return 'rest_pause';
    if (englishId === 'circuit')       return 'circuit';
    if (englishId === 'delorme')       return 'delorme';
    if (englishId === 'reps')          return 'reps_new';
    if (englishId === 'tabata')        return 'tabata';
    if (englishId === 'super_set')     return 'super_set';
    if (englishId === 'combo')         return 'combo';
    if (englishId === 'exercise_list') return 'list';
    if (englishId === 'none')          return 'none';
  }
  // Fallback — the row's mode is missing or a custom string but
  // tabata_data carries real sub-exercises. Treat it as a container
  // (clock+subs+toggles layout) instead of falling through to the
  // numeric-fill "normal" layout. container_type hints between
  // tabata and list when present; otherwise the presence of a
  // work/rounds prescription tilts toward tabata, else list.
  const td = parseTabataData(exercise.tabata_data);
  if (td && typeof td === 'object') {
    let hasSubs = false;
    for (const key of ['sub_exercises', 'exercises', 'items', 'children', 'block_exercises', 'list']) {
      if (Array.isArray(td[key]) && td[key].length > 0) { hasSubs = true; break; }
    }
    if (!hasSubs && Array.isArray(td.blocks)) {
      for (const b of td.blocks) {
        const inner = b?.block_exercises || b?.exercises || [];
        if (Array.isArray(inner) && inner.length > 0) { hasSubs = true; break; }
      }
    }
    if (hasSubs) {
      if (td.container_type === 'tabata') return 'tabata';
      if (td.container_type === 'list' || td.container_type === 'superset' || td.container_type === 'combo') return 'list';
      if (hasValue(td.work_time) || hasValue(td.rounds) || hasValue(td.work_seconds) ||
          hasValue(td?.clock_settings?.work_seconds) || hasValue(td?.clock_settings?.rounds)) {
        return 'tabata';
      }
      return 'list';
    }
  }
  // PlanBuilder's legacy list-variant writer drops the sub-exercise
  // array on the top-level `children` column with no `mode` and no
  // `tabata_data` populated. Detect that here so the open card runs
  // the list-coach / list-trainee branches instead of falling
  // through to the empty "normal" layout.
  const directList = exercise.children;
  if (Array.isArray(directList) && directList.length > 0) return 'list';
  if (typeof directList === 'string' && directList.trim()) {
    try {
      const parsed = JSON.parse(directList);
      if (Array.isArray(parsed) && parsed.length > 0) return 'list';
    } catch {}
  }
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
  // `children` — PlanBuilder's legacy list-variant writer (ListBuilder
  // widget). Supabase returns this either as a deserialised array or
  // as the raw JSON-text the column originally held; handle both.
  if (Array.isArray(exercise.children) && exercise.children.length) return exercise.children;
  if (typeof exercise.children === 'string' && exercise.children.trim()) {
    try {
      const parsed = JSON.parse(exercise.children);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch {}
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

// Vertical list row for the open-card body. Single RTL cell laid out
// as "<value> <unit> <descriptor>" so the row reads number-first in
// Hebrew (e.g. "8 סטים", "60 שנ׳ מנוחה", '40 ק"ג'). Previous design
// split the row into a right-label / left-value pair, which in RTL
// reading order produced "<word> <number>" — the bug this row fixes.
// `isLast` drops the bottom border so the last row sits flush against
// whatever follows it (sub-exercises list / coach note).
function ParamListRow({ value, unit, descriptor, isLast }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'baseline',
      gap: 6,
      padding: '11px 0',
      borderBottom: isLast ? 'none' : '0.5px solid #F4EDE0',
      direction: 'rtl',
    }}>
      <span style={{ fontSize: 17, fontWeight: 500, color: '#1a1a1a' }}>{value}</span>
      {unit && (
        <span style={{ fontSize: 12, fontWeight: 400, color: '#888' }}>{unit}</span>
      )}
      {descriptor && (
        <span style={{ fontSize: 14, color: '#888' }}>{descriptor}</span>
      )}
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
        fontFamily: "'Bebas Neue', sans-serif",
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
        flexShrink: 0, fontFamily: "'Bebas Neue', sans-serif",
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

// ── Tempo display helper ──────────────────────────────────────────
// Tempo is stored as a 4-digit string (e.g. "3010"): eccentric →
// pause-at-bottom → concentric → pause-at-top. Display: row of 4
// labeled cells per set instead of the bare "3010" chip the generic
// text-field renderer would produce.
const TEMPO_LABELS = ['ירידה', 'החזקה למטה', 'עליה', 'החזקה למעלה'];

function parseTempo(t) {
  const s = String(t ?? '').replace(/\D/g, '').padEnd(4, '·').slice(0, 4);
  return [s[0], s[1], s[2], s[3]];
}

// Phase 3 — small centered section label. Introduces each
// logical group inside an open card body (תרגילים / רוטציה /
// שעון / תחנות / סבבים / פרטים / יעד / מיני-סטים).
function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 9.5,
      color: '#888888',
      fontWeight: 800,
      letterSpacing: 0.6,
      textAlign: 'center',
      marginBottom: 7,
    }}>
      {children}
    </div>
  );
}

// Phase 4 — closed-card summary text by variant.
// Returns the short status line shown under the exercise name in
// the closed card. Each method describes its own rhythm. Returns
// null for basic / reps_new / none / normal so the existing generic
// chip row continues to handle the fallback case.
function buildClosedSummary(exercise, variant) {
  const td = parseTabataData(exercise?.tabata_data) || {};
  const mc = (td.method_config && typeof td.method_config === 'object') ? td.method_config : {};
  const plannedSets = Array.isArray(td.planned_sets) ? td.planned_sets : [];
  const rounds = Array.isArray(td.rounds) ? td.rounds : [];
  const subExercises = Array.isArray(td.sub_exercises) ? td.sub_exercises : [];
  const stations = Array.isArray(td.stations) ? td.stations : [];
  const rotation = Array.isArray(td.exercises_in_rotation)
    ? td.exercises_in_rotation
    : (Array.isArray(td.rotation) ? td.rotation : []);
  const cs = (td.clock_settings && typeof td.clock_settings === 'object') ? td.clock_settings : {};

  if (variant === 'super_set') {
    const r = Number.isFinite(mc.rounds) ? mc.rounds : (rounds.length || 0);
    const k = subExercises.length || (rounds[0]?.exercises?.length || 0);
    return `${r} סבבים · ${k} תרגילים`;
  }
  if (variant === 'combo') {
    const r = Number.isFinite(mc.rounds) ? mc.rounds : (rounds.length || 0);
    const k = subExercises.length || (rounds[0]?.exercises?.length || 0);
    return `${r} סבבים · ${k} תנועות`;
  }
  if (variant === 'tabata') {
    const work = cs.work_seconds ?? mc.work_seconds ?? exercise?.work_seconds ?? '';
    const rest = cs.rest_seconds ?? mc.rest_seconds ?? exercise?.rest_seconds ?? '';
    const rnds = cs.rounds ?? mc.rounds ?? exercise?.rounds ?? '';
    const k = rotation.length || subExercises.length;
    return `${rnds} סבבים × ${work}/${rest} ש׳ · ${k} תרגילים`;
  }
  if (variant === 'circuit') {
    const r = Number.isFinite(mc.rounds) ? mc.rounds : 0;
    const k = stations.length;
    return `${r} סבבים · ${k} תחנות`;
  }
  if (variant === 'rest_pause') {
    const k = plannedSets.length;
    const target = mc.target_reps ?? mc.total_reps ?? '';
    return target ? `${k} מיני-סטים · יעד ${target} חזרות` : `${k} מיני-סטים`;
  }
  if (variant === 'pyramid') {
    const n = plannedSets.length;
    return `${n} סטים · פירמידה`;
  }
  if (variant === 'drop_set') {
    const n = plannedSets.length;
    return `${n} סטים · ירידה`;
  }
  if (variant === 'delorme') {
    const n = plannedSets.length;
    return `${n} סטים · דה-לורם`;
  }
  return null;
}

// Phase 4 — preview line for multi-element methods. Shows the
// actual inner names so the user knows what's inside without
// opening the card. Returns null when no preview makes sense.
function buildClosedPreview(exercise, variant) {
  const td = parseTabataData(exercise?.tabata_data) || {};
  const subExercises = Array.isArray(td.sub_exercises) ? td.sub_exercises : [];
  const stations = Array.isArray(td.stations) ? td.stations : [];
  const rotation = Array.isArray(td.exercises_in_rotation)
    ? td.exercises_in_rotation
    : (Array.isArray(td.rotation) ? td.rotation : []);
  const nameOf = (item) => (item?.name || item?.exerciseName || '—');

  let items = null;
  if (variant === 'super_set' && subExercises.length) items = subExercises.map(nameOf);
  if (variant === 'combo'     && subExercises.length) items = subExercises.map(nameOf);
  if (variant === 'tabata'    && rotation.length)     items = rotation.map(nameOf);
  if (variant === 'circuit'   && stations.length)     items = stations.map(nameOf);
  if (!items) return null;
  return items.join(' · ');
}

// Phase 6 — shared empty-state placeholder for every method dispatcher.
// Fires when the data array that the dispatcher renders (planned_sets /
// rounds / stations / mini-sets / rotation) is empty, so a freshly
// created exercise surfaces a clear "edit me via ⚙️" cue instead of a
// blank open card. Branded chrome matches BRAND.panelBg / panelBorder.
function EmptyMethodPlaceholder({ headline }) {
  return (
    <div dir="rtl" style={{
      background: BRAND.panelBg,
      border: `1px solid ${BRAND.panelBorder}`,
      borderRadius: 10,
      padding: '14px 12px',
      textAlign: 'center',
      marginBottom: 8,
    }}>
      <div style={{ fontSize: 12, color: BRAND.tagText, fontWeight: 700, lineHeight: 1.5 }}>
        {headline}
      </div>
      <div style={{ fontSize: 10, color: BRAND.textMuted, marginTop: 4, fontWeight: 500 }}>
        לעריכה לחץ על האייקון ⚙️
      </div>
    </div>
  );
}

function TempoBreakdown({ tempo }) {
  if (tempo == null || String(tempo).trim() === '') return null;
  const digits = parseTempo(tempo);
  return (
    <div
      dir="rtl"
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr 1fr',
        gap: 4,
        marginTop: 6,
        width: '100%',
      }}
    >
      {TEMPO_LABELS.map((label, i) => (
        <div key={i} style={{
          background: '#FFF6EE',
          border: '1px solid #FFE5D0',
          borderRadius: 7,
          padding: '5px 3px',
          textAlign: 'center',
          minHeight: 38,
        }}>
          <div style={{
            fontSize: 9,
            color: '#7A3A0F',
            fontWeight: 700,
            lineHeight: 1.1,
          }}>{label}</div>
          <div style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 17,
            color: '#FF6F20',
            fontWeight: 900,
            lineHeight: 1,
            marginTop: 3,
          }}>{digits[i]}</div>
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────

export default function ExerciseCard({
  exercise,
  // 1-based position of this exercise inside its section. Drives the
  // orange index square on the header band. SectionCard passes it from
  // the .map() iteration; absent → square is hidden.
  exerciseIndex,
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
  onSetLogChange,
  onSetToggleDone,
  // Single rep-based exercise picker write path (step 1).
  onSetValueChange,
  // Per-drill-per-set state for list-variant exercises. Each cell is
  // a boolean inside drillSetLog[setIdx][drillIdx]. Local-state only —
  // not persisted to exercise_set_logs (no drill_index column).
  drillSetLog,
  onDrillSetToggleDone,
  // Optional parent-controlled expand state. When both `expanded` and
  // `onToggleExpanded` are provided, the card is fully controlled by
  // the parent (used by the workout views to enforce one-open-at-a-
  // time across sections). When either is missing, the card falls back
  // to its own useState so any caller that hasn't opted in keeps the
  // legacy independent-expand behavior.
  expanded: externalExpanded,
  onToggleExpanded,
  // Inherits the parent section's tracking mode. 'full' (default)
  // keeps the existing set-fill UX and derived status pill. 'display'
  // means the trainee just reads the card — no fill rows, no live
  // status math, just the "תצוגה" indicator.
  sectionTrackingMode = 'full',
  // Per-set previous + record lookup for THIS exercise. Shape:
  //   { [setIdx]: { previous_reps, record_reps, previous_time, record_time } }
  // Provided by the parent (UnifiedPlanBuilder → SectionCard) only on
  // the trainee path; null/missing on coach + display-mode + first-
  // ever performance, in which case the indicators silently omit.
  previousSetData = null,
}) {
  const queryClient = useQueryClient();
  // Tabata launch hands cfg → ActiveTimerContext.pendingTabataCfg,
  // then opens the TabataTimer overlay on its SETTINGS screen so the
  // trainee verifies + sets prep-time, instead of jumping straight to
  // a running timer.
  const activeTimer = useActiveTimer();
  const clock = useClock();
  const navigate = useNavigate();
  const [launchingClock, setLaunchingClock] = useState(false);
  // Controlled-or-internal expand. If the parent passes both
  // `externalExpanded` and `onToggleExpanded`, every existing
  // setExpanded(...) call site routes through the parent toggle —
  // which makes the parent's expandedExerciseId the single source of
  // truth and implicitly collapses any sibling card on a new open.
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpandControlled = externalExpanded !== undefined && typeof onToggleExpanded === 'function';
  const expanded = isExpandControlled ? !!externalExpanded : internalExpanded;
  // The toggle is "atomic" in controlled mode — the parent decides
  // the new value regardless of what the caller passes. All current
  // call sites are either `setExpanded(v => !v)` (toggle) or
  // `setExpanded(false)` (close while expanded === true), both of
  // which map cleanly onto a single onToggleExpanded() call.
  const setExpanded = isExpandControlled
    ? () => onToggleExpanded()
    : setInternalExpanded;
  // Register a smart-back close: when this card is expanded, the
  // header's back button collapses it first instead of navigating
  // away from the page. Works in both modes because `expanded` and
  // `setExpanded` already resolve to the active source.
  useSmartBackHandler(expanded, () => setExpanded(false));
  const [renaming, setRenaming] = useState(false);
  // 3-dot actions menu (ערוך / שכפל / מחק). Mirrors the sub-exercise
  // menu pattern from ModernExerciseForm (a5bd5d1) — closes on outside
  // tap, item tap, or trigger re-tap. The popover renders via a portal
  // into document.body because the outer card uses overflow:'hidden'
  // (needed for borderRadius clipping of the right-rail), and an
  // absolute-positioned child can't escape that. Anchor coords are
  // captured on the trigger's onClick from the button's bounding rect.
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [actionsMenuAnchor, setActionsMenuAnchor] = useState(null);

  // Pyramid open-card live state — actuals are persisted to
  // exercise_set_logs via the loadActualsForExercise / saveSetActual
  // helpers in src/lib/plannedSets.js. The map is keyed 1-based by
  // set_number so it mirrors the DB shape directly.
  //   pyramidActuals[1] = { reps, hold_seconds, weight_kg, completed }
  // pyramidActiveIdx is 0-based — converted on read/write.
  const [pyramidActiveIdx, setPyramidActiveIdx] = useState(0);
  const [pyramidActuals, setPyramidActuals] = useState({});
  const [pyramidSaving, setPyramidSaving] = useState(false);
  const [pyramidExecutionId, setPyramidExecutionId] = useState(null);

  // NOTE: the two pyramid effects that depend on `variant` are
  // declared AFTER `const variant = getVariant(exercise)` (below). If
  // they sit here, the deps array `[variant, ...]` triggers a TDZ
  // ReferenceError at render time because variant is a `const` not
  // yet initialised. Keep that ordering.

  // Increment/decrement a counter for the active set. setIdx arrives
  // 0-based; the map is 1-based to match exercise_set_logs.set_number.
  const updateActual = (setIdx, key, delta) => {
    setPyramidActuals((prev) => {
      const oneBased = setIdx + 1;
      const curr = prev[oneBased] || {};
      const newVal = Math.max(0, (curr[key] ?? 0) + delta);
      return { ...prev, [oneBased]: { ...curr, [key]: newVal } };
    });
  };

  // Persist the active set + advance. Writes to exercise_set_logs via
  // upsert (no duplicate rows if the trainee taps שמור twice). On
  // failure we bail without advancing so the trainee can retry.
  const onSaveAndAdvance = async () => {
    if (!pyramidExecutionId || !exercise?.id) {
      console.warn('[pyramid] no executionId — cannot persist');
      alert('עוד אין סשן פעיל — פתח את האימון מחדש ונסה שוב');
      return;
    }
    const oneBased = pyramidActiveIdx + 1;
    const staged = pyramidActuals[oneBased] || {};
    // Empty inputs at save time → fall back to the planned target
    // ("tap once to accept the target" UX). Typed values override.
    const planned = parsePlannedSets(exercise)[pyramidActiveIdx] || {};
    const payload = {
      reps:         staged.reps         != null ? staged.reps         : (planned.reps         ?? null),
      weight_kg:    staged.weight_kg    != null ? staged.weight_kg    : (planned.weight_kg    ?? null),
      hold_seconds: staged.hold_seconds != null ? staged.hold_seconds : (planned.hold_seconds ?? null),
    };
    setPyramidSaving(true);
    // drillIndex=0 — pyramid/drop_set/delorme/rest_pause are single-
    // exercise methods, every row lives on drill 0.
    const { error } = await saveSetActual(
      supabase,
      pyramidExecutionId,
      exercise.id,
      0,
      oneBased,
      payload
    );
    setPyramidSaving(false);
    if (error) {
      console.error('[pyramid] saveSetActual failed', error);
      alert('שמירה נכשלה — נסה שוב');
      return;
    }
    setPyramidActuals((prev) => ({
      ...prev,
      [oneBased]: { ...prev[oneBased], completed: true },
    }));
    setPyramidActiveIdx((idx) => idx + 1);
  };

  // SUPERSET / COMBO round-completion. Reuses saveSetActual keyed by
  // round_index — writes reps_completed = 1 as a "round done" marker.
  // Hydration derives activeRoundIdx from pyramidActuals so a refresh
  // resumes on the next undone round.
  const onCompleteRound = async (roundIndex) => {
    if (!pyramidExecutionId || !exercise?.id) {
      console.warn('[rounds] no executionId — cannot persist');
      alert('עוד אין סשן פעיל — פתח את האימון מחדש ונסה שוב');
      return;
    }
    setPyramidSaving(true);
    // drillIndex=0 — round-completion marker is still keyed at the
    // exercise level (no per-inner numbers yet); UI will start writing
    // per-inner drill indices in a later step.
    const { error } = await saveSetActual(
      supabase,
      pyramidExecutionId,
      exercise.id,
      0,
      roundIndex,
      { reps: 1 }
    );
    setPyramidSaving(false);
    if (error) {
      console.error('[rounds] saveSetActual failed', error);
      alert('שמירה נכשלה — נסה שוב');
      return;
    }
    setPyramidActuals((prev) => ({
      ...prev,
      [roundIndex]: { ...prev[roundIndex], reps: 1, completed: true },
    }));
  };

  // SUPERSET / COMBO per-inner-per-round fill saver. drillIdx is the
  // inner-exercise index inside td.rounds[*].exercises; setIdx is the
  // round number (1-based) → maps directly to the (drill_index,
  // set_number) key the DB unique index expects. mode picks reps vs
  // hold_seconds in the payload so the right column on exercise_set_logs
  // gets written.
  const onRoundsFillSave = async (drillIdx, setIdx, value, mode) => {
    if (!pyramidExecutionId || !exercise?.id) {
      console.warn('[rounds-fill] no executionId — cannot persist');
      alert('עוד אין סשן פעיל — פתח את האימון מחדש ונסה שוב');
      return;
    }
    const payload = mode === 'seconds'
      ? { hold_seconds: value }
      : { reps: value };
    setRoundsSaving(true);
    const { error } = await saveSetActual(
      supabase,
      pyramidExecutionId,
      exercise.id,
      drillIdx,
      setIdx,
      payload,
    );
    setRoundsSaving(false);
    if (error) {
      console.error('[rounds-fill] saveSetActual failed', error);
      alert('שמירה נכשלה — נסה שוב');
      return;
    }
    setRoundsActuals((prev) => {
      const drillMap = prev[drillIdx] ? { ...prev[drillIdx] } : {};
      drillMap[setIdx] = {
        ...(drillMap[setIdx] || {}),
        ...payload,
        completed: true,
      };
      return { ...prev, [drillIdx]: drillMap };
    });
    setRoundsPickerState(null);
  };

  // TABATA launcher — hands the rotation + clock settings to the
  // global Clock context, then navigates to /clocks so the trainee
  // sees the running timer. Defensive against a missing useClock
  // (e.g. if this card renders outside the ClockProvider tree).
  const handleLaunchTabata = async () => {
    if (!clock?.startTabata) {
      console.error('[ExerciseCard] startTabata unavailable — missing ClockProvider?');
      alert('לא ניתן להפעיל שעון — אנא רענן את הדף ונסה שוב.');
      return;
    }
    setLaunchingClock(true);
    try {
      const settings = resolveTabataClockSettings(exercise);
      const rotation = resolveTabataRotation(exercise);
      clock.startTabata({
        work_seconds: settings.work_seconds,
        rest_seconds: settings.rest_seconds,
        rounds: settings.rounds,
        sets: settings.sets,
        rest_between_sets: settings.rest_between_sets,
        exercises_in_rotation: rotation,
      });
      navigate('/clocks');
    } catch (err) {
      console.error('[ExerciseCard] Failed to launch tabata', err);
      alert(`לא ניתן להפעיל שעון: ${err?.message ?? 'שגיאה'}`);
    } finally {
      setLaunchingClock(false);
    }
  };

  const actionsMenuRef = useRef(null);        // trigger wrapper
  const actionsPopoverRef = useRef(null);     // portalled popover
  useEffect(() => {
    if (!actionsMenuOpen) return undefined;
    const handler = (e) => {
      if (actionsMenuRef.current && actionsMenuRef.current.contains(e.target)) return;
      if (actionsPopoverRef.current && actionsPopoverRef.current.contains(e.target)) return;
      setActionsMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [actionsMenuOpen]);

  if (!exercise) return null;

  // Resolve the run-mode: explicit `mode` prop wins, else fall back
  // to `canEdit` (the prop SectionCard passes in today).
  const resolvedMode = mode || (canEdit ? 'coach' : 'trainee');
  const isCoachMode = resolvedMode === 'coach';

  const variant = getVariant(exercise);
  const completed = !!exercise.completed;
  const colors = completed ? VARIANT_COLORS.done : VARIANT_COLORS[variant];

  // Resolve the current in-progress execution id by mirroring the
  // query in UnifiedPlanBuilder.loadActiveExecution (line ~459). Same
  // calendar-day window so a workout repeated tomorrow uses a fresh
  // row, and the same trainee derivation (assigned_to OR created_by)
  // so both coach-as-trainee and assigned-trainee paths resolve.
  // Placed AFTER `const variant` so the [variant, ...] deps array
  // doesn't TDZ-throw on render.
  // TODO(step-execution-context): when an executionId prop is added
  // to ExerciseCard (currently SectionCard does not pass it down),
  // prefer the prop and skip this query.
  useEffect(() => {
    if (!PLANNED_SETS_METHODS[variant] && !HORIZONTAL_MINISETS_METHODS[variant] && !ROUNDS_METHODS[variant] && !STATIONS_METHODS[variant]) return;
    if (!exercise?.id || !plan?.id) return;
    const traineeId = plan.assigned_to || plan.created_by;
    if (!traineeId) return;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('workout_executions')
        .select('id')
        .eq('plan_id', plan.id)
        .eq('trainee_id', traineeId)
        .gte('executed_at', todayStart.toISOString())
        .order('executed_at', { ascending: false })
        .limit(1);
      if (cancelled) return;
      if (!error && Array.isArray(data) && data.length > 0) {
        setPyramidExecutionId(data[0].id);
      } else {
        setPyramidExecutionId(null);
      }
    })();
    return () => { cancelled = true; };
  }, [variant, exercise?.id, plan?.id, plan?.assigned_to, plan?.created_by]);

  // Load persisted actuals once we have an executionId. Also computes
  // the first incomplete set so the trainee resumes on the right row
  // after a page refresh.
  useEffect(() => {
    if (!PLANNED_SETS_METHODS[variant] && !HORIZONTAL_MINISETS_METHODS[variant] && !ROUNDS_METHODS[variant] && !STATIONS_METHODS[variant]) return;
    if (!pyramidExecutionId || !exercise?.id) return;
    let cancelled = false;
    loadActualsForExercise(supabase, pyramidExecutionId, exercise.id).then((map) => {
      if (cancelled) return;
      setPyramidActuals(map);
      const plannedCount = parsePlannedSets(exercise).length;
      let firstIncomplete = plannedCount;
      for (let i = 0; i < plannedCount; i++) {
        if (!map[i + 1]?.completed) { firstIncomplete = i; break; }
      }
      setPyramidActiveIdx(firstIncomplete);
    });
    return () => { cancelled = true; };
  }, [variant, pyramidExecutionId, exercise?.id]);

  // SUPERSET / COMBO / CIRCUIT / TABATA — hydrate per-inner-per-round
  // actuals. drill_index = inner-exercise / station / rotation-exercise
  // index, set_number = round / cycle (1-based). One round-trip pulls
  // every drill at once via loadActualsByDrillForExercise. Tabata reuses
  // the same state shape (roundsActuals) — a rotation exercise that the
  // trainee cycles N times is structurally identical to a station with
  // N rounds from the fill perspective.
  useEffect(() => {
    if (!ROUNDS_METHODS[variant] && !STATIONS_METHODS[variant] && variant !== 'tabata') return;
    if (!pyramidExecutionId || !exercise?.id) return;
    let cancelled = false;
    loadActualsByDrillForExercise(supabase, pyramidExecutionId, exercise.id).then((byDrill) => {
      if (cancelled) return;
      setRoundsActuals(byDrill);
    });
    return () => { cancelled = true; };
  }, [variant, pyramidExecutionId, exercise?.id]);

  const name = exercise.exercise_name || exercise.name || 'תרגיל';
  const td = parseTabataData(exercise.tabata_data);
  const subExercises = getSubExercises(exercise);
  const description = exercise.description || exercise.notes || exercise.coach_notes || null;

  // Single source of truth for the param items rendered on this card.
  // Returns an ordered array where each entry has:
  //   key   — stable identifier (param column name)
  //   value      — the numeric/string value as a plain string
  //   unit       — optional unit suffix (שנ' / ק"ג ...)
  //   descriptor — optional Hebrew noun that clarifies which param this is
  //   display    — single canonical "<value> <unit> <descriptor>" string,
  //                shared by the closed-card pills, the open-card row, and
  //                any summary surface — so all three read identically and
  //                always number-first in Hebrew RTL.
  // Only filled params are returned — skipping happens here, callers
  // just map. Order is the spec'd "timer params first, body params
  // after" sequence and is identical for both the pills and the
  // expanded list rows.
  // Renamed from buildParamItems → buildParamItemsFor so we can call it
  // for any exercise-shaped object (parent or a sub-exercise inside a
  // list/tabata container). Defaults preserve the original behavior
  // when called with no args.
  const buildParamItemsFor = (src = exercise, srcTd = td) => {
    const cs = srcTd?.clock_settings || null;
    const items = [];

    // Compose number-first Hebrew: "<value> <unit> <descriptor>".
    // Drops null/empty pieces so a unit-less row reads as just
    // "<value> <descriptor>" and a descriptor-less row reads as
    // "<value> <unit>". One source of truth for every surface.
    const fmt = (v, u, d) => [v, u, d].filter(Boolean).join(' ');

    const workSec = toSeconds(cs?.work_seconds ?? src.work_time);
    if (workSec != null) {
      const value = String(workSec), unit = 'שנ\'', descriptor = 'עבודה';
      items.push({ key: 'work_time', value, unit, descriptor, display: fmt(value, unit, descriptor) });
    }

    const restSec = toSeconds(cs?.rest_seconds ?? src.rest_time);
    if (restSec != null) {
      const value = String(restSec), unit = 'שנ\'', descriptor = 'מנוחה';
      items.push({ key: 'rest_time', value, unit, descriptor, display: fmt(value, unit, descriptor) });
    }

    const roundsVal = cs?.rounds ?? src.rounds;
    if (hasValue(roundsVal)) {
      const value = String(roundsVal), descriptor = 'סבבים';
      items.push({ key: 'rounds', value, unit: null, descriptor, display: fmt(value, null, descriptor) });
    }

    const setsVal = cs?.sets ?? src.sets;
    if (hasValue(setsVal)) {
      const value = String(setsVal), descriptor = 'סטים';
      items.push({ key: 'sets', value, unit: null, descriptor, display: fmt(value, null, descriptor) });
    }

    // rest_between_sets — no DB column; from clock_settings or legacy
    // top-level tabata_data.
    const rbsSec = toSeconds(cs?.rest_between_sets ?? srcTd?.rest_between_sets ?? src.rest_between_sets);
    if (rbsSec != null) {
      const value = String(rbsSec), unit = 'שנ\'', descriptor = 'בין סטים';
      items.push({ key: 'rest_between_sets', value, unit, descriptor, display: fmt(value, unit, descriptor) });
    }

    const rbeSec = toSeconds(src.rest_between_exercises);
    if (rbeSec != null) {
      const value = String(rbeSec), unit = 'שנ\'', descriptor = 'בין תרגילים';
      items.push({ key: 'rest_between_exercises', value, unit, descriptor, display: fmt(value, unit, descriptor) });
    }

    if (hasValue(src.reps)) {
      const value = String(src.reps), descriptor = 'חזרות';
      items.push({ key: 'reps', value, unit: null, descriptor, display: fmt(value, null, descriptor) });
    }

    if (hasValue(src.weight)) {
      const value = String(src.weight), unit = 'ק"ג';
      items.push({ key: 'weight', value, unit, descriptor: null, display: fmt(value, unit, null) });
    }

    const shtSec = toSeconds(src.static_hold_time);
    if (shtSec != null) {
      const value = String(shtSec), unit = 'שנ\'', descriptor = 'החזקה';
      items.push({ key: 'static_hold_time', value, unit, descriptor, display: fmt(value, unit, descriptor) });
    }

    if (hasValue(src.rpe)) {
      const value = String(src.rpe), descriptor = 'RPE';
      items.push({ key: 'rpe', value, unit: null, descriptor, display: fmt(value, null, descriptor) });
    }

    if (hasValue(src.tempo)) {
      const value = String(src.tempo), descriptor = 'טמפו';
      items.push({ key: 'tempo', value, unit: null, descriptor, display: fmt(value, null, descriptor) });
    }

    return items;
  };

  const paramItems = buildParamItemsFor();

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

    const bits = paramItems.map((it) => it.display);
    if (variant === 'list') {
      const count = subExercises.length;
      if (count > 0) {
        bits.push(`${count} תרגילים`);
        bits.push('סופרסט');
      }
    }
    return bits;
  })();

  // Pyramid closed-card summary — renders the planned per-set
  // progression inline ("5 סטים · 5→7→9→7→5 שניות"). Dominant unit
  // priority: hold_seconds → reps → weight_kg. Empty plannedSets fall
  // back to a gray "פירמידה · ללא סטים מוגדרים" placeholder. Returns
  // null for non-pyramid variants so the existing summaryPills row
  // still owns rendering for everything else.
  // Closed-card progression summary — shared by all PLANNED_SETS_METHODS
  // variants. Dominant unit comes from set_fields[0] when available
  // (the coach's first explicit pick wins); otherwise falls back to the
  // hold_seconds → reps → weight_kg priority for pre-STEP-9 rows.
  // Variants with closedLabel: null (none / reps_new) omit the method
  // tag chip and show numbers only.
  const pyramidSummary = (() => {
    const methodMeta = PLANNED_SETS_METHODS[variant];
    if (!methodMeta) return null;
    const plannedSets = parsePlannedSets(exercise);
    if (plannedSets.length === 0) {
      // Phase 6 — for variant='none' (mode null/empty) we surface the
      // "ללא שיטה" tag so the closed card carries a method indicator
      // even before sets are defined. Other variants keep their label.
      const emptyLabel = variant === 'none' ? 'ללא שיטה' : methodMeta.label;
      return (
        <div dir="rtl" style={{
          marginTop: 5,
          fontSize: 12,
          color: '#9CA3AF',
          fontWeight: 500,
        }}>
          {emptyLabel} · ללא סטים מוגדרים
        </div>
      );
    }
    const setFields = getSetFields(exercise);
    // Prefer the coach's first numeric field; otherwise fall back to
    // any numeric field present in the rows; otherwise the legacy
    // priority over hold_seconds → reps → weight_kg.
    let dominantKey = setFields.find((f) => NUMERIC_FIELDS.has(f) && UNIT_COLOR_BY_FIELD[f]);
    if (!dominantKey) {
      dominantKey =
        plannedSets.some(s => s.hold_seconds != null) ? 'hold_seconds' :
        plannedSets.some(s => s.reps != null)         ? 'reps' :
        plannedSets.some(s => s.weight_kg != null)    ? 'weight_kg' :
                                                        'reps';
    }
    const unitLabelText = UNIT_COLOR_BY_FIELD[dominantKey]?.label ?? '';
    const progressionString = plannedSets
      .map(s => s[dominantKey] ?? '?')
      .join('→');
    const accentColor = (VARIANT_COLORS[variant] || VARIANT_COLORS.pyramid).stripe;
    const numStyle = {
      fontFamily: "'Bebas Neue', sans-serif",
      fontSize: 16,
      color: accentColor,
      lineHeight: 1,
    };
    const wordStyle = {
      fontSize: 10,
      color: '#6B7280',
      fontWeight: 600,
    };
    // Phase 6 — variant='none' (mode is null/empty) now surfaces a
    // "ללא שיטה" chip instead of hiding the tag entirely, so the closed
    // card always tells the user which method drives the row.
    const tagLabel = methodMeta.closedLabel || (variant === 'none' ? 'ללא שיטה' : null);
    return (
      <div dir="rtl" style={{
        marginTop: 5,
        display: 'flex',
        alignItems: 'baseline',
        flexWrap: 'wrap',
        gap: 6,
      }}>
        <span style={numStyle}>{plannedSets.length}</span>
        <span style={wordStyle}>סטים</span>
        <span style={{ color: '#D1D5DB' }}>·</span>
        <span style={numStyle}>{progressionString}</span>
        <span style={wordStyle}>{unitLabelText}</span>
        {tagLabel && (
          <>
            <span style={{ color: '#D1D5DB' }}>·</span>
            <span style={{
              fontSize: 10,
              color: accentColor,
              fontWeight: 700,
              background: (VARIANT_COLORS[variant] || VARIANT_COLORS.pyramid).tint,
              border: `1px solid ${(VARIANT_COLORS[variant] || VARIANT_COLORS.pyramid).border}`,
              padding: '2px 8px',
              borderRadius: 999,
            }}>
              {tagLabel}
            </span>
          </>
        )}
      </div>
    );
  })();

  // REST_PAUSE closed-card summary — two lines (numbers above the
  // small variation + rest band) so the coach can scan the protocol
  // without opening the card. Dominant unit follows the same priority
  // as pyramidSummary but the label says "מיני-סטים" instead of
  // "סטים".
  const restPauseSummary = (() => {
    if (!HORIZONTAL_MINISETS_METHODS[variant]) return null;
    const methodMeta = HORIZONTAL_MINISETS_METHODS[variant];
    const plannedSets = parsePlannedSets(exercise);
    if (plannedSets.length === 0) {
      return (
        <div dir="rtl" style={{
          marginTop: 5,
          fontSize: 12,
          color: '#9CA3AF',
          fontWeight: 500,
        }}>
          {methodMeta.label} · ללא מיני-סטים
        </div>
      );
    }
    const setFields = getSetFields(exercise);
    let dominantKey = setFields.find((f) => NUMERIC_FIELDS.has(f) && UNIT_COLOR_BY_FIELD[f]);
    if (!dominantKey) {
      dominantKey =
        plannedSets.some(s => s.hold_seconds != null) ? 'hold_seconds' :
        plannedSets.some(s => s.reps != null)         ? 'reps' :
        plannedSets.some(s => s.weight_kg != null)    ? 'weight_kg' :
                                                        'reps';
    }
    const unitLabelText = UNIT_COLOR_BY_FIELD[dominantKey]?.label ?? '';
    const progressionString = plannedSets.map(s => s[dominantKey] ?? '?').join('→');
    const accentColor = VARIANT_COLORS.rest_pause.stripe;
    const td = parseTabataData(exercise?.tabata_data) || {};
    const methodConfig = (td.method_config && typeof td.method_config === 'object') ? td.method_config : {};
    const variationName = methodConfig.variation_name;
    const restSeconds = methodConfig.rest_seconds ?? 15;
    const numStyle = {
      fontFamily: "'Bebas Neue', sans-serif",
      fontSize: 16,
      color: accentColor,
      lineHeight: 1,
    };
    const wordStyle = {
      fontSize: 10,
      color: '#6B7280',
      fontWeight: 600,
    };
    return (
      <div dir="rtl" style={{ marginTop: 5 }}>
        <div style={{
          display: 'flex',
          alignItems: 'baseline',
          flexWrap: 'wrap',
          gap: 6,
        }}>
          <span style={numStyle}>{plannedSets.length}</span>
          <span style={wordStyle}>מיני-סטים</span>
          <span style={{ color: '#D1D5DB' }}>·</span>
          <span style={numStyle}>{progressionString}</span>
          <span style={wordStyle}>{unitLabelText}</span>
          <span style={{ color: '#D1D5DB' }}>·</span>
          <span style={{
            fontSize: 10,
            color: accentColor,
            fontWeight: 700,
            background: VARIANT_COLORS.rest_pause.tint,
            border: `1px solid ${VARIANT_COLORS.rest_pause.border}`,
            padding: '2px 8px',
            borderRadius: 999,
          }}>
            {methodMeta.closedLabel}
          </span>
        </div>
        <div style={{
          fontSize: 10,
          color: '#9CA3AF',
          fontWeight: 500,
          marginTop: 3,
        }}>
          {variationName || 'ללא וריאציה'} · {restSeconds} שניות מנוחה
        </div>
      </div>
    );
  })();

  // SUPERSET / COMBO closed-card summary — two lines: count of rounds
  // + list of exercise names from the first round (the sequence is the
  // same across rounds, so rounds[0].exercises is the canonical preview).
  // Method tag chip uses the variant's closedLabel + palette.
  const roundsSummary = (() => {
    if (!ROUNDS_METHODS[variant]) return null;
    const methodMeta = ROUNDS_METHODS[variant];
    const td = parseTabataData(exercise?.tabata_data) || {};
    const rounds = Array.isArray(td.rounds) ? td.rounds : [];
    if (rounds.length === 0) {
      return (
        <div dir="rtl" style={{
          marginTop: 5,
          fontSize: 12,
          color: '#9CA3AF',
          fontWeight: 500,
        }}>
          {methodMeta.label} · אין סבבים מוגדרים
        </div>
      );
    }
    const firstRoundExercises = Array.isArray(rounds[0]?.exercises) ? rounds[0].exercises : [];
    const exerciseNames = firstRoundExercises
      .map((e) => (e?.name || '').trim())
      .filter(Boolean);
    const accent = methodMeta.palette.stripe;
    const tintBg = methodMeta.palette.outer;
    const tintBorder = methodMeta.palette.border;
    const countLabel = rounds.length === 1 ? methodMeta.roundLabel : methodMeta.pluralLabel;
    const exCountLabel = exerciseNames.length === 1 ? 'תרגיל' : 'תרגילים';
    const numStyle = {
      fontFamily: "'Bebas Neue', sans-serif",
      fontSize: 16,
      color: accent,
      lineHeight: 1,
    };
    const wordStyle = {
      fontSize: 10,
      color: '#6B7280',
      fontWeight: 600,
    };
    return (
      <div dir="rtl" style={{ marginTop: 5 }}>
        <div style={{
          display: 'flex',
          alignItems: 'baseline',
          flexWrap: 'wrap',
          gap: 6,
        }}>
          <span style={numStyle}>{rounds.length}</span>
          <span style={wordStyle}>{countLabel}</span>
          <span style={{ color: '#D1D5DB' }}>·</span>
          <span style={{
            fontSize: 10,
            color: accent,
            fontWeight: 700,
            background: tintBg,
            border: `1px solid ${tintBorder}`,
            padding: '2px 8px',
            borderRadius: 999,
          }}>
            {methodMeta.closedLabel}
          </span>
        </div>
        {exerciseNames.length > 0 && (
          <div style={{
            fontSize: 10,
            color: '#9CA3AF',
            fontWeight: 500,
            marginTop: 3,
          }}>
            {exerciseNames.length} {exCountLabel}: {exerciseNames.join(' · ')}
          </div>
        )}
      </div>
    );
  })();

  // CIRCUIT closed-card summary — two lines: station count + rounds
  // tally above a small preview of the first 3 station names.
  // Method tag chip is the closedLabel.
  const circuitSummary = (() => {
    if (!STATIONS_METHODS[variant]) return null;
    const methodMeta = STATIONS_METHODS[variant];
    const td = parseTabataData(exercise?.tabata_data) || {};
    const stations = Array.isArray(td.stations) ? td.stations : [];
    if (stations.length === 0) {
      return (
        <div dir="rtl" style={{
          marginTop: 5,
          fontSize: 12,
          color: '#9CA3AF',
          fontWeight: 500,
        }}>
          {methodMeta.label} · אין תחנות
        </div>
      );
    }
    const methodConfig = (td.method_config && typeof td.method_config === 'object') ? td.method_config : {};
    const rounds = Number.isFinite(methodConfig.rounds) ? methodConfig.rounds : 3;
    const palette = methodMeta.palette;
    const previewNames = stations
      .slice(0, 3)
      .map((s) => (s?.name || '').trim())
      .filter(Boolean);
    const numStyle = {
      fontFamily: "'Bebas Neue', sans-serif",
      fontSize: 16,
      color: palette.stripe,
      lineHeight: 1,
    };
    const wordStyle = {
      fontSize: 10,
      color: '#6B7280',
      fontWeight: 600,
    };
    return (
      <div dir="rtl" style={{ marginTop: 5 }}>
        <div style={{
          display: 'flex',
          alignItems: 'baseline',
          flexWrap: 'wrap',
          gap: 6,
        }}>
          <span style={numStyle}>{stations.length}</span>
          <span style={wordStyle}>{stations.length === 1 ? 'תחנה' : 'תחנות'}</span>
          <span style={{ color: '#D1D5DB' }}>·</span>
          <span style={numStyle}>{rounds}</span>
          <span style={wordStyle}>{rounds === 1 ? 'סבב' : 'סבבים'}</span>
          <span style={{ color: '#D1D5DB' }}>·</span>
          <span style={{
            fontSize: 10,
            color: palette.stripe,
            fontWeight: 700,
            background: palette.outer,
            border: `1px solid ${palette.border}`,
            padding: '2px 8px',
            borderRadius: 999,
          }}>
            {methodMeta.closedLabel}
          </span>
        </div>
        {previewNames.length > 0 && (
          <div style={{
            fontSize: 10,
            color: '#9CA3AF',
            fontWeight: 500,
            marginTop: 3,
          }}>
            {previewNames.join(' · ')}
          </div>
        )}
      </div>
    );
  })();

  // TABATA closed-card summary — only fires when the new shape is
  // present. Line 1 = "{rounds}×{work} שניות · {sets} סטים"; line 2 =
  // first 3 exercise names from the rotation list. Legacy rows fall
  // through to the existing summaryPills tabata branch.
  const tabataSummary = (() => {
    if (variant !== 'tabata' || !hasNewTabataShape(exercise)) return null;
    const cs = resolveTabataClockSettings(exercise);
    const rotation = resolveTabataRotation(exercise);
    const accentColor = '#FF6F20';
    const numStyle = {
      fontFamily: "'Bebas Neue', sans-serif",
      fontSize: 16,
      color: accentColor,
      lineHeight: 1,
    };
    const wordStyle = {
      fontSize: 10,
      color: '#6B7280',
      fontWeight: 600,
    };
    const previewNames = rotation.slice(0, 3).map((e) => (e?.name || '').trim()).filter(Boolean);
    return (
      <div dir="rtl" style={{ marginTop: 5 }}>
        <div style={{
          display: 'flex',
          alignItems: 'baseline',
          flexWrap: 'wrap',
          gap: 6,
        }}>
          <span style={numStyle}>{cs.rounds}</span>
          <span style={{ ...wordStyle, color: '#9CA3AF' }}>×</span>
          <span style={numStyle}>{cs.work_seconds}</span>
          <span style={wordStyle}>שניות</span>
          <span style={{ color: '#D1D5DB' }}>·</span>
          <span style={numStyle}>{cs.sets}</span>
          <span style={wordStyle}>{cs.sets === 1 ? 'סט' : 'סטים'}</span>
          <span style={{ color: '#D1D5DB' }}>·</span>
          <span style={{
            fontSize: 10,
            color: accentColor,
            fontWeight: 700,
            background: '#FFF5EE',
            border: '1px solid #FFD0AC',
            padding: '2px 8px',
            borderRadius: 999,
          }}>
            טבטה
          </span>
        </div>
        <div style={{
          fontSize: 10,
          color: '#9CA3AF',
          fontWeight: 500,
          marginTop: 3,
        }}>
          {previewNames.length === 0
            ? 'ללא תרגילים מוגדרים'
            : previewNames.join(' · ')}
        </div>
      </div>
    );
  })();

  // Per-set checkbox row state (trainee mode). The parent owns the
  // actual toggle handler — we just read from `setLog` and forward.
  const totalSets = Math.max(1, parseInt(exercise.sets, 10) || 1);
  const isSetDone = (idx) => !!(setLog?.[idx]?.done);
  // Scroll-picker open state for the single rep-based exercise block.
  // Held here (not inside the render IIFE) so the picker survives
  // re-renders triggered by the picker's own onSelect.
  const [pickerOpenSetIdx, setPickerOpenSetIdx] = useState(null);
  // Same idea for time/hold exercises — separate state so the two
  // pickers (REPS_OPTIONS vs SECONDS_OPTIONS) can never collide.
  const [timePickerOpenSetIdx, setTimePickerOpenSetIdx] = useState(null);

  // SUPERSET / COMBO per-inner-per-round actuals + picker state.
  // roundsActuals shape: { [drillIdx]: { [setNumber 1-based]: { reps, hold_seconds, weight_kg, completed } } }
  // roundsPickerState: { drillIdx, setIdx, mode } | null — drives one
  // shared ScrollPickerPopup instance below the rounds block.
  const [roundsActuals, setRoundsActuals] = useState({});
  const [roundsPickerState, setRoundsPickerState] = useState(null);
  const [roundsSaving, setRoundsSaving] = useState(false);

  // Closed-card summary source. The edit dialog's primary write target
  // is exercise.tabata_data.planned_sets — the flattened shadow on
  // exercise.sets/reps is secondary and can lag a refetch. Read from
  // planned_sets first, fall back to the shadow. useMemo keeps the
  // derive cheap and re-runs whenever any of the underlying fields
  // change, so any edit (per-set table OR standalone field) is
  // reflected immediately on collapse.
  const closedSummary = useMemo(() => {
    const planned = parsePlannedSets(exercise);
    const setsFromPlanned = planned.length;
    const repsFromPlanned = planned[0]?.reps;
    return {
      sets: setsFromPlanned > 0 ? setsFromPlanned : exercise?.sets,
      reps: repsFromPlanned != null ? repsFromPlanned : exercise?.reps,
    };
  }, [exercise?.tabata_data, exercise?.sets, exercise?.reps, exercise?.mode]);

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

  // Lined-page row — single render path for coach + trainee (step A3).
  // Header band has bg #FBF6EE with an orange index square +
  // borderTop separator between consecutive exercises. Numbers in
  // param rows + tabata boxes use Barlow Condensed at one size (24px
  // / 700 / #1a1a1a); trailing word/unit uses the brand sans at 14px
  // / 600 / #777. Tabata variant has its own closed pills and a
  // 5-box open layout. Coach gets an "ערוך" pill that calls onEdit.
  {
    // Fonts kept inline so every number on this card lines up
    // visually — same family, same size, same weight, same color.
    const NUM_FONT = "'Bebas Neue', sans-serif";
    const SANS_FONT = "'Rubik', system-ui, sans-serif";

    // Container-variant (tabata + superset/list) closed-card summary
    // — single pill, the exercise count from the parsed sub_exercises
    // array. The full clock/protocol is shown in the open card; on
    // the closed card a single "{N} תרגילים" reads cleanly and
    // matches the storyboard.
    const tabataClosedPills = (() => {
      if (variant !== 'tabata' && variant !== 'list') return null;
      const count = subExercises.length;
      if (count <= 0) return [];
      return [{ text: `${count} תרגילים`, emphasized: false }];
    })();

    const closedPills = tabataClosedPills
      ? tabataClosedPills
      : summaryPills.map((t) => ({ text: t, emphasized: false }));

    // Derived card status — lifted out of the dot IIFE so the outer
    // wrapper + index square can style themselves by status too. Same
    // calc as the dot uses: 'display' for display-mode sections, else
    // 'none' / 'partial' / 'done' from setLog toggles.
    const cardStatus = (() => {
      if (sectionTrackingMode === 'display') return 'display';
      let n = 0;
      for (let i = 0; i < totalSets; i++) if (isSetDone(i)) n++;
      if (n === 0) return 'none';
      if (n >= totalSets) return 'done';
      return 'partial';
    })();

    // Premium-Soft outer container styling per status. 'done' lifts to
    // a soft green-tinted gradient with a green rail; 'partial' adds
    // an orange-tinted shadow; 'none' is the default cream-white.
    const wrapperByStatus = (() => {
      if (expanded) {
        return {
          background: '#F8F3E9',
          border: 'none',
          borderRight: '4px solid #FF6F20',
          boxShadow: 'none',
        };
      }
      if (cardStatus === 'done') {
        return {
          background: 'linear-gradient(135deg, #FFFFFF 0%, #F0FAF4 100%)',
          border: 'none',
          borderRight: '4px solid #16A34A',
          boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(22,163,74,0.1)',
        };
      }
      if (cardStatus === 'partial') {
        return {
          background: '#FFFFFF',
          border: 'none',
          borderRight: '4px solid #FF6F20',
          boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(255,111,32,0.08)',
        };
      }
      return {
        background: '#FFFFFF',
        border: 'none',
        borderRight: '4px solid #FF6F20',
        boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.05)',
      };
    })();

    return (
      <div style={{
        ...wrapperByStatus,
        borderRadius: 10,
        marginBottom: 12,
        overflow: 'hidden',
        direction: 'rtl',
      }}>
        {/* Header band — single row, flex space-between. Right cluster
            (RTL = visual right): 30×30 orange index square + 18px
            Barlow-700 title that wraps if long. Left cluster: 10×10
            colored status dot + 3-dot menu (now hosting ערוך) +
            chevron. Tap toggles expand. */}
        <div
          onClick={() => {
            const nextOpen = !expanded;
            console.log('CARD TAP fired, isOpen ->', nextOpen);
            setExpanded(v => !v);
          }}
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
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '14px 16px',
            background: expanded ? '#F0E9D6' : 'transparent',
            cursor: 'pointer',
            userSelect: 'none',
            touchAction: 'manipulation',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {/* ── Right cluster: index + title (+ closed-state pills) ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
            {exerciseIndex != null && (
              <span style={{
                width: 32, height: 32,
                background: cardStatus === 'done'
                  ? 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)'
                  : 'linear-gradient(135deg, #FF8B47 0%, #FF6F20 100%)',
                color: '#FFFFFF',
                borderRadius: 8,
                fontFamily: NUM_FONT,
                fontSize: 17,
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                lineHeight: 1,
                boxShadow: cardStatus === 'done'
                  ? '0 3px 8px rgba(22,163,74,0.3)'
                  : '0 3px 8px rgba(255,111,32,0.28)',
              }} aria-hidden>{cardStatus === 'done' ? '✓' : exerciseIndex}</span>
            )}

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 17,
                fontWeight: 800,
                color: completed ? '#aaa' : '#09090B',
                textDecoration: completed ? 'line-through' : 'none',
                fontFamily: SANS_FONT,
                lineHeight: 1.1,
                wordBreak: 'break-word',
              }}>{name}</div>
              {/* Phase 4 — method-specific summary + preview chip.
                  Shown only when closed; takes precedence over the
                  generic chip row. Preview is a single cream pill
                  with names joined by " · ". */}
              {!expanded && (() => {
                const customSummary = buildClosedSummary(exercise, variant);
                const previewText = buildClosedPreview(exercise, variant);
                if (!customSummary && !previewText) return null;
                return (
                  <>
                    {customSummary && (
                      <div style={{
                        fontSize: 11,
                        color: '#888',
                        marginTop: 3,
                        fontWeight: 500,
                        lineHeight: 1.4,
                        direction: 'rtl',
                      }}>{customSummary}</div>
                    )}
                    {previewText && (
                      <div style={{
                        fontSize: 10,
                        color: '#7A3A0F',
                        marginTop: 5,
                        fontWeight: 600,
                        lineHeight: 1.3,
                        background: '#FFF6EE',
                        padding: '4px 8px',
                        borderRadius: 6,
                        display: 'inline-block',
                        maxWidth: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        direction: 'rtl',
                      }}>{previewText}</div>
                    )}
                  </>
                );
              })()}
              {/* Generic param chips — fallback for basic / reps_new /
                  none / normal (any variant where buildClosedSummary
                  returned null). Row 2 under the title. Inline
                  <num>+<label> groups with a thin gray "·" between them.
                  Each chip pairs a Bebas Neue number with a 10px Hebrew
                  label and the full word "שניות" (never the ״ symbol).
                  Only truthy values render. Order: sets → reps → hold → rest. */}
              {!expanded && !buildClosedSummary(exercise, variant) && (() => {
                const restSec = toSeconds(exercise.rest_time);
                const holdSec = toSeconds(exercise.static_hold_time);
                const chips = [];
                if (hasValue(closedSummary.sets)) chips.push({ value: String(closedSummary.sets), label: 'סטים' });
                if (hasValue(closedSummary.reps)) chips.push({ value: String(closedSummary.reps), label: 'חזרות' });
                if (holdSec != null) chips.push({ value: String(holdSec), label: 'שניות החזקה' });
                if (restSec != null) chips.push({ value: String(restSec), label: 'שניות מנוחה' });
                if (chips.length === 0) return null;
                return (
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'baseline',
                    gap: 8,
                    marginTop: 2,
                    direction: 'rtl',
                  }}>
                    {chips.map((c, i) => (
                      <React.Fragment key={c.label}>
                        {i > 0 && (
                          <span style={{ color: '#D1D5DB', lineHeight: 1 }} aria-hidden>·</span>
                        )}
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'baseline',
                          gap: 3,
                        }}>
                          <span style={{
                            fontFamily: "'Bebas Neue', sans-serif",
                            fontSize: 17,
                            color: '#FF6F20',
                            lineHeight: 1,
                          }}>{c.value}</span>
                          <span style={{
                            fontSize: 10,
                            color: '#6b7280',
                            fontWeight: 600,
                          }}>{c.label}</span>
                        </span>
                      </React.Fragment>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* ── Left cluster: status dot + 3-dot menu + chevron ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            {/* Status indicator — 'done' renders a CircleCheck icon at
                22px in brand green; other states are a 10×10 colored
                dot with a soft halo shadow. Reuses the lifted
                `cardStatus` so the dot, the index square, and the
                outer wrapper all agree on the same value. */}
            {(() => {
              if (cardStatus === 'done') {
                return (
                  <CircleCheck aria-label="הושלם" size={22}
                    style={{ color: '#16A34A', flexShrink: 0 }} />
                );
              }
              if (cardStatus === 'display') {
                return (
                  <span aria-label="תצוגה" style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: '#9CA3AF', flexShrink: 0,
                    display: 'inline-block',
                    boxShadow: '0 0 0 3px rgba(156,163,175,0.18)',
                  }} />
                );
              }
              if (cardStatus === 'partial') {
                return (
                  <span aria-label="בוצע חלקית" style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: '#FF6F20', flexShrink: 0,
                    display: 'inline-block',
                    boxShadow: '0 0 0 3px rgba(255,111,32,0.22), 0 0 10px rgba(255,111,32,0.35)',
                  }} />
                );
              }
              // cardStatus === 'none'
              return (
                <span aria-label="לא בוצע" style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: '#9CA3AF', flexShrink: 0,
                  display: 'inline-block',
                  boxShadow: '0 0 0 3px rgba(156,163,175,0.18)',
                }} />
              );
            })()}

            {/* Coach 3-dot menu — ערוך + שכפל + מחק. Trigger renders
                when any of the three handlers is wired. Popover lives
                in a portal so it can't be clipped by the card's
                overflow:hidden. */}
            {isCoachMode && (onEdit || onDuplicate || onDelete) && (
              <div ref={actionsMenuRef} style={{ flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    const MENU_W = 160;
                    let leftPos = rect.left;
                    // Clamp to viewport edges with an 8px breathing room.
                    if (leftPos < 8) leftPos = 8;
                    if (leftPos + MENU_W > window.innerWidth - 8) {
                      leftPos = window.innerWidth - MENU_W - 8;
                    }
                    setActionsMenuAnchor({ top: rect.bottom + 6, left: leftPos });
                    setActionsMenuOpen((v) => !v);
                  }}
                  aria-label="פעולות"
                  aria-expanded={actionsMenuOpen}
                  title="פעולות"
                  style={{
                    width: 24, height: 24,
                    background: 'transparent',
                    border: 'none',
                    color: '#6b7280',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                  }}
                >
                  <MoreHorizontal size={18} />
                </button>
                {actionsMenuOpen && actionsMenuAnchor && typeof document !== 'undefined' && createPortal(
                  <div
                    ref={actionsPopoverRef}
                    role="menu"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: 'fixed',
                      top: actionsMenuAnchor.top,
                      left: actionsMenuAnchor.left,
                      zIndex: 1000,
                      background: '#FFFFFF',
                      border: '1px solid #E8DEC4',
                      borderRadius: 12,
                      boxShadow: '0 6px 18px rgba(0,0,0,0.12)',
                      padding: 8,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      minWidth: 160,
                      direction: 'rtl',
                      fontFamily: SANS_FONT,
                    }}
                  >
                    {onEdit && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setActionsMenuOpen(false); onEdit(exercise); }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          width: '100%', padding: '8px 10px',
                          background: '#FCFBF7', border: '1px solid #EFE9D8',
                          borderRadius: 8, cursor: 'pointer',
                          fontSize: 13, fontWeight: 600, color: '#1a1a1a',
                          textAlign: 'right', direction: 'rtl', lineHeight: 1.2,
                        }}
                      >
                        <Edit2 size={14} style={{ color: '#FF6F20', flexShrink: 0 }} />
                        <span>ערוך</span>
                      </button>
                    )}
                    {onDuplicate && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setActionsMenuOpen(false); onDuplicate(exercise); }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          width: '100%', padding: '8px 10px',
                          background: '#FCFBF7', border: '1px solid #EFE9D8',
                          borderRadius: 8, cursor: 'pointer',
                          fontSize: 13, fontWeight: 600, color: '#1a1a1a',
                          textAlign: 'right', direction: 'rtl', lineHeight: 1.2,
                        }}
                      >
                        <Copy size={14} style={{ color: '#FF6F20', flexShrink: 0 }} />
                        <span>שכפל</span>
                      </button>
                    )}
                    {onDelete && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActionsMenuOpen(false);
                          if (window.confirm('למחוק תרגיל זה?')) onDelete(exercise);
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          width: '100%', padding: '8px 10px',
                          background: '#FCEBEB', border: '1px solid #F5C9C9',
                          borderRadius: 8, cursor: 'pointer',
                          fontSize: 13, fontWeight: 600, color: '#a32d2d',
                          textAlign: 'right', direction: 'rtl', lineHeight: 1.2,
                        }}
                      >
                        <Trash2 size={14} style={{ color: '#a32d2d', flexShrink: 0 }} />
                        <span>מחק</span>
                      </button>
                    )}
                  </div>,
                  document.body
                )}
              </div>
            )}

            {/* Chevron — rotates 180° when expanded. */}
            <span aria-hidden style={{
              color: '#C9A24A',
              fontSize: 14,
              lineHeight: 1,
              transition: 'transform 0.2s',
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              flexShrink: 0,
            }}>▼</span>
          </div>
        </div>

        {/* Open body — tabata-only summary tiles (5-box clock layout
            + the numbered drill list used by both coach and trainee
            tabata views). List variant USED to share this block, but
            it now has its own mini-card layout inside the wrapped
            expanded body further down (variant === 'list' branches at
            ~1977 and ~2070). Sharing the block doubled the rendering
            for list variants — the legacy numbered-circle list above
            the new mini-cards. Restricting the gate to tabata gives
            list variants exactly one render path. */}
            {/* CIRCUIT — horizontal scrollable strip of station cards
                + a round-progression dot indicator. Each station shows
                its number, type badge (חזרות / שניות), name, and value
                in its type's unit color. Persistence reuses
                onCompleteRound (writes a 1-marker row per completed
                round to exercise_set_logs). */}
            {expanded && STATIONS_METHODS[variant] && (() => {
              const methodMeta = STATIONS_METHODS[variant];
              const td = parseTabataData(exercise?.tabata_data) || {};
              const stations = Array.isArray(td.stations) ? td.stations : [];
              const methodConfig = (td.method_config && typeof td.method_config === 'object') ? td.method_config : {};
              const rounds = Number.isFinite(methodConfig.rounds) ? methodConfig.rounds : 3;

              if (stations.length === 0) {
                return <EmptyMethodPlaceholder headline="טרם הוגדרו תחנות" />;
              }

              // Aggregate completion across (station, round). drillIdx
              // = the station's 0-based ordinal (matches station_index
              // when present, otherwise the array index — sIdx); set_number
              // is round 1-based. Stations are addressed by their array
              // position so the key stays stable even if station_index
              // is missing or non-sequential.
              let totalCells = 0;
              let doneCells = 0;
              for (let s = 0; s < stations.length; s++) {
                for (let r = 0; r < rounds; r++) {
                  totalCells++;
                  if (roundsActuals[s]?.[r + 1]?.completed) doneCells++;
                }
              }
              const overallPct = totalCells > 0
                ? Math.round((doneCells / totalCells) * 100)
                : 0;
              const numberOfRoundsLabel = rounds === 1
                ? '1 סבב'
                : `${rounds} סבבים`;

              return (
                <div dir="rtl" style={{
                  background: '#FFFFFF',
                  border: `1px solid ${BRAND.cardBorder}`,
                  borderRadius: 14,
                  padding: '11px 12px',
                  marginBottom: 12,
                }}>
                  {/* Method tag + overall tally */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 12px',
                    background: BRAND.panelBg,
                    border: `1px solid ${BRAND.panelBorder}`,
                    borderRadius: 10,
                    marginBottom: 12,
                  }}>
                    <span style={{
                      fontSize: 13,
                      fontWeight: 800,
                      color: BRAND.tagText,
                      background: BRAND.tagBg,
                      padding: '2px 7px',
                      borderRadius: 5,
                    }}>
                      {methodMeta.label}
                    </span>
                    <span style={{
                      fontFamily: "'Bebas Neue', sans-serif",
                      fontSize: 14,
                      color: BRAND.stripeActive,
                      background: 'white',
                      padding: '2px 8px',
                      borderRadius: 5,
                      border: `1px solid ${BRAND.panelBorder}`,
                    }}>
                      {doneCells} / {totalCells}
                    </span>
                  </div>

                  {/* Per-station hero+fill blocks — one card per station */}
                  {stations.map((station, sIdx) => {
                    const drillIdx = sIdx;
                    const stType = station?.type === 'time' ? 'time' : 'reps';
                    const fillMode = stType === 'time' ? 'seconds' : 'reps';
                    const stationNumber = station?.station_index ?? (sIdx + 1);
                    const heroLabel = fillMode === 'reps' ? 'יעד חזרות' : 'יעד שניות';
                    const heroValue = station?.value != null && station.value !== ''
                      ? station.value
                      : '—';

                    let drillDone = 0;
                    let firstUnfilledIdx = rounds;
                    for (let r = 0; r < rounds; r++) {
                      const cell = roundsActuals[drillIdx]?.[r + 1];
                      if (cell?.completed) drillDone++;
                      else if (firstUnfilledIdx === rounds) firstUnfilledIdx = r;
                    }
                    const drillAllDone = drillDone >= rounds;
                    const drillPct = rounds > 0
                      ? (drillDone / rounds) * 100
                      : 0;

                    return (
                      <div key={sIdx} style={{
                        direction: 'rtl',
                        background: '#FFF9F0',
                        borderRight: '4px solid #FF6F20',
                        borderRadius: '12px 0 0 12px',
                        padding: '14px 14px',
                        marginBottom: sIdx < stations.length - 1 ? 14 : 6,
                      }}>
                        {/* Station header — index badge + name */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          marginBottom: 12,
                        }}>
                          <span style={{
                            fontFamily: "'Bebas Neue', sans-serif",
                            fontSize: 16,
                            color: BRAND.stripeActive,
                            background: BRAND.panelBg,
                            padding: '2px 9px',
                            borderRadius: 5,
                            fontWeight: 800,
                            border: `1px solid ${BRAND.panelBorder}`,
                          }}>
                            {String(stationNumber).padStart(2, '0')}
                          </span>
                          <span style={{
                            flex: 1,
                            ...T.name,
                            color: '#1a1a1a',
                            textAlign: 'right',
                          }}>
                            {station?.name || 'תחנה ללא שם'}
                          </span>
                        </div>

                        {/* Two-column: hero TARGET on right, fill boxes on left */}
                        <div style={{ display: 'flex', flexDirection: 'row', gap: 14, alignItems: 'stretch' }}>
                          {/* RIGHT — hero target + rounds count */}
                          <div style={{
                            flex: '0 0 110px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: '#FFFFFF',
                            border: '1px solid #FFE0C2',
                            borderRadius: 12,
                            padding: '14px 6px',
                          }}>
                            <div style={{ ...T.hero, color: '#FF6F20' }}>{heroValue}</div>
                            <div style={{ ...T.heroLbl, marginTop: 4 }}>{heroLabel}</div>
                            <div style={{
                              marginTop: 10,
                              fontFamily: SANS_FONT,
                              fontSize: 12,
                              fontWeight: 600,
                              color: '#777',
                            }}>{numberOfRoundsLabel}</div>
                          </div>

                          {/* LEFT — per-round fill boxes */}
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {Array.from({ length: rounds }).map((_, rIdx) => {
                              const cell = roundsActuals[drillIdx]?.[rIdx + 1];
                              const done = !!cell?.completed;
                              const active = !done && !drillAllDone && rIdx === firstUnfilledIdx;
                              const loggedReps = cell?.reps;
                              const loggedSec = cell?.hold_seconds;
                              let dotBg, dotBorder, valueColor, valueText, rowBorder;
                              if (done) {
                                dotBg = '#3FA06B';
                                dotBorder = '#3FA06B';
                                valueColor = '#3FA06B';
                                rowBorder = '1.5px solid #3FA06B';
                                const v = fillMode === 'reps' ? loggedReps : loggedSec;
                                valueText = v != null && v !== '' ? String(v) : '✓';
                              } else if (active) {
                                dotBg = '#FF6F20';
                                dotBorder = '#FF6F20';
                                valueColor = '#FF6F20';
                                rowBorder = '1.5px dashed #FF6F20';
                                valueText = '?';
                              } else {
                                dotBg = 'transparent';
                                dotBorder = '#D1D5DB';
                                valueColor = '#9CA3AF';
                                rowBorder = '1.5px dashed #D1D5DB';
                                valueText = '–';
                              }
                              return (
                                <div
                                  key={rIdx}
                                  role="button"
                                  tabIndex={0}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRoundsPickerState({ drillIdx, setIdx: rIdx + 1, mode: fillMode });
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      setRoundsPickerState({ drillIdx, setIdx: rIdx + 1, mode: fillMode });
                                    }
                                  }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 12,
                                    padding: '11px 8px',
                                    borderRadius: 11,
                                    background: '#FFFFFF',
                                    border: rowBorder,
                                    cursor: 'pointer',
                                  }}
                                >
                                  <span
                                    aria-hidden="true"
                                    style={{
                                      width: 14,
                                      height: 14,
                                      borderRadius: '50%',
                                      background: dotBg,
                                      border: `2px solid ${dotBorder}`,
                                      display: 'inline-block',
                                      flex: '0 0 auto',
                                    }}
                                  />
                                  <span style={{ ...T.setLabel }}>{`סבב ${rIdx + 1}`}</span>
                                  <span style={{ ...T.setValue, color: valueColor }}>{valueText}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Per-station completion bar */}
                        <ProgressBar percent={drillPct} color="#FF6F20" />
                      </div>
                    );
                  })}

                  {/* Overall completion across every (station, round) cell */}
                  <div style={{
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: '#FFF4E6',
                    border: '1px solid #FFD9B0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}>
                    <span style={{
                      fontSize: 12,
                      color: '#555',
                      fontFamily: SANS_FONT,
                      fontWeight: 600,
                    }}>
                      {doneCells}/{totalCells} תאים מולאו
                    </span>
                    <span style={{
                      fontFamily: "'Bebas Neue', sans-serif",
                      fontSize: 22,
                      fontWeight: 700,
                      color: '#FF6F20',
                      lineHeight: 1,
                    }}>
                      {overallPct}%
                    </span>
                  </div>

                  {/* Shared picker for every (station, round) cell.
                      Reuses the same roundsPickerState driven by the
                      super_set/combo block — only one cell ever opens
                      the picker at a time, so a single instance is
                      enough across all method renders. */}
                  <ScrollPickerPopup
                    isOpen={roundsPickerState != null}
                    value={(() => {
                      if (roundsPickerState == null) return null;
                      const cell = roundsActuals[roundsPickerState.drillIdx]?.[roundsPickerState.setIdx];
                      const st = stations[roundsPickerState.drillIdx] || {};
                      if (roundsPickerState.mode === 'seconds') {
                        return cell?.hold_seconds
                          ?? (Number.isFinite(Number(st.value)) ? Number(st.value) : null);
                      }
                      return cell?.reps
                        ?? (Number.isFinite(Number(st.value)) ? Number(st.value) : null);
                    })()}
                    options={roundsPickerState?.mode === 'seconds' ? SECONDS_OPTIONS : REPS_OPTIONS}
                    onClose={() => setRoundsPickerState(null)}
                    onSelect={(v) => {
                      if (roundsSaving) return;
                      if (roundsPickerState == null) return;
                      onRoundsFillSave(
                        roundsPickerState.drillIdx,
                        roundsPickerState.setIdx,
                        v,
                        roundsPickerState.mode,
                      );
                    }}
                    title={(() => {
                      if (roundsPickerState == null) return '';
                      const st = stations[roundsPickerState.drillIdx] || {};
                      const stName = st?.name || 'תחנה';
                      const unitWord = roundsPickerState.mode === 'seconds' ? 'שניות שבוצעו' : 'חזרות שבוצעו';
                      return `${stName} · סבב ${roundsPickerState.setIdx} — ${unitWord}`;
                    })()}
                  />
                </div>
              );
            })()}

            {/* SUPERSET / COMBO — rounds-based layout. Vertical list
                of round cards; each round shows its exercise sequence
                vertically with a connector ("ואז" for superset, "←"
                arrow for combo) between adjacent exercises. Active
                round expands a "סיים סבב והמשך" button (trainee only)
                that writes a marker row to exercise_set_logs keyed by
                round_index. activeRoundIdx is derived from pyramidActuals
                so a refresh resumes on the next undone round. */}
            {expanded && ROUNDS_METHODS[variant] && (() => {
              const methodMeta = ROUNDS_METHODS[variant];
              // SUPERSET and COMBO share this block — connector and the
              // method label come from methodMeta; everything else is
              // generic per-inner-per-round fill.
              const td = parseTabataData(exercise?.tabata_data) || {};
              const rounds = Array.isArray(td.rounds) ? td.rounds : [];
              const subExercises = Array.isArray(td.sub_exercises) ? td.sub_exercises : [];
              if (rounds.length === 0 && subExercises.length === 0) {
                return <EmptyMethodPlaceholder headline="טרם הוגדרו סבבים" />;
              }

              // Inner count = max exercises.length across rounds. Each
              // inner gets its own hero+fill block; drillIdx = the inner's
              // ordinal so it matches the (drill_index, set_number) key
              // used by saveSetActual.
              const innerCount = rounds.reduce(
                (n, r) => Math.max(n, Array.isArray(r?.exercises) ? r.exercises.length : 0),
                0,
              );
              if (innerCount === 0) {
                return <EmptyMethodPlaceholder headline="טרם הוגדרו תרגילים בסבב" />;
              }

              // For each drill, find the first round whose entry at that
              // ordinal carries data — that's the source for the hero
              // target + the inner-exercise name. Most plans repeat the
              // same sequence across rounds, so this picks round 0 in
              // the common case.
              const innerRefs = Array.from({ length: innerCount }, (_, d) => {
                for (const r of rounds) {
                  const ex = r?.exercises?.[d];
                  if (ex && typeof ex === 'object') return ex;
                }
                return {};
              });

              // Aggregate completion across every (drill, round) cell.
              let totalCells = 0;
              let doneCells = 0;
              for (let d = 0; d < innerCount; d++) {
                for (let r = 0; r < rounds.length; r++) {
                  totalCells++;
                  if (roundsActuals[d]?.[r + 1]?.completed) doneCells++;
                }
              }
              const overallPct = totalCells > 0
                ? Math.round((doneCells / totalCells) * 100)
                : 0;

              const numberOfRoundsLabel = rounds.length === 1
                ? '1 סבב'
                : `${rounds.length} סבבים`;

              return (
                <div dir="rtl" style={{
                  background: '#FFFFFF',
                  border: `1px solid ${BRAND.cardBorder}`,
                  borderRadius: 14,
                  padding: '11px 12px',
                  marginBottom: 12,
                }}>
                  {/* Method tag + overall tally */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 12px',
                    background: BRAND.panelBg,
                    border: `1px solid ${BRAND.panelBorder}`,
                    borderRadius: 10,
                    marginBottom: 12,
                  }}>
                    <span style={{
                      fontSize: 13,
                      fontWeight: 800,
                      color: BRAND.tagText,
                      background: BRAND.tagBg,
                      padding: '2px 7px',
                      borderRadius: 5,
                    }}>
                      {methodMeta.label}
                    </span>
                    <span style={{
                      fontFamily: "'Bebas Neue', sans-serif",
                      fontSize: 14,
                      color: BRAND.stripeActive,
                      background: 'white',
                      padding: '2px 8px',
                      borderRadius: 5,
                      border: `1px solid ${BRAND.panelBorder}`,
                    }}>
                      {doneCells} / {totalCells}
                    </span>
                  </div>

                  {/* COMBO-only flow hint kept from the legacy render so
                      the "רצף זורם · ללא מנוחה" microcopy doesn't disappear. */}
                  {methodMeta.topHint && (
                    <div style={{
                      background: BRAND.panelBg,
                      border: `1px solid ${BRAND.panelBorder}`,
                      borderRadius: 8,
                      padding: 8,
                      marginBottom: 10,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      justifyContent: 'center',
                    }}>
                      <Zap size={12} color={BRAND.stripeActive} />
                      <span style={{ fontSize: 11, color: BRAND.tagText, fontWeight: 700 }}>
                        {methodMeta.topHint}
                      </span>
                    </div>
                  )}

                  {/* Per-inner hero+fill blocks — one card per drill */}
                  {Array.from({ length: innerCount }).map((_, drillIdx) => {
                    const ref = innerRefs[drillIdx] || {};
                    const innerName = ref?.name || 'תרגיל ללא שם';
                    const repsTarget = Number.isFinite(Number(ref?.reps)) ? Number(ref.reps) : null;
                    const secTarget = Number.isFinite(Number(ref?.hold_seconds)) ? Number(ref.hold_seconds) : null;
                    // Mode picks the primary measurable: reps if set,
                    // else seconds, else default to reps (target shows "—").
                    const fillMode = repsTarget != null
                      ? 'reps'
                      : (secTarget != null ? 'seconds' : 'reps');
                    const heroValue = fillMode === 'reps'
                      ? (repsTarget != null ? repsTarget : '—')
                      : (secTarget != null ? secTarget : '—');
                    const heroLabel = fillMode === 'reps' ? 'יעד חזרות' : 'יעד שניות';

                    // First-unfilled box for this inner; used to render
                    // the orange dashed "?" state at the right cell.
                    let drillDone = 0;
                    let firstUnfilledIdx = rounds.length;
                    for (let r = 0; r < rounds.length; r++) {
                      const cell = roundsActuals[drillIdx]?.[r + 1];
                      if (cell?.completed) drillDone++;
                      else if (firstUnfilledIdx === rounds.length) firstUnfilledIdx = r;
                    }
                    const drillAllDone = drillDone >= rounds.length;
                    const drillPct = rounds.length > 0
                      ? (drillDone / rounds.length) * 100
                      : 0;

                    // Inner index badge — Hebrew letter (א/ב/ג/...) so
                    // the connector glyph still reads "ואז" / "←" when
                    // the user mentally pairs A→B in their head.
                    const innerBadge = String.fromCharCode(0x05D0 + drillIdx);

                    return (
                      <div key={drillIdx} style={{
                        direction: 'rtl',
                        background: '#FFF9F0',
                        borderRight: '4px solid #FF6F20',
                        borderRadius: '12px 0 0 12px',
                        padding: '14px 14px',
                        marginBottom: drillIdx < innerCount - 1 ? 14 : 6,
                      }}>
                        {/* Inner header — badge + name */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          marginBottom: 12,
                        }}>
                          <span style={{
                            fontFamily: "'Bebas Neue', sans-serif",
                            fontSize: 16,
                            color: BRAND.stripeActive,
                            background: BRAND.panelBg,
                            padding: '2px 9px',
                            borderRadius: 5,
                            fontWeight: 800,
                            border: `1px solid ${BRAND.panelBorder}`,
                          }}>
                            {innerBadge}
                          </span>
                          <span style={{
                            flex: 1,
                            ...T.name,
                            color: '#1a1a1a',
                            textAlign: 'right',
                          }}>
                            {innerName}
                          </span>
                        </div>

                        {/* Two-column: hero TARGET on right, fill boxes on left */}
                        <div style={{ display: 'flex', flexDirection: 'row', gap: 14, alignItems: 'stretch' }}>
                          {/* RIGHT — hero target + rounds count */}
                          <div style={{
                            flex: '0 0 110px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: '#FFFFFF',
                            border: '1px solid #FFE0C2',
                            borderRadius: 12,
                            padding: '14px 6px',
                          }}>
                            <div style={{ ...T.hero, color: '#FF6F20' }}>{heroValue}</div>
                            <div style={{ ...T.heroLbl, marginTop: 4 }}>{heroLabel}</div>
                            <div style={{
                              marginTop: 10,
                              fontFamily: SANS_FONT,
                              fontSize: 12,
                              fontWeight: 600,
                              color: '#777',
                            }}>{numberOfRoundsLabel}</div>
                          </div>

                          {/* LEFT — per-round fill boxes */}
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {Array.from({ length: rounds.length }).map((_, rIdx) => {
                              const cell = roundsActuals[drillIdx]?.[rIdx + 1];
                              const done = !!cell?.completed;
                              const active = !done && !drillAllDone && rIdx === firstUnfilledIdx;
                              const loggedReps = cell?.reps;
                              const loggedSec = cell?.hold_seconds;
                              let dotBg, dotBorder, valueColor, valueText, rowBorder;
                              if (done) {
                                dotBg = '#3FA06B';
                                dotBorder = '#3FA06B';
                                valueColor = '#3FA06B';
                                rowBorder = '1.5px solid #3FA06B';
                                const v = fillMode === 'reps' ? loggedReps : loggedSec;
                                valueText = v != null && v !== '' ? String(v) : '✓';
                              } else if (active) {
                                dotBg = '#FF6F20';
                                dotBorder = '#FF6F20';
                                valueColor = '#FF6F20';
                                rowBorder = '1.5px dashed #FF6F20';
                                valueText = '?';
                              } else {
                                dotBg = 'transparent';
                                dotBorder = '#D1D5DB';
                                valueColor = '#9CA3AF';
                                rowBorder = '1.5px dashed #D1D5DB';
                                valueText = '–';
                              }
                              return (
                                <div
                                  key={rIdx}
                                  role="button"
                                  tabIndex={0}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRoundsPickerState({ drillIdx, setIdx: rIdx + 1, mode: fillMode });
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      setRoundsPickerState({ drillIdx, setIdx: rIdx + 1, mode: fillMode });
                                    }
                                  }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 12,
                                    padding: '11px 8px',
                                    borderRadius: 11,
                                    background: '#FFFFFF',
                                    border: rowBorder,
                                    cursor: 'pointer',
                                  }}
                                >
                                  <span
                                    aria-hidden="true"
                                    style={{
                                      width: 14,
                                      height: 14,
                                      borderRadius: '50%',
                                      background: dotBg,
                                      border: `2px solid ${dotBorder}`,
                                      display: 'inline-block',
                                      flex: '0 0 auto',
                                    }}
                                  />
                                  <span style={{ ...T.setLabel }}>{`סבב ${rIdx + 1}`}</span>
                                  <span style={{ ...T.setValue, color: valueColor }}>{valueText}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Per-inner completion bar — same orange as the
                            single-exercise rep card so the eye reads the
                            same "progress" pattern across methods. */}
                        <ProgressBar percent={drillPct} color="#FF6F20" />
                      </div>
                    );
                  })}

                  {/* Overall completion across every (drill, round) cell */}
                  <div style={{
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: '#FFF4E6',
                    border: '1px solid #FFD9B0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}>
                    <span style={{
                      fontSize: 12,
                      color: '#555',
                      fontFamily: SANS_FONT,
                      fontWeight: 600,
                    }}>
                      {doneCells}/{totalCells} תאים מולאו
                    </span>
                    <span style={{
                      fontFamily: "'Bebas Neue', sans-serif",
                      fontSize: 22,
                      fontWeight: 700,
                      color: '#FF6F20',
                      lineHeight: 1,
                    }}>
                      {overallPct}%
                    </span>
                  </div>

                  {/* Shared picker for every (drill, round) cell. mode
                      drives the options list: REPS_OPTIONS for rep-based
                      inners, SECONDS_OPTIONS for time/hold inners. The
                      same overlay is reused across all inner blocks so
                      we don't render N pickers at once. */}
                  <ScrollPickerPopup
                    isOpen={roundsPickerState != null}
                    value={(() => {
                      if (roundsPickerState == null) return null;
                      const cell = roundsActuals[roundsPickerState.drillIdx]?.[roundsPickerState.setIdx];
                      const ref = innerRefs[roundsPickerState.drillIdx] || {};
                      if (roundsPickerState.mode === 'seconds') {
                        return cell?.hold_seconds
                          ?? (Number.isFinite(Number(ref.hold_seconds)) ? Number(ref.hold_seconds) : null);
                      }
                      return cell?.reps
                        ?? (Number.isFinite(Number(ref.reps)) ? Number(ref.reps) : null);
                    })()}
                    options={roundsPickerState?.mode === 'seconds' ? SECONDS_OPTIONS : REPS_OPTIONS}
                    onClose={() => setRoundsPickerState(null)}
                    onSelect={(v) => {
                      if (roundsSaving) return;
                      if (roundsPickerState == null) return;
                      onRoundsFillSave(
                        roundsPickerState.drillIdx,
                        roundsPickerState.setIdx,
                        v,
                        roundsPickerState.mode,
                      );
                    }}
                    title={(() => {
                      if (roundsPickerState == null) return '';
                      const ref = innerRefs[roundsPickerState.drillIdx] || {};
                      const innerName = ref?.name || 'תרגיל';
                      const unitWord = roundsPickerState.mode === 'seconds' ? 'שניות שבוצעו' : 'חזרות שבוצעו';
                      return `${innerName} · סבב ${roundsPickerState.setIdx} — ${unitWord}`;
                    })()}
                  />
                </div>
              );
            })()}

            {/* REST_PAUSE — horizontal mini-set row with rest dividers
                between cells. ONE shared variation_name + rest_seconds
                header band at top. Active cell expands with the same
                +/- counter pattern as pyramid; past cells turn green;
                future cells stay dashed gray. Persistence shares
                pyramid's exercise_set_logs path (set_number 1-based). */}
            {expanded && HORIZONTAL_MINISETS_METHODS[variant] && (() => {
              // Right-anchor layout matching PYRAMID/DROP_SET/DELORME.
              // ONE shared variation + ONE shared rest, then a list of
              // items (set 1 = main set, sets 2+ = mini-sets) each with
              // its own target reps. Burgundy #7F1D1D throughout.
              const plannedSets = parsePlannedSets(exercise);
              const td = parseTabataData(exercise?.tabata_data) || {};
              const methodConfig = (td.method_config && typeof td.method_config === 'object') ? td.method_config : {};
              const variationName = methodConfig.variation_name;
              const restSeconds = methodConfig.rest_seconds ?? null;

              if (plannedSets.length === 0) {
                return <EmptyMethodPlaceholder headline="טרם הוגדרו מיני-סטים" />;
              }

              const activeIdx = pyramidActiveIdx;
              const completedCount = plannedSets.reduce(
                (n, _, i) => n + (pyramidActuals[i + 1]?.completed ? 1 : 0),
                0,
              );
              const completionPct = plannedSets.length > 0
                ? (completedCount / plannedSets.length) * 100
                : 0;
              const totalTargetReps = plannedSets.reduce(
                (sum, s) => sum + (Number.isFinite(Number(s?.reps)) ? Number(s.reps) : 0),
                0,
              );

              const headerParts = [
                variationName ? `וריאציה: ${variationName}` : null,
                restSeconds != null ? `מנוחה ${restSeconds} שניות` : null,
              ].filter(Boolean);

              return (
                <div dir="rtl" style={{
                  background: '#FBF1F1',
                  borderRight: '5px solid #7F1D1D',
                  borderRadius: '12px 0 0 12px',
                  padding: '18px 16px',
                  marginTop: 12,
                }}>
                  {/* Exercise name — right-aligned */}
                  <div style={{ ...T.name, color: '#1a1a1a', textAlign: 'right', marginBottom: 6 }}>
                    {exercise?.name || exercise?.exercise_name || 'תרגיל'}
                  </div>

                  {/* Variation + rest line (omitted entirely when both absent) */}
                  {headerParts.length > 0 ? (
                    <div style={{ fontSize: 13, color: '#7F1D1D', textAlign: 'right', marginBottom: 14 }}>
                      {headerParts.join(' · ')}
                    </div>
                  ) : (
                    <div style={{ marginBottom: 14 }} />
                  )}

                  {/* Two-column body: right anchor + per-item status rows */}
                  <div style={{ display: 'flex', gap: 14, alignItems: 'stretch' }}>
                    {/* RIGHT anchor — total target reps */}
                    <div style={{
                      minWidth: 80,
                      borderLeft: '1px solid #ECD3D3',
                      paddingLeft: 14,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <div style={{ ...T.hero, color: '#7F1D1D' }}>{totalTargetReps}</div>
                      <div style={{ ...T.heroLbl, marginTop: 4, textAlign: 'center' }}>
                        סך חזרות
                      </div>
                    </div>

                    {/* LEFT body — one status row per item */}
                    <div style={{ flex: 1 }}>
                      {plannedSets.map((set, i) => {
                        const isLast = i === plannedSets.length - 1;
                        const done = i < activeIdx;
                        const active = !isCoachMode && i === activeIdx;
                        const actual = pyramidActuals[i + 1];

                        let dotBg, dotBorder, valueColor, labelColor;
                        if (done) {
                          dotBg = '#16a34a'; dotBorder = '#16a34a';
                          valueColor = '#16a34a';
                          labelColor = '#1a1a1a';
                        } else if (active) {
                          dotBg = '#7F1D1D'; dotBorder = '#7F1D1D';
                          valueColor = '#7F1D1D';
                          labelColor = '#7F1D1D';
                        } else {
                          dotBg = 'transparent'; dotBorder = '#D1D5DB';
                          valueColor = '#9CA3AF';
                          labelColor = '#9CA3AF';
                        }

                        const targetReps = set.reps != null ? set.reps : '-';
                        const label = i === 0
                          ? `סט עיקרי · יעד ${targetReps}`
                          : `מיני ${i} · יעד ${targetReps}`;

                        const onTap = active
                          ? (e) => { e.stopPropagation(); onSaveAndAdvance(); }
                          : undefined;
                        const onKey = active
                          ? (e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                onSaveAndAdvance();
                              }
                            }
                          : undefined;

                        return (
                          <div
                            key={i}
                            role={active ? 'button' : undefined}
                            tabIndex={active ? 0 : -1}
                            onClick={onTap}
                            onKeyDown={onKey}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 12,
                              padding: '12px 4px',
                              borderBottom: isLast ? 'none' : '1px solid #ECD3D3',
                              cursor: active ? 'pointer' : 'default',
                            }}
                          >
                            <span
                              aria-hidden="true"
                              style={{
                                width: 15,
                                height: 15,
                                borderRadius: '50%',
                                background: dotBg,
                                border: `2px solid ${dotBorder}`,
                                display: 'inline-block',
                                flex: '0 0 auto',
                              }}
                            />
                            <span style={{ ...T.setLabel, flex: 1, textAlign: 'right', color: labelColor }}>
                              {label}
                            </span>
                            {active ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                <ActualInput
                                  target={set.reps}
                                  value={pyramidActuals[i + 1]?.reps}
                                  color="#7F1D1D"
                                  onChange={(n) => setPyramidActuals((prev) => ({
                                    ...prev,
                                    [i + 1]: { ...(prev[i + 1] || {}), reps: n },
                                  }))}
                                />
                                {set.weight_kg != null && (
                                  <ActualInput
                                    target={set.weight_kg}
                                    value={pyramidActuals[i + 1]?.weight_kg}
                                    unit='ק"ג'
                                    color="#7F1D1D"
                                    onChange={(n) => setPyramidActuals((prev) => ({
                                      ...prev,
                                      [i + 1]: { ...(prev[i + 1] || {}), weight_kg: n },
                                    }))}
                                  />
                                )}
                              </span>
                            ) : (
                              <span style={{ ...T.setValue, color: valueColor }}>
                                {done ? String(actual?.reps ?? targetReps) : String(targetReps)}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Full-width completion bar — reuses existing
                      completedCount/plannedSets.length ratio. */}
                  <ProgressBar percent={completionPct} color="#7F1D1D" />
                </div>
              );
            })()}

            {/* Planned-sets coach view. Shared across PYRAMID / NONE /
                REPS / DROP_SET / DELORME. If an in-progress execution
                exists for the trainee+plan today, render each set as
                either GREEN COMPLETED (actual/planned) or DASHED
                PENDING (— / planned) and surface a "ביצוע המתאמן"
                tally header. When no execution exists, fall back to
                planned-only dashed-gray protocol view. Field columns
                are driven by tabata_data.set_fields per row. */}
            {expanded && PLANNED_SETS_METHODS[variant] && variant !== 'none' && variant !== 'reps_new' && isCoachMode && (() => {
              const methodMeta = PLANNED_SETS_METHODS[variant];
              const plannedSets = parsePlannedSets(exercise);
              if (plannedSets.length === 0) {
                return <EmptyMethodPlaceholder headline="טרם הוגדרו סטים" />;
              }

              const setFields = getSetFields(exercise);
              const hasExecution = !!pyramidExecutionId;
              const completedCount = hasExecution
                ? plannedSets.reduce(
                    (n, _, i) => n + (pyramidActuals[i + 1]?.completed ? 1 : 0),
                    0,
                  )
                : 0;
              const showVariation = !!methodMeta.variationRequired;

              return (
                <div dir="rtl">
                  {hasExecution && (
                    <div style={{
                      background: 'linear-gradient(135deg, #FFF5EE, white)',
                      border: '1px solid #FFD0AC',
                      borderRadius: 8,
                      padding: '10px 12px',
                      marginBottom: 10,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#993C1D' }}>
                        ביצוע המתאמן
                      </span>
                      <span style={{
                        fontFamily: "'Bebas Neue', sans-serif",
                        fontSize: 18,
                        color: '#FF6F20',
                      }}>
                        {completedCount} / {plannedSets.length} סטים
                      </span>
                    </div>
                  )}

                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 5,
                    marginBottom: 12,
                  }}>
                    {plannedSets.map((set, i) => {
                      const actual = pyramidActuals[i + 1];
                      const isDone = hasExecution && actual?.completed;
                      const numColor = isDone ? '#3FA06B' : '#D1D5DB';
                      return (
                        <div key={i} style={{
                          background: isDone ? '#F0FAF4' : 'white',
                          border: isDone ? '1.5px solid #3FA06B' : '1.5px dashed #D1D5DB',
                          borderRadius: 8,
                          padding: '10px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          flexWrap: 'wrap',
                        }}>
                          <span style={{
                            fontFamily: "'Bebas Neue', sans-serif",
                            fontSize: 22,
                            color: numColor,
                            lineHeight: 1,
                            minWidth: 24,
                          }}>
                            {String(i + 1).padStart(2, '0')}
                          </span>
                          {showVariation && set.variation_name && (
                            <span style={{
                              fontSize: 11,
                              color: isDone ? '#15803D' : '#993C1D',
                              background: isDone ? '#DCFCE7' : '#FFF5EE',
                              border: `1px solid ${isDone ? '#86EFAC' : '#FFD0AC'}`,
                              padding: '2px 8px',
                              borderRadius: 999,
                              fontWeight: 700,
                            }}>
                              {set.variation_name}
                            </span>
                          )}
                          {setFields.filter((f) => NUMERIC_FIELDS.has(f)).map((fieldId) => {
                            const meta = UNIT_COLOR_BY_FIELD[fieldId];
                            if (!meta || set[fieldId] == null) return null;
                            const display = isDone
                              ? `${actual?.[fieldId] ?? '-'} / ${set[fieldId]}`
                              : (hasExecution ? `— / ${set[fieldId]}` : set[fieldId]);
                            return (
                              <div key={fieldId} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                                <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: numColor, lineHeight: 1 }}>
                                  {display}
                                </span>
                                <span style={{
                                  fontSize: 10,
                                  color: isDone ? '#3FA06B' : (meta.textSecondary || '#9CA3AF'),
                                  opacity: isDone ? 0.85 : 1,
                                }}>
                                  {meta.label}
                                </span>
                              </div>
                            );
                          })}
                          {setFields.filter((f) => !NUMERIC_FIELDS.has(f) && set[f] != null && String(set[f]).trim()).map((fieldId) => {
                            if (fieldId === 'tempo') {
                              return <TempoBreakdown key={fieldId} tempo={set[fieldId]} />;
                            }
                            const meta = UNIT_COLOR_BY_FIELD[fieldId];
                            if (!meta) return null;
                            return (
                              <span key={fieldId} style={{
                                fontSize: 10,
                                color: meta.textPrimary,
                                background: meta.tint,
                                border: `1px solid ${meta.tint}`,
                                padding: '2px 6px',
                                borderRadius: 3,
                                fontWeight: 600,
                              }}>
                                {meta.label}: {set[fieldId]}
                              </span>
                            );
                          })}
                          {isDone && (
                            <Check size={16} color="#3FA06B" style={{ marginInlineStart: 'auto' }} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Planned-sets trainee view. Shared across PYRAMID / NONE /
                REPS / DROP_SET / DELORME. Each row renders past/active/
                future based on pyramidActiveIdx. Columns inside a row
                are driven by tabata_data.set_fields (numeric fields
                show actual/planned for past rows + +/- counters in the
                active row's input panel; text fields show planned-only
                chips). DROP_SET / DELORME surface a hint when the
                active row's variation_name is missing. State persists
                via exercise_set_logs through saveSetActual. */}
            {expanded && PLANNED_SETS_METHODS[variant] && variant !== 'none' && variant !== 'reps_new' && !isCoachMode && (() => {
              const methodMeta = PLANNED_SETS_METHODS[variant];
              const plannedSets = parsePlannedSets(exercise);
              if (plannedSets.length === 0) {
                return <EmptyMethodPlaceholder headline="טרם הוגדרו סטים" />;
              }
              const setFields = getSetFields(exercise);
              const numericFields = setFields.filter((f) => NUMERIC_FIELDS.has(f) && UNIT_COLOR_BY_FIELD[f]);
              const textFields = setFields.filter((f) => !NUMERIC_FIELDS.has(f) && UNIT_COLOR_BY_FIELD[f]);

              const minusBtnStyle = {
                width: 26, height: 26,
                background: 'white',
                border: '1px solid #FFD0AC',
                color: '#FF6F20',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 700,
                fontFamily: 'inherit',
                cursor: 'pointer',
              };
              const plusBtnStyle = {
                width: 26, height: 26,
                background: 'linear-gradient(135deg, #FF8B47, #FF6F20)',
                border: '1px solid #FF6F20',
                color: 'white',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 700,
                fontFamily: 'inherit',
                cursor: 'pointer',
              };
              const counterValueStyle = {
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 22,
                color: '#FF6F20',
                lineHeight: 1,
              };
              const counterTargetStyle = {
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 14,
                color: '#9CA3AF',
              };
              const counterLabelStyle = {
                fontSize: 9,
                color: '#993C1D',
                fontWeight: 700,
                textAlign: 'center',
                marginBottom: 4,
              };

              const methodHeroLabel =
                variant === 'pyramid'  ? 'סטים · פירמידה' :
                variant === 'drop_set' ? 'ירידות · דרופ סט' :
                                         'סטים · דה-לורם';
              const completionPct = plannedSets.length > 0
                ? (pyramidActiveIdx / plannedSets.length) * 100
                : 0;
              return (
                <div dir="rtl" style={{
                  background: '#FFF9F0',
                  borderRight: '4px solid #FF6F20',
                  borderRadius: '12px 0 0 12px',
                  padding: '18px 16px',
                  marginTop: 12,
                }}>
                  {/* Exercise name — right-aligned */}
                  <div style={{ ...T.name, color: '#1a1a1a', textAlign: 'right', marginBottom: 14 }}>
                    {exercise?.name || exercise?.exercise_name || 'תרגיל'}
                  </div>

                  {/* Two-column body: right anchor + per-set status rows */}
                  <div style={{ display: 'flex', gap: 14, alignItems: 'stretch' }}>
                    {/* RIGHT anchor — total set count + method label */}
                    <div style={{
                      minWidth: 80,
                      borderLeft: '1px solid #F0E0CC',
                      paddingLeft: 14,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <div style={{ ...T.hero, color: '#FF6F20' }}>{plannedSets.length}</div>
                      <div style={{ ...T.heroLbl, marginTop: 4, textAlign: 'center' }}>
                        {methodHeroLabel}
                      </div>
                    </div>

                    {/* LEFT body — one status row per planned set */}
                    <div style={{ flex: 1 }}>
                      {plannedSets.map((set, i) => {
                        const isLast = i === plannedSets.length - 1;
                        const done = i < pyramidActiveIdx;
                        const active = i === pyramidActiveIdx;

                        let dotBg, dotBorder, valueColor, labelColor;
                        if (done) {
                          dotBg = '#3FA06B'; dotBorder = '#3FA06B';
                          valueColor = '#3FA06B';
                          labelColor = '#1a1a1a';
                        } else if (active) {
                          dotBg = '#FF6F20'; dotBorder = '#FF6F20';
                          valueColor = '#FF6F20';
                          labelColor = '#FF6F20';
                        } else {
                          dotBg = 'transparent'; dotBorder = '#D1D5DB';
                          valueColor = '#9CA3AF';
                          labelColor = '#9CA3AF';
                        }

                        const setN = i + 1;
                        const targetReps = set.reps != null ? set.reps : '-';
                        let label;
                        if (variant === 'pyramid') {
                          label = `סט ${setN} · יעד ${targetReps}`;
                        } else if (variant === 'drop_set') {
                          const w = set.weight_kg ?? set.weight;
                          label = w != null
                            ? `סט ${setN} · ${w} ק"ג · יעד ${targetReps}`
                            : `סט ${setN} · יעד ${targetReps}`;
                        } else {
                          const p = set.percent ?? set.percentage;
                          label = p != null
                            ? `סט ${setN} · ${p}% · יעד ${targetReps}`
                            : `סט ${setN} · יעד ${targetReps}`;
                        }

                        const onTap = active
                          ? (e) => { e.stopPropagation(); onSaveAndAdvance(); }
                          : undefined;
                        const onKey = active
                          ? (e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                onSaveAndAdvance();
                              }
                            }
                          : undefined;

                        return (
                          <div
                            key={i}
                            role={active ? 'button' : undefined}
                            tabIndex={active ? 0 : -1}
                            onClick={onTap}
                            onKeyDown={onKey}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 12,
                              padding: '12px 4px',
                              borderBottom: isLast ? 'none' : '1px solid rgba(0,0,0,0.07)',
                              cursor: active ? 'pointer' : 'default',
                            }}
                          >
                            <span
                              aria-hidden="true"
                              style={{
                                width: 15,
                                height: 15,
                                borderRadius: '50%',
                                background: dotBg,
                                border: `2px solid ${dotBorder}`,
                                display: 'inline-block',
                                flex: '0 0 auto',
                              }}
                            />
                            <span style={{ ...T.setLabel, flex: 1, textAlign: 'right', color: labelColor }}>
                              {label}
                            </span>
                            {active ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                <ActualInput
                                  target={set.reps}
                                  value={pyramidActuals[i + 1]?.reps}
                                  onChange={(n) => setPyramidActuals((prev) => ({
                                    ...prev,
                                    [i + 1]: { ...(prev[i + 1] || {}), reps: n },
                                  }))}
                                />
                                {set.weight_kg != null && (
                                  <ActualInput
                                    target={set.weight_kg}
                                    value={pyramidActuals[i + 1]?.weight_kg}
                                    unit='ק"ג'
                                    onChange={(n) => setPyramidActuals((prev) => ({
                                      ...prev,
                                      [i + 1]: { ...(prev[i + 1] || {}), weight_kg: n },
                                    }))}
                                  />
                                )}
                              </span>
                            ) : (
                              <span style={{ ...T.setValue, color: valueColor }}>{String(targetReps)}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Full-width completion bar */}
                  <ProgressBar percent={completionPct} color="#FF6F20" />
                </div>
              );
            })()}

            {/* TABATA — new "control panel" layout: header + 5 clock
                stats + rotation list + launch button. Fires only when
                the exercise carries the new shape (exercises_in_rotation
                or clock_settings); legacy tabata rows fall through to
                the existing detailed block below. Trainee taps the
                launcher → useClock().startTabata() with the rotation
                + navigate to /clocks. Coach view shows a compact
                summary line instead of the button. */}
            {expanded && variant === 'tabata' && hasNewTabataShape(exercise) && (() => {
              const cs = resolveTabataClockSettings(exercise);
              const rotation = resolveTabataRotation(exercise);
              if (rotation.length === 0) {
                return <EmptyMethodPlaceholder headline="טרם הוגדרה רוטציה" />;
              }
              // Phase 3 — palette via shared BRAND tokens.
              // 2x2 clock grid: drops rest_between_sets per phase-2c
              // spec; that value still feeds the coach summary line +
              // the actual clock launch via cs.rest_between_sets.
              const statBoxes = [
                { value: cs.work_seconds, label: 'עבודה' },
                { value: cs.rest_seconds, label: 'מנוחה' },
                { value: cs.rounds,       label: 'סבבים' },
                { value: cs.sets,         label: 'סטים'  },
              ];

              return (
                <div dir="rtl" style={{
                  background: 'white',
                  border: `2px solid ${BRAND.stripeActive}`,
                  borderRadius: 14,
                  padding: 12,
                  boxShadow: 'rgba(220,38,38,0.15) 0px 4px 10px',
                  marginBottom: 12,
                }}>
                  {/* Header band — method-tag chip + rotation count */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 12px',
                    background: `linear-gradient(135deg, ${BRAND.panelBg}, #FFFFFF)`,
                    border: `1px solid ${BRAND.panelBorder}`,
                    borderRadius: 10,
                    marginBottom: 11,
                  }}>
                    <span style={{
                      fontSize: 13,
                      fontWeight: 800,
                      color: BRAND.tagText,
                      background: BRAND.panelBg,
                      padding: '2px 8px',
                      borderRadius: 5,
                    }}>
                      טבטה
                    </span>
                    <span style={{
                      fontFamily: "'Bebas Neue', sans-serif",
                      fontSize: 14,
                      color: BRAND.stripeActive,
                      background: 'white',
                      padding: '2px 8px',
                      borderRadius: 5,
                      border: `1px solid ${BRAND.panelBorder}`,
                    }}>
                      {rotation.length} {rotation.length === 1 ? 'תרגיל ברוטציה' : 'תרגילים ברוטציה'}
                    </span>
                  </div>

                  <SectionLabel>רוטציה</SectionLabel>
                  {/* 1. Rotation pills — TOP, horizontal flex-wrap */}
                  {rotation.length > 0 ? (
                    <div
                      dir="rtl"
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 5,
                        marginBottom: 11,
                        width: '100%',
                      }}
                    >
                      {rotation.map((item, idx) => (
                        <div key={idx} style={{
                          background: BRAND.panelBg,
                          border: `1px solid ${BRAND.panelBorder}`,
                          color: BRAND.tagText,
                          borderRadius: 8,
                          padding: '6px 9px',
                          fontSize: 11,
                          fontWeight: 700,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}>
                          <span style={{
                            fontFamily: "'Barlow Condensed', sans-serif",
                            fontSize: 12,
                            fontWeight: 900,
                            color: BRAND.stripeActive,
                          }}>{idx + 1}</span>
                          <span>{item?.name ?? item?.exerciseName ?? '—'}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{
                      textAlign: 'center',
                      padding: 12,
                      fontSize: 11,
                      color: '#9CA3AF',
                      background: '#FAFAFA',
                      borderRadius: 7,
                      marginBottom: 11,
                    }}>
                      אין תרגילים מוגדרים ברוטציה
                    </div>
                  )}

                  <div style={{ marginTop: 14 }}>
                  <SectionLabel>שעון</SectionLabel>
                  {/* 2. Clock settings grid — 2x2: work / rest / rounds / sets */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: 6,
                    marginBottom: 11,
                  }}>
                    {statBoxes.map((cfg, i) => (
                      <div key={i} style={{
                        background: BRAND.panelBg,
                        border: `1px solid ${BRAND.panelBorder}`,
                        borderRadius: 8,
                        padding: '7px 9px',
                        textAlign: 'center',
                      }}>
                        <div style={{
                          fontSize: 9,
                          color: BRAND.tagText,
                          fontWeight: 700,
                          letterSpacing: 0.4,
                        }}>{cfg.label}</div>
                        <div style={{
                          fontFamily: "'Barlow Condensed', sans-serif",
                          fontSize: 18,
                          fontWeight: 900,
                          color: BRAND.stripeActive,
                          marginTop: 2,
                          lineHeight: 1,
                        }}>{cfg.value}</div>
                      </div>
                    ))}
                  </div>
                  </div>

                  {/* 3. Launch button — trainee only */}
                  {!isCoachMode && (
                    <button
                      type="button"
                      onClick={handleLaunchTabata}
                      disabled={launchingClock}
                      style={{
                        width: '100%',
                        background: launchingClock ? '#D1D5DB' : BRAND.stripeActive,
                        color: '#FFFFFF',
                        border: 'none',
                        padding: '9px',
                        borderRadius: 8,
                        fontWeight: 800,
                        fontSize: 13,
                        fontFamily: "'Barlow Condensed', sans-serif",
                        letterSpacing: 0.5,
                        textAlign: 'center',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        cursor: launchingClock ? 'wait' : 'pointer',
                        opacity: launchingClock ? 0.7 : 1,
                      }}
                    >
                      <Timer size={18} />
                      {launchingClock ? 'מפעיל שעון...' : 'הפעל שעון טבטה'}
                    </button>
                  )}

                  {/* Coach summary — replaces launch button in coach view */}
                  {isCoachMode && (
                    <div style={{
                      textAlign: 'center',
                      fontSize: 11,
                      color: BRAND.tagText,
                      fontWeight: 700,
                      padding: 10,
                      background: BRAND.panelBg,
                      border: `1px solid ${BRAND.panelBorder}`,
                      borderRadius: 8,
                    }}>
                      טבטה · {cs.work_seconds}/{cs.rest_seconds} · {cs.rounds} סבבים × {cs.sets} סטים
                    </div>
                  )}
                </div>
              );
            })()}

            {/* TABATA — per-rotation hero+fill blocks. Manual fill (the
                clock itself drives timing and doesn't write back yet),
                same drillIndex pattern as super_set/combo/circuit so the
                stored rows live alongside the other nested-fill methods
                in exercise_set_logs. Rendered as a SIBLING of the clock
                summary above so the two stack visually inside the same
                open card. */}
            {expanded && variant === 'tabata' && hasNewTabataShape(exercise) && (() => {
              const cs = resolveTabataClockSettings(exercise);
              const rotation = resolveTabataRotation(exercise);
              if (rotation.length === 0) return null;

              const totalIntervals = (Number.isFinite(cs.rounds) ? cs.rounds : 0)
                * (Number.isFinite(cs.sets) ? cs.sets : 0);
              if (totalIntervals <= 0) return null;

              // cyclesPerExercise = how many times the trainee returns
              // to each rotation slot across the whole tabata. ceil so
              // the last cycle is still tracked when the division isn't
              // clean (those extra cells just sit dashed if the clock
              // runs out before reaching them).
              const cyclesPerExercise = Math.ceil(totalIntervals / rotation.length);

              // Aggregate completion across every (rotation, cycle) cell.
              let totalCells = 0;
              let doneCells = 0;
              for (let d = 0; d < rotation.length; d++) {
                for (let c = 0; c < cyclesPerExercise; c++) {
                  totalCells++;
                  if (roundsActuals[d]?.[c + 1]?.completed) doneCells++;
                }
              }
              const overallPct = totalCells > 0
                ? Math.round((doneCells / totalCells) * 100)
                : 0;
              const cyclesLabel = cyclesPerExercise === 1
                ? '1 סבב'
                : `${cyclesPerExercise} סבבים`;

              return (
                <div dir="rtl" style={{
                  background: '#FFFFFF',
                  border: `1px solid ${BRAND.cardBorder}`,
                  borderRadius: 14,
                  padding: '11px 12px',
                  marginBottom: 12,
                }}>
                  {/* Header tag + overall tally */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 12px',
                    background: BRAND.panelBg,
                    border: `1px solid ${BRAND.panelBorder}`,
                    borderRadius: 10,
                    marginBottom: 12,
                  }}>
                    <span style={{
                      fontSize: 13,
                      fontWeight: 800,
                      color: BRAND.tagText,
                      background: BRAND.tagBg,
                      padding: '2px 7px',
                      borderRadius: 5,
                    }}>
                      ביצוע בפועל
                    </span>
                    <span style={{
                      fontFamily: "'Bebas Neue', sans-serif",
                      fontSize: 14,
                      color: BRAND.stripeActive,
                      background: 'white',
                      padding: '2px 8px',
                      borderRadius: 5,
                      border: `1px solid ${BRAND.panelBorder}`,
                    }}>
                      {doneCells} / {totalCells}
                    </span>
                  </div>

                  {/* Per-rotation hero+fill blocks */}
                  {rotation.map((item, dIdx) => {
                    const drillIdx = dIdx;
                    const innerName = item?.name ?? item?.exerciseName ?? 'תרגיל ללא שם';
                    // Optional explicit reps target on the rotation row;
                    // tabata typically has none, in which case we render
                    // "עד מקסימום" instead of a number.
                    const explicitReps = Number.isFinite(Number(item?.reps)) ? Number(item.reps) : null;

                    let drillDone = 0;
                    let firstUnfilledIdx = cyclesPerExercise;
                    for (let c = 0; c < cyclesPerExercise; c++) {
                      const cell = roundsActuals[drillIdx]?.[c + 1];
                      if (cell?.completed) drillDone++;
                      else if (firstUnfilledIdx === cyclesPerExercise) firstUnfilledIdx = c;
                    }
                    const drillAllDone = drillDone >= cyclesPerExercise;
                    const drillPct = cyclesPerExercise > 0
                      ? (drillDone / cyclesPerExercise) * 100
                      : 0;

                    return (
                      <div key={dIdx} style={{
                        direction: 'rtl',
                        background: '#FFF9F0',
                        borderRight: '4px solid #FF6F20',
                        borderRadius: '12px 0 0 12px',
                        padding: '14px 14px',
                        marginBottom: dIdx < rotation.length - 1 ? 14 : 6,
                      }}>
                        {/* Rotation header — index badge + name */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          marginBottom: 12,
                        }}>
                          <span style={{
                            fontFamily: "'Bebas Neue', sans-serif",
                            fontSize: 16,
                            color: BRAND.stripeActive,
                            background: BRAND.panelBg,
                            padding: '2px 9px',
                            borderRadius: 5,
                            fontWeight: 800,
                            border: `1px solid ${BRAND.panelBorder}`,
                          }}>
                            {String(dIdx + 1).padStart(2, '0')}
                          </span>
                          <span style={{
                            flex: 1,
                            ...T.name,
                            color: '#1a1a1a',
                            textAlign: 'right',
                          }}>
                            {innerName}
                          </span>
                        </div>

                        {/* Two-column: hero TARGET on right, fill boxes on left */}
                        <div style={{ display: 'flex', flexDirection: 'row', gap: 14, alignItems: 'stretch' }}>
                          {/* RIGHT — hero target. Tabata has no built-in
                              reps target, so render "עד מקסימום" without
                              a number unless the rotation row explicitly
                              carries one (rare). */}
                          <div style={{
                            flex: '0 0 110px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: '#FFFFFF',
                            border: '1px solid #FFE0C2',
                            borderRadius: 12,
                            padding: '14px 6px',
                          }}>
                            {explicitReps != null ? (
                              <>
                                <div style={{ ...T.hero, color: '#FF6F20' }}>{explicitReps}</div>
                                <div style={{ ...T.heroLbl, marginTop: 4 }}>יעד חזרות</div>
                              </>
                            ) : (
                              <>
                                <div style={{
                                  fontFamily: "'Bebas Neue', sans-serif",
                                  fontSize: 24,
                                  fontWeight: 800,
                                  color: '#FF6F20',
                                  lineHeight: 1,
                                  textAlign: 'center',
                                }}>
                                  עד מקסימום
                                </div>
                                <div style={{ ...T.heroLbl, marginTop: 4 }}>חזרות בפרץ</div>
                              </>
                            )}
                            <div style={{
                              marginTop: 10,
                              fontFamily: SANS_FONT,
                              fontSize: 12,
                              fontWeight: 600,
                              color: '#777',
                            }}>{cyclesLabel}</div>
                          </div>

                          {/* LEFT — per-cycle fill boxes */}
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {Array.from({ length: cyclesPerExercise }).map((_, cIdx) => {
                              const cell = roundsActuals[drillIdx]?.[cIdx + 1];
                              const done = !!cell?.completed;
                              const active = !done && !drillAllDone && cIdx === firstUnfilledIdx;
                              const loggedReps = cell?.reps;
                              let dotBg, dotBorder, valueColor, valueText, rowBorder;
                              if (done) {
                                dotBg = '#3FA06B';
                                dotBorder = '#3FA06B';
                                valueColor = '#3FA06B';
                                rowBorder = '1.5px solid #3FA06B';
                                valueText = loggedReps != null && loggedReps !== '' ? String(loggedReps) : '✓';
                              } else if (active) {
                                dotBg = '#FF6F20';
                                dotBorder = '#FF6F20';
                                valueColor = '#FF6F20';
                                rowBorder = '1.5px dashed #FF6F20';
                                valueText = '?';
                              } else {
                                dotBg = 'transparent';
                                dotBorder = '#D1D5DB';
                                valueColor = '#9CA3AF';
                                rowBorder = '1.5px dashed #D1D5DB';
                                valueText = '–';
                              }
                              return (
                                <div
                                  key={cIdx}
                                  role="button"
                                  tabIndex={0}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRoundsPickerState({ drillIdx, setIdx: cIdx + 1, mode: 'reps' });
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      setRoundsPickerState({ drillIdx, setIdx: cIdx + 1, mode: 'reps' });
                                    }
                                  }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 12,
                                    padding: '11px 8px',
                                    borderRadius: 11,
                                    background: '#FFFFFF',
                                    border: rowBorder,
                                    cursor: 'pointer',
                                  }}
                                >
                                  <span
                                    aria-hidden="true"
                                    style={{
                                      width: 14,
                                      height: 14,
                                      borderRadius: '50%',
                                      background: dotBg,
                                      border: `2px solid ${dotBorder}`,
                                      display: 'inline-block',
                                      flex: '0 0 auto',
                                    }}
                                  />
                                  <span style={{ ...T.setLabel }}>{`סבב ${cIdx + 1}`}</span>
                                  <span style={{ ...T.setValue, color: valueColor }}>{valueText}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Per-rotation completion bar */}
                        <ProgressBar percent={drillPct} color="#FF6F20" />
                      </div>
                    );
                  })}

                  {/* Overall completion across every (rotation, cycle) cell */}
                  <div style={{
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: '#FFF4E6',
                    border: '1px solid #FFD9B0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}>
                    <span style={{
                      fontSize: 12,
                      color: '#555',
                      fontFamily: SANS_FONT,
                      fontWeight: 600,
                    }}>
                      {doneCells}/{totalCells} תאים מולאו
                    </span>
                    <span style={{
                      fontFamily: "'Bebas Neue', sans-serif",
                      fontSize: 22,
                      fontWeight: 700,
                      color: '#FF6F20',
                      lineHeight: 1,
                    }}>
                      {overallPct}%
                    </span>
                  </div>

                  {/* Shared picker for every (rotation, cycle) cell.
                      Same roundsPickerState instance used by the rounds/
                      stations blocks — only one cell can be open at a
                      time anywhere on the card. */}
                  <ScrollPickerPopup
                    isOpen={roundsPickerState != null}
                    value={(() => {
                      if (roundsPickerState == null) return null;
                      const cell = roundsActuals[roundsPickerState.drillIdx]?.[roundsPickerState.setIdx];
                      const ref = rotation[roundsPickerState.drillIdx] || {};
                      return cell?.reps
                        ?? (Number.isFinite(Number(ref.reps)) ? Number(ref.reps) : null);
                    })()}
                    options={REPS_OPTIONS}
                    onClose={() => setRoundsPickerState(null)}
                    onSelect={(v) => {
                      if (roundsSaving) return;
                      if (roundsPickerState == null) return;
                      onRoundsFillSave(
                        roundsPickerState.drillIdx,
                        roundsPickerState.setIdx,
                        v,
                        'reps',
                      );
                    }}
                    title={(() => {
                      if (roundsPickerState == null) return '';
                      const ref = rotation[roundsPickerState.drillIdx] || {};
                      const innerName = ref?.name ?? ref?.exerciseName ?? 'תרגיל';
                      return `${innerName} · סבב ${roundsPickerState.setIdx} — חזרות שבוצעו`;
                    })()}
                  />
                </div>
              );
            })()}

        {expanded && variant === 'tabata' && !hasNewTabataShape(exercise) && (() => {
          const cs = td?.clock_settings || null;
          const work = toSeconds(cs?.work_seconds ?? td?.work_time ?? exercise.work_time);
          const rest = toSeconds(cs?.rest_seconds ?? td?.rest_time ?? exercise.rest_time);
          const rounds = cs?.rounds ?? td?.rounds ?? exercise?.rounds ?? null;
          const sets = cs?.sets ?? exercise?.sets ?? null;
          const rbs = toSeconds(cs?.rest_between_sets ?? td?.rest_between_sets ?? exercise?.rest_between_sets);
          const boxBase = {
            background: '#FFF8EF',
            border: '1px solid #EFE0C8',
            borderRadius: 8,
            padding: '10px 12px',
            textAlign: 'center',
          };
          const boxHi = {
            ...boxBase,
            background: '#FFF0E4',
            border: '1px solid #FFD0AC',
          };
          const labelStyle = {
            fontSize: 11,
            color: '#888',
            marginBottom: 4,
            fontWeight: 500,
            fontFamily: SANS_FONT,
          };
          const numStyle = {
            fontFamily: NUM_FONT,
            fontSize: 24,
            fontWeight: 700,
            color: '#1a1a1a',
            lineHeight: 1,
          };
          const unitStyle = {
            fontSize: 12,
            color: '#777',
            marginTop: 2,
            fontWeight: 600,
            fontFamily: SANS_FONT,
          };
          const Box = ({ label, value, unit, highlight }) => (
            <div style={highlight ? boxHi : boxBase}>
              <div style={labelStyle}>{label}</div>
              <div style={numStyle}>{value}</div>
              {unit && <div style={unitStyle}>{unit}</div>}
            </div>
          );
          return (
            <div style={{ padding: '0 36px 12px 16px', direction: 'rtl' }}>
              {/* Row 1 — work / rest / rounds */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 8 }}>
                {work != null && <Box label="עבודה" value={work} unit="שניות" highlight />}
                {rest != null && <Box label="מנוחה" value={rest} unit="שניות" />}
                {hasValue(rounds) && <Box label="סבבים" value={rounds} />}
              </div>
              {/* Row 2 — sets / rest between sets */}
              {(hasValue(sets) || rbs != null) && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 12 }}>
                  {hasValue(sets) && <Box label="מספר סטים" value={sets} />}
                  {rbs != null && <Box label="מנוחה בין סטים" value={rbs} unit="שניות" />}
                </div>
              )}
              {/* Sub-exercises — numbered round badges, parsed via
                  the existing getSubExercises helper (handles the TEXT
                  JSONB shape with try/catch). */}
              {subExercises.length > 0 && (
                <div>
                  {subExercises.map((sub, i) => {
                    const target = getDrillTarget(sub);
                    return (
                      <div key={i} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 0',
                        borderBottom: i === subExercises.length - 1 ? 'none' : '1px solid #EFE9D8',
                      }}>
                        <span style={{
                          width: 26, height: 26,
                          background: '#FFF0E4',
                          color: '#FF6F20',
                          borderRadius: '50%',
                          fontFamily: NUM_FONT,
                          fontSize: 13, fontWeight: 700,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }} aria-hidden>{i + 1}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 14, fontWeight: 500, color: '#1a1a1a',
                            fontFamily: SANS_FONT,
                          }}>
                            {getDrillName(sub, i)}
                          </div>
                          {target?.display && (
                            <div style={{
                              fontSize: 12, color: '#888', marginTop: 2,
                              fontFamily: SANS_FONT,
                            }}>
                              {target.display}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Trainee ✓-סטים toggle row — the ONLY input on a tabata
                  exercise. Same visual + handler as the normal sets
                  fill row; the trainee never enters reps or seconds
                  for tabata. Coach view skips this branch (read-only).
                  Box count = totalSets (already min(1, exercise.sets)). */}
              {!isCoachMode && (() => {
                let doneSetsTabata = 0;
                for (let i = 0; i < totalSets; i++) if (isSetDone(i)) doneSetsTabata++;
                const pctTabata = totalSets > 0
                  ? Math.round((doneSetsTabata / totalSets) * 100)
                  : 0;
                const summaryDoneT = pctTabata >= 100;
                return (
                  <>
                    <div style={{
                      display: 'flex',
                      alignItems: 'flex-end',
                      gap: 12,
                      padding: '11px 0',
                      borderTop: '1px solid #EFE9D8',
                      direction: 'rtl',
                      marginTop: subExercises.length > 0 ? 4 : 0,
                    }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'baseline',
                        gap: 6,
                        flexShrink: 0,
                      }}>
                        <span style={{
                          fontFamily: NUM_FONT,
                          fontSize: 24, fontWeight: 700,
                          color: '#1a1a1a', lineHeight: 1,
                        }}>{totalSets}</span>
                        <span style={{
                          fontFamily: SANS_FONT,
                          fontSize: 13, fontWeight: 600, color: '#777',
                        }}>סטים</span>
                      </span>
                      <div style={{
                        flex: 1,
                        minWidth: 0,
                        display: 'flex',
                        gap: 6,
                        overflowX: 'auto',
                        WebkitOverflowScrolling: 'touch',
                        paddingBottom: 4,
                        scrollbarWidth: 'thin',
                      }}>
                        {Array.from({ length: totalSets }).map((_, idx) => {
                          const done = isSetDone(idx);
                          return (
                            <div key={idx} style={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              flexShrink: 0,
                              width: 40,
                            }}>
                              <span style={{
                                fontSize: 9, color: '#999',
                                marginBottom: 3,
                                fontFamily: SANS_FONT,
                                fontWeight: 600,
                                lineHeight: 1,
                              }}>סט {idx + 1}</span>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleSetToggle(idx); }}
                                aria-checked={done}
                                role="checkbox"
                                style={{
                                  width: 40, height: 38, borderRadius: 8,
                                  border: done ? '2px solid #4CAF50' : '2px dashed #C9B89A',
                                  background: done ? '#F1FAF1' : '#FCFBF7',
                                  color: '#2e7d32',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: 18, fontWeight: 900, lineHeight: 1,
                                  padding: 0,
                                  flexShrink: 0,
                                }}
                              >{done ? '✓' : ''}</button>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Live summary — sets-only for tabata (no reps /
                        time totals because there's no numeric input). */}
                    <div style={{
                      marginTop: 12,
                      padding: '10px 12px',
                      borderRadius: 10,
                      background: summaryDoneT ? '#F1FAF1' : '#FFF4E6',
                      border: `1px solid ${summaryDoneT ? '#BFE3BF' : '#FFD9B0'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      direction: 'rtl',
                    }}>
                      <div style={{
                        fontSize: 12,
                        color: '#555',
                        fontFamily: SANS_FONT,
                        fontWeight: 600,
                      }}>
                        {doneSetsTabata}/{totalSets} סטים
                      </div>
                      <div style={{
                        fontFamily: NUM_FONT,
                        fontSize: 24,
                        fontWeight: 700,
                        lineHeight: 1,
                        color: summaryDoneT ? '#2e7d32' : '#FF6F20',
                      }}>{pctTabata}%</div>
                    </div>
                  </>
                );
              })()}
            </div>
          );
        })()}

        {/* List/superset variant — single render path for coach + trainee.
            The fuller layout (per-sub-set fill table for trainee) lives in
            the dead-code legacy return at the bottom of the component;
            this active block handles header+name+pills so the user-visible
            card finally expands. Trainee per-set fill table is a follow-up. */}
        {expanded && variant === 'list' && (() => {
          const drills = subExercises;
          if (drills.length === 0) {
            return (
              <div style={{
                padding: 16, textAlign: 'center',
                background: '#FFFFFF', borderRadius: 10,
                border: '1px dashed #e9d5ff',
                fontSize: 13, color: '#888',
                margin: '0 16px 16px',
              }}>
                אין תרגילים ברשימה
              </div>
            );
          }
          return (
            <div style={{ padding: '0 16px 16px' }}>
              {/* Parent's own paramItems — kept above sub-cards in coach
                  mode for editor reference. Trainee skip = same layout
                  as the prior shipped trainee mini-cards. */}
              {isCoachMode && paramItems.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  {paramItems.map((it, i) => (
                    <ParamListRow
                      key={it.key}
                      value={it.value}
                      unit={it.unit}
                      descriptor={it.descriptor}
                      isLast={i === paramItems.length - 1}
                    />
                  ))}
                </div>
              )}
              {drills.map((sub, di) => {
                const subParamItems = buildParamItemsFor(sub, null);
                return (
                  <div key={sub.id || `drill-${di}`} style={{
                    background: '#FFFFFF',
                    border: '1px solid #F2EDE3',
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 10,
                  }}>
                    {/* Header — orange index square + sub-exercise name */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      marginBottom: subParamItems.length > 0 ? 8 : 0,
                    }}>
                      <span style={{
                        width: 24, height: 24,
                        background: '#FF6F20', color: '#FFFFFF',
                        borderRadius: 4,
                        fontFamily: NUM_FONT,
                        fontSize: 14, fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}>{di + 1}</span>
                      <span style={{
                        fontFamily: SANS_FONT,
                        fontSize: 15, fontWeight: 700, color: '#1a1a1a',
                        wordBreak: 'break-word',
                      }}>{getDrillName(sub, di)}</span>
                    </div>
                    {/* Inline param pills — closed-card pill style,
                        scoped to this sub-exercise's prescribed values. */}
                    {subParamItems.length > 0 && (
                      <div style={{
                        display: 'flex', flexWrap: 'wrap', gap: 4,
                        direction: 'rtl',
                      }}>
                        {subParamItems.map((it) => (
                          <span key={it.key} style={{
                            background: '#FFF0E4',
                            color: '#993C1D',
                            fontSize: 11,
                            fontWeight: 500,
                            padding: '2px 7px',
                            borderRadius: 6,
                            whiteSpace: 'nowrap',
                          }}>{it.display}</span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              <CoachNoteBox text={description} />
            </div>
          );
        })()}

        {/* Premium-Soft 45/55 open layout — trainee + normal variant
            + rep-based sets only. Hero (target reps + status dots + label)
            on the right (RTL start), set-by-set rows on the left. Sub-
            exercise variants (tabata, list) keep their own existing
            branches above; coach view, display-mode sections, and
            time-only exercises fall through to the legacy IIFE below. */}
        {expanded && (variant === 'normal' || variant === 'none' || variant === 'reps_new')
          && sectionTrackingMode !== 'display'
          && hasValue(exercise.sets)
          && hasValue(exercise.reps)
          && (() => {
          const targetReps = parseInt(exercise.reps, 10) || 0;
          let doneCount = 0;
          for (let i = 0; i < totalSets; i++) if (isSetDone(i)) doneCount++;
          const activeSetIdx = Math.min(doneCount, totalSets - 1);
          const allDone = doneCount >= totalSets;
          const completionPct = totalSets > 0 ? (doneCount / totalSets) * 100 : 0;
          const pickerInitialValue = pickerOpenSetIdx != null
            ? (setLog?.[pickerOpenSetIdx]?.reps_completed ?? targetReps)
            : null;
          return (
            <div style={{
              direction: 'rtl',
              background: '#FFF9F0',
              borderRight: '4px solid #FF6F20',
              borderRadius: '12px 0 0 12px',
              padding: '18px 16px',
              marginTop: 12,
            }}>
              {/* Exercise name — top bar */}
              <div style={{ ...T.name, color: '#1a1a1a', marginBottom: 14, textAlign: 'center' }}>
                {exercise?.name || exercise?.exercise_name || 'תרגיל'}
              </div>

              {/* Two-column layout: hero TARGET on RIGHT (first child
                  under RTL), per-set fill boxes on LEFT. */}
              <div style={{ display: 'flex', flexDirection: 'row', gap: 14, alignItems: 'stretch' }}>
                {/* RIGHT — hero target */}
                <div style={{
                  flex: '0 0 116px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#FFFFFF',
                  border: '1px solid #FFE0C2',
                  borderRadius: 12,
                  padding: '16px 8px',
                }}>
                  <div style={{ ...T.hero, color: '#FF6F20' }}>{targetReps}</div>
                  <div style={{ ...T.heroLbl, marginTop: 4 }}>יעד חזרות</div>
                  <div style={{
                    marginTop: 10,
                    fontFamily: SANS_FONT,
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#777',
                  }}>{`${totalSets} סטים`}</div>
                </div>

                {/* LEFT — per-set fill boxes */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {Array.from({ length: totalSets }).map((_, i) => {
                    const done = isSetDone(i);
                    const active = !done && !allDone && i === activeSetIdx;
                    const loggedReps = setLog?.[i]?.reps_completed;
                    let dotBg, dotBorder, valueColor, valueText, rowBorder;
                    if (done) {
                      dotBg = '#3FA06B';
                      dotBorder = '#3FA06B';
                      valueColor = '#3FA06B';
                      rowBorder = '1.5px solid #3FA06B';
                      valueText = hasValue(loggedReps) ? String(loggedReps) : String(targetReps);
                    } else if (active) {
                      dotBg = '#FF6F20';
                      dotBorder = '#FF6F20';
                      valueColor = '#FF6F20';
                      rowBorder = '1.5px dashed #FF6F20';
                      valueText = '?';
                    } else {
                      dotBg = 'transparent';
                      dotBorder = '#D1D5DB';
                      valueColor = '#9CA3AF';
                      rowBorder = '1.5px dashed #D1D5DB';
                      valueText = '–';
                    }
                    return (
                      <div
                        key={i}
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); setPickerOpenSetIdx(i); }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setPickerOpenSetIdx(i);
                          }
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 14,
                          padding: '14px 8px',
                          borderRadius: 11,
                          background: '#FFFFFF',
                          border: rowBorder,
                          cursor: 'pointer',
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: '50%',
                            background: dotBg,
                            border: `2px solid ${dotBorder}`,
                            display: 'inline-block',
                            flex: '0 0 auto',
                          }}
                        />
                        <span style={{ ...T.setLabel }}>{`סט ${i + 1}`}</span>
                        <span style={{ ...T.setValue, color: valueColor }}>{valueText}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Completion bar at bottom — sets filled / total. */}
              <ProgressBar percent={completionPct} color="#FF6F20" />

              {/* Picker — inline overlay, not Radix. Writes through
                  onSetValueChange so UnifiedPlanBuilder stamps the
                  numeric value + done:true in one shot. */}
              <ScrollPickerPopup
                isOpen={pickerOpenSetIdx != null}
                value={pickerInitialValue}
                options={REPS_OPTIONS}
                onClose={() => setPickerOpenSetIdx(null)}
                onSelect={(v) => {
                  const idx = pickerOpenSetIdx;
                  console.log('[ExerciseCard] saveSetLog →', {
                    exerciseId: exercise.id,
                    setIdx: idx,
                    value: v,
                    mode: 'reps',
                  });
                  if (typeof onSetValueChange === 'function' && idx != null) {
                    onSetValueChange(exercise, idx, v, 'reps');
                  }
                  console.log('[ExerciseCard] saveSetLog ✓', {
                    exerciseId: exercise.id,
                    setIdx: idx,
                    value: v,
                  });
                }}
                title={`סט ${pickerOpenSetIdx != null ? pickerOpenSetIdx + 1 : ''} — חזרות שבוצעו`}
              />
            </div>
          );
        })()}

        {/* Premium-Soft 45/55 open layout — TIME / static-hold variant.
            Mirrors the rep card directly above: right-anchored TARGET
            hero shows the prescribed seconds (work_time → static_hold_time
            fallback) + "יעד שניות" + the set count; per-set fill boxes
            on the left open the SECONDS picker and write through
            onSetValueChange with mode 'seconds' → time_completed. Fires
            only when the exercise carries sets but no reps target AND
            has a time prescription, so it doesn't compete with the rep
            card or with pyramid/drop_set/delorme (which keep their own
            multi-row layouts). */}
        {expanded && (variant === 'normal' || variant === 'none' || variant === 'reps_new')
          && sectionTrackingMode !== 'display'
          && hasValue(exercise.sets)
          && !hasValue(exercise.reps)
          && (hasValue(exercise.work_time) || hasValue(exercise.static_hold_time))
          && (() => {
          const targetSeconds = parseInt(exercise.work_time, 10)
            || parseInt(exercise.static_hold_time, 10)
            || 0;
          let doneCount = 0;
          for (let i = 0; i < totalSets; i++) {
            const t = setLog?.[i]?.time_completed;
            if (t != null && t !== '' && Number(t) > 0) doneCount++;
          }
          const activeSetIdx = Math.min(doneCount, totalSets - 1);
          const allDone = doneCount >= totalSets;
          const completionPct = totalSets > 0 ? (doneCount / totalSets) * 100 : 0;
          const pickerInitialValue = timePickerOpenSetIdx != null
            ? (setLog?.[timePickerOpenSetIdx]?.time_completed ?? targetSeconds)
            : null;
          return (
            <div style={{
              direction: 'rtl',
              background: '#FFF9F0',
              borderRight: '4px solid #FF6F20',
              borderRadius: '12px 0 0 12px',
              padding: '18px 16px',
              marginTop: 12,
            }}>
              {/* Exercise name — top bar */}
              <div style={{ ...T.name, color: '#1a1a1a', marginBottom: 14, textAlign: 'center' }}>
                {exercise?.name || exercise?.exercise_name || 'תרגיל'}
              </div>

              {/* Two-column layout: hero TARGET seconds on RIGHT (first
                  child under RTL), per-set fill boxes on LEFT. */}
              <div style={{ display: 'flex', flexDirection: 'row', gap: 14, alignItems: 'stretch' }}>
                {/* RIGHT — hero target seconds */}
                <div style={{
                  flex: '0 0 116px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#FFFFFF',
                  border: '1px solid #FFE0C2',
                  borderRadius: 12,
                  padding: '16px 8px',
                }}>
                  <div style={{ ...T.hero, color: '#FF6F20' }}>{targetSeconds}</div>
                  <div style={{ ...T.heroLbl, marginTop: 4 }}>יעד שניות</div>
                  <div style={{
                    marginTop: 10,
                    fontFamily: SANS_FONT,
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#777',
                  }}>{`${totalSets} סטים`}</div>
                </div>

                {/* LEFT — per-set fill boxes */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {Array.from({ length: totalSets }).map((_, i) => {
                    const logged = setLog?.[i]?.time_completed;
                    const done = logged != null && logged !== '' && Number(logged) > 0;
                    const active = !done && !allDone && i === activeSetIdx;
                    let dotBg, dotBorder, valueColor, valueText, rowBorder;
                    if (done) {
                      dotBg = '#3FA06B';
                      dotBorder = '#3FA06B';
                      valueColor = '#3FA06B';
                      rowBorder = '1.5px solid #3FA06B';
                      valueText = String(logged);
                    } else if (active) {
                      dotBg = '#FF6F20';
                      dotBorder = '#FF6F20';
                      valueColor = '#FF6F20';
                      rowBorder = '1.5px dashed #FF6F20';
                      valueText = '?';
                    } else {
                      dotBg = 'transparent';
                      dotBorder = '#D1D5DB';
                      valueColor = '#9CA3AF';
                      rowBorder = '1.5px dashed #D1D5DB';
                      valueText = '–';
                    }
                    return (
                      <div
                        key={i}
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); setTimePickerOpenSetIdx(i); }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setTimePickerOpenSetIdx(i);
                          }
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 14,
                          padding: '14px 8px',
                          borderRadius: 11,
                          background: '#FFFFFF',
                          border: rowBorder,
                          cursor: 'pointer',
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: '50%',
                            background: dotBg,
                            border: `2px solid ${dotBorder}`,
                            display: 'inline-block',
                            flex: '0 0 auto',
                          }}
                        />
                        <span style={{ ...T.setLabel }}>{`סט ${i + 1}`}</span>
                        <span style={{ ...T.setValue, color: valueColor }}>{valueText}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Completion bar at bottom — sets filled / total. */}
              <ProgressBar percent={completionPct} color="#FF6F20" />

              {/* Picker — inline overlay (not Radix), SECONDS options.
                  Writes through onSetValueChange with mode 'seconds' so
                  UnifiedPlanBuilder stamps time_completed + done:true in
                  one shot. */}
              <ScrollPickerPopup
                isOpen={timePickerOpenSetIdx != null}
                value={pickerInitialValue}
                options={SECONDS_OPTIONS}
                onClose={() => setTimePickerOpenSetIdx(null)}
                onSelect={(v) => {
                  const idx = timePickerOpenSetIdx;
                  if (typeof onSetValueChange === 'function' && idx != null) {
                    onSetValueChange(exercise, idx, v, 'seconds');
                  }
                }}
                title={`סט ${timePickerOpenSetIdx != null ? timePickerOpenSetIdx + 1 : ''} — שניות שבוצעו`}
              />
            </div>
          );
        })()}

        {expanded && (variant === 'normal' || variant === 'none' || variant === 'reps_new')
          /* Legacy IIFE — kept for display-mode sections only. The new
             unified hero+fill cards above (rep card + time/hold card)
             handle every executable single-exercise method; this block
             stays around for display-mode sections that surface params
             without trainee fill. */
          && !(sectionTrackingMode !== 'display' && hasValue(exercise.sets) && hasValue(exercise.reps))
          && !(sectionTrackingMode !== 'display' && hasValue(exercise.sets) && !hasValue(exercise.reps)
               && (hasValue(exercise.work_time) || hasValue(exercise.static_hold_time)))
          && (paramItems.length > 0 || subExercises.length > 0) && (() => {
          const hasSetsParam = paramItems.some((it) => it.key === 'sets');
          const hasRepsParam = paramItems.some((it) => it.key === 'reps');
          const hasWorkTimeParam = paramItems.some((it) => it.key === 'work_time');
          // Time-based exercise: a work_time prescription with no reps
          // target → the trainee enters actual seconds achieved per set
          // (persisted via the existing time_completed column on
          // exercise_set_logs, documented in workoutExecutionApi.js).
          const isTimeBased = hasWorkTimeParam && !hasRepsParam;
          const showFill = !isCoachMode && hasSetsParam && sectionTrackingMode !== 'display';
          const workTimeItem = paramItems.find((it) => it.key === 'work_time') || null;
          const workTimeTarget = workTimeItem ? (parseInt(workTimeItem.value, 10) || 0) : 0;

          // Right-side "<number> <word>" label shared by every row —
          // big Barlow Condensed number first (RTL DOM order = right),
          // small sans noun second (RTL DOM order = left of number),
          // wrapped in an inline-flex baseline so the number sits on
          // the actual text baseline of the trailing word.
          const renderInlineNumberLabel = (value, trailing) => (
            <span style={{
              display: 'inline-flex',
              alignItems: 'baseline',
              gap: 6,
              flexShrink: 0,
            }}>
              <span style={{
                fontFamily: NUM_FONT,
                fontSize: 24,
                fontWeight: 700,
                color: '#1a1a1a',
                lineHeight: 1,
              }}>{value}</span>
              {trailing && (
                <span style={{
                  fontFamily: SANS_FONT,
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#777',
                }}>{trailing}</span>
              )}
            </span>
          );

          // "סט N" caption above each box (9px / #999 / SANS_FONT).
          const setCaptionStyle = {
            fontSize: 9,
            color: '#999',
            marginBottom: 3,
            fontFamily: SANS_FONT,
            fontWeight: 600,
            lineHeight: 1,
          };

          // Box dimensions are spec'd at 42×36 with 8px radius. Sets
          // toggle box and reps input box share these so the row reads
          // as a consistent grid of "set 1 / set 2 / set 3 …" tiles.
          const BOX_W = 40;
          const BOX_H = 38;

          // Live-summary numbers — only meaningful when the trainee
          // set-fill is in play. Reps-type and time-type exercises
          // accumulate different totals; we compute both up front so
          // the summary pill can pick the right axis.
          let doneSets = 0;
          let repsDone = 0;
          let timeDone = 0;
          if (showFill) {
            for (let i = 0; i < totalSets; i++) {
              if (isSetDone(i)) doneSets++;
              const r = parseInt(setLog?.[i]?.reps_completed, 10);
              if (!Number.isNaN(r) && r > 0) repsDone += r;
              const t = parseInt(setLog?.[i]?.time_completed, 10);
              if (!Number.isNaN(t) && t > 0) timeDone += t;
            }
          }
          const repsTarget = hasRepsParam && hasValue(exercise.reps)
            ? totalSets * (parseInt(exercise.reps, 10) || 0)
            : null;
          const timeTarget = isTimeBased && workTimeTarget > 0
            ? totalSets * workTimeTarget
            : null;
          const pct = (() => {
            if (!showFill) return null;
            if (isTimeBased && timeTarget && timeTarget > 0) {
              return Math.min(100, Math.round((timeDone / timeTarget) * 100));
            }
            if (repsTarget && repsTarget > 0) {
              return Math.min(100, Math.round((repsDone / repsTarget) * 100));
            }
            if (totalSets > 0) {
              return Math.round((doneSets / totalSets) * 100);
            }
            return 0;
          })();
          const summaryDone = pct != null && pct >= 100;

          return (
            <div style={{ padding: '0 36px 10px 16px', direction: 'rtl' }}>
              {paramItems.map((it, i) => {
                const isLast = i === paramItems.length - 1;
                const rowBorder = isLast ? 'none' : '1px solid #EFE9D8';
                const trailing = [it.unit, it.descriptor].filter(Boolean).join(' ');

                // Storyboard layout for every fill row: label hard-right
                // (flex-shrink:0, natural width), boxes hard-left
                // (flex:1, justify-content: flex-end), both aligned at
                // flex-end so the boxes' bottom lines up with the label's
                // baseline. 11px vertical padding, hairline between rows.
                const fillRowStyle = {
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: 12,
                  padding: '11px 0',
                  borderBottom: rowBorder,
                  direction: 'rtl',
                };
                // Horizontal-scroll track for the N boxes. flex:1 +
                // minWidth:0 so the track can shrink (otherwise the
                // boxes' fixed widths would push the row wider than
                // the card on many-set exercises). overflow-x:auto +
                // no flex-wrap means: ≤5 boxes fit naturally with no
                // scrollbar; >5 boxes scroll horizontally on one
                // consistent line. paddingBottom keeps the slim
                // scrollbar from overlapping the box bottoms.
                const boxesGroupStyle = {
                  flex: 1,
                  minWidth: 0,
                  display: 'flex',
                  gap: 6,
                  overflowX: 'auto',
                  WebkitOverflowScrolling: 'touch',
                  paddingBottom: 4,
                  scrollbarWidth: 'thin',
                };
                // Box column = caption above + box below. flexShrink:0
                // so the box can never be squeezed below BOX_W.
                const boxColStyle = {
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  flexShrink: 0,
                  width: BOX_W,
                };

                // Trainee "סטים" row — label right, N tap-boxes left.
                if (showFill && it.key === 'sets') {
                  return (
                    <div key={it.key} style={fillRowStyle}>
                      {renderInlineNumberLabel(it.value, it.descriptor)}
                      <div style={boxesGroupStyle}>
                        {Array.from({ length: totalSets }).map((_, idx) => {
                          const done = isSetDone(idx);
                          return (
                            <div key={idx} style={boxColStyle}>
                              <span style={setCaptionStyle}>סט {idx + 1}</span>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleSetToggle(idx); }}
                                aria-checked={done}
                                role="checkbox"
                                style={{
                                  width: BOX_W, height: BOX_H, borderRadius: 8,
                                  border: done ? '2px solid #4CAF50' : '2px dashed #C9B89A',
                                  background: done ? '#F1FAF1' : '#FCFBF7',
                                  color: '#2e7d32',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: 18, fontWeight: 900, lineHeight: 1,
                                  padding: 0,
                                  flexShrink: 0,
                                }}
                              >{done ? '✓' : ''}</button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                }

                // Trainee "חזרות" row — label right, N reps inputs left.
                if (showFill && it.key === 'reps') {
                  return (
                    <div key={it.key} style={fillRowStyle}>
                      {renderInlineNumberLabel(it.value, it.descriptor)}
                      <div style={boxesGroupStyle}>
                        {Array.from({ length: totalSets }).map((_, idx) => {
                          const current = setLog?.[idx]?.reps_completed;
                          // Per-set history lookup. `previousSetData`
                          // arrives as { [idx]: { previous_reps, … } }
                          // from UnifiedPlanBuilder via SectionCard. A
                          // partially-filled set (current empty / 0)
                          // never wins a celebration — only typed
                          // strictly-greater values do.
                          const setHistory = previousSetData?.[idx] || null;
                          const prevReps = setHistory?.previous_reps ?? null;
                          const recordReps = setHistory?.record_reps ?? null;
                          const curN = current != null && current !== ''
                            && Number.isFinite(Number(current)) && Number(current) > 0
                            ? Number(current) : null;
                          const beatsPrev = curN != null && prevReps != null && curN > prevReps;
                          const beatsRecord = curN != null && recordReps != null && curN > recordReps;
                          const indicator = beatsRecord
                            ? '🔥 שיא חדש!'
                            : (prevReps != null && recordReps != null && prevReps !== recordReps)
                                ? `⟲ ${prevReps} · 🏆 ${recordReps}`
                                : prevReps != null
                                  ? `⟲ ${prevReps}`
                                  : recordReps != null
                                    ? `🏆 ${recordReps}`
                                    : null;
                          return (
                            <div key={idx} style={boxColStyle}>
                              <span style={setCaptionStyle}>סט {idx + 1}</span>
                              <input
                                type="number"
                                inputMode="numeric"
                                value={current != null && current !== '' ? current : ''}
                                onChange={(e) => {
                                  if (typeof onSetLogChange !== 'function') return;
                                  const raw = e.target.value;
                                  if (raw === '') {
                                    onSetLogChange(exercise.id, idx, 'reps_completed', null);
                                    return;
                                  }
                                  const parsed = parseInt(raw, 10);
                                  onSetLogChange(
                                    exercise.id, idx,
                                    'reps_completed',
                                    Number.isFinite(parsed) ? parsed : null,
                                  );
                                }}
                                onClick={(e) => e.stopPropagation()}
                                placeholder={String(exercise.reps || '')}
                                style={{
                                  width: BOX_W, height: BOX_H, borderRadius: 8,
                                  border: beatsRecord ? '2px solid #16a34a' : '2px solid #FF6F20',
                                  background: '#FFFFFF',
                                  color: beatsRecord ? '#16a34a' : beatsPrev ? '#FF6F20' : '#1a1a1a',
                                  textAlign: 'center',
                                  fontFamily: NUM_FONT,
                                  fontSize: 22, fontWeight: 700,
                                  lineHeight: 1,
                                  outline: 'none',
                                  padding: 0,
                                  direction: 'ltr',
                                  appearance: 'textfield',
                                  MozAppearance: 'textfield',
                                  flexShrink: 0,
                                  boxSizing: 'border-box',
                                  boxShadow: beatsRecord
                                    ? '0 0 0 3px rgba(22, 163, 74, 0.18)'
                                    : beatsPrev
                                      ? '0 0 0 3px rgba(255, 111, 32, 0.22)'
                                      : 'none',
                                  transition: 'border-color 0.15s, color 0.15s, box-shadow 0.15s',
                                }}
                              />
                              {indicator && (
                                <span style={{
                                  fontSize: 10,
                                  color: beatsRecord ? '#16a34a' : '#888',
                                  fontWeight: beatsRecord ? 800 : 600,
                                  marginTop: 4,
                                  whiteSpace: 'nowrap',
                                  fontFamily: SANS_FONT,
                                  lineHeight: 1.1,
                                }}>{indicator}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                }

                // Trainee "זמן" row — time-based exercises only. Replaces
                // the work_time display row when there's no reps target.
                // Writes to the existing exercise_set_logs.time_completed
                // column via onSetLogChange. Caption is "בפועל" for a
                // single set, "סט {i+1}" for multi-set time work.
                if (showFill && isTimeBased && it.key === 'work_time') {
                  return (
                    <div key={it.key} style={fillRowStyle}>
                      {renderInlineNumberLabel(it.value, [it.unit, it.descriptor].filter(Boolean).join(' '))}
                      <div style={boxesGroupStyle}>
                        {Array.from({ length: totalSets }).map((_, idx) => {
                          const current = setLog?.[idx]?.time_completed;
                          const caption = totalSets === 1 ? 'בפועל' : `סט ${idx + 1}`;
                          // Same previous + record indicator as the
                          // reps path, but driven off time_completed.
                          const setHistory = previousSetData?.[idx] || null;
                          const prevTime = setHistory?.previous_time ?? null;
                          const recordTime = setHistory?.record_time ?? null;
                          const curN = current != null && current !== ''
                            && Number.isFinite(Number(current)) && Number(current) > 0
                            ? Number(current) : null;
                          const beatsPrev = curN != null && prevTime != null && curN > prevTime;
                          const beatsRecord = curN != null && recordTime != null && curN > recordTime;
                          const indicator = beatsRecord
                            ? '🔥 שיא חדש!'
                            : (prevTime != null && recordTime != null && prevTime !== recordTime)
                                ? `⟲ ${prevTime} · 🏆 ${recordTime}`
                                : prevTime != null
                                  ? `⟲ ${prevTime}`
                                  : recordTime != null
                                    ? `🏆 ${recordTime}`
                                    : null;
                          return (
                            <div key={idx} style={boxColStyle}>
                              <span style={setCaptionStyle}>{caption}</span>
                              <input
                                type="number"
                                inputMode="numeric"
                                value={current != null && current !== '' ? current : ''}
                                onChange={(e) => {
                                  if (typeof onSetLogChange !== 'function') return;
                                  const raw = e.target.value;
                                  if (raw === '') {
                                    onSetLogChange(exercise.id, idx, 'time_completed', null);
                                    return;
                                  }
                                  const parsed = parseInt(raw, 10);
                                  onSetLogChange(
                                    exercise.id, idx,
                                    'time_completed',
                                    Number.isFinite(parsed) ? parsed : null,
                                  );
                                }}
                                onClick={(e) => e.stopPropagation()}
                                placeholder={String(workTimeTarget || '')}
                                style={{
                                  width: BOX_W, height: BOX_H, borderRadius: 8,
                                  border: beatsRecord ? '2px solid #16a34a' : '2px solid #FF6F20',
                                  background: '#FFFFFF',
                                  color: beatsRecord ? '#16a34a' : beatsPrev ? '#FF6F20' : '#1a1a1a',
                                  textAlign: 'center',
                                  fontFamily: NUM_FONT,
                                  fontSize: 20,
                                  fontWeight: 700,
                                  lineHeight: 1,
                                  outline: 'none',
                                  padding: 0,
                                  direction: 'ltr',
                                  appearance: 'textfield',
                                  MozAppearance: 'textfield',
                                  flexShrink: 0,
                                  boxSizing: 'border-box',
                                  boxShadow: beatsRecord
                                    ? '0 0 0 3px rgba(22, 163, 74, 0.18)'
                                    : beatsPrev
                                      ? '0 0 0 3px rgba(255, 111, 32, 0.22)'
                                      : 'none',
                                  transition: 'border-color 0.15s, color 0.15s, box-shadow 0.15s',
                                }}
                              />
                              {indicator && (
                                <span style={{
                                  fontSize: 10,
                                  color: beatsRecord ? '#16a34a' : '#888',
                                  fontWeight: beatsRecord ? 800 : 600,
                                  marginTop: 4,
                                  whiteSpace: 'nowrap',
                                  fontFamily: SANS_FONT,
                                  lineHeight: 1.1,
                                }}>{indicator}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                }

                // Standard display row — coach view or any non-fill
                // param. Label flows naturally to the right side under
                // RTL with no justify-content tweak.
                return (
                  <div key={it.key} style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    padding: '10px 0',
                    borderBottom: rowBorder,
                    direction: 'rtl',
                  }}>
                    {renderInlineNumberLabel(it.value, trailing)}
                  </div>
                );
              })}

              {/* Live trainee summary — amber tint <100%, green at
                  100%. Hidden for coach and for exercises without a
                  sets param (no per-set state to summarize). */}
              {showFill && (
                <div style={{
                  marginTop: 12,
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: summaryDone ? '#F1FAF1' : '#FFF4E6',
                  border: `1px solid ${summaryDone ? '#BFE3BF' : '#FFD9B0'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  direction: 'rtl',
                }}>
                  <div style={{
                    fontSize: 12,
                    color: '#555',
                    fontFamily: SANS_FONT,
                    fontWeight: 600,
                  }}>
                    {isTimeBased && timeTarget && timeTarget > 0 ? (
                      <>{timeDone}/{timeTarget} שנ׳ · </>
                    ) : repsTarget && repsTarget > 0 ? (
                      <>{repsDone}/{repsTarget} חזרות · </>
                    ) : null}
                    {doneSets}/{totalSets} סטים
                  </div>
                  <div style={{
                    fontFamily: NUM_FONT,
                    fontSize: 24,
                    fontWeight: 700,
                    lineHeight: 1,
                    color: summaryDone ? '#2e7d32' : '#FF6F20',
                  }}>{pct}%</div>
                </div>
              )}

              {/* Sub-exercises list — only for variant 'list' (superset
                  / קומבו / רשימה). Reuses the same numbered-badge
                  layout the tabata branch uses for consistency. The
                  getSubExercises helper handles the JSON.parse-with-
                  try/catch on the TEXT tabata_data column; the
                  rendered name + target come from the existing
                  getDrillName + getDrillTarget helpers. Empty /
                  unparseable arrays render nothing (no crash). */}
              {variant === 'list' && subExercises.length > 0 && (
                <div style={{
                  marginTop: paramItems.length > 0 ? 12 : 0,
                  paddingTop: paramItems.length > 0 ? 12 : 0,
                  borderTop: paramItems.length > 0 ? '1px solid #EFE9D8' : 'none',
                }}>
                  <div style={{
                    fontSize: 11,
                    color: '#888',
                    marginBottom: 6,
                    fontFamily: SANS_FONT,
                    fontWeight: 600,
                  }}>
                    תרגילי הסופרסט
                  </div>
                  {subExercises.map((sub, i) => {
                    const target = getDrillTarget(sub);
                    const isLastSub = i === subExercises.length - 1;
                    return (
                      <div key={i} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 0',
                        borderBottom: isLastSub ? 'none' : '1px solid #EFE9D8',
                      }}>
                        <span style={{
                          width: 26, height: 26,
                          background: '#FFF0E4',
                          color: '#FF6F20',
                          borderRadius: '50%',
                          fontFamily: NUM_FONT,
                          fontSize: 13, fontWeight: 700,
                          display: 'inline-flex',
                          alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0,
                        }} aria-hidden>{i + 1}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 14, fontWeight: 500, color: '#1a1a1a',
                            fontFamily: SANS_FONT,
                          }}>
                            {getDrillName(sub, i)}
                          </div>
                          {target?.display && (
                            <div style={{
                              fontSize: 12, color: '#888', marginTop: 2,
                              fontFamily: SANS_FONT,
                            }}>
                              {target.display}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}
      </div>
    );
  }
}
