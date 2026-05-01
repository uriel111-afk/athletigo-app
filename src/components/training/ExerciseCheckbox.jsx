import React from 'react';

export default function ExerciseCheckbox({ exerciseId, sectionId, isCompleted, onToggle }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onToggle(exerciseId, sectionId, !isCompleted);
      }}
      aria-pressed={isCompleted}
      aria-label={isCompleted ? 'בטל סימון ביצוע' : 'סמן כבוצע'}
      style={{
        width: 22, height: 22, borderRadius: 6, flexShrink: 0,
        border: '2px solid #FF6F20',
        background: isCompleted ? '#FF6F20' : 'white',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', transition: 'all 0.2s ease',
        padding: 0,
      }}
    >
      {isCompleted && (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M3 8 L6.5 11.5 L13 4.5" stroke="#FFFFFF"
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}
