import { useState } from 'react';
import { ChevronDown, ChevronLeft } from 'lucide-react';

// Covers both spec names (basicJump/legSwitch/kneeLifts) and the actual
// DB values in this codebase (basic / foot_switch / high_knees).
const TECHNIQUE_LABELS = {
  basicJump:   'קפיצה בסיס',
  basic:       'קפיצה בסיס',
  legSwitch:   'החלפת רגליים',
  foot_switch: 'החלפת רגליים',
  kneeLifts:   'הרמת ברכיים',
  high_knees:  'הרמת ברכיים',
};

function peakOf(rounds) {
  if (!Array.isArray(rounds) || rounds.length === 0) return 0;
  return Math.max(...rounds.map(r => Number(r?.jumps ?? 0)));
}

// Accept either the spec's sessions[{sessionDate, techniques[]}]
// shape or the existing ProgressTab shape — same fields.
export function BaselinesFolderCard({ sessions, onSessionClick }) {
  const [expanded, setExpanded] = useState(false);
  if (!sessions?.length) return null;

  const latest = sessions[0];
  const latestTechs = latest.techniques ?? [];
  const latestAvg = latestTechs.length > 0
    ? latestTechs.reduce((s, t) => s + (Number(t.average_jumps) || 0), 0) / latestTechs.length
    : 0;

  return (
    <div style={{
      background: '#FFF9F0',
      border: '1px solid #FFE5D0',
      borderRight: '3px solid #FF6F20',
      borderRadius: 12,
      marginBottom: 10,
      overflow: 'hidden',
    }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          padding: 14, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 18 }}>📁</span>
            <span style={{ fontWeight: 700, color: '#1a1a1a', fontSize: 15 }}>בייסליינים</span>
            <span style={{
              fontSize: 12, color: '#6b7280',
              background: '#FFFFFF', padding: '2px 8px', borderRadius: 10,
            }}>
              {sessions.length}
            </span>
          </div>
          <div style={{ fontSize: 13, color: '#1a1a1a', marginTop: 6 }}>
            <span style={{ color: '#6b7280' }}>אחרון: </span>
            <strong>{new Date(latest.sessionDate).toLocaleDateString('he-IL')}</strong>
            {' · '}
            <span style={{ color: '#6b7280' }}>ממוצע: </span>
            <strong style={{ color: '#FF6F20' }}>{Math.round(latestAvg)}</strong>
          </div>
        </div>
        <span style={{ color: '#FF6F20', flexShrink: 0, marginRight: 8 }}>
          {expanded ? <ChevronDown size={20} /> : <ChevronLeft size={20} />}
        </span>
      </div>

      {expanded && (
        <div style={{ background: '#FFFFFF', padding: '0 14px 14px 14px' }}>
          {sessions.map((s) => (
            <div
              key={s.sessionKey || s.sessionDate}
              onClick={() => onSessionClick(s)}
              style={{
                padding: 12, marginTop: 6,
                background: '#FFF9F0', border: '1px solid #FFE5D0', borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 600, color: '#1a1a1a', fontSize: 14, marginBottom: 6 }}>
                📅 {new Date(s.sessionDate).toLocaleDateString('he-IL')}
              </div>
              {(s.techniques ?? []).map((t) => (
                <div
                  key={t.id}
                  style={{
                    display: 'flex', justifyContent: 'space-between',
                    fontSize: 13, padding: '3px 0', color: '#1a1a1a',
                  }}
                >
                  <span style={{ color: '#FF6F20', fontWeight: 500 }}>
                    {TECHNIQUE_LABELS[t.technique] ?? t.technique}
                  </span>
                  <span>
                    <span style={{ color: '#6b7280' }}>ממוצע: </span>
                    <strong>{t.average_jumps ?? 0}</strong>
                    {' · '}
                    <span style={{ color: '#6b7280' }}>שיא: </span>
                    <strong>{peakOf(t.rounds_data)}</strong>
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default BaselinesFolderCard;
