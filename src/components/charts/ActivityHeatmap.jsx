import React, { useMemo } from 'react';
import { useWindowSize } from '@/hooks/useWindowSize';
import { CHART_COLORS } from './CHART_TOKENS';

// Activity heatmap — GitHub-style 7-column grid for the last N
// days. Each cell carries an intensity bucket 0..3 that drives the
// fill colour. Renders as a CSS grid (no SVG) so it stays sharp at
// any DPR and the parent can resize the cells freely.
//
// Props
//   data  — [{ date: 'YYYY-MM-DD', intensity: 0|1|2|3 }]
//   days  — number of days to show. Default 28 (4 weeks).
//   title — optional heading rendered above the grid.
//
// The cell mapping date→intensity is keyed by ISO date, so the
// caller can pre-aggregate (e.g. count sessions per day, then map
// to bucket) and pass the result without further normalization.

const INTENSITY_COLOR = {
  0: CHART_COLORS.primaryFaint,
  1: CHART_COLORS.primarySoft,
  2: CHART_COLORS.primaryLight,
  3: CHART_COLORS.primary,
};

const isoDay = (d) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export default function ActivityHeatmap({ data, days = 28, title }) {
  const { width: viewportWidth } = useWindowSize();
  const isMobile = viewportWidth < 480;

  // Build a stable date→intensity map keyed by YYYY-MM-DD. Missing
  // entries fall through to intensity 0 (rest day).
  const byDate = useMemo(() => {
    const m = new Map();
    for (const row of (data || [])) {
      if (row?.date) m.set(String(row.date).slice(0, 10), Number(row.intensity) || 0);
    }
    return m;
  }, [data]);

  // Generate the cell list ending today, going back `days` total.
  const cells = useMemo(() => {
    const out = [];
    const todayKey = isoDay(new Date());
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = isoDay(d);
      out.push({
        key,
        intensity: byDate.get(key) ?? 0,
        isToday: key === todayKey,
        label: d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' }),
      });
    }
    return out;
  }, [byDate, days]);

  const trainingDays = cells.filter(c => c.intensity > 0).length;

  return (
    <div
      style={{
        direction:  'rtl',
        fontFamily: "'Heebo', 'Assistant', sans-serif",
      }}
    >
      {title && (
        <div
          style={{
            display:        'flex',
            justifyContent: 'space-between',
            alignItems:     'center',
            padding:        '0 12px 8px',
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 500, color: CHART_COLORS.text }}>
            {title}
          </div>
          <div style={{ fontSize: 12, color: CHART_COLORS.textMuted }}>
            {trainingDays} ימי אימון
          </div>
        </div>
      )}

      <div
        style={{
          display:             'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap:                 isMobile ? 4 : 6,
          padding:             '4px 12px',
        }}
      >
        {cells.map((cell) => (
          <div
            key={cell.key}
            title={`${cell.label} — ${cell.intensity > 0 ? `${cell.intensity}+ פעילות` : 'מנוחה'}`}
            style={{
              aspectRatio:  '1',
              borderRadius: 4,
              background:   INTENSITY_COLOR[cell.intensity] || INTENSITY_COLOR[0],
              border:       cell.isToday ? `1.5px solid ${CHART_COLORS.primary}` : '1px solid rgba(0,0,0,0.04)',
            }}
          />
        ))}
      </div>

      <div
        style={{
          display:        'flex',
          justifyContent: 'flex-end',
          alignItems:     'center',
          gap:            6,
          padding:        '8px 12px 4px',
          fontSize:       11,
          color:          CHART_COLORS.textMuted,
        }}
      >
        <span>פחות</span>
        {[0, 1, 2, 3].map((lvl) => (
          <span
            key={lvl}
            style={{
              width:        12,
              height:       12,
              borderRadius: 3,
              background:   INTENSITY_COLOR[lvl],
              border:       '1px solid rgba(0,0,0,0.04)',
            }}
            aria-hidden
          />
        ))}
        <span>יותר</span>
      </div>
    </div>
  );
}
