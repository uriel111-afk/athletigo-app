// ═══════════════════════════════════════════════════════════════════
// Daily score — derived from a check-in row
// ═══════════════════════════════════════════════════════════════════
// Components:
//   sleep ≥ 7h           : 20
//   trained today         : 20
//   nutrition score 4-5   : 20
//   learned today         : 15
//   meditated/wellness    : 10
//   house_cleaned         : 10
//   contacted_someone     : 5
// ═══════════════════════════════════════════════════════════════════

export function calculateDailyScore(checkin) {
  if (!checkin) return 0;
  let s = 0;
  if (Number(checkin.sleep_hours) >= 7) s += 20;
  if (checkin.trained) s += 20;
  if (Number(checkin.nutrition_score) >= 4) s += 20;
  if (checkin.learned) s += 15;
  if (checkin.meditated) s += 10;
  if (checkin.house_cleaned || checkin.house_organized) s += 10;
  if (checkin.contacted_someone) s += 5;
  return Math.min(100, s);
}

export function scoreColor(score) {
  if (score >= 71) return '#16a34a';
  if (score >= 41) return '#FF6F20';
  return '#dc2626';
}

// Personal streak: consecutive days where the check-in exists AND
// the user did at least 3 of the tracked health/growth actions
// (trained, nutrition>=4, learned, meditated, house_cleaned).
export function calculatePersonalStreak(checkins) {
  if (!Array.isArray(checkins)) return 0;
  const byDate = new Map(checkins.map(c => [c.date, c]));
  const dayKey = (d) => new Date(d).toISOString().slice(0, 10);

  const counts = (c) => {
    let n = 0;
    if (c.trained) n++;
    if (Number(c.nutrition_score) >= 4) n++;
    if (c.learned) n++;
    if (c.meditated) n++;
    if (c.house_cleaned || c.house_organized) n++;
    return n;
  };

  const cursor = new Date();
  let streak = 0;
  // Today only counts if it qualifies; otherwise start from yesterday.
  const todayRow = byDate.get(dayKey(cursor));
  if (todayRow && counts(todayRow) >= 3) {
    streak = 1;
    cursor.setDate(cursor.getDate() - 1);
  } else {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (true) {
    const k = dayKey(cursor);
    const row = byDate.get(k);
    if (!row || counts(row) < 3) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
