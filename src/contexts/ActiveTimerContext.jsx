import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const ActiveTimerContext = createContext(null);

// Two independent timer engines can run at the same time:
// - "clock" engine: ClockContext-driven stopwatch or countdown timer
// - "tabata" engine: the standalone TabataTimer component
//
// Each gets its own slot so both bars can render together.
export const ActiveTimerProvider = ({ children }) => {
  const [liveTimerClock, setLiveTimerClock] = useState(null);
  const [liveTimerTabata, setLiveTimerTabata] = useState(null);
  const [showTabata, setShowTabata] = useState(false);
  // TimerFooterBar only renders when a timer is active AND the user
  // explicitly minimized it (tap of the minimize button or nav-away).
  const [isMinimized, setIsMinimized] = useState(false);
  // One-shot prefill bus for the Tabata overlay. Producers (e.g.
  // ExerciseCard's "הפעל שעון טבטה") drop a cfg here right before
  // setShowTabata(true); TabataTimer consumes it on mount and
  // immediately clears it so a subsequent plain entry from /clocks
  // falls back to the localStorage 'tb3' cfg untouched. Shape:
  //   { prep, work, rest, rb, rounds, sets, source: 'workout_exercise' }
  const [pendingTabataCfg, setPendingTabataCfg] = useState(null);

  // Legacy single-slot getter — prefer tabata since it has richer info.
  const liveTimer = liveTimerTabata || liveTimerClock;

  // Legacy setter routes by type. Function updaters are applied to the
  // slot that currently holds a value (tabata preferred).
  const setLiveTimer = useCallback((next) => {
    if (next === null) {
      setLiveTimerClock(null);
      setLiveTimerTabata(null);
      return;
    }
    if (typeof next === 'function') {
      if (liveTimerTabata) setLiveTimerTabata(next);
      else setLiveTimerClock(next);
      return;
    }
    if (next?.type === 'tabata') setLiveTimerTabata(next);
    else setLiveTimerClock(next);
  }, [liveTimerTabata]);

  const activeTimers = useMemo(
    () => [liveTimerClock, liveTimerTabata].filter(Boolean),
    [liveTimerClock, liveTimerTabata]
  );

  const value = {
    liveTimer,
    setLiveTimer,
    liveTimerClock,
    setLiveTimerClock,
    liveTimerTabata,
    setLiveTimerTabata,
    activeTimers,
    showTabata,
    setShowTabata,
    isMinimized,
    setIsMinimized,
    pendingTabataCfg,
    setPendingTabataCfg,
  };

  return (
    <ActiveTimerContext.Provider value={value}>
      {children}
    </ActiveTimerContext.Provider>
  );
};

export const useActiveTimer = () => useContext(ActiveTimerContext);
