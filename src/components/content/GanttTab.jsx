import React, { useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useDrops, useClips, FUNNEL_BY_KEY } from '@/api/content-api';

const DAY = 86400000;
const DAY_W = 46;        // px per day on the axis
const LANE_H = 60;       // px per drop lane
const BLOCK_DAYS = 4;    // visual width of a drop block, in days
const HEADER_H = 30;

const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

// Gantt / timeline — every drop is a colored block sitting on its
// publish_date; clips show as dots inside. A red line marks today and
// the view auto-centers on the current week.
export default function GanttTab() {
  const navigate = useNavigate();
  const { data: allDrops = [], isLoading } = useDrops();
  const { data: clips = [] } = useClips();
  const scrollRef = useRef(null);

  // Marketing drops only — courses have their own (non-dated) flow.
  const drops = useMemo(() => allDrops.filter((d) => d.category !== 'course'), [allDrops]);

  const clipsByDrop = useMemo(() => {
    const m = {};
    for (const c of clips) if (c.drop_id) (m[c.drop_id] || (m[c.drop_id] = [])).push(c);
    return m;
  }, [clips]);

  const model = useMemo(() => {
    const today = startOfDay(Date.now());
    const dated = drops.filter((d) => d.publish_date);
    const times = dated.map((d) => startOfDay(d.publish_date));
    // Range: at least 2 weeks before / 5 weeks after today, extended to
    // cover every dated drop.
    let min = Math.min(today - 14 * DAY, ...(times.length ? times : [today]));
    let max = Math.max(today + 35 * DAY, ...(times.length ? times.map((t) => t + BLOCK_DAYS * DAY) : [today]));
    min = startOfDay(min); max = startOfDay(max);
    const totalDays = Math.round((max - min) / DAY) + 1;

    // Greedy lane assignment so blocks don't overlap horizontally.
    const sorted = [...dated].sort((a, b) => startOfDay(a.publish_date) - startOfDay(b.publish_date));
    const laneEnds = []; // dayIndex each lane is free from
    const placed = sorted.map((d) => {
      const dayIndex = Math.round((startOfDay(d.publish_date) - min) / DAY);
      let lane = laneEnds.findIndex((end) => end <= dayIndex);
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(0); }
      laneEnds[lane] = dayIndex + BLOCK_DAYS;
      return { drop: d, dayIndex, lane };
    });
    const lanes = Math.max(1, laneEnds.length);
    const todayIndex = Math.round((today - min) / DAY);
    return { min, totalDays, placed, lanes, todayIndex,
             undated: dated.length !== drops.length ? drops.filter((d) => !d.publish_date) : [] };
  }, [drops]);

  // Center the current week on first paint.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || isLoading) return;
    const target = model.todayIndex * DAY_W - el.clientWidth / 2 + DAY_W / 2;
    el.scrollLeft = Math.max(0, target);
  }, [isLoading, model.todayIndex]);

  if (isLoading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Loader2 className="animate-spin" color="#FF6F20" /></div>;
  }
  if (!drops.length) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--muted)' }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>📅</div>
        <div style={{ fontSize: 15, fontWeight: 600 }}>אין דרופים על הציר</div>
      </div>
    );
  }

  const trackWidth = model.totalDays * DAY_W;
  const trackHeight = HEADER_H + model.lanes * LANE_H + 16;

  return (
    <div>
      {/* The axis itself is LTR so day columns increase left→right; the
          drop labels inside stay RTL. */}
      <div ref={scrollRef} style={{
        overflowX: 'auto', overflowY: 'hidden', WebkitOverflowScrolling: 'touch',
        borderRadius: 16, background: '#fff', border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-soft)', direction: 'ltr',
      }}>
        <div style={{ position: 'relative', width: trackWidth, height: trackHeight }}>
          {/* Day grid + week labels */}
          {Array.from({ length: model.totalDays }).map((_, i) => {
            const t = model.min + i * DAY;
            const d = new Date(t);
            const isWeekStart = d.getDay() === 0; // Sunday
            return (
              <div key={i} style={{
                position: 'absolute', top: 0, bottom: 0, left: i * DAY_W, width: DAY_W,
                borderLeft: isWeekStart ? '1px solid var(--border)' : '1px solid rgba(240,228,208,0.4)',
              }}>
                {isWeekStart && (
                  <div style={{ position: 'absolute', top: 6, left: 4, fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Today marker */}
          <div style={{
            position: 'absolute', top: 0, bottom: 0,
            left: model.todayIndex * DAY_W + DAY_W / 2, width: 2,
            background: '#e34948', zIndex: 5,
          }}>
            <div style={{
              position: 'absolute', top: 2, left: -16, width: 34, textAlign: 'center',
              fontSize: 9, fontWeight: 800, color: '#fff', background: '#e34948',
              borderRadius: 4, padding: '1px 0',
            }}>היום</div>
          </div>

          {/* Drop blocks */}
          {model.placed.map(({ drop, dayIndex, lane }) => {
            const f = FUNNEL_BY_KEY[drop.funnel];
            const color = f?.color || '#9A8F82';
            const dropClips = clipsByDrop[drop.id] || [];
            return (
              <div
                key={drop.id}
                onClick={() => navigate(`/content/drop/${drop.id}`)}
                style={{
                  position: 'absolute',
                  left: dayIndex * DAY_W + 3,
                  top: HEADER_H + lane * LANE_H + 6,
                  width: BLOCK_DAYS * DAY_W - 6,
                  height: LANE_H - 12,
                  background: color, borderRadius: 10, cursor: 'pointer',
                  padding: '6px 8px', color: '#fff', overflow: 'hidden',
                  boxShadow: '0 3px 8px rgba(0,0,0,0.18)', direction: 'rtl',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {drop.title || 'דרופ'}
                </div>
                <div style={{ display: 'flex', gap: 3, marginTop: 5, flexWrap: 'wrap' }}>
                  {dropClips.slice(0, 12).map((c) => (
                    <span key={c.id} style={{ width: 6, height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.9)' }} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Undated drops — can't sit on the axis, listed below. */}
      {model.undated.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 8 }}>ללא תאריך</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {model.undated.map((d) => {
              const f = FUNNEL_BY_KEY[d.funnel];
              return (
                <button key={d.id} type="button" onClick={() => navigate(`/content/drop/${d.id}`)} style={{
                  padding: '6px 12px', borderRadius: 999, border: 'none', cursor: 'pointer',
                  background: f?.color || '#9A8F82', color: '#fff', fontSize: 12, fontWeight: 700,
                }}>{d.title || 'דרופ'}</button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
