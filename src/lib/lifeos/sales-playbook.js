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
// NOTE: level / injury questions were REMOVED from here and merged into
// the dedicated sport-background step (BACKGROUND_CHIPS / INJURY_CHIPS
// below) so nothing is asked twice: "רמת המשתתפים" (group) and
// "רמת פתיחה" / "פציעות" (personal, online, _default) now live there.
const DIAG_GROUP = [
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
    { key: 'איפה מתאמנים', chips: ['הסטודיו', 'בית', 'שטח פתוח'] },
    { key: 'דחיפות', chips: ['השבוע', 'החודש', 'גמיש'] },
  ],
  online: [
    { key: 'ציוד בבית', chips: ['משקל גוף', 'גומיות', 'משקולות'] },
    { key: 'קביעות רצויה', chips: ['יומי', 'כמה בשבוע', 'גמיש'] },
  ],
  _default: [
    { key: 'דחיפות', chips: ['השבוע', 'החודש', 'גמיש'] },
  ],
};
export function diagnosisFor(serviceType) {
  return DIAGNOSIS_BY_SERVICE[serviceType] || DIAGNOSIS_BY_SERVICE._default;
}

// ── Sport-background + injuries step ────────────────────────────────
// Sits AFTER the diagnosis branch and BEFORE the goals step. Reuses the
// exact columns the proactive flow writes, so a lead captured on ANY
// path lands in the same place: background_level / sports_experience
// (which sport) + injury_level / injuries (what & where). This is the
// "same brain" — the chips + fields below feed the inbound generator,
// the silent quick form and the lead card identically.
export const BACKGROUND_CHIPS = [
  { key: 'לא התאמן שנים',     label: 'לא התאמן שנים' },
  { key: 'מתאמן פה ושם',      label: 'מתאמן פה ושם' },
  { key: 'מתאמן קבוע',        label: 'מתאמן קבוע' },
  { key: 'רקע תחרותי-מקצועי', label: 'רקע תחרותי-מקצועי' },
];
export const INJURY_CHIPS = [
  { key: 'אין',                 label: 'אין' },
  { key: 'פציעות עבר שהחלימו',  label: 'פציעות עבר שהחלימו' },
  { key: 'כאב או מגבלה פעילים', label: 'כאב או מגבלה פעילים' },
];

// Labels + read-aloud line adapt to who trains: the individual (private)
// vs the group ("most participants") — the group phrasing MERGES the old
// diagnosis "רמת המשתתפים" question so it's never asked twice.
export function backgroundCopy(isGroup) {
  return isGroup
    ? {
        ask: 'מה הרקע של רוב המשתתפים, ויש מישהו עם פציעה או מגבלה שכדאי שנדע?',
        levelLabel: 'רקע רוב המשתתפים',
        levelDetail: 'באיזה ענף / איזה רקע לרובם?',
        injuryLabel: 'יש משתתפים עם מגבלות?',
        injuryDetail: 'מי, מה ואיפה',
      }
    : {
        ask: 'מה עשית עד היום מבחינת ספורט, ויש פציעה או כאב שחשוב שנדע עליו?',
        levelLabel: 'רקע ספורטיבי',
        levelDetail: 'באיזה ענף?',
        injuryLabel: 'פציעות וכאבים',
        injuryDetail: 'מה ואיפה',
      };
}

// Background / injury signal → the concrete move the coach makes NOW.
// Returns null when nothing special is flagged.
export function backgroundFocus({ background_level, injury_level } = {}) {
  const tips = [];
  let leadWithInjuryStory = false;
  let personalBeforeGroup = false;
  if (injury_level === 'כאב או מגבלה פעילים') {
    leadWithInjuryStory = true;
    personalBeforeGroup = true;
    tips.push('פתח/י את ההצגה העצמית בסיפור הפציעות — זה בדיוק הליד שהסיפור שלך נבנה בשבילו.');
    tips.push('המלץ/י לפתוח באימון אישי לפני קבוצתי — קודם בונים בסיס בטוח.');
  }
  if (background_level === 'רקע תחרותי-מקצועי') {
    tips.push('מקד/י במסלול מיומנויות מתקדם ובדוגמאות פעילות שמתאימות לרמה שלו.');
  }
  if (background_level === 'לא התאמן שנים') {
    tips.push('הדגש/י שהכול מתחיל מאפס בשיטה שלנו — שיעור ניסיון הוא הצעד הראשון הבטוח.');
  }
  if (!tips.length) return null;
  return { tips, leadWithInjuryStory, personalBeforeGroup };
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
  background: 'מה הרקע — התאמנת בעבר? ויש פציעה או כאב שכדאי שנדע עליו?',
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

// ── Rapport / sales-angle lines (intake tree) ───────────────────────
// Key answers in the intake tree carry a `rapport` key; the screen shows
// the matching 💬 line so a rep without a sports background translates
// each answer into Uriel's selling angle. Fully editable — the tree's
// schema references these keys; edit the copy freely.
export const RAPPORT_LINES = {
  // How they arrived
  referral:        'הפניה זה האמון הכי חזק — מישהו כבר ערב לנו. שווה להזכיר את מי.',
  saw_activity:    'ראו אותנו בפעולה — כבר יש חיבור רגשי, רק להפוך אותו להתחלה.',
  // Who / audience
  for_group:       'קבוצה זה הכיוון — האנשים אצלנו הם חצי מהסיפור, זה מה שמחזיק לאורך זמן.',
  for_child:       'אצל ילדים אנחנו בונים ביטחון דרך תנועה — ההורה קונה שקט נפשי, לא רק אימון.',
  for_school:      'בבית ספר הערך הוא חינוכי — תנועה שמלמדת התמדה ומשמעת, לא רק כושר.',
  for_company:     'בארגון זה רווחה שמחזירה אנרגיה לעבודה — פחות ימי מחלה, יותר צוות מגובש.',
  day_of_fun:      'יום שיא זה חלון הזדמנות — חוויה אחת מדויקת פותחת דלת לפעילות קבועה.',
  // Trigger / why now
  pain_trigger:    'כאב הוא הסיבה שמתקשרים היום — כאן אנחנו הכי חזקים: לבנות גוף שלא נשבר.',
  event_trigger:   'יש דדליין — זה דלק. נבנה תוכנית עם תאריך יעד ברור.',
  // Relationship with sport
  loves_sport:     'הם כבר אוהבים — צריך רק לתת מסגרת שתשמור על זה. חצי מהעבודה נעשתה.',
  needs_but:       'הם יודעים שהם צריכים — התפקיד שלנו להסיר את מה שמרתיע, לא ללחוץ.',
  hates_sport:     'מי ששונא ספורט בדרך כלל שנא חדר כושר — לא תנועה עם משמעות. שם אנחנו שונים.',
  boring_gym:      'בדיוק בגלל זה אצלנו לומדים מיומנויות — עמידת ידיים לא משעממת אף פעם.',
  no_time:         'פעמיים בשבוע 45 דקות — זה הכול. אנחנו בונים סביב החיים, לא הפוך.',
  bad_experience:  'חוויה רעה בעבר זה בדיוק מה שאנחנו מתקנים — יחס אישי, בלי שיפוטיות.',
  // Last time active
  before_army:     'הגוף כבר יודע — צריך רק להזכיר לו. חוזרים מהר יותר ממה שחושבים.',
  years_ago:       'הרבה זמן עבר, אבל הבסיס שם — נתחיל בעדינות ונבנה מחדש נכון.',
  // Tried before — what was missing (key to the offer)
  quit_price:      'אם עזבו בגלל מחיר — נדבר על ערך: מה קיבלו ומה קיבלו אצלנו.',
  quit_boredom:    'עזבו כי היה משעמם — אצלנו כל שבוע מיומנות חדשה, אין שגרה מתה.',
  quit_injury:     'עזבו בגלל פציעה — זה הליבה שלנו: להתאמן חכם כדי לא להיפצע שוב.',
  quit_no_care:    'עזבו כי לא קיבלו יחס — אצלנו מכירים כל אחד בשם, זה כל ההבדל.',
  // Injuries
  injury_active:   'כאב פעיל — נפתח את הסיפור שלי בפציעות, זה בדיוק הליד שנבנה בשבילו. ונמליץ על אישי לפני קבוצתי.',
  surgery_cleared: 'כתף אחרי ניתוח עם אישור רופא זה בדיוק מה שאני יודע לעבוד איתו — בטוח ומדויק.',
  needs_clearance: 'לפני שמתחילים נסדר אישור רופא — לא ממהרים, בונים על בטוח.',
  chronic_pain:    'כאב כרוני דורש תוכנית, לא אימון אקראי — נבנה משהו שמחזק בלי להחמיר.',
  // Competitive background
  competitive:     'רקע תחרותי — נדבר מיומנויות מתקדמות ואתגר אמיתי, לא בסיס.',
  never_trained:   'הכול מתחיל מאפס בשיטה שלנו — שיעור ניסיון הוא הצעד הראשון הבטוח.',
};
export function rapportLine(key) {
  return key ? (RAPPORT_LINES[key] || null) : null;
}
