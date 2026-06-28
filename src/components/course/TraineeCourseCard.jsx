import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Play } from 'lucide-react';
import { usePurchasableCourse, useMyCourseProgress } from '@/api/course-api';
import { useClips } from '@/api/content-api';

const ORANGE = '#FF6F20';

// Prominent course card shown on the trainee home when a purchasable
// course exists. Renders nothing if there's no course (so the home is
// unchanged for trainees without one).
export default function TraineeCourseCard({ userId }) {
  const navigate = useNavigate();
  const { data: drop } = usePurchasableCourse();
  const { data: clips = [] } = useClips(drop?.id);
  const { byClip } = useMyCourseProgress(userId, drop?.id);

  if (!drop) return null;

  const days = [...clips].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const total = days.length || 7;
  const watched = days.filter((c) => byClip[c.id]?.watched).length;
  const pct = Math.round((watched / total) * 100);
  const started = watched > 0;

  return (
    <div
      onClick={() => navigate(`/course/${drop.id}`)}
      style={{
        margin: '12px 14px 0', borderRadius: 18, padding: 18, cursor: 'pointer',
        background: 'linear-gradient(135deg, #FF8A3D 0%, #FF6F20 100%)', color: '#fff',
        boxShadow: '0 8px 22px rgba(255,111,32,0.35)',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.85 }}>הקורס שלי</div>
      <div style={{ fontSize: 20, fontWeight: 900, marginTop: 2, lineHeight: 1.25 }}>{drop.title}</div>

      <div style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
          <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.9 }}>{watched}/{total} ימים</span>
          <span style={{ fontSize: 12, fontWeight: 800 }}>{pct}%</span>
        </div>
        <div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.3)', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: '#fff', borderRadius: 999 }} />
        </div>
      </div>

      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 14,
        background: '#fff', color: ORANGE, padding: '9px 18px', borderRadius: 999,
        fontSize: 14, fontWeight: 800,
      }}>
        <Play size={16} /> {started ? 'המשך' : 'התחל'}
      </div>
    </div>
  );
}
