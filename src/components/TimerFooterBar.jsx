import { useNavigate } from 'react-router-dom';
import { useActiveTimer } from '@/contexts/ActiveTimerContext';
import { useClock } from '@/contexts/ClockContext';

// Sticky footer bar(s) that replace the old draggable bubble.
// Up to 2 bars can stack (one per engine: clock + tabata).

const WORK_PHASE_TOKENS = ['עבודה', 'work', 'WORK', 'ריצה'];
const REST_PHASE_TOKENS = ['מנוחה', 'rest', 'REST', 'set_rest'];
const PREP_PHASE_TOKENS = ['הכנה', 'prepare', 'prep', 'PREP'];

const WORK_BG = '#FF6F20';
const REST_BG = '#16a34a';
const PREP_BG = '#3B82F6';

const TYPE_LABEL = {
  tabata: 'טבטה',
  timer: 'ספירה לאחור',
  stopwatch: 'סטופר',
  emom: 'EMOM',
  amrap: 'AMRAP',
};

function SingleBar({ timer, bottomOffset, onToggle, onExpand }) {
  const type = timer.type;
  const display = timer.display || '0:00';
  const phaseLabel = timer.phase || '';
  const info = timer.info || '';
  const paused = !!timer.paused;
  const isRunning = !paused;

  const isWorkPhase = WORK_PHASE_TOKENS.some(t => phaseLabel?.includes(t));
  const isRestPhase = REST_PHASE_TOKENS.some(t => phaseLabel?.includes(t));
  const isPrepPhase = PREP_PHASE_TOKENS.some(t => phaseLabel?.includes(t));
  const bg = isPrepPhase ? PREP_BG : isRestPhase ? REST_BG : WORK_BG;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: bottomOffset,
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
        transition: 'background 0.25s ease, bottom 0.2s ease',
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
          <div style={{ fontSize: 13, color: '#FFFFFF', fontWeight: 600 }}>
            {phaseLabel}
          </div>
        )}
        {info && (
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>{info}</div>
        )}
        <div style={{
          fontSize: 11, fontWeight: 600,
          color: 'rgba(255,255,255,0.7)',
          marginRight: 4,
        }}>
          {TYPE_LABEL[type] || type}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={onToggle}
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
          onClick={onExpand}
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

export default function TimerFooterBar() {
  const {
    activeTimers,
    setLiveTimerClock, setLiveTimerTabata,
    setShowTabata,
  } = useActiveTimer();
  const clock = useClock();
  const navigate = useNavigate();

  if (!activeTimers.length) return null;

  const handleToggle = (timer, e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
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
    if (timer.type === 'tabata') {
      setLiveTimerTabata(null);
      setShowTabata(true);
    } else {
      setLiveTimerClock(null);
      navigate('/clocks');
    }
  };

  return (
    <>
      {activeTimers.map((t, i) => (
        <SingleBar
          key={t.type}
          timer={t}
          bottomOffset={i * 62}
          onToggle={(e) => handleToggle(t, e)}
          onExpand={() => handleExpand(t)}
        />
      ))}
    </>
  );
}
