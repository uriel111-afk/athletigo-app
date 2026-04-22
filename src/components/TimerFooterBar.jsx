import { useNavigate } from 'react-router-dom';
import { useActiveTimer } from '@/contexts/ActiveTimerContext';
import { useClock } from '@/contexts/ClockContext';

// Sticky footer bar that replaces the old draggable bubble.
// Shows whenever a timer (stopwatch / countdown / tabata) is
// running or paused. Sits above the bottom nav at z-index 1100.

const WORK_PHASE_TOKENS = ['עבודה', 'work', 'WORK', 'ריצה'];

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
        background: '#1a1a1a',
        borderTop: '2px solid #FF6F20',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        zIndex: 1100,
        direction: 'rtl',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 10, height: 10, borderRadius: '50%',
          background: isWorkPhase ? '#FF6F20' : '#6b7280',
        }} />
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
            color: isWorkPhase ? '#FF6F20' : '#9CA3AF',
            fontWeight: 600,
          }}>
            {phaseLabel}
          </div>
        )}
        {info && (
          <div style={{ fontSize: 13, color: '#9CA3AF' }}>{info}</div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={togglePlayPause}
          style={{
            width: 42, height: 42, borderRadius: '50%',
            background: '#FF6F20', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}
          aria-label={isRunning ? 'השהה' : 'נגן'}
        >
          <span style={{ color: 'white', fontSize: 18 }}>
            {isRunning ? '⏸' : '▶'}
          </span>
        </button>
        <button
          onClick={handleExpand}
          style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'rgba(255,255,255,0.1)', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'white', fontSize: 16,
          }}
          aria-label="הרחב"
        >⤢</button>
      </div>
    </div>
  );
}
