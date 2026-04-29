import React, { useRef, useState, useEffect } from 'react';
import { useWindowSize } from '@/hooks/useWindowSize';
import { CHART_COLORS, CHART_HEIGHTS } from './CHART_TOKENS';

// Stepped progression chart with star milestones — for personal
// records. Hand-rolled SVG (no Recharts) so we control every dot
// shape, halo, and the trailing star precisely.
//
// Props
//   data   — [{ date: string, value: number, isPR?: boolean }]
//            Order assumed earliest→latest; the chart reverses
//            internally for RTL flow (latest visually on the left).
//   height — optional override.
//   yLabel — string for the trailing tooltip / y axis.
//
// Edge cases
//   data.length === 0 → null (caller draws empty-state CTA).
//   data.length === 1 → spotlight card with the single value.

const PAD = { t: 30, r: 16, b: 36, l: 40 };
const Y_TICKS = 3;

function buildSteps(data, w, h) {
  const min = Math.min(...data.map(d => d.value));
  const max = Math.max(...data.map(d => d.value));
  const range = max - min || 1;
  const xRange = w - PAD.l - PAD.r;
  const yRange = h - PAD.t - PAD.b;
  const step = data.length > 1 ? xRange / (data.length - 1) : 0;
  const points = data.map((d, i) => ({
    ...d,
    // Reverse x for RTL — earliest on the right, latest on the left.
    x: w - PAD.r - i * step,
    y: PAD.t + yRange * (1 - (d.value - min) / range),
  }));

  // Step path (square-shaped, not smooth): vertical → horizontal
  // pairs from each point to the next.
  const segments = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (i === 0) {
      segments.push(`M ${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
    } else {
      const prev = points[i - 1];
      // Step: go vertical to new y, then horizontal to new x.
      segments.push(`L ${prev.x.toFixed(1)} ${p.y.toFixed(1)}`);
      segments.push(`L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
    }
  }

  return { points, path: segments.join(' '), min, max };
}

// Five-point star centred at (cx, cy) with the given radius.
function starPath(cx, cy, r, innerR = r * 0.45) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    const radius = i % 2 === 0 ? r : innerR;
    pts.push(`${(cx + radius * Math.cos(angle)).toFixed(2)},${(cy + radius * Math.sin(angle)).toFixed(2)}`);
  }
  return `M ${pts.join(' L ')} Z`;
}

export default function StepMilestones({
  data,
  height,
  yLabel,
}) {
  const { width: viewportWidth } = useWindowSize();
  const isMobile = viewportWidth < 480;
  const resolvedHeight = height ?? (isMobile ? CHART_HEIGHTS.step.mobile : CHART_HEIGHTS.step.desktop);

  // Measure the actual rendered width so the SVG scales 1:1 with
  // the parent — no responsive container needed.
  const wrapRef = useRef(null);
  const [svgW, setSvgW] = useState(360);
  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry?.contentRect?.width) setSvgW(entry.contentRect.width);
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  if (!Array.isArray(data) || data.length === 0) return null;

  if (data.length === 1) {
    const only = data[0];
    return (
      <div
        style={{
          minHeight:      resolvedHeight,
          display:        'flex',
          flexDirection:  'column',
          alignItems:     'center',
          justifyContent: 'center',
          padding:        20,
          direction:      'rtl',
          fontFamily:     "'Heebo', 'Assistant', sans-serif",
        }}
      >
        <div style={{ fontSize: 12, color: CHART_COLORS.textMuted, marginBottom: 6 }}>
          {only?.date || '—'}
        </div>
        <div
          style={{
            fontSize:   42,
            fontWeight: 700,
            color:      CHART_COLORS.primary,
            fontFamily: "'Barlow Condensed', 'Heebo', sans-serif",
            lineHeight: 1.1,
          }}
        >
          {only?.value}
          {yLabel && (
            <span
              style={{
                fontSize:   16,
                color:      CHART_COLORS.textMuted,
                fontWeight: 500,
                marginInlineStart: 6,
              }}
            >
              {yLabel}
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: CHART_COLORS.textMuted, marginTop: 8 }}>
          השיא הראשון — שמור על המומנטום
        </div>
      </div>
    );
  }

  const w = Math.max(svgW, 100);
  const h = resolvedHeight;
  const { points, path, min, max } = buildSteps(data, w, h);

  // Last data point = the trainee's current best. Bigger badge.
  const lastIdx = points.length - 1;

  // Y-axis tick values evenly between min and max.
  const yTicks = Array.from({ length: Y_TICKS }, (_, i) => {
    const t = i / (Y_TICKS - 1);
    return Math.round(min + (max - min) * t);
  });

  return (
    <div
      ref={wrapRef}
      style={{
        width: '100%',
        direction: 'rtl',
        fontFamily: "'Heebo', 'Assistant', sans-serif",
      }}
    >
      <svg width={w} height={h} role="img" aria-label="גרף שיאים אישיים">
        {/* Y axis on the right (RTL). 3 grid lines + tick labels. */}
        {yTicks.map((tickVal, i) => {
          const t = (Y_TICKS - 1 - i) / (Y_TICKS - 1);
          const y = PAD.t + (h - PAD.t - PAD.b) * (1 - t);
          return (
            <g key={`y-${i}`}>
              <line
                x1={PAD.l}
                x2={w - PAD.r}
                y1={y}
                y2={y}
                stroke={CHART_COLORS.border}
                strokeDasharray="3 3"
              />
              <text
                x={w - 8}
                y={y + 3}
                textAnchor="end"
                fontSize={10}
                fill={CHART_COLORS.textMuted}
              >
                {tickVal}
              </text>
            </g>
          );
        })}

        {/* The step line itself */}
        <path
          d={path}
          fill="none"
          stroke={CHART_COLORS.primary}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Per-point markers. PR points get a star inside a soft
            halo; the trailing point gets a bigger filled badge. */}
        {points.map((p, i) => {
          const last = i === lastIdx;
          if (last) {
            return (
              <g key={`pt-${i}`}>
                <circle cx={p.x} cy={p.y} r={11} fill={CHART_COLORS.primary} />
                <path
                  d={starPath(p.x, p.y, 6)}
                  fill="white"
                />
                <text
                  x={p.x}
                  y={p.y - 16}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={700}
                  fill={CHART_COLORS.text}
                >
                  {p.value}{yLabel ? ` ${yLabel}` : ''}
                </text>
              </g>
            );
          }
          if (p.isPR) {
            return (
              <g key={`pt-${i}`}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={9}
                  fill={CHART_COLORS.primaryFaint}
                  stroke={CHART_COLORS.primary}
                  strokeWidth={1.5}
                />
                <path
                  d={starPath(p.x, p.y, 4)}
                  fill={CHART_COLORS.primary}
                />
              </g>
            );
          }
          return (
            <circle
              key={`pt-${i}`}
              cx={p.x}
              cy={p.y}
              r={4}
              fill="white"
              stroke={CHART_COLORS.primary}
              strokeWidth={1.5}
            />
          );
        })}

        {/* Date labels under each point — only first, last, and
            evenly-spaced ones to avoid clutter on long histories. */}
        {points.map((p, i) => {
          const showLabel = i === 0
            || i === lastIdx
            || (points.length > 4 && i === Math.floor(lastIdx / 2));
          if (!showLabel) return null;
          return (
            <text
              key={`d-${i}`}
              x={p.x}
              y={h - 12}
              textAnchor="middle"
              fontSize={10}
              fill={CHART_COLORS.textMuted}
            >
              {p.date}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
