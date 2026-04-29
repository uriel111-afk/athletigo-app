import { CHART_COLORS, CHART_SHADOW, CHART_RADIUS } from './CHART_TOKENS';

export default function ChartCard({ title, subtitle, action, children, padding = '14px 4px 10px', breakout = false }) {
  return (
    <div style={{
      background: CHART_COLORS.bgCard,
      border: `1px solid ${CHART_COLORS.border}`,
      borderRadius: CHART_RADIUS,
      boxShadow: CHART_SHADOW,
      padding,
      margin: breakout ? '0 4px' : 0,
    }}>
      {(title || action) && (
        <div style={{
          padding: '0 12px 8px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            {title && <div style={{ fontSize: 16, fontWeight: 500, color: CHART_COLORS.text }}>{title}</div>}
            {subtitle && <div style={{ fontSize: 14, color: CHART_COLORS.textMuted, marginTop: 2 }}>{subtitle}</div>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
