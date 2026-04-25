import React from 'react';
import { PERSONAL_COLORS } from '@/lib/personal/personal-constants';

const HE_DAY_SHORT = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
const todayISO = () => new Date().toISOString().slice(0, 10);

// Returns the 7 days of the current week as ISO strings (Sunday first).
function weekISOs() {
  const out = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  for (let i = 0; i < 7; i++) {
    const dd = new Date(d);
    dd.setDate(d.getDate() + i);
    out.push(dd.toISOString().slice(0, 10));
  }
  return out;
}

export default function HabitCard({ habit, doneToday, monthPct, streak, onToggle, onClick, weekLogs = {} }) {
  const days = weekISOs();
  const today = todayISO();
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', gap: 10,
        backgroundColor: '#FFFFFF', borderRadius: 14,
        border: `1px solid ${PERSONAL_COLORS.border}`,
        padding: 12,
        boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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

      {/* Weekly strip: 7 dots, Sunday→Saturday */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
        gap: 4, paddingTop: 6,
        borderTop: `1px solid ${PERSONAL_COLORS.border}`,
      }}>
        {days.map((iso, i) => {
          const isFuture = iso > today;
          const isToday = iso === today;
          const done = !!weekLogs[iso];
          let bg = '#F5F1EA', border = PERSONAL_COLORS.border, color = PERSONAL_COLORS.textSecondary;
          if (done) { bg = '#DCFCE7'; border = '#16A34A'; color = '#16A34A'; }
          else if (isToday) { bg = '#FFF5EE'; border = PERSONAL_COLORS.primary; color = PERSONAL_COLORS.primary; }
          else if (isFuture) { bg = '#FFFFFF'; }
          return (
            <div key={iso} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: 999,
                border: `1.5px solid ${border}`, backgroundColor: bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700, color,
              }}>
                {done ? '✓' : ''}
              </div>
              <span style={{ fontSize: 9, color: PERSONAL_COLORS.textSecondary, fontWeight: 600 }}>
                {HE_DAY_SHORT[i]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
