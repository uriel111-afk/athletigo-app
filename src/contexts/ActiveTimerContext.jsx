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
  const [liveTimerDynamic, setLiveTimerDynamic] = useState(null);
  const [showTabata, setShowTabata] = useState(false);
  // The countdown overlay — GlobalTimer in App.jsx, the SAME TimerView
  // the clocks tab renders. Raised by the plan screen so a hold or a
  // timed exercise gets the full clock instead of an inline strip.
  const [showTimer, setShowTimer] = useState(false);
  // The stopwatch overlay — GlobalStopwatch in App.jsx, the SAME
  // StopwatchView the clocks tab renders. Raised by the plan screen for
  // a rounds-only exercise, which has nothing to count down.
  const [showStopwatch, setShowStopwatch] = useState(false);
  const [showDynamic, setShowDynamic] = useState(false);
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
  // The same one-shot prefill idea for the countdown. Shape:
  //   { seconds, prepSeconds, exerciseName, source: 'workout_exercise' }
  // TimerView seeds its wheels from it; nothing is persisted, so the
  // trainee's own saved clock settings are never touched — the mirror
  // of the tabata's source flag.
  const [pendingTimerCfg, setPendingTimerCfg] = useState(null);
  // The stopwatch has no values to prefill — only a name to show.
  // Shape: { exerciseName, source: 'workout_exercise' }
  const [pendingStopwatchCfg, setPendingStopwatchCfg] = useState(null);

  // Legacy single-slot getter — prefer tabata since it has richer info.
  const liveTimer = liveTimerTabata || liveTimerDynamic || liveTimerClock;

  // Legacy setter routes by type. Function updaters are applied to the
  // slot that currently holds a value (tabata > dynamic > clock).
  const setLiveTimer = useCallback((next) => {
    if (next === null) {
      setLiveTimerClock(null);
      setLiveTimerTabata(null);
      setLiveTimerDynamic(null);
      return;
    }
    if (typeof next === 'function') {
      if (liveTimerTabata) setLiveTimerTabata(next);
      else if (liveTimerDynamic) setLiveTimerDynamic(next);
      else setLiveTimerClock(next);
      return;
    }
    if (next?.type === 'tabata') setLiveTimerTabata(next);
    else if (next?.type === 'dynamicIntervals') setLiveTimerDynamic(next);
    else setLiveTimerClock(next);
  }, [liveTimerTabata, liveTimerDynamic]);

  const activeTimers = useMemo(
    () => [liveTimerClock, liveTimerTabata, liveTimerDynamic].filter(Boolean),
    [liveTimerClock, liveTimerTabata, liveTimerDynamic]
  );

  const value = {
    liveTimer,
    setLiveTimer,
    liveTimerClock,
    setLiveTimerClock,
    liveTimerTabata,
    setLiveTimerTabata,
    liveTimerDynamic,
    setLiveTimerDynamic,
    activeTimers,
    showTabata,
    setShowTabata,
    showTimer,
    setShowTimer,
    showStopwatch,
    setShowStopwatch,
    showDynamic,
    setShowDynamic,
    isMinimized,
    setIsMinimized,
    pendingTabataCfg,
    setPendingTabataCfg,
    pendingTimerCfg,
    setPendingTimerCfg,
    pendingStopwatchCfg,
    setPendingStopwatchCfg,
  };

  return (
    <ActiveTimerContext.Provider value={value}>
      {children}
    </ActiveTimerContext.Provider>
  );
};

export const useActiveTimer = () => useContext(ActiveTimerContext);
