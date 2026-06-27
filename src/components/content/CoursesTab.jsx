import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Layers, Tag } from 'lucide-react';
import { useDrops, useClips, FUNNEL_BY_KEY } from '@/api/content-api';

const ORANGE = '#FF6F20';

// A chapter counts as "completed" once it's been filmed (filmed →
// edited → published). idea / script_ready are still in progress.
const COMPLETED_STATUSES = new Set(['filmed', 'edited', 'published']);
const isCompleted = (status) => COMPLETED_STATUSES.has(status);

// Strip the price off a product_link ("דרים מאשין — 1,199₪" → "דרים מאשין").
const productName = (link) => (link ? String(link).split(/[—–-]/)[0].trim() : '');

// Reusable gray-track / orange-fill bar.
function ProgressBar({ pct, height = 8 }) {
  return (
    <div style={{ height, borderRadius: 999, background: '#E7E0D5', overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: ORANGE, borderRadius: 999, transition: 'width .3s' }} />
    </div>
  );
}

// Courses tab — every course is a content_drop with category='course'.
// Its clips are the chapters. Ordered by priority_order (1-11).
export default function CoursesTab({ coachId }) {
  const navigate = useNavigate();
  const { data: allDrops = [], isLoading } = useDrops();
  const { data: clips = [] } = useClips();

  const courses = useMemo(() => {
    return allDrops
      .filter((d) => d.category === 'course')
      .sort((a, b) => (a.priority_order ?? 999) - (b.priority_order ?? 999));
  }, [allDrops]);

  // chapters grouped by course id
  const chaptersByCourse = useMemo(() => {
    const m = {};
    for (const c of clips) if (c.drop_id) (m[c.drop_id] || (m[c.drop_id] = [])).push(c);
    return m;
  }, [clips]);

  // Overall completion across every course (for the summary bar).
  const overall = useMemo(() => {
    let total = 0, done = 0;
    for (const course of courses) {
      const chs = chaptersByCourse[course.id] || [];
      total += chs.length;
      done += chs.filter((c) => isCompleted(c.status)).length;
    }
    return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
  }, [courses, chaptersByCourse]);

  if (isLoading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Loader2 className="animate-spin" color={ORANGE} /></div>;
  }
  if (!courses.length) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--muted)' }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>🎓</div>
        <div style={{ fontSize: 15, fontWeight: 600 }}>אין קורסים עדיין</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* ── Overall summary bar ───────────────────────────────────── */}
      <div className="ag-card" style={{ padding: 16, borderRadius: 16, background: 'var(--ink)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
            הושלמו {overall.done} מתוך {overall.total} פרקים
          </span>
          <span style={{ fontSize: 20, fontWeight: 900, color: ORANGE }}>{overall.pct}%</span>
        </div>
        <ProgressBar pct={overall.pct} height={10} />
      </div>

      {/* ── Course cards ──────────────────────────────────────────── */}
      {courses.map((course) => {
        const chapters = chaptersByCourse[course.id] || [];
        const total = chapters.length;
        const done = chapters.filter((c) => isCompleted(c.status)).length;
        const pct = total ? Math.round((done / total) * 100) : 0;
        const f = FUNNEL_BY_KEY[course.funnel];
        const product = productName(course.product_link);
        return (
          <div
            key={course.id}
            onClick={() => navigate(`/content/drop/${course.id}`)}
            className="ag-card"
            style={{ padding: 16, borderRadius: 16, cursor: 'pointer', position: 'relative' }}
          >
            {/* Priority badge */}
            <div style={{
              position: 'absolute', insetInlineStart: 14, top: 14,
              width: 30, height: 30, borderRadius: 999, background: 'var(--cream-deep)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 800, color: 'var(--ink)',
            }}>{course.priority_order ?? '–'}</div>

            <div style={{ paddingInlineStart: 40 }}>
              <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.3 }}>
                {course.title || 'קורס ללא שם'}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                {product && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: 12, fontWeight: 700, color: '#fff',
                    padding: '3px 10px', borderRadius: 999,
                    background: f?.color || 'var(--muted)',
                  }}>
                    <Tag size={12} /> מוכר: {product}
                  </span>
                )}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>
                  <Layers size={14} /> {done}/{total} פרקים הושלמו
                </span>
              </div>

              {/* Progress */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
                <div style={{ flex: 1 }}><ProgressBar pct={pct} /></div>
                <span style={{ fontSize: 13, fontWeight: 800, color: pct ? ORANGE : 'var(--muted)', minWidth: 38, textAlign: 'end' }}>{pct}%</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
