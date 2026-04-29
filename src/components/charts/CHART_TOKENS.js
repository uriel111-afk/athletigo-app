// Single source of truth for the AthletiGo chart system. Every
// chart component in this folder pulls colours, dimensions, and
// RTL defaults from here so the visual language stays coherent
// without per-component drift.

export const CHART_COLORS = {
  primary:       '#FF6F20',
  primaryLight:  '#FFA570',
  primarySoft:   '#FFD9C2',
  primaryFaint:  '#FFF5EE',
  green:         '#16A34A',
  greenSoft:     '#D1FAE5',
  purple:        '#7C3AED',
  purpleSoft:    '#EDE9FE',
  text:          '#1a1a1a',
  textMuted:     '#888',
  border:        '#F5E8D5',
  bgCard:        '#FFFEFC',
  bgSubtle:      '#FFF9F0',
};

// Soft warm shadow used by ChartCard. Three layers — top inner
// highlight + warm orange glow + neutral underbody — so cards
// feel lifted on a cream background without looking heavy.
export const CHART_SHADOW =
  'inset 0 1px 0 rgba(255,255,255,0.6), ' +
  '0 8px 18px -6px rgba(255,111,32,0.14), ' +
  '0 3px 8px -2px rgba(96,51,17,0.08), ' +
  '0 1px 2px rgba(96,51,17,0.04)';

export const CHART_RADIUS = 14;

// Per-chart-type heights, indexed by viewport bucket. useWindowSize
// resolves which bucket the surface is in (mobile = width < 480).
export const CHART_HEIGHTS = {
  hero:    { mobile: 50,  desktop: 60  },
  area:    { mobile: 180, desktop: 240 },
  step:    { mobile: 200, desktop: 260 },
  ring:    { mobile: 110, desktop: 140 },
  heatmap: { mobile: 'auto', desktop: 'auto' },
};

// Recharts axis + tooltip props that almost every chart wants
// in an RTL Hebrew context. Spread these into each chart's
// XAxis / YAxis / Tooltip and override only what the chart
// specifically needs.
export const RTL_DEFAULTS = {
  yAxis: {
    orientation: 'right',
    width:       32,
    tick:        { fontSize: 10, fill: CHART_COLORS.textMuted },
    tickMargin:  4,
    axisLine:    false,
    tickLine:    false,
  },
  xAxis: {
    reversed:   false,
    padding:    { left: 12, right: 12 },
    tick:       { fontSize: 10, fill: CHART_COLORS.textMuted },
    tickMargin: 6,
    axisLine:   false,
    tickLine:   false,
    minTickGap: 24,
  },
  tooltip: {
    wrapperStyle: { maxWidth: 180, fontSize: 11, direction: 'rtl', zIndex: 100 },
    contentStyle: {
      background:   '#FFFEFC',
      border:       '1px solid #F5E8D5',
      borderRadius: 10,
      padding:      8,
    },
  },
};
