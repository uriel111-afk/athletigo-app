import React, { useReducer, useEffect } from 'react';
import { useActiveTimer } from '@/contexts/ActiveTimerContext';
import { useClock } from '@/contexts/ClockContext';

// Slim timer control rendered INSIDE every open dialog. Solves the
// "bar inaccessible behind backdrop" class of bugs by living in the
// same stacking context as the form fields — there's no overlay
// between this and the user's tap.
//
// Handles BOTH:
//   - Tabata (via useActiveTimer + tabata-* CustomEvents)
//   - Stopwatch / Countdown (via useClock + clock-pause-resume event)
//
// Renders null when no timer is active OR not minimized — zero UI
// impact on dialogs when there's no workout running.

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

function fmtMs(ms) {
  const total = Math.max(0, Math.round((ms || 0) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function MiniTimerBar() {
  const { liveTimerTabata, isMinimized: tabataMinimized } = useActiveTimer() || {};
  const clock = useClock() || {};
  const clockActive = !!clock.activeClock && clock.isMinimized && (clock.isRunning || clock.display > 0);

  // 100ms ticker so display updates while bar is mounted.
  const [, force] = useReducer(x => x + 1, 0);
  useEffect(() => {
    const visible = (liveTimerTabata && tabataMinimized) || clockActive;
    if (!visible) return;
    const id = setInterval(force, 100);
    return () => clearInterval(id);
  }, [liveTimerTabata, tabataMinimized, clockActive]);

  // Tabata takes precedence if both somehow exist (shouldn't, but
  // tabata is the richer control surface).
  const showTabata = !!liveTimerTabata && tabataMinimized;
  const showClock  = !showTabata && clockActive;

  if (!showTabata && !showClock) return null;

  // ─── Choose palette + display values ────────────────────────
  let bg, text, softBg, softFg, playBg, playFg, border;
  let display, paused, round = '', hasRounds = false;
  let onPlayPause, onNext, onPrev;

  if (showTabata) {
    const t = liveTimerTabata;
    const phase = t.phase || '';
    const isWork = WORK_TOKENS.some(w => phase.includes(w));
    paused = !!t.paused;
    display = t.display || '0:00';
    const m = t.info?.match?.(/(\d+\/\d+)/);
    round = m ? m[1] : '';
    hasRounds = true;

    bg     = isWork ? '#FF6F20' : '#FFF9F0';
    text   = isWork ? '#FFFFFF' : '#1a1a1a';
    softBg = isWork ? 'rgba(255,255,255,0.2)' : 'rgba(255,111,32,0.1)';
    softFg = isWork ? '#FFFFFF' : '#FF6F20';
    playBg = isWork ? '#FFFFFF' : '#FF6F20';
    playFg = isWork ? '#FF6F20' : '#FFFFFF';
    border = isWork ? 'none' : '1.5px solid #FF6F20';

    onPlayPause = () => { try { window.dispatchEvent(new CustomEvent('tabata-pause-resume')); } catch {} };
    onNext      = () => { try { window.dispatchEvent(new CustomEvent('tabata-next-round')); } catch {} };
    onPrev      = () => { try { window.dispatchEvent(new CustomEvent('tabata-prev-round')); } catch {} };
  } else {
    // Stopwatch or Countdown
    const isStopwatch = clock.activeClock === 'stopwatch';
    paused = !clock.isRunning;
    display = fmtMs(clock.display);
    round = isStopwatch ? '⏱' : '⏳';
    hasRounds = false;

    bg     = '#FFF9F0';
    text   = '#1a1a1a';
    softBg = 'rgba(255,111,32,0.1)';
    softFg = '#FF6F20';
    playBg = '#FF6F20';
    playFg = '#FFFFFF';
    border = '1.5px solid #FF6F20';

    onPlayPause = () => { try { window.dispatchEvent(new CustomEvent('clock-pause-resume')); } catch {} };
  }

  const btnBase = {
    border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, padding: 0,
    WebkitTapHighlightColor: 'transparent',
  };

  return (
    <div
      data-mini-timer="true"
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
      {/* Round / phase indicator */}
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

      {/* Forward — tabata only */}
      {hasRounds && (
        <button type="button"
          onClick={stop(onNext)}
          onPointerDown={(e) => e.stopPropagation()}
          style={{ ...btnBase, width: 30, height: 30, borderRadius: '50%', background: softBg }}
          aria-label="קדימה"
        >
          <span style={{ pointerEvents: 'none', color: softFg, fontSize: 13 }}>⏭</span>
        </button>
      )}

      {/* Play / Pause — both timer types */}
      <button type="button"
        onClick={stop(onPlayPause)}
        onPointerDown={(e) => e.stopPropagation()}
        style={{ ...btnBase, width: 38, height: 38, borderRadius: '50%', background: playBg, boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }}
        aria-label={paused ? 'המשך' : 'השהה'}
      >
        <span style={{ pointerEvents: 'none', color: playFg, fontSize: 17, fontWeight: 700 }}>
          {paused ? '▶' : '⏸'}
        </span>
      </button>

      {/* Backward — tabata only */}
      {hasRounds && (
        <button type="button"
          onClick={stop(onPrev)}
          onPointerDown={(e) => e.stopPropagation()}
          style={{ ...btnBase, width: 30, height: 30, borderRadius: '50%', background: softBg }}
          aria-label="אחורה"
        >
          <span style={{ pointerEvents: 'none', color: softFg, fontSize: 13 }}>⏮</span>
        </button>
      )}
    </div>
  );
}
