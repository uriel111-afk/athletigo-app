import React from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useWindowSize } from '@/hooks/useWindowSize';
import { CHART_COLORS, CHART_HEIGHTS, RTL_DEFAULTS } from './CHART_TOKENS';

// Smooth filled area chart for continuous trends (weight, BMI,
// volume). Colour gradient softens at the bottom so the eye reads
// the line, not the fill.
//
// Props
//   data    — [{ date: string, value: number }]
//   height  — optional override (number).
//   yLabel  — short unit string ("ק״ג", "%"), shown in tooltip.
//   color   — line + fill base colour. Defaults to brand orange.
//   title, subtitle, action — passed through if you want to render
//                             without ChartCard wrapping; otherwise
//                             wrap externally.
//
// Edge cases
//   data.length === 0 → null (caller renders empty state).
//   data.length === 1 → spotlight card with the single value.

export default function FilledArea({
  data,
  height,
  yLabel,
  color = CHART_COLORS.primary,
}) {
  const { width: viewportWidth } = useWindowSize();
  const isMobile = viewportWidth < 480;
  const resolvedHeight = height ?? (isMobile ? CHART_HEIGHTS.area.mobile : CHART_HEIGHTS.area.desktop);

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
            color,
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
          נקודה אחת — נוסיף עוד מדידות כדי לראות מגמה
        </div>
      </div>
    );
  }

  // Each component instance gets its own gradient id so multiple
  // FilledArea charts on the same page don't collide.
  const gradId = React.useId
    ? `areaGrad-${React.useId().replace(/:/g, '')}`
    : `areaGrad-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <ResponsiveContainer width="100%" height={resolvedHeight}>
      <AreaChart
        data={data}
        margin={{ top: 20, right: 8, left: 8, bottom: 30 }}
      >
        <defs>
          <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%"   stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid
          vertical={false}
          strokeDasharray="3 3"
          stroke={CHART_COLORS.border}
        />
        <XAxis dataKey="date" {...RTL_DEFAULTS.xAxis} />
        <YAxis
          {...RTL_DEFAULTS.yAxis}
          domain={['auto', 'dataMax + 1']}
        />
        <Tooltip
          {...RTL_DEFAULTS.tooltip}
          formatter={(value) => yLabel ? [`${value} ${yLabel}`] : [value]}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2.5}
          fill={`url(#${gradId})`}
          activeDot={{ r: 5, fill: color, stroke: 'white', strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
