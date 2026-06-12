import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import {
  unlock as unlockAudio,
  playBeep, playVictory,
  playSoftBreath, playPauseSound, playActionMelody, playSlowPulse, cancelScheduled,
  vibrate, VIBRATION,
  requestNotifPermission, showTimerNotification, closeTimerNotification,
  acquireTimerWakeLock, releaseTimerWakeLock,
} from '@/lib/tabataSounds';
import { useActiveTimer } from '@/contexts/ActiveTimerContext';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

// ─── Constants (lifted from TabataTimer so the visible behavior is identical) ───
const R = 138, S = 8, SIZE = 320, CX = SIZE / 2, CY = SIZE / 2;
const CIRC = 2 * Math.PI * R;

const PHASE_LABEL = { work: 'עבודה', rest: 'מנוחה', done: 'סיום' };
const LS_KEY = 'dyn3';                            // saved sets list
const RUNTIME_KEY = 'dyn_intervals_runtime_state'; // running phase + timestamps

// ─── Persistence helpers ───
function load() {
  try {
    const r = localStorage.getItem(LS_KEY);
    if (r) {
      const parsed = JSON.parse(r);
      if (Array.isArray(parsed?.sets) && parsed.sets.length > 0) return parsed;
    }
  } catch {}
  return { sets: [{ work: 60, rest: 30 }, { work: 45, rest: 30 }, { work: 30, rest: 30 }] };
}

// nextPhase — walks a dynamic list of {work,rest} pairs.
// Rest is skipped after the LAST set (goes straight to done).
function nextPhase(cur, sets) {
  if (!Array.isArray(sets) || sets.length === 0) return { type: 'done', setIdx: 0, dur: 0 };
  const { type, setIdx } = cur;
  if (type === 'work') {
    if (setIdx >= sets.length - 1) return { type: 'done', setIdx, dur: 0 };
    return { type: 'rest', setIdx, dur: sets[setIdx].rest };
  }
  if (type === 'rest') {
    const ni = setIdx + 1;
    return { type: 'work', setIdx: ni, dur: sets[ni].work };
  }
  return { type: 'done', setIdx, dur: 0 };
}

// Same sound + haptic + notification contract as Tabata's
// runPhaseTransition. Centralized so tick/skip/hydrate all behave
// identically even when backgrounded.
function runPhaseTransition(fromType, nextP, sets) {
  const toType = nextP?.type;
  const idx = nextP?.setIdx ?? 0;
  const total = sets?.length ?? 0;
  if (toType === 'work')                              playActionMelody();
  if (fromType === 'work'  && toType === 'rest')      playSlowPulse();
  if (fromType === 'work'  && toType === 'done')      playVictory();

  if (toType === 'work') {
    vibrate(VIBRATION.workStart);
    showTimerNotification('🔥 AthletiGo — עבודה!', `סט ${idx + 1}/${total} · ${sets?.[idx]?.work ?? 0} שניות`);
  } else if (toType === 'rest') {
    vibrate(VIBRATION.restStart);
    showTimerNotification('💤 AthletiGo — מנוחה', `סט ${idx + 1}/${total} · ${sets?.[idx]?.rest ?? 0} שניות`);
  } else if (toType === 'done') {
    vibrate(VIBRATION.finish);
    showTimerNotification('🏆 AthletiGo — סיום!', `${total} סטים הושלמו! כל הכבוד 💪`);
  }
}

// ─── Component ───
export default function DynamicIntervalsTimer({ onMinimize, setLiveTimer }) {
  const initial = useMemo(load, []);
  const [sets, setSets] = useState(initial.sets);
  const [screen, setScreen] = useState('settings'); // settings | running | done
  const [phase, setPhase] = useState({ type: 'idle', setIdx: 0, dur: 0 });
  const [display, setDisplay] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);

  const navigate = useNavigate();
  const {
    setLiveTimerDynamic, setShowDynamic, setIsMinimized, showDynamic,
  } = useActiveTimer();

  let _user = null;
  try { _user = useAuth()?.user; } catch {}
  const _isCoach = _user?.role === 'coach' || _user?.is_coach === true || _user?.role === 'admin';
  const minimizeTarget = _isCoach ? '/dashboard' : '/trainee-home';

  const phaseRef = useRef(phase);
  const setsRef = useRef(sets);
  const screenRef = useRef(screen);
  const rafRef = useRef(null);
  const startAtRef = useRef(0);
  const elapsedRef = useRef(0);
  const lastBeepRef = useRef(-1);
  const pausedRef = useRef(false);
  const totalExerciseSecondsRef = useRef(0);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => {
    setsRef.current = sets;
    try { localStorage.setItem(LS_KEY, JSON.stringify({ sets })); } catch {}
  }, [sets]);
  useEffect(() => { screenRef.current = screen; }, [screen]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  // Total-time row measurement (mirrors Tabata pattern — useLayoutEffect
  // + ResizeObserver so the rect perimeter is correct on first paint).
  const totalRowRef = useRef(null);
  const [totalRowBox, setTotalRowBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = totalRowRef.current;
    if (!el) return;
    const measure = () => setTotalRowBox({ w: el.offsetWidth, h: el.offsetHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [screen]);

  // Phone back-button on settings screen — close overlay (config is auto-saved).
  useEffect(() => {
    if (!showDynamic || screen !== 'settings') return;
    window.history.pushState({ dynSettings: true }, '');
    const onPop = () => { setShowDynamic && setShowDynamic(false); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [showDynamic, screen, setShowDynamic]);

  useEffect(() => () => { cancelAnimationFrame(rafRef.current); cancelScheduled(); }, []);

  // ── Runtime persistence (same shape as Tabata's) ──
  useEffect(() => {
    if (screen === 'settings') {
      try { localStorage.removeItem(RUNTIME_KEY); } catch {}
      return;
    }
    const phaseElapsed = paused
      ? elapsedRef.current
      : (performance.now() - startAtRef.current) / 1000;
    const snapshot = {
      screen,
      phase: phaseRef.current,
      sets: setsRef.current,
      paused,
      phaseElapsed,
      savedAt: Date.now(),
    };
    try { localStorage.setItem(RUNTIME_KEY, JSON.stringify(snapshot)); } catch {}
  }, [screen, phase, paused]);

  // Hydrate on mount — reconstruct a running session that survived refresh.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    let snap;
    try {
      const raw = localStorage.getItem(RUNTIME_KEY);
      if (!raw) return;
      snap = JSON.parse(raw);
    } catch { return; }
    if (!snap || snap.screen === 'settings') return;

    const s = Array.isArray(snap.sets) && snap.sets.length > 0 ? snap.sets : sets;
    setsRef.current = s;
    setSets(s);

    if (snap.screen === 'done') {
      const idle = { type: 'done', setIdx: snap.phase?.setIdx || 0, dur: 0 };
      phaseRef.current = idle;
      setPhase(idle);
      setScreen('done');
      return;
    }

    const originalPhaseType = snap.phase?.type;
    let p = snap.phase || { type: 'work', setIdx: 0, dur: s[0]?.work || 0 };
    const offline = (Date.now() - (snap.savedAt || Date.now())) / 1000;
    let totalElapsed = (snap.phaseElapsed || 0) + (snap.paused ? 0 : offline);

    while (p && p.type !== 'done' && totalElapsed >= p.dur) {
      totalElapsed -= p.dur;
      p = nextPhase(p, s);
    }

    if (!p || p.type === 'done') {
      const done = { type: 'done', setIdx: s.length - 1, dur: 0 };
      phaseRef.current = done;
      setPhase(done);
      setDisplay(0);
      setProgress(1);
      setScreen('done');
      if (originalPhaseType && originalPhaseType !== 'done') {
        runPhaseTransition(originalPhaseType, done, s);
      }
      releaseTimerWakeLock();
      return;
    }

    if (originalPhaseType && originalPhaseType !== p.type) {
      runPhaseTransition(originalPhaseType, p, s);
    }
    acquireTimerWakeLock();

    phaseRef.current = p;
    setPhase(p);
    setDisplay(Math.max(0, p.dur - totalElapsed));
    setProgress(totalElapsed / p.dur);
    setScreen('running');
    setPaused(!!snap.paused);
    if (snap.paused) {
      elapsedRef.current = totalElapsed;
      startAtRef.current = performance.now() - totalElapsed * 1000;
    } else {
      startAtRef.current = performance.now() - totalElapsed * 1000;
      elapsedRef.current = 0;
      lastBeepRef.current = -1;
      rafRef.current = requestAnimationFrame(tick);
    }
  }, []);

  // ─── Core engine ───
  function beginPhase(p) {
    startAtRef.current = performance.now();
    elapsedRef.current = 0;
    lastBeepRef.current = -1;
    setPhase(p);
    phaseRef.current = p;
    setDisplay(p.dur);
    setProgress(0);
  }

  function tick() {
    if (pausedRef.current) { rafRef.current = null; return; }
    const p = phaseRef.current;
    if (p.type === 'idle' || p.type === 'done') return;

    const elapsed = (performance.now() - startAtRef.current) / 1000;
    const remaining = Math.max(0, p.dur - elapsed);
    const secs = Math.ceil(remaining);

    // 3-2-1 countdown beeps + tick vibration — identical to Tabata
    if (secs <= 3 && secs >= 1 && secs !== lastBeepRef.current) {
      lastBeepRef.current = secs;
      playBeep();
      vibrate(VIBRATION.tick);
    }

    if (remaining <= 0) {
      const nxt = nextPhase(p, setsRef.current);
      runPhaseTransition(p.type, nxt, setsRef.current);

      if (nxt.type === 'done') {
        setPhase(nxt);
        phaseRef.current = nxt;
        setDisplay(0);
        setProgress(1);
        setScreen('done');
        releaseTimerWakeLock();
        return;
      }
      beginPhase(nxt);
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    setDisplay(secs);
    setProgress(elapsed / p.dur);

    if (setLiveTimer && screenRef.current === 'running') {
      setLiveTimer({
        type: 'dynamicIntervals',
        display: String(secs),
        phase: PHASE_LABEL[p.type] || '',
        info: `סט ${p.setIdx + 1}/${setsRef.current.length}`,
        paused: pausedRef.current,
      });
    }
    rafRef.current = requestAnimationFrame(tick);
  }

  // ─── Handlers ───
  const handleStart = useCallback(async () => {
    if (!sets.length) return;
    await unlockAudio();
    try { requestNotifPermission(); } catch {}
    acquireTimerWakeLock();
    playSoftBreath();
    pausedRef.current = false;
    setPaused(false);
    setScreen('running');
    const first = { type: 'work', setIdx: 0, dur: sets[0].work };
    beginPhase(first);
    runPhaseTransition('idle', first, sets);
    rafRef.current = requestAnimationFrame(tick);
  }, [sets]);

  function handlePause() {
    if (pausedRef.current) return;
    pausedRef.current = true;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    cancelScheduled();
    elapsedRef.current = (performance.now() - startAtRef.current) / 1000;
    setPaused(true);
    playPauseSound();
    vibrate(VIBRATION.pause);
    if (setLiveTimerDynamic) setLiveTimerDynamic(prev => prev ? { ...prev, paused: true } : prev);
    if (setLiveTimer) setLiveTimer(prev => prev ? { ...prev, paused: true } : null);
  }

  function handleResume() {
    if (!pausedRef.current) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    pausedRef.current = false;
    startAtRef.current = performance.now() - elapsedRef.current * 1000;
    lastBeepRef.current = -1;
    setPaused(false);
    playSoftBreath();
    vibrate(VIBRATION.resume);
    if (setLiveTimerDynamic) setLiveTimerDynamic(prev => prev ? { ...prev, paused: false } : prev);
    if (setLiveTimer) setLiveTimer(prev => prev ? { ...prev, paused: false } : null);
    rafRef.current = requestAnimationFrame(tick);
  }

  function handleStop() {
    cancelAnimationFrame(rafRef.current);
    cancelScheduled();
    const idle = { type: 'idle', setIdx: 0, dur: 0 };
    setPhase(idle);
    phaseRef.current = idle;
    setDisplay(0);
    setProgress(0);
    setPaused(false);
    elapsedRef.current = 0;
    setScreen('settings');
    if (setLiveTimer) setLiveTimer(null);
    if (setLiveTimerDynamic) setLiveTimerDynamic(null);
    closeTimerNotification();
    releaseTimerWakeLock();
    try { localStorage.removeItem(RUNTIME_KEY); } catch {}
  }

  // Back button while running → minimize
  useEffect(() => {
    if (screen !== 'running') return;
    const onPop = (e) => {
      e.preventDefault();
      if (setLiveTimer) {
        setLiveTimer({
          type: 'dynamicIntervals',
          display: String(display),
          phase: PHASE_LABEL[phaseRef.current.type] || '',
          paused,
        });
        doMinimize();
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [screen, display, paused]);

  // Floating bar custom events — disjoint namespace from Tabata's so
  // both timers can be controlled independently when the bar stacks.
  useEffect(() => {
    const onReset = () => handleStop();
    const onPauseResume = () => { if (pausedRef.current) handleResume(); else handlePause(); };
    const onPrev = () => skipToPrev();
    const onNext = () => skipToNext();
    window.addEventListener('dyn-reset', onReset);
    window.addEventListener('dyn-pause-resume', onPauseResume);
    window.addEventListener('dyn-prev-round', onPrev);
    window.addEventListener('dyn-next-round', onNext);
    return () => {
      window.removeEventListener('dyn-reset', onReset);
      window.removeEventListener('dyn-pause-resume', onPauseResume);
      window.removeEventListener('dyn-prev-round', onPrev);
      window.removeEventListener('dyn-next-round', onNext);
    };
  }, []);

  // ─── Compute total workout time ───
  const totalWorkoutTime = useMemo(() => {
    let t = 0;
    sets.forEach((s, i) => {
      t += Math.max(0, +s.work || 0);
      if (i < sets.length - 1) t += Math.max(0, +s.rest || 0);
    });
    return t;
  }, [sets]);
  const twMin = Math.floor(totalWorkoutTime / 60);
  const twSec = totalWorkoutTime % 60;

  const totalExerciseSeconds = totalWorkoutTime;
  useEffect(() => { totalExerciseSecondsRef.current = totalExerciseSeconds; }, [totalExerciseSeconds]);

  // ─── Settings screen ───
  if (screen === 'settings') {
    const addSet = () => {
      setSets(prev => {
        const last = prev[prev.length - 1] || { work: 30, rest: 30 };
        return [...prev, { work: last.work, rest: last.rest }];
      });
    };
    const removeSet = (idx) => {
      setSets(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);
    };
    const updateSet = (idx, key, delta) => {
      setSets(prev => prev.map((s, i) => i !== idx ? s : {
        ...s,
        [key]: Math.max(key === 'work' ? 5 : 0, Math.min(600, (+s[key] || 0) + delta)),
      }));
    };

    return (
      <div style={{
        background: '#FFF9F0', height: '100%',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: 12, direction: 'rtl', overflowY: 'auto', overflowX: 'hidden',
      }}>
        <div style={{ fontSize: 24, fontWeight: 900, color: '#FF6F20', marginBottom: 4 }}>⏱ אינטרוולים דינאמיים</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a', marginBottom: 12 }}>בנה רשימת סטים</div>

        <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sets.map((s, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 12px', background: '#FFFFFF', borderRadius: 14,
              border: '1px solid rgba(255,111,32,0.15)',
              boxShadow: '0 2px 6px rgba(255,111,32,0.05)',
              gap: 8,
            }}>
              <div style={{
                minWidth: 38, height: 38, borderRadius: 10,
                background: '#FF6F20', color: '#FFF',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: 22, fontWeight: 800,
              }}>{i + 1}</div>

              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 6 }}>
                {/* WORK row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#FF6F20' }}>🔥 עבודה</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button onClick={() => updateSet(i, 'work', -5)} style={chipMinus}>−5</button>
                    <div style={chipValue}>{s.work}<span style={chipUnit}>שנ׳</span></div>
                    <button onClick={() => updateSet(i, 'work', +5)} style={chipPlus}>+5</button>
                  </div>
                </div>
                {/* REST row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#888' }}>💤 מנוחה</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button onClick={() => updateSet(i, 'rest', -5)} style={chipMinus}>−5</button>
                    <div style={chipValue}>{s.rest}<span style={chipUnit}>שנ׳</span></div>
                    <button onClick={() => updateSet(i, 'rest', +5)} style={chipPlus}>+5</button>
                  </div>
                </div>
              </div>

              <button
                onClick={() => removeSet(i)}
                disabled={sets.length <= 1}
                style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: sets.length <= 1 ? '#F5F5F5' : '#FFEDED',
                  color: sets.length <= 1 ? '#CCC' : '#DC2626',
                  border: 'none',
                  fontSize: 18, fontWeight: 800,
                  cursor: sets.length <= 1 ? 'not-allowed' : 'pointer',
                  flexShrink: 0,
                }}
                aria-label="מחק סט"
              >✕</button>
            </div>
          ))}
        </div>

        <button onClick={addSet} style={{
          marginTop: 10, width: '100%', maxWidth: 420,
          padding: '12px', fontSize: 16, fontWeight: 800,
          background: '#FFFFFF', color: '#FF6F20',
          border: '2px dashed #FF6F20', borderRadius: 12,
          cursor: 'pointer',
        }}>+ הוסף סט</button>

        <div style={{
          textAlign: 'center', padding: 12,
          background: 'white', borderRadius: 14,
          marginTop: 10, width: '100%', maxWidth: 420,
          border: '0.5px solid #F0E4D0',
        }}>
          <div style={{ fontSize: 12, color: '#888', fontWeight: 500, marginBottom: 4 }}>זמן כולל</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#FF6F20', fontFamily: "'Barlow Condensed', sans-serif" }}>
            {twMin}:{String(twSec).padStart(2, '0')}
          </div>
        </div>

        <button onClick={handleStart} style={{
          marginTop: 10, marginBottom: 16,
          width: '100%', maxWidth: 420,
          padding: 14, fontSize: 20, fontWeight: 900,
          background: '#FF6F20', color: '#FFFFFF',
          border: 'none', borderRadius: 14, cursor: 'pointer',
          boxShadow: '0 4px 14px rgba(255,111,32,0.3)',
        }}>▶ התחל אימון</button>
      </div>
    );
  }

  // ─── Done screen ───
  if (screen === 'done') {
    return (
      <div style={{ background: '#FF6F20', minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20, direction: 'rtl', color: '#FFF' }}>
        <div style={{ fontSize: 72, marginBottom: 12 }}>🎉</div>
        <div style={{ fontSize: 48, fontWeight: 900, marginBottom: 8 }}>סיימת!</div>
        <div style={{ fontSize: 24, opacity: 0.8 }}>{sets.length} סטים</div>
        <button onClick={handleStop} style={{ marginTop: 32, padding: '14px 48px', fontSize: 20, fontWeight: 900, background: '#FFF', color: '#FF6F20', border: 'none', borderRadius: 12, cursor: 'pointer' }}>
          אימון חדש
        </button>
      </div>
    );
  }

  // ─── Compute total remaining time (sub-second precision) ───
  function calcTotalRemaining() {
    const p = phaseRef.current;
    if (p.type === 'idle' || p.type === 'done') return 0;
    const elapsed = (performance.now() - startAtRef.current) / 1000;
    let total = Math.max(0, p.dur - elapsed);
    let cur = { ...p };
    while (true) {
      const nxt = nextPhase(cur, setsRef.current);
      if (nxt.type === 'done') break;
      total += nxt.dur;
      cur = nxt;
    }
    return total;
  }
  const totalLeftPrecise = calcTotalRemaining();
  const totalLeft = Math.ceil(totalLeftPrecise);
  const totalMin = Math.floor(totalLeft / 60);
  const totalSec = totalLeft % 60;
  const totalBorderProgress = totalExerciseSeconds > 0
    ? Math.max(0, Math.min(1, totalLeftPrecise / totalExerciseSeconds))
    : 0;

  // Total-row geometry
  const TOTAL_RING_INSET = 2;
  const TOTAL_RING_R = 14;
  const totalRingW = Math.max(0, totalRowBox.w - TOTAL_RING_INSET * 2);
  const totalRingH = Math.max(0, totalRowBox.h - TOTAL_RING_INSET * 2);
  const totalRingPerim = (totalRingW > 0 && totalRingH > 0)
    ? 2 * (totalRingW + totalRingH)
    : 0;
  const totalRingDashOffset = totalRingPerim * (1 - totalBorderProgress);

  // ─── Minimize ───
  function doMinimize() {
    const snapshot = {
      type: 'dynamicIntervals',
      display: String(display),
      phase: PHASE_LABEL[phaseRef.current.type] || '',
      info: `סט ${phase.setIdx + 1}/${sets.length}`,
      paused,
    };
    if (setLiveTimerDynamic) setLiveTimerDynamic(snapshot);
    else if (setLiveTimer) setLiveTimer(snapshot);

    if (setShowDynamic) setShowDynamic(false);
    if (setIsMinimized) setIsMinimized(true);

    Promise.resolve().then(() => {
      navigate(minimizeTarget, { replace: true });
    });
  }

  function skipToNext() {
    cancelScheduled();
    const nxt = nextPhase(phaseRef.current, setsRef.current);
    runPhaseTransition(phaseRef.current.type, nxt, setsRef.current);
    if (nxt.type === 'done') { setPhase(nxt); phaseRef.current = nxt; setDisplay(0); setProgress(1); setScreen('done'); return; }
    beginPhase(nxt);
    if (!paused) rafRef.current = requestAnimationFrame(tick);
  }

  function skipToPrev() {
    cancelScheduled();
    // Build full timeline and find current position
    const tl = [];
    let cur = { type: 'work', setIdx: 0, dur: setsRef.current[0]?.work || 0 };
    while (cur.type !== 'done') {
      tl.push(cur);
      cur = nextPhase(cur, setsRef.current);
    }
    const p = phaseRef.current;
    const idx = tl.findIndex(t => t.type === p.type && t.setIdx === p.setIdx);
    if (idx > 0) beginPhase(tl[idx - 1]);
    else beginPhase({ ...phaseRef.current });
    if (!paused) rafRef.current = requestAnimationFrame(tick);
  }

  const nextP = phase.type !== 'done' && phase.type !== 'idle'
    ? nextPhase(phase, sets)
    : null;

  // ─── Active Timer — FULL SCREEN, phase-driven theme (Tabata clone) ───
  const dashOffset = progress * CIRC;

  const isWork = phase.type === 'work';
  const cream = !isWork;
  const bg = isWork ? '#FF6F20' : '#FFF9F0';
  const textPrimary = cream ? '#1a1a1a' : '#FFFFFF';
  const ringTrack = isWork ? 'rgba(255,255,255,0.3)' : 'rgba(255,111,32,0.2)';
  const ringFill = isWork ? '#FFFFFF' : '#FF6F20';
  const chipBg = cream ? 'rgba(255,111,32,0.10)' : 'rgba(255,255,255,0.15)';
  const primaryBtn = {
    bg: isWork ? '#FFFFFF' : '#FF6F20',
    fg: isWork ? '#FF6F20' : '#FFFFFF',
  };
  const secondaryBtn = isWork
    ? { bg: chipBg, fg: textPrimary, border: 'none' }
    : { bg: '#FFFFFF', fg: '#1A1A1A', border: '1px solid #F0E4D0' };

  return (
    <div style={{
      background: bg, height: '100%',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 14px',
      paddingBottom: 'max(env(safe-area-inset-bottom), 10px)',
      direction: 'rtl', color: textPrimary,
      overflow: 'hidden',
      transition: 'background 0.3s ease, color 0.3s ease',
    }}>
      {/* TOP — phase title + minimize + set counter + total row */}
      <div style={{ width: '100%', maxWidth: 460, flexShrink: 0 }}>
        <div style={{ position: 'relative', width: '100%', minHeight: 64 }}>
          <button
            type="button"
            onClick={doMinimize}
            aria-label="מזער טיימר"
            style={{
              position: 'absolute', top: 0, left: 0,
              background: isWork ? 'rgba(255,255,255,0.2)' : 'rgba(255,111,32,0.1)',
              color: isWork ? '#FFFFFF' : '#FF6F20',
              border: 'none', borderRadius: 10,
              padding: '8px 14px',
              fontSize: 14, fontWeight: 700,
              cursor: 'pointer', touchAction: 'manipulation',
              zIndex: 5, minHeight: 36,
            }}
          >מזער ↗</button>
          {(() => {
            const phaseLabel = PHASE_LABEL[phase.type] || '';
            const titleSize = phaseLabel.length > 6 ? 42 : 64;
            return (
              <div style={{
                textAlign: 'right',
                paddingLeft: 100,
                paddingTop: 4,
                direction: 'rtl',
                fontSize: titleSize,
                fontWeight: 800,
                lineHeight: 0.9,
                letterSpacing: '-2px',
                color: isWork ? '#FFFFFF' : '#FF6F20',
                whiteSpace: 'nowrap',
              }}>{phaseLabel}</div>
            );
          })()}
        </div>

        {/* SET counter row */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <div style={{
            flex: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            background: isWork ? 'rgba(255,255,255,0.15)' : 'rgba(255,111,32,0.08)',
            borderRadius: 12,
            padding: '10px 12px',
          }}>
            <span style={{
              fontSize: 24, fontWeight: 600,
              color: isWork ? 'rgba(255,255,255,0.75)' : '#888',
            }}>סט</span>
            <span style={{
              fontSize: 36, fontWeight: 800,
              fontVariantNumeric: 'tabular-nums',
              color: isWork ? '#FFFFFF' : '#1A1A1A',
              lineHeight: 1.15,
            }}>
              {phase.setIdx + 1}/{sets.length}
            </span>
          </div>
        </div>

        {/* TOTAL time row with drain border */}
        <div
          ref={totalRowRef}
          style={{
            position: 'relative',
            marginTop: 12,
            width: '100%',
            background: isWork ? 'rgba(255,255,255,0.1)' : '#FFFFFF',
            borderRadius: 16,
            padding: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
            gap: 12, textAlign: 'right',
            overflow: 'visible',
            boxSizing: 'border-box',
          }}
        >
          {totalRingPerim > 0 && (
            <svg
              aria-hidden
              width={totalRowBox.w}
              height={totalRowBox.h}
              style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', overflow: 'visible' }}
            >
              <rect
                x={TOTAL_RING_INSET}
                y={TOTAL_RING_INSET}
                width={totalRingW}
                height={totalRingH}
                rx={TOTAL_RING_R}
                ry={TOTAL_RING_R}
                fill="none"
                stroke={isWork ? '#FFFFFF' : '#FF6F20'}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={totalRingPerim}
                strokeDashoffset={totalRingDashOffset}
                style={{ transition: 'stroke 0.3s ease' }}
              />
            </svg>
          )}
          <span style={{ fontSize: 22, fontWeight: 600, color: isWork ? 'rgba(255,255,255,0.8)' : '#FF6F20' }}>⏱ זמן כולל</span>
          <span style={{
            fontSize: 72, fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            fontFamily: "'Barlow Condensed', sans-serif",
            letterSpacing: '0.5px',
            lineHeight: 1.15,
            color: isWork ? '#FFFFFF' : '#FF6F20',
          }}>
            {String(totalMin).padStart(2, '0')}:{String(totalSec).padStart(2, '0')}
          </span>
        </div>
      </div>

      {/* CENTER — Ring + big digits */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0, width: '100%' }}>
        <div style={{ position: 'relative', width: 'min(82vw, 320px)', height: 'min(82vw, 320px)', margin: '0 auto', display: 'block' }}>
          <svg width="100%" height="100%" viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ display: 'block' }}>
            <circle cx={CX} cy={CY} r={R} stroke={ringTrack} strokeWidth={S} fill="none" />
            <circle cx={CX} cy={CY} r={R} stroke={ringFill} strokeWidth={S} strokeLinecap="round" fill="none"
              strokeDasharray={CIRC} strokeDashoffset={dashOffset} transform={`rotate(-90 ${CX} ${CY})`} style={{ transition: 'stroke 0.3s ease' }} />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 'min(55vw, 180px)', fontWeight: 800, fontVariantNumeric: 'tabular-nums', letterSpacing: -2, lineHeight: 1, color: textPrimary }}>{display}</span>
          </div>
        </div>
      </div>

      {/* BOTTOM — next chip + nav + controls */}
      <div style={{ width: '100%', maxWidth: 420, flexShrink: 0 }}>
        {nextP && nextP.type !== 'done' && (
          <div style={{
            textAlign: 'center', marginBottom: 8,
            fontSize: 22, fontWeight: 700,
            color: isWork ? 'rgba(255,255,255,0.85)' : 'rgba(26,26,26,0.85)',
            padding: '8px 0', letterSpacing: '1px',
          }}>
            הבא: {PHASE_LABEL[nextP.type]} · {nextP.dur} שנ׳
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button onClick={skipToNext} style={{ flex: 1, height: 48, background: secondaryBtn.bg, color: secondaryBtn.fg, border: secondaryBtn.border, borderRadius: 14, fontSize: 18, fontWeight: 800, cursor: 'pointer', touchAction: 'manipulation' }}>הבא ▶</button>
          <button onClick={skipToPrev} style={{ flex: 1, height: 48, background: secondaryBtn.bg, color: secondaryBtn.fg, border: secondaryBtn.border, borderRadius: 14, fontSize: 18, fontWeight: 800, cursor: 'pointer', touchAction: 'manipulation' }}>◀ חזור</button>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {paused
            ? <button onClick={handleResume} style={{ flex: 2, height: 56, fontSize: 22, fontWeight: 800, background: primaryBtn.bg, color: primaryBtn.fg, border: 'none', borderRadius: 12, cursor: 'pointer', touchAction: 'manipulation' }}>המשך ▶</button>
            : <button onClick={handlePause} style={{ flex: 2, height: 56, fontSize: 22, fontWeight: 800, background: primaryBtn.bg, color: primaryBtn.fg, border: 'none', borderRadius: 12, cursor: 'pointer', touchAction: 'manipulation' }}>השהה ‖</button>
          }
          <button onClick={handleStop} style={{ flex: 1, height: 56, fontSize: 18, fontWeight: 800, background: secondaryBtn.bg, color: secondaryBtn.fg, border: secondaryBtn.border, borderRadius: 12, cursor: 'pointer', touchAction: 'manipulation' }}>עצור</button>
        </div>
      </div>
    </div>
  );
}

// ─── Local styles ───
const chipMinus = {
  width: 38, height: 32, borderRadius: 8,
  background: '#FFFFFF', color: '#FF6F20',
  border: '1px solid rgba(255,111,32,0.3)',
  fontSize: 14, fontWeight: 800, cursor: 'pointer',
  touchAction: 'manipulation',
};
const chipPlus = {
  width: 38, height: 32, borderRadius: 8,
  background: '#FF6F20', color: '#FFFFFF',
  border: 'none',
  fontSize: 14, fontWeight: 800, cursor: 'pointer',
  touchAction: 'manipulation',
};
const chipValue = {
  minWidth: 56, padding: '4px 10px',
  display: 'inline-flex', alignItems: 'baseline', justifyContent: 'center', gap: 4,
  fontSize: 22, fontWeight: 800,
  color: '#FF6F20',
  fontFamily: "'Barlow Condensed', sans-serif",
  fontVariantNumeric: 'tabular-nums',
};
const chipUnit = {
  fontSize: 11, fontWeight: 600, color: '#888',
};
