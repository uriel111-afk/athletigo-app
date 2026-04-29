import React from 'react';

// Celebration modal — fired when a personal_records insert pushes
// the trainee past the active goal's target_value. Two CTAs:
// "הצב יעד חדש" (opens the goal form prefilled with the achieved
// value as starting_value) and "סגור" (just dismisses).

export default function GoalAchievedPopup({
  goal,
  achievedValue,
  exerciseName,
  onSetNewGoal,
  onClose,
}) {
  if (!goal) return null;
  const target = goal.target_value || '—';
  const unit = goal.target_unit || '';

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 12000,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
        style={{
          background: 'linear-gradient(160deg, #FFF7F0 0%, #FFFFFF 60%)',
          borderRadius: 20,
          padding: 28,
          maxWidth: 380, width: '100%',
          boxShadow: '0 20px 50px rgba(255,111,32,0.25)',
          border: '1px solid #FFD9C0',
          textAlign: 'center',
          fontFamily: "'Heebo', 'Assistant', sans-serif",
        }}
      >
        <div style={{ fontSize: 56, marginBottom: 8 }}>🎉</div>
        <div style={{
          fontSize: 24, fontWeight: 800, color: '#1A1A1A',
          marginBottom: 6,
          fontFamily: "'Barlow Condensed', 'Heebo', sans-serif",
          letterSpacing: 0.3,
        }}>
          הגעת ליעד!
        </div>
        <div style={{
          fontSize: 16, color: '#FF6F20', fontWeight: 600,
          marginBottom: 4,
        }}>
          {exerciseName}
        </div>
        <div style={{ fontSize: 14, color: '#555', marginBottom: 18 }}>
          <span style={{ fontWeight: 700, color: '#1A1A1A' }}>{achievedValue}</span>
          {' / '}
          <span>{target} {unit}</span>
        </div>
        <div style={{ fontSize: 14, color: '#555', marginBottom: 22 }}>
          מה היעד הבא?
        </div>
        <button
          type="button"
          onClick={onSetNewGoal}
          style={{
            width: '100%',
            padding: '14px 16px',
            borderRadius: 14,
            border: 'none',
            background: 'linear-gradient(135deg, #FF6F20 0%, #FF8A47 100%)',
            color: 'white',
            fontSize: 15, fontWeight: 700,
            cursor: 'pointer',
            marginBottom: 8,
            boxShadow: '0 4px 12px rgba(255,111,32,0.3)',
            fontFamily: "'Heebo', 'Assistant', sans-serif",
          }}
        >🎯 הצב יעד חדש</button>
        <button
          type="button"
          onClick={onClose}
          style={{
            width: '100%',
            padding: '12px 16px',
            borderRadius: 14,
            border: '1px solid #F0E4D0',
            background: 'transparent',
            color: '#888',
            fontSize: 14, fontWeight: 500,
            cursor: 'pointer',
            fontFamily: "'Heebo', 'Assistant', sans-serif",
          }}
        >סגור</button>
      </div>
    </div>
  );
}
