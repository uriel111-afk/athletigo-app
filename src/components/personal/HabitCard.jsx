import React from 'react';
import { PERSONAL_COLORS } from '@/lib/personal/personal-constants';

export default function HabitCard({ habit, doneToday, monthPct, streak, onToggle, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        backgroundColor: '#FFFFFF', borderRadius: 14,
        border: `1px solid ${PERSONAL_COLORS.border}`,
        padding: 12,
        boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
        cursor: 'pointer',
      }}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onToggle?.(habit); }}
        style={{
          width: 44, height: 44, borderRadius: '50%',
          border: doneToday
            ? `2px solid ${PERSONAL_COLORS.success}`
            : `1px solid ${PERSONAL_COLORS.border}`,
          backgroundColor: doneToday ? '#DCFCE7' : '#FFFFFF',
          fontSize: 22, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {habit.icon || '✅'}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: PERSONAL_COLORS.textPrimary }}>
          {habit.name}
        </div>
        <div style={{ fontSize: 11, color: PERSONAL_COLORS.textSecondary, marginTop: 2 }}>
          {habit.target_value || ''}{habit.target_value ? ' · ' : ''}{monthPct}% החודש
        </div>
      </div>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '4px 10px', borderRadius: 999,
        backgroundColor: streak > 0 ? '#FFF4E6' : '#F7F3EC',
        color: streak > 0 ? PERSONAL_COLORS.primary : PERSONAL_COLORS.textSecondary,
        fontSize: 12, fontWeight: 800,
      }}>
        🔥 {streak}
      </div>
    </div>
  );
}
