// Records taxonomy — used by ProgressTab + the "Add Record" sheet.
// The DB column for the exercise label is `name` (not `exercise_name`),
// `value` (not `record_value`), `unit` (not `record_unit`). Kept here
// because the existing personal_records schema predates the spec; the
// UI maps spec field names → existing column names at save time.

export const DEFAULT_EXERCISES = [
  { name: 'קפיצה בחבל',     category: 'jump_rope', icon: '🪢', units: ['reps', 'seconds'] },
  { name: 'עליות מתח',      category: 'pull',      icon: '💪', units: ['reps', 'kg'] },
  { name: 'שכיבות סמיכה',   category: 'push',      icon: '🫸', units: ['reps'] },
  { name: 'מקבילים',        category: 'push',      icon: '🤸', units: ['reps', 'seconds'] },
  { name: 'סקוואט',         category: 'legs',      icon: '🦵', units: ['reps', 'kg'] },
  { name: 'Muscle-Up',      category: 'pull',      icon: '🏆', units: ['reps'] },
  { name: 'הליכה על ידיים', category: 'balance',   icon: '🤾', units: ['meters', 'seconds'] },
  { name: 'עמידת ידיים',    category: 'balance',   icon: '🧘', units: ['seconds'] },
  { name: 'פלאנק',          category: 'core',      icon: '🧱', units: ['seconds'] },
  { name: 'דדליפט',         category: 'pull',      icon: '🏋️', units: ['kg'] },
  { name: 'לחיצת חזה',      category: 'push',      icon: '🏋️', units: ['kg'] },
  { name: 'ריצה',           category: 'cardio',    icon: '🏃', units: ['seconds', 'meters'] },
  { name: 'טבעות',          category: 'rings',     icon: '⭕', units: ['reps', 'seconds'] },
  { name: 'Front Lever',    category: 'pull',      icon: '🔥', units: ['seconds'] },
  { name: 'Back Lever',     category: 'pull',      icon: '🔥', units: ['seconds'] },
  { name: 'Human Flag',     category: 'core',      icon: '🚩', units: ['seconds'] },
  { name: 'L-Sit',          category: 'core',      icon: '🪑', units: ['seconds'] },
  { name: 'Pistol Squat',   category: 'legs',      icon: '🦵', units: ['reps'] },
];

export const RECORD_UNITS = [
  { id: 'reps',    label: 'חזרות' },
  { id: 'seconds', label: 'שניות' },
  { id: 'kg',      label: 'ק"ג' },
  { id: 'meters',  label: 'מטרים' },
  { id: 'minutes', label: 'דקות' },
];

// "RECORD_TYPE_OPTIONS" instead of "RECORD_TYPES" — the legacy module
// `personalRecordTypes.js` already exports a different RECORD_TYPES list
// with a different shape ({ key, name, defaultUnit }). Renaming here
// avoids a name clash anywhere else that imports the legacy one.
export const RECORD_TYPE_OPTIONS = [
  { id: 'max_reps',     label: 'מקסימום חזרות' },
  { id: 'max_weight',   label: 'מקסימום משקל' },
  { id: 'max_time',     label: 'מקסימום זמן' },
  { id: 'min_time',     label: 'מינימום זמן (שיפור מהירות)' },
  { id: 'max_distance', label: 'מקסימום מרחק' },
  { id: 'technique',    label: 'טכניקה חדשה' },
  { id: 'quality',      label: 'דירוג איכות ביצוע (1-10)' },
];

export const exerciseInfoFor = (name) =>
  DEFAULT_EXERCISES.find(e => e.name === name) || null;

export const unitLabel = (id) =>
  RECORD_UNITS.find(u => u.id === id)?.label || id || '';
