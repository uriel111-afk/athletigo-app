import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '@/lib/AuthContext';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import ChallengeCard from '@/components/lifeos/ChallengeCard';
import ConfettiEffect from '@/components/lifeos/ConfettiEffect';
import {
  LIFEOS_COLORS, LIFEOS_CARD, TASK_STATUS, TASK_DIFFICULTY,
} from '@/lib/lifeos/lifeos-constants';
import { Trash2 } from 'lucide-react';
import {
  listTasks, updateTaskStatus, getTotalXP, addTask, deleteTask,
} from '@/lib/lifeos/lifeos-api';
import { toast } from 'sonner';

const DIFFICULTY_BY_KEY = Object.fromEntries(TASK_DIFFICULTY.map(d => [d.key, d]));

// Challenge categories — colored chips for filtering and visual sort.
const CATEGORIES = [
  { key: 'all',       label: 'הכל',     emoji: '✨', color: LIFEOS_COLORS.primary },
  { key: 'content',   label: 'תוכן',    emoji: '🎥', color: '#8B5CF6' },
  { key: 'sales',     label: 'מכירות',  emoji: '💰', color: '#16a34a' },
  { key: 'business',  label: 'עסקים',   emoji: '🏋️', color: '#FF6F20' },
  { key: 'community', label: 'קהילה',   emoji: '🧠', color: '#3B82F6' },
];
const CATEGORY_BY_KEY = Object.fromEntries(CATEGORIES.map(c => [c.key, c]));

// XP level table — name + minimum XP threshold + emoji.
const XP_LEVELS = [
  { level: 1, name: 'מתחיל',  min: 0,    emoji: '🥚' },
  { level: 2, name: 'מתקדם',  min: 101,  emoji: '🌱' },
  { level: 3, name: 'מקצועי', min: 301,  emoji: '🌳' },
  { level: 4, name: 'שחקן',   min: 601,  emoji: '🔥' },
  { level: 5, name: 'אלוף',   min: 1001, emoji: '👑' },
];
const levelFor = (xp) => {
  for (let i = XP_LEVELS.length - 1; i >= 0; i--) if (xp >= XP_LEVELS[i].min) return XP_LEVELS[i];
  return XP_LEVELS[0];
};
const nextLevel = (xp) => XP_LEVELS.find(l => l.min > xp) || null;

// Auto-generate pool — 6 challenges. We seed the user's tasks with
// 3 random ones when their pending list hits zero.
const AUTO_GEN_POOL = [
  { title: 'תכנן סדנת עמידות ידיים לשבוע הבא — מקום, שעה, מחיר', category: 'business', difficulty: 'hard',    xp: 50 },
  { title: 'צור חבילת ליווי אונליין עם 3 רמות מחיר ופרסם',         category: 'business', difficulty: 'medium',  xp: 40 },
  { title: 'צלם 3 דקות מסדנה והפוך לרילס',                          category: 'content',  difficulty: 'medium',  xp: 30 },
  { title: 'תתקשר ל-3 לידים שעוד לא ענית להם',                     category: 'sales',    difficulty: 'medium',  xp: 25 },
  { title: 'תפרסם תוכן על Dream Machine היום',                     category: 'content',  difficulty: 'easy',    xp: 15 },
  { title: 'תכתוב פוסט על למה התחלת את AthletiGo',                 category: 'content',  difficulty: 'hard',    xp: 50 },
];

const pickRandom = (arr, n) => {
  const copy = [...arr];
  const out = [];
  while (out.length < n && copy.length) {
    const i = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(i, 1)[0]);
  }
  return out;
};

const pickDailyChallenge = (tasks) => {
  const challenges = tasks.filter(t => t.is_challenge);
  return challenges.find(t => t.status === 'in_progress')
      || challenges.find(t => t.status === 'pending')
      || null;
};

export default function Tasks() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;

  const [tasks, setTasks] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [xp, setXp] = useState(0);
  const [filter, setFilter] = useState('all');     // status filter
  const [catFilter, setCatFilter] = useState('all'); // category filter
  const [confettiFire, setConfettiFire] = useState(false);
  const [autoGenDoneOnce, setAutoGenDoneOnce] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const [t, totalXp] = await Promise.all([
        listTasks(userId),
        getTotalXP(userId),
      ]);
      setTasks(t || []);
      setXp(totalXp);
      // Auto-generate when zero pending exist (run only once per mount).
      const pendingCount = (t || []).filter(x => x.status === 'pending').length;
      if (pendingCount === 0 && !autoGenDoneOnce) {
        setAutoGenDoneOnce(true);
        const picks = pickRandom(AUTO_GEN_POOL, 3);
        for (const p of picks) {
          await addTask(userId, {
            title: p.title,
            category: p.category,
            difficulty: p.difficulty,
            priority: 'medium',
            status: 'pending',
            is_challenge: true,
            xp_reward: p.xp,
            source: 'auto_generated',
          });
        }
        toast.success('3 משימות חדשות ממתינות לך 🚀');
        // Re-fetch so the new ones show up.
        const fresh = await listTasks(userId);
        setTasks(fresh || []);
      }
    } catch (err) {
      console.error('[Tasks] load error:', err);
      toast.error('שגיאה בטעינה');
    } finally {
      setLoaded(true);
    }
  }, [userId, autoGenDoneOnce]);

  useEffect(() => { load(); }, [load]);

  const dailyChallenge = useMemo(() => pickDailyChallenge(tasks), [tasks]);

  const regularTasks = useMemo(() => {
    let out = tasks.filter(t => t.id !== dailyChallenge?.id);
    if (filter !== 'all')    out = out.filter(t => t.status === filter);
    if (catFilter !== 'all') out = out.filter(t => t.category === catFilter);
    return out;
  }, [tasks, filter, catFilter, dailyChallenge]);

  const handleToggleStatus = async (task) => {
    const nextStatus = task.status === 'completed' ? 'pending' : 'completed';
    const wasIncomplete = task.status !== 'completed';
    try {
      await updateTaskStatus(task.id, nextStatus);
      if (nextStatus === 'completed' && task.xp_reward > 0) {
        toast.success(`+${task.xp_reward} XP! 🎉`);
        // Confetti only when completing (not when un-completing).
        if (wasIncomplete) setConfettiFire(true);
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
    } catch (err) { toast.error('שגיאה: ' + (err?.message || '')); }
  };

  const handleCompleteChallenge = async (task) => {
    try {
      await updateTaskStatus(task.id, 'completed');
      toast.success(`כל הכבוד! +${task.xp_reward} XP 🏆`);
      setConfettiFire(true);
      load();
    } catch (err) { toast.error('שגיאה: ' + (err?.message || '')); }
  };

  const lvl = levelFor(xp);
  const next = nextLevel(xp);
  const lvlPct = next ? ((xp - lvl.min) / (next.min - lvl.min)) * 100 : 100;

  return (
    <LifeOSLayout title="משימות ואתגרים" onQuickSaved={load}>
      <ConfettiEffect fire={confettiFire} onDone={() => setConfettiFire(false)} />

      {/* XP + level bar */}
      <div style={{
        ...LIFEOS_CARD, marginBottom: 12,
        background: `linear-gradient(135deg, ${LIFEOS_COLORS.primary} 0%, #FF8E4E 100%)`,
        color: '#FFFFFF', border: 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.9 }}>סך הנקודות שצברת</div>
            <div style={{ fontSize: 26, fontWeight: 900, marginTop: 2 }}>{xp} XP</div>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 999,
            backgroundColor: 'rgba(255,255,255,0.25)',
          }}>
            <span style={{ fontSize: 18 }}>{lvl.emoji}</span>
            <span style={{ fontSize: 13, fontWeight: 800 }}>רמה {lvl.level} · {lvl.name}</span>
          </div>
        </div>
        {next && (
          <>
            <div style={{
              backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 999, height: 6, overflow: 'hidden',
            }}>
              <div style={{
                width: `${Math.min(100, Math.max(0, lvlPct))}%`, height: '100%',
                backgroundColor: '#FFFFFF', transition: 'width 0.4s ease',
              }} />
            </div>
            <div style={{ fontSize: 10, opacity: 0.85, marginTop: 4, textAlign: 'left' }}>
              {next.min - xp} XP עד רמה {next.level} {next.emoji}
            </div>
          </>
        )}
      </div>

      {/* Daily mission */}
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
            אין אתגר זמין כרגע. מחכים לאתגרים חדשים... 🎯
          </div>
        </div>
      )}

      {/* Category filter chips */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, overflowX: 'auto', scrollbarWidth: 'none' }}>
        {CATEGORIES.map(c => (
          <button
            key={c.key}
            onClick={() => setCatFilter(c.key)}
            style={{
              padding: '6px 12px', borderRadius: 999,
              border: `1px solid ${catFilter === c.key ? c.color : LIFEOS_COLORS.border}`,
              backgroundColor: catFilter === c.key ? c.color : '#FFFFFF',
              color: catFilter === c.key ? '#FFFFFF' : LIFEOS_COLORS.textPrimary,
              fontSize: 11, fontWeight: 700, cursor: 'pointer',
              whiteSpace: 'nowrap', flexShrink: 0,
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <span>{c.emoji}</span><span>{c.label}</span>
          </button>
        ))}
      </div>

      {/* Status filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, overflowX: 'auto', scrollbarWidth: 'none' }}>
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label="הכל" />
        {TASK_STATUS.map(s => (
          <FilterChip key={s.key} active={filter === s.key} onClick={() => setFilter(s.key)} label={s.label} />
        ))}
      </div>

      {/* Task list */}
      <div style={{ ...LIFEOS_CARD, padding: 0, overflow: 'hidden' }}>
        {!loaded ? (
          <EmptyRow text="טוען..." />
        ) : regularTasks.length === 0 ? (
          <EmptyRow text="אין משימות בסינון זה" />
        ) : (
          regularTasks.map((t, idx) => (
            <TaskRow
              key={t.id}
              task={t}
              isLast={idx === regularTasks.length - 1}
              onToggle={() => handleToggleStatus(t)}
              onDelete={async () => {
                if (!confirm('בטוח שאתה רוצה למחוק את המשימה?')) return;
                try { await deleteTask(t.id); toast.success('נמחק'); load(); }
                catch (err) { toast.error('שגיאה: ' + (err?.message || '')); }
              }}
            />
          ))
        )}
      </div>
    </LifeOSLayout>
  );
}

function TaskRow({ task, isLast, onToggle, onDelete }) {
  const done = task.status === 'completed';
  const diff = DIFFICULTY_BY_KEY[task.difficulty];
  const cat = CATEGORY_BY_KEY[task.category];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '12px 14px',
      borderBottom: isLast ? 'none' : `0.5px solid ${LIFEOS_COLORS.border}`,
      opacity: done ? 0.55 : 1,
    }}>
      <button onClick={onToggle} style={{
        width: 24, height: 24, borderRadius: 6,
        border: `2px solid ${done ? LIFEOS_COLORS.success : LIFEOS_COLORS.border}`,
        backgroundColor: done ? LIFEOS_COLORS.success : '#FFFFFF',
        color: '#FFFFFF', fontSize: 14, fontWeight: 800,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', flexShrink: 0,
      }}>
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
            {cat ? `${cat.emoji} ${cat.label}` : task.category || ''}
            {diff && task.difficulty !== 'medium' ? ` • ${diff.label}` : ''}
            {task.xp_reward > 0 ? ` • ${task.xp_reward} XP` : ''}
          </div>
        )}
      </div>
      {onDelete && (
        <button
          onClick={onDelete}
          aria-label="מחק"
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: LIFEOS_COLORS.error, padding: 6, flexShrink: 0,
          }}
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, label }) {
  return (
    <button onClick={onClick} style={{
      padding: '6px 12px', borderRadius: 999,
      border: `1px solid ${active ? LIFEOS_COLORS.primary : LIFEOS_COLORS.border}`,
      backgroundColor: active ? LIFEOS_COLORS.primary : '#FFFFFF',
      color: active ? '#FFFFFF' : LIFEOS_COLORS.textPrimary,
      fontSize: 12, fontWeight: 600, cursor: 'pointer',
      whiteSpace: 'nowrap', flexShrink: 0,
    }}>{label}</button>
  );
}

function EmptyRow({ text }) {
  return <div style={{ padding: '30px 14px', textAlign: 'center', fontSize: 13, color: LIFEOS_COLORS.textSecondary }}>{text}</div>;
}
