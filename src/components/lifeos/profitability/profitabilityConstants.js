// Profitability feature — design tokens + ALL user-facing Hebrew copy.
// Nothing in this folder may hard-code Hebrew text; it all lives here.

export const BRAND = {
  orange: '#FF6F20',
  cream: '#FBF3EA',
  card: '#FFFFFF',
  border: '#F0E4D0',
  selected: '#FFF0E4',
  textPrimary: '#1a1a1a',
  textSecondary: '#888',
  success: '#16a34a',
  purple: '#7F47B5',
};

export const CARD_SHADOW =
  '4px 4px 10px rgba(200,180,150,0.4), -4px -4px 10px rgba(255,255,255,0.9)';

// Segment / accent colors for the category bar, cycled by index.
export const CATEGORY_COLORS = [
  '#FF6F20',
  '#7F47B5',
  '#1ABC9C',
  '#3498DB',
  '#E67E22',
  '#E91E63',
  '#F39C12',
  '#00BCD4',
];

export const DEFAULT_FACTORS = {
  occupancy: 100,
  collection: 100,
  expenses: 0,
};

// ── Wizard ────────────────────────────────────────────────────────────
export const WIZARD_STEP_TITLES = [
  'בחירת קהלים',
  'בחירת שירותים',
  'מחירים וכמויות',
  'מקדמי מציאות',
  'סיכום',
];

export const AUDIENCE_OPTIONS = [
  'ילדים',
  'נוער',
  'מבוגרים',
  'גיל הזהב',
  'עיר או רשות',
  'בתי ספר',
];

// `lineType` maps onto the EXISTING calculator row types
// ("sub" / "card" / "single") — no new enum values are introduced.
export const SERVICE_OPTIONS = [
  { label: 'מנוי חודשי', lineType: 'sub' },
  { label: 'כרטיסייה', lineType: 'card' },
  { label: 'מפגש בודד', lineType: 'single' },
  { label: 'סדנה', lineType: 'single' },
  { label: 'קורס דיגיטלי', lineType: 'single' },
  { label: 'מוצר', lineType: 'single' },
];

// ── Tabs ──────────────────────────────────────────────────────────────
export const TAB_LABELS = {
  svc: 'שירותים',
  prod: 'מוצרים',
  course: 'קורסים',
};

// Per-product cost fields. `key` and `flag` are EXISTING field names inside
// the stored `prods[]` entries — nothing here is new or renamed.
export const PRODUCT_COST_FIELDS = [
  { key: 'c', label: 'עלות יחידה', suffix: '₪' },
  { key: 'ship', label: 'משלוח ליחידה', suffix: '₪', flag: 'hasShip' },
  { key: 'agentPct', label: 'עמלת סוכן', suffix: '%', flag: 'hasAgent' },
  { key: 'warehouse', label: 'מחסן לחודש', suffix: '₪', flag: 'hasWarehouse' },
  { key: 'processingPct', label: 'סליקה', suffix: '%', flag: 'hasProcessing' },
];

// ── Factors ───────────────────────────────────────────────────────────
export const FACTOR_LABELS = {
  occupancy: 'תפוסה',
  collection: 'גבייה',
  expenses: 'הוצאות',
  net: 'רווח נקי',
};

// ── Everything else the user reads ────────────────────────────────────
export const COPY = {
  currency: '₪',
  percent: '%',
  perMonth: 'לחודש',
  perYear: 'לשנה',
  gross: 'הכנסה גולמית',

  categoriesTitle: 'קטגוריות',
  addCategory: 'קטגוריה',
  addRow: 'שורת הכנסה חדשה',
  categoryNamePlaceholder: 'שם הקטגוריה',
  rowNamePlaceholder: 'שם השורה',
  newCategoryName: 'קטגוריה חדשה',
  newRowName: 'שורה חדשה',
  copySuffix: '(עותק)',

  duplicate: 'שכפול',
  delete: 'מחיקה',
  menu: 'תפריט',
  collapseBar: 'הסתר פירוט',
  expandBar: 'הצג פירוט',

  quantity: 'כמות',
  price: 'מחיר',
  noRows: 'אין עדיין שורות',
  costs: 'עלויות',
  hideCosts: 'הסתר עלויות',

  rankingTitle: 'דירוג שורות הכנסה',
  totalsRowLabel: 'סיכום לפי לשונית',

  emptyTitle: 'עוד אין תרחיש רווחיות',
  emptyBody: 'נבנה אותו יחד בחמישה צעדים קצרים',
  emptyCta: 'בניית תרחיש',
  newScenario: 'תרחיש חדש',
  replaceConfirm: 'בניית תרחיש חדש תחליף את הקטגוריות הקיימות. להמשיך?',

  wizardBack: 'חזרה',
  wizardNext: 'המשך',
  wizardSave: 'שמירה',
  wizardCancel: 'ביטול',
  wizardStepOf: 'צעד',

  step1Hint: 'למי אתה נותן שירות',
  step2Hint: 'אילו שירותים לכל קהל',
  step3Hint: 'כמה לקוחות ובאיזה מחיר',
  step4Hint: 'כמה מהתכנון באמת מתממש',
  step5Hint: 'זה התרחיש שייווצר',
  summaryTitle: 'סיכום התרחיש',
};
