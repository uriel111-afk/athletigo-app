import { useNavigate } from 'react-router-dom';
import { useActiveTimer } from '@/contexts/ActiveTimerContext';
import { useClock } from '@/contexts/ClockContext';

// Sticky footer bar that replaces the old draggable bubble.
// Shows whenever a timer (stopwatch / countdown / tabata) is
// running or paused. Sits above the bottom nav at z-index 1100.

const WORK_PHASE_TOKENS = ['עבודה', 'work', 'WORK', 'ריצה'];
const REST_PHASE_TOKENS = ['מנוחה', 'rest', 'REST', 'set_rest'];

const WORK_BG = '#FF6F20';   // matches full-screen work phase
const REST_BG = '#16a34a';   // calm green for rest phase

export default function TimerFooterBar() {
  const { liveTimer, setLiveTimer, setShowTabata } = useActiveTimer();
  const clock = useClock();
  const navigate = useNavigate();

  if (!liveTimer) return null;

  const type = liveTimer.type;
  const display = liveTimer.display || '0:00';
  const phaseLabel = liveTimer.phase || '';
  const info = liveTimer.info || '';
  const paused = !!liveTimer.paused;
  const isRunning = !paused;
  const isWorkPhase = WORK_PHASE_TOKENS.some(t => phaseLabel?.includes(t));
  const isRestPhase = REST_PHASE_TOKENS.some(t => phaseLabel?.includes(t));
  // Stopwatch/timer show orange by default; only tabata's rest phase flips green
  const bg = isRestPhase ? REST_BG : WORK_BG;

  const togglePlayPause = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (type === 'tabata') {
      window.dispatchEvent(new CustomEvent('tabata-pause-resume'));
    } else if (clock?.isRunning) {
      clock.pause?.();
    } else {
      clock.resume?.();
    }
    setLiveTimer(prev => prev ? { ...prev, paused: !prev.paused } : null);
  };

  const handleExpand = () => {
    if (type === 'tabata') {
      setLiveTimer(null);
      setShowTabata(true);
    } else {
      setLiveTimer(null);
      navigate('/clocks');
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: 62,
        background: bg,
        borderTop: '2px solid rgba(255,255,255,0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        zIndex: 1100,
        direction: 'rtl',
        transition: 'background 0.25s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: 28, fontWeight: 700, color: '#FFFFFF',
          minWidth: 80,
        }}>
          {display}
        </div>
        {phaseLabel && (
          <div style={{
            fontSize: 13,
            color: '#FFFFFF',
            fontWeight: 600,
          }}>
            {phaseLabel}
          </div>
        )}
        {info && (
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>{info}</div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={togglePlayPause}
          style={{
            width: 42, height: 42, borderRadius: '50%',
            background: '#FFFFFF', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}
          aria-label={isRunning ? 'השהה' : 'נגן'}
        >
          <span style={{ color: bg, fontSize: 18 }}>
            {isRunning ? '⏸' : '▶'}
          </span>
        </button>
        <button
          onClick={handleExpand}
          style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'rgba(255,255,255,0.25)', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'white', fontSize: 16,
          }}
          aria-label="הרחב"
        >⤢</button>
      </div>
    </div>
  );
}
