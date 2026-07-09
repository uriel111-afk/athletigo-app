// ═══════════════════════════════════════════════════════════════════
// Life OS — Shared Constants
// ═══════════════════════════════════════════════════════════════════

// The single user ID that sees the Coach Hub. Any other user keeps
// using the existing trainee/coach flow untouched.
export const COACH_USER_ID = '67b0093d-d4ca-4059-8572-26f020bef1eb';

// Brand colors — aligned with the rest of the app (see Dashboard.jsx,
// Layout.jsx). Do not change without updating the design system.
export const LIFEOS_COLORS = {
  primary: '#FF6F20',
  primaryLight: '#FFF8F3',
  bg: '#FDF8F3',
  cardBg: '#FFFFFF',
  textPrimary: '#1a1a1a',
  textSecondary: '#6b7280',
  textMuted: '#9ca3af',
  border: '#F0E4D0',
  success: '#16a34a',
  error: '#dc2626',
  warning: '#EAB308',
};

// Card style token — used everywhere for consistency. borderRadius:14
// matches the rest of the app (see Dashboard card styles).
export const LIFEOS_CARD = {
  backgroundColor: LIFEOS_COLORS.cardBg,
  borderRadius: 14,
  border: `1px solid ${LIFEOS_COLORS.border}`,
  boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
  padding: 16,
};

// ─────────────────────────────────────────────────────────────────
// Expense categories — fixed list. `label` is Hebrew UI text; `key`
// is the English enum stored in the `category` column.
// ─────────────────────────────────────────────────────────────────

export const EXPENSE_CATEGORIES = [
  { key: 'housing',        label: 'דיור',        emoji: '🏠' },
  { key: 'bills',          label: 'חשבונות',     emoji: '💡' },
  { key: 'transport',      label: 'תחבורה',      emoji: '🚗' },
  { key: 'insurance',      label: 'ביטוחים',     emoji: '🛡️' },
  { key: 'food',           label: 'מזון',        emoji: '🛒' },
  { key: 'subscriptions',  label: 'מנויים',      emoji: '📱' },
  { key: 'taxes',          label: 'מיסים',       emoji: '🧾' },
  { key: 'electronics',    label: 'אלקטרוניקה',  emoji: '💻' },
  { key: 'cleaning',       label: 'ניקיון',      emoji: '🧹' },
  { key: 'business',       label: 'עסק',         emoji: '💼' },
  { key: 'other',          label: 'אחר',         emoji: '📦' },
];

export const EXPENSE_CATEGORY_BY_KEY = Object.fromEntries(
  EXPENSE_CATEGORIES.map(c => [c.key, c])
);

export const PAYMENT_METHODS = [
  { key: 'cash',     label: 'מזומן' },
  { key: 'credit',   label: 'אשראי' },
  { key: 'transfer', label: 'העברה' },
  { key: 'bit',      label: 'ביט' },
];

// ─────────────────────────────────────────────────────────────────
// Income sources + products
// ─────────────────────────────────────────────────────────────────

export const INCOME_SOURCES = [
  { key: 'product_sale',     label: 'מכירת מוצר' },
  { key: 'training',         label: 'אימון אישי' },
  { key: 'online_coaching',  label: 'ליווי אונליין' },
  { key: 'workshop',         label: 'סדנה' },
  { key: 'course',           label: 'קורס דיגיטלי' },
  { key: 'other',            label: 'אחר' },
];

// Product catalog — prices and starting inventory. Used by
// BusinessPlan screen and for the product dropdown in income form.
export const ATHLETIGO_PRODUCTS = [
  { key: 'dream_machine',    label: 'Dream Machine',     price: 1199, inventory: 90, emoji: '🏗️' },
  { key: 'speed_rope',       label: 'Speed Rope',        price: 220,  inventory: 10, emoji: '⚡' },
  { key: 'freestyle_rope',   label: 'Freestyle Rope',    price: 159,  inventory: 30, emoji: '🪢' },
  { key: 'rings',            label: 'Gymnastic Rings',   price: 249,  inventory: 18, emoji: '⭕' },
  { key: 'resistance_bands', label: 'Resistance Bands',  price: 200,  inventory: 20, emoji: '🎗️' },
  { key: 'parallettes',      label: 'Parallettes',       price: 220,  inventory: 20, emoji: '🤸' },
  { key: 'personal_training',label: 'אימון אישי',         price: 200,  inventory: null, emoji: '💪' },
  { key: 'online_coaching',  label: 'ליווי אונליין',      price: 500,  inventory: null, emoji: '📱' },
  { key: 'workshop',         label: 'סדנה',               price: 200,  inventory: null, emoji: '🎪' },
  { key: 'digital_course',   label: 'קורס דיגיטלי',        price: 400,  inventory: null, emoji: '🎓' },
];

// Full list of planned digital courses (11 total — all in planning).
export const COURSE_CATALOG = [
  { key: 'basic_jump_rope',   label: 'Basic Jump Rope',      category: 'jump_rope' },
  { key: 'freestyle_rope',    label: 'Freestyle Rope',       category: 'jump_rope' },
  { key: 'double_unders',     label: 'Double Unders',        category: 'jump_rope' },
  { key: 'fitness_found',     label: 'Fitness Foundations',  category: 'strength' },
  { key: 'fitness_pro',       label: 'Professional Fitness', category: 'strength' },
  { key: 'fitness_olympic',   label: 'Olympic Fitness',      category: 'strength' },
  { key: 'stick_spins',       label: 'Stick Spins',          category: 'calisthenics' },
  { key: 'basic_rings',       label: 'Basic Rings',          category: 'rings' },
  { key: 'advanced_rings',    label: 'Advanced Rings',       category: 'rings' },
  { key: 'handstands',        label: 'Handstands',           category: 'calisthenics' },
  { key: 'muscle_ups',        label: 'Muscle-Ups',           category: 'calisthenics' },
];

// ─────────────────────────────────────────────────────────────────
// Task / challenge enums
// ─────────────────────────────────────────────────────────────────

export const TASK_PRIORITY = [
  { key: 'low',    label: 'רגילה',   color: '#16a34a' },
  { key: 'medium', label: 'בינונית', color: '#EAB308' },
  { key: 'high',   label: 'גבוהה',  color: '#FF6F20' },
  { key: 'critical', label: 'דחוף',  color: '#dc2626' },
];

export const TASK_DIFFICULTY = [
  { key: 'easy',    label: 'קל',     color: '#16a34a' },
  { key: 'medium',  label: 'בינוני', color: '#EAB308' },
  { key: 'hard',    label: 'קשה',    color: '#FF6F20' },
  { key: 'extreme', label: 'קיצוני', color: '#dc2626' },
];

export const TASK_STATUS = [
  { key: 'pending',     label: 'ממתין' },
  { key: 'in_progress', label: 'בתהליך' },
  { key: 'completed',   label: 'הושלם' },
];

// Mentor message types → emoji + color hint for the card header.
export const MENTOR_MESSAGE_TYPES = {
  insight:     { label: 'תובנה',    emoji: '💡' },
  challenge:   { label: 'אתגר',     emoji: '🎯' },
  motivation:  { label: 'מוטיבציה', emoji: '🔥' },
  pattern:     { label: 'דפוס',     emoji: '📊' },
  opportunity: { label: 'הזדמנות',  emoji: '🚀' },
};

export const YEARLY_GOAL = 10_000_000;
export const MONTHLY_GOAL_REQUIRED = Math.round(YEARLY_GOAL / 12);

// ─────────────────────────────────────────────────────────────────
// Recurring payments — frequency options
// ─────────────────────────────────────────────────────────────────

export const RECURRING_FREQUENCIES = [
  { key: 'monthly',   label: 'חודשי' },
  { key: 'quarterly', label: 'רבעוני' },
  { key: 'yearly',    label: 'שנתי' },
  { key: 'weekly',    label: 'שבועי' },
];

// ─────────────────────────────────────────────────────────────────
// Document categories
// ─────────────────────────────────────────────────────────────────

export const DOCUMENT_CATEGORIES = [
  { key: 'contracts',  label: 'חוזים',   emoji: '📝' },
  { key: 'insurance',  label: 'ביטוחים', emoji: '🛡️' },
  { key: 'receipts',   label: 'קבלות',   emoji: '🧾' },
  { key: 'taxes',      label: 'מיסים',   emoji: '💼' },
  { key: 'other',      label: 'אחר',     emoji: '📁' },
];

// ─────────────────────────────────────────────────────────────────
// Leads
// ─────────────────────────────────────────────────────────────────

export const LEAD_SOURCES = [
  { key: 'instagram', label: 'אינסטגרם' },
  { key: 'facebook',  label: 'פייסבוק' },
  { key: 'whatsapp',  label: 'וואטסאפ' },
  { key: 'website',   label: 'אתר' },
  { key: 'referral',  label: 'הפניה' },
  { key: 'walk_in',   label: 'הגעה ישירה' },
  { key: 'other',     label: 'אחר' },
];

export const LEAD_STATUS = [
  { key: 'new',         label: 'חדש',     color: '#6b7280' },
  { key: 'contacted',   label: 'נוצר קשר', color: '#EAB308' },
  { key: 'interested',  label: 'מתעניין',  color: '#FF6F20' },
  { key: 'negotiating', label: 'במו"מ',    color: '#3B82F6' },
  { key: 'converted',   label: 'נסגר',    color: '#16a34a' },
  { key: 'lost',        label: 'אבוד',    color: '#dc2626' },
];

export const LEAD_INTERESTED_IN = [
  { key: 'dream_machine',    label: 'Dream Machine' },
  { key: 'speed_rope',       label: 'Speed Rope' },
  { key: 'freestyle_rope',   label: 'Freestyle Rope' },
  { key: 'rings',            label: 'Gymnastic Rings' },
  { key: 'bands',            label: 'Resistance Bands' },
  { key: 'parallettes',      label: 'Parallettes' },
  { key: 'coaching',         label: 'אימון אישי' },
  { key: 'online_coaching',  label: 'ליווי אונליין' },
  { key: 'workshop',         label: 'סדנה' },
  { key: 'course',           label: 'קורס דיגיטלי' },
  { key: 'other',            label: 'אחר' },
];

// ─────────────────────────────────────────────────────────────────
// Guided sales flow — value-ladder matching
// ─────────────────────────────────────────────────────────────────

// Step-1 source chips (subset of LEAD_SOURCES, in the spec's order).
export const LEAD_SOURCE_CHIPS = [
  { key: 'instagram', label: 'אינסטגרם' },
  { key: 'facebook',  label: 'פייסבוק' },
  { key: 'whatsapp',  label: 'וואטסאפ' },
  { key: 'website',   label: 'אתר' },
  { key: 'referral',  label: 'הפניה' },
  { key: 'walk_in',   label: 'הגעה ישירה' },
];

// Step-2 sports-experience chips. The key drives the ladder match.
export const SPORTS_EXPERIENCE = [
  { key: 'never',     label: 'אף פעם לא התאמנתי' },
  { key: 'quit',      label: 'התאמנתי פעם והפסקתי' },
  { key: 'sometimes', label: 'מתאמן לפעמים' },
  { key: 'regular',   label: 'מתאמן באופן קבוע' },
  { key: 'athlete',   label: 'ספורטאי' },
];

// The three ladder positions a lead can be matched to, each with the
// personalized pitch shown on step 3 and the recommended product.
export const LADDER_MATCHES = {
  breakthrough: {
    key: 'breakthrough',
    title: 'הצעד הראשון',
    color: '#0d9488', // teal
    body:
      'אתלטיגו מלמד מיומנות גופנית — לא סתם להזיע, אלא ללמוד לשלוט בגוף.\n' +
      'אנחנו מתחילים עם תוכנית של 7 ימים — בסלון, בלי ציוד, בלי ניסיון קודם.\n' +
      'כל יום סרטון קצר עם תרגיל אחד פשוט. אתה מצלם את עצמך ושולח — ואני נותן לך פידבק אישי.\n' +
      'המטרה? שתרגיש שאתה יכול. כי ברגע שהגוף מכיר תנועה — אתה רוצה עוד.\n' +
      'ואפשר לעשות את זה ביחד עם בן/בת זוג, ילדים, חברים. זו חוויה משותפת.',
    recommended: 'מומלץ: 7 ימים של תנועה ראשונה — 49₪',
  },
  '3month': {
    key: '3month',
    title: 'בניית שגרה',
    color: '#3B82F6', // blue
    body:
      'יש לך את הבסיס — עכשיו צריך לבנות שגרה שמחזיקה.\n' +
      'אנחנו בונים לך תוכנית אימון אישית, עם מפגשים אונליין, מעקב שבועי, ומשימות לצילום.\n' +
      'המטרה היא עצמאות — שתדע להתאמן לבד נכון. אבל כל עוד אתה רוצה להתקדם חזק יותר — אני כאן.\n' +
      'אחרי 3 חודשים הגוף שלך כבר מתורגל ומתמיד. ואז מרחיבים.',
    recommended: 'מומלץ: תוכנית 3 חודשים — 300₪/חודש',
  },
  advanced: {
    key: 'advanced',
    title: 'הרמה הבאה',
    color: '#8b5cf6', // purple
    body:
      'אתה מתאמן — עכשיו צריך ללמוד תנועות שהגוף שלך עוד לא מכיר.\n' +
      'עלייה לכוח. פלאנצ׳. פרונט לבר. עמידת ידיים.\n' +
      'הדרים מאשין מוריד 50% מהמשקל ונותן לגוף שלך להרגיש תנועות שהוא עוד לא מסוגל לעשות לבד.\n' +
      'ברגע שהגוף מכיר — הדרך מתקצרת בחודשים.',
    recommended: 'מומלץ: דרים מאשין (1,199₪) + קורס עליות כוח',
  },
};

// Map a sports-experience key → ladder position.
export function ladderForExperience(exp) {
  if (exp === 'never' || exp === 'quit') return 'breakthrough';
  if (exp === 'sometimes') return '3month';
  if (exp === 'regular' || exp === 'athlete') return 'advanced';
  return 'breakthrough';
}

// The three core authority messages shown under every pitch card.
export const LADDER_CORE_MESSAGES = [
  '✦ המטרה היא עצמאות ספורטיבית',
  '✦ עם ליווי, התהליך חזק ומשמעותי יותר',
  '✦ אנחנו לא מלמדים להתאושש — מלמדים לא להיפצע מלכתחילה',
];

// Shareable content per ladder match — each item carries a pre-written
// WhatsApp message + a link. Sending one appends to the lead's
// content_sent array (builds authority before the ask).
export const LADDER_CONTENT = {
  breakthrough: [
    { label: 'קליפ מוטיבציה — הצעד הראשון', url: 'https://instagram.com/athletigo',
      message: 'היי! שלחתי לך קליפ קצר על מה שדיברנו — הצעד הראשון בתנועה 🙌' },
    { label: 'טיפ למתחילים — 5 דקות בבוקר', url: 'https://instagram.com/athletigo',
      message: 'הנה תרגיל בוקר של 5 דקות בלי ציוד — תנסה ותגיד לי איך הרגיש 💪' },
  ],
  '3month': [
    { label: 'הסבר על השיטה', url: 'https://instagram.com/athletigo',
      message: 'שלחתי לך סרטון שמסביר בדיוק איך עובדת השיטה שלנו 🎯' },
    { label: 'מאחורי הקלעים — בניית תוכנית', url: 'https://instagram.com/athletigo',
      message: 'הצצה מאחורי הקלעים — ככה אני בונה תוכנית אישית 🏋️' },
  ],
  advanced: [
    { label: 'דרים מאשין — מקרוב', url: 'https://instagram.com/athletigo',
      message: 'תראה את הדרים מאשין מקרוב — זה משנה את כל הכללים 🔥' },
    { label: 'קליפ מיומנות — עליות כוח', url: 'https://instagram.com/athletigo',
      message: 'קליפ קצר על עליות כוח — בדיוק מה שדיברנו עליו 💪' },
  ],
};

// Step-4 advanced equipment options (with prices) for the build.
export const LADDER_EQUIPMENT = [
  { key: 'dream_machine', label: 'דרים מאשין', price: 1199 },
  { key: 'rings',         label: 'טבעות',      price: 249 },
  { key: 'parallettes',   label: 'פרלטים',     price: 220 },
  { key: 'speed_rope',    label: 'ספיד רופ',   price: 220 },
  { key: 'bands',         label: 'גומיות',     price: 159 },
];
export const LADDER_COURSE_OPTIONS = [
  'עליות כוח', 'עמידות ידיים', 'טבעות בסיסי', 'יסודות הכושר',
  'כושר מקצועי', 'כושר אולימפי',
];

// Step-5 close-result chips (drives the detail-view status badge).
export const LEAD_CLOSE_RESULTS = [
  { key: 'closed_now',        label: 'סגר במקום',      color: '#16a34a' },
  { key: 'closed_today',      label: 'סגר באותו יום',  color: '#16a34a' },
  { key: 'took_breakthrough', label: 'לקח מוצר פריצה', color: '#3B82F6' },
  { key: 'needs_followup',    label: 'דורש מעקב',      color: '#EAB308' },
  { key: 'not_now',           label: 'לא עכשיו',       color: '#9ca3af' },
];

// ── Payment / close (step 7) ──────────────────────────────────────
// Named LEAD_* to avoid colliding with the finance PAYMENT_METHODS.
export const LEAD_PAYMENT_METHODS = [
  { key: 'credit',   label: 'אשראי בטלפון' },
  { key: 'bit',      label: 'ביט' },
  { key: 'cash',     label: 'מזומן' },
  { key: 'transfer', label: 'העברה בנקאית' },
];
export const LEAD_PAYMENT_METHOD_BY_KEY = Object.fromEntries(LEAD_PAYMENT_METHODS.map((m) => [m.key, m]));

// Granular lead status (lead_status_detail column) → badge label/color.
export const LEAD_STATUS_DETAIL = {
  new:                 { label: 'חדש',              color: '#9ca3af' },
  contacted:           { label: 'נוצר קשר',         color: '#FF6F20' },
  interested:          { label: 'מעוניין',          color: '#EAB308' },
  offered:             { label: 'קיבל הצעה',        color: '#3B82F6' },
  thinking:            { label: 'צריך לחשוב',       color: '#EAB308' },
  wants_coach:         { label: 'ביקש מאמן',        color: '#3B82F6' },
  closed_intro:        { label: 'נקבע מפגש היכרות', color: '#16a34a' },
  closed_breakthrough: { label: 'סגר — מוצר פריצה', color: '#16a34a' },
  closed_3month:       { label: 'סגר — 3 חודשים',   color: '#16a34a' },
  closed_annual:       { label: 'סגר — שנתי',       color: '#16a34a' },
  closed_equipment:    { label: 'סגר — ציוד',       color: '#16a34a' },
  closed_coaching:     { label: 'סגר — ליווי אישי', color: '#16a34a' },
  refused:             { label: 'סירב',             color: '#dc2626' },
  lost:                { label: 'אבוד',             color: '#4b5563' },
};

// Objection-handling bank for the guided intake wizard's floating
// helper, keyed by wizard step. Each objection has one or more
// `responses`, and every response carries `line` (what to say aloud)
// plus `note` (a delivery hint — tone/pace — shown muted, NOT read out).
// The {source} placeholder is interpolated with the lead's source.
export const OBJECTION_BANK_BY_STEP = {
  1: [
    { q: 'מאיפה השגתם את המספר שלי?', responses: [
      { line: 'השארת פרטים ב{source}, רצינו לחזור אליך לפני שהעניין יתקרר.',
        note: 'טון רגוע ובטוח, לא מתנצל — זו עובדה פשוטה, לא משהו לתרץ' },
      { line: 'רשמת עצמך אצלנו — פשוט ממשיכים משם.',
        note: 'קליל וזורם, כאילו זה המשך טבעי של שיחה שכבר התחילה' },
    ] },
    { q: 'אין לי זמן לדבר עכשיו', responses: [
      { line: 'שתי דקות בלבד, ממש בקצרה.',
        note: 'מהר וממוקד — תוכיח/י את זה בפועל, לא רק במילים' },
      { line: 'מתי נוח שאחזור אליך?',
        note: 'שאלה סגורה עם שתי אופציות (בוקר/ערב) — לא להשאיר פתוח מדי' },
    ] },
    { q: 'מי זה בדיוק מדבר?', responses: [
      { line: 'מדברים מאתלטיגו — מותג כושר מבוסס מיומנות. פנינו כי השארת פרטים ב{source}.',
        note: 'משפט אחד, בלי הרצאה — הפרטים הנוספים יגיעו כשהוא ישאל' },
    ] },
    { q: 'לא זוכר/ת שנרשמתי לשום דבר', responses: [
      { line: 'יכול להיות שראית פוסט או פלייר — ספר/י לי מה תפס אותך שם.',
        note: 'מעביר את הכדור אליו במקום להתווכח על העובדות' },
    ] },
  ],
  2: [
    { q: 'סתם רציתי מידע, לא לגמרי החלטתי', responses: [
      { line: 'מעולה, בדיוק בשביל זה השיחה — רק להבין אם זה מתאים.',
        note: 'להוריד לחץ באופן מוחלט — זה מה שיגרום לו להירגע ולהמשיך' },
    ] },
    { q: 'בעצם לא אני, מישהו אחר ביקש שאתקשר', responses: [
      { line: 'יופי שיש מי שדואג — בוא/י נראה אם זה גם מתאים לך.',
        note: 'להחזיר את הבעלות אליו, לא להשאיר את זה "מטלה של מישהו אחר"' },
    ] },
    { q: 'אין סיבה מיוחדת, סתם ראיתי פרסום', responses: [
      { line: 'גם זו התחלה טובה — מה בפרסום תפס אותך?',
        note: 'שאלה סקרנית, לא ביקורתית — פותחת אותו לדבר' },
    ] },
  ],
  3: [
    { q: 'כבר ניסיתי הכל ולא הצליח', responses: [
      { line: 'ספר/י לי מה בדיוק לא עבד, כדי שלא נחזור על זה.',
        note: 'להקשיב באמת לתשובה — היא הופכת לחומר לשיקוף בהמשך' },
      { line: 'אז בטח יש לך ניסיון שיעזור לנו לדייק מהר יותר.',
        note: 'הופך "כישלון עבר" להישג — טון מעודד, לא מנחם' },
    ] },
    { q: 'אני לא בכושר מספיק בשביל להתחיל', responses: [
      { line: 'זו בדיוק הסיבה להתחיל אצלנו — מתחילים מדויק מאיפה שאת/ה.',
        note: 'לומר בביטחון, לא ברכות יתרה — זו עובדה, לא ניחום' },
    ] },
    { q: 'פשוט אין לי מוטיבציה', responses: [
      { line: 'המוטיבציה מגיעה אחרי ההתחלה, לא לפניה — כמעט תמיד.',
        note: 'קצר וישיר, בלי לנסות לשכנע יותר מדי — משפט אחד ולעבור הלאה' },
    ] },
    { q: 'פחד מפציעה', responses: [
      { line: 'בדיוק בגלל זה — אנחנו מלמדים להתאמן נכון כדי שלא נפצעים מלכתחילה.',
        note: 'זה משפט הליבה של המותג — לומר באיטיות ובביטחון מלא, לא ממהרים עליו' },
    ] },
  ],
  4: [
    { q: 'אין לי שום רקע, מרגיש/ה מביך', responses: [
      { line: 'אין דבר כזה מביך כאן — כל אחד מתחיל איפשהו.',
        note: 'חם ואישי, אולי עם חיוך שנשמע בקול' },
    ] },
    { q: 'יש לי פציעה, אולי לא מתאים לי', responses: [
      { line: 'בדיוק בשביל זה נבנה תהליך שמכבד את הגוף — עובדים סביב זה, לא נגדו.',
        note: 'רציני ומקצועי — כאן חשוב שיישמע שיש ידע אמיתי מאחורי המשפט' },
    ] },
    { q: 'לא בטוח/ה מה כדאי לספר', responses: [
      { line: 'כל מה שיעזור לנו להתאים לך נכון — גם דברים קטנים.',
        note: 'להזמין, לא לדרוש — משאיר לו לבחור כמה לשתף' },
    ] },
  ],
  5: [
    { q: 'לא יודע/ת מה בדיוק אני רוצה', responses: [
      { line: 'זה בסדר גמור, נבנה את זה יחד במפגש.',
        note: 'להוריד את הלחץ למצוא תשובה מושלמת עכשיו' },
    ] },
    { q: 'לא מאמין/ה שזה באמת ישתנה', responses: [
      { line: 'אנשים שהתחילו בדיוק ממך כבר עושים דברים שלא האמינו שיעשו.',
        note: 'זה משפט מפתח — האטה קלה לפניו, לומר אותו כאילו זו עובדה ולא סיסמה' },
    ] },
    { q: 'לא חושב/ת שיש לי זמן להתמיד', responses: [
      { line: 'אנחנו בונים מסגרת שנכנסת ללוז — לא הופכת אותו.',
        note: 'קצבי ובטוח — זו תשובה שצריכה להישמע כמו פתרון, לא כמו הבטחה ריקה' },
    ] },
  ],
  6: [
    { q: 'לא בטוח/ה איזה סוג מתאים לי', responses: [
      { line: 'לא צריך להחליט עכשיו — מפגש ההיכרות בדיוק בשביל זה.',
        note: 'מוריד את גודל ההחלטה — זה לא "לכל החיים", זה רק הצעד הבא' },
    ] },
    { q: 'אני מעדיף/ה לבד, בלי אנשים', responses: [
      { line: 'לגמרי אפשרי — יש לנו גם מסלול אישי ואונליין.',
        note: 'בלי לנסות לשכנע שקבוצה עדיפה — לכבד את הבחירה ולהציע חלופה מיד' },
    ] },
    { q: 'לא אוהב/ת מסגרות קבועות', responses: [
      { line: 'יש לנו גם אונליין בקצב שלך, בלי לוח זמנים נוקשה.',
        note: 'טון גמיש בעצמו — לא להישמע נוקשה תוך כדי שמדברים על גמישות' },
    ] },
  ],
  8: [
    { q: 'כמה זה עולה?', responses: [
      { line: 'תלוי במסגרת שנתאים לך — בדיוק בשביל זה אני שואלת כמה שאלות קצרות, בסדר?',
        note: 'לא לתת מספר יבש — להחזיר לשאלות ההתאמה בטון קליל' },
      { line: 'יש כמה מסלולים, נמצא את מה שמתאים לך — קודם נבין בדיוק מה צריך.',
        note: 'סבלני, לא מתחמק — משדר שיש תשובה, רק בסדר הנכון' },
    ] },
    { q: 'יקר לי', responses: [
      { line: 'לגמרי מבינה. בדיוק בגלל זה מתחילים בצעד קטן שמתקזז ברכישה.',
        note: 'לא להתנצל על המחיר — להסביר את ההיגיון בביטחון' },
      { line: 'אפשר להתחיל במפגש הבודד ולראות אם זה מתאים, בלי התחייבות.',
        note: 'טון פרקטי, כמו הצעה עסקית פשוטה — לא מכירה' },
    ] },
    { q: 'אין לי זמן', responses: [
      { line: 'רוב המתאמנים שלנו אמרו את זה בהתחלה. המסגרת קצרה וקבועה — נכנסת ללוז, לא הופכת אותו.',
        note: 'להישמע כמו פתרון ולא כמו התחמקות — קצבי ובטוח' },
      { line: 'מפגש אחד קצר, ותראה בעצמך כמה זה נכנס בקלות.',
        note: 'להזמין לניסיון במקום להתווכח על הזמן' },
    ] },
    { q: 'אני צריך/ה לחשוב', responses: [
      { line: 'ברור, החלטה חשובה. מה בעיקר מעסיק אותך — הזמן, הכסף או משהו אחר?',
        note: 'לשאול ולהקשיב — התשובה חושפת את ההתנגדות האמיתית' },
      { line: 'בוא/י נשריין בינתיים מועד — אפשר תמיד לשנות.',
        note: 'לשריין זו הפעולה, לא הלחץ — טון קליל' },
    ] },
    { q: 'אחזור אליך', responses: [
      { line: 'מעולה. מתי נוח שאתקשר אני — מחר בבוקר או בערב?',
        note: 'לקחת בעלות על המעקב — שאלה סגורה עם שתי אופציות' },
      { line: 'אשריין תזכורת מהצד שלי, כך לא נאבד קשר.',
        note: 'רשת ביטחון, לא מעקב לוחץ — חם' },
    ] },
    { q: 'צריך/ה להתייעץ עם בן/בת הזוג', responses: [
      { line: 'רעיון טוב — ואפשר גם שתבואו יחד לשיעור הניסיון, ככה מחליטים ביחד אחרי שמרגישים.',
        note: 'הופך התנגדות להזדמנות — נשמע כמו רעיון, לא כמו פתרון לבעיה' },
      { line: 'בינתיים נשריין מקום, ותמיד אפשר לשנות אחרי שתדברו.',
        note: 'להוריד את גובה ההחלטה — לשריין קל מלהתחייב' },
    ] },
  ],
  9: [
    { q: 'צריך/ה לדבר עם בן/בת הזוג קודם', responses: [
      { line: 'ברור, החלטה משותפת. אפשר לשריין מועד ותמיד ניתן לשנות.',
        note: 'לא ללחוץ להחלטה מיידית — לשריין זו הפעולה, לא הלחץ' },
      { line: 'אפשר גם שהם יצטרפו למפגש ההיכרות עצמו.',
        note: 'הופך התנגדות להזדמנות — נשמע כמו רעיון, לא כמו פתרון לבעיה' },
    ] },
    { q: 'אני אתקשר בחזרה', responses: [
      { line: 'אשריין תזכורת מהצד שלי למחר, כך לא נאבד קשר.',
        note: 'חם ולא לוחץ — זו רשת ביטחון, לא מעקב אחריו' },
    ] },
    { q: 'בעצם לא בטוח/ה שאני רוצה להתחיל בכלל', responses: [
      { line: 'זה בסדר להסס — בוא/י נשריין מקום, ותחליט/י סופית קרוב יותר.',
        note: 'להוריד את גובה ההחלטה לגמרי — "לשריין" הרבה יותר קל מ"להתחייב"' },
    ] },
    { q: 'המועד שהצעת לא מתאים', responses: [
      { line: 'אין בעיה, מתי כן נוח? נמצא ביחד.',
        note: 'קליל ומיידי — לא לתת לזה להרגיש כמו כישלון בתיאום' },
    ] },
  ],
};

// ─────────────────────────────────────────────────────────────────
// Sales-support layer for the guided intake wizard. Per step:
//   { general: [{line, note}], byPersona: { parent|beginner|busy|
//     confidence|status: [{line, note}] } }
// `line` = the Hebrew phrase to SAY (bold); `note` = delivery guidance
// (muted italic). {source} is interpolated with the lead's source.
// Step→group mapping: opening 1-2, need-discovery 3-4 (persona picker
// in 3), value-building 5-6, offer 8, closing 9. Step 7 (mirror): none.
// ─────────────────────────────────────────────────────────────────
const SALES_OPENING = [
  { line: 'היי, אני מתקשר/ת מאתלטיגו — תפסתי אותך בזמן טוב לשתי דקות?',
    note: 'אם לא בזמן טוב — לקבוע מיד שעה חלופית, לא לוותר' },
  { line: 'אתה מתעניין בשביל עצמך או בשביל מישהו אחר?',
    note: 'התשובה כאן היא הרמז הראשון לפרסונה' },
];
const SALES_NEED_GENERAL = [
  { line: 'ספר לי רגע — מה גרם לך להשאיר פרטים דווקא עכשיו?',
    note: 'התשובה שלו היא הזהב של השיחה — לרשום מילה במילה' },
  { line: 'ומה בעצם היית רוצה שיקרה? מה התוצאה שאתה מחפש?',
    note: 'שאלת תוצאה — המילים שלו ישמשו אותך בשיקוף ובהצעה' },
  { line: 'אגב, יש לנו מסלול משפחתי — כל אחד בקבוצה שמתאימה לגיל שלו, וההרשמה המשפחתית משתלמת יותר. רוצה שנסתכל על זה ביחד?',
    note: 'לשאול כשעולה שיש עוד ילדים או שההורה מתעניין גם לעצמו. משפחה שנרשמת יחד — נשארת יחד' },
];
const SALES_NEED_BY_PERSONA = {
  parent: [
    { line: 'אני מבינה אותך לגמרי — בסוף מה שאנחנו רוצים זה לדעת שהילד במקום טוב, עם חברה טובה, ושהוא מחכה לחוג ולא בורח ממנו',
      note: 'להגיד אחרי שמתארים את הילד — בטון של הזדהות, לא של מכירה' },
    { line: 'מה היית רוצה לראות אצל הילד בעוד כמה חודשים?',
      note: 'שאלת חזון — התשובה תשמש בשיקוף' },
    { line: 'הרבה הורים מגיעים אלינו אחרי שהילד עזב חוג אחר — ובדרך כלל הבעיה לא הייתה הילד, אלא שלא ראו אותו שם',
      note: 'מוריד אשמה מההורה ומהילד — פותח שיתוף' },
  ],
  beginner: [
    { line: 'רוב האנשים שמגיעים אלינו כבר ניסו משהו בעבר וזה לא החזיק — וזו בדיוק הסיבה שאצלנו מתחילים אחרת',
      note: 'מנרמל את הכישלון הקודם — מוריד התנגדות' },
    { line: 'החלק הכי קשה הוא להתחיל — ואת החלק הזה כבר עשית, בזה שהתקשרת',
      note: 'מחמאה שבונה מחויבות' },
    { line: 'אצלנו אף אחד לא הולך לאיבוד — יש דרך, שלב אחרי שלב, ואתה תמיד יודע מה הצעד הבא',
      note: 'מוכר את הליבה: כיוון' },
  ],
  busy: [
    { line: 'ברור לי — הזמן הוא המשאב הכי יקר שלך, ובדיוק בגלל זה בנינו אימונים שנכנסים ליום עמוס בלי להפוך אותו',
      note: 'הזדהות עם האילוץ לפני הפתרון' },
    { line: 'עשרים דקות נכונות שוות יותר משעה מפוזרת — זו בדיוק השיטה שלנו',
      note: 'מוכר יעילות, לא כמות' },
    { line: 'מה הזמן ביום שהכי ריאלי אצלך — בוקר, צהריים או ערב?',
      note: 'שאלה שמקדמת לסגירה כבר עכשיו' },
  ],
  confidence: [
    { line: 'זה בדיוק המקום שבו הגוף לומד לעשות דברים שלא האמנת שתעשי — והביטחון הזה יוצא איתך מהאימון החוצה',
      note: 'מוכרים ביטחון, לא כושר' },
    { line: 'אצלנו לא משווים אותך לאף אחת — משווים אותך רק למי שהיית שבוע שעבר',
      note: 'מנטרל את פחד ההשוואה — חסם כניסה מרכזי' },
    { line: 'כל אחת שמתאמנת אצלנו התחילה בדיוק מהנקודה שאת נמצאת בה עכשיו',
      note: 'שייכות — היא לא לבד' },
  ],
  status: [
    { line: 'יש הבדל בין להיות בכושר לבין לשלוט בסקילים שאנשים עוצרים להסתכל עליהם',
      note: 'מוכר ייחודיות וסטטוס' },
    { line: 'חדר כושר בונה שרירים — אנחנו בונים יכולות. זה מה שמבדיל אותך מכל השאר',
      note: 'בידול מחדר כושר — מסר הליבה' },
    { line: 'תוך כמה חודשים אתה עושה דברים שרוב האנשים בטוחים שהם לא מסוגלים אליהם',
      note: 'חזון מוחשי של הישג' },
  ],
};
const SALES_VALUE_GENERAL = [
  { line: 'מה שאנחנו עושים שונה מחדר כושר — אנחנו מלמדים סקילים. הגוף מתחזק בדרך, אבל אתה יוצא עם יכולת',
    note: 'מסר הליבה של המותג' },
  { line: 'המאמן שלנו לא סופר לך חזרות — הוא מלמד אותך שפה חדשה של תנועה',
    note: 'ספורט הוא שפה — הבידול שלנו' },
  { line: 'נשמע לך כמו כיוון שמתאים למה שתיארת לי?',
    note: 'שאלת אישור — עוד כן קטן. אחרי כל הצגת ערך' },
];
const SALES_OFFER_GENERAL = [
  { line: 'בהתחלה הכי כדאי פשוט לבוא להרגיש — מפגש היכרות ב-39 שקלים, ואם זה מתאים ממשיכים משם',
    note: 'לנקוב במחיר בביטחון ולשתוק. מי שמדבר ראשון אחרי המחיר — מפסיד' },
  { line: 'איך זה נשמע לך עד עכשיו?',
    note: 'אם התגובה חיובית — ממשיכים מיד: אז למה שלא תיתן לזה ניסיון?' },
  { line: 'אז למה שלא תיתן לזה ניסיון?',
    note: 'סגירת ההזמנה — עדינה וכמעט בלתי אפשרי לסרב לה' },
];
const SALES_OFFER_BY_PERSONA = {
  parent:     [{ line: 'במפגש הראשון את כבר תראי איך הוא מתחבר — הורים בדרך כלל יודעים תוך רבע שעה', note: 'מוריד סיכון להורה' }],
  beginner:   [{ line: 'בלי התחייבות ובלי מבחני קבלה — באים, מרגישים, מחליטים', note: 'מפרק את חסם הכניסה' }],
  busy:       [{ line: 'המפגש קצר וממוקד — תצא ממנו עם תוכנית שמתאימה ללוח הזמנים שלך', note: 'ערך מיידי גם לעסוקים' }],
  confidence: [{ line: 'את באה למפגש אחד, בקצב שלך, בלי שום לחץ — רק להרגיש את המקום', note: 'ביטחון ובטיחות רגשית' }],
  status:     [{ line: 'תבוא תנסה — דברים שנראים פשוטים מהצד מרגישים אחרת לגמרי כשעושים אותם', note: 'אתגר עדין — עובד מצוין על הפרסונה הזו' }],
};
const SALES_CLOSING = [
  { line: 'יש לי מקום ביום שלישי בערב או חמישי בבוקר — מה יותר נוח לך?',
    note: 'לא לשאול אם — לשאול מתי. שתי התשובות הן כן' },
  { line: 'מעולה, שלחתי לך עכשיו הודעה עם כל הפרטים — תשמור את המספר שלי, אני זמינה לכל שאלה',
    note: 'לסגור תאריך בתוך השיחה. ליד שסוגר תאריך מגיע' },
  { line: 'ושאלה אחרונה — מי עוד אתה מכיר שזה יכול להתאים לו? חבר של הילד, שכן, מישהו מהעבודה?',
    note: 'לשאול רק אחרי סגירה — לקוח שאמר כן עכשיו הוא הכי נדיב' },
];
// Per-step phrases, split so each step shows ONLY its own (no
// repetition). Content is moved by reference from the arrays above —
// not rewritten. Persona picker stays in step 3; chosen-persona phrases
// auto-show in steps 3 and 8.
export const SALES_SUPPORT_BY_STEP = {
  1: { general: [SALES_OPENING[0]] },                                        // "היי, אני מתקשר/ת..."
  2: { general: [SALES_OPENING[1]] },                                        // "בשביל עצמך או מישהו אחר?"
  3: { general: [SALES_NEED_GENERAL[0]], byPersona: SALES_NEED_BY_PERSONA }, // "מה גרם לך..." + persona
  4: { general: [SALES_NEED_GENERAL[1], SALES_NEED_GENERAL[2]] },            // "מה היית רוצה שיקרה" + family
  5: { general: [SALES_VALUE_GENERAL[0], SALES_VALUE_GENERAL[1]] },          // two brand-differentiation lines
  6: { general: [SALES_VALUE_GENERAL[2]] },                                  // confirmation question
  8: { general: SALES_OFFER_GENERAL, byPersona: SALES_OFFER_BY_PERSONA },
  9: { general: SALES_CLOSING },
};

// Card colour language: stamp a `type` onto every phrase in
// SALES_SUPPORT_BY_STEP. 'confirm' = a yes-gathering question; 'guide' =
// instruction-only (no quoted line); 'speak' = everything else.
const CONFIRM_MARKERS = [
  'נשמע לך כמו כיוון שמתאים למה שתיארת לי?',
  'איך זה נשמע לך עד עכשיו?',
  'תפסתי אותך בזמן טוב לשתי דקות?',
];
function classifyPhraseType(p) {
  if (!p || !p.line || !String(p.line).trim()) return 'guide';
  if (CONFIRM_MARKERS.some((m) => p.line.includes(m))) return 'confirm';
  return 'speak';
}
for (const cfg of Object.values(SALES_SUPPORT_BY_STEP)) {
  for (const p of (cfg.general || [])) p.type = classifyPhraseType(p);
  if (cfg.byPersona) {
    for (const arr of Object.values(cfg.byPersona)) {
      for (const p of arr) p.type = classifyPhraseType(p);
    }
  }
}

export const LEAD_PERSONAS = [
  { key: 'parent',     label: 'הורה' },
  { key: 'beginner',   label: 'מתחיל' },
  { key: 'busy',       label: 'עסוק' },
  { key: 'confidence', label: 'ביטחון' },
  { key: 'status',     label: 'סטטוס' },
];
// Prescription-step recommended tracks (offer step). Value stored on
// leads.recommended_track.
export const PRESCRIPTION_TRACKS = [
  { key: 'קבוצת ילדים', label: 'קבוצת ילדים' },
  { key: 'תנועה בכיף',  label: 'תנועה בכיף' },
  { key: 'אימון אישי',  label: 'אימון אישי' },
  { key: 'מפגש היכרות', label: 'מפגש היכרות' },
];
// Always-visible instruction at the top of the objection panel.
export const OBJECTION_PREAMBLE = 'לפני שעונים על התנגדות — לשאול: למה אתה מתכוון בדיוק? הרבה פעמים הליד מפרק אותה בעצמו';

// lead_status_detail → lead.status (drives the converted income sync).
export function statusForDetail(detail) {
  if (!detail) return undefined;
  if (detail.startsWith('closed')) return 'converted';
  if (detail === 'refused') return 'lost';
  if (detail === 'thinking') return 'negotiating';
  return undefined;
}

// Which closed_* detail a ladder+selection produces.
export function closedDetailForLadder(ladder, form = {}) {
  if (ladder === 'breakthrough') return 'closed_breakthrough';
  if (ladder === '3month') return 'closed_3month';
  if (ladder === 'advanced') return (form.equipment || []).length ? 'closed_equipment' : 'closed_coaching';
  return 'closed_breakthrough';
}

// Default human product name for the closing summary.
export function productNameForLadder(ladder, form = {}) {
  if (ladder === 'breakthrough') return form.family_deal ? 'חבילה משפחתית — 7 ימים' : 'מוצר פריצה — 7 ימים';
  if (ladder === '3month') return 'תוכנית 3 חודשים';
  if (ladder === 'advanced') {
    const eq = (form.equipment || []).map((k) => (LADDER_EQUIPMENT.find((e) => e.key === k) || {}).label).filter(Boolean);
    const parts = [...eq];
    if (form.course) parts.push(`קורס ${form.course}`);
    return parts.length ? parts.join(' + ') : 'ליווי מתקדם';
  }
  return 'מוצר אתלטיגו';
}

// close_result → lead status, so the kanban/summary + the converted
// income sync in lifeos-api keep working.
export function statusForCloseResult(cr) {
  switch (cr) {
    case 'closed_now':
    case 'closed_today':
    case 'took_breakthrough': return 'converted';
    case 'needs_followup':    return 'negotiating';
    case 'not_now':           return 'contacted';
    default:                  return undefined;
  }
}

// ─────────────────────────────────────────────────────────────────
// Content calendar
// ─────────────────────────────────────────────────────────────────

export const CONTENT_TYPES = [
  { key: 'reel',      label: 'ריל',      emoji: '🎬' },
  { key: 'story',     label: 'סטורי',    emoji: '⚡' },
  { key: 'post',      label: 'פוסט',     emoji: '📷' },
  { key: 'carousel',  label: 'קרוסלה',   emoji: '🖼️' },
  { key: 'live',      label: 'שידור חי', emoji: '🔴' },
  { key: 'youtube',   label: 'יוטיוב',   emoji: '📺' },
  { key: 'tiktok',    label: 'טיקטוק',   emoji: '🎵' },
];

export const CONTENT_STATUS = [
  { key: 'idea',      label: 'רעיון',    color: '#9ca3af' },
  { key: 'scripted',  label: 'תסריט',    color: '#6b7280' },
  { key: 'filmed',    label: 'צולם',     color: '#3B82F6' },
  { key: 'edited',    label: 'נערך',     color: '#EAB308' },
  { key: 'scheduled', label: 'מתוזמן',   color: '#FF6F20' },
  { key: 'published', label: 'פורסם',    color: '#16a34a' },
];

export const CONTENT_SKILL_TAGS = [
  { key: 'jump_rope',    label: 'קפיצה בחבל' },
  { key: 'calisthenics', label: 'קליסטניקס' },
  { key: 'rings',        label: 'טבעות' },
  { key: 'handstand',    label: 'עמידת ידיים' },
  { key: 'muscle_up',    label: 'Muscle Up' },
  { key: 'flexibility',  label: 'גמישות' },
  { key: 'strength',     label: 'כוח' },
];

// ─────────────────────────────────────────────────────────────────
// Courses
// ─────────────────────────────────────────────────────────────────

export const COURSE_STATUS = [
  { key: 'planned',   label: 'מתוכנן',  color: '#9ca3af' },
  { key: 'outlining', label: 'מתווה',   color: '#6b7280' },
  { key: 'recording', label: 'בהקלטה',  color: '#3B82F6' },
  { key: 'editing',   label: 'בעריכה',  color: '#EAB308' },
  { key: 'ready',     label: 'מוכן',    color: '#FF6F20' },
  { key: 'launched',  label: 'הושק',    color: '#16a34a' },
];

export const COURSE_SKILL_CATEGORY = [
  { key: 'jump_rope',    label: 'קפיצה בחבל' },
  { key: 'calisthenics', label: 'קליסטניקס' },
  { key: 'rings',        label: 'טבעות' },
  { key: 'strength',     label: 'כוח' },
  { key: 'flexibility',  label: 'גמישות' },
];
