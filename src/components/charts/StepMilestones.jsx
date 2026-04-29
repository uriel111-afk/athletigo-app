import { useEffect, useRef, useState } from 'react';
import { useWindowSize } from '../../hooks/useWindowSize';
import { CHART_COLORS, CHART_HEIGHTS } from './CHART_TOKENS';

const SERIES_COLORS = [
  CHART_COLORS.primary,
  CHART_COLORS.green,
  CHART_COLORS.purple,
  '#F59E0B',
  '#EC4899',
  '#0EA5E9',
  '#84CC16',
  '#EF4444',
];

export default function StepMilestones({
  series = null,
  data = null,
  yLabel,
  goalTarget = null,
  goalProjection = null,
}) {
  const { width: winWidth } = useWindowSize();
  const isMobile = winWidth < 480;
  const height = isMobile
    ? Math.max(280, CHART_HEIGHTS.step.mobile)
    : CHART_HEIGHTS.step.desktop;

  // Dynamic SVG width — track the parent's px width so the chart
  // scales edge-to-edge at any container size without losing absolute
  // coordinates (we draw in raw px, not viewBox units, so the
  // padding stays a real 16px instead of stretching with zoom).
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(350);
  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) setContainerWidth(w);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const normalizedSeries = series && series.length > 0
    ? series
    : (data && data.length > 0 ? [{ name: 'default', color: CHART_COLORS.primary, data }] : []);

  const allPoints = normalizedSeries.flatMap(s => s.data || []);

  if (allPoints.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 16px', color: CHART_COLORS.textMuted }}>
        אין שיאים עדיין
      </div>
    );
  }

  if (allPoints.length === 1 && normalizedSeries.length === 1) {
    const p = allPoints[0];
    return (
      <div style={{ textAlign: 'center', padding: '24px 16px' }}>
        <div style={{ fontSize: 12, color: CHART_COLORS.textMuted, marginBottom: 12 }}>
          השיא הראשון נרשם — המשך לתעד
        </div>
        <div style={{ display: 'inline-block', position: 'relative', padding: '10px 30px' }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: 'white',
            border: `3px solid ${normalizedSeries[0].color || CHART_COLORS.primary}`,
            display: 'inline-block',
          }}/>
        </div>
        <div style={{ fontSize: 28, fontWeight: 500, color: CHART_COLORS.text, marginTop: 8 }}>
          {p.value}{yLabel ? ` ${yLabel}` : ''}
        </div>
        <div style={{ fontSize: 12, color: CHART_COLORS.textMuted, marginTop: 2 }}>{p.date}</div>
      </div>
    );
  }

  const W = containerWidth, H = height;
  const padX = isMobile ? 8 : 20;
  const padTop = 24;
  const padBottom = 28;

  const allValues = [
    ...allPoints.map(p => p.value),
    ...(goalTarget != null ? [goalTarget] : []),
    ...(goalProjection ? goalProjection.map(p => p.value) : []),
  ];
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const range = maxVal - minVal || 1;
  const yPad = range * 0.1;
  const yMin = minVal - yPad;
  const yMax = maxVal + yPad;
  const yRange = yMax - yMin || 1;

  // Include projection dates in the x-axis so an endDate that
  // falls after the last observed record still resolves to a real
  // x coordinate via xFor(). Without this, projection's future
  // point lands at NaN and the dashed line never renders.
  const projectionDates = goalProjection ? goalProjection.map(p => p.date) : [];
  const allDates = [...new Set([...allPoints.map(p => p.date), ...projectionDates])].sort();
  const dateIndex = new Map(allDates.map((d, i) => [d, i]));
  const dateCount = allDates.length || 1;

  const xFor = (date) => padX + (dateIndex.get(date) / Math.max(1, dateCount - 1)) * (W - padX * 2);
  const yFor = (value) => H - padBottom - ((value - yMin) / yRange) * (H - padTop - padBottom);

  const goalY = goalTarget != null ? yFor(goalTarget) : null;

  const renderSeries = (s, seriesIdx) => {
    if (!s.data || s.data.length === 0) return null;
    const color = s.color || SERIES_COLORS[seriesIdx % SERIES_COLORS.length];
    const sorted = [...s.data].sort((a, b) => a.date.localeCompare(b.date));
    // Horizontal jitter for multi-series mode — different exercises
    // logged on the same date stack on identical x and become a
    // single visual point. Centered offset (±6px per series step)
    // spreads them while keeping the date column readable.
    const jitter = normalizedSeries.length > 1
      ? (seriesIdx - (normalizedSeries.length - 1) / 2) * 6
      : 0;
    const points = sorted.map(d => ({ ...d, x: xFor(d.date) + jitter, y: yFor(d.value) }));

    let pathD = '';
    points.forEach((p, i) => {
      if (i === 0) pathD += `M ${p.x} ${p.y}`;
      else {
        const prev = points[i - 1];
        pathD += ` L ${p.x} ${prev.y} L ${p.x} ${p.y}`;
      }
    });

    const isSingleSeries = normalizedSeries.length === 1;
    let runningMax = -Infinity;
    const enriched = points.map(p => {
      const isPR = p.value > runningMax;
      if (isPR) runningMax = p.value;
      return { ...p, isPR };
    });

    return (
      <g key={seriesIdx}>
        <path d={pathD} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" opacity={isSingleSeries ? 1 : 0.85}/>
        {enriched.map((p, i) => {
          const isLast = i === enriched.length - 1;
          // PR detection runs per-series, so the star/halo treatment
          // is meaningful in multi-series mode too — each exercise
          // gets its own milestone markers.
          if (!p.isPR) {
            return <circle key={i} cx={p.x} cy={p.y} r="5" fill={color}/>;
          }
          if (isLast) {
            return (
              <g key={i} transform={`translate(${p.x},${p.y})`}>
                <circle r="14" fill={color}/>
                <path d="M0,-6.5 L2,-2 L6.5,-1.6 L2.9,1.6 L3.9,6.5 L0,4.2 L-3.9,6.5 L-2.9,1.6 L-6.5,-1.6 L-2,-2 Z" fill="white"/>
                <text x="0" y="-22" textAnchor="middle" fontSize="14" fill={color} fontWeight="600">{p.value}</text>
              </g>
            );
          }
          return (
            <g key={i} transform={`translate(${p.x},${p.y})`}>
              <circle r="12" fill={CHART_COLORS.primaryFaint} stroke={color} strokeWidth="1.5"/>
              <path d="M0,-5.4 L1.6,-1.6 L5.4,-1.3 L2.4,1.3 L3.2,5.4 L0,3.4 L-3.2,5.4 L-2.4,1.3 L-5.4,-1.3 L-1.6,-1.6 Z" fill={color}/>
            </g>
          );
        })}
      </g>
    );
  };

  let projPath = '';
  if (goalProjection && goalProjection.length >= 2) {
    const sorted = [...goalProjection].sort((a, b) => a.date.localeCompare(b.date));
    sorted.forEach((p, i) => {
      const x = xFor(p.date);
      const y = yFor(p.value);
      projPath += `${i === 0 ? 'M' : 'L'} ${x} ${y} `;
    });
  }

  return (
    <div ref={containerRef} style={{ width: '100%', padding: 0, margin: 0 }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height, display: 'block', maxWidth: 'none' }}
        preserveAspectRatio="xMidYMid meet"
      >
        {[0.25, 0.5, 0.75].map((r, i) => (
          <line key={i} x1={padX} y1={padTop + r * (H - padTop - padBottom)} x2={W - padX} y2={padTop + r * (H - padTop - padBottom)} stroke="#E8DCC8" strokeWidth="1" strokeDasharray="3 3"/>
        ))}

        {/* Y-axis tick labels — anchored on the right edge for RTL.
            Skipping r=0 so the bottom value doesn't collide with the
            X-axis date label, and using textAnchor="end" so labels
            terminate at W-4 without overflow. */}
        {[0.25, 0.5, 0.75, 1].map((r, i) => {
          const val = Math.round(yMin + r * yRange);
          const y = H - padBottom - r * (H - padTop - padBottom);
          return (
            <text key={`y-${i}`} x={W - 4} y={y + 4} textAnchor="end" fontSize="12" fill="#888">
              {val}
            </text>
          );
        })}

        {goalY != null && (
          <g>
            <line x1={padX} y1={goalY} x2={W - padX} y2={goalY} stroke={CHART_COLORS.primary} strokeWidth="2" strokeDasharray="5 4" opacity="0.6"/>
            <text x={W - padX - 4} y={goalY - 4} textAnchor="end" fontSize="12" fill={CHART_COLORS.primary} fontWeight="500">יעד · {goalTarget}{yLabel ? ` ${yLabel}` : ''}</text>
          </g>
        )}

        {projPath && (
          <path d={projPath} fill="none" stroke={CHART_COLORS.primary} strokeWidth="1.5" strokeDasharray="5 4" opacity="0.5"/>
        )}

        {normalizedSeries.map(renderSeries)}

        <text x={padX} y={H - 6} textAnchor="start" fontSize="12" fill={CHART_COLORS.textMuted}>{allDates[0]}</text>
        <text x={W - padX} y={H - 6} textAnchor="end" fontSize="12" fill={CHART_COLORS.textMuted}>{allDates[allDates.length - 1]}</text>
      </svg>
    </div>
  );
}
