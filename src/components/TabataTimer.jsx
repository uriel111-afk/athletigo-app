import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  unlock as unlockAudio, now, playBeep, playClick, playWhistle, playBell,
  playLongBeep, playDoubleBell, playVictory, playGong,
  playSoftBreath, playPauseSound, playActionMelody, playSlowPulse, cancelScheduled,
  vibrate, VIBRATION,
  requestNotifPermission, showTimerNotification, closeTimerNotification,
  acquireTimerWakeLock, releaseTimerWakeLock,
} from '@/lib/tabataSounds';
import ScrollPickerPopup, { SECONDS_OPTIONS, ROUNDS_OPTIONS, PREP_OPTIONS } from '@/components/ScrollPickerPopup';
import RoundJumpPicker from '@/components/RoundJumpPicker';
import { useActiveTimer } from '@/contexts/ActiveTimerContext';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

// ─── Constants ───
const O = '#FF6F20';
const W = '#FFFFFF';
const WD = 'rgba(255,255,255,0.2)';
const R = 155, S = 8, SIZE = 360, CX = SIZE / 2, CY = SIZE / 2;
const CIRC = 2 * Math.PI * R;

const PHASE_LABEL = { prep: 'הכנה', work: 'עבודה', rest: 'מנוחה', set_rest: 'מנוחה בין סטים', done: 'סיום' };
const LS_KEY = 'tb3';                      // config (workSec, restSec, etc.)
const RUNTIME_KEY = 'tabata_runtime_state'; // running phase + timestamps

function load() {
  try { const r = localStorage.getItem(LS_KEY); if (r) return JSON.parse(r); } catch {}
  return { prep: 10, work: 20, rest: 10, rb: 60, rounds: 8, sets: 1 };
}

function nextPhase(cur, cfg) {
  const { type, round, set } = cur;
  if (type === 'prep') return { type: 'work', round: 1, set: 1, dur: cfg.work };
  if (type === 'work') {
    if (round >= cfg.rounds) {
      if (set >= cfg.sets) return { type: 'done', round, set, dur: 0 };
      return { type: 'set_rest', round, set, dur: cfg.rb };
    }
    return { type: 'rest', round, set, dur: cfg.rest };
  }
  if (type === 'rest') return { type: 'work', round: round + 1, set, dur: cfg.work };
  if (type === 'set_rest') return { type: 'work', round: 1, set: set + 1, dur: cfg.work };
  return { type: 'done', round, set, dur: 0 };
}

// Handles sound + haptics + system notification for every Tabata phase
// transition. Centralized so skip/tick/hydrate all produce the same
// audible + tactile + visible feedback even when the tab is backgrounded.
function runPhaseTransition(fromType, nextPhase, cfg) {
  const toType = nextPhase?.type;
  const round = nextPhase?.round ?? 0;
  const rounds = cfg?.rounds ?? 0;

  // Sound — every transition INTO a work phase plays the same
  // playActionMelody so round 1 (prep->work, idle->work) and every
  // subsequent round (rest->work, set_rest->work) sound identical.
  if (toType === 'work')                                playActionMelody();
  if (fromType === 'work'     && toType === 'rest')     playSlowPulse();
  if (fromType === 'work'     && toType === 'set_rest') playLongBeep();
  if (fromType === 'work'     && toType === 'done')     playVictory();

  // Haptic + system notification (phone status bar)
  if (toType === 'work') {
    vibrate(VIBRATION.workStart);
    showTimerNotification('🔥 AthletiGo — עבודה!', `סבב ${round}/${rounds} · ${cfg?.work ?? 0} שניות`);
  } else if (toType === 'rest') {
    vibrate(VIBRATION.restStart);
    showTimerNotification('💤 AthletiGo — מנוחה', `סבב ${round}/${rounds} · ${cfg?.rest ?? 0} שניות`);
  } else if (toType === 'set_rest') {
    vibrate(VIBRATION.restStart);
    showTimerNotification('💤 AthletiGo — מנוחה בין סטים', `${cfg?.rb ?? 0} שניות`);
  } else if (toType === 'done') {
    vibrate(VIBRATION.finish);
    showTimerNotification('🏆 AthletiGo — סיום!', `${rounds} סבבים הושלמו! כל הכבוד 💪`);
  }
}

// ─── Component ───
export default function TabataTimer({ onMinimize, setLiveTimer }) {
  const [cfg, setCfg] = useState(load);
  const [screen, setScreen] = useState('settings'); // settings | running | done
  const [phase, setPhase] = useState({ type: 'idle', round: 0, set: 0, dur: 0 });
  const [display, setDisplay] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [pickingField, setPickingField] = useState(null);
  const [roundPickerOpen, setRoundPickerOpen] = useState(false);

  // Defensive context access — guarantees minimize works even if a parent
  // forgets to pass onMinimize / setLiveTimer.
  const navigate = useNavigate();
  const { setLiveTimerTabata, setShowTabata, setIsMinimized } = useActiveTimer();
  // Role-aware destination — coach to /dashboard, trainee to /trainee-home
  let _user = null;
  try { _user = useAuth()?.user; } catch {}
  const _isCoach = _user?.role === 'coach' || _user?.is_coach === true || _user?.role === 'admin';
  const minimizeTarget = _isCoach ? '/dashboard' : '/trainee-home';

  // Jump to any round/phase. Resets startAtRef so the running loop
  // (which uses performance.now() - startAtRef) recomputes correctly.
  const jumpToPhase = (round, phaseType) => {
    const c = cfgRef.current;
    let next;
    if (phaseType === 'prepare') {
      next = { type: 'prep', round: 1, set: phase.set || 1, dur: c.prep };
    } else {
      const dur = phaseType === 'work' ? c.work : c.rest;
      next = { type: phaseType, round, set: phase.set || 1, dur };
    }
    phaseRef.current = next;
    setPhase(next);
    setDisplay(next.dur);
    setProgress(0);
    startAtRef.current = performance.now();
    elapsedRef.current = 0;
  };

  // Round-counter tap from the minimized footer bar dispatches an event;
  // we listen here and open the same picker.
  useEffect(() => {
    const onOpen = () => setRoundPickerOpen(true);
    window.addEventListener('tabata-open-round-picker', onOpen);
    return () => window.removeEventListener('tabata-open-round-picker', onOpen);
  }, []);

  const phaseRef = useRef(phase);
  const cfgRef = useRef(cfg);
  const screenRef = useRef(screen);
  const rafRef = useRef(null);
  const startAtRef = useRef(0);
  const elapsedRef = useRef(0);
  const lastBeepRef = useRef(-1);
  // Mirror of `paused` state — used by tick() and the window listener so
  // they read fresh state without depending on render-time closures.
  const pausedRef = useRef(false);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { cfgRef.current = cfg; localStorage.setItem(LS_KEY, JSON.stringify(cfg)); }, [cfg]);
  useEffect(() => { screenRef.current = screen; }, [screen]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  // Cleanup on unmount
  useEffect(() => () => { cancelAnimationFrame(rafRef.current); cancelScheduled(); }, []);

  // ── Runtime persistence (mirrors ClockContext pattern) ───────────
  // Save on every meaningful transition (screen, phase, paused).
  // perfStart is captured as performance.now() but the real anchor for
  // wall-clock recovery is `phaseElapsed` + `savedAt` (Date.now()).
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
      cfg: cfgRef.current,
      paused,
      phaseElapsed,        // seconds elapsed in current phase at save time
      savedAt: Date.now(), // wall clock — survives refresh; performance.now does not
    };
    try { localStorage.setItem(RUNTIME_KEY, JSON.stringify(snapshot)); } catch {}
  }, [screen, phase, paused]);

  // Hydrate once on mount — if a tabata was running when the tab was
  // closed/refreshed, reconstruct it. If it would have completed during
  // the offline period, jump straight to the done screen.
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

    const c = snap.cfg || cfg;
    cfgRef.current = c;
    setCfg(c);

    if (snap.screen === 'done') {
      const idle = { type: 'done', round: snap.phase?.round || 0, set: snap.phase?.set || 0, dur: 0 };
      phaseRef.current = idle;
      setPhase(idle);
      setScreen('done');
      return;
    }

    // Walk forward from the saved phase by (phaseElapsed + offline wall time).
    const originalPhaseType = snap.phase?.type;
    let p = snap.phase || { type: 'prep', round: 0, set: 0, dur: c.prep };
    const offline = (Date.now() - (snap.savedAt || Date.now())) / 1000;
    let totalElapsed = (snap.phaseElapsed || 0) + (snap.paused ? 0 : offline);

    while (p && p.type !== 'done' && totalElapsed >= p.dur) {
      totalElapsed -= p.dur;
      p = nextPhase(p, c);
    }

    if (!p || p.type === 'done') {
      const done = { type: 'done', round: c.rounds, set: c.sets, dur: 0 };
      phaseRef.current = done;
      setPhase(done);
      setDisplay(0);
      setProgress(1);
      setScreen('done');
      // A phase transition happened while we were hidden — fire the
      // finish cue so the user sees/feels it the moment they re-open.
      if (originalPhaseType && originalPhaseType !== 'done') {
        runPhaseTransition(originalPhaseType, done, c);
      }
      releaseTimerWakeLock();
      return;
    }

    // Detect a background phase change: fire the haptic + notification
    // for the new phase so the user isn't left wondering why a silent
    // app woke up into a different phase.
    if (originalPhaseType && originalPhaseType !== p.type) {
      runPhaseTransition(originalPhaseType, p, c);
    }
    // Keep the wake lock alive for the resumed running state.
    acquireTimerWakeLock();

    // Resume in this phase. Re-anchor performance.now() so the rAF tick
    // computes (performance.now() - startAtRef) === totalElapsed * 1000.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // Defensive early-exit: if paused was flipped after this frame was
    // scheduled but before it ran, abort without re-scheduling. This
    // belt-and-suspenders the existing cancelAnimationFrame in
    // handlePause and prevents a stray frame from overwriting paused
    // back to false on the live timer.
    if (pausedRef.current) { rafRef.current = null; return; }

    const p = phaseRef.current;
    if (p.type === 'idle' || p.type === 'done') return;

    const elapsed = (performance.now() - startAtRef.current) / 1000;
    const remaining = Math.max(0, p.dur - elapsed);
    const secs = Math.ceil(remaining);

    // Countdown beeps at 3, 2, 1
    if (secs <= 3 && secs >= 1 && secs !== lastBeepRef.current) {
      lastBeepRef.current = secs;
      playBeep();
      vibrate(VIBRATION.tick);
    }

    if (remaining <= 0) {
      // Transition
      const nxt = nextPhase(p, cfgRef.current);
      runPhaseTransition(p.type, nxt, cfgRef.current);

      if (nxt.type === 'done') {
        setPhase(nxt);
        phaseRef.current = nxt;
        setDisplay(0);
        setProgress(1);
        setScreen('done');
        // Finish notification was shown by runPhaseTransition; release
        // the wake lock so the screen can dim normally on the "done" screen.
        releaseTimerWakeLock();
        return;
      }

      beginPhase(nxt);
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    setDisplay(secs);
    setProgress(elapsed / p.dur);

    // Update floating timer — always keep it alive while running.
    // Read paused from the ref so the bar's icon doesn't flicker
    // back to ⏸ from a final in-flight tick after the user paused.
    if (setLiveTimer && screenRef.current === 'running') {
      setLiveTimer({
        type: 'tabata',
        display: String(secs),
        phase: PHASE_LABEL[p.type] || '',
        info: `סבב ${p.round}/${cfgRef.current.rounds} · סט ${p.set}/${cfgRef.current.sets}`,
        paused: pausedRef.current,
      });
    }

    rafRef.current = requestAnimationFrame(tick);
  }

  // ─── Handlers ───
  const handleStart = useCallback(async () => {
    await unlockAudio();
    // Ask once for system-notification permission so phase changes can
    // surface in the phone status bar while the app is backgrounded.
    try { requestNotifPermission(); } catch {}
    // Keep the screen awake for as long as Tabata is running.
    acquireTimerWakeLock();
    // נשימה רכה — soft breath on play tap. Same sound used by Countdown.
    playSoftBreath();
    // Sync ref before scheduling the first frame so tick's early-exit
    // doesn't trigger from a leftover paused=true value.
    pausedRef.current = false;
    setPaused(false);
    setScreen('running');
    const first = cfg.prep > 0
      ? { type: 'prep', round: 0, set: 0, dur: cfg.prep }
      : { type: 'work', round: 1, set: 1, dur: cfg.work };
    beginPhase(first);
    // When prep is skipped (cfg.prep === 0), the first phase IS the
    // first work phase. Run the same transition helper that fires on
    // every other work-start so round 1 sounds identical to rounds 2+
    // (playActionMelody + workStart vibration + system notification).
    if (first.type === 'work') {
      runPhaseTransition('idle', first, cfg);
    } else {
      showTimerNotification('⏱ AthletiGo — טבטה', 'הכנה…');
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [cfg]);

  function handlePause() {
    // Already paused — guard against double-tap or duplicate events.
    if (pausedRef.current) return;
    // Sync ref FIRST so any in-flight tick that fires before React
    // commits will see paused=true and bail out via the early-exit.
    pausedRef.current = true;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    cancelScheduled();
    elapsedRef.current = (performance.now() - startAtRef.current) / 1000;
    setPaused(true);
    // Subtle descending cue — audibly distinct from the rising resume.
    playPauseSound();
    vibrate(VIBRATION.pause);
    // Update BOTH slots so the minimized bar (reads liveTimerTabata)
    // and any legacy consumer (reads liveTimer) stay in sync.
    if (setLiveTimerTabata) setLiveTimerTabata(prev => prev ? { ...prev, paused: true } : prev);
    if (setLiveTimer) setLiveTimer(prev => prev ? { ...prev, paused: true } : null);
  }

  function handleResume() {
    // Already running — guard against double-tap or duplicate events.
    if (!pausedRef.current) return;
    // Cancel any stray rAF that might still be queued, so we never
    // run two ticks in parallel after resume.
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    pausedRef.current = false;
    startAtRef.current = performance.now() - elapsedRef.current * 1000;
    lastBeepRef.current = -1;
    setPaused(false);
    playSoftBreath();
    vibrate(VIBRATION.resume);
    if (setLiveTimerTabata) setLiveTimerTabata(prev => prev ? { ...prev, paused: false } : prev);
    if (setLiveTimer) setLiveTimer(prev => prev ? { ...prev, paused: false } : null);
    rafRef.current = requestAnimationFrame(tick);
  }

  function handleStop() {
    cancelAnimationFrame(rafRef.current);
    cancelScheduled();
    const idle = { type: 'idle', round: 0, set: 0, dur: 0 };
    setPhase(idle);
    phaseRef.current = idle;
    setDisplay(0);
    setProgress(0);
    setPaused(false);
    elapsedRef.current = 0;
    setScreen('settings');
    if (setLiveTimer) setLiveTimer(null);
    if (setLiveTimerTabata) setLiveTimerTabata(null);
    closeTimerNotification();
    releaseTimerWakeLock();
    try { localStorage.removeItem(RUNTIME_KEY); } catch {}
  }

  // Back button → minimize
  useEffect(() => {
    if (screen !== 'running') return;
    const onPop = (e) => {
      e.preventDefault();
      if (onMinimize && setLiveTimer) {
        setLiveTimer({
          type: 'tabata',
          display: String(display),
          phase: PHASE_LABEL[phaseRef.current.type] || '',
          paused,
        });
        onMinimize();
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [screen, display, paused, onMinimize, setLiveTimer]);

  // Event listeners for floating timer controls. Read paused state
  // from pausedRef (not the closure-captured state) so the listener
  // never branches incorrectly when the user taps twice in rapid
  // succession before React commits the previous toggle.
  useEffect(() => {
    const onReset = () => handleStop();
    const onPauseResume = () => { if (pausedRef.current) handleResume(); else handlePause(); };
    const onPrevRound = () => skipToPrev();
    const onNextRound = () => skipToNext();
    window.addEventListener('tabata-reset', onReset);
    window.addEventListener('tabata-pause-resume', onPauseResume);
    window.addEventListener('tabata-prev-round', onPrevRound);
    window.addEventListener('tabata-next-round', onNextRound);
    return () => {
      window.removeEventListener('tabata-reset', onReset);
      window.removeEventListener('tabata-pause-resume', onPauseResume);
      window.removeEventListener('tabata-prev-round', onPrevRound);
      window.removeEventListener('tabata-next-round', onNextRound);
    };
  }, []);

  // ─── Compute total workout time from config ───
  function calcTotalFromConfig(c) {
    return (c.prep + (c.work + c.rest) * c.rounds) * c.sets + c.rb * Math.max(0, c.sets - 1) - c.rest * c.sets;
  }
  const totalWorkoutTime = calcTotalFromConfig(cfg);
  const twMin = Math.floor(totalWorkoutTime / 60);
  const twSec = totalWorkoutTime % 60;

  // Total exercise length — sum of every phase EXCEPT prep, since
  // the drain ring on the total-time chip represents the active
  // workout only. Walking starts from work(1,1); prep doesn't count
  // toward the bar's progress (the bar stays full during prep, then
  // starts draining the moment the first work phase begins).
  // Hoisted ABOVE the early returns at "settings" / "done" so the hook
  // call order stays stable (React #310 — hooks must run every render).
  const totalExerciseSeconds = useMemo(() => {
    const c = cfgRef.current;
    let total = c.work || 0;
    let cur = { type: 'work', round: 1, set: 1, dur: c.work || 0 };
    // Defensive cap so a misconfigured cfg can't infinite-loop.
    for (let i = 0; i < 1000; i++) {
      const nxt = nextPhase(cur, c);
      if (!nxt || nxt.type === 'done') break;
      total += nxt.dur || 0;
      cur = nxt;
    }
    return total;
    // Deps reference the actual cfg fields (cfg.rb, NOT cfg.set_rest —
    // that field doesn't exist; nextPhase reads cfg.rb for set rests).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.work, cfg.rest, cfg.rb, cfg.rounds, cfg.sets]);

  // ─── Settings Screen ───
  if (screen === 'settings') {
    const fields = [
      { k: 'prep',   l: 'הכנה',            icon: '⏳', u: 'שנ׳', mn: 0,  mx: 300, options: SECONDS_OPTIONS },
      { k: 'work',   l: 'עבודה',           icon: '🔥', u: 'שנ׳', mn: 1,  mx: 600, options: SECONDS_OPTIONS },
      { k: 'rest',   l: 'מנוחה',           icon: '💤', u: 'שנ׳', mn: 0,  mx: 600, options: SECONDS_OPTIONS },
      { k: 'rounds', l: 'סבבים',            icon: '🔄', u: '',    mn: 1,  mx: 30,  options: ROUNDS_OPTIONS },
      { k: 'sets',   l: 'סטים',              icon: '📦', u: '',    mn: 1,  mx: 10,  options: [1, 2, 3, 4, 5, 6, 8, 10] },
      { k: 'rb',     l: 'מנוחה בין סטים',   icon: '⏸', u: 'שנ׳', mn: 0,  mx: 900, options: SECONDS_OPTIONS },
    ];
    return (
      <div style={{ background: '#FFF9F0', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 12, direction: 'rtl', overflow: 'hidden' }}>
        <div style={{ fontSize: 24, fontWeight: 900, color: '#FF6F20', marginBottom: 4 }}>⏱ טבטה</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a1a', marginBottom: 10 }}>הגדר את האימון שלך</div>

        <div style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {fields.map(f => (
            <div key={f.k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 10, background: '#FFFFFF', borderRadius: 12, marginBottom: 0, border: '1px solid rgba(255,111,32,0.12)', boxShadow: '0 2px 6px rgba(255,111,32,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>{f.icon}</span>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a' }}>{f.l}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button type="button" onClick={() => setCfg(c => ({ ...c, [f.k]: Math.max(f.mn, c[f.k] - 1) }))} style={cBtnMinus}>−</button>
                <button
                  type="button"
                  onClick={() => setPickingField(f.k)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    minWidth: 46, padding: '4px 6px', cursor: 'pointer',
                    background: 'transparent', border: 'none',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <span style={{
                    pointerEvents: 'none',
                    fontSize: 32, fontWeight: 700,
                    color: '#FF6F20',
                    fontFamily: "'Barlow Condensed', sans-serif",
                    lineHeight: 1, textAlign: 'center',
                  }}>{cfg[f.k]}</span>
                  {f.u && (
                    <span style={{ pointerEvents: 'none', fontSize: 11, fontWeight: 600, color: '#888', marginTop: 1 }}>
                      {f.u}
                    </span>
                  )}
                </button>
                <button type="button" onClick={() => setCfg(c => ({ ...c, [f.k]: Math.min(f.mx, c[f.k] + 1) }))} style={cBtnPlus}>+</button>
              </div>
            </div>
          ))}
        </div>
        <ScrollPickerPopup
          isOpen={!!pickingField}
          value={cfg[pickingField]}
          options={fields.find(f => f.k === pickingField)?.options || SECONDS_OPTIONS}
          onSelect={(v) => {
            const f = fields.find(x => x.k === pickingField);
            if (!f) return;
            setCfg(c => ({ ...c, [f.k]: Math.max(f.mn, Math.min(f.mx, v)) }));
          }}
          onClose={() => setPickingField(null)}
          title={fields.find(f => f.k === pickingField)?.l}
        />

        {/* Total time only — replaces multi-stat row */}
        <div style={{
          textAlign: 'center', padding: 12,
          background: 'white', borderRadius: 14,
          marginTop: 8, marginBottom: 0,
          width: '100%', maxWidth: 360,
          border: '0.5px solid #F0E4D0',
        }}>
          <div style={{ fontSize: 12, color: '#888', fontWeight: 500, marginBottom: 4 }}>זמן כולל</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#FF6F20', fontFamily: "'Barlow Condensed', sans-serif" }}>
            {twMin}:{String(twSec).padStart(2,'0')}
          </div>
        </div>

        <button onClick={handleStart} style={{ marginTop: 10, width: '100%', maxWidth: 360, padding: 14, fontSize: 20, fontWeight: 900, background: '#FF6F20', color: '#FFFFFF', border: 'none', borderRadius: 14, cursor: 'pointer', boxShadow: '0 4px 14px rgba(255,111,32,0.3)' }}>
          ▶ התחל אימון
        </button>
      </div>
    );
  }

  // ─── Done Screen ───
  if (screen === 'done') {
    return (
      <div style={{ background: O, minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20, direction: 'rtl', color: W }}>
        <div style={{ fontSize: 72, marginBottom: 12 }}>🎉</div>
        <div style={{ fontSize: 48, fontWeight: 900, marginBottom: 8 }}>סיימת!</div>
        <div style={{ fontSize: 24, opacity: 0.8 }}>{cfg.rounds} סבבים × {cfg.sets} סטים</div>
        <button onClick={handleStop} style={{ marginTop: 32, padding: '14px 48px', fontSize: 20, fontWeight: 900, background: W, color: O, border: 'none', borderRadius: 12, cursor: 'pointer' }}>
          אימון חדש
        </button>
      </div>
    );
  }

  // ─── Compute total remaining time ───
  // Returns the seconds left until the workout proper finishes.
  // While in prep, returns the full totalExerciseSeconds so the
  // drain ring stays at 100% — the bar represents the active
  // workout, not the warm-up. The moment prep ends and the first
  // work phase starts, this drops to totalExerciseSeconds and
  // begins counting down monotonically through every set.
  function calcTotalRemaining() {
    const c = cfgRef.current;
    const p = phaseRef.current;
    if (p.type === 'idle' || p.type === 'done') return 0;
    if (p.type === 'prep') return totalExerciseSeconds;

    // Current phase remaining
    const elapsed = (performance.now() - startAtRef.current) / 1000;
    let total = Math.max(0, p.dur - elapsed);

    // Remaining phases (always non-prep at this point)
    let cur = { ...p };
    while (true) {
      const nxt = nextPhase(cur, c);
      if (nxt.type === 'done') break;
      total += nxt.dur;
      cur = nxt;
    }
    return Math.ceil(total);
  }

  const totalLeft = calcTotalRemaining();
  const totalMin = Math.floor(totalLeft / 60);
  const totalSec = totalLeft % 60;

  // borderProgress: 1 = full, 0 = empty. Survives the "done" phase
  // (totalLeft becomes 0 — that's fine, ring just empties).
  // totalExerciseSeconds is computed above (hoisted past the early
  // returns so hook order stays stable).
  const totalBorderProgress = totalExerciseSeconds > 0
    ? Math.max(0, Math.min(1, totalLeft / totalExerciseSeconds))
    : 0;

  // Minimize handler — single source of truth (mirrors Clocks.jsx
  // minimizeTimer pattern that already works for Countdown/Stopwatch):
  //   1. Save snapshot to liveTimerTabata so the bar can render it
  //   2. Hide the full-screen overlay (showTabata=false)
  //   3. Flip isMinimized so the footer bar appears
  //   4. Delegate navigation to the parent (App.jsx GlobalTabata),
  //      which knows the role-appropriate destination.
  // The parent's handleMinimize is now navigation-only — no duplicate
  // state updates, no popstate races.
  function doMinimize() {
    const snapshot = {
      type: 'tabata',
      display: String(display),
      phase: PHASE_LABEL[phaseRef.current.type] || '',
      info: `סבב ${phase.round}/${cfg.rounds} · סט ${phase.set}/${cfg.sets}`,
      paused,
    };
    if (setLiveTimerTabata) setLiveTimerTabata(snapshot);
    else if (setLiveTimer) setLiveTimer(snapshot);

    if (setShowTabata) setShowTabata(false);
    if (setIsMinimized) setIsMinimized(true);

    // Defer navigation by one microtask so React commits the state
    // setters above before the route change triggers /clocks unmount.
    // We bypass the legacy onMinimize prop and navigate directly with
    // { replace: true } to avoid pushing a duplicate history entry —
    // otherwise pressing the phone back-button from /dashboard would
    // pop back to /clocks (which Clocks.jsx popstate handler then
    // interprets as a "minimize again" gesture and stops the timer).
    Promise.resolve().then(() => {
      navigate(minimizeTarget, { replace: true });
    });
  }

  // Navigation: skip to next/prev phase
  function skipToNext() {
    cancelScheduled();
    const nxt = nextPhase(phaseRef.current, cfgRef.current);
    runPhaseTransition(phaseRef.current.type, nxt, cfgRef.current);
    if (nxt.type === 'done') { setPhase(nxt); phaseRef.current = nxt; setDisplay(0); setProgress(1); setScreen('done'); return; }
    beginPhase(nxt);
    if (!paused) rafRef.current = requestAnimationFrame(tick);
  }

  function skipToPrev() {
    cancelScheduled();
    // Build full timeline and find current position
    const tl = [];
    let cur = cfgRef.current.prep > 0
      ? { type: 'prep', round: 0, set: 0, dur: cfgRef.current.prep }
      : { type: 'work', round: 1, set: 1, dur: cfgRef.current.work };
    while (cur.type !== 'done') {
      tl.push(cur);
      cur = nextPhase(cur, cfgRef.current);
    }
    const p = phaseRef.current;
    const idx = tl.findIndex(t => t.type === p.type && t.round === p.round && t.set === p.set);
    if (idx > 0) {
      // Go to previous phase
      beginPhase(tl[idx - 1]);
    } else {
      // Already at first phase — restart it
      beginPhase({ ...phaseRef.current });
    }
    if (!paused) rafRef.current = requestAnimationFrame(tick);
  }

  // Build phase timeline for scrollable overview
  function buildTimeline() {
    const phases = [];
    let cur = cfg.prep > 0
      ? { type: 'prep', round: 0, set: 0, dur: cfg.prep }
      : { type: 'work', round: 1, set: 1, dur: cfg.work };
    let idx = 0;
    while (cur.type !== 'done') {
      phases.push({ ...cur, idx: idx++ });
      cur = nextPhase(cur, cfg);
    }
    return phases;
  }
  const timeline = buildTimeline();

  // Current phase index in timeline
  const currentIdx = timeline.findIndex(t =>
    t.type === phase.type && t.round === phase.round && t.set === phase.set
  );

  const nextP = phase.type !== 'done' && phase.type !== 'idle' ? nextPhase(phase, cfg) : null;

  // ─── Active Timer — FULL SCREEN, phase-driven theme ───
  const dashOffset = progress * CIRC;

  // Phase theming — only Work uses orange. Rest AND Prepare both use the
  // calm cream theme so the bg stays soft when the workout isn't active.
  const isWork = phase.type === 'work';
  const cream  = !isWork; // rest | set_rest | prep | idle
  const bg          = isWork ? '#FF6F20' : '#FFF9F0';
  const textPrimary = cream  ? '#1a1a1a' : '#FFFFFF';
  const textSoft    = cream  ? '#888'    : 'rgba(255,255,255,0.8)';
  const accent      = cream  ? '#FF6F20' : '#FFFFFF';
  // Inner ring (around the central digits) — stroke is the *opposite*
  // of the background so it always pops:
  //   work   (orange bg) → white stroke + white-30% track
  //   rest/prep (cream)  → orange stroke + orange-20% track
  // Same rule applies to the total-time chip ring below — the two
  // rings stay color-locked together so they read as one system.
  const ringTrack = isWork ? 'rgba(255,255,255,0.3)' : 'rgba(255,111,32,0.2)';
  const ringFill  = isWork ? '#FFFFFF' : '#FF6F20';
  const chipBg      = cream  ? 'rgba(255,111,32,0.10)' : 'rgba(255,255,255,0.15)';
  const chipDarkBg  = cream  ? 'rgba(0,0,0,0.05)'      : 'rgba(0,0,0,0.2)';
  // Primary action button (pause/resume) — invert per phase
  const primaryBtn = {
    bg: isWork ? '#FFFFFF' : '#FF6F20',
    fg: isWork ? '#FF6F20' : '#FFFFFF',
  };
  // Secondary buttons (◀ חזור / הבא ▶ / עצור) in the bottom bar.
  // During work the cream-tinted chip bg works (it's white-ish on
  // orange page bg). During prep / rest / set_rest the page bg is
  // cream so the orange-tint chip read as a muddy "double orange"
  // overlay — switch to a clean white card with a #F0E4D0 border so
  // each button sits as one solid surface, no color stacking.
  const secondaryBtn = isWork
    ? { bg: chipBg, fg: textPrimary, border: 'none' }
    : { bg: '#FFFFFF', fg: '#1A1A1A', border: '1px solid #F0E4D0' };

  return (
    <div style={{ background: bg, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', paddingBottom: 'max(env(safe-area-inset-bottom), 10px)', direction: 'rtl', color: textPrimary, overflow: 'hidden', transition: 'background 0.3s ease, color 0.3s ease' }}>

      {/* ROW 1: Centered full-width phase title with minimize as small floating button */}
      {/* Minimize button is rendered for EVERY phase (prep, work, rest, set_rest).
          IDENTICAL handler shape to Countdown/Stopwatch in Clocks.jsx — bare
          onClick, no onPointerDown. (onPointerDown stopPropagation was
          intercepting the click event on touch devices.) */}
      <div style={{ width: '100%', position: 'relative', flexShrink: 0 }}>
        <button
          type="button"
          onClick={doMinimize}
          style={{
            position: 'absolute', top: 8, left: 0,
            background: isWork ? 'rgba(255,255,255,0.95)' : '#FF6F20',
            color: isWork ? '#FF6F20' : '#FFFFFF',
            border: 'none', borderRadius: 12,
            padding: '8px 14px',
            fontSize: 14, fontWeight: 800,
            cursor: 'pointer', touchAction: 'manipulation',
            zIndex: 5,
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            minHeight: 36, minWidth: 76,
          }}
          aria-label="מזער טיימר"
        >
          מזער ↗
        </button>
        {(() => {
          const phaseLabel =
            phase.type === 'work'     ? 'עבודה' :
            phase.type === 'rest'     ? 'מנוחה' :
            phase.type === 'set_rest' ? 'מנוחה בין סטים' :
            phase.type === 'prep'     ? 'הכנה' : '';
          // "מנוחה בין סטים" (13 chars) shrinks so it never wraps; the
          // short labels stay big and bold.
          const big = phaseLabel.length <= 6;
          return (
            <div style={{
              textAlign: 'right', width: '100%',
              // Long titles get top padding so they sit BELOW the
              // floating מזער button (top: 8, h: 36 → ~48px clear).
              padding: big ? '8px 16px 2px' : '48px 16px 2px',
              direction: 'rtl',
              fontSize: big ? 72 : 36,
              fontWeight: 900,
              color: isWork ? '#FFFFFF' : '#FF6F20',
              letterSpacing: big ? '8px' : '2px',
              textTransform: 'uppercase',
              textShadow: '0 4px 16px rgba(0,0,0,0.25), 0 2px 4px rgba(0,0,0,0.15)',
              WebkitTextStroke: isWork ? '1px rgba(255,255,255,0.3)' : '1px rgba(255,111,32,0.3)',
              whiteSpace: 'nowrap',
            }}>
              {phaseLabel}
            </div>
          );
        })()}
      </div>

      {/* ROW 2: Stats — total time anchored to the RIGHT edge of the
          row, then set + round filling the rest. In an RTL flex row
          (direction:rtl + flex-direction:row), the FIRST DOM child
          sits at the main-start which is the RIGHT edge, and
          subsequent children flow leftward. So Total chip first =
          rightmost. */}
      <div style={{ display: 'flex', gap: 8, padding: '0 16px', width: '100%', maxWidth: 420, flexShrink: 0, marginBottom: 12 }}>
        <div style={{
          // flex: 2.3 makes the total-time chip ~53% of the row
          // (vs ~43% with flex:1.5) — a ~25% relative width bump
          // toward the right edge so the drain ring around it has
          // more room to breathe and reads as the dominant element.
          flex: 2.3, position: 'relative',
          background: chipDarkBg, borderRadius: 12,
          padding: '10px 12px', textAlign: 'center', color: textPrimary,
          overflow: 'visible',
        }}>
          {/* Total-exercise drain ring — SVG overlay sized to the
              chip via 100% percentages. pathLength=100 normalizes
              the perimeter so dashoffset reads as "% drained":
              0 = full, 100 = empty. Stroke + track flip per phase
              so the drain is visible against either background:
                work (orange bg) → white stroke + white-30% track
                rest/prep (cream bg) → orange stroke + orange-20% track
              overflow:visible on the SVG + the parent lets the
              half-stroke peek out as a real border around the chip. */}
          <svg
            aria-hidden
            style={{
              position: 'absolute', inset: 0,
              width: '100%', height: '100%',
              overflow: 'visible', pointerEvents: 'none',
            }}
          >
            <rect x="0" y="0" width="100%" height="100%" rx="12" ry="12"
              fill="none"
              stroke={isWork ? 'rgba(255,255,255,0.3)' : 'rgba(255,111,32,0.2)'}
              strokeWidth="2"
              style={{ transition: 'stroke 0.3s ease' }}
            />
            <rect x="0" y="0" width="100%" height="100%" rx="12" ry="12"
              fill="none"
              stroke={isWork ? '#FFFFFF' : '#FF6F20'}
              strokeWidth="3" strokeLinecap="round"
              pathLength="100" strokeDasharray="100"
              strokeDashoffset={100 * (1 - totalBorderProgress)}
              style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s ease' }}
            />
          </svg>
          <div style={{ fontSize: 20, fontWeight: 800 }}>⏱</div>
          <div style={{ fontSize: 38, fontWeight: 800, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', fontFamily: "'Barlow Condensed', sans-serif" }}>
            {String(totalMin).padStart(2,'0')}:{String(totalSec).padStart(2,'0')}
          </div>
        </div>
        <div style={{ flex: 1, background: chipBg, borderRadius: 12, padding: '10px 12px', textAlign: 'center', color: textPrimary }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>סט</div>
          <div style={{ fontSize: 40, fontWeight: 800 }}>{Math.max(1, phase.set)}/{cfg.sets}</div>
        </div>
        <button
          type="button"
          onClick={() => setRoundPickerOpen(true)}
          style={{ flex: 1, background: chipBg, borderRadius: 12, padding: '10px 12px', textAlign: 'center', cursor: 'pointer', color: textPrimary, border: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          <div style={{ pointerEvents: 'none', fontSize: 20, fontWeight: 800 }}>סבב</div>
          <div style={{ pointerEvents: 'none', fontSize: 40, fontWeight: 800 }}>{Math.max(1, phase.round)}/{cfg.rounds}</div>
        </button>
      </div>

      {/* CENTER: Ring + number — fixed compact size so nothing overflows */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0, width: '100%' }}>
        <div style={{ position: 'relative', width: 'min(92vw, 360px)', height: 'min(92vw, 360px)', margin: '0 auto', display: 'block' }}>
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

      {/* BOTTOM: Next + Nav + Controls */}
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
          <button onClick={skipToPrev} style={{ flex: 1, height: 48, background: secondaryBtn.bg, color: secondaryBtn.fg, border: secondaryBtn.border, borderRadius: 14, fontSize: 18, fontWeight: 800, cursor: 'pointer', touchAction: 'manipulation' }}>◀ חזור</button>
          <button onClick={skipToNext} style={{ flex: 1, height: 48, background: secondaryBtn.bg, color: secondaryBtn.fg, border: secondaryBtn.border, borderRadius: 14, fontSize: 18, fontWeight: 800, cursor: 'pointer', touchAction: 'manipulation' }}>הבא ▶</button>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {paused
            ? <button onClick={handleResume} style={{ flex: 2, height: 56, fontSize: 22, fontWeight: 800, background: primaryBtn.bg, color: primaryBtn.fg, border: 'none', borderRadius: 12, cursor: 'pointer', touchAction: 'manipulation' }}>המשך ▶</button>
            : <button onClick={handlePause} style={{ flex: 2, height: 56, fontSize: 22, fontWeight: 800, background: primaryBtn.bg, color: primaryBtn.fg, border: 'none', borderRadius: 12, cursor: 'pointer', touchAction: 'manipulation' }}>השהה ‖</button>
          }
          <button onClick={handleStop} style={{ flex: 1, height: 56, fontSize: 18, fontWeight: 800, background: secondaryBtn.bg, color: secondaryBtn.fg, border: secondaryBtn.border, borderRadius: 12, cursor: 'pointer', touchAction: 'manipulation' }}>עצור</button>
        </div>
      </div>
      <RoundJumpPicker
        isOpen={roundPickerOpen}
        currentRound={phase.round}
        currentPhase={phase.type === 'prep' ? 'prepare' : phase.type}
        totalRounds={cfg.rounds}
        hasPrepare={cfg.prep > 0}
        hasRest={cfg.rest > 0}
        onSelect={jumpToPhase}
        onClose={() => setRoundPickerOpen(false)}
      />
    </div>
  );
}

const sBtn = { width: 36, height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.4)', fontSize: 20, fontWeight: 700, cursor: 'pointer', touchAction: 'manipulation' };
// Config-screen stepper buttons — light theme
const cBtnMinus = { width: 36, height: 36, borderRadius: 8, background: '#FFFFFF', color: '#FF6F20', border: '1px solid rgba(255,111,32,0.3)', fontSize: 20, fontWeight: 700, cursor: 'pointer', touchAction: 'manipulation' };
const cBtnPlus  = { width: 36, height: 36, borderRadius: 8, background: '#FF6F20', color: '#FFFFFF', border: 'none', fontSize: 20, fontWeight: 700, cursor: 'pointer', touchAction: 'manipulation' };
const cBtn = { padding: '12px 28px', fontSize: 18, fontWeight: 800, background: '#fff', color: '#FF6F20', border: 'none', borderRadius: 12, cursor: 'pointer', touchAction: 'manipulation' };
