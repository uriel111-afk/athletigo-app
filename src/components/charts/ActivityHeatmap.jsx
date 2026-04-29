import { CHART_COLORS, HEATMAP_INTENSITY } from './CHART_TOKENS';

export default function ActivityHeatmap({ data = [], days = 28, title, todayKey }) {
  const totalActive = data.filter(d => d.intensity > 0).length;

  return (
    <div style={{
      background: CHART_COLORS.bgCard,
      border: `1px solid ${CHART_COLORS.border}`,
      borderRadius: 14,
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6), 0 8px 18px -6px rgba(255,111,32,0.14), 0 3px 8px -2px rgba(96,51,17,0.08), 0 1px 2px rgba(96,51,17,0.04)',
      padding: 16,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 500, color: CHART_COLORS.text }}>{title || `${days} ימים אחרונים`}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{ fontSize: 24, fontWeight: 500, color: CHART_COLORS.primary }}>{totalActive}</span>
          <span style={{ fontSize: 11, color: CHART_COLORS.textMuted }}>ימי אימון</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, direction: 'ltr' }}>
        {data.slice(-days).map((d, i) => {
          const isToday = todayKey && d.date === todayKey;
          return (
            <div key={i} style={{
              aspectRatio: '1',
              background: HEATMAP_INTENSITY[d.intensity] || HEATMAP_INTENSITY[0],
              borderRadius: 6,
              border: isToday ? `2.5px solid ${CHART_COLORS.primary}` : 'none',
            }}/>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, fontSize: 12, color: CHART_COLORS.textMuted }}>
        <span>פחות</span>
        <div style={{ display: 'flex', gap: 3 }}>
          {[0, 1, 2, 3].map(k => (
            <div key={k} style={{ width: 14, height: 14, background: HEATMAP_INTENSITY[k], borderRadius: 2 }}/>
          ))}
        </div>
        <span>יותר</span>
      </div>
    </div>
  );
}
