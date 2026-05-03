import React from 'react';
import { ChevronLeft } from 'lucide-react';

const ORANGE = '#FF6F20';
const DARK = '#1a1a1a';

// One folder card on the main "אימונים" list. Tapping the card calls
// onSelect(plan); navigation lives in Workouts.jsx and mounts
// WorkoutFolderDetail when a plan is selected.
//
// When isCoach=true, an "✏️ עריכה" chip appears next to the chevron
// and stops propagation on tap so the coach can jump straight into
// UnifiedPlanBuilder (canEdit=true) without drilling into the folder
// detail first.
export default function WorkoutFolder({
  plan, sectionsCount, exercisesCount, executions,
  isCoach = false, onSelect, onEdit,
}) {
  const completed = executions || [];
  const newestFirst = completed
    .slice()
    .sort((a, b) => new Date(b.executed_at) - new Date(a.executed_at));
  const lastScore = newestFirst[0]?.self_rating ?? null;

  return (
    <div
      dir="rtl"
      role="button"
      tabIndex={0}
      onClick={() => onSelect && onSelect(plan)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect && onSelect(plan); }}
      style={{
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
            fontSize: 18, fontWeight: 800, color: DARK,
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
          {plan.created_at && (
            <div style={{
              fontSize: 11,
              color: '#aaa',
              marginTop: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}>
              📅 נוצר: {new Date(plan.created_at).toLocaleDateString('he-IL', {
                day: 'numeric', month: 'long', year: 'numeric',
              })}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4 }}>
          {isCoach && onEdit && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEdit(plan); }}
              style={{
                padding: '6px 12px',
                background: '#FFF5EE',
                border: `1px solid ${ORANGE}`,
                borderRadius: 8,
                color: ORANGE,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              ✏️ עריכה
            </button>
          )}
          <ChevronLeft className="w-6 h-6" style={{ color: ORANGE }} />
        </div>
      </div>
    </div>
  );
}
