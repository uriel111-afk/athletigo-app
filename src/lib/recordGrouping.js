// ============================================================
// Normalize an exercise name for folder-grouping purposes.
// 'Pull-up' / 'pull up' / 'Pull_Up' all collapse to 'pullup'.
// ============================================================
export function normalizeRecordName(name) {
  if (!name) return '';
  return String(name)
    .trim()
    .replace(/[\s\-_]+/g, '')
    .toLowerCase();
}

// ============================================================
// Group personal records by normalized name.
// Returns [{ key, displayName, records[], latestRecord, isFolder }]
// sorted by most-recent activity, newest first within each group.
// ============================================================
export function groupRecordsByName(records) {
  if (!records?.length) return [];

  const buckets = new Map();
  for (const rec of records) {
    const key = normalizeRecordName(rec.name);
    if (!buckets.has(key)) {
      buckets.set(key, {
        key,
        displayName: rec.name,
        records: [],
      });
    }
    buckets.get(key).records.push(rec);
  }

  for (const g of buckets.values()) {
    g.records.sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  const result = Array.from(buckets.values()).map(g => ({
    ...g,
    isFolder: g.records.length > 1,
    latestRecord: g.records[0],
  }));

  result.sort((a, b) => new Date(b.latestRecord.date) - new Date(a.latestRecord.date));
  return result;
}

// ============================================================
// Trend between the two most-recent records in a folder.
// Returns { direction: 'up'|'down'|'flat', delta } or null.
// ============================================================
export function computeTrend(records) {
  if (!records || records.length < 2) return null;
  const [latest, previous] = records;
  const diff = Number(latest.value) - Number(previous.value);
  if (diff === 0) return { direction: 'flat', delta: 0 };
  return {
    direction: diff > 0 ? 'up' : 'down',
    delta: Math.abs(diff),
  };
}
