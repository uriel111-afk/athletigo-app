import React from 'react';
import { PERSONAL_COLORS } from '@/lib/personal/personal-constants';

const dayKey = (d) => new Date(d).toISOString().slice(0, 10);

export default function HabitHeatmap({ logs }) {
  const today = new Date();
  const cells = [];
  // Last 30 days, oldest first.
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const k = dayKey(d);
    const log = (logs || []).find(l => l.date === k);
    cells.push({ k, done: !!log?.completed, day: d.getDate() });
  }
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)',
      gap: 4, padding: '8px 0',
    }}>
      {cells.map((c, i) => (
        <div key={i} title={c.k} style={{
          aspectRatio: '1', borderRadius: 4,
          backgroundColor: c.done ? PERSONAL_COLORS.success : '#F0E4D0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9, fontWeight: 600,
          color: c.done ? '#FFFFFF' : PERSONAL_COLORS.textMuted,
        }}>
          {c.day}
        </div>
      ))}
    </div>
  );
}
