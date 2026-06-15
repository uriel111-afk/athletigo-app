import { Fragment, useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
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
import { ChevronRight } from 'lucide-react';

const backBtnStyle = {
  position: 'absolute', top: 16, left: 16, zIndex: 5,
  width: 44, height: 44, borderRadius: 12,
  background: '#FFFFFF', border: '1px solid #F0E4D0',
  boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer',
};

// ─── Constants (lifted from TabataTimer so the visible behavior is identical) ───
const R = 138, S = 8, SIZE = 320, CX = SIZE / 2, CY = SIZE / 2;
const CIRC = 2 * Math.PI * R;

const PHASE_LABEL = { prep: 'הכנה', work: 'עבודה', rest: 'מנוחה', done: 'סיום' };
const LS_KEY = 'dyn3';                            // saved cfg
const RUNTIME_KEY = 'dyn_intervals_runtime_state'; // running phase + timestamps

// ─── Persistence helpers ───
// cfg shape: { prep: number, sets: [{work, rest}, ...] }
function load() {
  try {
    const r = localStorage.getItem(LS_KEY);
    if (r) {
      const parsed = JSON.parse(r);
      if (Array.isArray(parsed?.sets) && parsed.sets.length > 0) {
        return {
          prep: Number.isFinite(parsed.prep) ? Math.max(0, Math.min(60, parsed.prep)) : 10,
          sets: parsed.sets,
        };
      }
    }
  } catch {}
  return {
    prep: 10,
    sets: [{ work: 60, rest: 30 }, { work: 45, rest: 30 }, { work: 30, rest: 30 }],
  };
}

// nextPhase — walks prep → work[0] → rest[0] → work[1] → … → work[N-1] → done.
// Rest is skipped after the LAST set (goes straight to done).
function nextPhase(cur, sets) {
  if (!Array.isArray(sets) || sets.length === 0) return { type: 'done', setIdx: 0, dur: 0 };
  const { type, setIdx } = cur;
  if (type === 'prep') return { type: 'work', setIdx: 0, dur: sets[0].work };
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
function runPhaseTransition(fromType, nextP, sets, prep) {
  const toType = nextP?.type;
  const idx = nextP?.setIdx ?? 0;
  const total = sets?.length ?? 0;
  if (toType === 'work')                              playActionMelody();
  if (fromType === 'work'  && toType === 'rest')      playSlowPulse();
  if (fromType === 'work'  && toType === 'done')      playVictory();

  if (toType === 'prep') {
    showTimerNotification('⏱ AthletiGo — אינטרוולים', `הכנה · ${prep ?? 0} שניות`);
  } else if (toType === 'work') {
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
  const [prep, setPrep] = useState(initial.prep);
  const [sets, setSets] = useState(initial.sets);
  const [screen, setScreen] = useState('settings'); // settings | running | done
  const [phase, setPhase] = useState({ type: 'idle', setIdx: 0, dur: 0 });
  const [display, setDisplay] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [pickerField, setPickerField] = useState(null); // { kind: 'work'|'rest', idx } or { kind: 'prep' }

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
  const prepRef = useRef(prep);
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
    try { localStorage.setItem(LS_KEY, JSON.stringify({ prep, sets })); } catch {}
  }, [sets, prep]);
  useEffect(() => { prepRef.current = prep; }, [prep]);
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
      prep: prepRef.current,
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
    const pr = Number.isFinite(snap.prep) ? snap.prep : prep;
    setsRef.current = s;
    prepRef.current = pr;
    setSets(s);
    setPrep(pr);

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
        runPhaseTransition(originalPhaseType, done, s, pr);
      }
      releaseTimerWakeLock();
      return;
    }

    if (originalPhaseType && originalPhaseType !== p.type) {
      runPhaseTransition(originalPhaseType, p, s, pr);
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
      runPhaseTransition(p.type, nxt, setsRef.current, prepRef.current);

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
        info: p.type === 'prep' ? 'הכנה' : `סט ${p.setIdx + 1}/${setsRef.current.length}`,
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
    const first = prep > 0
      ? { type: 'prep', setIdx: 0, dur: prep }
      : { type: 'work', setIdx: 0, dur: sets[0].work };
    beginPhase(first);
    runPhaseTransition('idle', first, sets, prep);
    rafRef.current = requestAnimationFrame(tick);
  }, [sets, prep]);

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

  // ─── Compute total workout time (includes prep) ───
  const totalWorkoutTime = useMemo(() => {
    let t = Math.max(0, +prep || 0);
    sets.forEach((s, i) => {
      t += Math.max(0, +s.work || 0);
      if (i < sets.length - 1) t += Math.max(0, +s.rest || 0);
    });
    return t;
  }, [sets, prep]);
  const twMin = Math.floor(totalWorkoutTime / 60);
  const twSec = totalWorkoutTime % 60;

  const totalExerciseSeconds = totalWorkoutTime;
  useEffect(() => { totalExerciseSecondsRef.current = totalExerciseSeconds; }, [totalExerciseSeconds]);

  // Back to clock-selection screen. If a clock is currently running
  // (screen === 'running' AND not paused), capture a snapshot into the
  // mini-bar slot first so the timer keeps running visibly. Always
  // hide the overlay and navigate to /clocks.
  // Hoisted function declaration so the early-return JSX (settings /
  // done) above the running view can reference it without TDZ errors.
  function handleClockBack(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    if (screen === 'running' && !paused) {
      const snapshot = {
        type: 'dynamicIntervals',
        display: String(display),
        phase: PHASE_LABEL[phaseRef.current.type] || '',
        info: `סט ${phase.setIdx + 1}/${sets.length}`,
        paused: false,
      };
      if (setLiveTimerDynamic) setLiveTimerDynamic(snapshot);
      else if (setLiveTimer) setLiveTimer(snapshot);
      if (setIsMinimized) setIsMinimized(true);
    }
    if (setShowDynamic) setShowDynamic(false);
    Promise.resolve().then(() => {
      navigate('/clocks', { replace: true });
    });
  }

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

    // Picker open helpers — kind 'work'/'rest'/'prep'. Confirm clamps:
    //   work  → [5, 600] (must be > 0 to constitute a real set)
    //   rest  → [0, 600]
    //   prep  → [0, 60]
    const openPicker = (kind, idx, currentValue) => {
      setPickerField({ kind, idx, value: currentValue });
    };
    const closePicker = () => setPickerField(null);
    const onPickerConfirm = (newSecs) => {
      if (!pickerField) return;
      const { kind, idx } = pickerField;
      if (kind === 'prep') {
        const clamped = Math.max(0, Math.min(60, newSecs));
        setPrep(clamped);
      } else {
        const min = kind === 'work' ? 5 : 0;
        const clamped = Math.max(min, Math.min(600, newSecs));
        setSets(prev => prev.map((s, i) => i !== idx ? s : { ...s, [kind]: clamped }));
      }
      setPickerField(null);
    };

    return (
      <div style={{
        background: '#FFF9F0', height: '100%',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: 12, direction: 'rtl', overflowY: 'auto', overflowX: 'hidden',
        position: 'relative',
      }}>
        <button
          onClick={handleClockBack}
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          aria-label="חזרה"
          style={backBtnStyle}
        >
          <ChevronRight size={24} color="#1a1a1a" />
        </button>
        <div style={{ fontSize: 24, fontWeight: 900, color: '#FF6F20', marginBottom: 4 }}>⏱ אינטרוולים דינאמיים</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a', marginBottom: 12 }}>בנה רשימת סטים</div>

        {/* PREP row */}
        <div style={{
          width: '100%', maxWidth: 420,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 14px', background: '#FFFFFF', borderRadius: 14,
          border: '1px solid rgba(234,179,8,0.25)',
          boxShadow: '0 2px 6px rgba(234,179,8,0.06)',
          marginBottom: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>⏳</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a' }}>הכנה</span>
          </div>
          <button
            onClick={() => openPicker('prep', 0, prep)}
            style={timeChip}
            aria-label="ערוך זמן הכנה"
          >
            <span style={timeChipText}>{fmtTime(prep)}</span>
          </button>
        </div>

        {/* WORKOUT STRUCTURE BAR — timeline of phases in proportional widths.
            Lives between the prep row and the sets list. Re-renders on
            every cfg edit because it reads `sets` and `prep` directly. */}
        <div style={{
          width: '100%', maxWidth: 420,
          background: '#FFFFFF', borderRadius: 12,
          padding: '10px 12px', marginBottom: 8,
          border: '1px solid #F0E4D0',
          boxSizing: 'border-box',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 6,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#B08968' }}>
              מבנה האימון · {twMin}:{String(twSec).padStart(2, '0')}
            </div>
          </div>
          {/* Bar — RTL flex row, first segment (prep, then set 1 work) sits at the right edge */}
          <div style={{
            display: 'flex', gap: 2,
            height: 26, borderRadius: 7, overflow: 'hidden',
            background: '#F5F0E4',
          }}>
            {prep > 0 && (
              <div style={{ flex: Math.max(1, prep), background: '#EAB308' }} />
            )}
            {sets.map((s, i) => (
              <Fragment key={i}>
                <div style={{ flex: Math.max(1, +s.work || 0), background: '#FF6F20' }} />
                {i < sets.length - 1 && (
                  <div style={{ flex: Math.max(1, +s.rest || 0), background: '#FFD9BF' }} />
                )}
              </Fragment>
            ))}
          </div>
          {/* Legend */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            marginTop: 8, fontSize: 11, color: '#666',
          }}>
            {prep > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 9, height: 9, borderRadius: 2, background: '#EAB308' }} />
                <span>הכנה</span>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 9, height: 9, borderRadius: 2, background: '#FF6F20' }} />
              <span>עבודה</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 9, height: 9, borderRadius: 2, background: '#FFD9BF' }} />
              <span>מנוחה</span>
            </div>
          </div>
        </div>

        {/* SETS LIST — one compact row per set */}
        <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column' }}>
          {sets.map((s, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 10px',
              background: '#FFFFFF', borderRadius: 12,
              marginBottom: 8,
              border: '1px solid #F0E4D0',
            }}>
              {/* Number badge — first DOM child = rightmost in RTL */}
              <div style={{
                width: 26, height: 26, borderRadius: 8,
                background: '#FF6F20', color: '#FFFFFF',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: 16, fontWeight: 800,
                flexShrink: 0,
              }}>{i + 1}</div>

              {/* WORK cell */}
              <button
                onClick={() => openPicker('work', i, s.work)}
                aria-label="ערוך זמן עבודה"
                style={{
                  flex: 1,
                  background: '#FFF0E4',
                  borderRadius: 8,
                  border: 'none',
                  padding: '6px 8px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', touchAction: 'manipulation',
                  lineHeight: 1.1,
                }}
              >
                <span style={{ fontSize: 10, color: '#B08968', fontWeight: 600 }}>עבודה</span>
                <span style={{
                  fontSize: 17, fontWeight: 500, color: '#FF6F20',
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontVariantNumeric: 'tabular-nums',
                  marginTop: 2,
                }}>{fmtTime(s.work)}</span>
              </button>

              {/* REST cell */}
              <button
                onClick={() => openPicker('rest', i, s.rest)}
                aria-label="ערוך זמן מנוחה"
                style={{
                  flex: 1,
                  background: '#F4F8FF',
                  borderRadius: 8,
                  border: 'none',
                  padding: '6px 8px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', touchAction: 'manipulation',
                  lineHeight: 1.1,
                }}
              >
                <span style={{ fontSize: 10, color: '#185FA5', fontWeight: 600 }}>מנוחה</span>
                <span style={{
                  fontSize: 17, fontWeight: 500, color: '#378ADD',
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontVariantNumeric: 'tabular-nums',
                  marginTop: 2,
                }}>{fmtTime(s.rest)}</span>
              </button>

              {/* Delete — small icon, last DOM child = leftmost in RTL */}
              <button
                onClick={() => removeSet(i)}
                disabled={sets.length <= 1}
                aria-label="מחק סט"
                style={{
                  width: 24, height: 24,
                  background: 'transparent',
                  color: sets.length <= 1 ? '#CCC' : '#dc2626',
                  border: 'none',
                  fontSize: 16, fontWeight: 700,
                  cursor: sets.length <= 1 ? 'not-allowed' : 'pointer',
                  padding: 0,
                  flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  touchAction: 'manipulation',
                }}
              >✕</button>
            </div>
          ))}
        </div>

        <button onClick={addSet} style={{
          marginTop: 2, width: '100%', maxWidth: 420,
          padding: '12px', fontSize: 16, fontWeight: 800,
          background: '#FFFFFF', color: '#FF6F20',
          border: '2px dashed #FF6F20', borderRadius: 12,
          cursor: 'pointer',
        }}>+ הוסף סט</button>

        <button onClick={handleStart} style={{
          marginTop: 10, marginBottom: 16,
          width: '100%', maxWidth: 420,
          padding: 14, fontSize: 20, fontWeight: 900,
          background: '#FF6F20', color: '#FFFFFF',
          border: 'none', borderRadius: 14, cursor: 'pointer',
          boxShadow: '0 4px 14px rgba(255,111,32,0.3)',
        }}>▶ התחל אימון</button>

        <TimeWheelPicker
          isOpen={!!pickerField}
          value={pickerField?.value ?? 0}
          title={
            pickerField?.kind === 'prep' ? 'הכנה'
            : pickerField?.kind === 'work' ? `סט ${(pickerField?.idx ?? 0) + 1} · עבודה`
            : pickerField?.kind === 'rest' ? `סט ${(pickerField?.idx ?? 0) + 1} · מנוחה`
            : ''
          }
          maxMinutes={pickerField?.kind === 'prep' ? 1 : 10}
          onSelect={onPickerConfirm}
          onClose={closePicker}
        />
      </div>
    );
  }

  // ─── Done screen ───
  if (screen === 'done') {
    return (
      <div style={{ background: '#FF6F20', minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20, direction: 'rtl', color: '#FFF', position: 'relative' }}>
        <button
          onClick={handleClockBack}
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          aria-label="חזרה"
          style={backBtnStyle}
        >
          <ChevronRight size={24} color="#1a1a1a" />
        </button>
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
    runPhaseTransition(phaseRef.current.type, nxt, setsRef.current, prepRef.current);
    if (nxt.type === 'done') { setPhase(nxt); phaseRef.current = nxt; setDisplay(0); setProgress(1); setScreen('done'); return; }
    beginPhase(nxt);
    if (!paused) rafRef.current = requestAnimationFrame(tick);
  }

  function skipToPrev() {
    cancelScheduled();
    // Build full timeline (prep included when configured) and find current position
    const tl = [];
    let cur = prepRef.current > 0
      ? { type: 'prep', setIdx: 0, dur: prepRef.current }
      : { type: 'work', setIdx: 0, dur: setsRef.current[0]?.work || 0 };
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
  const isPrep = phase.type === 'prep';
  const cream = !isWork; // prep + rest share the cream/neutral page
  // Accent: yellow #EAB308 during prep, orange #FF6F20 otherwise.
  // Tabata uses orange for both rest and prep — here prep gets a
  // distinct yellow accent so the user can read at a glance "still
  // warming up, not yet in a rest break."
  const accent = isPrep ? '#EAB308' : '#FF6F20';
  const bg = isWork ? '#FF6F20' : '#FFF9F0';
  const textPrimary = cream ? '#1a1a1a' : '#FFFFFF';
  const ringTrack = isWork
    ? 'rgba(255,255,255,0.3)'
    : isPrep ? 'rgba(234,179,8,0.2)' : 'rgba(255,111,32,0.2)';
  const ringFill = isWork ? '#FFFFFF' : accent;
  const chipBg = cream ? (isPrep ? 'rgba(234,179,8,0.10)' : 'rgba(255,111,32,0.10)') : 'rgba(255,255,255,0.15)';
  const primaryBtn = {
    bg: isWork ? '#FFFFFF' : accent,
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
      position: 'relative',
    }}>
      <button
        onClick={handleClockBack}
        onPointerDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        aria-label="חזרה"
        style={backBtnStyle}
      >
        <ChevronRight size={24} color="#1a1a1a" />
      </button>
      {/* TOP — phase title + minimize + set counter + total row */}
      <div style={{ width: '100%', maxWidth: 460, flexShrink: 0 }}>
        <div style={{ position: 'relative', width: '100%', minHeight: 64 }}>
          <button
            type="button"
            onClick={doMinimize}
            aria-label="מזער טיימר"
            style={{
              position: 'absolute', top: 0, left: 0,
              background: isWork ? 'rgba(255,255,255,0.2)' : (isPrep ? 'rgba(234,179,8,0.12)' : 'rgba(255,111,32,0.1)'),
              color: isWork ? '#FFFFFF' : accent,
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
                color: isWork ? '#FFFFFF' : accent,
                whiteSpace: 'nowrap',
              }}>{phaseLabel}</div>
            );
          })()}
        </div>

        {/* SET counter row — hidden during prep since we aren't in a set yet */}
        {!isPrep && (
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
        )}

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
                stroke={isWork ? '#FFFFFF' : accent}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={totalRingPerim}
                strokeDashoffset={totalRingDashOffset}
                style={{ transition: 'stroke 0.3s ease' }}
              />
            </svg>
          )}
          <span style={{ fontSize: 22, fontWeight: 600, color: isWork ? 'rgba(255,255,255,0.8)' : accent }}>⏱ זמן כולל</span>
          <span style={{
            fontSize: 72, fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            fontFamily: "'Barlow Condensed', sans-serif",
            letterSpacing: '0.5px',
            lineHeight: 1.15,
            color: isWork ? '#FFFFFF' : accent,
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
// Tap-to-open time chip — replaces ±5s steppers.
const timeChip = {
  minWidth: 78,
  padding: '6px 14px',
  background: '#FFF6E6',
  color: '#FF6F20',
  border: '1.5px solid rgba(255,111,32,0.35)',
  borderRadius: 10,
  cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  touchAction: 'manipulation',
};
const timeChipText = {
  fontFamily: "'Barlow Condensed', sans-serif",
  fontSize: 22, fontWeight: 800,
  color: '#FF6F20',
  fontVariantNumeric: 'tabular-nums',
  letterSpacing: '0.5px',
  lineHeight: 1.1,
};

// Format seconds → "M:SS"
function fmtTime(totalSec) {
  const t = Math.max(0, Math.floor(totalSec || 0));
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ─── TimeWheelPicker — iOS-style two-wheel (min + sec) bottom sheet ───
// Built for Capacitor / Android WebView: native scroll with CSS
// scroll-snap, no JS-driven animation. On scroll end we round the
// scrollTop to the nearest item and fire onChange — the snap-type
// itself handles the actual visual lock.
function TimeWheelPicker({ isOpen, value, title, maxMinutes = 10, onSelect, onClose }) {
  const [mins, setMins] = useState(0);
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    const v = Math.max(0, Number(value) || 0);
    setMins(Math.floor(v / 60));
    setSecs(v % 60);
  }, [isOpen, value]);

  if (!isOpen) return null;

  const minOptions = Array.from({ length: maxMinutes + 1 }, (_, i) => i);
  const secOptions = Array.from({ length: 60 }, (_, i) => i);

  const handleConfirm = () => {
    onSelect(mins * 60 + secs);
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose && onClose(); }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        zIndex: 11000,
      }}
    >
      <div style={{
        width: '100%', maxWidth: 460,
        background: '#FFF9F0',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: '16px 20px 24px',
        paddingBottom: 'max(env(safe-area-inset-bottom), 24px)',
        boxShadow: '0 -8px 32px rgba(0,0,0,0.15)',
        direction: 'rtl',
      }}>
        {title && (
          <div style={{
            fontSize: 16, fontWeight: 800, color: '#1a1a1a',
            textAlign: 'center', marginBottom: 16,
          }}>{title}</div>
        )}
        <div style={{
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          gap: 16,
        }} dir="ltr">
          <WheelColumn options={minOptions} value={mins} onChange={setMins} label="דקות" />
          <div style={{
            fontSize: 36, fontWeight: 800,
            color: '#888',
            fontFamily: "'Barlow Condensed', sans-serif",
            paddingBottom: 22,
          }}>:</div>
          <WheelColumn options={secOptions} value={secs} onChange={setSecs} label="שניות" />
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={onClose} style={{
            flex: 1, height: 48, borderRadius: 12,
            background: '#FFFFFF', color: '#888',
            border: '1px solid #E5E5E5',
            fontSize: 16, fontWeight: 700,
            cursor: 'pointer',
          }}>ביטול</button>
          <button onClick={handleConfirm} style={{
            flex: 2, height: 48, borderRadius: 12,
            background: '#FF6F20', color: '#FFFFFF',
            border: 'none',
            fontSize: 18, fontWeight: 800,
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(255,111,32,0.3)',
          }}>אישור</button>
        </div>
      </div>
    </div>
  );
}

// Single scroll-snap wheel column. Item height 40px, 5 visible (180px),
// 2 items of padding so first/last value can center.
const WHEEL_ITEM_H = 40;
const WHEEL_VISIBLE = 5;
const WHEEL_PAD = Math.floor(WHEEL_VISIBLE / 2);

function WheelColumn({ options, value, onChange, label }) {
  const ref = useRef(null);
  const lastReportedRef = useRef(value);
  const debounceRef = useRef(null);

  // Sync external `value` → scrollTop on mount and when value changes
  // from outside (the parent reset in useEffect when opened).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const idx = options.indexOf(value);
    if (idx < 0) return;
    // setTimeout 0 so the layout is committed before we set scrollTop
    // (otherwise iOS sometimes ignores the assignment during initial render).
    const t = setTimeout(() => {
      el.scrollTop = idx * WHEEL_ITEM_H;
      lastReportedRef.current = value;
    }, 0);
    return () => clearTimeout(t);
  }, [value, options]);

  const handleScroll = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const rawIdx = el.scrollTop / WHEEL_ITEM_H;
      const idx = Math.max(0, Math.min(options.length - 1, Math.round(rawIdx)));
      const next = options[idx];
      if (next !== lastReportedRef.current) {
        lastReportedRef.current = next;
        try { if (navigator.vibrate) navigator.vibrate(5); } catch {}
        onChange(next);
      }
    }, 80);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{
        position: 'relative',
        width: 80,
        height: WHEEL_VISIBLE * WHEEL_ITEM_H,
        overflow: 'hidden',
      }}>
        {/* Center selection band */}
        <div style={{
          position: 'absolute',
          top: WHEEL_PAD * WHEEL_ITEM_H,
          left: 0, right: 0,
          height: WHEEL_ITEM_H,
          borderTop: '1.5px solid rgba(255,111,32,0.4)',
          borderBottom: '1.5px solid rgba(255,111,32,0.4)',
          pointerEvents: 'none',
          zIndex: 2,
        }} />
        {/* Fade masks top + bottom */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'linear-gradient(to bottom, #FFF9F0 0%, rgba(255,249,240,0) 25%, rgba(255,249,240,0) 75%, #FFF9F0 100%)',
          zIndex: 3,
        }} />
        <div
          ref={ref}
          onScroll={handleScroll}
          className="dyn-wheel-scroll"
          style={{
            width: '100%', height: '100%',
            overflowY: 'scroll',
            scrollSnapType: 'y mandatory',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          <style>{`.dyn-wheel-scroll::-webkit-scrollbar { display: none; }`}</style>
          <div style={{ height: WHEEL_PAD * WHEEL_ITEM_H }} />
          {options.map((opt) => {
            const active = opt === value;
            return (
              <div key={opt} style={{
                height: WHEEL_ITEM_H,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                scrollSnapAlign: 'center',
                fontFamily: "'Barlow Condensed', sans-serif",
                fontVariantNumeric: 'tabular-nums',
                fontSize: active ? 28 : 20,
                fontWeight: active ? 800 : 500,
                color: active ? '#FF6F20' : '#888',
                transition: 'font-size 0.12s ease, color 0.12s ease',
              }}>
                {String(opt).padStart(2, '0')}
              </div>
            );
          })}
          <div style={{ height: WHEEL_PAD * WHEEL_ITEM_H }} />
        </div>
      </div>
      {label && (
        <div style={{
          marginTop: 6, fontSize: 12, fontWeight: 600, color: '#888',
        }}>{label}</div>
      )}
    </div>
  );
}
