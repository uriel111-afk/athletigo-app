import React, { useState, useEffect, useContext, useMemo, useRef } from "react";
import {
  Plus, X, Wrench, Info,
  Repeat, Mountain, ArrowDownToLine, PauseCircle, RotateCw,
  Timer, Link2, Zap, BarChart3,
  Clock, Weight, Activity, PersonStanding, Hand, Dumbbell,
  ArrowBigUp, ArrowLeftRight, List, ListChecks,
  Footprints, Maximize2, Hash, RefreshCw,
  Square, ArrowLeft, Copy, Trash2, ChevronUp, ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { searchExercises } from "@/data/exercises";
import { supabase } from "@/lib/supabaseClient";
import { AuthContext } from "@/lib/AuthContext";
import { ATHLETIGO_ADMIN_UUID } from "@/constants/admin";
import VariationsManager from "@/components/admin/VariationsManager";
import { TRAINING_METHODS } from '../../constants/trainingMethods';
import { PARAM_CATALOG } from '../../constants/paramCatalog';
import { parsePlannedSets } from '../../lib/plannedSets';
import { getParamOptions, addParamOption, hasOptions } from '../../lib/paramOptions';
import TabataSubExerciseCard from '../training/TabataSubExerciseCard';

// ────────────────────────────────────────────────────────────────
// Section 1 — methods row.
// Order = chip-row order; icons render inside the chip.
// ────────────────────────────────────────────────────────────────
const METHOD_ORDER = [
  'NONE',
  'EXERCISE_LIST',
  'REPS', 'PYRAMID', 'DROP_SET', 'REST_PAUSE', 'CIRCUIT',
  'TABATA', 'SUPERSET', 'COMBO', 'DELORME',
];

const METHOD_ICONS = {
  NONE:          Square,
  EXERCISE_LIST: ListChecks,
  REPS:          Repeat,
  PYRAMID:       Mountain,
  DROP_SET:      ArrowDownToLine,
  REST_PAUSE:    PauseCircle,
  CIRCUIT:       RotateCw,
  TABATA:        Timer,
  SUPERSET:      Link2,
  COMBO:         Zap,
  DELORME:       BarChart3,
};

// PARAM_CATALOG is shared with ExerciseCard — moved to
// '../../constants/paramCatalog' so the open-card list renderer can
// look up the saved sub-exercise keys by the SAME ids the form
// writes (reps, weight_kg, hold_seconds, rest_seconds, …).

// ────────────────────────────────────────────────────────────────
// mode (DB string) → method id (English key in TRAINING_METHODS).
// Includes the legacy 'רשימה' alias used by older superset rows.
// ────────────────────────────────────────────────────────────────
const MODE_TO_METHOD_ID = (() => {
  const map = {};
  for (const [methodId, m] of Object.entries(TRAINING_METHODS)) {
    if (m.mode) map[m.mode] = methodId; // skip falsy (NONE has mode: null)
  }
  // 'רשימה' is now its own first-class method (EXERCISE_LIST). The
  // mapping is already set by the loop above; legacy superset rows
  // that were saved with mode='רשימה' will hydrate into the list
  // editor — same data shape (sub_exercises) so no migration needed.
  return map;
})();

// Pure helper — duplicates the item at `idx` in `arr`, inserts the
// copy immediately after it, and optionally re-sequences a 1-based
// index field on every row (used by stations / rounds whose render
// surfaces their position). `deepArrayFields` lists keys whose array
// values must be cloned separately so the duplicate doesn't share
// references with the source (e.g. EXERCISE_LIST sub.set_fields, where
// the per-sub picker mutates the array in place).
function duplicateAtIndex(arr, idx, { indexField = null, deepArrayFields = [] } = {}) {
  if (!Array.isArray(arr) || idx < 0 || idx >= arr.length) return arr;
  const src = arr[idx];
  const clone = { ...src };
  for (const f of deepArrayFields) {
    if (Array.isArray(clone[f])) clone[f] = [...clone[f]];
  }
  const inserted = [...arr.slice(0, idx + 1), clone, ...arr.slice(idx + 1)];
  if (indexField) return inserted.map((x, i) => ({ ...x, [indexField]: i + 1 }));
  return inserted;
}

// Smart-defaults injection point. Kept as a constant so future methods
// can opt back in by listing their seeds here; for now every method
// starts clean — the coach must pick params explicitly.
const DEFAULT_FIELDS_BY_METHOD = {
  NONE:          [],
  EXERCISE_LIST: [],
  REPS:          [],
  PYRAMID:       [],
  DROP_SET:      [],
  REST_PAUSE:    [],
  CIRCUIT:       [],
  TABATA:        [],
  SUPERSET:      [],
  COMBO:         [],
  DELORME:       [],
};

// Each method has exactly one data shape it uses in tabata_data.
// The Section 3 dispatcher picks the renderer based on these arrays.
const METHODS_WITH_PLANNED_SETS = ['NONE', 'REPS', 'PYRAMID', 'DROP_SET', 'REST_PAUSE', 'DELORME'];
const METHODS_WITH_ROUNDS       = ['SUPERSET', 'COMBO'];
const METHODS_WITH_STATIONS     = ['CIRCUIT'];
const METHODS_WITH_CLOCK        = ['TABATA'];
const METHODS_WITH_LIST         = ['EXERCISE_LIST'];

// Methods where each set legitimately holds DIFFERENT values per row
// (so a per-set table + "Add Set" button is meaningful). For basic
// methods (NONE / REPS) every set is identical — a single "sets" +
// "reps" pair is enough.
const PER_SET_METHODS = ['NONE', 'REPS', 'PYRAMID', 'DROP_SET', 'DELORME', 'REST_PAUSE'];
const usesPerSetRows = (m) => PER_SET_METHODS.includes(m);

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
        className="w-full h-11 text-base font-black border-b-2 border-gray-200 bg-transparent focus:border-[var(--ag-accent)] focus:outline-none px-1 transition-colors placeholder:text-gray-300"
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

  // Per-method shared config (REST_PAUSE's uniform variation + rest,
  // CIRCUIT's rounds, …). Lives outside planned_sets because it
  // applies to the whole exercise, not to a single row.
  const [methodConfig, setMethodConfig] = useState({});

  const updateMethodConfig = (key, value) => {
    setMethodConfig((prev) => ({ ...prev, [key]: value }));
  };

  // SUPERSET / COMBO state — rounds, each carrying exercises with
  // their per-row planned-field values.
  const [roundsDraft, setRoundsDraft] = useState([]);

  // CIRCUIT state — flat list of stations (one card per station).
  const [stationsDraft, setStationsDraft] = useState([]);

  // TABATA state — rotation of exercise names + 5 clock settings.
  const [rotationExercises, setRotationExercises] = useState([]);
  const [clockSettings, setClockSettings] = useState({});
  // Single-open-at-a-time for the new card-based rotation editor.
  // null = all collapsed; integer = the open sub's index in rotationExercises.
  const [expandedSubIndex, setExpandedSubIndex] = useState(null);

  // EXERCISE_LIST state — flat list of sub-exercises, each carrying
  // optional per-field values keyed by PARAM_CATALOG ids.
  const [subExercises, setSubExercises] = useState([]);

  // Hydration guard — flips to true only AFTER the mount-time effect
  // that pulls activeMethod / selectedSetFields / plannedSetsDraft from
  // the existing exercise has queued its setStates. The sync-back
  // effect bails out while this is false so it can't push an empty
  // payload to the parent before the form has read the real values.
  const hydratedRef = useRef(false);

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
    // Block sync-back until the setStates below have been applied to
    // the next render. Without this the sync-back effect runs in the
    // same commit phase with stale (initial-empty) closure values and
    // overwrites the parent's tabata_data with blanks.
    hydratedRef.current = false;

    // Falsy mode (null / undefined / '') → NONE. Anything else falls
    // through MODE_TO_METHOD_ID (with REPS as the final fallback for
    // unrecognised strings).
    const rawMode = exercise?.mode;
    const methodId = rawMode
      ? (MODE_TO_METHOD_ID[rawMode] || 'REPS')
      : 'NONE';
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
      // Smart hydration: use saved set_fields if present,
      // else infer from which numeric fields exist in planned_sets rows,
      // else fall back to method defaults.
      const savedFields = exercise.tabata_data?.set_fields;
      let fieldsToUse;
      if (savedFields && savedFields.length > 0) {
        fieldsToUse = savedFields;
      } else {
        const rows = exercise.tabata_data?.planned_sets || [];
        const inferred = new Set();
        rows.forEach(row => {
          if (row.reps != null)                                          inferred.add('reps');
          if (row.weight_kg != null || row.weight != null)              inferred.add('weight_kg');
          if (row.rest_seconds != null || row.rest_time != null)        inferred.add('rest_seconds');
          if (row.work_time != null)                                     inferred.add('work_time');
          if (row.hold_seconds != null || row.static_hold_time != null) inferred.add('hold_seconds');
          if (row.tempo != null)                                         inferred.add('tempo');
          if (row.rpe != null)                                           inferred.add('rpe');
        });
        fieldsToUse = inferred.size > 0
          ? Array.from(inferred)
          : (DEFAULT_FIELDS_BY_METHOD[methodId] || []);
      }
      setSelectedSetFields(fieldsToUse);
    }

    // Hydrate per-set rows. When the exercise carries a plain `sets`
    // count (legacy / PlanBuilder rows) but no `tabata_data.planned_sets`,
    // back-fill the table with that many rows seeded from the legacy
    // top-level columns so the form mirrors what the trainee execution
    // view shows. Without this, opening a legacy `sets=3, reps=10` row
    // shows zero rows, the coach taps Add Row once thinking "one row =
    // 3 sets", saves, and the flatten step persists sets=1.
    {
      const fromTd = parsePlannedSets(exercise);
      let initialPlanned = fromTd;
      if (fromTd.length === 0) {
        const legacySets = parseInt(exercise?.sets, 10);
        if (Number.isFinite(legacySets) && legacySets > 0) {
          const seed = {};
          if (exercise?.reps != null && exercise?.reps !== '')                       seed.reps = exercise.reps;
          if (exercise?.weight != null && exercise?.weight !== '')                   seed.weight_kg = exercise.weight;
          if (exercise?.rest_time != null && exercise?.rest_time !== '')             seed.rest_seconds = exercise.rest_time;
          if (exercise?.work_time != null && exercise?.work_time !== '')             seed.work_time = exercise.work_time;
          if (exercise?.static_hold_time != null && exercise?.static_hold_time !== '') seed.hold_seconds = exercise.static_hold_time;
          if (exercise?.tempo != null && exercise?.tempo !== '')                     seed.tempo = exercise.tempo;
          if (exercise?.rpe != null && exercise?.rpe !== '')                         seed.rpe = exercise.rpe;
          initialPlanned = Array.from({ length: legacySets }, (_, i) => ({
            ...seed,
            set_index: i + 1,
            variation_name: '',
          }));
        }
      }
      setPlannedSetsDraft(initialPlanned);
    }
    setMethodConfig(parsed?.method_config && typeof parsed.method_config === 'object'
      ? parsed.method_config
      : {});

    setRoundsDraft(Array.isArray(parsed?.rounds) ? parsed.rounds : []);
    setStationsDraft(Array.isArray(parsed?.stations) ? parsed.stations : []);
    // Smart hydration for legacy rotation rows: pre-set_fields rows
    // wrote params as bare top-level keys ({name, reps:10, weight_kg:50})
    // with no set_fields array. Infer the picked fields from non-empty
    // PARAM_CATALOG ids so the chip picker shows the right state and
    // the open-card grid renders the saved inputs instead of the
    // empty-state hint.
    {
      const baseRotation = Array.isArray(parsed?.exercises_in_rotation)
        ? parsed.exercises_in_rotation
        : [];
      const hydratedRotation = baseRotation.map((ex) => {
        if (Array.isArray(ex.set_fields) && ex.set_fields.length > 0) return ex;
        const inferred = Object.keys(PARAM_CATALOG).filter(
          (id) => ex[id] !== undefined && ex[id] !== null && ex[id] !== ''
        );
        return { ...ex, set_fields: inferred };
      });
      setRotationExercises(hydratedRotation);
    }
    setClockSettings(parsed?.clock_settings && typeof parsed.clock_settings === 'object'
      ? parsed.clock_settings
      : {});
    setSubExercises(Array.isArray(parsed?.sub_exercises) ? parsed.sub_exercises : []);

    // Flip the gate AFTER React processes the queued setStates above
    // — a microtask runs after the current commit finishes, so by the
    // next render (when sync-back fires for real) state holds the
    // hydrated values and the gate is open.
    queueMicrotask(() => { hydratedRef.current = true; });
  }, [exercise?.id]);

  // ── Sync state → exercise.mode + tabata_data ──────────────────
  // Single batched onChange writes everything atomically. Diff-gated
  // so the hydration round-trip doesn't loop.
  useEffect(() => {
    // Don't push to parent until hydration has flipped the gate (see
    // hydratedRef above). Otherwise a fresh mount blanks the saved
    // tabata_data with the initial empty state.
    if (!hydratedRef.current) return;
    const method = TRAINING_METHODS[activeMethod];
    if (!method) return;

    const updates = {};
    // NONE saves mode as null to keep the DB clean (the TRAINING_METHODS
    // entry has mode: null already, but compare via ?? to dodge any
    // undefined-vs-null mismatch).
    const targetMode = method.mode ?? null;
    const currMode = exercise?.mode ?? null;
    if (currMode !== targetMode) updates.mode = targetMode;

    let existing = {};
    if (exercise?.tabata_data) {
      try {
        existing = typeof exercise.tabata_data === 'string'
          ? JSON.parse(exercise.tabata_data)
          : exercise.tabata_data;
      } catch {}
    }

    // Build the next payload — always carries method + set_fields +
    // method_config + planned_sets + rounds + stations + rotation +
    // clock so the DB row holds a consistent shape regardless of which
    // method the coach last picked. Each renderer reads only its own
    // keys; idle keys are inert.
    const nextPayload = {
      ...existing,
      method: method.mode,
      set_fields: selectedSetFields,
      planned_sets: plannedSetsDraft,
      method_config: methodConfig,
      rounds: roundsDraft,
      stations: stationsDraft,
      exercises_in_rotation: rotationExercises,
      clock_settings: clockSettings,
      sub_exercises: subExercises,
    };
    // SUPERSET / COMBO / EXERCISE_LIST carry a container_type for
    // downstream ExerciseCard.getVariant() detection (already-deployed
    // code routes container_type='list' → variant='list').
    if (activeMethod === 'SUPERSET' || activeMethod === 'COMBO' || activeMethod === 'EXERCISE_LIST') {
      nextPayload.container_type = 'list';
    } else if (activeMethod === 'TABATA') {
      nextPayload.container_type = 'tabata';
    }

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
  }, [
    activeMethod, selectedSetFields, plannedSetsDraft, methodConfig,
    roundsDraft, stationsDraft, rotationExercises, clockSettings,
    subExercises,
  ]);

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
    setSelectedSetFields((prev) => {
      const nextSelected = prev.includes(fieldId)
        ? prev.filter((f) => f !== fieldId)
        : [...prev, fieldId];
      console.log('CHIP TOGGLE: key', fieldId, 'now selected:', nextSelected);
      return nextSelected;
    });
  };

  const addRow = () => {
    if (readOnly) return;
    setPlannedSetsDraft((prev) => {
      // New row inherits values from the LAST existing row so adding sets
      // (e.g. 4 → 6) doesn't force the coach to retype reps/weight/etc.
      // Empty list → seed nulls for the picked params.
      const last = prev.length > 0 ? prev[prev.length - 1] : null;
      if (last) {
        return [...prev, { ...last, set_index: prev.length + 1 }];
      }
      const seed = { set_index: 1, variation_name: '' };
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
    if (activeMethod === 'NONE')       return 'סטים בתרגיל';
    if (activeMethod === 'REPS')       return 'סטים בתרגיל';
    if (activeMethod === 'PYRAMID')    return 'סטים בפירמידה';
    if (activeMethod === 'DROP_SET')   return 'סטים בדרופ סט';
    if (activeMethod === 'REST_PAUSE') return 'מיני-סטים';
    if (activeMethod === 'DELORME')    return 'סטים בדלורם';
    return null;
  }, [activeMethod]);

  // ── SUPERSET / COMBO helpers ────────────────────────────────
  const addRound = () => {
    if (readOnly) return;
    setRoundsDraft((prev) => [
      ...prev,
      { round_index: prev.length + 1, exercises: [{ name: '', set_fields: [] }] },
    ]);
  };
  const removeRound = (idx) => {
    if (readOnly) return;
    setRoundsDraft((prev) =>
      prev.filter((_, i) => i !== idx).map((r, i) => ({ ...r, round_index: i + 1 }))
    );
  };
  const addRoundExercise = (roundIdx) => {
    if (readOnly) return;
    setRoundsDraft((prev) =>
      prev.map((r, i) =>
        i === roundIdx
          ? { ...r, exercises: [...(r.exercises || []), { name: '', set_fields: [] }] }
          : r
      )
    );
  };
  const removeRoundExercise = (roundIdx, exIdx) => {
    if (readOnly) return;
    setRoundsDraft((prev) =>
      prev.map((r, i) =>
        i === roundIdx
          ? { ...r, exercises: (r.exercises || []).filter((_, j) => j !== exIdx) }
          : r
      )
    );
  };
  const updateRoundExercise = (roundIdx, exIdx, key, val) => {
    if (readOnly) return;
    setRoundsDraft((prev) =>
      prev.map((r, i) =>
        i === roundIdx
          ? {
              ...r,
              exercises: (r.exercises || []).map((e, j) =>
                j === exIdx ? { ...e, [key]: val } : e
              ),
            }
          : r
      )
    );
  };
  // Round-level duplicate — clones the whole round (with all its inner
  // exercises) and re-sequences round_index so the badges remain 1,2,3…
  // The inner exercises also get a shallow copy each so editing the
  // duplicate's inputs doesn't alias the original round's data.
  const duplicateRound = (idx) => {
    if (readOnly) return;
    setRoundsDraft((prev) => {
      const out = duplicateAtIndex(prev, idx, { indexField: 'round_index' });
      // Inner exercises get their own shallow copy AND a fresh set_fields
      // array so the per-exercise picker on the duplicate round doesn't
      // mutate the original round's chip selection.
      return out.map((r, i) => i === idx + 1
        ? { ...r, exercises: (r.exercises || []).map((e) => ({
            ...e,
            set_fields: Array.isArray(e.set_fields) ? [...e.set_fields] : [],
          })) }
        : r);
    });
  };
  // Inner-exercise duplicate — clones a single exercise WITHIN a round.
  // round.exercises has no per-item index field so no re-sequencing.
  // Deep-copies set_fields so the per-exercise chip picker on the
  // duplicate doesn't mutate the source's picked-field list.
  const duplicateRoundExercise = (roundIdx, exIdx) => {
    if (readOnly) return;
    setRoundsDraft((prev) => prev.map((r, i) =>
      i === roundIdx ? { ...r, exercises: duplicateAtIndex(r.exercises || [], exIdx, { deepArrayFields: ['set_fields'] }) } : r));
  };
  // Adjacent-swap reorder INSIDE a single round's exercises array.
  // Cross-round moves are not supported — the chevron chrome on each
  // inner exercise hides at the round's own array boundaries.
  const moveRoundExercise = (roundIdx, exIdx, direction) => {
    if (readOnly) return;
    setRoundsDraft((prev) => prev.map((r, i) => {
      if (i !== roundIdx) return r;
      const exs = r.exercises || [];
      if (direction === 'up' && exIdx === 0) return r;
      if (direction === 'down' && exIdx === exs.length - 1) return r;
      const newIdx = direction === 'up' ? exIdx - 1 : exIdx + 1;
      const updated = [...exs];
      [updated[exIdx], updated[newIdx]] = [updated[newIdx], updated[exIdx]];
      return { ...r, exercises: updated };
    }));
  };

  // ── CIRCUIT helpers ─────────────────────────────────────────
  const addStation = () => {
    if (readOnly) return;
    setStationsDraft((prev) => [
      ...prev,
      { station_index: prev.length + 1, name: '', type: 'reps', value: null },
    ]);
  };
  const removeStation = (idx) => {
    if (readOnly) return;
    setStationsDraft((prev) =>
      prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, station_index: i + 1 }))
    );
  };
  const updateStation = (idx, key, val) => {
    if (readOnly) return;
    setStationsDraft((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, [key]: val } : s))
    );
  };
  // Re-sequence station_index so badge numbers stay 1,2,3…
  const duplicateStation = (idx) => {
    if (readOnly) return;
    setStationsDraft((prev) => duplicateAtIndex(prev, idx, { indexField: 'station_index' }));
  };

  // ── TABATA helpers ──────────────────────────────────────────
  const addRotationExercise = () => {
    if (readOnly) return;
    setRotationExercises((prev) => [...prev, { name: '', set_fields: [] }]);
  };
  const removeRotationExercise = (idx) => {
    if (readOnly) return;
    setRotationExercises((prev) => prev.filter((_, i) => i !== idx));
  };
  const updateRotationExerciseName = (idx, name) => {
    if (readOnly) return;
    setRotationExercises((prev) => prev.map((e, i) => (i === idx ? { ...e, name } : e)));
  };
  // No index field on rotation entries — pure array-order duplicate.
  const duplicateRotation = (idx) => {
    if (readOnly) return;
    setRotationExercises((prev) => duplicateAtIndex(prev, idx));
  };
  // Adjacent-swap reorder driven by TabataSubExerciseCard's ChevronUp/Down.
  // Bounds-checked here AND in the card so the buttons hide at the edges
  // and the swap is a no-op if the caller somehow fires it past the end.
  const moveRotationExercise = (idx, direction) => {
    if (readOnly) return;
    setRotationExercises((prev) => {
      if (direction === 'up' && idx === 0) return prev;
      if (direction === 'down' && idx === prev.length - 1) return prev;
      const newIdx = direction === 'up' ? idx - 1 : idx + 1;
      const updated = [...prev];
      [updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]];
      return updated;
    });
    // Keep the same exercise expanded across the swap so the user sees
    // the card they just moved still open in its new position.
    setExpandedSubIndex((prev) => {
      if (prev === null) return prev;
      const newIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (prev === idx) return newIdx;
      if (prev === newIdx) return idx;
      return prev;
    });
  };
  // Per-param edit on a rotation entry — drives onUpdateParam from
  // TabataSubExerciseCard. PARAM_CATALOG ids land as top-level keys
  // on the rotation entry, mirroring the EXERCISE_LIST sub shape.
  const handleUpdateSubParam = (subIndex, paramId, newValue) => {
    if (readOnly) return;
    setRotationExercises((prev) =>
      prev.map((ex, i) => (i === subIndex ? { ...ex, [paramId]: newValue } : ex))
    );
  };
  // Toggle a PARAM_CATALOG id in/out of a single rotation entry's
  // set_fields list. Drives the chip picker inside TabataSubExerciseCard
  // open body. Preserves any value already entered for the field so
  // unpicking + repicking doesn't wipe what was typed.
  const handleToggleSubField = (subIndex, paramId) => {
    if (readOnly) return;
    setRotationExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== subIndex) return ex;
        const fields = Array.isArray(ex.set_fields) ? ex.set_fields : [];
        const next = fields.includes(paramId)
          ? fields.filter((f) => f !== paramId)
          : [...fields, paramId];
        return { ...ex, set_fields: next };
      })
    );
  };
  // Reserved for the step-3 name-edit pass; safe no-op alias for now
  // so the card can wire onUpdateName without parent changes later.
  const handleUpdateSubName = (subIndex, newName) => {
    updateRotationExerciseName(subIndex, newName);
  };
  const updateClockSetting = (key, val) => {
    if (readOnly) return;
    setClockSettings((prev) => ({ ...prev, [key]: val }));
  };

  // ── EXERCISE_LIST helpers ───────────────────────────────────
  const addSubExercise = () => {
    if (readOnly) return;
    setSubExercises((prev) => [...prev, { name: '' }]);
  };
  const removeSubExercise = (idx) => {
    if (readOnly) return;
    setSubExercises((prev) => prev.filter((_, i) => i !== idx));
  };
  const updateSubExercise = (idx, field, value) => {
    if (readOnly) return;
    setSubExercises((prev) =>
      prev.map((ex, i) => (i === idx ? { ...ex, [field]: value } : ex))
    );
  };
  // Each sub carries its own set_fields array — deep-copy that one
  // field so the per-sub picker on the duplicate doesn't mutate the
  // source's picked-field list.
  const duplicateSubExercise = (idx) => {
    if (readOnly) return;
    setSubExercises((prev) => duplicateAtIndex(prev, idx, { deepArrayFields: ['set_fields'] }));
  };
  // Adjacent-swap reorder for EXERCISE_LIST subs. No expanded-card
  // state to sync (subs are always rendered open inline).
  const moveSubExercise = (idx, direction) => {
    if (readOnly) return;
    setSubExercises((prev) => {
      if (direction === 'up' && idx === 0) return prev;
      if (direction === 'down' && idx === prev.length - 1) return prev;
      const newIdx = direction === 'up' ? idx - 1 : idx + 1;
      const updated = [...prev];
      [updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]];
      return updated;
    });
  };

  // EXERCISE_LIST per-exercise param picker — each sub-exercise
  // carries its own set_fields array. Toggles add/remove a field id
  // and PRESERVE any value already entered for that field (so picking
  // 'reps' then unpicking + repicking doesn't wipe what was typed).
  const toggleExerciseField = (exIdx, fieldId) => {
    if (readOnly) return;
    setSubExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== exIdx) return ex;
        const current = Array.isArray(ex.set_fields) ? ex.set_fields : [];
        const next = current.includes(fieldId)
          ? current.filter((f) => f !== fieldId)
          : [...current, fieldId];
        return { ...ex, set_fields: next };
      })
    );
  };

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
  // Single per-cell field renderer reused across every method's
  // editor. Bumped to 24 px Bebas for numbers + 34 px cell height
  // so the data-entry digits are legible at arm's length on a phone.
  const renderFieldInput = (fieldId, row, onChangeField) => {
    const meta = PARAM_CATALOG[fieldId];
    if (!meta) {
      // Defensive: a fieldId in selectedSetFields that isn't in
      // PARAM_CATALOG silently disappears. Surface it instead so a
      // typo'd legacy value (or a removed param) is debuggable.
      console.warn('[ModernExerciseForm] Unknown field id in selectedSetFields:', fieldId);
      return null;
    }
    const c = meta.color;

    // Text params with a preset list (body_position / equipment /
    // grip / load_type / side / range_of_motion / tempo / foot_position)
    // render as a <select> with curated defaults + user-added customs
    // from localStorage. The "+ הוסף מותאם" sentinel prompts for a new
    // value and persists it.
    if (meta.type === 'text' && hasOptions(fieldId)) {
      const options = getParamOptions(fieldId);
      const currentValue = row?.[fieldId] ?? '';
      return (
        <div
          key={fieldId}
          style={{
            background: 'white',
            border: `1px solid ${c.tint}`,
            borderRadius: 8,
            padding: '8px 10px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <span style={{
            fontSize: 10,
            color: c.textPrimary,
            fontWeight: 800,
            background: c.tint,
            padding: '2px 6px',
            borderRadius: 3,
            alignSelf: 'center',
          }}>
            {meta.label}
          </span>
          <select
            value={currentValue}
            onChange={(e) => {
              const val = e.target.value;
              if (val === '__custom__') {
                const custom = window.prompt(`הוסף ${meta.label} מותאם:`);
                if (custom && custom.trim()) {
                  const trimmed = custom.trim();
                  addParamOption(fieldId, trimmed);
                  onChangeField(fieldId, trimmed);
                }
              } else {
                onChangeField(fieldId, val);
              }
            }}
            dir="rtl"
            style={{
              width: '100%',
              height: 32,
              border: `1px solid ${c.tint}`,
              borderRadius: 6,
              padding: '0 8px',
              fontSize: 12,
              color: c.stripe,
              background: 'white',
              fontFamily: 'inherit',
              outline: 'none',
            }}
          >
            <option value="">— בחר —</option>
            {options.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
            <option value="__custom__">+ הוסף מותאם...</option>
          </select>
        </div>
      );
    }

    return (
      <div
        key={fieldId}
        style={{
          background: 'white',
          border: `1px solid ${c.tint}`,
          borderRadius: 8,
          padding: '8px 10px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 3,
        }}
      >
        <span style={{
          fontSize: 10,
          color: c.textPrimary,
          fontWeight: 800,
          background: c.tint,
          padding: '2px 6px',
          borderRadius: 3,
        }}>
          {meta.label}
        </span>
        <input
          type={meta.type}
          value={row?.[fieldId] ?? ''}
          onChange={(e) => onChangeField(
            fieldId,
            meta.type === 'number'
              ? (e.target.value === '' ? null : Number(e.target.value))
              : e.target.value
          )}
          style={{
            width: '100%',
            height: 34,
            border: 'none',
            textAlign: 'center',
            fontFamily: meta.type === 'number' ? "'Bebas Neue', sans-serif" : 'inherit',
            fontSize: meta.type === 'number' ? 24 : 12,
            color: c.stripe,
            background: 'transparent',
            outline: 'none',
          }}
        />
      </div>
    );
  };

  // ── Render ───────────────────────────────────────────────────
  console.log('FORM: current method', activeMethod, 'rows count', (plannedSetsDraft || []).length, 'selectedSetFields', selectedSetFields);
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
          <span style={{ fontSize: 11, color: 'var(--ag-accent)', fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase' }}>
            שיטה
          </span>
          {isAdmin && exercise?.id && (
            <button
              type="button"
              onClick={() => setShowVariationsModal(true)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: '#FFF7ED', color: 'var(--ag-accent)',
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
              border: '2px solid var(--ag-accent)',
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
          seeded when a method is first chosen. Hidden for TABATA
          (the clock settings replace per-set params there).
        ───────────────────────────────────────────────────── */}
      <div className="mb-4 px-1">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--ag-accent)', fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase' }}>
            פרמטרים לכל סט
          </span>
          <span style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 500 }}>
            לחץ להוסיף · יופיעו כשדות בכל סט
          </span>
        </div>

        {activeMethod === 'TABATA' ? (
          <div style={{
            background: '#FAFAFA',
            border: '1px dashed #E5E7EB',
            borderRadius: 8,
            padding: '12px 14px',
            fontSize: 12,
            color: '#6b7280',
            fontWeight: 600,
            textAlign: 'center',
          }}>
            טבטה משתמש בהגדרות שעון קבועות
          </div>
        ) : activeMethod === 'EXERCISE_LIST' ? (
          <div style={{
            background: '#F5F3FF',
            border: '1px dashed #C4B5FD',
            borderRadius: 8,
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <Info size={14} color="var(--ag-purple)" />
            <span style={{ fontSize: 11, color: '#5B21B6', fontWeight: 700 }}>
              ברשימת תרגילים — כל תרגיל בוחר את הפרמטרים שלו למטה
            </span>
          </div>
        ) : (
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
              const iconSize = isSelected ? 16 : 14;
              const labelStyle = {
                fontSize: isSelected ? 11 : 10,
                fontWeight: isSelected ? 800 : 600,
                color: isSelected ? c.textPrimary : '#374151',
                lineHeight: 1.1,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '100%',
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
                  {Icon && <Icon size={iconSize} color={isSelected ? c.textPrimary : '#6b7280'} />}
                  <span style={labelStyle}>{meta.label}</span>
                </button>
              );
            })}
          </div>
        )}

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
            <Info size={11} color="var(--ag-accent)" />
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
      {METHODS_WITH_PLANNED_SETS.includes(activeMethod) && !usesPerSetRows(activeMethod) && (
        <div className="mb-4 px-1">
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ag-text)', marginBottom: 10 }}>
            סטים בתרגיל
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{
              background: 'white',
              border: '1px solid #E5E7EB',
              borderRadius: 8,
              padding: '8px 10px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
            }}>
              <span style={{
                fontSize: 10,
                color: '#374151',
                fontWeight: 800,
                background: '#FAFAFA',
                padding: '2px 6px',
                borderRadius: 3,
              }}>סטים</span>
              <input
                type="number"
                value={exercise?.sets ?? ''}
                onChange={(e) => updateEx(
                  'sets',
                  e.target.value === '' ? null : Number(e.target.value)
                )}
                disabled={readOnly}
                style={{
                  width: '100%',
                  height: 34,
                  border: 'none',
                  textAlign: 'center',
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: 24,
                  color: '#374151',
                  background: 'transparent',
                  outline: 'none',
                }}
              />
            </div>
            <div style={{
              background: 'white',
              border: '1px solid #D97706',
              borderRadius: 8,
              padding: '8px 10px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
            }}>
              <span style={{
                fontSize: 10,
                color: '#92400E',
                fontWeight: 800,
                background: '#FFFBEB',
                padding: '2px 6px',
                borderRadius: 3,
              }}>חזרות</span>
              <input
                type="number"
                value={exercise?.reps ?? ''}
                onChange={(e) => updateEx(
                  'reps',
                  e.target.value === '' ? null : Number(e.target.value)
                )}
                disabled={readOnly}
                style={{
                  width: '100%',
                  height: 34,
                  border: 'none',
                  textAlign: 'center',
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: 24,
                  color: '#D97706',
                  background: 'transparent',
                  outline: 'none',
                }}
              />
            </div>
          </div>
        </div>
      )}

      {METHODS_WITH_PLANNED_SETS.includes(activeMethod) && usesPerSetRows(activeMethod) && (
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
                      color: 'var(--ag-text)',
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

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ag-text)' }}>
              {sectionThreeHeader}
            </span>
            <button
              type="button"
              onClick={addRow}
              disabled={readOnly}
              style={{
                background: 'white',
                border: '1px solid #FFD0AC',
                color: 'var(--ag-accent)',
                padding: '10px 16px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 800,
                cursor: readOnly ? 'default' : 'pointer',
                fontFamily: 'inherit',
                minHeight: 40,
              }}
            >
              {addRowButtonLabel}
            </button>
          </div>

          {plannedSetsDraft.length === 0 ? (
            selectedSetFields.length === 0 ? (
              // No params + no sets — point the coach at Section 2 first.
              <div style={{
                padding: 20,
                textAlign: 'center',
                color: '#9CA3AF',
                background: '#FAFAFA',
                borderRadius: 8,
                fontSize: 12,
              }}>
                בחר פרמטרים מעלה כדי שיופיעו בכל סט
              </div>
            ) : (
              // Params picked but no sets — prominent CTA that
              // explains the relationship and adds the first row.
              // width:100% + boxSizing:border-box so the box always
              // fits the dialog viewport on narrow phones; the button
              // fills the box so it's unmistakable and tap-friendly.
              <div style={{
                background: 'linear-gradient(135deg, #FFF5EE, #FFFAF5)',
                border: '2px dashed #FFD0AC',
                borderRadius: 12,
                padding: 20,
                textAlign: 'center',
                width: '100%',
                maxWidth: '100%',
                boxSizing: 'border-box',
              }}>
                <div style={{ fontSize: 13, color: '#993C1D', fontWeight: 800, marginBottom: 4 }}>
                  בחרת {selectedSetFields.length} פרמטרים
                </div>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 14 }}>
                  {activeMethod === 'REST_PAUSE'
                    ? 'הוסף מיני-סט ראשון כדי לראות אותם'
                    : 'הוסף סט ראשון כדי לראות אותם'}
                </div>
                <button
                  type="button"
                  onClick={addRow}
                  disabled={readOnly}
                  style={{
                    background: 'linear-gradient(135deg, #FF8B47, var(--ag-accent))',
                    color: 'white',
                    border: 'none',
                    padding: '14px 24px',
                    borderRadius: 10,
                    fontWeight: 800,
                    fontSize: 15,
                    fontFamily: 'inherit',
                    cursor: readOnly ? 'default' : 'pointer',
                    boxShadow: '0 4px 12px rgba(255,111,32,0.25)',
                    width: '100%',
                    maxWidth: '100%',
                    boxSizing: 'border-box',
                    minHeight: 48,
                  }}
                >
                  {activeMethod === 'REST_PAUSE'
                    ? '+ הוסף מיני-סט ראשון'
                    : '+ הוסף סט ראשון'}
                </button>
              </div>
            )
          ) : (
            <div>
              {plannedSetsDraft.map((row, i) => {
                const variationEmpty = !(row.variation_name || '').trim();
                const variationBorder = variationRequired && variationEmpty
                  ? '1px solid var(--ag-accent)'
                  : '1px solid #FFD0AC';
                const variationPlaceholder =
                  activeMethod === 'PYRAMID'  ? 'וריאציה (לדוגמה: שכיבת סמיכה במנח 8)'
                  : activeMethod === 'REPS'   ? 'וריאציה (אופציונלי)'
                  : variationRequired         ? 'וריאציה לסט זה (חובה)'
                  :                             'וריאציה';
                return (
                  <div key={i} style={{
                    background: 'var(--ag-bg)',
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
                        color: 'var(--ag-accent)',
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
                            color: 'var(--ag-text)',
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
                    {selectedSetFields.length > 0 && (() => {
                      if (i === 0) {
                        console.log('SYNC: selectedSetFields', selectedSetFields);
                        console.log('SYNC: columns being rendered', selectedSetFields);
                        console.log('SYNC: plannedSetsDraft row 0 keys', Object.keys(plannedSetsDraft[0] || {}));
                      }
                      return (
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(72px, 1fr))',
                          gap: 6,
                        }}>
                          {selectedSetFields.map((fieldId) =>
                            renderFieldInput(fieldId, row, (f, v) => updateRow(i, f, v))
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          )}

          {/* Validation hint — visual only, doesn't block save. */}
          {hasMissingVariations && (
            <div style={{ fontSize: 10, color: 'var(--ag-accent)', marginTop: 4 }}>
              {activeMethod === 'DROP_SET'
                ? '⚠ דרופ סט דורש וריאציה לכל סט'
                : '⚠ דלורם דורש וריאציה לכל סט'}
            </div>
          )}

          {/* Empty-state hint when sets exist but zero params are
              picked. Gated on plannedSetsDraft.length > 0 so it
              doesn't duplicate the new no-sets empty-state above. */}
          {plannedSetsDraft.length > 0 && selectedSetFields.length === 0 && (
            <div style={{
              fontSize: 11,
              color: '#9CA3AF',
              textAlign: 'center',
              padding: 12,
              background: '#FAFAFA',
              borderRadius: 8,
              marginTop: 8,
            }}>
              בחר פרמטרים מעלה כדי שיופיעו בכל סט
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────
          SECTION 3 — SUPERSET / COMBO (rounds with horizontal
          exercise flow). Both share the same data shape; only the
          palette + inter-exercise connector differ.
        ───────────────────────────────────────────────────── */}
      {METHODS_WITH_ROUNDS.includes(activeMethod) && (() => {
        const isCombo = activeMethod === 'COMBO';
        const palette = isCombo
          ? { card: '#FFE4D6', border: '#FFD0AC', text: '#993C1D', accent: 'var(--ag-accent)', name: 'חזרה' }
          : { card: '#F5F3FF', border: '#C4B5FD', text: 'var(--ag-purple)', accent: 'var(--ag-purple)', name: 'סט סופר' };

        return (
          <div className="mb-4 px-1">
            {isCombo && (
              <div style={{
                background: 'linear-gradient(135deg, #FFF5EE, #FFFAF5)',
                border: '1px solid #FFD0AC',
                borderRadius: 8,
                padding: '8px 12px',
                marginBottom: 10,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}>
                <Zap size={12} color="var(--ag-accent)" />
                <span style={{ fontSize: 11, color: '#993C1D', fontWeight: 700 }}>
                  רצף זורם · ללא מנוחה
                </span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ag-text)' }}>
                {isCombo ? 'חזרות בקומבו' : 'סטים בסופרסט'}
              </span>
              <button
                type="button"
                onClick={addRound}
                disabled={readOnly}
                style={{
                  background: 'white',
                  border: `1px solid ${palette.border}`,
                  color: palette.accent,
                  padding: '6px 12px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: readOnly ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {isCombo ? '+ הוסף חזרה' : '+ הוסף סט סופר'}
              </button>
            </div>

            {roundsDraft.length === 0 ? (
              <div style={{
                padding: 20,
                textAlign: 'center',
                color: '#9CA3AF',
                background: '#FAFAFA',
                borderRadius: 8,
                fontSize: 12,
              }}>
                {isCombo
                  ? 'אין חזרות מוגדרות — לחץ "הוסף חזרה" כדי להתחיל'
                  : 'אין סטים מוגדרים — לחץ "הוסף סט סופר" כדי להתחיל'}
              </div>
            ) : (
              <div>
                {roundsDraft.map((round, ri) => (
                  <div key={ri} style={{
                    background: palette.card,
                    border: `1px solid ${palette.border}`,
                    borderRadius: 10,
                    padding: 12,
                    marginBottom: 8,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <span style={{
                        fontFamily: "'Bebas Neue', sans-serif",
                        fontSize: 24,
                        color: palette.accent,
                        lineHeight: 1,
                        minWidth: 28,
                        fontWeight: 800,
                      }}>
                        {String(round.round_index ?? (ri + 1)).padStart(2, '0')}
                      </span>
                      <span style={{
                        background: 'white',
                        color: palette.accent,
                        border: `1px solid ${palette.border}`,
                        borderRadius: 999,
                        padding: '2px 10px',
                        fontSize: 10,
                        fontWeight: 800,
                      }}>
                        {palette.name} {round.round_index ?? (ri + 1)}
                      </span>
                      <button
                        type="button"
                        onClick={() => duplicateRound(ri)}
                        aria-label={isCombo ? 'שכפל חזרה' : 'שכפל סט סופר'}
                        title="שכפל"
                        style={{
                          marginInlineStart: 'auto',
                          width: 28,
                          height: 28,
                          background: 'transparent',
                          border: 'none',
                          color: '#9CA3AF',
                          cursor: readOnly ? 'default' : 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: 0,
                        }}
                      ><Copy size={15} /></button>
                      <button
                        type="button"
                        onClick={() => removeRound(ri)}
                        aria-label={isCombo ? 'הסר חזרה' : 'הסר סט סופר'}
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

                    {(round.exercises || []).map((ex, ei) => {
                      const exerciseLetter = String.fromCharCode(0x05D0 + ei); // א, ב, ג, …
                      return (
                        <React.Fragment key={ei}>
                          {ei > 0 && (
                            <div style={{
                              textAlign: 'center',
                              color: palette.accent,
                              fontSize: isCombo ? 16 : 10,
                              fontWeight: 800,
                              margin: '3px 0',
                            }}>
                              {isCombo ? <ArrowLeft size={16} style={{ display: 'inline-block' }} /> : 'ואז'}
                            </div>
                          )}
                          <div style={{
                            background: 'white',
                            border: '1px solid #E5E7EB',
                            borderRadius: 7,
                            padding: 8,
                            marginBottom: 4,
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: selectedSetFields.length > 0 ? 6 : 0 }}>
                              <span style={{
                                background: palette.card,
                                color: palette.accent,
                                border: `1px solid ${palette.border}`,
                                borderRadius: 999,
                                padding: '2px 8px',
                                fontSize: 11,
                                fontWeight: 800,
                                whiteSpace: 'nowrap',
                                flexShrink: 0,
                              }}>
                                תרגיל {exerciseLetter}
                              </span>
                              <input
                                type="text"
                                placeholder="שם התרגיל"
                                value={ex.name ?? ''}
                                onChange={(e) => updateRoundExercise(ri, ei, 'name', e.target.value)}
                                style={{
                                  flex: 1,
                                  height: 30,
                                  padding: '0 10px',
                                  border: '1px solid #E5E7EB',
                                  borderRadius: 6,
                                  fontSize: 12,
                                  color: 'var(--ag-text)',
                                  background: 'white',
                                  fontFamily: 'inherit',
                                  outline: 'none',
                                }}
                              />
                              {ei > 0 && (
                                <button
                                  type="button"
                                  onClick={() => moveRoundExercise(ri, ei, 'up')}
                                  aria-label="העלה תרגיל"
                                  title="העלה"
                                  disabled={readOnly}
                                  style={{
                                    width: 24, height: 24,
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#9CA3AF',
                                    cursor: readOnly ? 'default' : 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: 0,
                                  }}
                                ><ChevronUp size={14} /></button>
                              )}
                              {ei < (round.exercises || []).length - 1 && (
                                <button
                                  type="button"
                                  onClick={() => moveRoundExercise(ri, ei, 'down')}
                                  aria-label="הורד תרגיל"
                                  title="הורד"
                                  disabled={readOnly}
                                  style={{
                                    width: 24, height: 24,
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#9CA3AF',
                                    cursor: readOnly ? 'default' : 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: 0,
                                  }}
                                ><ChevronDown size={14} /></button>
                              )}
                              <button
                                type="button"
                                onClick={() => duplicateRoundExercise(ri, ei)}
                                aria-label="שכפל תרגיל"
                                title="שכפל"
                                style={{
                                  width: 24,
                                  height: 24,
                                  background: 'transparent',
                                  border: 'none',
                                  color: '#9CA3AF',
                                  cursor: readOnly ? 'default' : 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  padding: 0,
                                }}
                              ><Copy size={13} /></button>
                              <button
                                type="button"
                                onClick={() => removeRoundExercise(ri, ei)}
                                aria-label="הסר תרגיל"
                                style={{
                                  width: 24,
                                  height: 24,
                                  background: 'transparent',
                                  border: 'none',
                                  color: '#9CA3AF',
                                  cursor: readOnly ? 'default' : 'pointer',
                                  fontSize: 16,
                                  lineHeight: 1,
                                }}
                              >×</button>
                            </div>
                            {/* Per-exercise chip picker — each exercise inside
                                a combo round picks its own parameters. The
                                parent's selectedSetFields stays as a fallback
                                for legacy rows that have no ex.set_fields yet. */}
                            <div style={{
                              marginTop: 6,
                              marginBottom: 6,
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: 4,
                              alignItems: 'center',
                            }}>
                              <span style={{ fontSize: 11, color: '#666', fontWeight: 600, marginInlineEnd: 4 }}>
                                פרמטרים
                              </span>
                              {Object.keys(PARAM_CATALOG).map((paramId) => {
                                const exFields = Array.isArray(ex.set_fields) ? ex.set_fields : [];
                                const selected = exFields.includes(paramId);
                                return (
                                  <button
                                    key={paramId}
                                    type="button"
                                    onClick={() => {
                                      const updated = selected
                                        ? exFields.filter((f) => f !== paramId)
                                        : [...exFields, paramId];
                                      updateRoundExercise(ri, ei, 'set_fields', updated);
                                    }}
                                    disabled={readOnly}
                                    style={{
                                      padding: '4px 8px',
                                      borderRadius: 6,
                                      fontSize: 11,
                                      fontWeight: 600,
                                      background: selected ? '#FF6F20' : '#f3f4f6',
                                      color: selected ? '#fff' : '#666',
                                      border: 'none',
                                      cursor: readOnly ? 'default' : 'pointer',
                                      fontFamily: 'inherit',
                                    }}
                                  >
                                    {PARAM_CATALOG[paramId]?.label}
                                  </button>
                                );
                              })}
                            </div>

                            {/* Inputs grid — driven by ex.set_fields when set,
                                falls back to the parent's global selectedSetFields
                                so legacy combo rows still show their inputs. */}
                            {(() => {
                              const effective = (Array.isArray(ex.set_fields) && ex.set_fields.length > 0)
                                ? ex.set_fields
                                : selectedSetFields;
                              if (!effective || effective.length === 0) return null;
                              return (
                                <div style={{
                                  display: 'grid',
                                  gridTemplateColumns: 'repeat(auto-fit, minmax(72px, 1fr))',
                                  gap: 6,
                                }}>
                                  {effective.map((fieldId) =>
                                    renderFieldInput(fieldId, ex, (f, v) => updateRoundExercise(ri, ei, f, v))
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        </React.Fragment>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() => addRoundExercise(ri)}
                      disabled={readOnly}
                      style={{
                        marginTop: 6,
                        background: 'transparent',
                        border: `1px dashed ${palette.border}`,
                        color: palette.accent,
                        padding: '6px 12px',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: readOnly ? 'default' : 'pointer',
                        fontFamily: 'inherit',
                        width: '100%',
                      }}
                    >
                      + הוסף תרגיל
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* ─────────────────────────────────────────────────────
          SECTION 3 — EXERCISE_LIST (flat universal list).
          A generic container with sub_exercises and an optional set
          of per-exercise param fields. Rendered downstream by the
          ExerciseCard 'list' variant.
        ───────────────────────────────────────────────────── */}
      {METHODS_WITH_LIST.includes(activeMethod) && (
        <div className="mb-4 px-1">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ag-text)' }}>
              תרגילים ברשימה
            </span>
            <button
              type="button"
              onClick={addSubExercise}
              disabled={readOnly}
              style={{
                background: 'white',
                border: '1px solid #C4B5FD',
                color: 'var(--ag-purple)',
                padding: '8px 14px',
                borderRadius: 7,
                fontSize: 11,
                fontWeight: 800,
                cursor: readOnly ? 'default' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              + הוסף תרגיל
            </button>
          </div>

          {subExercises.length === 0 ? (
            <div style={{
              background: '#FAFAFA',
              border: '1px dashed #E5E7EB',
              borderRadius: 8,
              padding: 20,
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 12, color: '#9CA3AF' }}>
                אין תרגילים ברשימה — לחץ "+ הוסף תרגיל"
              </div>
            </div>
          ) : (
            <div>
              {subExercises.map((ex, ei) => {
                const exFields = Array.isArray(ex.set_fields) ? ex.set_fields : [];
                const exFieldsCount = exFields.length;
                return (
                  <div key={ei} style={{
                    background: '#F5F3FF',
                    border: '1px solid #C4B5FD',
                    borderRadius: 10,
                    padding: 12,
                    marginBottom: 8,
                  }}>
                    {/* LINE 1 — index + name + delete */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 10,
                    }}>
                      <span style={{
                        fontFamily: "'Bebas Neue', sans-serif",
                        fontSize: 22,
                        color: 'var(--ag-purple)',
                        lineHeight: 1,
                        minWidth: 28,
                        fontWeight: 800,
                      }}>
                        {String(ei + 1).padStart(2, '0')}
                      </span>
                      <input
                        type="text"
                        placeholder="שם התרגיל"
                        value={ex.name ?? ''}
                        onChange={(e) => updateSubExercise(ei, 'name', e.target.value)}
                        style={{
                          flex: 1,
                          height: 32,
                          padding: '0 10px',
                          border: '1px solid #C4B5FD',
                          borderRadius: 6,
                          fontSize: 12,
                          color: 'var(--ag-text)',
                          background: 'white',
                          fontFamily: 'inherit',
                          outline: 'none',
                        }}
                      />
                      {ei > 0 && (
                        <button
                          type="button"
                          onClick={() => moveSubExercise(ei, 'up')}
                          disabled={readOnly}
                          aria-label="העלה תרגיל"
                          title={readOnly ? 'לא ניתן לערוך' : 'העלה תרגיל'}
                          style={{
                            width: 32, height: 32,
                            background: readOnly ? '#f3f4f6' : '#fff',
                            border: `1px solid ${readOnly ? '#e5e7eb' : '#cbd5e1'}`,
                            color: readOnly ? '#9ca3af' : '#475569',
                            borderRadius: 6,
                            cursor: readOnly ? 'not-allowed' : 'pointer',
                            opacity: readOnly ? 0.5 : 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 0,
                          }}
                        ><ChevronUp size={16} /></button>
                      )}
                      {ei < subExercises.length - 1 && (
                        <button
                          type="button"
                          onClick={() => moveSubExercise(ei, 'down')}
                          disabled={readOnly}
                          aria-label="הורד תרגיל"
                          title={readOnly ? 'לא ניתן לערוך' : 'הורד תרגיל'}
                          style={{
                            width: 32, height: 32,
                            background: readOnly ? '#f3f4f6' : '#fff',
                            border: `1px solid ${readOnly ? '#e5e7eb' : '#cbd5e1'}`,
                            color: readOnly ? '#9ca3af' : '#475569',
                            borderRadius: 6,
                            cursor: readOnly ? 'not-allowed' : 'pointer',
                            opacity: readOnly ? 0.5 : 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 0,
                          }}
                        ><ChevronDown size={16} /></button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          duplicateSubExercise(ei);
                          if (!readOnly) toast.success('תרגיל שוכפל');
                        }}
                        disabled={readOnly}
                        aria-label="שכפל תרגיל"
                        title={readOnly ? 'לא ניתן לערוך' : 'שכפל תרגיל'}
                        style={{
                          width: 32,
                          height: 32,
                          background: readOnly ? '#f3f4f6' : '#fff',
                          border: `1px solid ${readOnly ? '#e5e7eb' : '#ff6f20'}`,
                          color: readOnly ? '#9ca3af' : '#ff6f20',
                          borderRadius: 6,
                          cursor: readOnly ? 'not-allowed' : 'pointer',
                          opacity: readOnly ? 0.5 : 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: 0,
                        }}
                      ><Copy size={16} /></button>
                      <button
                        type="button"
                        onClick={() => {
                          removeSubExercise(ei);
                          if (!readOnly) toast.success('תרגיל הוסר');
                        }}
                        disabled={readOnly}
                        aria-label="הסר תרגיל"
                        title={readOnly ? 'לא ניתן לערוך' : 'הסר תרגיל'}
                        style={{
                          width: 32,
                          height: 32,
                          background: readOnly ? '#f3f4f6' : '#fff',
                          border: `1px solid ${readOnly ? '#e5e7eb' : '#dc2626'}`,
                          color: readOnly ? '#9ca3af' : '#dc2626',
                          borderRadius: 6,
                          cursor: readOnly ? 'not-allowed' : 'pointer',
                          opacity: readOnly ? 0.5 : 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: 0,
                        }}
                      ><Trash2 size={16} /></button>
                    </div>

                    {/* LINE 2 — per-exercise param picker. 16 chips,
                        compact, scoped to this exercise only. */}
                    <div style={{ marginBottom: 8 }}>
                      <div style={{
                        fontSize: 9,
                        color: '#5B21B6',
                        fontWeight: 800,
                        marginBottom: 6,
                        letterSpacing: 0.5,
                      }}>
                        פרמטרים לתרגיל זה
                      </div>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 1fr)',
                        gap: 4,
                      }}>
                        {Object.entries(PARAM_CATALOG).map(([fieldId, meta]) => {
                          const selected = exFields.includes(fieldId);
                          const Icon = meta.icon;
                          return (
                            <button
                              key={fieldId}
                              type="button"
                              onClick={() => toggleExerciseField(ei, fieldId)}
                              style={{
                                background: selected
                                  ? `linear-gradient(135deg, ${meta.color.tint}, white)`
                                  : 'white',
                                border: selected
                                  ? `2px solid ${meta.color.stripe}`
                                  : '1px solid #E5E7EB',
                                borderRadius: 6,
                                padding: '6px 2px',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: 2,
                                position: 'relative',
                                cursor: readOnly ? 'default' : 'pointer',
                                fontFamily: 'inherit',
                              }}
                            >
                              {selected && (
                                <span style={{
                                  position: 'absolute',
                                  top: -3,
                                  left: -3,
                                  background: meta.color.stripe,
                                  color: 'white',
                                  width: 12,
                                  height: 12,
                                  borderRadius: '50%',
                                  fontSize: 7,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontWeight: 800,
                                }}>✓</span>
                              )}
                              {Icon && (
                                <Icon
                                  size={selected ? 12 : 11}
                                  color={selected ? meta.color.stripe : '#9CA3AF'}
                                />
                              )}
                              <span style={{
                                fontSize: selected ? 9 : 8,
                                color: selected ? meta.color.textPrimary : '#6b7280',
                                fontWeight: selected ? 800 : 600,
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
                    </div>

                    {/* LINE 3 — dynamic input fields per THIS exercise's set_fields */}
                    {exFieldsCount > 0 ? (
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(72px, 1fr))',
                        gap: 6,
                      }}>
                        {exFields.map((fieldId) =>
                          renderFieldInput(fieldId, ex, (f, v) => updateSubExercise(ei, f, v))
                        )}
                      </div>
                    ) : (
                      <div style={{
                        fontSize: 10,
                        color: '#9CA3AF',
                        textAlign: 'center',
                        padding: 8,
                        background: 'white',
                        borderRadius: 6,
                        border: '1px dashed #E5E7EB',
                      }}>
                        בחר פרמטרים מעלה כדי שיופיעו כשדות
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────
          SECTION 3 — CIRCUIT (horizontal stations + rounds /
          group-mode method_config header).
        ───────────────────────────────────────────────────── */}
      {METHODS_WITH_STATIONS.includes(activeMethod) && (
        <div className="mb-4 px-1">
          <div style={{
            background: 'linear-gradient(135deg, #FFF5EE, white)',
            border: '1px solid #FFD0AC',
            borderRadius: 10,
            padding: 12,
            marginBottom: 14,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <label style={{ fontSize: 10, color: '#993C1D', fontWeight: 800 }}>
                מספר סבבים
              </label>
              <input
                type="number"
                min="1"
                value={methodConfig.rounds ?? ''}
                onChange={(e) => updateMethodConfig(
                  'rounds',
                  e.target.value === '' ? null : Number(e.target.value)
                )}
                style={{
                  width: 60,
                  height: 30,
                  padding: '0 8px',
                  border: '1px solid #FFD0AC',
                  borderRadius: 6,
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: 18,
                  color: 'var(--ag-accent)',
                  background: 'white',
                  textAlign: 'center',
                  outline: 'none',
                }}
              />
              <span style={{ flex: 1 }} />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ag-text)' }}>
              תחנות
            </span>
            <button
              type="button"
              onClick={addStation}
              disabled={readOnly}
              style={{
                background: 'white',
                border: '1px solid #BFDBFE',
                color: '#1D4ED8',
                padding: '6px 12px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 800,
                cursor: readOnly ? 'default' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              + הוסף תחנה
            </button>
          </div>

          {stationsDraft.length === 0 ? (
            <div style={{
              padding: 20,
              textAlign: 'center',
              color: '#9CA3AF',
              background: '#FAFAFA',
              borderRadius: 8,
              fontSize: 12,
            }}>
              אין תחנות — לחץ "הוסף תחנה" כדי להתחיל
            </div>
          ) : (
            <div style={{
              display: 'flex',
              flexDirection: 'row',
              gap: 8,
              overflowX: 'auto',
              paddingBottom: 4,
            }}>
              {stationsDraft.map((station, si) => {
                const isTime = station.type === 'time';
                const valueColor = isTime ? '#14B8A6' : '#D97706';
                const valueTint  = isTime ? '#F0FDFA' : '#FFFBEB';
                return (
                  <div key={si} style={{
                    minWidth: 160,
                    background: 'white',
                    border: '1px solid #E5E7EB',
                    borderRadius: 10,
                    padding: 10,
                    flexShrink: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        fontFamily: "'Bebas Neue', sans-serif",
                        fontSize: 22,
                        color: '#1D4ED8',
                        lineHeight: 1,
                        fontWeight: 800,
                        minWidth: 26,
                      }}>
                        {String(station.station_index ?? (si + 1)).padStart(2, '0')}
                      </span>
                      <button
                        type="button"
                        onClick={() => duplicateStation(si)}
                        aria-label="שכפל תחנה"
                        title="שכפל"
                        style={{
                          marginInlineStart: 'auto',
                          width: 24,
                          height: 24,
                          background: 'transparent',
                          border: 'none',
                          color: '#9CA3AF',
                          cursor: readOnly ? 'default' : 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: 0,
                        }}
                      ><Copy size={13} /></button>
                      <button
                        type="button"
                        onClick={() => removeStation(si)}
                        aria-label="הסר תחנה"
                        style={{
                          width: 24,
                          height: 24,
                          background: 'transparent',
                          border: 'none',
                          color: '#9CA3AF',
                          cursor: readOnly ? 'default' : 'pointer',
                          fontSize: 16,
                          lineHeight: 1,
                        }}
                      >×</button>
                    </div>
                    <input
                      type="text"
                      placeholder="שם התחנה"
                      value={station.name ?? ''}
                      onChange={(e) => updateStation(si, 'name', e.target.value)}
                      style={{
                        height: 30,
                        padding: '0 8px',
                        border: '1px solid #E5E7EB',
                        borderRadius: 6,
                        fontSize: 12,
                        color: 'var(--ag-text)',
                        background: 'white',
                        fontFamily: 'inherit',
                        outline: 'none',
                      }}
                    />
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        type="button"
                        onClick={() => updateStation(si, 'type', 'reps')}
                        style={{
                          flex: 1,
                          padding: '4px 6px',
                          background: !isTime ? '#FFFBEB' : 'white',
                          color: !isTime ? '#92400E' : '#9CA3AF',
                          border: !isTime ? '1.5px solid #D97706' : '1px solid #E5E7EB',
                          borderRadius: 6,
                          fontSize: 10,
                          fontWeight: 800,
                          cursor: readOnly ? 'default' : 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        חזרות
                      </button>
                      <button
                        type="button"
                        onClick={() => updateStation(si, 'type', 'time')}
                        style={{
                          flex: 1,
                          padding: '4px 6px',
                          background: isTime ? '#F0FDFA' : 'white',
                          color: isTime ? '#0F766E' : '#9CA3AF',
                          border: isTime ? '1.5px solid #14B8A6' : '1px solid #E5E7EB',
                          borderRadius: 6,
                          fontSize: 10,
                          fontWeight: 800,
                          cursor: readOnly ? 'default' : 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        זמן
                      </button>
                    </div>
                    <input
                      type="number"
                      placeholder={isTime ? 'שניות' : 'חזרות'}
                      value={station.value ?? ''}
                      onChange={(e) => updateStation(
                        si,
                        'value',
                        e.target.value === '' ? null : Number(e.target.value)
                      )}
                      style={{
                        height: 36,
                        padding: '0 10px',
                        border: `1.5px solid ${valueColor}`,
                        background: valueTint,
                        borderRadius: 6,
                        fontFamily: "'Bebas Neue', sans-serif",
                        fontSize: 22,
                        color: valueColor,
                        textAlign: 'center',
                        outline: 'none',
                      }}
                    />
                    {selectedSetFields.length > 0 && (
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(64px, 1fr))',
                        gap: 4,
                      }}>
                        {selectedSetFields.map((fieldId) =>
                          renderFieldInput(fieldId, station, (f, v) => updateStation(si, f, v))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────
          SECTION 3 — TABATA (exercise rotation + 5 clock params).
          Section 2 is replaced with a static note above.
        ───────────────────────────────────────────────────── */}
      {METHODS_WITH_CLOCK.includes(activeMethod) && (
        <div className="mb-4 px-1">
          {/* Rotation list */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ag-text)' }}>
              תרגילים ברוטציה
            </span>
            <button
              type="button"
              onClick={addRotationExercise}
              disabled={readOnly}
              style={{
                background: 'white',
                border: '1px solid #BFDBFE',
                color: '#1D4ED8',
                padding: '6px 12px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 800,
                cursor: readOnly ? 'default' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              + הוסף תרגיל
            </button>
          </div>

          {/* Rotation list — card-based editor backed by
              TabataSubExerciseCard. Single-open-at-a-time via
              expandedSubIndex: tapping a closed card opens it (and
              implicitly closes any sibling); tapping the same card's
              header or its bottom "סיום" button re-fires the toggle
              and closes it. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginBottom: 14 }}>
            {rotationExercises.length === 0 ? (
              <div style={{
                padding: 20,
                textAlign: 'center',
                color: '#9CA3AF',
                background: '#FAFAFA',
                borderRadius: 8,
                fontSize: 12,
              }}>
                אין תרגילים ברוטציה — לחץ "הוסף תרגיל" כדי להתחיל
              </div>
            ) : (
              rotationExercises.map((sub, idx) => (
                <TabataSubExerciseCard
                  key={`sub-${idx}`}
                  sub={sub}
                  index={idx}
                  totalCount={rotationExercises.length}
                  isExpanded={expandedSubIndex === idx}
                  onOpen={() => setExpandedSubIndex(expandedSubIndex === idx ? null : idx)}
                  canEdit={!readOnly}
                  onDelete={() => {
                    removeRotationExercise(idx);
                    if (expandedSubIndex === idx) setExpandedSubIndex(null);
                  }}
                  onDuplicate={() => duplicateRotation(idx)}
                  onMoveUp={() => moveRotationExercise(idx, 'up')}
                  onMoveDown={() => moveRotationExercise(idx, 'down')}
                  onUpdateName={handleUpdateSubName}
                  onUpdateParam={handleUpdateSubParam}
                  onToggleField={handleToggleSubField}
                  plan={exercise}
                />
              ))
            )}
          </div>

          {/* Bottom add-row button — mirrors the header "+ הוסף תרגיל"
              so the coach can keep adding without scrolling back up. */}
          <button
            type="button"
            onClick={addRotationExercise}
            disabled={readOnly}
            style={{
              width: '100%',
              padding: 12,
              marginTop: 8,
              marginBottom: 14,
              background: 'var(--ag-accent)',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 700,
              cursor: readOnly ? 'default' : 'pointer',
              fontFamily: 'inherit',
              opacity: readOnly ? 0.5 : 1,
            }}
          >
            + הוסף תרגיל
          </button>

          {/* Clock settings */}
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ag-text)', marginBottom: 10 }}>
            הגדרות שעון
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: 6,
          }}>
            {[
              { key: 'work_seconds',      label: 'עבודה',   color: 'var(--ag-accent)', tint: '#FFF5EE' },
              { key: 'rest_seconds',      label: 'מנוחה',   color: '#14B8A6', tint: '#F0FDFA' },
              { key: 'rounds',            label: 'סבבים',   color: '#6b7280', tint: '#FAFAFA' },
              { key: 'sets',              label: 'סטים',    color: '#6b7280', tint: '#FAFAFA' },
              { key: 'rest_between_sets', label: 'בין סטים', color: '#14B8A6', tint: '#F0FDFA' },
            ].map((field) => (
              <div key={field.key} style={{
                background: 'white',
                border: `1px solid ${field.tint}`,
                borderRadius: 8,
                padding: '8px 6px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
              }}>
                <input
                  type="number"
                  min="0"
                  value={clockSettings[field.key] ?? ''}
                  onChange={(e) => updateClockSetting(
                    field.key,
                    e.target.value === '' ? null : Number(e.target.value)
                  )}
                  style={{
                    width: '100%',
                    height: 34,
                    border: 'none',
                    textAlign: 'center',
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: 24,
                    color: field.color,
                    background: 'transparent',
                    outline: 'none',
                  }}
                />
                <span style={{
                  fontSize: 10,
                  color: field.color,
                  fontWeight: 800,
                  background: field.tint,
                  padding: '2px 6px',
                  borderRadius: 3,
                }}>
                  {field.label}
                </span>
              </div>
            ))}
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
