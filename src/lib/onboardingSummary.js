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

// Storytelling phrasing for each fitness level — used for the
// 2nd-person narrative summary. Two versions per level: the short
// "with-age" tail and the standalone sentence when age is missing.
// Both legacy gender-inflected keys ('מתחיל/ה') and the new
// gender-neutral plurals ('מתחילים') the rebuilt Onboarding.jsx
// writes are listed so every existing row keeps its tailored line.
const FITNESS_LEVEL_STORY = {
  'מתחיל/ה':     { tail: 'רוצה להתחיל את המסע',           solo: 'כל מסע מתחיל בצעד ראשון — ואת/ה כבר כאן.' },
  'בינוני/ת':    { tail: 'כבר מכיר/ה את עולם האימונים',   solo: 'יש לך בסיס טוב — בוא/י נקח את זה לשלב הבא.' },
  'מתקדם/ת':     { tail: 'בדרך להגיע לשיא חדש',           solo: 'את/ה כבר יודע/ת מה זה אימון — עכשיו נדייק.' },
  'ספורטאי/ת':   { tail: 'מחפש/ת את האתגר הבא',           solo: 'את/ה מגיע/ה עם רקע רציני — נבנה ביחד משהו חזק.' },
  'מתחילים':     { tail: 'זאת ההתחלה של מסע חדש',         solo: 'כל זמן הוא הזמן הנכון להתחיל — וזה הזמן.' },
  'בינוני':      { tail: 'כבר יש בסיס טוב לבנות עליו',    solo: 'יש לך בסיס טוב — בוא נקח את זה לשלב הבא.' },
  'מתקדם':       { tail: 'הדרך לשיא הבא מתחילה כאן',      solo: 'את/ה כבר יודע/ת מה זה אימון — עכשיו נדייק.' },
  'ספורטיבי':    { tail: 'האתגר הבא כבר מחכה',            solo: 'מגיעים עם רקע רציני — נבנה ביחד משהו חזק.' },
};

// Body-type label maps — the rebuilt Onboarding.jsx (step 2) writes
// English ids; render them as Hebrew nouns in the narrative line.
const BODY_TYPE_LABELS = {
  thin:       'רזה',
  average:    'ממוצע',
  athletic:   'אתלטי',
  overweight: 'עם עודף משקל',
};
const GOAL_BODY_TYPE_LABELS = {
  lean:     'רזה ומוגדר',
  athletic: 'אתלטי וחזק',
  muscular: 'שרירי',
  healthy:  'בריא ומאוזן',
};

// Categorize the picked goals so we can pick the closing line that
// matches the dominant intent. Hebrew label match — keys in
// GOAL_LABELS are mapped before this check.
const goalCategory = (goals) => {
  if (goals.includes('שיקום')) return 'rehab';
  if (goals.some(g => g.includes('חיזוק') || g.includes('כוח'))) return 'strength';
  if (goals.includes('ירידה במשקל')) return 'weight';
  if (goals.some(g => g.includes('מיומנות') || g.includes('קליסטניקס'))) return 'skill';
  return null;
};
const GOAL_CATEGORY_TAILS = {
  rehab:    'נדאג לבנות תוכנית שמחזקת ומשקמת בבטחה.',
  strength: 'נבנה ביחד כוח אמיתי, צעד אחרי צעד.',
  weight:   'נשלב אימון חכם עם גישה בריאה לתהליך.',
  skill:    'נעבוד על מיומנויות שידהימו אותך.',
};

export function generateTraineeSummary(trainee) {
  if (!trainee) return '';

  // Resolve all the inputs through the same label maps the IntroTab
  // uses, so the narrative renders proper Hebrew for every taxonomy
  // value regardless of whether it's stored as English keys
  // (questionnaire output) or already-Hebrew strings (legacy rows).
  const firstName = (trainee.full_name || '').split(/\s+/).filter(Boolean)[0] || 'שם';
  const age = calcAge(trainee.birth_date);

  const goalsRaw = Array.isArray(trainee.training_goals)
    ? trainee.training_goals
    : (trainee.training_goal ? [trainee.training_goal] : asArray(trainee.training_goals));
  const goals = goalsRaw.map(v => labelize(GOAL_LABELS, v));

  const challenges  = asArray(trainee.current_challenges).map(v => labelize(CHALLENGE_LABELS, v));
  const preferences = asArray(trainee.training_preferences).map(v => labelize(PREFERENCE_LABELS, v));

  const fitnessRaw = trainee.fitness_level || trainee.fitness_experience;
  const fitness = fitnessRaw ? labelize(FITNESS_LABELS, fitnessRaw) : null;

  const lines = [];
  // ── Greeting ─────────────────────────────────────────────────
  lines.push(`היי ${firstName}, איזה כיף שהצטרפת אלינו! 😊`);

  // ── Age + experience ────────────────────────────────────────
  // Gender-neutral phrasing: "בגיל N" instead of "את/ה בן/בת N".
  const story = FITNESS_LEVEL_STORY[fitness];
  if (age && story?.tail) {
    lines.push(`בגיל ${age}, ${story.tail}.`);
  } else if (age) {
    lines.push(`בגיל ${age}, זה הזמן המושלם להתחיל.`);
  } else if (story?.solo) {
    lines.push(story.solo);
  }

  // ── Goals + free-text ──────────────────────────────────────
  if (goals.length === 1) {
    lines.push(`המטרה שלך ברורה: ${goals[0]}. ${GOAL_CATEGORY_TAILS[goalCategory(goals)] || 'נבנה תוכנית שמתאימה בדיוק לזה.'}`);
  } else if (goals.length > 1) {
    lines.push(`המטרות שלך: ${goals.slice(0, -1).join(', ')} ו${goals[goals.length - 1]}. ${GOAL_CATEGORY_TAILS[goalCategory(goals)] || 'נבנה תוכנית שמתאימה בדיוק לזה.'}`);
  }
  if (trainee.goals_description && trainee.goals_description.trim()) {
    lines.push(`"${trainee.goals_description.trim()}"`);
  }

  // ── Frequency ──────────────────────────────────────────────
  if (trainee.preferred_frequency) {
    const freq = labelize(FREQUENCY_LABELS, trainee.preferred_frequency);
    lines.push(`את/ה רוצה להתאמן ${freq} פעמים בשבוע — מעולה, נתאים את הקצב.`);
  }

  // ── Challenges + free-text ─────────────────────────────────
  if (challenges.length) {
    let line = `\nהאתגרים שציינת — ${challenges.join(', ')} — זה בדיוק מה שנעבוד עליו ביחד. `;
    if (challenges.includes('חוסר מוטיבציה'))      line += 'כשיש מאמן לצד, המוטיבציה מגיעה מהתוצאות.';
    else if (challenges.includes('כאבים או פציעות')) line += 'נבנה תוכנית שמכבדת את הגוף ומחזקת אותו.';
    else                                              line += 'אנחנו כאן כדי להפוך את האתגר להישג.';
    lines.push(line);
  }
  if (trainee.challenges_description && trainee.challenges_description.trim()) {
    lines.push(`"${trainee.challenges_description.trim()}"`);
  }

  // ── Preferences + free-text ────────────────────────────────
  if (preferences.length) {
    lines.push(`\nחשוב לך: ${preferences.join(', ')}. נדאג לזה.`);
  }
  if (trainee.preferences_description && trainee.preferences_description.trim()) {
    lines.push(`"${trainee.preferences_description.trim()}"`);
  }

  // ── Sport background ───────────────────────────────────────
  const sportBg = (trainee.fitness_background || trainee.sport_background || '').trim();
  if (sportBg) {
    lines.push(`\nרקע ספורטיבי: ${sportBg}.`);
  }

  // ── Pre-health note ────────────────────────────────────────
  const ph = (trainee.pre_health_note || '').trim();
  if (ph && ph !== 'הכל תקין') {
    lines.push(`\nלגבי הבריאות — "${ph}". נלקח בחשבון בכל תוכנית שנבנה.`);
  }

  // ── Body metrics ───────────────────────────────────────────
  if (trainee.height_cm || trainee.weight_kg) {
    let line = '\nנקודת התחלה: ';
    if (trainee.height_cm) line += `גובה ${trainee.height_cm} ס״מ`;
    if (trainee.height_cm && trainee.weight_kg) line += ', ';
    if (trainee.weight_kg) line += `משקל ${trainee.weight_kg} ק״ג`;
    line += '.';
    lines.push(line);
  }

  // ── Body-type self-assessment + goal ───────────────────────
  // Rendered as a single combined line when both fields are
  // present so the narrative reads as one beat ("currently X,
  // aiming for Y") instead of two stacked sentences.
  const currentBody = trainee.body_type ? labelize(BODY_TYPE_LABELS, trainee.body_type) : null;
  const targetBody  = trainee.goal_body_type ? labelize(GOAL_BODY_TYPE_LABELS, trainee.goal_body_type) : null;
  if (currentBody || targetBody) {
    let line = '';
    if (currentBody) line += `מבנה גוף נוכחי: ${currentBody}.`;
    if (currentBody && targetBody) line += ' ';
    if (targetBody) line += `שואפים ל${targetBody}.`;
    lines.push(line);
  }

  // ── Closer ─────────────────────────────────────────────────
  lines.push('\nהמסע מתחיל עכשיו — ואנחנו כאן איתך בכל צעד. 💪');

  return lines.join('\n');
}

export default generateTraineeSummary;
