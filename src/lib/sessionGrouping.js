// Group sessions into time buckets for the coach's redesigned
// Sessions page. Buckets are ordered top-to-bottom in the UI:
// today → tomorrow → thisWeek → future → past. Past stays
// collapsed by default in the page; this helper just sorts into
// the right slot. Each bucket sorts ascending by date+time.

const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const compareSessions = (a, b) => {
  const da = String(a.date || '');
  const db = String(b.date || '');
  if (da !== db) return da.localeCompare(db);
  return String(a.time || '').localeCompare(String(b.time || ''));
};

export function groupSessionsByTime(sessions, now = new Date()) {
  const today = startOfDay(now);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfterWeek = new Date(today); dayAfterWeek.setDate(dayAfterWeek.getDate() + 8);

  const buckets = { today: [], tomorrow: [], thisWeek: [], future: [], past: [] };

  for (const s of sessions || []) {
    if (!s?.date) {
      buckets.future.push(s);
      continue;
    }
    const sDate = startOfDay(s.date);
    if (Number.isNaN(sDate.getTime())) {
      buckets.future.push(s);
      continue;
    }
    if (sDate < today) buckets.past.push(s);
    else if (sDate.getTime() === today.getTime()) buckets.today.push(s);
    else if (sDate.getTime() === tomorrow.getTime()) buckets.tomorrow.push(s);
    else if (sDate < dayAfterWeek) buckets.thisWeek.push(s);
    else buckets.future.push(s);
  }

  buckets.today.sort(compareSessions);
  buckets.tomorrow.sort(compareSessions);
  buckets.thisWeek.sort(compareSessions);
  buckets.future.sort(compareSessions);
  // Past sorts newest-first (most-recent at top of expanded list).
  buckets.past.sort((a, b) => compareSessions(b, a));

  return buckets;
}

export const BUCKET_LABELS = {
  today:    'היום',
  tomorrow: 'מחר',
  thisWeek: 'השבוע',
  future:   'בעתיד',
  past:     'עברו',
};

export const STATUS_BADGES = {
  // Hebrew first (canonical), English aliases below.
  'ממתין':         { label: 'ממתין',  bg: '#FEF3C7', color: '#92400E' },
  'ממתין לאישור':  { label: 'ממתין',  bg: '#FEF3C7', color: '#92400E' },
  'pending':       { label: 'ממתין',  bg: '#FEF3C7', color: '#92400E' },
  'scheduled':     { label: 'ממתין',  bg: '#FEF3C7', color: '#92400E' },
  'מתוכנן':        { label: 'ממתין',  bg: '#FEF3C7', color: '#92400E' },
  'מאושר':         { label: 'מאושר',  bg: '#DBEAFE', color: '#1E40AF' },
  'confirmed':     { label: 'מאושר',  bg: '#DBEAFE', color: '#1E40AF' },
  'הושלם':         { label: 'הושלם',  bg: '#D1FAE5', color: '#065F46' },
  'התקיים':        { label: 'הושלם',  bg: '#D1FAE5', color: '#065F46' },
  'completed':     { label: 'הושלם',  bg: '#D1FAE5', color: '#065F46' },
  'בוטל':          { label: 'בוטל',   bg: '#FEE2E2', color: '#991B1B' },
  'cancelled':     { label: 'בוטל',   bg: '#FEE2E2', color: '#991B1B' },
  'בוטל על ידי מאמן':  { label: 'בוטל', bg: '#FEE2E2', color: '#991B1B' },
  'בוטל על ידי מתאמן': { label: 'בוטל', bg: '#FEE2E2', color: '#991B1B' },
};

// Map a session's raw status to the chip-filter "family" so the
// status filter chips at the top of the page can match against
// any equivalent legacy value.
export const STATUS_FAMILIES = {
  pending:   ['ממתין', 'ממתין לאישור', 'pending', 'scheduled', 'מתוכנן'],
  confirmed: ['מאושר', 'confirmed'],
  completed: ['הושלם', 'התקיים', 'completed'],
  cancelled: ['בוטל', 'cancelled', 'בוטל על ידי מאמן', 'בוטל על ידי מתאמן'],
};

export function statusMatchesFilter(status, filterKey) {
  if (filterKey === 'all') return true;
  const family = STATUS_FAMILIES[filterKey];
  return Array.isArray(family) && family.includes(status);
}
