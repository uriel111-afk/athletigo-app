import React from 'react';
import { ChevronLeft } from 'lucide-react';

const ORANGE = '#FF6F20';
const DARK = '#1a1a1a';

// One folder card on the main "אימונים" list. Tapping it calls
// onSelect(plan) — navigation lives in Workouts.jsx, which mounts
// WorkoutFolderDetail when a plan is selected. No expand-in-place
// behavior here anymore.
export default function WorkoutFolder({
  plan, sectionsCount, exercisesCount, executions, onSelect,
}) {
  const completed = executions || [];
  const newestFirst = completed
    .slice()
    .sort((a, b) => new Date(b.executed_at) - new Date(a.executed_at));
  const lastScore = newestFirst[0]?.self_rating ?? null;

  return (
    <button
      dir="rtl"
      type="button"
      onClick={() => onSelect && onSelect(plan)}
      style={{
        all: 'unset',
        display: 'block',
        cursor: 'pointer',
        boxSizing: 'border-box',
        width: '100%',
        background: 'white',
        borderRight: `4px solid ${ORANGE}`,
        borderRadius: 16,
        boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
        padding: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 20, fontWeight: 900, color: DARK,
            marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            💪 {plan.plan_name || plan.title || 'תוכנית'}
          </div>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>
            {sectionsCount} סקשנים · {exercisesCount} תרגילים
          </div>
          <div style={{ fontSize: 13, color: '#666' }}>
            {completed.length} ביצועים
            {lastScore != null && (
              <>
                {' · ציון אחרון: '}
                <span style={{ color: ORANGE, fontWeight: 800 }}>
                  {Number(lastScore).toFixed(1)} ⭐
                </span>
              </>
            )}
          </div>
        </div>
        <div style={{ paddingTop: 4 }}>
          <ChevronLeft className="w-6 h-6" style={{ color: ORANGE }} />
        </div>
      </div>
    </button>
  );
}
