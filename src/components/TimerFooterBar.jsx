import { useEffect, useReducer } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveTimer } from '@/contexts/ActiveTimerContext';
import { useClock } from '@/contexts/ClockContext';

// Sticky footer bar(s) that appear ONLY when the user explicitly
// minimizes a running timer (tap the minimize button or navigate
// away while a timer is running). Up to 2 bars can stack — one per
// engine (clock + tabata).

const WORK_PHASE_TOKENS = ['עבודה', 'work', 'WORK', 'ריצה'];
const REST_PHASE_TOKENS = ['מנוחה', 'rest', 'REST', 'set_rest'];
const PREP_PHASE_TOKENS = ['הכנה', 'prepare', 'prep', 'PREP'];

const TYPE_LABEL = {
  tabata: 'טבטה',
  timer: 'ספירה לאחור',
  stopwatch: 'סטופר',
  emom: 'EMOM',
  amrap: 'AMRAP',
};
const TYPES_WITH_ROUNDS = new Set(['tabata', 'emom']);

const BAR_HEIGHT = 86;

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
  const isRunning = !paused;

  const isWorkPhase = WORK_PHASE_TOKENS.some(t => phaseLabel?.includes(t));
  const isRestPhase = REST_PHASE_TOKENS.some(t => phaseLabel?.includes(t));
  const isPrepPhase = PREP_PHASE_TOKENS.some(t => phaseLabel?.includes(t));

  const hasRounds = TYPES_WITH_ROUNDS.has(type);
  // Extract just "3/8" from info like "סבב 3/8 · סט 1/1".
  const roundMatch = info?.match?.(/(\d+\/\d+)/);
  const roundText = roundMatch ? roundMatch[1] : '';

  // Phase-aware palette
  let barBg, barBorder, primaryColor, timeColor, btnSoftBg, btnIconColor,
      playBg, playIconColor, expandBg, closeBg, closeIconColor, labelColor;

  if (isWorkPhase) {
    barBg = '#FF6F20';
    barBorder = 'none';
    primaryColor = '#FFFFFF';
    timeColor = '#FFFFFF';
    btnSoftBg = 'rgba(255,255,255,0.2)';
    btnIconColor = '#FFFFFF';
    playBg = '#FFFFFF';
    playIconColor = '#FF6F20';
    expandBg = 'rgba(255,255,255,0.2)';
    closeBg = 'rgba(255,255,255,0.08)';
    closeIconColor = 'rgba(255,255,255,0.4)';
    labelColor = 'rgba(255,255,255,0.5)';
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
    labelColor = '#aaa';
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
    labelColor = '#aaa';
  }

  const btnBase = {
    border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
    userSelect: 'none',
    WebkitTapHighlightColor: 'transparent',
    padding: 0,
  };
  const labelStyle = {
    fontSize: 7, fontWeight: 600, color: labelColor,
    marginTop: 2, textAlign: 'center', lineHeight: 1,
  };
  const colWrap = { display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 };

  const onRoundTap = () => {
    if (type === 'tabata') window.dispatchEvent(new CustomEvent('tabata-open-round-picker'));
    else if (type === 'emom') window.dispatchEvent(new CustomEvent('emom-open-round-picker'));
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: bottomOffset,
        left: 0, right: 0,
        height: BAR_HEIGHT,
        background: barBg,
        border: barBorder,
        borderRadius: 18,
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        gap: 6,
        // Above Radix Dialog overlay (z 2000) + ScrollPickerPopup overlay
        // (z 3000) + ProtectedCoachPage loading (z 10000). Picker popups
        // are bumped to z 6000 to stay above this bar.
        zIndex: 5000,
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
        style={{ ...btnBase, width: 42, height: 42, borderRadius: 14, background: expandBg, marginLeft: 10 }}
        aria-label="הרחב"
      >
        <span style={{ pointerEvents: 'none', color: btnIconColor, fontSize: 22, fontWeight: 700 }}>⤢</span>
      </button>

      {/* RIGHT-OF-CENTER — Round number (or prep label) */}
      {hasRounds && (
        isPrepPhase ? (
          <div style={{ marginLeft: 6, fontSize: 18, fontWeight: 700, color: primaryColor, flexShrink: 0 }}>
            ⏳ הכנה
          </div>
        ) : roundText ? (
          <button
            type="button"
            onClick={stop(onRoundTap)}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              ...btnBase, marginLeft: 6, padding: '0 4px',
              background: 'transparent',
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 34, fontWeight: 700,
              color: primaryColor,
              lineHeight: 1,
            }}
            aria-label="בחר סבב"
          >
            <span style={{ pointerEvents: 'none' }}>{roundText}</span>
          </button>
        ) : null
      )}

      {/* CENTER — Time */}
      <div style={{
        flex: 1, minWidth: 0,
        fontFamily: "'Barlow Condensed', sans-serif",
        fontSize: 52, fontWeight: 700,
        letterSpacing: 3,
        color: timeColor,
        textAlign: 'center',
        lineHeight: 1,
      }}>
        {display}
      </div>

      {/* LEFT THIRD — Forward / Play-Pause / Backward */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {hasRounds && (
          <div style={colWrap}>
            <button
              type="button"
              onClick={stop(onNextRound)}
              onPointerDown={(e) => e.stopPropagation()}
              style={{ ...btnBase, width: 38, height: 38, borderRadius: '50%', background: btnSoftBg }}
              aria-label="קדימה"
            >
              <span style={{ pointerEvents: 'none', color: btnIconColor, fontSize: 16 }}>⏭</span>
            </button>
            <span style={labelStyle}>קדימה</span>
          </div>
        )}

        <div style={colWrap}>
          <button
            type="button"
            onClick={stop(onToggle)}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              ...btnBase, width: 54, height: 54, borderRadius: '50%',
              background: playBg,
              boxShadow: '0 3px 10px rgba(0,0,0,0.18)',
            }}
            aria-label={isRunning ? 'השהה' : 'המשך'}
          >
            <span style={{ pointerEvents: 'none', color: playIconColor, fontSize: 24, fontWeight: 700 }}>
              {paused ? '▶' : '⏸'}
            </span>
          </button>
          <span style={labelStyle}>{paused ? 'המשך' : 'השהה'}</span>
        </div>

        {hasRounds && (
          <div style={colWrap}>
            <button
              type="button"
              onClick={stop(onPrevRound)}
              onPointerDown={(e) => e.stopPropagation()}
              style={{ ...btnBase, width: 38, height: 38, borderRadius: '50%', background: btnSoftBg }}
              aria-label="אחורה"
            >
              <span style={{ pointerEvents: 'none', color: btnIconColor, fontSize: 16 }}>⏮</span>
            </button>
            <span style={labelStyle}>אחורה</span>
          </div>
        )}
      </div>

      {/* SPACER */}
      <div style={{ width: 24, flexShrink: 0 }} />

      {/* FAR LEFT — Close */}
      <div style={colWrap}>
        <button
          type="button"
          onClick={stop(onClose)}
          onPointerDown={(e) => e.stopPropagation()}
          style={{ ...btnBase, width: 26, height: 26, borderRadius: '50%', background: closeBg }}
          aria-label="סגור טיימר"
        >
          <span style={{ pointerEvents: 'none', color: closeIconColor, fontSize: 13, fontWeight: 700 }}>✕</span>
        </button>
        <span style={{ ...labelStyle, opacity: 0.7 }}>סגור</span>
      </div>
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

  // Only render when the user explicitly minimized an active timer.
  if (!isMinimized || !activeTimers.length) return null;

  // Bar play/pause: dispatch event ONLY for tabata — TabataTimer's
  // handlePause/handleResume own the state, the sound (playSoftBreath
  // on resume, silent on pause), and update liveTimerTabata via
  // setLiveTimer. The previous optimistic update here double-toggled
  // the paused flag and broke the icon.
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
      // Pass the specific timer type so Clocks.jsx opens the matching tab
      // (timer / stopwatch / emom / amrap) and the user sees the running
      // view directly rather than the type-selection / config screen.
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
