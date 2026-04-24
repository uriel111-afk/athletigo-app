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
