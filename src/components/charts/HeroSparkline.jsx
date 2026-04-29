import React from 'react';
import { CHART_COLORS } from './CHART_TOKENS';

// Hero metric tile — used for top-of-dashboard "key number" cards.
// Hand-rolled SVG sparkline (no Recharts) because the shape is
// trivial and we want pixel-perfect control over the trailing
// halo dot.
//
// Props
//   label      — string ("מתאמנים פעילים")
//   value      — number | string ("23")
//   unit       — string ("מתאמנים")
//   trend      — number; positive = green up, negative = red down,
//                 0 = grey neutral.
//   trendLabel — context for the trend ("משבוע שעבר")
//   data       — number[]; ≥2 points to draw the line.
//
// Layout: sparkline on the visual-left (RTL = the trail going
// "back in time"); label + value + trend chip on the visual-right.
// When data has fewer than 2 points, the sparkline is omitted and
// the value cell takes the full width.

const SVG_W = 100;
const SVG_H = 50;
const PAD = 4;

function buildPath(data) {
  if (!Array.isArray(data) || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = (SVG_W - PAD * 2) / (data.length - 1);
  return data
    .map((v, i) => {
      const x = PAD + i * step;
      const y = PAD + (SVG_H - PAD * 2) * (1 - (v - min) / range);
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

function lastPoint(data) {
  if (!Array.isArray(data) || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = (SVG_W - PAD * 2) / (data.length - 1);
  const i = data.length - 1;
  return {
    x: PAD + i * step,
    y: PAD + (SVG_H - PAD * 2) * (1 - (data[i] - min) / range),
  };
}

function trendStyle(trend) {
  if (trend > 0) {
    return { bg: CHART_COLORS.greenSoft, fg: CHART_COLORS.green, sign: '↑' };
  }
  if (trend < 0) {
    return { bg: '#FEE2E2', fg: '#DC2626', sign: '↓' };
  }
  return { bg: '#F3F4F6', fg: CHART_COLORS.textMuted, sign: '·' };
}

export default function HeroSparkline({
  label,
  value,
  unit,
  trend,
  trendLabel,
  data,
}) {
  const path = buildPath(data);
  const tip = lastPoint(data);
  const trendOk = typeof trend === 'number' && Number.isFinite(trend);
  const ts = trendOk ? trendStyle(trend) : null;

  return (
    <div
      style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        gap:            10,
        padding:        '12px 14px',
        direction:      'rtl',
        fontFamily:     "'Heebo', 'Assistant', sans-serif",
      }}
    >
      {path && (
        <div style={{ flexShrink: 0 }}>
          <svg
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            width={SVG_W}
            height={SVG_H}
            aria-hidden
          >
            <path
              d={path}
              fill="none"
              stroke={CHART_COLORS.primary}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {tip && (
              <>
                <circle
                  cx={tip.x}
                  cy={tip.y}
                  r={6}
                  fill={CHART_COLORS.primary}
                  opacity={0.2}
                />
                <circle
                  cx={tip.x}
                  cy={tip.y}
                  r={3}
                  fill={CHART_COLORS.primary}
                />
              </>
            )}
          </svg>
        </div>
      )}

      <div style={{ minWidth: 0, flex: 1, textAlign: 'right' }}>
        {label && (
          <div
            style={{
              fontSize:   11,
              color:      CHART_COLORS.textMuted,
              marginBottom: 2,
              overflow:   'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </div>
        )}
        <div
          style={{
            fontSize:   24,
            fontWeight: 700,
            color:      CHART_COLORS.text,
            lineHeight: 1.1,
            fontFamily: "'Barlow Condensed', 'Heebo', sans-serif",
          }}
        >
          {value}
          {unit && (
            <span
              style={{
                fontSize:   12,
                fontWeight: 500,
                color:      CHART_COLORS.textMuted,
                marginInlineStart: 4,
              }}
            >
              {unit}
            </span>
          )}
        </div>
        {trendOk && ts && (
          <div
            style={{
              display:    'inline-flex',
              alignItems: 'center',
              gap:        4,
              marginTop:  4,
              padding:    '2px 8px',
              borderRadius: 999,
              background: ts.bg,
              color:      ts.fg,
              fontSize:   11,
              fontWeight: 600,
            }}
          >
            <span aria-hidden>{ts.sign}</span>
            <span>{Math.abs(trend)}%</span>
            {trendLabel && (
              <span style={{ color: CHART_COLORS.textMuted, fontWeight: 500 }}>
                {trendLabel}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
