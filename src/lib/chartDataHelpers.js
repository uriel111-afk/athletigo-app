// Chart data helpers — smart aggregation for decades of data
// Use these in every chart component instead of raw records.

/**
 * Aggregate records by time range.
 * - 7d/30d: raw points
 * - 90d: weekly averages
 * - 1y: weekly averages
 * - all: monthly averages
 */
export function aggregateRecords(records, range = '30d') {
  if (!records || records.length === 0) return [];

  const now = new Date();
  const rangeMs = {
    '7d': 7 * 86400000,
    '30d': 30 * 86400000,
    '90d': 90 * 86400000,
    '1y': 365 * 86400000,
    'all': Infinity,
  };

  const cutoff = range === 'all'
    ? new Date(0)
    : new Date(now.getTime() - (rangeMs[range] || rangeMs['30d']));

  const filtered = records.filter(r => {
    const d = new Date(r.created_at || r.date || r.created_date);
    return d >= cutoff;
  });

  if (filtered.length === 0) return [];

  // Raw points for short ranges
  if (range === '7d' || range === '30d') {
    return filtered.map(r => ({
      date: formatShortDate(r.created_at || r.date || r.created_date),
      value: Number(r.value),
      raw: r,
    }));
  }

  // Weekly averages for 90d and 1y
  if (range === '90d' || range === '1y') {
    return bucketBy(filtered, 'week');
  }

  // Monthly averages for all-time
  return bucketBy(filtered, 'month');
}

function bucketBy(records, unit) {
  const buckets = {};

  records.forEach(r => {
    const d = new Date(r.created_at || r.date || r.created_date);
    let key;
    if (unit === 'week') {
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      key = weekStart.toISOString().slice(0, 10);
    } else {
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    }

    if (!buckets[key]) buckets[key] = { sum: 0, count: 0, max: -Infinity, min: Infinity };
    const val = Number(r.value);
    buckets[key].sum += val;
    buckets[key].count += 1;
    buckets[key].max = Math.max(buckets[key].max, val);
    buckets[key].min = Math.min(buckets[key].min, val);
  });

  return Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, b]) => ({
      date: formatShortDate(key),
      value: Math.round((b.sum / b.count) * 10) / 10,
      max: b.max,
      min: b.min,
      count: b.count,
    }));
}

/**
 * Format date to short display: "D.M"
 */
export function formatShortDate(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${d.getDate()}.${d.getMonth() + 1}`;
}

/**
 * Time range options for selector
 */
export const TIME_RANGES = [
  { key: '7d', label: '7 ימים' },
  { key: '30d', label: 'חודש' },
  { key: '90d', label: '3 חודשים' },
  { key: '1y', label: 'שנה' },
  { key: 'all', label: 'הכל' },
];

/**
 * Update all-time PB (call after every new record insert)
 */
export function checkAndUpdatePB(currentPBs, exerciseName, newValue, date) {
  const pbs = { ...(currentPBs || {}) };
  const existing = pbs[exerciseName];
  if (!existing || newValue > existing.value) {
    pbs[exerciseName] = { value: newValue, date };
    return { updated: true, pbs, isNewPB: true, previousBest: existing?.value || null };
  }
  return { updated: false, pbs, isNewPB: false };
}
