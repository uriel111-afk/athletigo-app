// Catalog of training methods. The `mode` value is the canonical
// string written to exercises.mode in the DB; `english_id` is for
// logging / grep / internal references only. `hasPlannedSets` flags
// methods whose per-set planned values fan out into a planned_sets
// array on tabata_data (vs scalar values on the exercise row).

export const TRAINING_METHODS = {
  NONE:       { mode: null,      english_id: 'none',       label: 'ללא שיטה',      icon: 'ti-square',            hasPlannedSets: true  },
  REPS:       { mode: 'חזרות',   english_id: 'reps',       label: 'חזרות',         icon: 'ti-repeat',            hasPlannedSets: false },
  TABATA:     { mode: 'טבטה',    english_id: 'tabata',     label: 'טבטה',          icon: 'ti-stopwatch',         hasPlannedSets: false },
  SUPERSET:   { mode: 'סופרסט',  english_id: 'super_set',  label: 'סופר סט',       icon: 'ti-link',              hasPlannedSets: true  },
  COMBO:      { mode: 'קומבו',   english_id: 'combo',      label: 'קומבו',         icon: 'ti-wave-saw-tool',     hasPlannedSets: true  },
  PYRAMID:    { mode: 'פירמידה', english_id: 'pyramid',    label: 'פירמידה',       icon: 'ti-mountain',          hasPlannedSets: true  },
  DROP_SET:   { mode: 'דרופסט',  english_id: 'drop_set',   label: 'דרופ סט',       icon: 'ti-arrow-bar-to-down', hasPlannedSets: true  },
  REST_PAUSE: { mode: 'רסטפאוז', english_id: 'rest_pause', label: 'רסט פאוז',      icon: 'ti-player-pause',      hasPlannedSets: true  },
  CIRCUIT:    { mode: 'מחזורי',  english_id: 'circuit',    label: 'אימון מחזורי',  icon: 'ti-rotate',            hasPlannedSets: true  },
  DELORME:    { mode: 'דלורם',   english_id: 'delorme',    label: 'דלורם',         icon: 'ti-stairs',            hasPlannedSets: true  },
};

const METHODS_LIST = Object.values(TRAINING_METHODS);

export function getMethodByMode(modeString) {
  if (!modeString) return TRAINING_METHODS.REPS;
  return METHODS_LIST.find((m) => m.mode === modeString) || TRAINING_METHODS.REPS;
}

export function getMethodByEnglishId(id) {
  if (!id) return TRAINING_METHODS.REPS;
  return METHODS_LIST.find((m) => m.english_id === id) || TRAINING_METHODS.REPS;
}

export function methodSupportsPlannedSets(modeString) {
  return getMethodByMode(modeString).hasPlannedSets;
}

export function listAllMethods() {
  return METHODS_LIST;
}
