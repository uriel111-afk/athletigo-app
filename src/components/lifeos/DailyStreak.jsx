import React from 'react';
import { LIFEOS_COLORS } from '@/lib/lifeos/lifeos-constants';

// Small orange badge showing "🔥 streak X days". Compact version used
// in hub header, full version in dashboard.
export default function DailyStreak({ days = 0, compact = false }) {
  const broken = days === 0;
  const color = broken ? LIFEOS_COLORS.textSecondary : LIFEOS_COLORS.primary;
  const bg = broken ? '#F7F3EC' : '#FFF4E6';

  if (compact) {
    return (
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '4px 10px', borderRadius: 999,
        backgroundColor: bg, color,
        fontSize: 12, fontWeight: 700,
      }}>
        <span>🔥</span>
        <span>{days}</span>
      </div>
    );
  }

  return (
    <div style={{
      padding: '10px 14px', borderRadius: 12,
      backgroundColor: bg,
      border: `1px solid ${broken ? LIFEOS_COLORS.border : LIFEOS_COLORS.primary}`,
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <div style={{ fontSize: 26 }}>{broken ? '💤' : '🔥'}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: LIFEOS_COLORS.textSecondary }}>
          רצף פעילות
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, color, lineHeight: 1.1, marginTop: 2 }}>
          {broken ? 'אין רצף עדיין' : `${days} ${days === 1 ? 'יום' : 'ימים'}`}
        </div>
      </div>
    </div>
  );
}
