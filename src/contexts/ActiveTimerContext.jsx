import React, { createContext, useContext, useState, useRef, useCallback } from "react";

const ActiveTimerContext = createContext(null);
export const useActiveTimer = () => useContext(ActiveTimerContext);

export function ActiveTimerProvider({ children }) {
  // Floating widget state (set when minimized)
  const [liveTimer, setLiveTimer] = useState(null);

  // Live tabata state for UI
  const [tabata, setTabata] = useState({
    screen: 'settings',
    running: false,
    phase: 'הכנה',
    timeLeft: 0,
    phaseDuration: 0,
    currentRound: 1,
    currentSet: 1,
    countdown: 0,
    countdown321: null,
  });

  // Settings ref — set before start
  const settingsRef = useRef({
    prepTime: 10, workTime: 20, restTime: 10,
    rounds: 8, sets: 3, restBetweenSets: 60, countdownTime: 30,
  });

  // Mutable state for interval access (no stale closures)
  const sRef = useRef({
    phase: 'הכנה', timeLeft: 0, phaseDuration: 0,
    currentRound: 1, currentSet: 1, running: false,
  });

  const intervalRef = useRef(null);
  const countdown321Ref = useRef(null);
  const parallelRef = useRef(null);
  const parallelVal = useRef(0);
  // Track phase changes for sound effects in UI
  const [phaseChange, setPhaseChange] = useState(null); // { phase, ts }

  const update = useCallback((updates) => {
    Object.assign(sRef.current, updates);
    setTabata(prev => ({ ...prev, ...updates }));
  }, []);

  // === PHASE ADVANCEMENT ===
  const advancePhase = useCallback(() => {
    const { phase, currentRound, currentSet } = sRef.current;
    const { workTime, restTime, rounds, sets, restBetweenSets } = settingsRef.current;

    let newPhase, newTime, newRound = currentRound, newSet = currentSet;

    if (phase === 'הכנה') {
      newPhase = 'עבודה'; newTime = workTime;
    } else if (phase === 'עבודה') {
      newPhase = 'מנוחה'; newTime = restTime;
    } else if (phase === 'מנוחה') {
      if (currentRound < rounds) {
        newRound = currentRound + 1;
        newPhase = 'עבודה'; newTime = workTime;
      } else if (currentSet < sets) {
        newRound = 1; newSet = currentSet + 1;
        newPhase = 'מנוחה בין סטים'; newTime = restBetweenSets;
      } else {
        // COMPLETE
        clearInterval(intervalRef.current);
        clearInterval(parallelRef.current);
        update({ screen: 'complete', running: false, timeLeft: 0 });
        setPhaseChange({ phase: 'complete', ts: Date.now() });
        setLiveTimer(null);
        return;
      }
    } else if (phase === 'מנוחה בין סטים') {
      newPhase = 'עבודה'; newTime = workTime;
    } else { return; }

    update({
      phase: newPhase, timeLeft: newTime, phaseDuration: newTime,
      currentRound: newRound, currentSet: newSet,
    });
    setPhaseChange({ phase: newPhase, ts: Date.now() });
  }, [update]);

  // === INTERVAL ===
  const startInterval = useCallback(() => {
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      const t = sRef.current.timeLeft;
      if (t <= 1) {
        advancePhase();
        return;
      }
      const next = t - 1;
      sRef.current.timeLeft = next;
      setTabata(prev => ({ ...prev, timeLeft: next }));
      // Signal countdown beep at 3,2,1
      if (next === 3 || next === 2 || next === 1) {
        setPhaseChange({ phase: 'tick', ts: Date.now() });
      }
    }, 1000);
  }, [advancePhase]);

  // === START ===
  const startTabata = useCallback((settings) => {
    settingsRef.current = { ...settingsRef.current, ...settings };
    const { prepTime, workTime, countdownTime } = settingsRef.current;

    // 3-2-1-GO countdown
    update({ screen: 'countdown', countdown321: 3 });
    setPhaseChange({ phase: 'countdown', ts: Date.now() });

    let count = 3;
    countdown321Ref.current = setInterval(() => {
      count -= 1;
      if (count > 0) {
        update({ countdown321: count });
        setPhaseChange({ phase: 'countdown', ts: Date.now() });
      } else {
        clearInterval(countdown321Ref.current);
        update({ countdown321: 'GO' });
        setPhaseChange({ phase: 'go', ts: Date.now() });

        setTimeout(() => {
          const initPhase = prepTime > 0 ? 'הכנה' : 'עבודה';
          const initTime = prepTime > 0 ? prepTime : workTime;

          update({
            screen: 'running', running: true,
            phase: initPhase, timeLeft: initTime, phaseDuration: initTime,
            currentRound: 1, currentSet: 1,
            countdown: countdownTime,
          });

          // Parallel countdown
          parallelVal.current = countdownTime;
          parallelRef.current = setInterval(() => {
            parallelVal.current -= 1;
            setTabata(prev => ({ ...prev, countdown: parallelVal.current }));
            if (parallelVal.current <= 0) {
              clearInterval(parallelRef.current);
              setPhaseChange({ phase: 'parallel_done', ts: Date.now() });
            }
          }, 1000);

          startInterval();
        }, 800);
      }
    }, 1000);
  }, [update, startInterval]);

  // === PAUSE / RESUME ===
  const pauseTabata = useCallback(() => {
    if (sRef.current.running) {
      clearInterval(intervalRef.current);
      clearInterval(parallelRef.current);
      update({ running: false });
    } else {
      update({ running: true });
      startInterval();
      parallelRef.current = setInterval(() => {
        parallelVal.current -= 1;
        setTabata(prev => ({ ...prev, countdown: parallelVal.current }));
        if (parallelVal.current <= 0) clearInterval(parallelRef.current);
      }, 1000);
    }
  }, [update, startInterval]);

  // === RESET ===
  const resetTabata = useCallback(() => {
    clearInterval(intervalRef.current);
    clearInterval(parallelRef.current);
    clearInterval(countdown321Ref.current);
    sRef.current = {
      phase: 'הכנה', timeLeft: 0, phaseDuration: 0,
      currentRound: 1, currentSet: 1, running: false,
    };
    setTabata({
      screen: 'settings', running: false,
      phase: 'הכנה', timeLeft: 0, phaseDuration: 0,
      currentRound: 1, currentSet: 1,
      countdown: 0, countdown321: null,
    });
    setLiveTimer(null);
  }, []);

  return (
    <ActiveTimerContext.Provider value={{
      tabata, settingsRef, phaseChange,
      startTabata, pauseTabata, resetTabata,
      liveTimer, setLiveTimer,
    }}>
      {children}
    </ActiveTimerContext.Provider>
  );
}
