// ═══════════════════════════════════════════════════════════════════
// Personal Mentor — rules-based daily insight
// ═══════════════════════════════════════════════════════════════════

import { listCheckins, listContacts, listHabitLogs } from './personal-api';

const daysBetween = (a, b) => Math.floor((a.getTime() - b.getTime()) / 86_400_000);

export async function getPersonalInsight(userId) {
  const since = new Date(); since.setDate(since.getDate() - 14);
  const sinceISO = since.toISOString().slice(0, 10);
  const [checkins, contacts] = await Promise.all([
    listCheckins(userId, { sinceDate: sinceISO }).catch(() => []),
    listContacts(userId).catch(() => []),
  ]);

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const todayRow = checkins.find(c => c.date === today);

  const last3 = checkins.slice(0, 3);
  const last7 = checkins.slice(0, 7);

  // ── Rules, ordered by priority ──────────────────────────────────

  // Sleep: 3 days under 7h
  const sleepUnder7 = last3.length >= 3 && last3.every(c => Number(c.sleep_hours || 0) > 0 && Number(c.sleep_hours) < 7);
  if (sleepUnder7) return {
    text: 'אוריאל, 3 ימים רצופים עם פחות מ-7 שעות שינה. השינה היא הבסיס של הכל. הלילה — מסכים כבויים ב-22:00.',
    action: 'בית',
    href: '/personal',
  };

  // Untrained today, evening
  if ((!todayRow || !todayRow.trained) && now.getHours() >= 18) return {
    text: 'היום עוד לא התאמנת. גם 20 דקות עושים את ההבדל. תזוז עכשיו.',
    action: 'תיעוד אימון',
    href: '/personal/growth',
  };

  // Contact gone cold
  const stale = contacts
    .map(c => {
      const ref = c.last_contact_date ? new Date(c.last_contact_date) : null;
      if (!ref) return null;
      return { name: c.name, days: daysBetween(now, ref) };
    })
    .filter(x => x && x.days > 7)
    .sort((a, b) => b.days - a.days);
  if (stale[0]) return {
    text: `לא דיברת עם ${stale[0].name} כבר ${stale[0].days} ימים. תתקשר. 5 דקות.`,
    action: 'אנשים',
    href: '/personal/people',
  };

  // House neglected 3+ days
  const houseRows = last3.filter(c => c.house_cleaned || c.house_organized);
  if (last3.length >= 3 && houseRows.length === 0) return {
    text: 'הבית לא סודר 3 ימים. 15 דקות = בית אחר. שעון עוצר. עכשיו.',
    action: 'משק בית',
    href: '/personal/home',
  };

  // No learning 3+ days
  const learnedRows = last3.filter(c => c.learned);
  if (last3.length >= 3 && learnedRows.length === 0) return {
    text: '3 ימים בלי למידה. 30 דקות של AI tutorial = השקעה בעתיד שלך.',
    action: 'התפתחות',
    href: '/personal/growth',
  };

  // No cooking 5+ days
  const cookedRows = last7.slice(0, 5).filter(c => c.cooked);
  if (last7.length >= 5 && cookedRows.length === 0) return {
    text: 'שבוע בלי בישול. בוא נתכנן 2 ארוחות להכנה מחר.',
    action: 'משק בית',
    href: '/personal/home',
  };

  // Mood low last 7 days
  const moods = last7.map(c => Number(c.mood || 0)).filter(m => m > 0);
  const moodAvg = moods.length ? moods.reduce((s, m) => s + m, 0) / moods.length : 0;
  if (moods.length >= 5 && moodAvg < 3) return {
    text: 'השבוע היה קשה. זה בסדר. מה הדבר הכי קטן שיעשה לך טוב עכשיו?',
    action: 'צ׳ק-אין',
    href: '/personal',
  };

  // Strong streak — celebrate
  const fullDays = last7.filter(c => c.trained && c.learned);
  if (fullDays.length >= 7) return {
    text: 'שבוע שלם של עקביות! אתה בונה חיים. תמשיך.',
    action: 'בית',
    href: '/personal',
  };

  return {
    text: 'כל יום שאתה פועל הוא יום שאתה מתקדם. מה הצעד הבא?',
    action: null, href: '/personal',
  };
}

// Habit correlation insight — finds the habit most correlated with
// daily score. Used by the Habits screen.
export async function findHabitInsight(userId) {
  const since = new Date(); since.setDate(since.getDate() - 30);
  const sinceISO = since.toISOString().slice(0, 10);
  const checkins = await listCheckins(userId, { sinceDate: sinceISO }).catch(() => []);
  if (checkins.length < 7) return null;

  const sleepDays = checkins.filter(c => Number(c.sleep_hours) >= 7);
  const restDays  = checkins.filter(c => Number(c.sleep_hours) > 0 && Number(c.sleep_hours) < 7);
  if (sleepDays.length >= 3 && restDays.length >= 3) {
    const avgSleep = sleepDays.reduce((s, c) => s + (c.daily_score || 0), 0) / sleepDays.length;
    const avgRest  = restDays.reduce((s, c) => s + (c.daily_score || 0), 0) / restDays.length;
    if (avgSleep > 0 && avgRest > 0) {
      const lift = Math.round(((avgSleep - avgRest) / avgRest) * 100);
      if (lift > 10) return `אוריאל, בימים שאתה ישן 7+ שעות, הציון היומי שלך גבוה ב-${lift}%. שינה = הבסיס.`;
    }
  }
  return null;
}
