import React from 'react';
import { FOCUS, isoDate } from '@/lib/lifeos/focus-api';

// ═══════════════════════════════════════════════════════════════════
// Cycle path strip — RIGHT TO LEFT, always
// ═══════════════════════════════════════════════════════════════════
// MANDATORY DIRECTION RULE for every map, path or timeline in this app:
//   day 1 sits at the RIGHT edge, progress flows LEFT, and anything still in
//   the future is to the LEFT of the today marker.
// So the x axis is mirrored: xOf(0) = width (start) and xOf(1) = 0 (end).
// Use xOfProgress() below rather than re-deriving it, so the rule stays in one
// place. Inline svg, no charting library.
// ═══════════════════════════════════════════════════════════════════

export const xOfProgress = (t, width) => width - Math.max(0, Math.min(1, t)) * width;

const dayDiff = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);

export default function CyclePathStrip({
  start, end, today = isoDate(), milestones = [], label = null, onTap,
}) {
  if (!start || !end) return null;
  const total = Math.max(1, dayDiff(start, end));
  const elapsed = Math.max(0, Math.min(total, dayDiff(start, today)));
  const t = elapsed / total;

  const W = 320, H = 34, padY = H / 2;
  const xNow = xOfProgress(t, W);
  const dayNo = elapsed + 1;
  const left = total - elapsed;

  return (
    <div onClick={onTap}
      style={{ margin: '0 12px 8px', padding: '7px 12px 5px', background: FOCUS.card, border: `1px solid ${FOCUS.border}`, borderRadius: 14, boxShadow: FOCUS.neu, cursor: onTap ? 'pointer' : 'default' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: FOCUS.ink }}>
          {label || 'מחזור'} · יום {dayNo} מתוך {total + 1}
        </span>
        <span style={{ fontSize: 10, fontWeight: 700, color: FOCUS.muted }}>נשארו {left} ימים</span>
      </div>

      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block', height: H }}>
        {/* Full path: the whole cycle. Drawn right→left by construction. */}
        <line x1={W} y1={padY} x2={0} y2={padY} stroke={FOCUS.border} strokeWidth="4" strokeLinecap="round" />
        {/* Travelled part: from the RIGHT edge (day 1) up to today. */}
        <line x1={W} y1={padY} x2={xNow} y2={padY} stroke={FOCUS.orange} strokeWidth="4" strokeLinecap="round" />

        {/* Milestones. Past/reached ones end up right of the marker, future
            ones left of it — the direction rule doing its job. */}
        {milestones.map((m, i) => {
          const mi = Math.max(0, Math.min(total, dayDiff(start, m.day)));
          const x = xOfProgress(mi / total, W);
          const past = mi <= elapsed;
          return (
            <g key={i}>
              <circle cx={x} cy={padY} r={past ? 4.5 : 3.5}
                fill={past ? FOCUS.orange : '#fff'} stroke={past ? FOCUS.orange : FOCUS.edge} strokeWidth="2" />
              {m.label && (
                <text x={x} y={padY - 8} textAnchor="middle" fontSize="7" fill={FOCUS.muted}>{m.label}</text>
              )}
            </g>
          );
        })}

        {/* Today marker */}
        <circle cx={xNow} cy={padY} r="6.5" fill="#fff" stroke={FOCUS.edgeSel} strokeWidth="3" />
        {/* Direction hint: the arrow points LEFT, the way progress travels. */}
        <path d={`M ${Math.max(8, xNow - 14)} ${padY} l 6 -4 l 0 8 z`} fill={FOCUS.edge} />
      </svg>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8.5, color: FOCUS.muted, marginTop: -2 }}>
        {/* RTL: the END of the cycle is on the left, the START on the right. */}
        <span>{end.slice(8)}/{end.slice(5, 7)} · סוף</span>
        <span>התחלה · {start.slice(8)}/{start.slice(5, 7)}</span>
      </div>
    </div>
  );
}
