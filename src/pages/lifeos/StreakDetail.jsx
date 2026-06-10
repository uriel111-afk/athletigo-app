import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { AuthContext } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import { LIFEOS_COLORS, LIFEOS_CARD } from '@/lib/lifeos/lifeos-constants';

const dayKey = (d) => new Date(d).toISOString().slice(0, 10);

// Hebrew short day names for the column header row, sat→fri order so
// the column on the right is Saturday like a Hebrew calendar.
const WEEK_LABELS = ['ש', 'ו', 'ה', 'ד', 'ג', 'ב', 'א'];

// Build a 13-week (91-day) window aligned to whole weeks: the latest
// column is the current week, working backwards.
const buildCalendarGrid = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Saturday=6, Friday=5, ..., Sunday=0. Use (day+1)%7 so Saturday=0
  // and we anchor the column to the Saturday → Friday week.
  const offsetFromSat = (today.getDay() + 1) % 7;
  // The latest day in the latest column row is "today"; the latest
  // column starts at the Saturday of this week.
  const latestColStart = new Date(today);
  latestColStart.setDate(today.getDate() - offsetFromSat);

  const weeks = [];
  for (let w = 12; w >= 0; w--) {
    const colStart = new Date(latestColStart);
    colStart.setDate(latestColStart.getDate() - w * 7);
    const days = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(colStart);
      day.setDate(colStart.getDate() + d);
      const isFuture = day > today;
      days.push({ date: day, key: dayKey(day), isFuture });
    }
    weeks.push(days);
  }
  return weeks;
};

export default function StreakDetail() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const userId = user?.id;

  const [postedDays, setPostedDays] = useState(new Set());
  const [activeDays, setActiveDays] = useState(new Set());
  const [loaded,     setLoaded]     = useState(false);

  const grid = useMemo(() => buildCalendarGrid(), []);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoaded(false);
    try {
      const since = new Date();
      since.setDate(since.getDate() - 91);
      const sinceISO = since.toISOString().slice(0, 10);
      const sinceTS = since.toISOString();

      // Posted = content_calendar rows with status='published'.
      // Active = any non-content activity (income / expenses / tasks
      // completed / leads), used as the fallback "you did business
      // stuff today" signal. We don't have a coach-trained source so
      // "trained" is being approximated by any non-post activity day.
      const [content, income, expenses, tasks, leads] = await Promise.all([
        supabase.from('content_calendar')
          .select('scheduled_date, status')
          .eq('user_id', userId)
          .eq('status', 'published')
          .gte('scheduled_date', sinceISO),
        supabase.from('income')
          .select('date')
          .eq('user_id', userId)
          .gte('date', sinceISO),
        supabase.from('expenses')
          .select('date')
          .eq('user_id', userId)
          .gte('date', sinceISO),
        supabase.from('life_os_tasks')
          .select('completed_at')
          .eq('user_id', userId)
          .eq('status', 'completed')
          .gte('completed_at', sinceTS),
        supabase.from('leads')
          .select('created_at')
          .eq('user_id', userId)
          .gte('created_at', sinceTS),
      ]);

      const posts = new Set();
      (content.data || []).forEach(r => {
        if (r.scheduled_date) posts.add(dayKey(r.scheduled_date));
      });

      const active = new Set();
      (income.data   || []).forEach(r => r.date         && active.add(dayKey(r.date)));
      (expenses.data || []).forEach(r => r.date         && active.add(dayKey(r.date)));
      (tasks.data    || []).forEach(r => r.completed_at && active.add(dayKey(r.completed_at)));
      (leads.data    || []).forEach(r => r.created_at   && active.add(dayKey(r.created_at)));

      setPostedDays(posts);
      setActiveDays(active);
    } catch (err) {
      console.error('[StreakDetail] load error:', err);
      toast.error('שגיאה: ' + (err?.message || ''));
    } finally {
      setLoaded(true);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  // Counts (within the 91-day window — i.e. visible grid).
  const stats = useMemo(() => {
    let posted = 0, active = 0, both = 0, empty = 0, totalShown = 0;
    grid.forEach(col => col.forEach(d => {
      if (d.isFuture) return;
      totalShown += 1;
      const p = postedDays.has(d.key);
      const a = activeDays.has(d.key);
      if (p && a) both += 1;
      else if (p) posted += 1;
      else if (a) active += 1;
      else empty += 1;
    }));
    return { posted, active, both, empty, totalShown };
  }, [grid, postedDays, activeDays]);

  const cellColor = (cell) => {
    if (cell.isFuture) return '#F2EDDF';
    const p = postedDays.has(cell.key);
    const a = activeDays.has(cell.key);
    if (p && a) return LIFEOS_COLORS.success;       // both → green
    if (p) return LIFEOS_COLORS.primary;             // only post → orange
    if (a) return '#FFE2C9';                         // only activity → tan
    return '#F2EDDF';                                // nothing → cream
  };

  return (
    <LifeOSLayout title="פירוט רצף ימים" rightSlot={
      <button onClick={load} aria-label="רענן" style={iconBtn}>
        <RefreshCw size={16} />
      </button>
    }>
      <div style={{ padding: '0 14px' }}>
        <button onClick={() => navigate('/lifeos/momentum')} style={backBtn}>
          <ChevronRight size={16} />
          <span>חזרה למומנטום</span>
        </button>

        {/* Legend */}
        <div style={{ ...LIFEOS_CARD, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <LegendRow color={LIFEOS_COLORS.success} label="פרסום + פעילות אחרת" count={stats.both} />
          <LegendRow color={LIFEOS_COLORS.primary} label="פרסום בלבד"          count={stats.posted} />
          <LegendRow color="#FFE2C9"               label="פעילות אחרת בלבד"    count={stats.active} />
          <LegendRow color="#F2EDDF"               label="ללא פעילות"          count={stats.empty} />
        </div>

        {/* Calendar grid */}
        <div style={{ ...LIFEOS_CARD, marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: LIFEOS_COLORS.textPrimary, marginBottom: 10 }}>
            13 שבועות אחרונים
          </div>
          {!loaded ? (
            <div style={emptyStyle}>טוען...</div>
          ) : (
            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-start', direction: 'ltr' }}>
              {/* Day-of-week labels — Saturday on right */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginLeft: 4 }}>
                {WEEK_LABELS.map((l, i) => (
                  <div key={i} style={{
                    width: 14, height: 14,
                    fontSize: 9, color: LIFEOS_COLORS.textSecondary,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    direction: 'rtl',
                  }}>
                    {l}
                  </div>
                ))}
              </div>
              {/* Weeks columns — oldest left, this week right */}
              {grid.map((week, wi) => (
                <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {week.map((cell, ci) => (
                    <div
                      key={ci}
                      title={`${cell.date.toLocaleDateString('he-IL')}${
                        postedDays.has(cell.key) ? ' • פרסום' : ''
                      }${
                        activeDays.has(cell.key) ? ' • פעילות' : ''
                      }`}
                      style={{
                        width: 14, height: 14,
                        borderRadius: 3,
                        backgroundColor: cellColor(cell),
                        opacity: cell.isFuture ? 0.3 : 1,
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Summary */}
        {loaded && (
          <div style={{ ...LIFEOS_CARD, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: LIFEOS_COLORS.textSecondary, marginBottom: 4 }}>
              סיכום תקופה ({stats.totalShown} ימים שעברו)
            </div>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8,
            }}>
              <SummaryTile label="ימי פרסום" value={stats.posted + stats.both} color={LIFEOS_COLORS.primary} />
              <SummaryTile label="ימי פעילות" value={stats.active + stats.both} color={LIFEOS_COLORS.success} />
            </div>
          </div>
        )}
      </div>
    </LifeOSLayout>
  );
}

function LegendRow({ color, label, count }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: LIFEOS_COLORS.textPrimary }}>
      <div style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: color, flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{label}</span>
      <span style={{ fontWeight: 700, color: LIFEOS_COLORS.textSecondary }}>{count}</span>
    </div>
  );
}

function SummaryTile({ label, value, color }) {
  return (
    <div style={{
      padding: 10, borderRadius: 10,
      backgroundColor: '#FFFFFF',
      border: `1px solid ${LIFEOS_COLORS.border}`,
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 11, color: LIFEOS_COLORS.textSecondary, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 19, fontWeight: 800, color }}>
        {value}
      </div>
    </div>
  );
}

const iconBtn = {
  width: 28, height: 28, borderRadius: 8, border: 'none',
  background: 'transparent', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: LIFEOS_COLORS.textSecondary,
};
const backBtn = {
  display: 'flex', alignItems: 'center', gap: 4,
  background: 'transparent', border: 'none',
  padding: '4px 0 12px',
  color: LIFEOS_COLORS.textSecondary,
  fontSize: 13, fontWeight: 600, cursor: 'pointer',
  fontFamily: 'inherit',
};
const emptyStyle = {
  padding: '24px 14px', textAlign: 'center',
  fontSize: 13, color: LIFEOS_COLORS.textSecondary,
};
