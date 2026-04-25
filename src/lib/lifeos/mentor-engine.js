// ═══════════════════════════════════════════════════════════════════
// Mentor Engine — rules-based insights (no API calls)
// ═══════════════════════════════════════════════════════════════════
// Every call fetches recent data from Supabase and picks the single
// most urgent message to show on the dashboard hero card. Deliberately
// synchronous logic so it's fast and free.
// ═══════════════════════════════════════════════════════════════════

import { supabase } from '@/lib/supabaseClient';
import { getFeaturedMentorMessage } from './lifeos-api';

const daysBetween = (a, b) => Math.floor((a.getTime() - b.getTime()) / 86_400_000);
const todayISO = () => new Date().toISOString().slice(0, 10);
const monthStartISO = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

// Data shape returned by gatherSignals() — all counts/sums for the
// current month unless noted.
async function gatherSignals(userId) {
  const mStart = monthStartISO();
  const now = new Date();
  const [income, expenses, content, leads, tasks, courses] = await Promise.all([
    supabase.from('income').select('amount, source, date').eq('user_id', userId).gte('date', mStart),
    supabase.from('expenses').select('amount, date').eq('user_id', userId).gte('date', mStart),
    supabase.from('content_calendar').select('scheduled_date, status').eq('user_id', userId).order('scheduled_date', { ascending: false }).limit(30),
    supabase.from('leads').select('status, created_at').eq('coach_id', userId),
    supabase.from('life_os_tasks').select('status').eq('user_id', userId),
    supabase.from('courses').select('status').eq('user_id', userId),
  ]);

  const incomeRows = income.data || [];
  const expenseRows = expenses.data || [];
  const contentRows = content.data || [];
  const leadRows = leads.data || [];
  const taskRows = tasks.data || [];
  const courseRows = courses.data || [];

  const monthlyIncome = incomeRows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const monthlyExpenses = expenseRows.reduce((s, r) => s + Number(r.amount || 0), 0);

  const publishedDates = contentRows
    .filter(r => r.status === 'published' && r.scheduled_date)
    .map(r => new Date(r.scheduled_date));
  const lastPublished = publishedDates.length ? publishedDates.sort((a, b) => b - a)[0] : null;
  const daysSincePublish = lastPublished ? daysBetween(now, lastPublished) : 999;

  const newLeads = leadRows.filter(l => l.status === 'new').length;
  const tasksTotal = taskRows.length;
  const tasksDone = taskRows.filter(t => t.status === 'completed').length;
  const taskRatio = tasksTotal > 0 ? tasksDone / tasksTotal : 0;

  const launchedCourses = courseRows.filter(c => c.status === 'launched').length;
  const monthlyWorkshops = incomeRows.filter(r => r.source === 'workshop').length;
  const onlineCoachingClients = new Set(
    incomeRows.filter(r => r.source === 'online_coaching').map(r => r.client_name || r.id)
  ).size;

  const dayOfMonth = now.getDate();

  return {
    monthlyIncome, monthlyExpenses,
    daysSincePublish,
    newLeads,
    tasksTotal, tasksDone, taskRatio,
    launchedCourses, monthlyWorkshops, onlineCoachingClients,
    dayOfMonth,
  };
}

// Decide the single best mentor insight to show right now. Returns a
// message-shaped object compatible with MentorCard (message_type,
// content, action_label, priority) plus an optional `dynamic: true`
// flag so UI can tell seeded-from-DB messages apart from rule output.
export async function analyzeMentorInsight(userId) {
  const s = await gatherSignals(userId);

  const rules = [
    {
      when: s.monthlyIncome === 0 && s.dayOfMonth > 5,
      msg: {
        message_type: 'insight', priority: 'critical',
        content: 'אוריאל, עבר שבוע ולא נכנסה אגורה. היעד שלך הוא 833K/חודש. כל יום בלי מכירה מרחיק אותך. מה הפעולה הראשונה שתעשה עכשיו?',
        action_label: 'תראה לי לידים פתוחים',
      },
    },
    {
      when: s.newLeads > 0,
      msg: {
        message_type: 'pattern', priority: 'critical',
        content: `יש לך ${s.newLeads} לידים שמחכים לתשובה. כל ליד שלא עונים לו תוך 24 שעות — הסיכוי לסגור יורד ב-50%. תענה עכשיו.`,
        action_label: 'לענות ללידים',
      },
    },
    {
      when: s.onlineCoachingClients === 0,
      msg: {
        message_type: 'opportunity', priority: 'critical',
        content: 'ליווי אונליין = הכנסה חוזרת כל חודש בלי להיות פיזית עם הלקוח. תצור חבילת ליווי ותתחיל לשווק אותה. אפילו 5 לקוחות = בסיס יציב.',
        action_label: 'צור חבילת ליווי',
      },
    },
    {
      when: s.daysSincePublish > 2,
      msg: {
        message_type: 'pattern', priority: 'high',
        content: `לא פרסמת תוכן כבר ${s.daysSincePublish} ימים. בימים שאתה מפרסם — 40% יותר פניות. היום תצלם משהו. 60 שניות מספיקות.`,
        action_label: 'לוח תוכן',
      },
    },
    {
      when: s.monthlyExpenses > s.monthlyIncome && s.monthlyExpenses > 0,
      msg: {
        message_type: 'insight', priority: 'high',
        content: `ההוצאות שלך (${Math.round(s.monthlyExpenses).toLocaleString('he-IL')}₪) גבוהות מההכנסות (${Math.round(s.monthlyIncome).toLocaleString('he-IL')}₪). לפני שמרוויחים יותר, צריך לדעת לאן הכסף הולך. תבדוק את ההוצאות הקבועות.`,
        action_label: 'הוצאות קבועות',
      },
    },
    {
      when: s.launchedCourses === 0,
      msg: {
        message_type: 'opportunity', priority: 'high',
        content: 'אוריאל, עדיין אין קורס דיגיטלי אחד באוויר. זה המכפיל שלך. קורס אחד = הכנסה פסיבית חודשית. תתחיל מ-Basic Jump Rope — הוא הכי קל להפקה.',
        action_label: 'תוכנית עסקית',
      },
    },
    {
      when: s.monthlyWorkshops === 0 && s.dayOfMonth > 15,
      msg: {
        message_type: 'opportunity', priority: 'high',
        content: 'חצי חודש בלי סדנה. סדנה = חשיפה + הכנסה + לידים למוצרים. תתכנן סדנת עמידות ידיים או עליות כוח לשבועיים הקרובים.',
        action_label: 'תכנן סדנה',
      },
    },
    {
      when: s.taskRatio > 0.8 && s.tasksTotal >= 5,
      msg: {
        message_type: 'motivation', priority: 'medium',
        content: `אתה מוכן מחרה! ${Math.round(s.taskRatio * 100)}% מהמשימות הושלמו. קח אתגר ברמה הבאה.`,
        action_label: 'משימות ואתגרים',
      },
    },
  ];

  const hit = rules.find(r => r.when);
  if (hit) return { ...hit.msg, dynamic: true, id: `rule_${Date.now()}` };

  // Fallback: highest-priority unread seeded message.
  const seeded = await getFeaturedMentorMessage(userId);
  if (seeded) return seeded;

  // Last resort default.
  return {
    message_type: 'motivation', priority: 'low',
    content: 'אוריאל, כל יום שאתה פועל הוא יום שאתה מתקרב ליעד. מה הפעולה הראשונה שלך היום?',
    action_label: null,
    dynamic: true,
    id: 'default',
  };
}

// Routing map from action_label → screen path. Used by MentorCard to
// navigate when the user taps the action.
export const MENTOR_ACTION_ROUTES = {
  'תראה לי לידים פתוחים': '/lifeos/leads',
  'לענות ללידים':          '/lifeos/leads',
  'צור חבילת ליווי':       '/lifeos/plan',
  'לוח תוכן':               '/lifeos/content',
  'הוצאות קבועות':         '/lifeos/recurring',
  'תוכנית עסקית':          '/lifeos/plan',
  'תכנן סדנה':              '/lifeos/tasks',
  'משימות ואתגרים':        '/lifeos/tasks',
  'תכנן קמפיין Dream Machine': '/lifeos/plan',
  'אני מקבל את האתגר':      '/lifeos/tasks',
  'תן לי רעיון לסרטון':      '/lifeos/tasks',
  'תעזור לי להשיק קורס':    '/lifeos/plan',
  'בנה לי מערכת תוכן יומית': '/lifeos/tasks',
  'תעזור לי לבנות את הקורס': '/lifeos/plan',
  'למלא הוצאות קבועות':     '/lifeos/recurring',
  'תראה לי את המשפך':        '/lifeos/plan',
};
