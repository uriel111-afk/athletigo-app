// Group sessions into time buckets for the coach's Sessions page.
// Returns an ORDERED array of bucket objects: [{ key, label, sessions }, ...].
// Buckets read top-to-bottom in the UI as:
//   • planned   — today and onward (next sessions surface first)
//   • thisWeek  — last 7 days (past)
//   • thisMonth — last 8 to 30 days (past)
//   • per-calendar-month — every older month, newest first, labelled
//                          "מאי 2025" / "אפריל 2025" etc.
// Empty buckets are dropped so the UI never renders a header with
// no rows under it. The coach's principle is that no session
// should ever vanish from the UI unless explicitly deleted, so
// there is no date cap and no rollup beyond month granularity.

const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ',   'אפריל',  'מאי',     'יוני',
  'יולי',  'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

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

// 'YYYY-MM' (1-indexed month) — sorts chronologically as plain strings.
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

const monthLabel = (key) => {
  const m = key.match(/^(\d{4})-(\d{2})$/);
  if (!m) return key;
  const year = m[1];
  const monthIdx = parseInt(m[2], 10) - 1;
  return `${HEBREW_MONTHS[monthIdx]} ${year}`;
};

export function groupSessionsByTime(sessions, now = new Date()) {
  const today = startOfDay(now);
  const sevenDaysAgo  = new Date(today); sevenDaysAgo.setDate(today.getDate() - 7);
  const thirtyDaysAgo = new Date(today); thirtyDaysAgo.setDate(today.getDate() - 30);

  const planned = [];
  const thisWeek = [];
  const thisMonth = [];
  const byMonth = new Map(); // monthKey → []

  for (const s of sessions || []) {
    if (!s?.date) { planned.push(s); continue; }
    const sDate = startOfDay(s.date);
    if (Number.isNaN(sDate.getTime())) { planned.push(s); continue; }

    if (sDate >= today) {
      planned.push(s);
    } else if (sDate >= sevenDaysAgo) {
      thisWeek.push(s);
    } else if (sDate >= thirtyDaysAgo) {
      thisMonth.push(s);
    } else {
      const k = monthKey(sDate);
      if (!byMonth.has(k)) byMonth.set(k, []);
      byMonth.get(k).push(s);
    }
  }

  // Planned: ascending so the next upcoming session reads first.
  planned.sort(compareSessions);
  // Past buckets: newest-first within each bucket.
  thisWeek.sort((a, b) => compareSessions(b, a));
  thisMonth.sort((a, b) => compareSessions(b, a));
  for (const list of byMonth.values()) list.sort((a, b) => compareSessions(b, a));

  // Month keys: newest month first.
  const monthKeysSorted = Array.from(byMonth.keys()).sort().reverse();

  const ordered = [
    { key: 'planned',   label: 'מפגשים מתוכננים', sessions: planned   },
    { key: 'thisWeek',  label: 'השבוע',           sessions: thisWeek  },
    { key: 'thisMonth', label: 'החודש',           sessions: thisMonth },
    ...monthKeysSorted.map(k => ({
      key: k,
      label: monthLabel(k),
      sessions: byMonth.get(k),
    })),
  ];

  return ordered.filter(g => g.sessions.length > 0);
}

// Kept for any caller that imports it. The new groupSessionsByTime
// bakes labels into the returned bucket objects, so Sessions.jsx no
// longer needs this map directly.
export const BUCKET_LABELS = {
  planned:   'מפגשים מתוכננים',
  thisWeek:  'השבוע',
  thisMonth: 'החודש',
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
