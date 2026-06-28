import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronRight, Lock, CheckCircle2, Play, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { useDrop, useClips } from '@/api/content-api';
import { useMyCourseProgress } from '@/api/course-api';

const ORANGE = '#FF6F20';

// Trainee course player — vertical list of day cards with progressive
// unlocking. Day 1 is always open; day N opens once day N-1 is watched.
export default function CoursePlayer() {
  const { dropId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id;

  const { data: drop, isLoading: dropLoading } = useDrop(dropId);
  const { data: clips = [], isLoading: clipsLoading } = useClips(dropId);
  const { byClip, isLoading: progLoading } = useMyCourseProgress(userId, dropId);

  const days = [...clips].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const watchedCount = days.filter((c) => byClip[c.id]?.watched).length;
  const total = days.length || 7;

  if (dropLoading || clipsLoading || progLoading) {
    return <Page><Center><Loader2 className="animate-spin" color={ORANGE} /></Center></Page>;
  }
  if (!drop) {
    return <Page><Center><span style={{ color: 'var(--muted)' }}>הקורס לא נמצא</span></Center></Page>;
  }

  return (
    <Page>
      <div style={headerStyle}>
        <button type="button" onClick={() => navigate('/trainee-home')} style={iconBtn} aria-label="חזרה">
          <ChevronRight size={24} color="#1A1A1A" />
        </button>
        <div style={{ flex: 1, fontWeight: 800, fontSize: 17, color: '#1A1A1A' }}>הקורס שלי</div>
      </div>

      <div style={{ padding: 16, maxWidth: 640, margin: '0 auto' }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: '#1A1A1A', lineHeight: 1.3 }}>{drop.title}</div>
        {drop.description && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6, lineHeight: 1.5 }}>{drop.description}</div>}

        {/* Progress bar */}
        <div style={{ marginTop: 14, marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#1A1A1A' }}>{watchedCount}/{total} ימים הושלמו</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: ORANGE }}>{Math.round((watchedCount / total) * 100)}%</span>
          </div>
          <div style={{ height: 10, borderRadius: 999, background: '#E7E0D5', overflow: 'hidden' }}>
            <div style={{ width: `${(watchedCount / total) * 100}%`, height: '100%', background: ORANGE, borderRadius: 999, transition: 'width .3s' }} />
          </div>
        </div>

        {/* Day cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {days.map((clip, i) => {
            const prev = days[i - 1];
            const unlocked = i === 0 || !!byClip[prev?.id]?.watched;
            const completed = !!byClip[clip.id]?.watched;
            return (
              <DayCard
                key={clip.id}
                num={i + 1}
                title={clip.title}
                unlocked={unlocked}
                completed={completed}
                onOpen={() => unlocked && navigate(`/course/${dropId}/day/${clip.id}`)}
              />
            );
          })}
        </div>
      </div>
    </Page>
  );
}

function DayCard({ num, title, unlocked, completed, onOpen }) {
  const border = completed ? '#22c55e' : unlocked ? ORANGE : '#E7E0D5';
  return (
    <div
      onClick={unlocked ? onOpen : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14,
        background: unlocked ? '#fff' : '#F5F0E8',
        border: `2px solid ${border}`, cursor: unlocked ? 'pointer' : 'default',
        opacity: unlocked ? 1 : 0.65,
      }}
    >
      <div style={{
        width: 44, height: 44, borderRadius: 12, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: completed ? '#22c55e' : unlocked ? '#FFF0E4' : '#E7E0D5',
        color: completed ? '#fff' : unlocked ? ORANGE : '#9A8F82',
        fontSize: 20, fontWeight: 900,
      }}>
        {completed ? <CheckCircle2 size={24} /> : unlocked ? num : <Lock size={20} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)' }}>יום {num}</div>
        <div style={{ fontSize: 15, fontWeight: 800, color: unlocked ? '#1A1A1A' : '#9A8F82', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
        </div>
        {!unlocked && <div style={{ fontSize: 11, color: '#9A8F82', marginTop: 2 }}>צפה ביום {num - 1} קודם</div>}
      </div>
      {unlocked && (
        <div style={{ flexShrink: 0, color: completed ? '#22c55e' : ORANGE }}>
          <Play size={20} />
        </div>
      )}
    </div>
  );
}

function Page({ children }) {
  return (
    <div dir="rtl" style={{ position: 'fixed', inset: 0, background: 'var(--cream, #FBF3EA)', zIndex: 1000, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
      {children}
    </div>
  );
}
function Center({ children }) {
  return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 60 }}>{children}</div>;
}

const headerStyle = {
  position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', gap: 8,
  padding: '12px 12px', paddingTop: 'max(env(safe-area-inset-top), 12px)',
  background: 'rgba(251,243,234,0.92)', backdropFilter: 'blur(8px)', borderBottom: '1px solid #F0E4D0',
};
const iconBtn = { background: 'transparent', border: 'none', cursor: 'pointer', padding: 6, display: 'flex' };
