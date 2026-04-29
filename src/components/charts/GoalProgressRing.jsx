import { useWindowSize } from '../../hooks/useWindowSize';
import { CHART_COLORS, CHART_HEIGHTS } from './CHART_TOKENS';

export default function GoalProgressRing({ percent = 0, title, description, start, current, target, unit }) {
  const { width: winWidth } = useWindowSize();
  const isMobile = winWidth < 480;
  const size = isMobile ? 130 : CHART_HEIGHTS.ring.desktop;

  const radius = size * 0.4;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(100, Math.max(0, percent)) / 100);

  return (
    <div style={{
      background: CHART_COLORS.bgCard,
      border: `1px solid ${CHART_COLORS.border}`,
      borderRadius: 14,
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6), 0 8px 18px -6px rgba(255,111,32,0.14), 0 3px 8px -2px rgba(96,51,17,0.08), 0 1px 2px rgba(96,51,17,0.04)',
      padding: 16,
    }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size, flexShrink: 0 }}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={CHART_COLORS.primaryFaint} strokeWidth="12"/>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={CHART_COLORS.primary} strokeWidth="12" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} transform={`rotate(-90 ${size / 2} ${size / 2})`}/>
          <text x={size / 2} y={size / 2 - 2} textAnchor="middle" fontSize="32" fontWeight="500" fill={CHART_COLORS.text}>{Math.round(percent)}%</text>
          <text x={size / 2} y={size / 2 + 18} textAnchor="middle" fontSize="12" fill={CHART_COLORS.textMuted}>להשגת היעד</text>
        </svg>

        <div style={{ flex: 1, minWidth: 0 }}>
          {title && <div style={{ fontSize: 15, color: CHART_COLORS.textMuted, marginBottom: 2 }}>{title}</div>}
          {description && <div style={{ fontSize: 18, fontWeight: 500, color: CHART_COLORS.text, marginBottom: 12 }}>{description}</div>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {start != null && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: CHART_COLORS.textMuted }}>התחלה</span>
                <span style={{ fontSize: 14, color: CHART_COLORS.text, fontWeight: 500 }}>{start}{unit ? ` ${unit}` : ''}</span>
              </div>
            )}
            {current != null && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: CHART_COLORS.primary, fontWeight: 500 }}>נוכחי</span>
                <span style={{ fontSize: 14, color: CHART_COLORS.primary, fontWeight: 500 }}>{current}{unit ? ` ${unit}` : ''}</span>
              </div>
            )}
            {target != null && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: CHART_COLORS.textMuted }}>יעד</span>
                <span style={{ fontSize: 14, color: CHART_COLORS.text, fontWeight: 500 }}>{target}{unit ? ` ${unit}` : ''}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
