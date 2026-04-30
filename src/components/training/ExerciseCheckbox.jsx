export default function ExerciseCheckbox({ exerciseId, sectionId, isCompleted, onToggle }) {
  return (
    <button
      onClick={() => onToggle(exerciseId, sectionId, !isCompleted)}
      style={{
        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
        border: isCompleted ? '2px solid #16A34A' : '2px solid #D1D5DB',
        background: isCompleted ? '#D1FAE5' : 'white',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', transition: 'all 0.2s',
      }}
    >
      {isCompleted && (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M3 8 L6.5 11.5 L13 4.5" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </button>
  );
}
