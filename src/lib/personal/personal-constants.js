// ═══════════════════════════════════════════════════════════════════
// Personal app — shared constants
// ═══════════════════════════════════════════════════════════════════

export const PERSONAL_COLORS = {
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
  blue: '#3B82F6',
};

export const PERSONAL_CARD = {
  backgroundColor: PERSONAL_COLORS.cardBg,
  borderRadius: 14,
  border: `1px solid ${PERSONAL_COLORS.border}`,
  boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
  padding: 16,
};

// ─── Mood (1-5) ──────────────────────────────────────────────────
export const MOODS = [
  { value: 1, emoji: '😫', label: 'קשה' },
  { value: 2, emoji: '😕', label: 'לא משהו' },
  { value: 3, emoji: '😐', label: 'בסדר' },
  { value: 4, emoji: '🙂', label: 'טוב' },
  { value: 5, emoji: '😄', label: 'מעולה' },
];

// ─── Training types ──────────────────────────────────────────────
export const TRAINING_TYPES = [
  { key: 'strength',    label: 'כוח',         emoji: '💪' },
  { key: 'rope',        label: 'חבל',          emoji: '🪢' },
  { key: 'rings',       label: 'טבעות',        emoji: '⭕' },
  { key: 'flexibility', label: 'גמישות',       emoji: '🧘' },
  { key: 'cardio',      label: 'קרדיו',        emoji: '🏃' },
  { key: 'handstand',   label: 'עמידת ידיים', emoji: '🤸' },
  { key: 'muscle_up',   label: 'Muscle-Up',    emoji: '🏆' },
  { key: 'other',       label: 'אחר',          emoji: '⚡' },
];

// ─── Wellness actions in checkin ─────────────────────────────────
export const WELLNESS_ACTIONS = [
  { key: 'meditation', label: 'מדיטציה', emoji: '🧘' },
  { key: 'breathing',  label: 'נשימות',  emoji: '💨' },
  { key: 'nature',     label: 'טבע',     emoji: '🌳' },
  { key: 'none',       label: 'לא',      emoji: '⏭️' },
];

// ─── Habit categories ────────────────────────────────────────────
export const HABIT_CATEGORIES = [
  { key: 'health',   label: 'בריאות',   emoji: '💪', color: '#16a34a' },
  { key: 'growth',   label: 'התפתחות',  emoji: '🧠', color: '#3B82F6' },
  { key: 'wellness', label: 'רוגע',      emoji: '🧘', color: '#8B5CF6' },
  { key: 'business', label: 'עסקי',      emoji: '📸', color: '#FF6F20' },
  { key: 'social',   label: 'חברתי',     emoji: '💬', color: '#EAB308' },
  { key: 'home',     label: 'בית',       emoji: '🏠', color: '#06B6D4' },
  { key: 'general',  label: 'כללי',      emoji: '✅', color: '#9ca3af' },
];

export const HABIT_FREQUENCIES = [
  { key: 'daily',   label: 'יומי' },
  { key: 'weekly',  label: 'שבועי' },
  { key: '3_times', label: '3 פעמים בשבוע' },
];

// Suggested icons for new habit dialog
export const HABIT_ICON_PICKER = ['✅', '💪', '🏋️', '🪢', '🥗', '💧', '🧘', '🧠', '📚', '📸', '💬', '🏠', '🧹', '🚿', '🌅', '🌙', '⚡', '🔥', '❤️', '🎯'];

// ─── Contact categories ──────────────────────────────────────────
export const CONTACT_CATEGORIES = [
  { key: 'family',  label: 'משפחה',   emoji: '👨‍👩‍👦' },
  { key: 'friend',  label: 'חבר',     emoji: '👫' },
  { key: 'business',label: 'עסקי',    emoji: '💼' },
  { key: 'mentor',  label: 'מנטור',   emoji: '🧙' },
  { key: 'other',   label: 'אחר',     emoji: '👤' },
];

export const CONTACT_FREQUENCIES = [
  { key: 'weekly',     label: 'שבועי',     days: 7 },
  { key: 'biweekly',   label: 'דו-שבועי',  days: 14 },
  { key: 'monthly',    label: 'חודשי',     days: 30 },
  { key: 'quarterly',  label: 'רבעוני',    days: 90 },
];

export const INTERACTION_TYPES = [
  { key: 'call',     label: 'שיחה',  emoji: '📞' },
  { key: 'message',  label: 'הודעה', emoji: '💬' },
  { key: 'meet',     label: 'פגישה', emoji: '🤝' },
  { key: 'video',    label: 'וידאו', emoji: '📹' },
];

// ─── Goal categories ─────────────────────────────────────────────
export const GOAL_CATEGORIES = [
  { key: 'fitness',   label: 'כושר',     emoji: '🏋️', color: '#FF6F20' },
  { key: 'learning',  label: 'למידה',    emoji: '🧠', color: '#3B82F6' },
  { key: 'health',    label: 'בריאות',   emoji: '💪', color: '#16a34a' },
  { key: 'personal',  label: 'אישי',     emoji: '🌟', color: '#8B5CF6' },
];

// ─── Library ─────────────────────────────────────────────────────
export const LIBRARY_TYPES = [
  { key: 'book',     label: 'ספר',      emoji: '📚' },
  { key: 'course',   label: 'קורס',     emoji: '🎓' },
  { key: 'podcast',  label: 'פודקאסט',  emoji: '🎧' },
  { key: 'video',    label: 'וידאו',    emoji: '📺' },
];
export const LIBRARY_STATUS = [
  { key: 'want',     label: 'רוצה',     color: '#9ca3af' },
  { key: 'progress', label: 'בתהליך',   color: '#FF6F20' },
  { key: 'done',     label: 'סיימתי',   color: '#16a34a' },
];

// ─── Meals ───────────────────────────────────────────────────────
export const MEAL_TYPES = [
  { key: 'breakfast', label: 'בוקר',   emoji: '🌅' },
  { key: 'lunch',     label: 'צהריים', emoji: '☀️' },
  { key: 'dinner',    label: 'ערב',    emoji: '🌙' },
  { key: 'snack',     label: 'ביניים', emoji: '🍎' },
];

export const SHOPPING_CATEGORIES = [
  { key: 'produce',   label: 'ירקות ופירות', emoji: '🥬' },
  { key: 'protein',   label: 'חלבון',         emoji: '🍗' },
  { key: 'dairy',     label: 'חלב',           emoji: '🥛' },
  { key: 'pantry',    label: 'מזווה',         emoji: '🍝' },
  { key: 'frozen',    label: 'קפוא',          emoji: '❄️' },
  { key: 'cleaning',  label: 'ניקיון',         emoji: '🧹' },
  { key: 'general',   label: 'כללי',          emoji: '🛒' },
];

export const HOUSEHOLD_FREQUENCIES = [
  { key: 'daily',         label: 'יומי',          days: 1 },
  { key: 'every_2_days',  label: 'כל יומיים',     days: 2 },
  { key: 'every_3_days',  label: 'כל 3 ימים',     days: 3 },
  { key: 'twice_weekly',  label: 'פעמיים בשבוע',  days: 3 },
  { key: 'weekly',        label: 'שבועי',         days: 7 },
  { key: 'biweekly',      label: 'דו-שבועי',      days: 14 },
  { key: 'monthly',       label: 'חודשי',         days: 30 },
];

// Days of week — for meal planner. Sunday-first, Hebrew.
export const DAYS_OF_WEEK = [
  { idx: 0, label: 'ראשון' },
  { idx: 1, label: 'שני' },
  { idx: 2, label: 'שלישי' },
  { idx: 3, label: 'רביעי' },
  { idx: 4, label: 'חמישי' },
  { idx: 5, label: 'שישי' },
  { idx: 6, label: 'שבת' },
];
