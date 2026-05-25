import React, { useState, useEffect, useContext, useMemo } from "react";
import {
  Plus, X, Wrench, Info,
  Repeat, Mountain, ArrowDownToLine, PauseCircle, RotateCw,
  Timer, Link2, Zap, BarChart3,
  Clock, Weight, Activity, PersonStanding, Hand, Dumbbell,
  ArrowBigUp, ArrowLeftRight, List,
  Footprints, Maximize2, Hash, RefreshCw,
} from "lucide-react";
import { searchExercises } from "@/data/exercises";
import { supabase } from "@/lib/supabaseClient";
import { AuthContext } from "@/lib/AuthContext";
import { ATHLETIGO_ADMIN_UUID } from "@/constants/admin";
import VariationsManager from "@/components/admin/VariationsManager";
import { TRAINING_METHODS } from '../../constants/trainingMethods';
import { parsePlannedSets } from '../../lib/plannedSets';

// ────────────────────────────────────────────────────────────────
// Section 1 — methods row.
// Order = chip-row order; icons render inside the chip.
// ────────────────────────────────────────────────────────────────
const METHOD_ORDER = [
  'REPS', 'PYRAMID', 'DROP_SET', 'REST_PAUSE', 'CIRCUIT',
  'TABATA', 'SUPERSET', 'COMBO', 'DELORME',
];

const METHOD_ICONS = {
  REPS:       Repeat,
  PYRAMID:    Mountain,
  DROP_SET:   ArrowDownToLine,
  REST_PAUSE: PauseCircle,
  CIRCUIT:    RotateCw,
  TABATA:     Timer,
  SUPERSET:   Link2,
  COMBO:      Zap,
  DELORME:    BarChart3,
};

// ────────────────────────────────────────────────────────────────
// Section 2 — per-set parameter catalog.
// Picked parameters fan out as input columns inside Section 3 rows.
// Each entry carries its own unit-coloured palette so per-set
// inputs render with the right tint without consulting unitColors.
// ────────────────────────────────────────────────────────────────
const PARAM_CATALOG = {
  sets: {
    label: 'סטים',
    icon: Hash,
    type: 'number',
    color: { stripe: '#6b7280', border: '#E5E7EB', tint: '#FAFAFA', textPrimary: '#374151', textSecondary: '#6b7280' },
  },
  rounds: {
    label: 'סבבים',
    icon: RefreshCw,
    type: 'number',
    color: { stripe: '#6b7280', border: '#E5E7EB', tint: '#FAFAFA', textPrimary: '#374151', textSecondary: '#6b7280' },
  },
  reps: {
    label: 'חזרות',
    icon: Repeat,
    type: 'number',
    color: { stripe: '#D97706', border: '#D97706', tint: '#FFFBEB', textPrimary: '#92400E', textSecondary: '#D97706' },
  },
  hold_seconds: {
    label: 'שניות',
    icon: Clock,
    type: 'number',
    color: { stripe: '#14B8A6', border: '#14B8A6', tint: '#F0FDFA', textPrimary: '#0F766E', textSecondary: '#14B8A6' },
  },
  weight_kg: {
    label: 'משקל',
    icon: Weight,
    type: 'number',
    color: { stripe: '#7C3AED', border: '#7C3AED', tint: '#FAF5FF', textPrimary: '#5B21B6', textSecondary: '#7C3AED' },
  },
  rpe: {
    label: 'RPE',
    icon: Zap,
    type: 'number',
    color: { stripe: '#0EA5E9', border: '#0EA5E9', tint: '#F0F9FF', textPrimary: '#075985', textSecondary: '#0EA5E9' },
  },
  rest_seconds: {
    label: 'זמן מנוחה',
    icon: Timer,
    type: 'number',
    color: { stripe: '#14B8A6', border: '#14B8A6', tint: '#F0FDFA', textPrimary: '#0F766E', textSecondary: '#14B8A6' },
  },
  tempo: {
    label: 'טמפו',
    icon: Activity,
    type: 'text',
    color: { stripe: '#6b7280', border: '#E5E7EB', tint: '#FAFAFA', textPrimary: '#374151', textSecondary: '#6b7280' },
  },
  body_position: {
    label: 'מנח גוף',
    icon: PersonStanding,
    type: 'text',
    color: { stripe: '#6b7280', border: '#E5E7EB', tint: '#FAFAFA', textPrimary: '#374151', textSecondary: '#6b7280' },
  },
  grip: {
    label: 'אחיזה',
    icon: Hand,
    type: 'text',
    color: { stripe: '#6b7280', border: '#E5E7EB', tint: '#FAFAFA', textPrimary: '#374151', textSecondary: '#6b7280' },
  },
  equipment: {
    label: 'ציוד',
    icon: Dumbbell,
    type: 'text',
    color: { stripe: '#6b7280', border: '#E5E7EB', tint: '#FAFAFA', textPrimary: '#374151', textSecondary: '#6b7280' },
  },
  load_type: {
    label: 'סוג עומס',
    icon: ArrowBigUp,
    type: 'text',
    color: { stripe: '#6b7280', border: '#E5E7EB', tint: '#FAFAFA', textPrimary: '#374151', textSecondary: '#6b7280' },
  },
  side: {
    label: 'צד',
    icon: ArrowLeftRight,
    type: 'text',
    color: { stripe: '#6b7280', border: '#E5E7EB', tint: '#FAFAFA', textPrimary: '#374151', textSecondary: '#6b7280' },
  },
  notes: {
    label: 'דגשים',
    icon: Info,
    type: 'text',
    color: { stripe: '#6b7280', border: '#E5E7EB', tint: '#FAFAFA', textPrimary: '#374151', textSecondary: '#6b7280' },
  },
  foot_position: {
    label: 'מנח רגליים',
    icon: Footprints,
    type: 'text',
    color: { stripe: '#6b7280', border: '#E5E7EB', tint: '#FAFAFA', textPrimary: '#374151', textSecondary: '#6b7280' },
  },
  range_of_motion: {
    label: 'טווח תנועה',
    icon: Maximize2,
    type: 'text',
    color: { stripe: '#6b7280', border: '#E5E7EB', tint: '#FAFAFA', textPrimary: '#374151', textSecondary: '#6b7280' },
  },
};

// ────────────────────────────────────────────────────────────────
// mode (DB string) → method id (English key in TRAINING_METHODS).
// Includes the legacy 'רשימה' alias used by older superset rows.
// ────────────────────────────────────────────────────────────────
const MODE_TO_METHOD_ID = (() => {
  const map = {};
  for (const [methodId, m] of Object.entries(TRAINING_METHODS)) {
    map[m.mode] = methodId;
  }
  map['רשימה'] = 'SUPERSET';
  return map;
})();

// Smart defaults seeded into selectedSetFields the first time a
// method is chosen. Empty array means "no per-set params by default".
const DEFAULT_FIELDS_BY_METHOD = {
  REPS:       ['sets', 'reps', 'weight_kg'],
  PYRAMID:    ['reps', 'hold_seconds'],
  DROP_SET:   ['reps'],
  REST_PAUSE: ['reps'],
  CIRCUIT:    ['reps'],
  TABATA:     [],
  SUPERSET:   ['reps'],
  COMBO:      ['reps'],
  DELORME:    ['reps'],
};

// Methods whose planned-sets editor renders in Section 3. The other
// four (TABATA / SUPERSET / COMBO / CIRCUIT) keep the placeholder
// card until their bespoke layouts ship.
const METHODS_WITH_PLANNED_SETS = ['PYRAMID', 'REPS', 'DROP_SET', 'REST_PAUSE', 'DELORME'];

// ────────────────────────────────────────────────────────────────
// Exercise-name autocomplete — preserved from the previous form.
// ────────────────────────────────────────────────────────────────
function ExerciseNameInput({ value, onChange }) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => { setQuery(value); }, [value]);

  const handleChange = (e) => {
    const v = e.target.value;
    setQuery(v);
    onChange(v, null);
    const results = searchExercises(v);
    setSuggestions(results);
    setShowSuggestions(results.length > 0);
  };

  const selectSuggestion = (ex) => {
    setQuery(ex.name);
    onChange(ex.name, ex);
    setShowSuggestions(false);
  };

  return (
    <div className="mb-4 px-1 relative">
      <label className="text-[10px] font-black text-gray-400 mb-1 block uppercase tracking-wider">
        שם התרגיל
      </label>
      <input
        value={query}
        onChange={handleChange}
        onFocus={() => { if (suggestions.length) setShowSuggestions(true); }}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        placeholder="הקלד שם תרגיל..."
        autoFocus
        className="w-full h-11 text-base font-black border-b-2 border-gray-200 bg-transparent focus:border-[#FF6F20] focus:outline-none px-1 transition-colors placeholder:text-gray-300"
      />
      {showSuggestions && (
        <div className="absolute left-0 right-0 top-full z-50 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto" dir="rtl">
          {suggestions.map((ex) => (
            <div
              key={ex.id}
              onMouseDown={() => selectSuggestion(ex)}
              className="px-3 py-2 hover:bg-orange-50 cursor-pointer border-b border-gray-50 last:border-0"
            >
              <div className="font-bold text-sm text-gray-900">{ex.name}</div>
              <div className="text-[10px] text-gray-400">{ex.category}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Main form. Composed of three vertical sections + the variations
// admin button. Existing readOnly mode shows the same content as
// the editable variant; method/param picker buttons just don't react.
// ────────────────────────────────────────────────────────────────
export default function ModernExerciseForm({ exercise, onChange, readOnly = false }) {
  const { user } = useContext(AuthContext) || {};
  const isAdmin = user?.id === ATHLETIGO_ADMIN_UUID;

  // Variations admin modal — same plumbing as the previous form.
  const [showVariationsModal, setShowVariationsModal] = useState(false);
  const [variationsCount, setVariationsCount] = useState(0);

  // Section 1 — currently active method (string key in TRAINING_METHODS).
  const [activeMethod, setActiveMethod] = useState('REPS');

  // Section 2 — array of PARAM_CATALOG keys the coach wants on every
  // planned set. Ordered the way the coach added them so the columns
  // in Section 3 are predictable.
  const [selectedSetFields, setSelectedSetFields] = useState([]);

  // Section 3 — planned-set rows. Each row carries its per-field
  // values keyed by PARAM_CATALOG ids + a set_index + variation_name.
  const [plannedSetsDraft, setPlannedSetsDraft] = useState([]);

  // Per-method shared config (e.g. REST_PAUSE's uniform variation +
  // rest-between-mini-sets). Lives outside planned_sets because it
  // applies to the whole exercise, not to a single row.
  const [methodConfig, setMethodConfig] = useState({});

  const updateMethodConfig = (key, value) => {
    setMethodConfig((prev) => ({ ...prev, [key]: value }));
  };

  // ── Variations count (admin only) ─────────────────────────────
  useEffect(() => {
    if (!isAdmin || !exercise?.id) {
      setVariationsCount(0);
      return;
    }
    let cancelled = false;
    (async () => {
      const { count, error } = await supabase
        .from('exercise_variations')
        .select('id', { count: 'exact', head: true })
        .eq('exercise_id', exercise.id);
      if (cancelled) return;
      setVariationsCount(error ? 0 : (count || 0));
    })();
    return () => { cancelled = true; };
  }, [isAdmin, exercise?.id]);

  // ── Hydration on exercise change ──────────────────────────────
  // Pulls mode → activeMethod, tabata_data.set_fields → selectedSet
  // Fields, tabata_data.planned_sets → plannedSetsDraft. Empty /
  // unparseable payloads collapse to the method's seeded defaults.
  useEffect(() => {
    const methodId = MODE_TO_METHOD_ID[exercise?.mode] || 'REPS';
    setActiveMethod(methodId);

    let parsed = null;
    if (exercise?.tabata_data) {
      try {
        parsed = typeof exercise.tabata_data === 'string'
          ? JSON.parse(exercise.tabata_data)
          : exercise.tabata_data;
      } catch {}
    }

    if (Array.isArray(parsed?.set_fields)) {
      setSelectedSetFields(parsed.set_fields);
    } else {
      setSelectedSetFields(DEFAULT_FIELDS_BY_METHOD[methodId] || []);
    }

    setPlannedSetsDraft(parsePlannedSets(exercise));
    setMethodConfig(parsed?.method_config && typeof parsed.method_config === 'object'
      ? parsed.method_config
      : {});
  }, [exercise?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync state → exercise.mode + tabata_data ──────────────────
  // Single batched onChange writes everything atomically. Diff-gated
  // so the hydration round-trip doesn't loop.
  useEffect(() => {
    const method = TRAINING_METHODS[activeMethod];
    if (!method) return;

    const updates = {};
    if (exercise?.mode !== method.mode) updates.mode = method.mode;

    let existing = {};
    if (exercise?.tabata_data) {
      try {
        existing = typeof exercise.tabata_data === 'string'
          ? JSON.parse(exercise.tabata_data)
          : exercise.tabata_data;
      } catch {}
    }

    const nextPayload = {
      ...existing,
      method: method.mode,
      set_fields: selectedSetFields,
      planned_sets: plannedSetsDraft,
      method_config: methodConfig,
    };
    const nextStr = JSON.stringify(nextPayload);

    const currStr = exercise?.tabata_data
      ? (typeof exercise.tabata_data === 'string'
        ? exercise.tabata_data
        : JSON.stringify(exercise.tabata_data))
      : null;

    if (currStr !== nextStr) updates.tabata_data = nextStr;

    if (Object.keys(updates).length > 0) {
      onChange({ ...exercise, ...updates });
    }
  }, [activeMethod, selectedSetFields, plannedSetsDraft, methodConfig]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ─────────────────────────────────────────────────
  const handleMethodClick = (methodId) => {
    if (readOnly) return;
    if (methodId === activeMethod) return;
    setActiveMethod(methodId);
    // Only seed defaults if the coach hasn't already picked params.
    if (selectedSetFields.length === 0) {
      setSelectedSetFields(DEFAULT_FIELDS_BY_METHOD[methodId] || []);
    }
  };

  const toggleSetField = (fieldId) => {
    if (readOnly) return;
    setSelectedSetFields((prev) =>
      prev.includes(fieldId)
        ? prev.filter((f) => f !== fieldId)
        : [...prev, fieldId]
    );
  };

  const addRow = () => {
    if (readOnly) return;
    setPlannedSetsDraft((prev) => {
      const seed = { set_index: prev.length + 1, variation_name: '' };
      for (const f of selectedSetFields) seed[f] = null;
      return [...prev, seed];
    });
  };

  const removeRow = (idx) => {
    if (readOnly) return;
    setPlannedSetsDraft((prev) =>
      prev
        .filter((_, i) => i !== idx)
        .map((r, i) => ({ ...r, set_index: i + 1 }))
    );
  };

  const updateRow = (idx, key, val) => {
    if (readOnly) return;
    setPlannedSetsDraft((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, [key]: val } : r))
    );
  };

  const updateEx = (field, value) => {
    onChange({ ...exercise, [field]: value });
  };

  // Section 3 header text varies per method. Memoised so the JSX
  // stays a simple lookup rather than a multi-line ternary.
  const sectionThreeHeader = useMemo(() => {
    if (activeMethod === 'REPS')       return 'סטים בתרגיל';
    if (activeMethod === 'PYRAMID')    return 'סטים בפירמידה';
    if (activeMethod === 'DROP_SET')   return 'סטים בדרופ סט';
    if (activeMethod === 'REST_PAUSE') return 'מיני-סטים';
    if (activeMethod === 'DELORME')    return 'סטים בדלורם';
    return null;
  }, [activeMethod]);

  const addRowButtonLabel = activeMethod === 'REST_PAUSE'
    ? '+ הוסף מיני-סט'
    : '+ הוסף סט';

  // DROP_SET / DELORME flag variation_name as required — the input
  // gets an orange border when empty and a single warning hint
  // surfaces below the row list if any are missing.
  const variationRequired = activeMethod === 'DROP_SET' || activeMethod === 'DELORME';
  const hasMissingVariations = variationRequired
    && plannedSetsDraft.some((r) => !(r.variation_name || '').trim());

  // ── Section 3 — pyramid field renderer ───────────────────────
  const renderFieldInput = (fieldId, row, rowIdx) => {
    const meta = PARAM_CATALOG[fieldId];
    if (!meta) return null;
    const c = meta.color;
    return (
      <div
        key={fieldId}
        style={{
          background: 'white',
          border: `1px solid ${c.tint}`,
          borderRadius: 7,
          padding: '6px 8px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
        }}
      >
        <span style={{
          fontSize: 8,
          color: c.textPrimary,
          fontWeight: 800,
          background: c.tint,
          padding: '1px 5px',
          borderRadius: 3,
        }}>
          {meta.label}
        </span>
        <input
          type={meta.type}
          value={row[fieldId] ?? ''}
          onChange={(e) => updateRow(
            rowIdx,
            fieldId,
            meta.type === 'number'
              ? (e.target.value === '' ? null : Number(e.target.value))
              : e.target.value
          )}
          style={{
            width: '100%',
            height: 28,
            border: 'none',
            textAlign: 'center',
            fontFamily: meta.type === 'number' ? "'Bebas Neue', sans-serif" : 'inherit',
            fontSize: meta.type === 'number' ? 20 : 12,
            color: c.stripe,
            background: 'transparent',
            outline: 'none',
          }}
        />
      </div>
    );
  };

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="px-2 pb-4" dir="rtl">
      {/* ── Exercise name (read-only header in readOnly mode) ── */}
      {readOnly ? (
        <div className="mb-4 px-1">
          <label className="text-[10px] font-black text-gray-400 mb-1 block uppercase tracking-wider">
            שם התרגיל
          </label>
          <div className="text-base font-black text-gray-900">
            {exercise.exercise_name || exercise.name || ''}
          </div>
        </div>
      ) : (
        <ExerciseNameInput
          value={exercise.exercise_name || ''}
          onChange={(name, _libEx) => updateEx('exercise_name', name)}
        />
      )}

      {/* ─────────────────────────────────────────────────────
          SECTION 1 — Methods row.
          Horizontal scroll, RTL, single-select.
        ───────────────────────────────────────────────────── */}
      <div className="mb-4 px-1">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8 }}>
          <span style={{ fontSize: 11, color: '#FF6F20', fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase' }}>
            שיטה
          </span>
          {isAdmin && exercise?.id && (
            <button
              type="button"
              onClick={() => setShowVariationsModal(true)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: '#FFF7ED', color: '#FF6F20',
                padding: '6px 12px', border: '1px solid #FFD0AC',
                borderRadius: 7, fontSize: 11, fontWeight: 700,
                cursor: 'pointer', lineHeight: 1,
              }}
            >
              <List size={13} />
              נהל וריאציות ({variationsCount})
            </button>
          )}
        </div>

        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          justifyContent: 'flex-start',
        }}>
          {METHOD_ORDER.map((methodId) => {
            const Icon = METHOD_ICONS[methodId];
            const isActive = activeMethod === methodId;
            const baseStyle = {
              background: 'white',
              border: '1px solid #E5E7EB',
              color: '#6b7280',
              padding: '7px 12px',
              borderRadius: 9,
              fontWeight: 600,
              fontSize: 11,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              cursor: readOnly ? 'default' : 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              fontFamily: 'inherit',
            };
            const activeStyle = {
              background: 'linear-gradient(135deg, #FFF5EE, #FFFAF5)',
              border: '2px solid #FF6F20',
              color: '#993C1D',
              fontWeight: 800,
              boxShadow: '0 2px 6px rgba(255,111,32,0.2)',
            };
            return (
              <button
                key={methodId}
                type="button"
                onClick={() => handleMethodClick(methodId)}
                style={isActive ? { ...baseStyle, ...activeStyle } : baseStyle}
              >
                {Icon && <Icon size={13} />}
                {TRAINING_METHODS[methodId].label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────
          SECTION 2 — Per-set parameter picker.
          4-col grid, multi-select with ✓ badges, smart defaults
          seeded when a method is first chosen.
        ───────────────────────────────────────────────────── */}
      <div className="mb-4 px-1">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: '#FF6F20', fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase' }}>
            פרמטרים לכל סט
          </span>
          <span style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 500 }}>
            לחץ להוסיף · יופיעו כשדות בכל סט
          </span>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 6,
        }}>
          {Object.entries(PARAM_CATALOG).map(([fieldId, meta]) => {
            const isSelected = selectedSetFields.includes(fieldId);
            const c = meta.color;
            const Icon = meta.icon;
            const baseStyle = {
              background: 'white',
              border: '1px solid #E5E7EB',
              padding: '8px 4px',
              borderRadius: 8,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              position: 'relative',
              cursor: readOnly ? 'default' : 'pointer',
              fontFamily: 'inherit',
            };
            const activeStyle = {
              background: `linear-gradient(135deg, ${c.tint}, white)`,
              border: `2px solid ${c.border}`,
            };
            return (
              <button
                key={fieldId}
                type="button"
                onClick={() => toggleSetField(fieldId)}
                style={isSelected ? { ...baseStyle, ...activeStyle } : baseStyle}
              >
                {isSelected && (
                  <span style={{
                    position: 'absolute', top: -4, left: -4,
                    background: c.stripe, color: 'white',
                    width: 16, height: 16, borderRadius: '50%',
                    fontSize: 9, display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800,
                  }}>✓</span>
                )}
                {Icon && <Icon size={16} color={isSelected ? c.textPrimary : '#6b7280'} />}
                <span style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: isSelected ? c.textPrimary : '#374151',
                  lineHeight: 1.1,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '100%',
                }}>
                  {meta.label}
                </span>
              </button>
            );
          })}
        </div>

        {selectedSetFields.length > 0 && (
          <div style={{
            background: '#FFF5EE',
            border: '1px dashed #FFD0AC',
            borderRadius: 6,
            padding: '6px 10px',
            marginTop: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <Info size={11} color="#FF6F20" />
            <span style={{ fontSize: 9, color: '#993C1D', fontWeight: 700 }}>
              {selectedSetFields.length} פרמטרים נבחרו · יופיעו בכל סט
            </span>
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────
          SECTION 3 — Per-method editor.
          5 methods share the planned-sets editor (REPS, PYRAMID,
          DROP_SET, REST_PAUSE, DELORME) with small per-method
          tweaks: header text, variation-required cue, REST_PAUSE
          gets a shared method_config header instead of per-row
          variation. The other 4 methods (TABATA / SUPERSET /
          COMBO / CIRCUIT) keep the "in development" placeholder.
        ───────────────────────────────────────────────────── */}
      {METHODS_WITH_PLANNED_SETS.includes(activeMethod) && (
        <div className="mb-4 px-1">
          {/* REST_PAUSE — shared method_config card (variation +
              uniform rest between mini-sets) renders above the
              mini-sets list. Lives in tabata_data.method_config so
              it persists across reloads alongside the planned_sets. */}
          {activeMethod === 'REST_PAUSE' && (
            <div style={{
              background: 'linear-gradient(135deg, #FFF5EE, white)',
              border: '1px solid #FFD0AC',
              borderRadius: 10,
              padding: 12,
              marginBottom: 14,
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label style={{
                    fontSize: 10,
                    color: '#993C1D',
                    fontWeight: 800,
                    display: 'block',
                    marginBottom: 4,
                  }}>
                    וריאציה (אחידה לכל המיני-סטים)
                  </label>
                  <input
                    type="text"
                    placeholder="לדוגמה: מנח 6"
                    value={methodConfig.variation_name ?? ''}
                    onChange={(e) => updateMethodConfig('variation_name', e.target.value)}
                    style={{
                      width: '100%',
                      height: 34,
                      padding: '0 10px',
                      border: '1px solid #FFD0AC',
                      borderRadius: 7,
                      fontSize: 12,
                      color: '#1a1a1a',
                      background: 'white',
                      fontFamily: 'inherit',
                      outline: 'none',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontSize: 10, color: '#0F766E', fontWeight: 800 }}>
                    מנוחה בין מיני-סטים:
                  </label>
                  <input
                    type="number"
                    value={methodConfig.rest_seconds ?? ''}
                    onChange={(e) => updateMethodConfig(
                      'rest_seconds',
                      e.target.value === '' ? null : Number(e.target.value)
                    )}
                    style={{
                      width: 60,
                      height: 30,
                      padding: '0 8px',
                      border: '1px solid #14B8A6',
                      borderRadius: 6,
                      fontFamily: "'Bebas Neue', sans-serif",
                      fontSize: 18,
                      color: '#0F766E',
                      background: '#F0FDFA',
                      textAlign: 'center',
                      outline: 'none',
                    }}
                  />
                  <span style={{
                    fontSize: 10,
                    color: '#0F766E',
                    fontWeight: 700,
                    background: '#F0FDFA',
                    padding: '2px 6px',
                    borderRadius: 3,
                  }}>
                    שניות
                  </span>
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: '#1a1a1a' }}>
              {sectionThreeHeader}
            </span>
            <button
              type="button"
              onClick={addRow}
              disabled={readOnly}
              style={{
                background: 'white',
                border: '1px solid #FFD0AC',
                color: '#FF6F20',
                padding: '6px 12px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 800,
                cursor: readOnly ? 'default' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {addRowButtonLabel}
            </button>
          </div>

          {plannedSetsDraft.length === 0 ? (
            <div style={{
              padding: 20,
              textAlign: 'center',
              color: '#9CA3AF',
              background: '#FAFAFA',
              borderRadius: 8,
              fontSize: 12,
            }}>
              {activeMethod === 'REST_PAUSE'
                ? 'אין מיני-סטים מוגדרים — לחץ "הוסף מיני-סט" כדי להתחיל'
                : 'אין סטים מוגדרים — לחץ "הוסף סט" כדי להתחיל'}
            </div>
          ) : (
            <div>
              {plannedSetsDraft.map((row, i) => {
                const variationEmpty = !(row.variation_name || '').trim();
                const variationBorder = variationRequired && variationEmpty
                  ? '1px solid #FF6F20'
                  : '1px solid #FFD0AC';
                const variationPlaceholder =
                  activeMethod === 'PYRAMID'  ? 'וריאציה (לדוגמה: שכיבת סמיכה במנח 8)'
                  : activeMethod === 'REPS'   ? 'וריאציה (אופציונלי)'
                  : variationRequired         ? 'וריאציה לסט זה (חובה)'
                  :                             'וריאציה';
                return (
                  <div key={i} style={{
                    background: '#FFF9F0',
                    border: '1px solid #FFD0AC',
                    borderRadius: 10,
                    padding: 12,
                    marginBottom: 8,
                  }}>
                    {/* LINE 1 — index + (variation unless REST_PAUSE) + delete */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <span style={{
                        fontFamily: "'Bebas Neue', sans-serif",
                        fontSize: 24,
                        color: '#FF6F20',
                        lineHeight: 1,
                        minWidth: 28,
                        fontWeight: 800,
                      }}>
                        {String(row.set_index ?? (i + 1)).padStart(2, '0')}
                      </span>
                      {activeMethod !== 'REST_PAUSE' && (
                        <input
                          type="text"
                          placeholder={variationPlaceholder}
                          value={row.variation_name ?? ''}
                          onChange={(e) => updateRow(i, 'variation_name', e.target.value)}
                          style={{
                            flex: 1,
                            height: 34,
                            padding: '0 10px',
                            border: variationBorder,
                            borderRadius: 7,
                            fontSize: 12,
                            color: '#1a1a1a',
                            background: 'white',
                            fontFamily: 'inherit',
                            outline: 'none',
                          }}
                        />
                      )}
                      {activeMethod === 'REST_PAUSE' && (
                        <span style={{ flex: 1 }} />
                      )}
                      <button
                        type="button"
                        onClick={() => removeRow(i)}
                        aria-label={activeMethod === 'REST_PAUSE' ? 'הסר מיני-סט' : 'הסר סט'}
                        style={{
                          width: 28,
                          height: 28,
                          background: 'transparent',
                          border: 'none',
                          color: '#9CA3AF',
                          cursor: readOnly ? 'default' : 'pointer',
                          fontSize: 18,
                          lineHeight: 1,
                        }}
                      >×</button>
                    </div>

                    {/* LINE 2 — dynamic field grid */}
                    {selectedSetFields.length > 0 && (
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${selectedSetFields.length}, 1fr)`,
                        gap: 6,
                      }}>
                        {selectedSetFields.map((fieldId) =>
                          renderFieldInput(fieldId, row, i)
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Validation hint — visual only, doesn't block save. */}
          {hasMissingVariations && (
            <div style={{ fontSize: 10, color: '#FF6F20', marginTop: 4 }}>
              {activeMethod === 'DROP_SET'
                ? '⚠ דרופ סט דורש וריאציה לכל סט'
                : '⚠ דלורם דורש וריאציה לכל סט'}
            </div>
          )}
        </div>
      )}

      {/* Placeholder for the 4 methods whose layouts aren't built yet
          (TABATA / SUPERSET / COMBO / CIRCUIT). */}
      {!METHODS_WITH_PLANNED_SETS.includes(activeMethod) && (
        <div style={{
          background: '#FAFAFA',
          border: '1px dashed #E5E7EB',
          borderRadius: 12,
          padding: 20,
          textAlign: 'center',
          margin: '14px 0',
        }}>
          <Wrench size={24} color="#9CA3AF" style={{ display: 'inline-block' }} />
          <div style={{ fontSize: 13, color: '#6b7280', fontWeight: 700, marginTop: 8 }}>
            עורך {TRAINING_METHODS[activeMethod].label} בקרוב
          </div>
          <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 4 }}>
            ניתן לבחור שיטה ופרמטרים · עורך הסטים בפיתוח
          </div>
        </div>
      )}

      {/* Variations admin modal */}
      {showVariationsModal && isAdmin && exercise?.id && (
        <VariationsManager
          exerciseId={exercise.id}
          exerciseName={exercise.exercise_name || exercise.name || 'תרגיל'}
          onClose={() => setShowVariationsModal(false)}
          onCountChange={setVariationsCount}
        />
      )}
    </div>
  );
}
