import { CHART_COLORS } from './CHART_TOKENS';

export default function HeroSparkline({ label, value, unit, trend = 0, trendLabel, data = [] }) {
  const hasSpark = data.length >= 2;

  let pathD = '';
  let lastX = 95, lastY = 25;
  if (hasSpark) {
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    pathD = data.map((v, i) => {
      const x = 5 + (i / (data.length - 1)) * 90;
      const y = 45 - ((v - min) / range) * 35;
      if (i === data.length - 1) { lastX = x; lastY = y; }
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');
  }

  const trendUp = trend > 0;
  const trendChipBg = trend === 0 ? '#F3F4F6' : (trendUp ? CHART_COLORS.greenSoft : '#FEE2E2');
  const trendChipColor = trend === 0 ? CHART_COLORS.textMuted : (trendUp ? CHART_COLORS.green : '#DC2626');

  return (
    <div style={{
      background: CHART_COLORS.bgCard,
      border: `1px solid ${CHART_COLORS.border}`,
      borderRadius: 14,
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6), 0 8px 18px -6px rgba(255,111,32,0.14), 0 3px 8px -2px rgba(96,51,17,0.08), 0 1px 2px rgba(96,51,17,0.04)',
      padding: 20,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, color: CHART_COLORS.textMuted, marginBottom: 4 }}>{label}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <div style={{ fontSize: 44, fontWeight: 500, color: CHART_COLORS.text, lineHeight: 1 }}>{value}</div>
            {unit && <div style={{ fontSize: 14, color: CHART_COLORS.textMuted }}>{unit}</div>}
          </div>
          {trendLabel && (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              background: trendChipBg,
              color: trendChipColor,
              padding: '5px 12px',
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 500,
              marginTop: 8,
            }}>
              {trend !== 0 && (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  {trendUp
                    ? <path d="M5 2 L8 6 L2 6 Z" fill={trendChipColor}/>
                    : <path d="M5 8 L2 4 L8 4 Z" fill={trendChipColor}/>}
                </svg>
              )}
              {trendLabel}
            </div>
          )}
        </div>
        {hasSpark && (
          <svg viewBox="0 0 100 50" style={{ width: 120, height: 60, flexShrink: 0 }}>
            <path d={pathD} fill="none" stroke={CHART_COLORS.primary} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx={lastX} cy={lastY} r="8" fill={CHART_COLORS.primary} opacity="0.2"/>
            <circle cx={lastX} cy={lastY} r="5" fill={CHART_COLORS.primary}/>
          </svg>
        )}
      </div>
    </div>
  );
}
