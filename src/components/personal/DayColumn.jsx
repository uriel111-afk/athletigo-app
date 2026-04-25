import React, { useState } from 'react';
import { Check, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { PERSONAL_COLORS, PERSONAL_CARD } from '@/lib/personal/personal-constants';
import { setTaskStatus, transferTask } from '@/lib/personal/weekly-api';
import { toggleHabitLog, markHouseholdDone } from '@/lib/personal/personal-api';
import { HE_DAY_NAMES, HE_DAY_SHORT } from '@/lib/personal/weekly-api';

const heDayLabel = (date) =>
  `${HE_DAY_NAMES[date.getDay()]} ${date.getDate()}.${date.getMonth() + 1}`;

const scoreColor = (score) => {
  if (score >= 70) return '#16A34A';
  if (score >= 40) return '#F59E0B';
  return '#DC2626';
};

// One day's column. Shown side-by-side on desktop, full-width on
// mobile (one at a time, with the WeeklyBoard handling the swiper).
//
// Props:
//   day      — block from fetchWeek().days[i]
//   habits   — full habits list (for the row of circles)
//   userId
//   onChanged — called after any mutation so the parent re-fetches
//   compact  — when true, slimmer paddings (used inside summaries)
//   showWeekDays — list of all 7 days (for the transfer dropdown)
export default function DayColumn({ day, habits, userId, onChanged, compact = false, showWeekDays = [] }) {
  const accent = day.isToday ? PERSONAL_COLORS.primary : PERSONAL_COLORS.border;
  const bg = day.isToday ? '#FFF5EE' : '#FFFFFF';

  return (
    <div style={{
      ...PERSONAL_CARD,
      padding: compact ? 10 : 12,
      backgroundColor: bg,
      border: `${day.isToday ? 2 : 1}px solid ${accent}`,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <DayHeader day={day} />

      {/* Sessions */}
      <Section emoji="📅" title="אימונים / פגישות">
        {day.sessions.length === 0 ? (
          <Empty text="אין" />
        ) : day.sessions.map(s => <SessionRow key={s.id} session={s} userId={userId} />)}
      </Section>

      {/* Tasks */}
      <Section emoji="✅" title="משימות">
        {day.tasks.length === 0 ? (
          <Empty text="אין" />
        ) : day.tasks.map(t => (
          <TaskRow
            key={t.id} task={t} dayIso={day.iso}
            weekDays={showWeekDays}
            onChanged={onChanged}
          />
        ))}
        {day.household.map(h => (
          <HouseholdRow key={h.id} task={h} userId={userId} onChanged={onChanged} />
        ))}
      </Section>

      {/* Habits */}
      <Section emoji="🔄" title="הרגלים">
        {habits.length === 0 ? (
          <Empty text="אין הרגלים פעילים" />
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingTop: 2 }}>
            {habits.map(h => (
              <HabitCircle
                key={h.id}
                habit={h}
                done={!!day.habitLogs[h.id]}
                isToday={day.isToday}
                userId={userId}
                date={day.iso}
                onChanged={onChanged}
              />
            ))}
          </div>
        )}
      </Section>

      {/* Meals */}
      <Section emoji="🍽️" title="ארוחות">
        <MealsRow day={day} />
      </Section>

      {/* Score footer */}
      <ScoreFooter score={day.score} />
    </div>
  );
}

// ─── Header ─────────────────────────────────────────────────────

function DayHeader({ day }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      paddingBottom: 6,
      borderBottom: `1px solid ${PERSONAL_COLORS.border}`,
    }}>
      <div style={{
        fontSize: 14, fontWeight: 800,
        color: day.isToday ? PERSONAL_COLORS.primary : PERSONAL_COLORS.textPrimary,
      }}>
        {heDayLabel(day.date)}
      </div>
      {day.isToday && (
        <span style={{
          padding: '2px 8px', borderRadius: 999,
          backgroundColor: PERSONAL_COLORS.primary, color: '#FFFFFF',
          fontSize: 10, fontWeight: 700,
        }}>היום</span>
      )}
    </div>
  );
}

// ─── Sections ───────────────────────────────────────────────────

function Section({ emoji, title, children }) {
  return (
    <div>
      <div style={{
        fontSize: 11, fontWeight: 700,
        color: PERSONAL_COLORS.textSecondary,
        marginBottom: 4,
        display: 'flex', alignItems: 'center', gap: 4,
      }}>
        <span>{emoji}</span><span>{title}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {children}
      </div>
    </div>
  );
}

function Empty({ text }) {
  return <div style={{ fontSize: 11, color: '#B0A89B', padding: '2px 0' }}>{text}</div>;
}

// ─── Sessions ───────────────────────────────────────────────────

function SessionRow({ session, userId }) {
  const isMyTraining = session.coach_id === userId && !session.trainee_id;
  const isCoachingOther = session.coach_id === userId && session.trainee_id;
  const label = isCoachingOther
    ? `מתאמן: ${session.notes || ''}`
    : isMyTraining
      ? (session.type || 'אימון')
      : (session.type || 'מפגש');
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 8px', borderRadius: 10,
      backgroundColor: '#FAF6EE',
      fontSize: 12,
    }}>
      <span style={{ fontWeight: 700, color: PERSONAL_COLORS.primary, minWidth: 36 }}>
        {session.time?.slice(0, 5) || '—'}
      </span>
      <span style={{ flex: 1, minWidth: 0, color: PERSONAL_COLORS.textPrimary }}>
        {label}
      </span>
      {session.status && (
        <span style={{
          fontSize: 10, padding: '2px 6px', borderRadius: 6,
          backgroundColor: '#FFFFFF', color: PERSONAL_COLORS.textSecondary,
        }}>{session.status}</span>
      )}
    </div>
  );
}

// ─── Tasks ──────────────────────────────────────────────────────

function TaskRow({ task, dayIso, weekDays, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const done = task.status === 'completed';

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const next = done ? 'pending' : 'completed';
      await setTaskStatus(task.id, next);
      if (next === 'completed') {
        if (task.xp_reward > 0) toast.success(`+${task.xp_reward} XP! 🎉`);
        else toast.success('מעולה ✓');
      }
      onChanged?.();
    } catch (err) { toast.error('שגיאה: ' + (err?.message || '')); }
    finally { setBusy(false); }
  };

  const handleTransfer = async (newIso) => {
    setShowTransfer(false);
    if (!newIso || newIso === dayIso) return;
    try {
      await transferTask(task.id, newIso, dayIso);
      toast.success('הועבר ✓');
      onChanged?.();
    } catch (err) { toast.error('שגיאה: ' + (err?.message || '')); }
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '4px 0', position: 'relative',
    }}>
      <button
        onClick={toggle}
        disabled={busy}
        aria-label={done ? 'בטל' : 'סמן הושלם'}
        style={{
          width: 18, height: 18, borderRadius: 5,
          border: `2px solid ${done ? '#16A34A' : PERSONAL_COLORS.border}`,
          backgroundColor: done ? '#16A34A' : '#FFFFFF',
          color: '#FFFFFF', cursor: 'pointer', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 0,
        }}
      >
        {done && <Check size={12} />}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12,
          color: done ? '#A0A0A0' : PERSONAL_COLORS.textPrimary,
          textDecoration: done ? 'line-through' : 'none',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {task.is_challenge ? '🎯 ' : ''}{task.title}
        </div>
        {task.transferred_from && (
          <div style={{ fontSize: 9, color: PERSONAL_COLORS.textSecondary }}>
            הועבר מ-{task.transferred_from.slice(5)}
          </div>
        )}
      </div>
      {!done && weekDays.length > 0 && (
        <button
          onClick={() => setShowTransfer(s => !s)}
          aria-label="העבר ליום אחר"
          title="העבר ליום אחר"
          style={{
            border: 'none', background: 'transparent',
            color: PERSONAL_COLORS.textSecondary, cursor: 'pointer',
            fontSize: 14, padding: 2,
          }}
        >➡️</button>
      )}
      {showTransfer && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', marginTop: 4,
          backgroundColor: '#FFFFFF',
          border: `1px solid ${PERSONAL_COLORS.border}`,
          borderRadius: 10,
          boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
          padding: 4, zIndex: 50, minWidth: 130,
        }}>
          {weekDays.map(d => (
            <button
              key={d.iso}
              onClick={() => handleTransfer(d.iso)}
              disabled={d.iso === dayIso}
              style={{
                display: 'block', width: '100%', textAlign: 'right',
                padding: '6px 8px', border: 'none', cursor: 'pointer',
                background: d.iso === dayIso ? '#F5F1EA' : 'transparent',
                color: PERSONAL_COLORS.textPrimary,
                fontSize: 12, fontWeight: 600, borderRadius: 6,
              }}
            >
              {HE_DAY_NAMES[d.dow]} {d.iso === dayIso ? '(נוכחי)' : ''}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function HouseholdRow({ task, userId, onChanged }) {
  const [busy, setBusy] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const justDone = task.last_done === today;
  const handleDone = async () => {
    if (busy || justDone) return;
    setBusy(true);
    try {
      await markHouseholdDone(userId, task);
      toast.success('כל הכבוד! ✓');
      onChanged?.();
    } catch (err) { toast.error('שגיאה: ' + (err?.message || '')); }
    finally { setBusy(false); }
  };
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0',
    }}>
      <button
        onClick={handleDone}
        disabled={busy || justDone}
        style={{
          width: 18, height: 18, borderRadius: 5,
          border: `2px solid ${justDone ? '#16A34A' : PERSONAL_COLORS.border}`,
          backgroundColor: justDone ? '#16A34A' : '#FFFFFF',
          color: '#FFFFFF', cursor: justDone ? 'default' : 'pointer',
          flexShrink: 0, padding: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {justDone && <Check size={12} />}
      </button>
      <span style={{ fontSize: 13 }}>{task.icon}</span>
      <span style={{
        flex: 1, fontSize: 12,
        color: justDone ? '#A0A0A0' : PERSONAL_COLORS.textPrimary,
        textDecoration: justDone ? 'line-through' : 'none',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {task.name} <span style={{ fontSize: 10, color: '#B0A89B' }}>({task.duration_minutes || 15} דק׳)</span>
      </span>
    </div>
  );
}

// ─── Habits ─────────────────────────────────────────────────────

function HabitCircle({ habit, done, isToday, userId, date, onChanged }) {
  const [busy, setBusy] = useState(false);
  const color = done
    ? '#16A34A'
    : isToday ? PERSONAL_COLORS.primary : '#D5CFC2';
  const bg = done
    ? '#DCFCE7'
    : isToday ? '#FFF5EE' : '#F5F1EA';
  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await toggleHabitLog(userId, habit.id, date);
      onChanged?.();
    } catch (err) { toast.error('שגיאה: ' + (err?.message || '')); }
    finally { setBusy(false); }
  };
  return (
    <button
      onClick={toggle}
      disabled={busy}
      title={`${habit.name}${done ? ' — בוצע' : ''}`}
      aria-label={habit.name}
      style={{
        width: 32, height: 32, borderRadius: 999,
        border: `2px solid ${color}`,
        backgroundColor: bg,
        cursor: 'pointer', padding: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 15,
      }}
    >
      {habit.icon || '•'}
    </button>
  );
}

// ─── Meals ──────────────────────────────────────────────────────

function MealsRow({ day }) {
  const types = [
    { key: 'breakfast', label: 'בוקר' },
    { key: 'lunch',     label: 'צהריים' },
    { key: 'dinner',    label: 'ערב' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {types.map(t => {
        const planned = (day.mealPlan || []).find(m => m.meal_type === t.key);
        const ate = (day.meals || []).find(m => m.meal_type === t.key);
        const text = ate?.description || planned?.description || '—';
        const eaten = !!ate;
        return (
          <div key={t.key} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 11,
            color: eaten ? PERSONAL_COLORS.textPrimary : PERSONAL_COLORS.textSecondary,
          }}>
            <span style={{ fontWeight: 700, minWidth: 38 }}>{t.label}</span>
            <span style={{
              flex: 1, minWidth: 0,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {text}
            </span>
            {eaten && <span style={{ color: '#16A34A', fontSize: 12 }}>✓</span>}
          </div>
        );
      })}
    </div>
  );
}

// ─── Score footer ───────────────────────────────────────────────

function ScoreFooter({ score }) {
  const color = scoreColor(score);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      paddingTop: 6,
      borderTop: `1px solid ${PERSONAL_COLORS.border}`,
    }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: PERSONAL_COLORS.textSecondary }}>
        ציון יומי
      </span>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '2px 10px', borderRadius: 999,
        backgroundColor: color, color: '#FFFFFF',
        fontSize: 12, fontWeight: 800,
      }}>
        {score}
      </span>
    </div>
  );
}
