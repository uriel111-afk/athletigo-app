import { useState } from 'react';

export default function SectionRatingPopup({ sectionName, onSubmit }) {
  const [challenge, setChallenge] = useState(null);
  const [control, setControl] = useState(null);
  const [note, setNote] = useState('');

  const canSubmit = challenge !== null && control !== null;

  const RatingRow = ({ label, value, onChange }) => (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 500, color: '#1a1a1a', marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', gap: 4, justifyContent: 'space-between' }}>
        {[1,2,3,4,5,6,7,8,9,10].map(n => (
          <button key={n} onClick={() => onChange(n)} style={{
            width: 32, height: 40, borderRadius: 8, fontSize: 14, fontWeight: 600,
            border: value === n ? '2px solid #FF6F20' : '1px solid #F5E8D5',
            background: value === n ? '#FF6F20' : '#FFFEFC',
            color: value === n ? 'white' : '#888',
            cursor: 'pointer', fontFamily: 'inherit',
          }}>{n}</button>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 10000, padding: 16,
    }}>
      <div style={{
        background: 'white', borderRadius: 16, padding: 24,
        width: '100%', maxWidth: 400, direction: 'rtl',
      }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: '#1a1a1a', marginBottom: 4 }}>
          סיימת את {sectionName}!
        </div>
        <div style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>
          דרג את החוויה שלך
        </div>

        <RatingRow label="כמה אתגר חווית?" value={challenge} onChange={setChallenge} />
        <RatingRow label="מה הייתה מידת השליטה שלך?" value={control} onChange={setControl} />

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="מה היה הכי קשה / מפתיע? (אופציונלי)"
          style={{
            width: '100%', minHeight: 60, border: '1px solid #F5E8D5',
            borderRadius: 12, padding: 12, fontSize: 13,
            fontFamily: 'inherit', resize: 'vertical',
            background: '#FFF9F0', marginBottom: 16, boxSizing: 'border-box',
          }}
        />

        {canSubmit && (
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 28, fontWeight: 600, color: '#FF6F20' }}>
              {((challenge + control) / 2).toFixed(1)}
            </span>
            <span style={{ fontSize: 13, color: '#888', marginRight: 8 }}>ממוצע סקשן</span>
          </div>
        )}

        <button
          onClick={() => canSubmit && onSubmit(challenge, control, note)}
          disabled={!canSubmit}
          style={{
            width: '100%', height: 48, borderRadius: 12, border: 'none',
            background: canSubmit ? '#FF6F20' : '#E5E7EB',
            color: canSubmit ? 'white' : '#999',
            fontSize: 15, fontWeight: 600, cursor: canSubmit ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit',
          }}
        >המשך</button>
      </div>
    </div>
  );
}
