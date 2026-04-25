// ═══════════════════════════════════════════════════════════════════
// Notification Engine — generates in-app notifications from live data
// ═══════════════════════════════════════════════════════════════════
// Runs on dashboard mount. Produces a de-duplicated list of
// notifications without writing to DB (display-only). The dismiss
// action is local-storage backed so already-seen items don't pop up
// again on next mount.
// ═══════════════════════════════════════════════════════════════════

import { supabase } from '@/lib/supabaseClient';

const daysBetween = (a, b) => Math.floor((a.getTime() - b.getTime()) / 86_400_000);
const DISMISS_KEY = 'lifeos_dismissed_notifs';

const loadDismissed = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]'));
  } catch {
    return new Set();
  }
};
const saveDismissed = (set) => {
  try { localStorage.setItem(DISMISS_KEY, JSON.stringify([...set])); } catch {}
};

export function dismissNotification(id) {
  const set = loadDismissed();
  set.add(id);
  saveDismissed(set);
}

export async function generateNotifications(userId) {
  const dismissed = loadDismissed();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(now.getDate() - 30);
  const sevenDaysAgo = new Date(now);  sevenDaysAgo.setDate(now.getDate() - 7);

  const [leads, recurring, installments, documents, content, income] = await Promise.all([
    supabase.from('leads').select('id, name, status, created_at, last_contact_date').eq('user_id', userId),
    supabase.from('recurring_payments').select('id, name, amount, due_day').eq('user_id', userId).eq('is_active', true),
    supabase.from('installments').select('id, name, payments_made, total_payments').eq('user_id', userId),
    supabase.from('documents').select('id, name, expiry_date').eq('user_id', userId).not('expiry_date', 'is', null),
    supabase.from('content_calendar').select('scheduled_date, status').eq('user_id', userId).gte('scheduled_date', sevenDaysAgo.toISOString().slice(0, 10)),
    supabase.from('income').select('source, date').eq('user_id', userId).gte('date', monthStart),
  ]);

  const notifs = [];

  // 1. Leads untouched 24h+
  (leads.data || []).forEach(l => {
    if (l.status !== 'new') return;
    const created = new Date(l.created_at);
    if (daysBetween(now, created) >= 1) {
      notifs.push({
        id: `lead_wait_${l.id}`,
        icon: '⚡',
        text: `${l.name} מחכה לתשובה כבר יום!`,
        href: '/lifeos/leads',
        priority: 'critical',
      });
    }
  });

  // 2. Recurring payments due within 3 days
  (recurring.data || []).forEach(r => {
    if (!r.due_day) return;
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), r.due_day);
    const daysLeft = daysBetween(thisMonth, now);
    if (daysLeft >= 0 && daysLeft <= 3) {
      notifs.push({
        id: `recurring_${r.id}_${now.getMonth()}`,
        icon: '💰',
        text: `${r.name} — ${Math.round(r.amount).toLocaleString('he-IL')}₪ בעוד ${daysLeft} ימים`,
        href: '/lifeos/recurring',
        priority: 'medium',
      });
    }
  });

  // 3. Installment finished
  (installments.data || []).forEach(i => {
    if ((i.payments_made || 0) >= (i.total_payments || 0) && i.total_payments > 0) {
      notifs.push({
        id: `inst_done_${i.id}`,
        icon: '🎉',
        text: `סיימת לשלם את ${i.name}!`,
        href: '/lifeos/installments',
        priority: 'low',
      });
    }
  });

  // 4. Document expiry within 30 days
  (documents.data || []).forEach(d => {
    if (!d.expiry_date) return;
    const exp = new Date(d.expiry_date);
    const days = daysBetween(exp, now);
    if (days >= 0 && days <= 30) {
      notifs.push({
        id: `doc_exp_${d.id}`,
        icon: '📄',
        text: `${d.name} פג תוקף בעוד ${days} ימים`,
        href: '/lifeos/documents',
        priority: 'high',
      });
    }
  });

  // 5. No content this week (trigger on Wednesday+)
  const published = (content.data || []).filter(c => c.status === 'published').length;
  if (published === 0 && now.getDay() >= 3) {
    notifs.push({
      id: `no_content_${now.getFullYear()}_${now.getMonth()}_${Math.floor(now.getDate() / 7)}`,
      icon: '📸',
      text: 'עוד לא פרסמת השבוע. 3 ימים נשארו.',
      href: '/lifeos/content',
      priority: 'high',
    });
  }

  // 6. No coaching clients this month
  const hasCoaching = (income.data || []).some(r => r.source === 'online_coaching');
  if (!hasCoaching) {
    notifs.push({
      id: `no_coaching_${now.getFullYear()}_${now.getMonth()}`,
      icon: '🎯',
      text: 'עדיין בלי לקוחות ליווי אונליין. זו הכנסה חוזרת חודשית.',
      href: '/lifeos/plan',
      priority: 'high',
    });
  }

  // 7. No workshops for 30 days
  const hasWorkshop = (income.data || []).some(r => r.source === 'workshop');
  if (!hasWorkshop) {
    notifs.push({
      id: `no_workshop_${now.getFullYear()}_${now.getMonth()}`,
      icon: '📅',
      text: 'חודש בלי סדנה. סדנאות = חשיפה + לידים.',
      href: '/lifeos/tasks',
      priority: 'medium',
    });
  }

  // Filter dismissed, sort by priority.
  const priOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  return notifs
    .filter(n => !dismissed.has(n.id))
    .sort((a, b) => (priOrder[a.priority] || 9) - (priOrder[b.priority] || 9));
}
