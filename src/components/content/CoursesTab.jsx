import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Layers, Tag } from 'lucide-react';
import { useDrops, useClips, FUNNEL_BY_KEY, CLIP_STATUSES } from '@/api/content-api';

const ORANGE = '#FF6F20';

// Rank of each clip status — a chapter counts as "done" once it reaches
// script_ready or beyond (script_ready → filmed → edited → published).
const STATUS_RANK = Object.fromEntries(CLIP_STATUSES.map((s, i) => [s.key, i]));
const READY_RANK = STATUS_RANK.script_ready;

// Strip the price off a product_link ("דרים מאשין — 1,199₪" → "דרים מאשין").
const productName = (link) => (link ? String(link).split(/[—–-]/)[0].trim() : '');

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
      {courses.map((course) => {
        const chapters = chaptersByCourse[course.id] || [];
        const total = chapters.length;
        const done = chapters.filter((c) => (STATUS_RANK[c.status] ?? 0) >= READY_RANK).length;
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
                  <Layers size={14} /> {total} פרקים
                </span>
              </div>

              {/* Progress */}
              <div style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>תסריט מוכן ומעלה</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>{done}/{total}</span>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: 'var(--cream-deep)', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: ORANGE, borderRadius: 999, transition: 'width .3s' }} />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
