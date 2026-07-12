// ── Need → response bank (quick intake diagnosis) ───────────────────
// Edit the Hebrew copy here freely — the UI reads it, no code changes
// needed. Mirrors the structure of the objection bank: keyed by
// persona (+ need), with sensible fallbacks.

export const NEED_PERSONAS = [
  { key: 'parent',   label: 'הורה לילד' },
  { key: 'beginner', label: 'מתאמן מתחיל' },
  { key: 'advanced', label: 'מתאמן מתקדם' },
  { key: 'org',      label: 'ארגון-קבוצה' },
  { key: 'senior',   label: 'גיל שלישי' },
];

// Main needs shown per persona (choose up to two). beginner + advanced
// share the "trainee" set.
const TRAINEE_NEEDS = ['כושר כללי', 'מיומנות ספציפית (חבל, טבעות, עמידת ידיים)', 'כאבים-פציעות עבר', 'חזרה לכושר'];
export const NEEDS_BY_PERSONA = {
  parent:   ['ילד על מסכים', 'ביטחון עצמי', 'יציבה ותנועה', 'פורקן אנרגיה', 'חברים ומסגרת'],
  beginner: TRAINEE_NEEDS,
  advanced: TRAINEE_NEEDS,
  org:      ['גיבוש', 'רווחת עובדים', 'פעילות קבועה לקבוצה קיימת'],
  senior:   ['ניידות ותפקוד', 'חברה ושגרה', 'בריאות'],
};

// Connection line — one phone-style sentence translating the need into
// an AthletiGo answer. Keyed by "persona:need"; falls back per persona.
const CONNECTION = {
  'parent:ילד על מסכים': 'בדיוק בשביל זה הפעילות קיימת — ילדים שמגלים שהגוף שלהם מעניין יותר מהמסך',
  'parent:ביטחון עצמי': 'כשילד מצליח תרגיל שלא האמין שיוכל — הביטחון הזה עובר לכל תחומי החיים',
  'parent:יציבה ותנועה': 'אנחנו מלמדים את הגוף לזוז נכון מגיל צעיר — יציבה טובה נבנית עכשיו',
  'parent:פורקן אנרגיה': 'יש להם המון אנרגיה — אנחנו נותנים לה מסגרת חיובית ומאתגרת',
  'parent:חברים ומסגרת': 'זו קבוצה שהילדים מחכים אליה — תנועה, חברים ושייכות',
  'beginner:כושר כללי': 'מתחילים בדיוק מאיפה שאתה — ובונים כושר אמיתי, צעד אחרי צעד',
  'beginner:מיומנות ספציפית (חבל, טבעות, עמידת ידיים)': 'המיומנויות האלה נבנות בשיטה — נפרק אותן לשלבים שתשלוט בהם',
  'beginner:כאבים-פציעות עבר': 'בדיוק בגלל זה — אנחנו מלמדים להתאמן נכון כדי שהגוף מתחזק במקום להיפצע',
  'beginner:חזרה לכושר': 'הגוף זוכר — נחזיר אותך לקצב בלי לשרוף אותך בהתחלה',
  'advanced:מיומנות ספציפית (חבל, טבעות, עמידת ידיים)': 'ברמה שלך זה כבר דיוק — ניקח את המיומנות צעד אחד קדימה בשיטה',
  'advanced:כושר כללי': 'נעלה לך את התקרה — עומס נכון ומתקדם שממשיך לאתגר',
  'org:גיבוש': 'אימון קבוצתי במשקל גוף זה גיבוש אמיתי — כולם מתחילים מאותה נקודה',
  'org:רווחת עובדים': 'פעילות גופנית קבועה זו ההשקעה הכי משתלמת ברווחת העובדים — אנרגיה ומצב רוח',
  'org:פעילות קבועה לקבוצה קיימת': 'ניקח את הקבוצה הקיימת ונהפוך אותה למסגרת אימון קבועה ומהנה',
  'senior:ניידות ותפקוד': 'תנועה נכונה שומרת על העצמאות — נעבוד על ניידות ותפקוד יומיומי',
  'senior:חברה ושגרה': 'זו שגרה שמחכים אליה — תנועה, חברה ושייכות',
  'senior:בריאות': 'תנועה מתונה וקבועה זו התרופה הכי טובה — נעשה את זה בהנאה ובבטחה',
};
const CONNECTION_FALLBACK = {
  parent:   'נבנה לילד/ה מסגרת תנועה שמחכים אליה — כיף, ביטחון וגוף בריא',
  beginner: 'מתחילים מאיפה שאתה, בשיטה שמביאה תוצאות אמיתיות',
  advanced: 'ניקח את הרמה שלך צעד קדימה — עומס נכון ומדויק',
  org:      'נהפוך את הפעילות לחוויה קבוצתית קבועה שכולם נהנים ממנה',
  senior:   'תנועה מתונה ובטוחה ששומרת על עצמאות, בריאות ושמחה',
};

// Which value-ladder offer fits the service type (incl. price).
const VALUE_LADDER = {
  personal:   'אימון אישי — 350₪ למפגש (עם שיעור ניסיון להיכרות)',
  group:      'מחיר קבוצתי למפגש — לפי גודל הקבוצה',
  online:     'ליווי אונליין — תכנית אישית + מעקב',
  workshop:   'סדנה — נבנה הצעת מחיר לפי ההיקף',
  movement65: 'תנועה בכיף 65+ — מחיר קבוצתי למפגש',
  _default:   'שיעור ניסיון חינם + מנוי (249-399₪)',
};

// One follow-up question that strengthens the diagnosis.
const FOLLOWUP_Q = {
  parent:   'מה הכי חשוב לך שהילד/ה יקבל/תקבל מהפעילות?',
  beginner: 'מה היית רוצה להצליח לעשות שהיום נראה לך רחוק?',
  advanced: 'איזו מיומנות הכי בא לך לפצח בתקופה הקרובה?',
  org:      'כמה אנשים בקבוצה, וכל כמה זמן הייתם רוצים להיפגש?',
  senior:   'מה הכי חשוב לך לשמור עליו בשגרה היומית?',
};

// Compose the "our answer" card from persona + needs + service type.
export function buildNeedResponse({ persona, needs, serviceType }) {
  if (!persona) return null;
  const need = Array.isArray(needs) ? needs.find(Boolean) : needs;
  const connection = (need && CONNECTION[`${persona}:${need}`]) || CONNECTION_FALLBACK[persona] || '';
  const offer = VALUE_LADDER[serviceType] || VALUE_LADDER._default;
  const question = FOLLOWUP_Q[persona] || 'מה הכי חשוב לך שנשיג ביחד?';
  return { connection, offer, question };
}

// Smart default for the "next step" chip, by diagnosis.
export function smartNextStep(persona, serviceType) {
  if (persona === 'org' || serviceType === 'workshop') return 'לשלוח הצעה';
  if (persona === 'parent' || persona === 'senior') return 'לקבוע שיעור ניסיון';
  if (persona === 'beginner' || persona === 'advanced') return serviceType === 'personal' ? 'לקבוע פגישת היכרות' : 'לקבוע שיעור ניסיון';
  return 'לחזור בטלפון';
}

export const PERSONA_LABEL = Object.fromEntries(NEED_PERSONAS.map((p) => [p.key, p.label]));
