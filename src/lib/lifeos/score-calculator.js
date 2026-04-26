// ═══════════════════════════════════════════════════════════════════
// Weekly Score Calculator — 0–100
// ═══════════════════════════════════════════════════════════════════
// Components (max): tasks 25 · content 20 · leads 15 · income 15 ·
// workshops/coaching 15 · streak bonus 10  → 100
// ═══════════════════════════════════════════════════════════════════

import { supabase } from '@/lib/supabaseClient';
import { calculateStreak } from './streak-calculator';

const rangeISO = (daysBack) => {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - daysBack);
  return {
    startDate: start.toISOString().slice(0, 10),
    startTS: start.toISOString(),
    endDate: end.toISOString().slice(0, 10),
  };
};

const clamp = (v, max) => Math.min(max, Math.max(0, v));

export async function calculateWeeklyScore(userId, daysBack = 7) {
  const { startDate, startTS } = rangeISO(daysBack);

  // Same fallback as notification-engine: last_contact_date may not
  // exist on the user's DB yet (20260425_extend_leads_schema.sql).
  const fetchLeads = async () => {
    const rich = await supabase.from('leads')
      .select('status, last_contact_date, created_at').eq('coach_id', userId);
    if (!rich.error) return rich;
    const legacy = await supabase.from('leads')
      .select('status, created_at').eq('coach_id', userId);
    return {
      ...legacy,
      data: (legacy.data || []).map(l => ({ ...l, last_contact_date: null })),
    };
  };

  const [tasks, content, leads, income, streakDays] = await Promise.all([
    supabase.from('life_os_tasks').select('status, completed_at').eq('user_id', userId),
    supabase.from('content_calendar').select('status, scheduled_date').eq('user_id', userId)
      .eq('status', 'published').gte('scheduled_date', startDate),
    fetchLeads(),
    supabase.from('income').select('amount, source, date').eq('user_id', userId).gte('date', startDate),
    calculateStreak(userId),
  ]);

  const taskRows = tasks.data || [];
  const contentRows = content.data || [];
  const leadRows = leads.data || [];
  const incomeRows = income.data || [];

  // Tasks: up to 25. Award 5 per completed task capped.
  const tasksCompleted = taskRows.filter(
    t => t.status === 'completed' && t.completed_at && t.completed_at >= startTS
  ).length;
  const taskPts = clamp(tasksCompleted * 5, 25);

  // Content: up to 20. 4 pts per published piece.
  const contentPts = clamp(contentRows.length * 4, 20);

  // Leads: up to 15. Count leads whose status moved past 'new' in the
  // window OR leads created in window (proxy for engagement).
  const leadsEngaged = leadRows.filter(l => {
    const created = l.created_at ? new Date(l.created_at).toISOString() : '';
    const touched = l.last_contact_date ? new Date(l.last_contact_date).toISOString() : '';
    return created >= startTS || (touched && touched >= startTS) || l.status === 'converted';
  }).length;
  const leadPts = clamp(leadsEngaged * 3, 15);

  // Income: up to 15. Every 500₪ of income = 1 pt (capped 15).
  const incomeSum = incomeRows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const incomePts = clamp(Math.floor(incomeSum / 500), 15);

  // Workshops/coaching: up to 15. Each workshop or coaching income row
  // in window = 5 pts.
  const highValueRows = incomeRows.filter(
    r => r.source === 'workshop' || r.source === 'online_coaching'
  ).length;
  const highValuePts = clamp(highValueRows * 5, 15);

  // Streak bonus: up to 10.
  const streakPts = clamp(Math.floor(streakDays), 10);

  const total = taskPts + contentPts + leadPts + incomePts + highValuePts + streakPts;

  return {
    total,
    breakdown: {
      tasks: { pts: taskPts, max: 25, count: tasksCompleted },
      content: { pts: contentPts, max: 20, count: contentRows.length },
      leads: { pts: leadPts, max: 15, count: leadsEngaged },
      income: { pts: incomePts, max: 15, sum: incomeSum },
      highValue: { pts: highValuePts, max: 15, count: highValueRows },
      streak: { pts: streakPts, max: 10, days: streakDays },
    },
  };
}
