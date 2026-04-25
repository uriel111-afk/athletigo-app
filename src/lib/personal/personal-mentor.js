// ═══════════════════════════════════════════════════════════════════
// Personal Mentor — rules-based daily insight
// ═══════════════════════════════════════════════════════════════════

import { listCheckins, listContacts, listHabitLogs } from './personal-api';
import { supabase } from '@/lib/supabaseClient';

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

// ─── Weekly insights ────────────────────────────────────────────
//
// Same shape as getPersonalInsight but driven by week-level state
// (best/worst day, transferred tasks, training cadence). Returns
// the first matching rule so the mentor card can show one focused
// nudge. Used by /personal/week (WeeklySummary) and the dashboard.
export async function getWeeklyInsight(userId) {
  if (!userId) return null;
  const now = new Date();
  const dow = now.getDay();
  const today = now.toISOString().slice(0, 10);

  // Window: this week (Sun..Sat)
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekStartISO = weekStart.toISOString().slice(0, 10);

  // Next week's start (used to detect an empty plan)
  const nextWeekStart = new Date(weekStart);
  nextWeekStart.setDate(nextWeekStart.getDate() + 7);
  const nextWeekISO = nextWeekStart.toISOString().slice(0, 10);

  // Pull all week-level data in parallel.
  const safe = async (fn, fallback) => { try { return await fn(); } catch { return fallback; } };
  const [
    weekCheckins, weekTasks, weekTraining, nextPlan,
  ] = await Promise.all([
    safe(async () => (await supabase.from('personal_checkin')
      .select('*').eq('user_id', userId).gte('date', weekStartISO).lte('date', today)).data || [], []),
    safe(async () => (await supabase.from('life_os_tasks')
      .select('id, status, transferred_from, due_date')
      .eq('user_id', userId).gte('due_date', weekStartISO).lte('due_date', today)).data || [], []),
    safe(async () => (await supabase.from('personal_training_log')
      .select('id, date').eq('user_id', userId).gte('date', weekStartISO).lte('date', today)).data || [], []),
    safe(async () => (await supabase.from('personal_weekly_plan')
      .select('id').eq('user_id', userId).eq('week_start', nextWeekISO).limit(1)).data || [], []),
  ]);

  // ── Rule 1: Friday/Saturday with no plan for next week ──────────
  if ((dow === 5 || dow === 6) && nextPlan.length === 0) {
    return {
      text: 'מחר שבת — הזמן המושלם לתכנן את השבוע הבא. 5 דקות עכשיו יחסכו לך שעות.',
      action: 'תכנן את השבוע',
      href: '/personal/week',
    };
  }

  // ── Rule 2: too many transferred tasks ──────────────────────────
  const transferred = weekTasks.filter(t => t.transferred_from).length;
  if (transferred > 3) {
    return {
      text: `אוריאל, העברת ${transferred} משימות השבוע. אולי אתה מתכנן יותר מדי? תתמקד ב-3 דברים ליום.`,
      action: 'משימות',
      href: '/personal/week',
    };
  }

  // ── Rules 3 & 4: best/worst day score (only meaningful from Wed+) ─
  if (weekCheckins.length >= 3) {
    const scored = weekCheckins.filter(c => Number(c.daily_score || 0) > 0);
    if (scored.length >= 3) {
      const best = scored.reduce((a, b) => (b.daily_score > a.daily_score ? b : a), scored[0]);
      const worst = scored.reduce((a, b) => (b.daily_score < a.daily_score ? b : a), scored[0]);
      if (best.daily_score > 80) {
        const dayName = heDayName(new Date(best.date).getDay());
        return {
          text: `יום ${dayName} היה מטורף! ציון ${best.daily_score}. מה עשית אחרת? תעשה את זה שוב.`,
          action: 'בית', href: '/personal',
        };
      }
      if (worst.daily_score < 30) {
        const dayName = heDayName(new Date(worst.date).getDay());
        return {
          text: `יום ${dayName} היה קשה (ציון ${worst.daily_score}). זה בסדר. השאלה היא מה תעשה מחר.`,
          action: 'תכנן', href: '/personal/week',
        };
      }
    }
  }

  // ── Rule 5: no cooking this week (Thu+ only — early week is noise) ─
  if (dow >= 4) {
    const cookedDays = weekCheckins.filter(c => c.cooked).length;
    if (cookedDays === 0) {
      return {
        text: 'שבוע בלי בישול. בוא נתכנן 2 ארוחות להכנה השבוע.',
        action: 'משק בית', href: '/personal/home',
      };
    }
  }

  // ── Rule 6: low training cadence (Thu+) ────────────────────────
  if (dow >= 4) {
    const uniqueTrainingDays = new Set(weekTraining.map(t => t.date)).size;
    if (uniqueTrainingDays < 4) {
      return {
        text: `רק ${uniqueTrainingDays} אימונים השבוע. היעד שלך: כל יום. גם 20 דקות עושים הבדל.`,
        action: 'אימון', href: '/personal/growth',
      };
    }
  }

  return null;
}

function heDayName(dow) {
  const names = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  return names[dow] || '';
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
