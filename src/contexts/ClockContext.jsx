import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from "react";

const ClockContext = createContext(null);
export const useClock = () => useContext(ClockContext);

// Sound system
function createAudioCtx() {
  return new (window.AudioContext || window.webkitAudioContext)();
}

function playTone(audioCtx, freq, duration, type = 'sine') {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration / 1000);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration / 1000);
}

export function ClockProvider({ children }) {
  const [activeClock, setActiveClock] = useState(null); // 'stopwatch' | 'timer' | 'tabata'
  const [phase, setPhase] = useState('idle'); // idle | prepare | work | rest | set_rest | done | running | paused
  const [display, setDisplay] = useState(0); // ms to display
  const [totalDuration, setTotalDuration] = useState(0);
  const [phaseLabel, setPhaseLabel] = useState('');
  const [roundInfo, setRoundInfo] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [laps, setLaps] = useState([]);

  const intervalRef = useRef(null);
  const startTimeRef = useRef(0);
  const elapsedRef = useRef(0);
  const audioCtxRef = useRef(null);
  const phasesRef = useRef([]);
  const phaseIdxRef = useRef(0);
  const lastBeepRef = useRef(-1);

  const ensureAudio = useCallback(() => {
    if (!audioCtxRef.current) audioCtxRef.current = createAudioCtx();
    if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
  }, []);

  const beep = useCallback((type) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    switch (type) {
      case 'countdown': playTone(ctx, 600, 80); break;
      case 'work': playTone(ctx, 880, 150, 'square'); break;
      case 'rest': playTone(ctx, 440, 400); break;
      case 'set_rest': playTone(ctx, 880, 200); setTimeout(() => playTone(ctx, 440, 200), 220); break;
      case 'done':
        playTone(ctx, 440, 300);
        setTimeout(() => playTone(ctx, 660, 300), 320);
        setTimeout(() => playTone(ctx, 880, 300), 640);
        break;
      default: break;
    }
  }, []);

  const clearTick = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  const stop = useCallback(() => {
    clearTick();
    setIsRunning(false);
    setActiveClock(null);
    setPhase('idle');
    setDisplay(0);
    setPhaseLabel('');
    setRoundInfo('');
    phasesRef.current = [];
    phaseIdxRef.current = 0;
  }, [clearTick]);

  // === STOPWATCH ===
  const startStopwatch = useCallback(() => {
    ensureAudio();
    stop();
    setActiveClock('stopwatch');
    setPhase('running');
    setIsRunning(true);
    setLaps([]);
    elapsedRef.current = 0;
    startTimeRef.current = Date.now();
    intervalRef.current = setInterval(() => {
      setDisplay(Date.now() - startTimeRef.current + elapsedRef.current);
    }, 50);
  }, [ensureAudio, stop]);

  const lapStopwatch = useCallback(() => {
    if (activeClock !== 'stopwatch' || !isRunning) return;
    setLaps(prev => [...prev, Date.now() - startTimeRef.current + elapsedRef.current]);
  }, [activeClock, isRunning]);

  // === TIMER (Countdown) ===
  const startTimer = useCallback((totalMs, prepareMs = 3000) => {
    ensureAudio();
    stop();
    setActiveClock('timer');
    const phases = [];
    if (prepareMs > 0) phases.push({ type: 'prepare', duration: prepareMs, label: 'הכנה' });
    phases.push({ type: 'work', duration: totalMs, label: 'טיימר' });
    phasesRef.current = phases;
    phaseIdxRef.current = 0;
    runPhase(0, phases);
  }, [ensureAudio, stop]);

  // === TABATA ===
  const startTabata = useCallback((settings) => {
    ensureAudio();
    stop();
    setActiveClock('tabata');
    const { workTime = 20, restTime = 10, rounds = 8, sets = 1, setRest = 60, prepareTime = 3 } = settings;
    const phases = [];
    if (prepareTime > 0) phases.push({ type: 'prepare', duration: prepareTime * 1000, label: 'הכנה' });
    for (let s = 0; s < sets; s++) {
      for (let r = 0; r < rounds; r++) {
        phases.push({ type: 'work', duration: workTime * 1000, label: `עבודה`, round: `סט ${s + 1} • סיבוב ${r + 1}/${rounds}` });
        if (r < rounds - 1 || s < sets - 1) {
          phases.push({ type: 'rest', duration: restTime * 1000, label: 'מנוחה', round: `סט ${s + 1} • סיבוב ${r + 1}/${rounds}` });
        }
      }
      if (s < sets - 1) {
        phases.push({ type: 'set_rest', duration: setRest * 1000, label: 'מנוחה בין סטים', round: `סט ${s + 1} סיום` });
      }
    }
    phasesRef.current = phases;
    phaseIdxRef.current = 0;
    runPhase(0, phases);
  }, [ensureAudio, stop]);

  const runPhase = useCallback((idx, phases) => {
    clearTick();
    if (idx >= phases.length) {
      setPhase('done');
      setIsRunning(false);
      setPhaseLabel('סיום!');
      setDisplay(0);
      beep('done');
      return;
    }
    const p = phases[idx];
    phaseIdxRef.current = idx;
    setPhase(p.type);
    setPhaseLabel(p.label);
    setRoundInfo(p.round || '');
    setTotalDuration(p.duration);
    setDisplay(p.duration);
    setIsRunning(true);
    lastBeepRef.current = -1;
    startTimeRef.current = Date.now();
    elapsedRef.current = 0;

    if (p.type === 'work') beep('work');
    else if (p.type === 'rest') beep('rest');
    else if (p.type === 'set_rest') beep('set_rest');

    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const remaining = p.duration - elapsed;
      if (remaining <= 0) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        runPhase(idx + 1, phases);
        return;
      }
      setDisplay(remaining);
      // Countdown beeps at 3,2,1
      const secRemaining = Math.ceil(remaining / 1000);
      if (secRemaining <= 3 && secRemaining !== lastBeepRef.current && secRemaining > 0) {
        lastBeepRef.current = secRemaining;
        beep('countdown');
      }
    }, 200);
  }, [clearTick, beep]);

  // === PAUSE / RESUME ===
  const pause = useCallback(() => {
    if (!isRunning) return;
    clearTick();
    elapsedRef.current = Date.now() - startTimeRef.current;
    setIsRunning(false);
    setPhase(prev => prev === 'running' ? 'paused' : prev);
  }, [isRunning, clearTick]);

  const resume = useCallback(() => {
    if (isRunning) return;
    startTimeRef.current = Date.now() - elapsedRef.current;
    setIsRunning(true);

    if (activeClock === 'stopwatch') {
      intervalRef.current = setInterval(() => {
        setDisplay(Date.now() - startTimeRef.current + elapsedRef.current);
      }, 50);
    } else {
      const phases = phasesRef.current;
      const idx = phaseIdxRef.current;
      const p = phases[idx];
      if (!p) return;
      intervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTimeRef.current;
        const remaining = p.duration - elapsed;
        if (remaining <= 0) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
          runPhase(idx + 1, phases);
          return;
        }
        setDisplay(remaining);
        const secRemaining = Math.ceil(remaining / 1000);
        if (secRemaining <= 3 && secRemaining !== lastBeepRef.current && secRemaining > 0) {
          lastBeepRef.current = secRemaining;
          beep('countdown');
        }
      }, 200);
    }
  }, [isRunning, activeClock, beep, runPhase]);

  const reset = useCallback(() => {
    clearTick();
    setIsRunning(false);
    setDisplay(0);
    setPhase('idle');
    setPhaseLabel('');
    setRoundInfo('');
    setLaps([]);
    elapsedRef.current = 0;
  }, [clearTick]);

  useEffect(() => () => clearTick(), [clearTick]);

  return (
    <ClockContext.Provider value={{
      activeClock, phase, display, totalDuration, phaseLabel, roundInfo, isRunning, laps,
      startStopwatch, lapStopwatch, startTimer, startTabata,
      pause, resume, stop, reset,
    }}>
      {children}
    </ClockContext.Provider>
  );
}
