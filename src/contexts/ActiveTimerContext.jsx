import React, { createContext, useContext, useState, useRef, useCallback } from "react";

// ── Direct sound functions (no event chain, always fires) ──
const _createCtx = () => {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  ctx.resume();
  const m = ctx.createGain(); m.gain.value = 1.4; m.connect(ctx.destination);
  return { ctx, m };
};
const _tone = (freq, dur, gv = 0.65, delay = 0) => {
  try {
    const { ctx, m } = _createCtx();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(m); o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0, ctx.currentTime + delay);
    g.gain.linearRampToValueAtTime(gv, ctx.currentTime + delay + 0.005);
    g.gain.setValueAtTime(gv, ctx.currentTime + delay + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + dur);
    o.start(ctx.currentTime + delay); o.stop(ctx.currentTime + delay + dur);
  } catch(e) {}
};
const _TICK = () => _tone(880, 0.07, 0.65);
const _WORK = () => {
  try {
    const { ctx, m } = _createCtx();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(m); o.type = 'sine'; o.frequency.value = 1350;
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0.65, ctx.currentTime + 0.01);
    g.gain.setValueAtTime(0.65, ctx.currentTime + 0.28);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.38);
    o.start(); o.stop(ctx.currentTime + 0.38);
  } catch(e) {}
};
const _BELL = () => {
  try {
    const { ctx, m } = _createCtx();
    const o1 = ctx.createOscillator(); const g1 = ctx.createGain();
    o1.connect(g1); g1.connect(m); o1.type = 'sine'; o1.frequency.value = 520;
    g1.gain.setValueAtTime(0.65, ctx.currentTime);
    g1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);
    o1.start(); o1.stop(ctx.currentTime + 1.5);
    const o2 = ctx.createOscillator(); const g2 = ctx.createGain();
    o2.connect(g2); g2.connect(m); o2.type = 'sine'; o2.frequency.value = 1040;
    g2.gain.setValueAtTime(0.2, ctx.currentTime);
    g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.9);
    o2.start(); o2.stop(ctx.currentTime + 0.9);
  } catch(e) {}
};
const _DOUBLE_BELL = () => { _BELL(); setTimeout(_BELL, 600); };
const _TRIPLE_BELL = () => { _BELL(); setTimeout(_BELL, 500); setTimeout(_BELL, 1000); };

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
  const wakeLockRef = useRef(null);
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
      newPhase = 'עבודה'; newTime = workTime; _WORK();
    } else if (phase === 'עבודה') {
      newPhase = 'מנוחה'; newTime = restTime; _BELL();
    } else if (phase === 'מנוחה') {
      if (currentRound < rounds) {
        newRound = currentRound + 1;
        newPhase = 'עבודה'; newTime = workTime; _WORK();
      } else if (currentSet < sets) {
        newRound = 1; newSet = currentSet + 1;
        newPhase = 'מנוחה בין סטים'; newTime = restBetweenSets; _DOUBLE_BELL();
      } else {
        // COMPLETE
        clearInterval(intervalRef.current);
        clearInterval(parallelRef.current);
        update({ screen: 'complete', running: false, timeLeft: 0 });
        _TRIPLE_BELL();
        setLiveTimer(null);
        wakeLockRef.current?.release().catch(() => {}); wakeLockRef.current = null;
        return;
      }
    } else if (phase === 'מנוחה בין סטים') {
      newPhase = 'עבודה'; newTime = workTime; _WORK();
    } else { return; }

    update({
      phase: newPhase, timeLeft: newTime, phaseDuration: newTime,
      currentRound: newRound, currentSet: newSet,
    });
  }, [update]);

  // === INTERVAL ===
  const startInterval = useCallback(() => {
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      sRef.current.timeLeft -= 1;
      const next = sRef.current.timeLeft;
      console.log('⏱ CONTEXT TICK', new Date().toLocaleTimeString(), 'timeLeft:', next);

      // Direct sound — fires immediately, no event chain
      if (next === 3 || next === 2 || next === 1) {
        _TICK();
        console.log('[CTX] TICK sound at', next);
      }

      if (next <= 0) {
        advancePhase();
      } else {
        setTabata(prev => ({ ...prev, timeLeft: next }));
        // Update floating widget live
        setLiveTimer(prev => {
          if (!prev) return null;
          const { rounds, sets } = settingsRef.current;
          return { ...prev, display: String(next), phase: sRef.current.phase,
            info: `סיבוב ${sRef.current.currentRound}/${rounds} • סט ${sRef.current.currentSet}/${sets}` };
        });
      }
    }, 1000);
  }, [advancePhase]);

  // === START ===
  const startTabata = useCallback((settings) => {
    settingsRef.current = { ...settingsRef.current, ...settings };
    const { prepTime, workTime, countdownTime } = settingsRef.current;

    // 3-2-1-GO countdown — sounds called directly
    update({ screen: 'countdown', countdown321: 3, running: true });
    _TICK();

    let count = 3;
    countdown321Ref.current = setInterval(() => {
      count -= 1;
      if (count > 0) {
        update({ countdown321: count });
        _TICK();
      } else {
        clearInterval(countdown321Ref.current);
        update({ countdown321: 'GO' });
        _tone(1100, 0.10, 0.65, 0); _tone(1600, 0.15, 0.65, 0.11); // GO sound

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
            }
          }, 1000);

          startInterval();
          // Wake lock
          try { if ('wakeLock' in navigator) navigator.wakeLock.request('screen').then(l => { wakeLockRef.current = l; }).catch(() => {}); } catch(e) {}
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
    wakeLockRef.current?.release().catch(() => {}); wakeLockRef.current = null;
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
