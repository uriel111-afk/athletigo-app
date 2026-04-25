import React from 'react';
import { LIFEOS_COLORS } from '@/lib/lifeos/lifeos-constants';

// Circle progress ring (SVG). Green 71+, orange 41-70, red 0-40.
export default function WeeklyScore({ score = 0, lastWeek = null, size = 88 }) {
  const r = size / 2 - 6;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  const offset = circ * (1 - pct / 100);
  const color = pct >= 71 ? LIFEOS_COLORS.success
              : pct >= 41 ? LIFEOS_COLORS.primary
              : LIFEOS_COLORS.error;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 14px', borderRadius: 12,
      backgroundColor: '#FFFFFF',
      border: `1px solid ${LIFEOS_COLORS.border}`,
    }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size/2} cy={size/2} r={r} stroke="#F0E4D0" strokeWidth="6" fill="none" />
          <circle
            cx={size/2} cy={size/2} r={r}
            stroke={color} strokeWidth="6" fill="none"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.6s ease' }}
          />
        </svg>
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, fontWeight: 800, color,
        }}>
          {Math.round(pct)}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: LIFEOS_COLORS.textSecondary }}>
          ציון השבוע
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: LIFEOS_COLORS.textPrimary, marginTop: 2 }}>
          {pct >= 71 ? 'שבוע מצוין' : pct >= 41 ? 'שבוע סביר' : 'צריך יותר'}
        </div>
        {lastWeek !== null && (
          <div style={{ fontSize: 11, color: LIFEOS_COLORS.textSecondary, marginTop: 2 }}>
            שבוע שעבר: {lastWeek}
          </div>
        )}
      </div>
    </div>
  );
}
