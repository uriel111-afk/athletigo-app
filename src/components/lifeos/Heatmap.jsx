import React from 'react';
import { LIFEOS_COLORS } from '@/lib/lifeos/lifeos-constants';

const dayKey = (d) => new Date(d).toISOString().slice(0, 10);

// GitHub-style heatmap for the last 12 weeks (≈ 3 months).
// `activity` is a Map<dayKey, count>.
export default function Heatmap({ activity }) {
  const weeks = 12;
  const today = new Date();
  const cells = [];
  const labels = [];

  for (let w = weeks - 1; w >= 0; w--) {
    for (let d = 6; d >= 0; d--) {
      const day = new Date(today);
      // Walk backwards: w weeks * 7 days + d offset from "today's weekday".
      day.setDate(today.getDate() - (w * 7 + d));
      const k = dayKey(day);
      const count = activity.get(k) || 0;
      cells.push({ day, count, k });
    }
  }

  // Month labels row — only show when first week of a month appears.
  const seenMonths = new Set();
  for (let w = weeks - 1; w >= 0; w--) {
    const firstDay = new Date(today);
    firstDay.setDate(today.getDate() - (w * 7 + 6));
    const m = firstDay.getMonth();
    if (!seenMonths.has(m)) {
      labels.push({ col: weeks - 1 - w, label: firstDay.toLocaleDateString('he-IL', { month: 'short' }) });
      seenMonths.add(m);
    }
  }

  const colorFor = (n) => {
    if (!n) return '#F0E4D0';
    if (n === 1) return '#FFD4A6';
    if (n <= 3) return '#FFA460';
    if (n <= 6) return '#FF7A28';
    return LIFEOS_COLORS.primary;
  };

  // Build grid: 7 rows (days of week), 12 cols (weeks).
  const grid = Array.from({ length: 7 }, () => []);
  cells.forEach((c, i) => {
    const row = i % 7;
    grid[row].push(c);
  });

  return (
    <div style={{ direction: 'ltr', overflowX: 'auto' }}>
      <div style={{
        display: 'grid', gridTemplateRows: 'auto',
        gap: 3, padding: '4px 0',
      }}>
        {grid.map((row, ri) => (
          <div key={ri} style={{ display: 'flex', gap: 3 }}>
            {row.map((cell, ci) => (
              <div key={ci} title={`${cell.k}: ${cell.count}`}
                   style={{
                     width: 14, height: 14, borderRadius: 3,
                     backgroundColor: colorFor(cell.count),
                   }} />
            ))}
          </div>
        ))}
      </div>
      <div style={{
        display: 'flex', gap: 4, alignItems: 'center', marginTop: 8,
        fontSize: 10, color: LIFEOS_COLORS.textSecondary, justifyContent: 'flex-end',
        direction: 'rtl',
      }}>
        <span>פחות</span>
        {[0, 1, 2, 5, 8].map((n, i) => (
          <div key={i} style={{
            width: 10, height: 10, borderRadius: 2, backgroundColor: colorFor(n),
          }} />
        ))}
        <span>יותר</span>
      </div>
    </div>
  );
}
