// ============================================================
// AthletiGo — Single source of truth for all enum layers.
// If you add/change a status anywhere, do it HERE first.
// Never hardcode Hebrew or English enum strings in other files.
// ============================================================

// LAYER 1 — Package status (client_services.status)
export const PACKAGE_STATUS = {
  active:    { label: 'פעיל',      color: '#16a34a' },
  unpaid:    { label: 'לא שולם',   color: '#dc2626' },
  paused:    { label: 'מושהה',      color: '#eab308' },
  frozen:    { label: 'מוקפא',      color: '#0ea5e9' },
  expired:   { label: 'פג תוקף',   color: '#6b7280' },
  cancelled: { label: 'בוטל',       color: '#6b7280' },
  completed: { label: 'הסתיים',    color: '#6b7280' },
};
export const PACKAGE_STATUS_KEYS = Object.keys(PACKAGE_STATUS);
export const isActivePackage = (status) => status === 'active';
export const canDeductFrom = (status) => status === 'active' || status === 'unpaid';

// LAYER 2 — Service type (client_services.service_type)
export const SERVICE_TYPE = {
  personal: { label: 'אישי',     icon: '👤' },
  online:   { label: 'אונליין',   icon: '💻' },
  group:    { label: 'קבוצתי',    icon: '👥' },
};
export const SERVICE_TYPE_KEYS = Object.keys(SERVICE_TYPE);

// LAYER 3 — Client status (derived, shown in AllUsers filter)
export const CLIENT_STATUS = {
  all:      { label: 'כל המשתמשים' },
  active:   { label: 'פעיל' },
  inactive: { label: 'לא פעיל' },
  casual:   { label: 'מזדמן' },
};
export const CLIENT_STATUS_KEYS = Object.keys(CLIENT_STATUS);

// LAYER 4 — Session status (sessions.status — personal/online)
export const SESSION_STATUS = {
  scheduled:  { label: 'מתוכנן',         color: '#3b82f6' },
  confirmed:  { label: 'מאושר',          color: '#3b82f6' },
  completed:  { label: 'הושלם',          color: '#16a34a' },
  cancelled:  { label: 'בוטל',           color: '#6b7280' },
  pending:    { label: 'ממתין לאישור',    color: '#eab308' },
};
export const SESSION_STATUS_KEYS = Object.keys(SESSION_STATUS);

// LAYER 5 — Participant attendance status (sessions.participants[].attendance_status)
export const ATTENDANCE_STATUS = {
  present:   { label: 'הגיע',     color: '#16a34a', countsTowardQuota: true  },
  late:      { label: 'איחר',     color: '#eab308', countsTowardQuota: true  },
  absent:    { label: 'לא הגיע',  color: '#dc2626', countsTowardQuota: false },
  cancelled: { label: 'בוטל',     color: '#6b7280', countsTowardQuota: false },
  pending:   { label: 'ממתין',    color: '#9ca3af', countsTowardQuota: false },
};
export const ATTENDANCE_STATUS_KEYS = Object.keys(ATTENDANCE_STATUS);
export const countsAsAttendance = (status) =>
  ATTENDANCE_STATUS[status]?.countsTowardQuota === true;

// LAYER 6 — Account status (users.account_status / client_type)
export const ACCOUNT_STATUS = {
  active:   { label: 'משתמש פעיל' },
  inactive: { label: 'לא פעיל' },
  casual:   { label: 'מזדמן' },
};

// ============================================================
// Helpers
// ============================================================
export const labelOf = (enumMap, key) => enumMap[key]?.label ?? key;
export const colorOf = (enumMap, key) => enumMap[key]?.color ?? '#6b7280';

// Legacy Hebrew → English mapping for backwards compatibility
export const LEGACY_STATUS_MAP = {
  'פעיל': 'active',
  'לא שולם': 'unpaid',
  'מושהה': 'paused',
  'מוקפא': 'frozen',
  'פג תוקף': 'expired',
  'בוטל': 'cancelled',
  'הסתיים': 'completed',
  'אישי': 'personal',
  'אונליין': 'online',
  'קבוצתי': 'group',
  'הגיע': 'present',
  'איחר': 'late',
  'לא הגיע': 'absent',
  'ממתין': 'pending',
  'מתוכנן': 'scheduled',
  'הושלם': 'completed',
  'התקיים': 'completed',
  'מאושר': 'confirmed',
  'ממתין לאישור': 'pending',
};

export function normalizeStatus(hebrewOrEnglish) {
  if (!hebrewOrEnglish) return hebrewOrEnglish;
  return LEGACY_STATUS_MAP[hebrewOrEnglish] || hebrewOrEnglish;
}
