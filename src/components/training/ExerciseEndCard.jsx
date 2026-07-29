import React, { useState } from 'react';

// ── Exercise-end card ────────────────────────────────────────────────
// Shown inside the shell once the last set is saved. Everything on it
// is optional — the trainee can tap לתרגיל הבא without answering.
//
// Difficulty writes exercise_set_logs.difficulty_rating on the LAST set
// (קל=3, בינוני=6, קשה=9). The free-text note writes
// exercise_executions.trainee_note.
//
// Inline styles only; nothing anchored left; nothing truncates.

const ORANGE = '#FF6F20';
const INK = '#1a1a1a';
const MUTED = '#8a8177';
const SANS = "'Rubik', system-ui, sans-serif";

export const DIFFICULTY_CHIPS = [
  { label: 'קל', value: 3 },
  { label: 'בינוני', value: 6 },
  { label: 'קשה', value: 9 },
];

export default function ExerciseEndCard({
  exerciseName,
  setsCompleted,
  saving = false,
  onSubmit,             // ({ difficulty, note }) => void
}) {
  const [difficulty, setDifficulty] = useState(null);
  const [note, setNote] = useState('');

  return (
    <div dir="rtl" style={{
      background: '#FFFFFF',
      border: '1px solid #F0E4D0',
      borderRadius: 12,
      padding: '14px 13px',
      marginTop: 4,
      fontFamily: SANS,
    }}>
      <div style={{
        fontSize: 19, fontWeight: 500, color: INK,
        lineHeight: 1.3, textAlign: 'right',
        wordBreak: 'break-word', overflowWrap: 'break-word',
      }}>
        סיימת {exerciseName}
      </div>
      <div style={{
        fontSize: 14, color: MUTED, marginTop: 4,
        textAlign: 'right', lineHeight: 1.5,
      }}>
        <span style={{ color: ORANGE, fontWeight: 500 }}>{setsCompleted}</span> סטים הושלמו
      </div>

      {/* Difficulty — three chips, optional. */}
      <div style={{
        fontSize: 15, fontWeight: 500, color: INK,
        marginTop: 14, textAlign: 'right', lineHeight: 1.4,
      }}>כמה היה קשה?</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
        {DIFFICULTY_CHIPS.map((c) => {
          const on = difficulty === c.value;
          return (
            <button
              key={c.value}
              type="button"
              onClick={() => setDifficulty(on ? null : c.value)}
              aria-pressed={on}
              style={{
                flex: 1,
                minWidth: 80,
                padding: '10px 12px',
                background: on ? ORANGE : '#FFFFFF',
                color: on ? '#FFFFFF' : INK,
                border: `1px solid ${on ? ORANGE : '#F0E4D0'}`,
                borderRadius: 10,
                fontFamily: SANS,
                fontSize: 15,
                fontWeight: 500,
                cursor: 'pointer',
                lineHeight: 1.4,
              }}
            >{c.label}</button>
          );
        })}
      </div>

      {/* Free text — optional. */}
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="משהו שכדאי שאדע?"
        rows={2}
        style={{
          width: '100%',
          marginTop: 12,
          padding: '10px 12px',
          border: '1px solid #F0E4D0',
          borderRadius: 10,
          fontFamily: SANS,
          fontSize: 15,
          color: INK,
          direction: 'rtl',
          textAlign: 'right',
          resize: 'none',
          boxSizing: 'border-box',
          background: '#FBF6EE',
          outline: 'none',
          lineHeight: 1.5,
        }}
      />

      <button
        type="button"
        disabled={saving}
        onClick={() => onSubmit && onSubmit({ difficulty, note: note.trim() || null })}
        style={{
          width: '100%',
          marginTop: 12,
          padding: '13px 16px',
          background: saving ? '#E7DECF' : ORANGE,
          color: '#FFFFFF',
          border: 'none',
          borderRadius: 12,
          fontFamily: SANS,
          fontSize: 16,
          fontWeight: 500,
          cursor: saving ? 'default' : 'pointer',
          lineHeight: 1.4,
        }}
      >לתרגיל הבא</button>
    </div>
  );
}
