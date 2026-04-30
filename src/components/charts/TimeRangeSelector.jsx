import { CHART_COLORS } from './CHART_TOKENS';
import { TIME_RANGES } from '../../lib/chartDataHelpers';

export default function TimeRangeSelector({ value = '30d', onChange }) {
  return (
    <div style={{
      display: 'flex',
      gap: 4,
      padding: '0 16px',
      marginBottom: 12,
    }}>
      {TIME_RANGES.map(r => {
        const isActive = r.key === value;
        return (
          <button
            key={r.key}
            onClick={() => onChange(r.key)}
            style={{
              flex: 1,
              height: 36,
              border: 'none',
              borderRadius: 10,
              background: isActive ? CHART_COLORS.primary : CHART_COLORS.primaryFaint,
              color: isActive ? 'white' : CHART_COLORS.primary,
              fontSize: 13,
              fontWeight: isActive ? 600 : 400,
              fontFamily: 'inherit',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}
