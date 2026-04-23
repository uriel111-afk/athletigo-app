import React, { useReducer, useEffect } from 'react';
import { useActiveTimer } from '@/contexts/ActiveTimerContext';

// Slim timer control rendered INSIDE every open dialog. Solves the
// "bar inaccessible behind backdrop" class of bugs by living in the
// same stacking context as the form fields — there's no overlay
// between this and the user's tap.
//
// Reads state from useActiveTimer (the same liveTimerTabata that
// TimerFooterBar uses) and sends commands via the existing
// tabata-* CustomEvents that TabataTimer already listens to. No
// new plumbing — just a parallel control surface.

const WORK_TOKENS = ['עבודה', 'work', 'WORK', 'ריצה'];

function stop(handler) {
  return (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.nativeEvent?.stopImmediatePropagation === 'function') {
      e.nativeEvent.stopImmediatePropagation();
    }
    handler?.(e);
  };
}

export default function MiniTimerBar() {
  const { liveTimerTabata, isMinimized } = useActiveTimer() || {};
  // 100ms ticker so display updates while bar is mounted (other
  // updates come from React state propagation through context).
  const [, force] = useReducer(x => x + 1, 0);
  useEffect(() => {
    if (!liveTimerTabata || !isMinimized) return;
    const id = setInterval(force, 100);
    return () => clearInterval(id);
  }, [liveTimerTabata, isMinimized]);

  if (!liveTimerTabata || !isMinimized) return null;

  const t = liveTimerTabata;
  const phase = t.phase || '';
  const isWork = WORK_TOKENS.some(w => phase.includes(w));
  const paused = !!t.paused;
  const display = t.display || '0:00';
  const roundMatch = t.info?.match?.(/(\d+\/\d+)/);
  const round = roundMatch ? roundMatch[1] : '';

  const bg       = isWork ? '#FF6F20' : '#FFF9F0';
  const text     = isWork ? '#FFFFFF' : '#1a1a1a';
  const softBg   = isWork ? 'rgba(255,255,255,0.2)' : 'rgba(255,111,32,0.1)';
  const softFg   = isWork ? '#FFFFFF' : '#FF6F20';
  const playBg   = isWork ? '#FFFFFF' : '#FF6F20';
  const playFg   = isWork ? '#FF6F20' : '#FFFFFF';
  const border   = isWork ? 'none' : '1.5px solid #FF6F20';

  const dispatch = (eventName) => () => {
    try { window.dispatchEvent(new CustomEvent(eventName)); } catch {}
  };

  const btnBase = {
    border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, padding: 0,
    WebkitTapHighlightColor: 'transparent',
  };

  return (
    <div
      data-mini-timer="true"
      // Block any pointer event from reaching the dialog backdrop or
      // its dismiss handlers — every interaction stays local.
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '8px 10px',
        background: bg,
        borderRadius: 12,
        marginBottom: 12,
        direction: 'rtl',
        border,
      }}
    >
      {/* Round / phase label */}
      {round ? (
        <div style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: 18, fontWeight: 700, color: text,
          minWidth: 32, textAlign: 'center', flexShrink: 0,
        }}>{round}</div>
      ) : null}

      {/* Time */}
      <div style={{
        flex: 1, minWidth: 0, textAlign: 'center',
        fontFamily: "'Barlow Condensed', sans-serif",
        fontSize: 28, fontWeight: 700, letterSpacing: 1,
        color: text, lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden',
      }}>{display}</div>

      {/* Forward (next round) */}
      <button type="button"
        onClick={stop(dispatch('tabata-next-round'))}
        onPointerDown={(e) => e.stopPropagation()}
        style={{ ...btnBase, width: 30, height: 30, borderRadius: '50%', background: softBg }}
        aria-label="קדימה"
      >
        <span style={{ pointerEvents: 'none', color: softFg, fontSize: 13 }}>⏭</span>
      </button>

      {/* Play / Pause */}
      <button type="button"
        onClick={stop(dispatch('tabata-pause-resume'))}
        onPointerDown={(e) => e.stopPropagation()}
        style={{ ...btnBase, width: 38, height: 38, borderRadius: '50%', background: playBg, boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }}
        aria-label={paused ? 'המשך' : 'השהה'}
      >
        <span style={{ pointerEvents: 'none', color: playFg, fontSize: 17, fontWeight: 700 }}>
          {paused ? '▶' : '⏸'}
        </span>
      </button>

      {/* Backward (prev round) */}
      <button type="button"
        onClick={stop(dispatch('tabata-prev-round'))}
        onPointerDown={(e) => e.stopPropagation()}
        style={{ ...btnBase, width: 30, height: 30, borderRadius: '50%', background: softBg }}
        aria-label="אחורה"
      >
        <span style={{ pointerEvents: 'none', color: softFg, fontSize: 13 }}>⏮</span>
      </button>
    </div>
  );
}
