// Single source of truth for translating onboarding-questionnaire
// keys (gender, fitness_level, challenges, preferences, frequency)
// into Hebrew labels. The DB stores English keys; we translate at
// render time so existing rows keep their stable identifiers and we
// can re-skin the labels without a backfill.

export const GENDER_LABELS = {
  male:   { noun: 'בן',     adjective: 'בן' },
  female: { noun: 'בת',     adjective: 'בת' },
  other:  { noun: 'בן/בת', adjective: 'בן/בת' },
};

// Challenges — current onboarding keys (Onboarding.jsx CHALLENGE_OPTIONS)
// plus legacy keys still present on older user rows, plus defensive
// coverage for keys mentioned in surrounding code paths.
export const CHALLENGE_LABELS = {
  consistency: 'עקביות באימונים',
  motivation:  'מוטיבציה',
  time:        'חוסר זמן',
  energy:      'חוסר אנרגיה',
  technique:   'טכניקה נכונה',
  pain:        'כאבים / פציעות',
  nutrition:   'תזונה',
  other:       'אחר',
  injuries:    'כאבים או פציעות',
  where_start: 'קושי לדעת מאיפה להתחיל',
  plateau:     'תחושת עצירה',
  flexibility: 'גמישות',
  cardio:      'אירובי',
  endurance:   'סיבולת',
  mobility:    'תנועתיות',
  strength:    'כוח',
  mental:      'מנטלי',
  sleep:       'שינה',
};

// Preferences — current keys (Onboarding.jsx IMPORTANT_OPTIONS) plus
// legacy values. The `technique` key intentionally renders DIFFERENTLY
// here (שיפור טכניקה) than in CHALLENGE_LABELS (טכניקה נכונה) — same
// stored token, two contextual labels.
export const PREFERENCE_LABELS = {
  results:      'תוצאות מהירות',
  fun:          'כיף ועניין',
  health:       'בריאות לטווח ארוך',
  strength:     'בניית כוח',
  technique:    'שיפור טכניקה',
  community:    'חיבור חברתי',
  mental:       'בריאות נפשית',
  other:        'אחר',
  fast_results: 'תוצאות מהירות',
  guidance:     'ליווי אישי צמוד',
  tracking:     'מעקב ומדידות',
  variety:      'גיוון ואתגרים',
  calm:         'רוגע ומתיחות',
  flexibility:  'גמישות',
  cardio:       'אירובי',
  endurance:    'סיבולת',
  mobility:     'תנועתיות',
  consistency:  'עקביות',
  motivation:   'מוטיבציה',
};

export const FITNESS_LEVEL_LABELS = {
  beginner:     'מתחילים',
  intermediate: 'בינוני',
  advanced:     'מתקדם',
  athlete:      'ספורטיבי',
};

export const FREQUENCY_LABELS = {
  '1-2':   '1-2 פעמים בשבוע',
  '3-4':   '3-4 פעמים בשבוע',
  '5-6':   '5-6 פעמים בשבוע',
  'daily': 'כל יום',
};

// Helpers — fall through to the raw value when not found so legacy
// rows that already hold Hebrew strings still render unchanged.
export const translateGender        = (key) => GENDER_LABELS[key]?.noun || 'בן/בת';
export const translateChallenge     = (key) => CHALLENGE_LABELS[key] || key;
export const translatePreference    = (key) => PREFERENCE_LABELS[key] || key;
export const translateFitnessLevel  = (key) => FITNESS_LEVEL_LABELS[key] || key;
export const translateFrequency     = (key) => FREQUENCY_LABELS[key] || key;
