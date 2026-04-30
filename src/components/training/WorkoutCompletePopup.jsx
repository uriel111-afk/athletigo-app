import { useState } from 'react';

export default function WorkoutCompletePopup({ avgScore, onFeedback, onClose }) {
  const [feedback, setFeedback] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);

  const emoji = avgScore >= 8 ? '🔥' : avgScore >= 6 ? '💪' : avgScore >= 4 ? '👍' : '🏋️';

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 10000, padding: 16,
    }}>
      <div style={{
        background: 'white', borderRadius: 20, padding: 32,
        width: '100%', maxWidth: 360, textAlign: 'center', direction: 'rtl',
      }}>
        <div style={{ fontSize: 64, marginBottom: 12 }}>{emoji}</div>
        <div style={{ fontSize: 22, fontWeight: 600, color: '#1a1a1a', marginBottom: 4 }}>
          כל הכבוד!
        </div>
        <div style={{ fontSize: 14, color: '#888', marginBottom: 20 }}>
          סיימת את האימון
        </div>

        <div style={{
          background: '#FFF5EE', borderRadius: 16, padding: 20, marginBottom: 20,
        }}>
          <div style={{ fontSize: 42, fontWeight: 600, color: '#FF6F20' }}>
            {avgScore?.toFixed(1) || '—'}
          </div>
          <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>ציון כולל</div>
        </div>

        {!showFeedback ? (
          <button onClick={() => setShowFeedback(true)} style={{
            width: '100%', height: 44, borderRadius: 12,
            border: '1px solid #F5E8D5', background: 'white',
            color: '#888', fontSize: 14, cursor: 'pointer',
            fontFamily: 'inherit', marginBottom: 8,
          }}>הוסף משוב</button>
        ) : (
          <div style={{ marginBottom: 12 }}>
            <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)}
              placeholder="איך הרגשת? מה היה שונה הפעם?"
              autoFocus
              style={{
                width: '100%', minHeight: 60, border: '1px solid #F5E8D5',
                borderRadius: 12, padding: 12, fontSize: 13,
                fontFamily: 'inherit', background: '#FFF9F0',
                marginBottom: 8, boxSizing: 'border-box',
              }} />
          </div>
        )}

        <button onClick={() => {
          if (feedback) onFeedback(feedback);
          onClose();
        }} style={{
          width: '100%', height: 48, borderRadius: 12, border: 'none',
          background: '#FF6F20', color: 'white', fontSize: 15,
          fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
        }}>סיים</button>
      </div>
    </div>
  );
}
