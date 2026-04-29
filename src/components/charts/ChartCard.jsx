import React from 'react';
import { CHART_COLORS, CHART_SHADOW, CHART_RADIUS } from './CHART_TOKENS';

// Shared shell for every chart in the AthletiGo system.
// Owns the cream background, warm orange-tinted shadow, rounded
// corners, optional title/subtitle/action header — and absolutely
// nothing else. Every concrete chart goes inside.
//
// Props
//   title      — string. Bold-ish 14px header.
//   subtitle   — string. 12px muted line under the title.
//   action     — ReactNode. Right-aligned slot for a small button
//                or icon (e.g. minimize, info).
//   children   — the chart itself.
//   padding    — body padding override; default leaves a thin
//                gutter so axis labels don't kiss the card edge.
//   breakout   — when true, adds 4px horizontal margin so the card
//                edges line up nicely with a parent that already
//                provides 16px gutters elsewhere on the page.

export default function ChartCard({
  title,
  subtitle,
  action,
  children,
  padding = '14px 4px 10px',
  breakout = false,
}) {
  return (
    <div
      style={{
        background:    CHART_COLORS.bgCard,
        border:        `1px solid ${CHART_COLORS.border}`,
        borderRadius:  CHART_RADIUS,
        boxShadow:     CHART_SHADOW,
        padding,
        margin:        breakout ? '0 4px' : 0,
        direction:     'rtl',
        fontFamily:    "'Heebo', 'Assistant', sans-serif",
      }}
    >
      {(title || action) && (
        <div
          style={{
            padding:        '0 12px 8px',
            display:        'flex',
            justifyContent: 'space-between',
            alignItems:     'center',
            gap:            10,
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            {title && (
              <div
                style={{
                  fontSize:   14,
                  fontWeight: 500,
                  color:      CHART_COLORS.text,
                }}
              >
                {title}
              </div>
            )}
            {subtitle && (
              <div
                style={{
                  fontSize: 12,
                  color:    CHART_COLORS.textMuted,
                  marginTop: 2,
                }}
              >
                {subtitle}
              </div>
            )}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
