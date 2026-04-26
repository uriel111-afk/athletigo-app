import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import Heatmap from '@/components/lifeos/Heatmap';
import RecordsBoard from '@/components/lifeos/RecordsBoard';
import { LIFEOS_COLORS, LIFEOS_CARD, YEARLY_GOAL } from '@/lib/lifeos/lifeos-constants';
import { calculateStreak } from '@/lib/lifeos/streak-calculator';

const dayKey = (d) => new Date(d).toISOString().slice(0, 10);
const monthKey = (d) => {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
};
const weekKey = (d) => {
  const dt = new Date(d);
  const yr = dt.getFullYear();
  // ISO-ish week number
  const start = new Date(yr, 0, 1);
  const days = Math.floor((dt - start) / 86_400_000);
  const wk = Math.ceil((days + start.getDay() + 1) / 7);
  return `${yr}-W${wk}`;
};
const fmt = (n) => Math.round(n).toLocaleString('he-IL');

export default function Momentum() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const [data, setData] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const since = new Date();
      since.setDate(since.getDate() - 90);
      const sinceISO = since.toISOString().slice(0, 10);
      const sinceTS = since.toISOString();

      const [income, expenses, tasks, content, leads] = await Promise.all([
        supabase.from('income').select('amount, date, source').eq('user_id', userId),
        supabase.from('expenses').select('amount, date').eq('user_id', userId).gte('date', sinceISO),
        supabase.from('life_os_tasks').select('completed_at, status').eq('user_id', userId).eq('status', 'completed').gte('completed_at', sinceTS),
        supabase.from('content_calendar').select('scheduled_date, status').eq('user_id', userId).eq('status', 'published').gte('scheduled_date', sinceISO),
        // leads owner column is user_id (canonical schema, verified
        // via console traces — coach_id doesn't exist on this table).
        supabase.from('leads').select('created_at').eq('user_id', userId).gte('created_at', sinceTS),
      ]);

      const streak = await calculateStreak(userId);

      // Activity map for heatmap (last 90 days, any action).
      const activity = new Map();
      const inc = (k) => activity.set(k, (activity.get(k) || 0) + 1);
      (income.data || []).forEach(r => r.date && inc(dayKey(r.date)));
      (expenses.data || []).forEach(r => r.date && inc(dayKey(r.date)));
      (tasks.data || []).forEach(r => r.completed_at && inc(dayKey(r.completed_at)));
      (content.data || []).forEach(r => r.scheduled_date && inc(dayKey(r.scheduled_date)));
      (leads.data || []).forEach(r => r.created_at && inc(dayKey(r.created_at)));

      // Records.
      const dailyIncome = new Map();
      const dailyCount = new Map();
      (income.data || []).forEach(r => {
        if (!r.date) return;
        const k = dayKey(r.date);
        dailyIncome.set(k, (dailyIncome.get(k) || 0) + Number(r.amount || 0));
        dailyCount.set(k, (dailyCount.get(k) || 0) + 1);
      });
      let topDayIncome = 0, topDayDate = null;
      for (const [k, v] of dailyIncome) { if (v > topDayIncome) { topDayIncome = v; topDayDate = k; } }

      const weeklySales = new Map();
      (income.data || []).forEach(r => {
        if (!r.date) return;
        const k = weekKey(r.date);
        weeklySales.set(k, (weeklySales.get(k) || 0) + 1);
      });
      let topWeekSales = 0, topWeekDate = null;
      for (const [k, v] of weeklySales) { if (v > topWeekSales) { topWeekSales = v; topWeekDate = k; } }

      const weeklyContent = new Map();
      (content.data || []).forEach(r => {
        if (!r.scheduled_date) return;
        const k = weekKey(r.scheduled_date);
        weeklyContent.set(k, (weeklyContent.get(k) || 0) + 1);
      });
      let topWeekContent = 0;
      for (const v of weeklyContent.values()) if (v > topWeekContent) topWeekContent = v;

      const dailyLeads = new Map();
      (leads.data || []).forEach(r => {
        if (!r.created_at) return;
        const k = dayKey(r.created_at);
        dailyLeads.set(k, (dailyLeads.get(k) || 0) + 1);
      });
      let topDayLeads = 0;
      for (const v of dailyLeads.values()) if (v > topDayLeads) topDayLeads = v;

      // Milestones timeline — cumulative income per month, find month
      // crossings for 10K/50K/100K thresholds.
      const monthlyIncome = new Map();
      (income.data || []).forEach(r => {
        if (!r.date) return;
        const k = monthKey(r.date);
        monthlyIncome.set(k, (monthlyIncome.get(k) || 0) + Number(r.amount || 0));
      });
      const milestoneTargets = [10_000, 50_000, 100_000, 250_000, 500_000, 833_333];
      const milestoneHits = [];
      const sortedMonths = [...monthlyIncome.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      sortedMonths.forEach(([m, v]) => {
        milestoneTargets.forEach(target => {
          if (v >= target && !milestoneHits.find(x => x.target === target)) {
            milestoneHits.push({ target, month: m });
          }
        });
      });
      const currentMonth = monthKey(new Date());
      const currentMonthIncome = monthlyIncome.get(currentMonth) || 0;
      const nextMilestone = milestoneTargets.find(t => currentMonthIncome < t);

      // Firsts timeline
      const firsts = [];
      const findFirst = (rows, getDate, label, emoji) => {
        if (!rows.length) return;
        const sorted = rows.filter(r => getDate(r)).sort((a, b) => new Date(getDate(a)) - new Date(getDate(b)));
        if (sorted[0]) firsts.push({ label, emoji, date: getDate(sorted[0]) });
      };
      findFirst(income.data || [], r => r.date, 'מכירה ראשונה', '💰');
      findFirst((income.data || []).filter(r => r.source === 'workshop'), r => r.date, 'סדנה ראשונה', '🎪');
      findFirst((income.data || []).filter(r => r.source === 'online_coaching'), r => r.date, 'לקוח ליווי ראשון', '📱');
      findFirst((income.data || []).filter(r => r.source === 'course'), r => r.date, 'קורס ראשון נמכר', '🎓');
      findFirst(content.data || [], r => r.scheduled_date, 'תוכן ראשון שפורסם', '🎬');

      setData({
        activity,
        records: {
          topDayIncome, topDayDate, topWeekSales, topWeekDate,
          longestStreak: streak, topWeekContent, topDayLeads,
        },
        milestoneHits,
        currentMonthIncome,
        nextMilestone,
        firsts: firsts.sort((a, b) => new Date(a.date) - new Date(b.date)),
      });
    } finally {
      setLoaded(true);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  return (
    <LifeOSLayout title="מומנטום">
      {!loaded || !data ? (
        <div style={{ ...LIFEOS_CARD, textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: 13, color: LIFEOS_COLORS.textSecondary }}>טוען...</div>
        </div>
      ) : (
        <>
          {/* Heatmap */}
          <div style={{ ...LIFEOS_CARD, marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: LIFEOS_COLORS.textPrimary, marginBottom: 10 }}>
              פעילות — 12 שבועות אחרונים
            </div>
            <Heatmap activity={data.activity} />
          </div>

          {/* Records */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: LIFEOS_COLORS.textPrimary, marginBottom: 8 }}>
              🏆 שיאים אישיים
            </div>
            <RecordsBoard records={data.records} />
          </div>

          {/* Progress timeline */}
          <div style={{ ...LIFEOS_CARD }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: LIFEOS_COLORS.textPrimary, marginBottom: 10 }}>
              ציר התקדמות
            </div>

            {data.firsts.length === 0 && data.milestoneHits.length === 0 && (
              <div style={{ fontSize: 13, color: LIFEOS_COLORS.textSecondary, textAlign: 'center', padding: '10px 0' }}>
                עוד לא נרשמו אירועים. ההיסטוריה תתחיל מכאן 🚀
              </div>
            )}

            {data.firsts.map((f, i) => (
              <TimelineRow key={`first_${i}`} emoji={f.emoji} label={f.label}
                           date={new Date(f.date).toLocaleDateString('he-IL')} />
            ))}

            {data.milestoneHits.map((m, i) => (
              <TimelineRow key={`ms_${i}`} emoji="🏆"
                           label={`הגעת ל-${fmt(m.target)}₪ בחודש`}
                           date={m.month} highlight />
            ))}

            {data.nextMilestone && (
              <div style={{
                marginTop: 10, padding: '10px 12px', borderRadius: 10,
                backgroundColor: '#FFF4E6', border: `1px solid ${LIFEOS_COLORS.primary}`,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: LIFEOS_COLORS.primary }}>
                  יעד הבא
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: LIFEOS_COLORS.textPrimary, marginTop: 2 }}>
                  {fmt(data.nextMilestone)}₪/חודש —
                  נותרו {fmt(data.nextMilestone - data.currentMonthIncome)}₪
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </LifeOSLayout>
  );
}

function TimelineRow({ emoji, label, date, highlight }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 10px', borderRadius: 10, marginBottom: 6,
      backgroundColor: highlight ? '#FFF4E6' : '#F7F3EC',
    }}>
      <span style={{ fontSize: 20 }}>{emoji}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: LIFEOS_COLORS.textPrimary }}>
          {label}
        </div>
      </div>
      <div style={{ fontSize: 11, color: LIFEOS_COLORS.textSecondary, fontWeight: 600 }}>
        {date}
      </div>
    </div>
  );
}
