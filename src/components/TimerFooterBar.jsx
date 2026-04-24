import { useEffect, useReducer } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveTimer } from '@/contexts/ActiveTimerContext';
import { useClock } from '@/contexts/ClockContext';

// Sticky footer bar(s) that appear ONLY when the user explicitly
// minimizes a running timer (tap the minimize button or navigate
// away while a timer is running). Up to 2 bars can stack — one per
// engine (clock + tabata).

const WORK_PHASE_TOKENS = ['עבודה', 'work', 'WORK', 'ריצה'];
const PREP_PHASE_TOKENS = ['הכנה', 'prepare', 'prep', 'PREP'];

const TYPES_WITH_ROUNDS = new Set(['tabata', 'emom']);

const BAR_HEIGHT = 74;

// Wrap each button handler so the click can never bubble to a parent
// (e.g. a Radix Dialog's "click-outside" backdrop that would close the
// form behind the bar).
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

function SingleBar({ timer, bottomOffset, onToggle, onExpand, onClose, onPrevRound, onNextRound }) {
  const type = timer.type;
  const display = timer.display || '0:00';
  const phaseLabel = timer.phase || '';
  const info = timer.info || '';
  const paused = !!timer.paused;

  const isWorkPhase = WORK_PHASE_TOKENS.some(t => phaseLabel?.includes(t));
  const isPrepPhase = PREP_PHASE_TOKENS.some(t => phaseLabel?.includes(t));

  const hasRounds = TYPES_WITH_ROUNDS.has(type);
  // Extract just "3/8" from info like "סבב 3/8 · סט 1/1".
  const roundMatch = info?.match?.(/(\d+\/\d+)/);
  const roundText = hasRounds && roundMatch ? roundMatch[1] : '';

  // Phase-aware palette
  let barBg, barBorder, primaryColor, timeColor, btnSoftBg, btnIconColor,
      playBg, playIconColor, expandBg, closeBg, closeIconColor;

  if (isWorkPhase) {
    barBg = '#FF6F20';
    barBorder = '2px solid rgba(255,255,255,0.3)';
    primaryColor = '#FFFFFF';
    timeColor = '#FFFFFF';
    btnSoftBg = 'rgba(255,255,255,0.2)';
    btnIconColor = '#FFFFFF';
    playBg = '#FFFFFF';
    playIconColor = '#FF6F20';
    expandBg = 'rgba(255,255,255,0.2)';
    closeBg = 'rgba(255,255,255,0.08)';
    closeIconColor = 'rgba(255,255,255,0.4)';
  } else if (isPrepPhase) {
    barBg = '#FFF9F0';
    barBorder = '2px solid #3B82F6';
    primaryColor = '#1a1a1a';
    timeColor = '#1a1a1a';
    btnSoftBg = 'rgba(59,130,246,0.1)';
    btnIconColor = '#3B82F6';
    playBg = '#3B82F6';
    playIconColor = '#FFFFFF';
    expandBg = 'rgba(59,130,246,0.1)';
    closeBg = 'rgba(0,0,0,0.03)';
    closeIconColor = '#ccc';
  } else {
    // Rest phase OR clock timer (no phase)
    barBg = '#FFF9F0';
    barBorder = '2px solid #FF6F20';
    primaryColor = '#1a1a1a';
    timeColor = '#1a1a1a';
    btnSoftBg = 'rgba(255,111,32,0.1)';
    btnIconColor = '#FF6F20';
    playBg = '#FF6F20';
    playIconColor = '#FFFFFF';
    expandBg = 'rgba(255,111,32,0.1)';
    closeBg = 'rgba(0,0,0,0.03)';
    closeIconColor = '#ccc';
  }

  const btnBase = {
    border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
    userSelect: 'none',
    WebkitTapHighlightColor: 'transparent',
    padding: 0,
  };

  const onRoundTap = () => {
    if (type === 'tabata') window.dispatchEvent(new CustomEvent('tabata-open-round-picker'));
    else if (type === 'emom') window.dispatchEvent(new CustomEvent('emom-open-round-picker'));
  };

  // Stop every flavor of pointer/touch/mouse/click event at the container
  // so nothing reaches the dialog backdrops behind the bar. The
  // data-timer-bar marker also lets Radix DialogContent recognize
  // interactions originating from the bar and refuse to close.
  const stopAny = (e) => {
    e.stopPropagation();
    if (typeof e.nativeEvent?.stopImmediatePropagation === 'function') {
      e.nativeEvent.stopImmediatePropagation();
    }
  };

  return (
    <div
      data-timer-bar="true"
      onClick={stopAny}
      onPointerDown={stopAny}
      onPointerUp={stopAny}
      onMouseDown={stopAny}
      onMouseUp={stopAny}
      onTouchStart={stopAny}
      onTouchEnd={stopAny}
      style={{
        position: 'fixed',
        bottom: bottomOffset,
        left: 0, right: 0,
        height: BAR_HEIGHT,
        background: barBg,
        borderTop: barBorder,
        display: 'flex',
        alignItems: 'center',
        padding: '0 6px',
        gap: 4,
        // Z-index hierarchy (definitive):
        //   Timer bar:         12000  (highest — always tappable)
        //   Custom modals:     11000  (LastSessionAlert, etc.)
        //   Dialog content:    11001
        //   Dialog backdrop:   11000
        //   Tabata fullscreen: 10000
        // Bar above modal backdrops so the user can keep using the
        // timer while a form is open. Bar's stopPropagation guards
        // prevent the click from also reaching the dialog underneath.
        zIndex: 12000,
        direction: 'rtl',
        transition: 'background 0.3s ease',
        cursor: 'default',
      }}
    >
      {/* RIGHT EDGE — Expand */}
      <button
        type="button"
        onClick={stop(onExpand)}
        onPointerDown={(e) => e.stopPropagation()}
        style={{ ...btnBase, width: 36, height: 36, borderRadius: 10, background: expandBg, marginLeft: 4 }}
        aria-label="הרחב"
      >
        <span style={{ pointerEvents: 'none', color: btnIconColor, fontSize: 16, fontWeight: 700 }}>⤢</span>
      </button>

      {/* RIGHT-OF-CENTER — Round number (tappable for jump picker) */}
      {roundText ? (
        <button
          type="button"
          onClick={stop(onRoundTap)}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            ...btnBase, marginLeft: 4, padding: '0 6px',
            background: 'transparent',
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 42, fontWeight: 700,
            color: primaryColor,
            lineHeight: 1,
            minWidth: 48,
          }}
          aria-label="בחר סבב"
        >
          <span style={{ pointerEvents: 'none' }}>{roundText}</span>
        </button>
      ) : null}

      {/* CENTER — Time (takes remaining space, allowed to shrink) */}
      <div style={{
        flex: 1, minWidth: 0, overflow: 'hidden',
        textAlign: 'center',
      }}>
        <div style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: 42, fontWeight: 700,
          letterSpacing: 2,
          color: timeColor,
          lineHeight: 1,
          whiteSpace: 'nowrap',
        }}>
          {display}
        </div>
      </div>

      {/* LEFT — Forward */}
      {hasRounds && (
        <button
          type="button"
          onClick={stop(onNextRound)}
          onPointerDown={(e) => e.stopPropagation()}
          style={{ ...btnBase, width: 34, height: 34, borderRadius: '50%', background: btnSoftBg }}
          aria-label="קדימה"
        >
          <span style={{ pointerEvents: 'none', color: btnIconColor, fontSize: 14 }}>⏭</span>
        </button>
      )}

      {/* Play/Pause */}
      <button
        type="button"
        onClick={stop(onToggle)}
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          ...btnBase, width: 46, height: 46, borderRadius: '50%',
          background: playBg,
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
        }}
        aria-label={paused ? 'המשך' : 'השהה'}
      >
        <span style={{ pointerEvents: 'none', color: playIconColor, fontSize: 20, fontWeight: 700 }}>
          {paused ? '▶' : '⏸'}
        </span>
      </button>

      {/* Backward */}
      {hasRounds && (
        <button
          type="button"
          onClick={stop(onPrevRound)}
          onPointerDown={(e) => e.stopPropagation()}
          style={{ ...btnBase, width: 34, height: 34, borderRadius: '50%', background: btnSoftBg }}
          aria-label="אחורה"
        >
          <span style={{ pointerEvents: 'none', color: btnIconColor, fontSize: 14 }}>⏮</span>
        </button>
      )}

      {/* Spacer */}
      <div style={{ width: 14, flexShrink: 0 }} />

      {/* FAR LEFT — Close */}
      <button
        type="button"
        onClick={stop(onClose)}
        onPointerDown={(e) => e.stopPropagation()}
        style={{ ...btnBase, width: 24, height: 24, borderRadius: '50%', background: closeBg }}
        aria-label="סגור טיימר"
      >
        <span style={{ pointerEvents: 'none', color: closeIconColor, fontSize: 12, fontWeight: 700 }}>✕</span>
      </button>
    </div>
  );
}

export default function TimerFooterBar() {
  const {
    activeTimers,
    setLiveTimerClock, setLiveTimerTabata,
    setShowTabata,
    isMinimized, setIsMinimized,
  } = useActiveTimer();
  const clock = useClock();
  const navigate = useNavigate();

  // Defensive 100ms tick — forces a re-render so the bar's display field
  // always reflects the latest liveTimer.display, even if the upstream
  // state propagation lagged for any reason. Cheap (re-renders only the
  // bar) and only runs while the bar is actually visible.
  const [, forceRender] = useReducer(x => x + 1, 0);
  useEffect(() => {
    if (!isMinimized || activeTimers.length === 0) return;
    const id = setInterval(forceRender, 100);
    return () => clearInterval(id);
  }, [isMinimized, activeTimers.length]);

  // Set a CSS custom property while the bar is visible so any dialog
  // backdrop can shorten itself by `bottom: var(--timer-bar-height,0)`
  // and never cover the bar — guarantees the bar receives every tap
  // even when an overlay-stacking-context bug would otherwise eat it.
  useEffect(() => {
    if (!isMinimized || !activeTimers.length) return;
    document.documentElement.style.setProperty('--timer-bar-height', '74px');
    return () => {
      document.documentElement.style.setProperty('--timer-bar-height', '0px');
    };
  }, [isMinimized, activeTimers.length]);

  // Only render when the user explicitly minimized an active timer.
  if (!isMinimized || !activeTimers.length) return null;

  // Bar play/pause: dispatch event ONLY for tabata — TabataTimer's
  // handlePause/handleResume own the state, the sounds (playSoftBreath
  // on resume, playPauseSound on pause), and update liveTimerTabata so
  // the bar's paused-icon flips as soon as that state propagates.
  const handleToggle = (timer) => {
    if (timer.type === 'tabata') {
      window.dispatchEvent(new CustomEvent('tabata-pause-resume'));
    } else {
      if (clock?.isRunning) clock.pause?.();
      else clock.resume?.();
      setLiveTimerClock(prev => prev ? { ...prev, paused: !prev.paused } : null);
    }
  };

  const handleExpand = (timer) => {
    setIsMinimized(false);
    if (timer.type === 'tabata') {
      setShowTabata(true);
    } else {
      navigate('/clocks', { state: { openTimer: timer.type } });
    }
  };

  const handleClose = (timer) => {
    if (timer.type === 'tabata') {
      window.dispatchEvent(new CustomEvent('tabata-reset'));
      setLiveTimerTabata(null);
    } else {
      clock.stop?.();
      setLiveTimerClock(null);
    }
  };

  const handlePrevRound = (timer) => {
    if (timer.type === 'tabata') {
      window.dispatchEvent(new CustomEvent('tabata-prev-round'));
    } else if (timer.type === 'emom') {
      window.dispatchEvent(new CustomEvent('emom-prev-round'));
    }
  };
  const handleNextRound = (timer) => {
    if (timer.type === 'tabata') {
      window.dispatchEvent(new CustomEvent('tabata-next-round'));
    } else if (timer.type === 'emom') {
      window.dispatchEvent(new CustomEvent('emom-next-round'));
    }
  };

  return (
    <>
      {activeTimers.map((t, i) => (
        <SingleBar
          key={t.type}
          timer={t}
          bottomOffset={i * BAR_HEIGHT}
          onToggle={() => handleToggle(t)}
          onExpand={() => handleExpand(t)}
          onClose={() => handleClose(t)}
          onPrevRound={() => handlePrevRound(t)}
          onNextRound={() => handleNextRound(t)}
        />
      ))}
    </>
  );
}
