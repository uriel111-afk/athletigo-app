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

// Wrap each button handler so the click can never bubble to a parent
// (e.g. a Radix Dialog's "click-outside" backdrop that would close the
// form behind the bar). Only the expand button is allowed to navigate.
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
  // "Work" = orange bar (active/intense visual); anything else (rest/prep/
  // stopwatch/countdown with no phase) uses the cream card style.
  const barBg = isWorkPhase ? '#FF6F20' : '#FFF9F0';
  const borderTop = isWorkPhase ? '2px solid rgba(255,255,255,0.3)' : '2px solid #FF6F20';
  const primaryText = isWorkPhase ? '#FFFFFF' : '#FF6F20';
  const secondaryText = isWorkPhase ? 'rgba(255,255,255,0.8)' : '#888';
  const timeColor = isWorkPhase ? '#FFFFFF' : '#1a1a1a';
  const softBg = isWorkPhase ? 'rgba(255,255,255,0.2)' : 'rgba(255,111,32,0.1)';
  const closeBg = isWorkPhase ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.08)';
  const closeColor = isWorkPhase ? '#FFFFFF' : '#888';

  let phaseEmoji = '';
  let phaseText = '';
  if (isWorkPhase) { phaseEmoji = '🔥'; phaseText = 'עבודה'; }
  else if (isRestPhase) { phaseEmoji = '😮‍💨'; phaseText = 'מנוחה'; }
  else if (isPrepPhase) { phaseEmoji = '⏳'; phaseText = 'הכנה'; }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: bottomOffset,
        left: 0, right: 0,
        height: 72,
        background: barBg,
        borderTop,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 10px',
        zIndex: 1100,
        direction: 'rtl',
        transition: 'background 0.3s ease, bottom 0.2s ease',
        cursor: 'default',
      }}
    >
      {/* CLOSE — stops and removes timer */}
      <button
        onClick={stop(onClose)}
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          width: 28, height: 28, borderRadius: '50%',
          background: closeBg, border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}
        aria-label="סגור טיימר"
      >
        <span style={{ color: closeColor, fontSize: 14, fontWeight: 700 }}>✕</span>
      </button>

      {/* ROUND CONTROLS — tabata/emom only */}
      {hasRounds ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <button
            onClick={stop(onPrevRound)}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              width: 34, height: 34, borderRadius: '50%',
              background: softBg, border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            aria-label="סבב קודם"
          >
            <span style={{ color: primaryText, fontSize: 14 }}>⏮</span>
          </button>
          <button
            onClick={stop(onNextRound)}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              width: 34, height: 34, borderRadius: '50%',
              background: softBg, border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            aria-label="סבב הבא"
          >
            <span style={{ color: primaryText, fontSize: 14 }}>⏭</span>
          </button>
        </div>
      ) : <div style={{ width: 0 }} />}

      {/* PHASE + ROUND/TYPE INFO — round counter is tappable for jump picker */}
      <div style={{ textAlign: 'center', flex: 1, minWidth: 0, padding: '0 6px' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: primaryText }}>
          {phaseEmoji ? `${phaseEmoji} ${phaseText}` : (TYPE_LABEL[type] || type)}
        </div>
        {hasRounds && info ? (
          <div
            onClick={stop(() => {
              if (type === 'tabata') window.dispatchEvent(new CustomEvent('tabata-open-round-picker'));
              else if (type === 'emom') window.dispatchEvent(new CustomEvent('emom-open-round-picker'));
            })}
            onPointerDown={(e) => e.stopPropagation()}
            style={{ fontSize: 12, color: secondaryText, marginTop: 2, cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 2 }}
          >
            {info}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: secondaryText, marginTop: 2 }}>
            {phaseEmoji ? (TYPE_LABEL[type] || type) : ''}
          </div>
        )}
      </div>

      {/* TIME — large */}
      <div style={{
        fontFamily: "'Barlow Condensed', sans-serif",
        fontSize: 32, fontWeight: 700,
        color: timeColor, minWidth: 85, textAlign: 'center',
      }}>
        {display}
      </div>

      {/* PLAY / PAUSE */}
      <button
        onClick={stop(onToggle)}
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          width: 42, height: 42, borderRadius: '50%',
          background: isWorkPhase ? '#FFFFFF' : '#FF6F20',
          border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}
        aria-label={isRunning ? 'השהה' : 'נגן'}
      >
        <span style={{ color: isWorkPhase ? '#FF6F20' : '#FFFFFF', fontSize: 18 }}>
          {isRunning ? '⏸' : '▶'}
        </span>
      </button>

      {/* EXPAND — the only button allowed to navigate */}
      <button
        onClick={stop(onExpand)}
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          width: 34, height: 34, borderRadius: 10,
          background: softBg, border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}
        aria-label="הרחב"
      >
        <span style={{ color: primaryText, fontSize: 14 }}>⤢</span>
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

  // Only render when the user explicitly minimized an active timer.
  if (!isMinimized || !activeTimers.length) return null;

  const handleToggle = (timer) => {
    if (timer.type === 'tabata') {
      window.dispatchEvent(new CustomEvent('tabata-pause-resume'));
      setLiveTimerTabata(prev => prev ? { ...prev, paused: !prev.paused } : null);
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
      navigate('/clocks');
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
    // Hide the bar immediately; the other timer (if any) stays visible.
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
          bottomOffset={i * 72}
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
