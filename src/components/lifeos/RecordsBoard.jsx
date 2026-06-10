import React from 'react';
import { Link } from 'react-router-dom';
import { LIFEOS_COLORS, LIFEOS_CARD } from '@/lib/lifeos/lifeos-constants';

const fmt = (n) => Math.round(n).toLocaleString('he-IL');

export default function RecordsBoard({ records }) {
  // `to` makes the card a Link to the matching detail page. The leads
  // card has no detail page yet (no scope for it in the current task),
  // so it stays as a plain div.
  const items = [
    { emoji: '💰', label: 'הכנסה הכי גבוהה ביום',  value: records.topDayIncome,   detail: records.topDayDate, isMoney: true, to: '/lifeos/revenue-detail' },
    { emoji: '📊', label: 'הכי הרבה מכירות בשבוע', value: records.topWeekSales,   detail: records.topWeekDate, suffix: ' מכירות',         to: '/lifeos/sales-detail'   },
    { emoji: '🔥', label: 'הרצף הכי ארוך',          value: records.longestStreak,  suffix: ' ימים',                                       to: '/lifeos/streak-detail'  },
    { emoji: '🎬', label: 'הכי הרבה תוכן בשבוע',    value: records.topWeekContent, suffix: ' פוסטים',                                     to: '/lifeos/posts-detail'   },
    { emoji: '👥', label: 'הכי הרבה לידים ביום',     value: records.topDayLeads,    suffix: ' לידים' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
      {items.map((it, i) => {
        const cardContent = (
          <>
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
            {it.to && (
              <div style={{ fontSize: 9, color: LIFEOS_COLORS.primary, marginTop: 4, fontWeight: 700 }}>
                לפירוט ←
              </div>
            )}
          </>
        );
        const baseStyle = { ...LIFEOS_CARD, padding: 12, textAlign: 'center' };
        if (it.to) {
          return (
            <Link
              key={i}
              to={it.to}
              style={{ ...baseStyle, textDecoration: 'none', cursor: 'pointer' }}
            >
              {cardContent}
            </Link>
          );
        }
        return (
          <div key={i} style={baseStyle}>
            {cardContent}
          </div>
        );
      })}
    </div>
  );
}
