import React from 'react';
import { PERSONAL_COLORS, PERSONAL_CARD } from '@/lib/personal/personal-constants';
import { HE_DAY_NAMES } from '@/lib/personal/weekly-api';

const scoreColor = (score) => {
  if (score >= 70) return '#16A34A';
  if (score >= 40) return '#F59E0B';
  return '#DC2626';
};

// Reads `summary` from fetchWeek() and renders a single recap card.
// Falls back gracefully if a section is missing.
export default function WeeklySummary({ summary }) {
  if (!summary) return null;
  const { avgScore, bestDay, worstDay, topHabit, weakHabit, taskTotal, taskDone, taskTransferred, taskPct } = summary;

  return (
    <div style={{ ...PERSONAL_CARD, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingBottom: 8, borderBottom: `1px solid ${PERSONAL_COLORS.border}`,
      }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: PERSONAL_COLORS.textPrimary }}>
          סיכום השבוע
        </div>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '4px 12px', borderRadius: 999,
          backgroundColor: scoreColor(avgScore), color: '#FFFFFF',
          fontSize: 14, fontWeight: 800,
        }}>
          ממוצע {avgScore}
        </div>
      </div>

      <Row
        emoji="🏆"
        label="היום הכי חזק"
        value={bestDay ? `יום ${HE_DAY_NAMES[bestDay.dow]} — ציון ${bestDay.score}` : '—'}
      />
      <Row
        emoji="💧"
        label="היום הכי חלש"
        value={worstDay ? `יום ${HE_DAY_NAMES[worstDay.dow]} — ציון ${worstDay.score}` : '—'}
      />

      {topHabit && (
        <Row
          emoji="🔥"
          label="ההרגל החזק"
          value={`${topHabit.icon || ''} ${topHabit.name} — ${topHabit.done}/7 ימים`}
        />
      )}
      {weakHabit && weakHabit.name !== topHabit?.name && (
        <Row
          emoji="🔧"
          label="הרגל לשיפור"
          value={`${weakHabit.icon || ''} ${weakHabit.name} — ${weakHabit.done}/7 ימים`}
        />
      )}

      <Row
        emoji="✅"
        label="משימות"
        value={`${taskDone}/${taskTotal} הושלמו (${taskPct}%)`}
      />
      {taskTransferred > 0 && (
        <Row emoji="➡️" label="משימות שהועברו" value={`${taskTransferred}`} />
      )}
    </div>
  );
}

function Row({ emoji, label, value }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '4px 0',
    }}>
      <span style={{ fontSize: 18 }}>{emoji}</span>
      <span style={{
        flex: 1, fontSize: 12, fontWeight: 600,
        color: PERSONAL_COLORS.textSecondary,
      }}>
        {label}
      </span>
      <span style={{ fontSize: 13, fontWeight: 700, color: PERSONAL_COLORS.textPrimary }}>
        {value}
      </span>
    </div>
  );
}
