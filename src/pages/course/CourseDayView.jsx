import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronRight, Check, Video, Loader2, ArrowLeft, PartyPopper } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { useDrop, useClips } from '@/api/content-api';
import { useMyCourseProgress, useCourseMutations } from '@/api/course-api';

const ORANGE = '#FF6F20';

export default function CourseDayView() {
  const { dropId, clipId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id;

  const { data: drop } = useDrop(dropId);
  const { data: clips = [] } = useClips(dropId);
  const { byClip } = useMyCourseProgress(userId, dropId);
  const mut = useCourseMutations(userId, dropId);

  const days = useMemo(() => [...clips].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)), [clips]);
  const idx = days.findIndex((c) => c.id === clipId);
  const clip = idx >= 0 ? days[idx] : null;
  const nextClip = idx >= 0 && idx < days.length - 1 ? days[idx + 1] : null;
  const isLastDay = idx === days.length - 1 && days.length > 0;
  const progress = byClip[clipId];
  const watched = !!progress?.watched;

  const questions = Array.isArray(clip?.comprehension_questions) ? clip.comprehension_questions : [];
  const [answers, setAnswers] = useState({});
  const [uploading, setUploading] = useState(false);

  // Seed answers from saved progress once it arrives.
  useEffect(() => {
    if (progress?.answers && typeof progress.answers === 'object') setAnswers(progress.answers);
  }, [progress?.id]);

  if (!clip) {
    return <Page><Center><Loader2 className="animate-spin" color={ORANGE} /></Center></Page>;
  }

  const dayNum = idx + 1;

  const markWatched = () => {
    mut.markWatched.mutate(clipId, {
      onSuccess: () => {
        toast.success('סומן כנצפה ✓');
        if (isLastDay) mut.markComplete.mutate(clipId);
      },
      onError: (e) => { console.error(e); toast.error('שמירה נכשלה'); },
    });
  };

  const saveAnswer = (qIndex, value) => {
    const next = { ...answers, [qIndex]: value };
    setAnswers(next);
    mut.saveAnswers.mutate({ clipId, answers: next });
  };

  const onReady = () => {
    if (!watched) mut.markWatched.mutate(clipId);
    mut.setReady.mutate({ clipId, ready: true });
    if (nextClip) navigate(`/course/${dropId}/day/${nextClip.id}`);
  };

  const onPickVideo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await new Promise((res, rej) => mut.saveVideo.mutate({ clipId, url: file_url }, { onSuccess: res, onError: rej }));
      toast.success('הוידאו נשלח למאמן ✓');
    } catch (err) {
      console.error('[CourseDayView] video upload failed', err);
      toast.error('העלאת הוידאו נכשלה');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Page>
      <div style={headerStyle}>
        <button type="button" onClick={() => navigate(`/course/${dropId}`)} style={iconBtn} aria-label="חזרה">
          <ChevronRight size={24} color="#1A1A1A" />
        </button>
        <div style={{ flex: 1, fontWeight: 800, fontSize: 16, color: '#1A1A1A' }}>יום {dayNum}</div>
      </div>

      <div style={{ padding: 16, paddingBottom: 40, maxWidth: 640, margin: '0 auto' }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: '#1A1A1A', marginBottom: 12 }}>{clip.title}</div>

        {/* Video placeholder — script shown for reading until a real
            video URL exists. */}
        <div style={{ background: '#1A1A1A', borderRadius: 14, padding: '14px 16px', color: '#fff' }}>
          <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.7, marginBottom: 8 }}>🎬 הסרטון יתווסף בקרוב</div>
          <div style={{ fontSize: 15, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{clip.script}</div>
        </div>

        {/* Mark watched */}
        <button type="button" onClick={markWatched} disabled={watched || mut.markWatched.isPending} style={{
          width: '100%', height: 48, marginTop: 14, borderRadius: 14, border: 'none', cursor: watched ? 'default' : 'pointer',
          background: watched ? '#22c55e' : ORANGE, color: '#fff', fontSize: 16, fontWeight: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <Check size={20} /> {watched ? 'נצפה' : 'סמן כנצפה ✓'}
        </button>

        {/* Comprehension questions */}
        {questions.length > 0 && (
          <div style={{ marginTop: 22 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#1A1A1A', marginBottom: 10 }}>שאלות הבנה</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {questions.map((q, i) => {
                if (q.type === 'ready') {
                  return (
                    <button key={i} type="button" onClick={onReady} style={{
                      width: '100%', padding: '14px 16px', borderRadius: 14, border: 'none', cursor: 'pointer',
                      background: '#1A1A1A', color: '#fff', fontSize: 16, fontWeight: 800,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}>
                      {q.q?.includes('האחרון') ? 'אני מוכן ליום האחרון' : 'אני מוכן ליום הבא'} <ArrowLeft size={18} />
                    </button>
                  );
                }
                return (
                  <div key={i} style={{ background: '#fff', borderRadius: 12, padding: 12, border: '1px solid #F0E4D0' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1A1A1A', marginBottom: 8 }}>{q.q}</div>
                    <textarea
                      value={answers[i] || ''}
                      onChange={(e) => setAnswers({ ...answers, [i]: e.target.value })}
                      onBlur={(e) => saveAnswer(i, e.target.value)}
                      rows={2} dir="rtl" placeholder="התשובה שלך..."
                      style={inp}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Optional video submission */}
        <div style={{ marginTop: 22, background: '#FFF8F0', borderRadius: 12, padding: 14, border: '1px solid #F0E4D0' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#5C4A3A', marginBottom: 4 }}>רוצה לשלוח וידאו של המשימה? (לא חובה)</div>
          {progress?.video_submitted_url ? (
            <div style={{ fontSize: 13, color: '#16a34a', fontWeight: 700, marginTop: 6 }}>✓ הוידאו נשלח למאמן</div>
          ) : (
            <label style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 8, padding: '9px 16px',
              borderRadius: 999, background: ORANGE, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}>
              {uploading ? <Loader2 size={16} className="animate-spin" /> : <Video size={16} />}
              {uploading ? 'מעלה...' : 'שלח וידאו'}
              <input type="file" accept="video/*" capture="user" onChange={onPickVideo} disabled={uploading} style={{ display: 'none' }} />
            </label>
          )}
        </div>

        {/* Day 7 completion */}
        {isLastDay && watched && drop && (
          <div style={{ marginTop: 22, background: '#fff', borderRadius: 16, padding: 18, border: `2px solid ${ORANGE}`, textAlign: 'center' }}>
            <PartyPopper size={36} color={ORANGE} style={{ margin: '0 auto 8px' }} />
            <div style={{ fontSize: 15, lineHeight: 1.7, color: '#1A1A1A', whiteSpace: 'pre-wrap', fontWeight: 600 }}>
              {drop.completion_message}
            </div>
            {drop.completion_cta_url && (
              <button type="button" onClick={() => window.open(drop.completion_cta_url, '_blank')} style={{
                width: '100%', height: 48, marginTop: 14, borderRadius: 14, border: 'none', cursor: 'pointer',
                background: ORANGE, color: '#fff', fontSize: 16, fontWeight: 800,
              }}>{drop.completion_cta_text || 'ספר לי עוד'}</button>
            )}
          </div>
        )}
      </div>
    </Page>
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
const inp = {
  width: '100%', padding: '9px 11px', borderRadius: 10, border: '1px solid #F0E4D0',
  background: '#fff', fontSize: 14, color: '#1A1A1A', outline: 'none', boxSizing: 'border-box',
  resize: 'vertical', fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
};
