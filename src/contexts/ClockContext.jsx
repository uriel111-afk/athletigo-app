import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from "react";

const ClockContext = createContext(null);
export const useClock = () => useContext(ClockContext);

const STORAGE_KEY = 'athletigo_clock_state';

function createAudioCtx() {
  return new (window.AudioContext || window.webkitAudioContext)();
}

function playTone(ctx, freq, duration, type = 'sine', vol = 0.5) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(vol, now);
  gain.gain.setValueAtTime(vol, now + Math.max(0, duration / 1000 - 0.02));
  gain.gain.linearRampToValueAtTime(0.001, now + duration / 1000);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration / 1000);
}

function playWhistle(ctx, startFreq, endFreq, duration, vol = 0.5) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  const now = ctx.currentTime;
  osc.frequency.setValueAtTime(startFreq, now);
  osc.frequency.linearRampToValueAtTime(endFreq, now + duration / 1000);
  gain.gain.setValueAtTime(vol, now);
  gain.gain.setValueAtTime(vol, now + Math.max(0, duration / 1000 - 0.02));
  gain.gain.linearRampToValueAtTime(0.001, now + duration / 1000);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration / 1000);
}

export function ClockProvider({ children }) {
  const [activeClock, setActiveClock] = useState(null);
  const [phase, setPhase] = useState('idle');
  const [display, setDisplay] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [phaseLabel, setPhaseLabel] = useState('');
  const [roundInfo, setRoundInfo] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [laps, setLaps] = useState([]);
  const [setProgress, setSetProgress] = useState({ current: 0, total: 0 });

  const intervalRef = useRef(null);
  const startTimeRef = useRef(0);
  const elapsedRef = useRef(0);
  const audioCtxRef = useRef(null);
  const phasesRef = useRef([]);
  const phaseIdxRef = useRef(0);
  const lastBeepRef = useRef(-1);
  const wakeLockRef = useRef(null);
  const [isMinimized, setIsMinimized] = useState(false);

  // isFullscreen = running AND not minimized
  const isFullscreen = isRunning && !isMinimized;

  const minimize = useCallback(() => setIsMinimized(true), []);
  const maximize = useCallback(() => setIsMinimized(false), []);

  // Wake Lock — active whenever timer runs (fullscreen or minimized)
  useEffect(() => {
    const acquireWakeLock = async () => {
      try {
        if ('wakeLock' in navigator && isRunning) {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
        }
      } catch {}
    };
    if (isRunning) acquireWakeLock();
    else { wakeLockRef.current?.release().catch(() => {}); wakeLockRef.current = null; setIsMinimized(false); }
    return () => { wakeLockRef.current?.release().catch(() => {}); };
  }, [isRunning]);

  // Re-acquire wake lock when page becomes visible again
  useEffect(() => {
    const handler = async () => {
      if (document.visibilityState === 'visible' && isRunning) {
        try {
          if ('wakeLock' in navigator) {
            wakeLockRef.current = await navigator.wakeLock.request('screen');
          }
        } catch {}
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [isRunning]);

  const ensureAudio = useCallback(() => {
    if (!audioCtxRef.current) audioCtxRef.current = createAudioCtx();
    if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
  }, []);

  const beep = useCallback((type) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    switch (type) {
      case 'countdown': playTone(ctx, 800, 150, 'sine', 0.9); break;
      case 'work': playWhistle(ctx, 600, 1200, 400, 0.9); break;
      case 'rest': playWhistle(ctx, 1000, 500, 500, 0.9); break;
      case 'set_rest':
        playTone(ctx, 800, 200, 'sine', 0.9);
        setTimeout(() => playTone(ctx, 500, 400, 'sine', 0.9), 350);
        break;
      case 'start': playTone(ctx, 800, 100, 'sine', 0.9); break;
      case 'pause': playTone(ctx, 400, 150, 'sine', 0.7); break;
      case 'lap': playTone(ctx, 600, 50, 'sine', 0.7); break;
      case 'done':
        playTone(ctx, 440, 400, 'triangle', 1.0);
        setTimeout(() => playTone(ctx, 660, 400, 'triangle', 1.0), 600);
        setTimeout(() => playTone(ctx, 880, 400, 'triangle', 1.0), 1200);
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
    setSetProgress({ current: 0, total: 0 });
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
    // Tap sound is supplied by the caller (SOUND_START in Clocks.jsx) so
    // start matches resume exactly — no extra internal beep here.
    intervalRef.current = setInterval(() => {
      setDisplay(Date.now() - startTimeRef.current + elapsedRef.current);
    }, 50);
  }, [ensureAudio, stop, beep]);

  const lapStopwatch = useCallback(() => {
    if (activeClock !== 'stopwatch' || !isRunning) return;
    beep('lap');
    setLaps(prev => [...prev, Date.now() - startTimeRef.current + elapsedRef.current]);
  }, [activeClock, isRunning, beep]);

  // === Phase runner (shared by timer & tabata) ===
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
    if (p.setIdx !== undefined) setSetProgress({ current: p.setIdx, total: p.totalSets });

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
      const secRemaining = Math.ceil(remaining / 1000);
      if (secRemaining <= 3 && secRemaining !== lastBeepRef.current && secRemaining > 0) {
        lastBeepRef.current = secRemaining;
        beep('countdown');
      }
    }, 100);
  }, [clearTick, beep]);

  // === TIMER ===
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
  }, [ensureAudio, stop, runPhase]);

  // === TABATA ===
  const startTabata = useCallback((settings) => {
    ensureAudio();
    stop();
    setActiveClock('tabata');
    const { workTime = 20, restTime = 10, rounds = 8, sets = 1, setRest = 60, prepareTime = 10 } = settings;
    const phases = [];
    if (prepareTime > 0) phases.push({ type: 'prepare', duration: prepareTime * 1000, label: 'הכנה', round: `סט 1/${sets} • סיבוב 1/${rounds}`, setIdx: 0, totalSets: sets });
    for (let s = 0; s < sets; s++) {
      for (let r = 0; r < rounds; r++) {
        phases.push({ type: 'work', duration: workTime * 1000, label: 'עבודה', round: `סט ${s + 1}/${sets} • סיבוב ${r + 1}/${rounds}`, setIdx: s, totalSets: sets });
        if (r < rounds - 1 || s < sets - 1) {
          phases.push({ type: 'rest', duration: restTime * 1000, label: 'מנוחה', round: `סט ${s + 1}/${sets} • סיבוב ${r + 1}/${rounds}`, setIdx: s, totalSets: sets });
        }
      }
      if (s < sets - 1) {
        phases.push({ type: 'set_rest', duration: setRest * 1000, label: 'מנוחה בין סטים', round: `סט ${s + 1}/${sets} • סיבוב ${rounds}/${rounds}`, setIdx: s + 1, totalSets: sets });
      }
    }
    phasesRef.current = phases;
    phaseIdxRef.current = 0;
    setSetProgress({ current: 0, total: sets });
    runPhase(0, phases);
  }, [ensureAudio, stop, runPhase]);

  // === PAUSE / RESUME ===
  const pause = useCallback(() => {
    if (!isRunning) return;
    clearTick();
    beep('pause');
    elapsedRef.current = Date.now() - startTimeRef.current;
    setIsRunning(false);
  }, [isRunning, clearTick, beep]);

  const resume = useCallback(() => {
    if (isRunning) return;
    // Tap sound is supplied by the caller (SOUND_START in Clocks.jsx) so
    // resume matches start exactly — no extra internal beep here.
    startTimeRef.current = Date.now() - elapsedRef.current;
    setIsRunning(true);
    if (activeClock === 'stopwatch') {
      const saved = elapsedRef.current;
      intervalRef.current = setInterval(() => {
        setDisplay(Date.now() - startTimeRef.current + saved);
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
      }, 100);
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

  // ── Persistence ──────────────────────────────────────────────────
  // Save snapshot to localStorage on every meaningful transition so a
  // page refresh can reconstruct the timer's current position.
  useEffect(() => {
    if (!activeClock) {
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
      return;
    }
    const snapshot = {
      activeClock,
      phases: phasesRef.current,
      phaseIdx: phaseIdxRef.current,
      startTime: startTimeRef.current,
      elapsedBeforePause: elapsedRef.current,
      isRunning,
      laps,
      phase,
      phaseLabel,
      roundInfo,
      totalDuration,
      setProgress,
      savedAt: Date.now(),
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)); } catch {}
  }, [activeClock, isRunning, laps, phase, phaseLabel, roundInfo, totalDuration, setProgress]);

  // Hydrate once on mount — if a timer was running when the tab was
  // closed/refreshed, reconstruct its state and continue from where it
  // would be "now" based on wall-clock time.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    let snap;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      snap = JSON.parse(raw);
    } catch { return; }
    if (!snap?.activeClock) return;

    phasesRef.current = Array.isArray(snap.phases) ? snap.phases : [];
    phaseIdxRef.current = snap.phaseIdx || 0;
    elapsedRef.current = snap.elapsedBeforePause || 0;
    startTimeRef.current = snap.startTime || Date.now();
    setLaps(Array.isArray(snap.laps) ? snap.laps : []);
    setActiveClock(snap.activeClock);

    // ─── Stopwatch ───
    if (snap.activeClock === 'stopwatch') {
      setPhase('running');
      if (snap.isRunning) {
        // elapsedBeforePause represents cumulative elapsed before any pause;
        // startTime is when the most recent run segment began
        setIsRunning(true);
        const saved = snap.elapsedBeforePause || 0;
        setDisplay(Date.now() - startTimeRef.current + saved);
        intervalRef.current = setInterval(() => {
          setDisplay(Date.now() - startTimeRef.current + saved);
        }, 50);
      } else {
        setIsRunning(false);
        setDisplay(snap.elapsedBeforePause || 0);
      }
      return;
    }

    // ─── Timer / Tabata ───
    const phases = phasesRef.current;
    let idx = phaseIdxRef.current;

    if (snap.isRunning) {
      // Advance through any phases that would have completed while offline
      let elapsed = Date.now() - snap.startTime;
      while (idx < phases.length && elapsed >= phases[idx].duration) {
        elapsed -= phases[idx].duration;
        idx++;
      }
      if (idx >= phases.length) {
        phaseIdxRef.current = phases.length;
        setPhase('done');
        setIsRunning(false);
        setPhaseLabel('סיום!');
        setDisplay(0);
        return;
      }
      phaseIdxRef.current = idx;
      const p = phases[idx];
      setPhase(p.type);
      setPhaseLabel(p.label);
      setRoundInfo(p.round || '');
      setTotalDuration(p.duration);
      if (p.setIdx !== undefined) setSetProgress({ current: p.setIdx, total: p.totalSets });
      setIsRunning(true);
      // Re-anchor so the remaining time lines up with wall-clock
      startTimeRef.current = Date.now() - elapsed;
      elapsedRef.current = 0;
      lastBeepRef.current = -1;
      const phaseStart = startTimeRef.current;
      intervalRef.current = setInterval(() => {
        const e = Date.now() - phaseStart;
        const remaining = p.duration - e;
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
      }, 100);
    } else {
      // Paused — restore view; resume() will continue when user taps play
      const p = phases[idx];
      if (p) {
        setPhase(p.type);
        setPhaseLabel(p.label);
        setRoundInfo(p.round || '');
        setTotalDuration(p.duration);
        if (p.setIdx !== undefined) setSetProgress({ current: p.setIdx, total: p.totalSets });
        setDisplay(Math.max(0, p.duration - (snap.elapsedBeforePause || 0)));
        setIsRunning(false);
      }
    }
  }, [runPhase, beep]);

  // Listen for remote reset (from FloatingTimer X button)
  useEffect(() => {
    const handleReset = (e) => {
      if (e.detail?.type === activeClock || !e.detail?.type) stop();
    };
    const handlePauseResume = (e) => {
      if (e.detail?.type !== activeClock) return;
      if (isRunning) pause();
      else resume();
    };
    window.addEventListener('clock-reset', handleReset);
    window.addEventListener('clock-pause-resume', handlePauseResume);
    return () => {
      window.removeEventListener('clock-reset', handleReset);
      window.removeEventListener('clock-pause-resume', handlePauseResume);
    };
  }, [activeClock, isRunning, stop, pause, resume]);

  return (
    <ClockContext.Provider value={{
      activeClock, phase, display, totalDuration, phaseLabel, roundInfo, isRunning, laps, setProgress,
      isFullscreen, isMinimized, minimize, maximize,
      startStopwatch, lapStopwatch, startTimer, startTabata,
      pause, resume, stop, reset,
    }}>
      {children}
    </ClockContext.Provider>
  );
}
