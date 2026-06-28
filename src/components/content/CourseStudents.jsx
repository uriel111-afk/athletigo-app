import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, ChevronDown, Video, Check } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import { useClips } from '@/api/content-api';
import { useDropProgress, useFeedbackMutation } from '@/api/course-api';

const ORANGE = '#FF6F20';

// Coach view of trainee progress on a purchasable course. Lists every
// student with a course_progress row, expandable to their per-day
// answers + submitted videos, with a feedback box per submission.
export default function CourseStudents({ dropId }) {
  const { data: clips = [] } = useClips(dropId);
  const { data: progress = [], isLoading } = useDropProgress(dropId);
  const fb = useFeedbackMutation(dropId);
  const [openId, setOpenId] = useState(null);

  const days = useMemo(() => [...clips].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)), [clips]);
  const total = days.length || 7;
  const dayNum = useMemo(() => Object.fromEntries(days.map((c, i) => [c.id, i + 1])), [days]);

  const userIds = useMemo(() => [...new Set(progress.map((p) => p.user_id))], [progress]);
  const { data: names = {} } = useQuery({
    queryKey: ['course-students-names', dropId, userIds.join(',')],
    queryFn: async () => {
      if (!userIds.length) return {};
      const { data } = await supabase.from('users').select('id, full_name').in('id', userIds);
      return Object.fromEntries((data || []).map((u) => [u.id, u.full_name]));
    },
    enabled: userIds.length > 0,
  });

  // Group progress rows by student.
  const students = useMemo(() => {
    const m = {};
    for (const p of progress) (m[p.user_id] || (m[p.user_id] = [])).push(p);
    return Object.entries(m).map(([uid, rows]) => {
      const watched = rows.filter((r) => r.watched).length;
      const currentDay = rows.filter((r) => r.watched).reduce((mx, r) => Math.max(mx, dayNum[r.chapter_clip_id] || 0), 0);
      const last = rows.map((r) => r.completed_at).filter(Boolean).sort().slice(-1)[0];
      return { uid, rows, watched, currentDay, last, pct: Math.round((watched / total) * 100) };
    }).sort((a, b) => b.watched - a.watched);
  }, [progress, dayNum, total]);

  if (isLoading) return <Center><Loader2 className="animate-spin" color={ORANGE} /></Center>;
  if (!students.length) {
    return <div style={{ textAlign: 'center', padding: 24, color: 'var(--muted)', fontSize: 13 }}>אין עדיין תלמידים בקורס</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {students.map((s) => {
        const open = openId === s.uid;
        return (
          <div key={s.uid} className="ag-card" style={{ borderRadius: 14, overflow: 'hidden' }}>
            <button type="button" onClick={() => setOpenId(open ? null : s.uid)} style={{
              width: '100%', textAlign: 'right', border: 'none', background: 'transparent', cursor: 'pointer',
              padding: 12, display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>{names[s.uid] || 'תלמיד'}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  יום {s.currentDay}/{total} · {s.pct}% הושלם
                </div>
              </div>
              <div style={{ width: 60, height: 6, borderRadius: 999, background: '#E7E0D5', overflow: 'hidden' }}>
                <div style={{ width: `${s.pct}%`, height: '100%', background: ORANGE }} />
              </div>
              <ChevronDown size={18} color="var(--muted)" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
            </button>

            {open && (
              <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {days.map((clip) => {
                  const row = s.rows.find((r) => r.chapter_clip_id === clip.id);
                  if (!row) return null;
                  const answers = row.answers && typeof row.answers === 'object' ? row.answers : {};
                  const qs = Array.isArray(clip.comprehension_questions) ? clip.comprehension_questions : [];
                  return (
                    <div key={clip.id} style={{ background: '#FCFAF6', borderRadius: 10, padding: 10, border: '1px solid #F0E4D0' }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)', marginBottom: 6 }}>
                        {row.watched && <Check size={13} color="#22c55e" style={{ marginInlineEnd: 4 }} />}{clip.title}
                      </div>
                      {qs.map((q, i) => (answers[i] ? (
                        <div key={i} style={{ marginBottom: 6 }}>
                          <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>{q.q}</div>
                          <div style={{ fontSize: 13, color: 'var(--ink)' }}>{answers[i]}</div>
                        </div>
                      ) : null))}
                      {row.video_submitted_url && (
                        <a href={row.video_submitted_url} target="_blank" rel="noreferrer" style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700,
                          color: '#fff', background: ORANGE, padding: '5px 10px', borderRadius: 999, textDecoration: 'none', marginTop: 4,
                        }}><Video size={13} /> צפה בוידאו</a>
                      )}
                      {(row.video_submitted_url || Object.keys(answers).length > 0) && (
                        <FeedbackBox row={row} onSave={(feedback) => fb.mutate({ progressId: row.id, feedback }, {
                          onSuccess: () => toast.success('הפידבק נשמר'),
                          onError: (e) => { console.error(e); toast.error('שמירה נכשלה'); },
                        })} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FeedbackBox({ row, onSave }) {
  const [v, setV] = useState(row.feedback || '');
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, marginBottom: 3 }}>פידבק מאמן</div>
      <textarea
        value={v} onChange={(e) => setV(e.target.value)}
        onBlur={() => { if (v !== (row.feedback || '')) onSave(v); }}
        rows={2} dir="rtl" placeholder="כתוב פידבק לתלמיד..."
        style={{
          width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #F0E4D0',
          background: '#fff', fontSize: 13, color: 'var(--ink)', outline: 'none', boxSizing: 'border-box', resize: 'vertical',
          fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
        }}
      />
    </div>
  );
}

function Center({ children }) {
  return <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>{children}</div>;
}
