import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { useWindowSize } from '../../hooks/useWindowSize';
import { CHART_COLORS, RTL_DEFAULTS, CHART_HEIGHTS } from './CHART_TOKENS';

export default function FilledArea({ data = [], color = CHART_COLORS.primary, yLabel, height: customHeight }) {
  const { width } = useWindowSize();
  const isMobile = width < 480;
  const height = customHeight || (isMobile ? CHART_HEIGHTS.area.mobile : CHART_HEIGHTS.area.desktop);

  if (data.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 16px', color: CHART_COLORS.textMuted }}>
        אין נתונים עדיין
      </div>
    );
  }

  if (data.length === 1) {
    const point = data[0];
    return (
      <div style={{ textAlign: 'center', padding: '24px 16px' }}>
        <div style={{ fontSize: 12, color: CHART_COLORS.textMuted, marginBottom: 12 }}>הנקודה הראשונה — המשך לתעד</div>
        <div style={{ fontSize: 32, fontWeight: 500, color: CHART_COLORS.text }}>{point.value}{yLabel ? ` ${yLabel}` : ''}</div>
        <div style={{ fontSize: 12, color: CHART_COLORS.textMuted, marginTop: 4 }}>{point.date}</div>
      </div>
    );
  }

  const gradId = `areaGrad-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3}/>
            <stop offset="100%" stopColor={color} stopOpacity={0}/>
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.border} vertical={false}/>
        <YAxis {...RTL_DEFAULTS.yAxis} domain={['auto', 'dataMax + 1']}/>
        <XAxis {...RTL_DEFAULTS.xAxis} dataKey="date"/>
        <Tooltip {...RTL_DEFAULTS.tooltip}/>
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2.5} fill={`url(#${gradId})`} dot={false} activeDot={{ r: 5, fill: 'white', stroke: color, strokeWidth: 2.5 }}/>
      </AreaChart>
    </ResponsiveContainer>
  );
}
