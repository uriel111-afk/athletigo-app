// Build a Hebrew narrative summary of a trainee's onboarding answers,
// for the popup the coach sees when a new trainee finishes the
// intake. Pure function — no React, no DB.
//
// The taxonomy keys in users.* are the canonical values written by
// OnboardingQuestionnaire (training_goal, fitness_level,
// preferred_frequency, current_challenges[], training_preferences[],
// additional_notes). Translate them to the coach-facing Hebrew
// labels here so the summary reads naturally in the popup.

const GOAL_LABELS = {
  strength:    'חיזוק והתחשלות',
  weight_loss: 'ירידה במשקל',
  flexibility: 'גמישות ותנועתיות',
  endurance:   'סיבולת וכושר',
  skill:       'מיומנות ספציפית',
  wellbeing:   'הנאה ותחושה טובה',
};

const FITNESS_LABELS = {
  beginner:     'מתחיל/ה',
  intermediate: 'בינוני/ת',
  advanced:     'מתקדם/ת',
  athlete:      'ספורטאי/ת',
};

const FREQUENCY_LABELS = {
  '1-2': '1-2',
  '3-4': '3-4',
  '5-6': '5-6',
  daily: 'כל יום',
};

const CHALLENGE_LABELS = {
  motivation:  'חוסר מוטיבציה',
  time:        'חוסר זמן',
  injuries:    'כאבים או פציעות',
  where_start: 'קושי לדעת מאיפה להתחיל',
  plateau:     'תחושת עצירה',
  nutrition:   'תזונה לא מסודרת',
};

const PREFERENCE_LABELS = {
  fast_results: 'תוצאות מהירות',
  technique:    'טכניקה נכונה',
  guidance:     'ליווי אישי צמוד',
  tracking:     'מעקב ומדידות',
  variety:      'גיוון ואתגרים',
  calm:         'רוגע ומתיחות',
};

const REFERRAL_LABELS = {
  instagram: 'אינסטגרם',
  facebook:  'פייסבוק',
  friend:    'חבר/ה',
  google:    'גוגל',
  other:     'אחר',
};

// Map an arbitrary value through a label map; fall through to the
// raw value when not found, so legacy free-text fields still render.
const labelize = (map, value) => map[value] || value;

// JSONB columns may arrive as either a parsed array or a JSON string
// depending on how supabase deserialized them. Normalize.
const asArray = (v) => {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try { const parsed = JSON.parse(v); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
  }
  return [];
};

// Compute integer age from a birth_date (ISO string or Date). Returns
// null when the date is missing or unparseable.
const calcAge = (birthDate) => {
  if (!birthDate) return null;
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  return age;
};

export function generateTraineeSummary(trainee) {
  if (!trainee) return '';
  const lines = [];

  // Headline — name (+ age)
  const name = trainee.full_name || 'מתאמן/ת חדש/ה';
  const age = calcAge(trainee.birth_date);
  let headline = `מתאמן/ת חדש/ה: ${name}`;
  if (age != null) headline += ` (${age})`;
  headline += '.';
  lines.push(headline);

  // ALL goals (not just the first) + free-text expansion
  const goalsRaw = Array.isArray(trainee.training_goals)
    ? trainee.training_goals
    : (trainee.training_goal ? [trainee.training_goal] : asArray(trainee.training_goals));
  const goals = goalsRaw.map(v => labelize(GOAL_LABELS, v));
  if (goals.length) lines.push(`מטרות: ${goals.join(', ')}.`);
  if (trainee.goals_description && trainee.goals_description.trim()) {
    lines.push(`"${trainee.goals_description.trim()}"`);
  }

  // Background row — fitness level / preferred frequency. Accept
  // both column-name aliases (fitness_level | fitness_experience).
  const fitness = trainee.fitness_level || trainee.fitness_experience;
  const bgParts = [];
  if (fitness) bgParts.push(`רמת כושר: ${labelize(FITNESS_LABELS, fitness)}`);
  if (trainee.preferred_frequency) bgParts.push(`רוצה להתאמן ${labelize(FREQUENCY_LABELS, trainee.preferred_frequency)} פעמים בשבוע`);
  if (bgParts.length) lines.push(bgParts.join('. ') + '.');

  // Challenges + their description
  const challenges = asArray(trainee.current_challenges)
    .map(v => labelize(CHALLENGE_LABELS, v));
  if (challenges.length) lines.push(`האתגרים: ${challenges.join(', ')}.`);
  if (trainee.challenges_description && trainee.challenges_description.trim()) {
    lines.push(`"${trainee.challenges_description.trim()}"`);
  }

  // Preferences + their description
  const prefs = asArray(trainee.training_preferences)
    .map(v => labelize(PREFERENCE_LABELS, v));
  if (prefs.length) lines.push(`חשוב: ${prefs.join(', ')}.`);
  if (trainee.preferences_description && trainee.preferences_description.trim()) {
    lines.push(`"${trainee.preferences_description.trim()}"`);
  }

  // Body metrics
  const bodyParts = [];
  if (trainee.height_cm) bodyParts.push(`גובה: ${trainee.height_cm} ס״מ`);
  if (trainee.weight_kg) bodyParts.push(`משקל: ${trainee.weight_kg} ק״ג`);
  if (bodyParts.length) lines.push(bodyParts.join(', ') + '.');

  // Sport / fitness background — free text. Accept both alias columns.
  const sportBg = (trainee.fitness_background || trainee.sport_background || '').trim();
  if (sportBg) lines.push(`ניסיון ספורטיבי: ${sportBg}`);

  // Pre-health soft-handoff note — what the trainee told us before
  // the formal PAR-Q form.
  if (trainee.pre_health_note && trainee.pre_health_note.trim()) {
    lines.push(`בריאות: ${trainee.pre_health_note.trim()}`);
  }

  // Free-form questionnaire notes
  if (trainee.additional_notes && trainee.additional_notes.trim()) {
    lines.push(`הערות: "${trainee.additional_notes.trim()}"`);
  }

  // Funnel
  if (trainee.referral_source) {
    lines.push(`הגיע/ה דרך: ${labelize(REFERRAL_LABELS, trainee.referral_source)}.`);
  }

  // Always include the health-declaration line if it was signed
  // (caller passes health_declaration_signed=true when applicable).
  if (trainee.health_declaration_signed !== false) {
    lines.push('הצהרת בריאות: חתומה ✓');
  }

  // Optional first-session line — caller can attach session date+time
  // pre-formatted as `first_session_label`.
  if (trainee.first_session_label) {
    lines.push(`מפגש ראשון: ${trainee.first_session_label}`);
  }

  return lines.join('\n');
}

export default generateTraineeSummary;
