// ── Sales playbook (editable content) ───────────────────────────────
// ALL the copy for the inbound-call generator (GuidedIntakeFlow) lives
// here: scripts, ladders, value breakdowns, incentives, diagnosis
// questions, activity goals and the mirror builder. There are NO
// hardcoded Hebrew strings in the component — edit freely, the UI reads
// from here. Prices are NEVER here; the offer step pulls numbers from
// pricing-engine.js (group) and PRICE list there (private).

// Map the "who is speaking" role → the need-bank persona used for the
// diagnosis + response card. Empty = let the coach pick in diagnosis.
export const ROLE_TO_PERSONA = {
  'פונה לעצמו': 'beginner',
  'הורה': 'parent',
  'מארגן קבוצה': 'org',
  'רכז/ת': 'org',
  'מנהל/ת': 'org',
  'אחר': '',
};

// Activity goals (step 3א) — expanded per context, pick up to two.
export const ACTIVITY_GOALS = {
  group: [
    'גיבוש חד-פעמי', 'רווחה שוטפת', 'העלאת כושר', 'סדרה עם מטרה',
    'הפסקה פעילה לעובדים יושבים', 'הפגת סטרס', 'בריאות ומניעת כאבי גב', 'אחר',
  ],
  personal: [
    'ירידה במשקל', 'בניית כוח', 'מיומנות ספציפית', 'חזרה מפציעה',
    'כושר כללי', 'ביטחון עצמי', 'הרגל וקביעות', 'אחר',
  ],
  _default: [
    'כושר כללי', 'בריאות', 'ביטחון עצמי', 'הרגל וקביעות', 'אחר',
  ],
};

// The activity-goal set that fits a lead type (group/business vs the rest).
export function activityGoalsFor(leadType) {
  return leadType === 'group' || leadType === 'business'
    ? ACTIVITY_GOALS.group
    : ACTIVITY_GOALS.personal;
}

// ── Dedicated diagnosis branch (step 3) ─────────────────────────────
// Per service, only the relevant questions. Each = a chip question whose
// answer is stored (as a label/value pair) into extra_details — no new
// DB columns. `key` is the stored label.
const DIAG_GROUP = [
  { key: 'רמת המשתתפים', chips: ['מתחילים', 'מעורב', 'מנוסים'] },
  { key: 'תשתית במקום', chips: ['אולם', 'שטח פתוח', 'חדר', 'אין'] },
  { key: 'מי מחליט', chips: ['אני', 'ועדה', 'הנהלה'] },
  { key: 'ציוד', chips: ['יש', 'חלקי', 'אין'] },
  { key: 'דחיפות', chips: ['השבוע', 'החודש', 'גמיש'] },
];
export const DIAGNOSIS_BY_SERVICE = {
  group: DIAG_GROUP,
  workshop: [
    { key: 'קהל היעד', chips: ['עובדים', 'הורים', 'נוער', 'מעורב'] },
    { key: 'תשתית במקום', chips: ['אולם', 'שטח פתוח', 'חדר', 'אין'] },
    { key: 'דחיפות', chips: ['השבוע', 'החודש', 'גמיש'] },
  ],
  movement65: [
    { key: 'רמת ניידות', chips: ['עצמאי', 'זקוק לתמיכה', 'מעורב'] },
    { key: 'תשתית במקום', chips: ['אולם', 'חדר', 'אין'] },
    { key: 'דחיפות', chips: ['השבוע', 'החודש', 'גמיש'] },
  ],
  personal: [
    { key: 'רמת פתיחה', chips: ['מתחיל', 'חוזר לכושר', 'מנוסה'] },
    { key: 'פציעות', chips: ['אין', 'פציעת עבר', 'כאב פעיל'] },
    { key: 'איפה מתאמנים', chips: ['הסטודיו', 'בית', 'שטח פתוח'] },
    { key: 'דחיפות', chips: ['השבוע', 'החודש', 'גמיש'] },
  ],
  online: [
    { key: 'רמת פתיחה', chips: ['מתחיל', 'חוזר לכושר', 'מנוסה'] },
    { key: 'ציוד בבית', chips: ['משקל גוף', 'גומיות', 'משקולות'] },
    { key: 'קביעות רצויה', chips: ['יומי', 'כמה בשבוע', 'גמיש'] },
  ],
  _default: [
    { key: 'רמת פתיחה', chips: ['מתחיל', 'מעורב', 'מנוסה'] },
    { key: 'דחיפות', chips: ['השבוע', 'החודש', 'גמיש'] },
  ],
};
export function diagnosisFor(serviceType) {
  return DIAGNOSIS_BY_SERVICE[serviceType] || DIAGNOSIS_BY_SERVICE._default;
}

// ── Self-introduction (step 5) — 30-second brand story ──────────────
// Two voices: first-person (Uriel answering) + coordinator (third
// person). The brand line is the anchor; the fit line + examples adapt
// to the lead type.
const INTRO_BEATS_FIRST = [
  'התחלתי מקפוארה — שנים על הפרקט, גוף שזז כל הזמן.',
  'ואז הגיעה שרשרת פציעות — כתף שיצאה לי 8 פעמים.',
  'זה שלח אותי לחקור לעומק איך הגוף באמת עובד, מה מחזיק ומה נשבר.',
  'ומשם נולדה השיטה — ואת המשפט הזה אני אומר לכל אחד:',
];
const INTRO_BEATS_COORD = [
  'אוריאל, המאמן שלנו, התחיל מקפוארה — שנים על הפרקט.',
  'אחרי שרשרת פציעות — כתף שיצאה 8 פעמים — הוא יצא לחקור איך הגוף באמת עובד.',
  'ומשם נולדה השיטה שלנו, והמשפט שמוביל אותה:',
];
export const BRAND_LINE =
  'אנחנו לא מלמדים להתאושש מפציעות — אנחנו מלמדים להתאמן ככה שלא נפצעים מלכתחילה.';

const FIT_LINE = {
  group: 'בדיוק בגלל זה קבוצות אוהבות אותנו — כולם מתאמנים חכם, אף אחד לא נשבר בדרך.',
  business: 'בדיוק בגלל זה ארגונים בוחרים בנו — עובדים שמתאמנים נכון חוזרים לעבודה עם אנרגיה, לא עם כאב.',
  private: 'וזה בדיוק מה שתקבל/י — אימון שמתחשב בגוף שלך ובונה אותו נכון, צעד אחרי צעד.',
  _default: 'וזה בדיוק העיקרון שנעבוד לפיו יחד.',
};
const FIT_EXAMPLES = {
  group: ['קבוצות עובדים שהפכו אימון לרגע השבועי שמחכים לו', 'מסגרות נוער שבנו ביטחון דרך תנועה'],
  business: ['ארגונים שהורידו ימי מחלה עם פעילות קבועה', 'צוותים שהתגבשו סביב אתגר גופני משותף'],
  private: ['מתאמנים שחזרו מפציעה חזקים ממה שהיו', 'אנשים שהגיעו בלי רקע ותוך חודשים עשו דברים שלא האמינו'],
  _default: ['מתאמנים שהתחילו מאפס ובנו הרגל קבוע', 'אנשים שגילו שהגוף שלהם מסוגל להרבה יותר'],
};

// Build the spoken self-intro for a version ('first' | 'coord') + lead type.
export function selfIntroScript(version, leadType) {
  const beats = version === 'coord' ? INTRO_BEATS_COORD : INTRO_BEATS_FIRST;
  const fit = FIT_LINE[leadType] || FIT_LINE._default;
  const examples = FIT_EXAMPLES[leadType] || FIT_EXAMPLES._default;
  const lines = [...beats, BRAND_LINE, fit];
  const copyText = [...lines, ...examples.map((e) => `· ${e}`)].join('\n');
  return { lines, examples, copyText };
}

// ── Track ladder (step 6) — 3 options per service, middle recommended.
export const PRESENT_LADDER_LINE =
  'יש כמה מסלולים — ההבדל הוא כמה מהר רוצים תוצאות.';
const LADDER_GROUP = [
  { key: 'pilot',   label: 'פיילוט חד-פעמי', tagline: 'לטעום את השיטה, בלי התחייבות' },
  { key: 'monthly', label: 'מסגרת חודשית',   tagline: 'קצב קבוע — כאן מרגישים שינוי', recommended: true },
  { key: 'ongoing', label: 'ליווי מתמשך',    tagline: 'תוצאות עמוקות לאורך זמן' },
];
export const TRACKS_BY_SERVICE = {
  group: LADDER_GROUP,
  workshop: [
    { key: 'single', label: 'סדנה בודדת',     tagline: 'חוויה ממוקדת חד-פעמית' },
    { key: 'series', label: 'סדרת סדנאות',    tagline: 'למידה מצטברת עם מטרה', recommended: true },
    { key: 'program', label: 'תוכנית מתמשכת', tagline: 'הטמעה עמוקה לאורך זמן' },
  ],
  movement65: [
    { key: 'once',  label: 'פעם בשבוע',     tagline: 'התחלה עדינה ובטוחה' },
    { key: 'twice', label: 'פעמיים בשבוע',  tagline: 'קצב ששומר על תפקוד', recommended: true },
    { key: 'daily', label: 'מותאם אישית',   tagline: 'ליווי צמוד לפי הצורך' },
  ],
  personal: [
    { key: 'intro',   label: 'היכרות',    tagline: 'פעם בשבוע — לבנות בסיס' },
    { key: 'progress', label: 'התקדמות', tagline: 'פעמיים בשבוע — הקצב שמזיז', recommended: true },
    { key: 'intense', label: 'אינטנסיב',  tagline: 'שלוש בשבוע — תוצאות מהירות' },
  ],
  online: [
    { key: 'self',      label: 'תוכנית עצמאית', tagline: 'תוכנית אישית, אתה בקצב שלך' },
    { key: 'guided',    label: 'ליווי + מעקב',  tagline: 'תוכנית + בקרה שבועית', recommended: true },
    { key: 'close',     label: 'ליווי צמוד',    tagline: 'זמינות גבוהה והתאמות שוטפות' },
  ],
  _default: LADDER_GROUP,
};
export function tracksFor(serviceType) {
  return TRACKS_BY_SERVICE[serviceType] || TRACKS_BY_SERVICE._default;
}

// ── Value breakdown (offer step) — "מה כלול" per service.
export const VALUE_INCLUDES = {
  group: ['מדריך מוסמך שמגיע אליכם', 'תוכנית מותאמת לרמת הקבוצה', 'ציוד מקצועי בכל מפגש', 'מעקב התקדמות', 'גמישות בימים ובשעות'],
  personal: ['אבחון גוף אישי', 'תוכנית בהתאמה מלאה', 'ליווי צמוד ותיקוני טכניקה', 'התחשבות במגבלות ופציעות'],
  online: ['תוכנית שבועית אישית', 'מעקב וידאו', 'זמינות בוואטסאפ', 'התאמות שוטפות'],
  workshop: ['תוכן מותאם לקהל', 'חומרים והדרכה מלאה', 'חוויה מגבשת ומקצועית'],
  movement65: ['תנועה בטוחה ומותאמת', 'אווירה חברתית ותומכת', 'מעקב תפקודי אישי'],
  _default: ['ליווי מקצועי', 'תוכנית מותאמת אישית', 'מעקב התקדמות שוטף'],
};
export function valueIncludesFor(serviceType) {
  return VALUE_INCLUDES[serviceType] || VALUE_INCLUDES._default;
}

// ── Close-in-place incentives (offer step).
export const CLOSE_INCENTIVES = [
  { key: 'free_intro', label: 'מפגש פתיחה חינם', line: 'אם סוגרים היום — מפגש הפתיחה עלינו. הזדמנות להרגיש את השיטה בלי סיכון.' },
  { key: 'hold_slot',  label: 'שריון החלון הקרוב', line: 'אני יכול לשריין לכם את החלון הקרוב עד מחר — ככה לא מפספסים את הקבוצה שמתחילה.' },
];

// ── "רוצה להשוות הצעות" — don't block, reinforce value.
export const COMPARE_RESPONSE = {
  line: 'לגמרי כדאי להשוות — רק תשוו את מה שבאמת חשוב: מי המדריך, מה השיטה, ומה קורה כשמישהו נפצע. אצלנו זה לא סתם אימון, זה ליווי.',
  note: 'לא לחסום את ההשוואה — לחזק את הערך ולמקד במה שמייחד אותנו',
};

// ── Problematic-approach release line (any step).
export const APPROACH_FLAG = {
  lines: [
    'אני שומע אותך, ואני רוצה להיות הוגן — אני לא בטוח שאנחנו ההתאמה הכי טובה למה שאתה מחפש כרגע, ואני מעדיף להגיד את זה מראש.',
    'אם בהמשך זה ישתנה — הדלת פתוחה בכיף.',
  ],
  note: 'משפט שחרור מכובד כשברור שאין התאמה — ואז לסמן את הליד כלא רלוונטי',
};

// Spoken openers (read aloud).
export const OPEN_SCRIPT = 'היי, כיף שהתקשרת! ספר/י לי בכמה מילים — איך אפשר לעזור?';
// Read this when the offer step is reached without a phone number.
export const PHONE_GATE_LINE =
  'לפני שנמשיך — אני אשלח לך את כל הפרטים גם בוואטסאפ, מה המספר שלך?';

// ── "שאל עכשיו" — the most important open question per step.
export const ASK_NOW = {
  open: 'איך אפשר לעזור? ספר/י לי בכמה מילים מה חיפשת',
  who: 'ומי הולך להתאמן — אתה, מישהו קרוב, או קבוצה?',
  what: 'מה בדיוק חיפשת — אימון אישי, קבוצה, או משהו אחר?',
  diagnose: 'ספר/י לי עוד — באיזו רמה אתם ומה הכי חשוב לכם?',
  goal: 'ומה המטרה העיקרית — מה תרצו להשיג מהפעילות?',
  mirror: 'רגע לוודא שהבנתי אותך נכון — תקן/י אותי אם פספסתי',
  intro: 'תן/י לי רגע לספר לך מי אנחנו ולמה זה עובד',
  ladder: 'יש כמה דרכים להתקדם — כמה מהר תרצו לראות תוצאות?',
  offer: 'הנה מה שאני מציע — נשמע לך מתאים?',
  summary: 'אז מה הצעד הבא שהכי מתאים לך?',
};

// ── Quiet fit meter — leading service + a worthy alternative.
const FIT_BY_FORWHOM = {
  org:   { lead: 'קבוצה', alt: 'סדנה' },
  group: { lead: 'קבוצה', alt: 'תנועה בכיף 65+' },
  child: { lead: 'קבוצה', alt: 'אימון אישי' },
  self:  { lead: 'אימון אישי', alt: 'ליווי אונליין' },
};
export function fitSuggest({ for_whom, service_type }) {
  if (service_type) return null; // already chosen — no need to nudge
  return FIT_BY_FORWHOM[for_whom] || null;
}

// ── Mirror builder (step 4) — compose a read-ready reflection from the
// captured answers, in the client's frame, including their name.
export function buildMirror({ name, needLabel, groupSize, freq, goals, forWhomLabel, serviceLabel }) {
  const parts = [];
  if (groupSize) parts.push(`קבוצה של ${groupSize}`);          // "קבוצה של 15" already implies the service
  else if (serviceLabel) parts.push(serviceLabel);
  else if (forWhomLabel) parts.push(forWhomLabel);
  if (needLabel) parts.push(needLabel);
  if (freq) parts.push(`${freq} בשבוע`);
  const body = parts.filter(Boolean).join(', ');
  const goalPart = (goals || '').trim() ? ` בשביל ${goals.trim()}` : '';
  const who = (name || '').trim() ? ` ${name.trim()}` : '';
  if (!body && !goalPart) {
    return `אז אם הבנתי נכון${who} — ספר/י לי שוב במילים שלך מה הכי חשוב לך, ונתקדם משם. נכון?`;
  }
  return `אז אם הבנתי נכון${who} — ${body}${goalPart}. נכון?`;
}
