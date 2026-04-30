import { useState } from 'react';

export default function ExerciseNotePopup({ exerciseName, onSave, onSkip }) {
  const [note, setNote] = useState('');

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 10000, padding: 16,
    }}>
      <div style={{
        background: 'white', borderRadius: 16, padding: 24,
        width: '100%', maxWidth: 360, direction: 'rtl',
      }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#1a1a1a', marginBottom: 4 }}>
          ✓ {exerciseName} בוצע
        </div>
        <div style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>
          יש משהו שתרצה להוסיף על הביצוע?
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="תובנות, תחושות, שינויים..."
          autoFocus
          style={{
            width: '100%', minHeight: 80, border: '1px solid #F5E8D5',
            borderRadius: 12, padding: 12, fontSize: 14,
            fontFamily: 'inherit', resize: 'vertical',
            background: '#FFF9F0', boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button onClick={() => onSave(note)} style={{
            flex: 1, height: 44, borderRadius: 12, border: 'none',
            background: '#FF6F20', color: 'white', fontSize: 14,
            fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}>שמור</button>
          <button onClick={onSkip} style={{
            flex: 1, height: 44, borderRadius: 12,
            border: '1px solid #F5E8D5', background: 'white',
            color: '#888', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
          }}>דלג</button>
        </div>
      </div>
    </div>
  );
}
