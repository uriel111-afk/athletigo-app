import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '@/lib/AuthContext';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import ChallengeCard from '@/components/lifeos/ChallengeCard';
import {
  LIFEOS_COLORS, LIFEOS_CARD, TASK_STATUS, TASK_DIFFICULTY,
} from '@/lib/lifeos/lifeos-constants';
import {
  listTasks, updateTaskStatus, getTotalXP,
} from '@/lib/lifeos/lifeos-api';
import { toast } from 'sonner';

const DIFFICULTY_BY_KEY = Object.fromEntries(TASK_DIFFICULTY.map(d => [d.key, d]));

// Pick today's challenge: prefer in_progress; else first pending challenge.
const pickDailyChallenge = (tasks) => {
  const challenges = tasks.filter(t => t.is_challenge);
  const inProg = challenges.find(t => t.status === 'in_progress');
  if (inProg) return inProg;
  return challenges.find(t => t.status === 'pending') || null;
};

export default function Tasks() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;

  const [tasks, setTasks] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [xp, setXp] = useState(0);
  const [filter, setFilter] = useState('all'); // all | pending | in_progress | completed

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const [t, totalXp] = await Promise.all([
        listTasks(userId),
        getTotalXP(userId),
      ]);
      setTasks(t || []);
      setXp(totalXp);
    } catch (err) {
      console.error('[Tasks] load error:', err);
      toast.error('שגיאה בטעינה');
    } finally {
      setLoaded(true);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const dailyChallenge = useMemo(() => pickDailyChallenge(tasks), [tasks]);

  const regularTasks = useMemo(() => {
    let out = tasks.filter(t => !t.is_challenge || t.id === dailyChallenge?.id);
    if (filter !== 'all') out = out.filter(t => t.status === filter);
    // Today's challenge shows in its own hero card, not in the list.
    out = out.filter(t => t.id !== dailyChallenge?.id);
    return out;
  }, [tasks, filter, dailyChallenge]);

  const handleToggleStatus = async (task) => {
    const nextStatus = task.status === 'completed' ? 'pending' : 'completed';
    try {
      await updateTaskStatus(task.id, nextStatus);
      if (nextStatus === 'completed' && task.xp_reward > 0) {
        toast.success(`+${task.xp_reward} XP! 🎉`);
      }
      load();
    } catch (err) {
      toast.error('שגיאה: ' + (err?.message || ''));
    }
  };

  const handleAcceptChallenge = async (task) => {
    try {
      await updateTaskStatus(task.id, 'in_progress');
      toast.success('בהצלחה! האתגר התחיל 💪');
      load();
    } catch (err) {
      toast.error('שגיאה: ' + (err?.message || ''));
    }
  };

  const handleCompleteChallenge = async (task) => {
    try {
      await updateTaskStatus(task.id, 'completed');
      toast.success(`כל הכבוד! +${task.xp_reward} XP 🏆`);
      load();
    } catch (err) {
      toast.error('שגיאה: ' + (err?.message || ''));
    }
  };

  return (
    <LifeOSLayout title="משימות ואתגרים">
      {/* XP bar */}
      <div style={{
        ...LIFEOS_CARD, marginBottom: 12,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: `linear-gradient(135deg, ${LIFEOS_COLORS.primary} 0%, #FF8E4E 100%)`,
        color: '#FFFFFF',
        border: 'none',
      }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.9 }}>סך הנקודות שצברת</div>
          <div style={{ fontSize: 26, fontWeight: 900, marginTop: 2 }}>
            {xp} XP
          </div>
        </div>
        <div style={{ fontSize: 40 }}>🏆</div>
      </div>

      {/* Daily challenge hero */}
      {dailyChallenge ? (
        <div style={{ marginBottom: 14 }}>
          <ChallengeCard
            task={dailyChallenge}
            onAccept={() => handleAcceptChallenge(dailyChallenge)}
            onComplete={() => handleCompleteChallenge(dailyChallenge)}
          />
        </div>
      ) : (
        <div style={{
          ...LIFEOS_CARD, marginBottom: 14, textAlign: 'center',
          border: `1px dashed ${LIFEOS_COLORS.border}`,
        }}>
          <div style={{ fontSize: 13, color: LIFEOS_COLORS.textSecondary, padding: '10px 0' }}>
            אין אתגר זמין. כל הכבוד שהשלמת הכל! 🎉
          </div>
        </div>
      )}

      {/* Status filter */}
      <div style={{
        display: 'flex', gap: 6, marginBottom: 10, overflowX: 'auto',
        scrollbarWidth: 'none',
      }}>
        <FilterChip active={filter === 'all'}         onClick={() => setFilter('all')}         label="הכל" />
        {TASK_STATUS.map(s => (
          <FilterChip
            key={s.key}
            active={filter === s.key}
            onClick={() => setFilter(s.key)}
            label={s.label}
          />
        ))}
      </div>

      {/* Task list */}
      <div style={{ ...LIFEOS_CARD, padding: 0, overflow: 'hidden' }}>
        {!loaded ? (
          <EmptyRow text="טוען..." />
        ) : regularTasks.length === 0 ? (
          <EmptyRow text={filter === 'all' ? 'אין משימות' : 'אין משימות בסטטוס זה'} />
        ) : (
          regularTasks.map((t, idx) => (
            <TaskRow
              key={t.id}
              task={t}
              isLast={idx === regularTasks.length - 1}
              onToggle={() => handleToggleStatus(t)}
            />
          ))
        )}
      </div>
    </LifeOSLayout>
  );
}

function TaskRow({ task, isLast, onToggle }) {
  const done = task.status === 'completed';
  const diff = DIFFICULTY_BY_KEY[task.difficulty];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '12px 14px',
      borderBottom: isLast ? 'none' : `0.5px solid ${LIFEOS_COLORS.border}`,
      opacity: done ? 0.55 : 1,
    }}>
      <button
        onClick={onToggle}
        style={{
          width: 24, height: 24, borderRadius: 6,
          border: `2px solid ${done ? LIFEOS_COLORS.success : LIFEOS_COLORS.border}`,
          backgroundColor: done ? LIFEOS_COLORS.success : '#FFFFFF',
          color: '#FFFFFF', fontSize: 14, fontWeight: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', flexShrink: 0,
        }}
      >
        {done ? '✓' : ''}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 600, color: LIFEOS_COLORS.textPrimary,
          textDecoration: done ? 'line-through' : 'none',
        }}>
          {task.is_challenge ? '🎯 ' : ''}{task.title}
        </div>
        {(task.category || task.xp_reward > 0 || diff) && (
          <div style={{ fontSize: 11, color: LIFEOS_COLORS.textSecondary, marginTop: 2 }}>
            {task.category || ''}
            {diff && task.difficulty !== 'medium' ? ` • ${diff.label}` : ''}
            {task.xp_reward > 0 ? ` • ${task.xp_reward} XP` : ''}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, label }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 12px', borderRadius: 999,
        border: `1px solid ${active ? LIFEOS_COLORS.primary : LIFEOS_COLORS.border}`,
        backgroundColor: active ? LIFEOS_COLORS.primary : '#FFFFFF',
        color: active ? '#FFFFFF' : LIFEOS_COLORS.textPrimary,
        fontSize: 12, fontWeight: 600, cursor: 'pointer',
        whiteSpace: 'nowrap', flexShrink: 0,
      }}
    >
      {label}
    </button>
  );
}

function EmptyRow({ text }) {
  return (
    <div style={{
      padding: '30px 14px', textAlign: 'center', fontSize: 13, color: LIFEOS_COLORS.textSecondary,
    }}>
      {text}
    </div>
  );
}
