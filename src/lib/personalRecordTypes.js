export const RECORD_TYPES = [
  { key: 'pullups',   name: 'עליות מתח',       defaultUnit: 'חזרות' },
  { key: 'pushups',   name: 'שכיבות סמיכה',   defaultUnit: 'חזרות' },
  { key: 'muscleup',  name: 'עליות כוח',       defaultUnit: 'חזרות' },
  { key: 'squats',    name: 'סקוואטים',         defaultUnit: 'חזרות' },
  { key: 'plank',     name: 'פלאנק',            defaultUnit: 'שניות' },
  { key: 'handstand', name: 'עמידה על ידיים',  defaultUnit: 'שניות' },
  { key: 'jumps',     name: 'קפיצות רצופות',  defaultUnit: 'חזרות' },
  { key: 'doubles',   name: 'דאבלים רצופים',  defaultUnit: 'חזרות' },
  { key: 'triples',   name: 'טריפלים רצופים', defaultUnit: 'חזרות' },
  { key: 'jump_time', name: 'זמן קפיצה רצוף',  defaultUnit: 'שניות' },
  { key: 'other',     name: 'אחר',               defaultUnit: '' },
];

export const getTypeByKey = (key) =>
  RECORD_TYPES.find(t => t.key === key) ?? RECORD_TYPES[RECORD_TYPES.length - 1];
