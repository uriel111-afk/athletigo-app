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
  { key: 'product_sale', label: 'מכירת מוצר' },
  { key: 'training',     label: 'אימון' },
  { key: 'course',       label: 'קורס' },
  { key: 'other',        label: 'אחר' },
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
  { key: 'digital_course',   label: 'קורס דיגיטלי',        price: 300,  inventory: null, emoji: '🎓' },
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
