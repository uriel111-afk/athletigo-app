import React from 'react';
import { useWindowSize } from '@/hooks/useWindowSize';
import { CHART_COLORS, CHART_HEIGHTS } from './CHART_TOKENS';

// Circular progress ring for an active goal. Stat block to the
// right shows title + description + start / current / target
// trio; the ring itself fills from the brand orange.
//
// Props
//   percent     — 0-100. Clamped on render.
//   title       — short label ("היעד שלך")
//   description — context line ("8 עליות מתח רצופות")
//   start       — number, anchor at goal-set time.
//   current     — number, latest value.
//   target      — number, finish line.
//   unit        — short unit string ("חזרות", "ק״ג")
//
// The ring is hand-built with two SVG circles (background +
// stroke-dasharray progress). No external chart lib — stays sharp
// at any DPR and animates cleanly via CSS transition.

const STROKE = 9;

export default function GoalProgressRing({
  percent,
  title,
  description,
  start,
  current,
  target,
  unit,
}) {
  const { width: viewportWidth } = useWindowSize();
  const isMobile = viewportWidth < 480;
  const size = isMobile ? CHART_HEIGHTS.ring.mobile : CHART_HEIGHTS.ring.desktop;
  const r = (size - STROKE) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
  const dash = (clamped / 100) * circumference;

  return (
    <div
      style={{
        display:    'flex',
        alignItems: 'center',
        gap:        14,
        padding:    '12px 14px',
        direction:  'rtl',
        fontFamily: "'Heebo', 'Assistant', sans-serif",
      }}
    >
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} aria-hidden>
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={CHART_COLORS.primaryFaint}
            strokeWidth={STROKE}
          />
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={CHART_COLORS.primary}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
            // Start at 12 o'clock, rotate -90 from default 3 o'clock.
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{ transition: 'stroke-dasharray 0.6s ease' }}
          />
        </svg>
        <div
          style={{
            position: 'absolute',
            inset:    0,
            display:        'flex',
            flexDirection:  'column',
            alignItems:     'center',
            justifyContent: 'center',
            pointerEvents:  'none',
          }}
        >
          <div
            style={{
              fontSize:   isMobile ? 22 : 26,
              fontWeight: 500,
              color:      CHART_COLORS.text,
              fontFamily: "'Barlow Condensed', 'Heebo', sans-serif",
              lineHeight: 1,
            }}
          >
            {Math.round(clamped)}%
          </div>
          <div
            style={{
              fontSize:  9,
              color:     CHART_COLORS.textMuted,
              marginTop: 2,
            }}
          >
            להשגת היעד
          </div>
        </div>
      </div>

      <div style={{ minWidth: 0, flex: 1, textAlign: 'right' }}>
        {title && (
          <div
            style={{
              fontSize:   12,
              color:      CHART_COLORS.textMuted,
              marginBottom: 2,
            }}
          >
            {title}
          </div>
        )}
        {description && (
          <div
            style={{
              fontSize:   15,
              fontWeight: 600,
              color:      CHART_COLORS.text,
              marginBottom: 8,
              wordBreak:  'break-word',
            }}
          >
            {description}
          </div>
        )}
        <div
          style={{
            display:        'flex',
            justifyContent: 'space-between',
            fontSize:       11,
            color:          CHART_COLORS.textMuted,
            gap:            6,
          }}
        >
          <span>התחלה: <strong style={{ color: CHART_COLORS.text }}>{start ?? '—'}</strong></span>
          <span>נוכחי: <strong style={{ color: CHART_COLORS.primary }}>{current ?? '—'}</strong></span>
          <span>יעד: <strong style={{ color: CHART_COLORS.text }}>{target ?? '—'}</strong></span>
        </div>
        {unit && (
          <div style={{ fontSize: 10, color: CHART_COLORS.textMuted, marginTop: 4, textAlign: 'left' }}>
            {unit}
          </div>
        )}
      </div>
    </div>
  );
}
