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
  // Track phase changes for sound effects in UI — counter ensures uniqueness
  const phaseChangeCounter = useRef(0);
  const [phaseChange, setPhaseChange] = useState(null); // { phase, id }

  const update = useCallback((updates) => {
    Object.assign(sRef.current, updates);
    setTabata(prev => ({ ...prev, ...updates }));
  }, []);

  const emitPhase = useCallback((phase) => {
    phaseChangeCounter.current += 1;
    setPhaseChange({ phase, id: phaseChangeCounter.current });
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
        emitPhase('complete');
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
    emitPhase(newPhase);
  }, [update, emitPhase]);

  // === INTERVAL ===
  const startInterval = useCallback(() => {
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      sRef.current.timeLeft -= 1;
      const next = sRef.current.timeLeft;

      // Play beep for last 3 seconds FIRST (before state update)
      if (next === 3 || next === 2 || next === 1) {
        emitPhase('tick');
      }

      if (next <= 0) {
        advancePhase();
      } else {
        setTabata(prev => ({ ...prev, timeLeft: next }));
      }
    }, 1000);
  }, [advancePhase, emitPhase]);

  // === START ===
  const startTabata = useCallback((settings) => {
    settingsRef.current = { ...settingsRef.current, ...settings };
    const { prepTime, workTime, countdownTime } = settingsRef.current;

    // 3-2-1-GO countdown
    update({ screen: 'countdown', countdown321: 3 });
    emitPhase('countdown');

    let count = 3;
    countdown321Ref.current = setInterval(() => {
      count -= 1;
      if (count > 0) {
        update({ countdown321: count });
        emitPhase('countdown');
      } else {
        clearInterval(countdown321Ref.current);
        update({ countdown321: 'GO' });
        emitPhase('go');

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
              emitPhase('parallel_done');
            }
          }, 1000);

          startInterval();
        }, 800);
      }
    }, 1000);
  }, [update, startInterval, emitPhase]);

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
