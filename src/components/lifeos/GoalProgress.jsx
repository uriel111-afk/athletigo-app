import React from 'react';
import { LIFEOS_COLORS, LIFEOS_CARD, YEARLY_GOAL } from '@/lib/lifeos/lifeos-constants';

const fmt = (n) => Math.round(n).toLocaleString('he-IL');

export default function GoalProgress({ current = 0, target = YEARLY_GOAL }) {
  const pct = target > 0 ? Math.min(100, Math.max(0, (current / target) * 100)) : 0;
  const remaining = Math.max(0, target - current);

  return (
    <div style={{ ...LIFEOS_CARD }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10,
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: LIFEOS_COLORS.textSecondary }}>
          יעד שנתי
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: LIFEOS_COLORS.primary }}>
          {pct.toFixed(1)}%
        </div>
      </div>

      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 12,
      }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: LIFEOS_COLORS.textPrimary }}>
          {fmt(current)}₪
        </div>
        <div style={{ fontSize: 14, color: LIFEOS_COLORS.textSecondary }}>
          / {fmt(target)}₪
        </div>
      </div>

      {/* Progress bar */}
      <div style={{
        backgroundColor: '#F0E4D0',
        borderRadius: 999,
        height: 10,
        overflow: 'hidden',
        marginBottom: 8,
      }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          backgroundColor: LIFEOS_COLORS.primary,
          borderRadius: 999,
          transition: 'width 0.4s ease',
        }} />
      </div>

      <div style={{ fontSize: 12, color: LIFEOS_COLORS.textSecondary }}>
        נשארו <strong style={{ color: LIFEOS_COLORS.textPrimary }}>{fmt(remaining)}₪</strong> ליעד
      </div>
    </div>
  );
}
