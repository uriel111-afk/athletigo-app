import React from 'react';
import { LIFEOS_COLORS, LIFEOS_CARD } from '@/lib/lifeos/lifeos-constants';

const fmt = (n) => Math.round(n).toLocaleString('he-IL');

export default function RecordsBoard({ records }) {
  const items = [
    { emoji: '💰', label: 'הכנסה הכי גבוהה ביום',  value: records.topDayIncome,  detail: records.topDayDate, isMoney: true },
    { emoji: '📊', label: 'הכי הרבה מכירות בשבוע', value: records.topWeekSales,  detail: records.topWeekDate, suffix: ' מכירות' },
    { emoji: '🔥', label: 'הרצף הכי ארוך',          value: records.longestStreak, suffix: ' ימים' },
    { emoji: '🎬', label: 'הכי הרבה תוכן בשבוע',    value: records.topWeekContent, suffix: ' פוסטים' },
    { emoji: '👥', label: 'הכי הרבה לידים ביום',     value: records.topDayLeads,    suffix: ' לידים' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
      {items.map((it, i) => (
        <div key={i} style={{ ...LIFEOS_CARD, padding: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 22 }}>{it.emoji}</div>
          <div style={{ fontSize: 10, fontWeight: 600, color: LIFEOS_COLORS.textSecondary, marginTop: 2 }}>
            {it.label}
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: LIFEOS_COLORS.textPrimary, marginTop: 4 }}>
            {it.isMoney ? `${fmt(it.value || 0)}₪` : `${it.value || 0}${it.suffix || ''}`}
          </div>
          {it.detail && (
            <div style={{ fontSize: 10, color: LIFEOS_COLORS.textSecondary, marginTop: 2 }}>
              {new Date(it.detail).toLocaleDateString('he-IL')}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
