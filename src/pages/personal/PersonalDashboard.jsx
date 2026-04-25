import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '@/lib/AuthContext';
import PersonalLayout from '@/components/personal/PersonalLayout';
import DailyCheckin from '@/components/personal/DailyCheckin';
import PersonalMentorCard from '@/components/personal/PersonalMentorCard';
import { PERSONAL_COLORS, PERSONAL_CARD } from '@/lib/personal/personal-constants';
import {
  getCheckin, listCheckins, listHabits, listHabitLogs,
  toggleHabitLog, listContacts, listHouseholdTasks,
} from '@/lib/personal/personal-api';
import { calculateDailyScore, scoreColor, calculatePersonalStreak } from '@/lib/personal/personal-score';
import { getPersonalInsight } from '@/lib/personal/personal-mentor';
import { toast } from 'sonner';

const todayISO = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.floor((a.getTime() - b.getTime()) / 86_400_000);

function timeGreeting() {
  const h = new Date().getHours();
  if (h >= 6  && h < 12) return 'בוקר טוב';
  if (h >= 12 && h < 17) return 'צהריים טובים';
  if (h >= 17 && h < 21) return 'ערב טוב';
  return                         'לילה טוב';
}

export default function PersonalDashboard() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const userId = user?.id;

  const [checkin, setCheckin] = useState(null);
  const [recentCheckins, setRecentCheckins] = useState([]);
  const [habits, setHabits] = useState([]);
  const [habitLogsToday, setHabitLogsToday] = useState({});
  const [contacts, setContacts] = useState([]);
  const [householdTasks, setHouseholdTasks] = useState([]);
  const [insight, setInsight] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [showCheckin, setShowCheckin] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const since = new Date(); since.setDate(since.getDate() - 30);
      const sinceISO = since.toISOString().slice(0, 10);

      const [c, recent, h, todayLogs, ppl, ht, ins] = await Promise.all([
        getCheckin(userId).catch(() => null),
        listCheckins(userId, { sinceDate: sinceISO }).catch(() => []),
        listHabits(userId).catch(() => []),
        listHabitLogs(userId, { sinceDate: todayISO() }).catch(() => []),
        listContacts(userId).catch(() => []),
        listHouseholdTasks(userId).catch(() => []),
        getPersonalInsight(userId).catch(() => null),
      ]);

      setCheckin(c);
      setRecentCheckins(recent);
      setHabits(h);
      setContacts(ppl);
      setHouseholdTasks(ht);
      setInsight(ins);

      const map = {};
      todayLogs.forEach(l => { map[l.habit_id] = l.completed; });
      setHabitLogsToday(map);
    } finally {
      setLoaded(true);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  // Today's score (recompute live from checkin row).
  const score = useMemo(() => calculateDailyScore(checkin), [checkin]);
  const streak = useMemo(() => calculatePersonalStreak(recentCheckins), [recentCheckins]);

  // Reminders: birthdays + overdue contacts + overdue tasks.
  const reminders = useMemo(() => {
    const out = [];
    const now = new Date();

    // Birthdays in next 3 days.
    contacts.forEach(c => {
      if (!c.birthday) return;
      const bday = new Date(c.birthday);
      bday.setFullYear(now.getFullYear());
      const diff = daysBetween(bday, now);
      if (diff === 0) out.push({ emoji: '🎂', text: `יום הולדת של ${c.name} היום!`, href: '/personal/people' });
      else if (diff > 0 && diff <= 3) out.push({ emoji: '🎂', text: `יום הולדת של ${c.name} בעוד ${diff} ימים`, href: '/personal/people' });
    });

    // Overdue contacts.
    const freqDays = { weekly: 7, biweekly: 14, monthly: 30, quarterly: 90 };
    contacts.forEach(c => {
      if (!c.last_contact_date) return;
      const last = new Date(c.last_contact_date);
      const days = daysBetween(now, last);
      const target = freqDays[c.contact_frequency] || 30;
      if (days > target) out.push({ emoji: '📞', text: `לא דיברת עם ${c.name} כבר ${days} ימים`, href: '/personal/people' });
    });

    // Household tasks due today / overdue.
    householdTasks.forEach(t => {
      if (!t.next_due) {
        out.push({ emoji: t.icon || '🏠', text: `${t.name} — לבצע היום`, href: '/personal/home' });
        return;
      }
      const due = new Date(t.next_due);
      const diff = daysBetween(now, due);
      if (diff > 0) out.push({ emoji: t.icon || '🏠', text: `${t.name} — איחור ${diff} ימים`, href: '/personal/home' });
      else if (diff === 0) out.push({ emoji: t.icon || '🏠', text: `${t.name} — היום`, href: '/personal/home' });
    });

    return out.slice(0, 5);
  }, [contacts, householdTasks]);

  const completedHabitsCount = Object.values(habitLogsToday).filter(Boolean).length;

  const handleHabitToggle = async (habit) => {
    try {
      await toggleHabitLog(userId, habit.id);
      load();
    } catch (err) { toast.error('שגיאה: ' + (err?.message || '')); }
  };

  const firstName = (user?.full_name || '').split(' ')[0] || 'אורי';

  return (
    <PersonalLayout title="אישי">
      {/* Greeting */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: PERSONAL_COLORS.textSecondary, fontWeight: 500 }}>
          {timeGreeting()}
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, color: PERSONAL_COLORS.textPrimary, marginTop: 2 }}>
          {firstName}
        </div>
      </div>

      {/* Daily check-in card */}
      {!loaded ? null : !checkin ? (
        <div
          onClick={() => setShowCheckin(true)}
          style={{
            backgroundColor: PERSONAL_COLORS.primary, color: '#FFFFFF',
            borderRadius: 14, padding: 18, marginBottom: 14,
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(255,111,32,0.25)',
            display: 'flex', alignItems: 'center', gap: 12,
          }}
        >
          <span style={{ fontSize: 32 }}>📊</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>צ׳ק-אין יומי — 30 שניות</div>
            <div style={{ fontSize: 12, opacity: 0.9, marginTop: 2 }}>איך עבר היום?</div>
          </div>
          <span style={{ fontSize: 18 }}>←</span>
        </div>
      ) : (
        <div style={{ ...PERSONAL_CARD, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <CircleScore score={score} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: PERSONAL_COLORS.textPrimary }}>
              ציון היום
            </div>
            <div style={{ fontSize: 11, color: PERSONAL_COLORS.textSecondary, marginTop: 2 }}>
              {score >= 71 ? 'יום מעולה' : score >= 41 ? 'יום בסדר' : 'יום קשה'}
            </div>
            <button onClick={() => setShowCheckin(true)}
              style={{
                marginTop: 6, padding: '4px 10px', borderRadius: 8,
                border: 'none', backgroundColor: '#F7F3EC',
                color: PERSONAL_COLORS.primary, fontSize: 11, fontWeight: 700, cursor: 'pointer',
              }}>
              ערוך צ׳ק-אין
            </button>
          </div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '6px 12px', borderRadius: 999,
            backgroundColor: streak > 0 ? '#FFF4E6' : '#F7F3EC',
            color: streak > 0 ? PERSONAL_COLORS.primary : PERSONAL_COLORS.textSecondary,
            fontSize: 12, fontWeight: 800,
          }}>
            <span>🔥</span><span>{streak}</span>
          </div>
        </div>
      )}

      {/* Mentor insight */}
      {insight && (
        <div style={{ marginBottom: 14 }}>
          <PersonalMentorCard insight={insight} />
        </div>
      )}

      {/* Reminders */}
      {reminders.length > 0 && (
        <div style={{ ...PERSONAL_CARD, marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: PERSONAL_COLORS.textPrimary, marginBottom: 10 }}>
            ⏰ תזכורות היום
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {reminders.map((r, i) => (
              <div key={i} onClick={() => navigate(r.href)} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', borderRadius: 10,
                backgroundColor: '#F7F3EC', cursor: 'pointer',
              }}>
                <span style={{ fontSize: 18 }}>{r.emoji}</span>
                <span style={{ flex: 1, fontSize: 13, color: PERSONAL_COLORS.textPrimary, fontWeight: 600 }}>
                  {r.text}
                </span>
                <span style={{ fontSize: 14, color: PERSONAL_COLORS.textSecondary }}>←</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Habits — mini row */}
      {habits.length > 0 && (
        <div style={{ ...PERSONAL_CARD, marginBottom: 14 }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: PERSONAL_COLORS.textPrimary }}>
              הרגלים היום
            </div>
            <button onClick={() => navigate('/personal/habits')} style={{
              background: 'transparent', border: 'none',
              color: PERSONAL_COLORS.primary, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>הכל ←</button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            {habits.map(h => {
              const done = !!habitLogsToday[h.id];
              return (
                <button key={h.id} onClick={() => handleHabitToggle(h)}
                  title={h.name}
                  style={{
                    width: 40, height: 40, borderRadius: '50%',
                    border: done ? `2px solid ${PERSONAL_COLORS.success}` : `1px solid ${PERSONAL_COLORS.border}`,
                    backgroundColor: done ? '#DCFCE7' : '#FFFFFF',
                    fontSize: 18, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                  {h.icon || '✅'}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: PERSONAL_COLORS.textSecondary, fontWeight: 600 }}>
            {completedHabitsCount}/{habits.length} הרגלים הושלמו
          </div>
        </div>
      )}

      <DailyCheckin
        isOpen={showCheckin}
        onClose={() => setShowCheckin(false)}
        userId={userId}
        existing={checkin}
        onSaved={load}
      />
    </PersonalLayout>
  );
}

function CircleScore({ score }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.max(0, Math.min(100, score)) / 100);
  const color = scoreColor(score);
  return (
    <div style={{ position: 'relative', width: 70, height: 70 }}>
      <svg width={70} height={70} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={35} cy={35} r={r} stroke="#F0E4D0" strokeWidth="6" fill="none" />
        <circle cx={35} cy={35} r={r} stroke={color} strokeWidth="6" fill="none"
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        fontSize: 18, fontWeight: 800, color,
      }}>
        {score}
      </div>
    </div>
  );
}
