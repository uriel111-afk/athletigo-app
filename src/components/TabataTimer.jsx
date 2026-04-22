import { useState, useEffect, useRef, useCallback } from 'react';
import {
  unlock as unlockAudio, now, playBeep, playClick, playWhistle, playBell,
  playLongBeep, playDoubleBell, playVictory, playGong,
  playSoftBreath, playActionMelody, playSlowPulse, cancelScheduled,
} from '@/lib/tabataSounds';
import ScrollPickerPopup, { SECONDS_OPTIONS, ROUNDS_OPTIONS, PREP_OPTIONS } from '@/components/ScrollPickerPopup';
import RoundJumpPicker from '@/components/RoundJumpPicker';
import { useActiveTimer } from '@/contexts/ActiveTimerContext';
import { useNavigate } from 'react-router-dom';

// ─── Constants ───
const O = '#FF6F20';
const W = '#FFFFFF';
const WD = 'rgba(255,255,255,0.2)';
const R = 120, S = 10, SIZE = R * 2 + S * 2, CX = SIZE / 2, CY = SIZE / 2;
const CIRC = 2 * Math.PI * R;

const PHASE_LABEL = { prep: 'הכנה', work: 'עבודה', rest: 'מנוחה', set_rest: 'מנוחה בין סטים', done: 'סיום' };
const LS_KEY = 'tb3';

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

function transitionSound(from, to) {
  if (from === 'prep'     && to === 'work')     playActionMelody();
  if (from === 'work'     && to === 'rest')     playSlowPulse();
  if (from === 'rest'     && to === 'work')     playActionMelody();
  if (from === 'work'     && to === 'set_rest') playLongBeep();
  if (from === 'set_rest' && to === 'work')     playDoubleBell();
  if (from === 'work'     && to === 'done')     playVictory();
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

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { cfgRef.current = cfg; localStorage.setItem(LS_KEY, JSON.stringify(cfg)); }, [cfg]);
  useEffect(() => { screenRef.current = screen; }, [screen]);

  // Cleanup on unmount
  useEffect(() => () => { cancelAnimationFrame(rafRef.current); cancelScheduled(); }, []);

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
    const p = phaseRef.current;
    if (p.type === 'idle' || p.type === 'done') return;

    const elapsed = (performance.now() - startAtRef.current) / 1000;
    const remaining = Math.max(0, p.dur - elapsed);
    const secs = Math.ceil(remaining);

    // Countdown beeps at 3, 2, 1
    if (secs <= 3 && secs >= 1 && secs !== lastBeepRef.current) {
      lastBeepRef.current = secs;
      playBeep();
    }

    if (remaining <= 0) {
      // Transition
      const nxt = nextPhase(p, cfgRef.current);
      transitionSound(p.type, nxt.type);

      if (nxt.type === 'done') {
        setPhase(nxt);
        phaseRef.current = nxt;
        setDisplay(0);
        setProgress(1);
        setScreen('done');
        return;
      }

      beginPhase(nxt);
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    setDisplay(secs);
    setProgress(elapsed / p.dur);

    // Update floating timer — always keep it alive while running
    if (setLiveTimer && screenRef.current === 'running') {
      setLiveTimer({
        type: 'tabata',
        display: String(secs),
        phase: PHASE_LABEL[p.type] || '',
        info: `סבב ${p.round}/${cfgRef.current.rounds} · סט ${p.set}/${cfgRef.current.sets}`,
        paused: false,
      });
    }

    rafRef.current = requestAnimationFrame(tick);
  }

  // ─── Handlers ───
  const handleStart = useCallback(async () => {
    await unlockAudio();
    // Same start sound as the Stopwatch (Clocks.jsx SOUND_START = playClick).
    playClick();
    setPaused(false);
    setScreen('running');
    const first = cfg.prep > 0
      ? { type: 'prep', round: 0, set: 0, dur: cfg.prep }
      : { type: 'work', round: 1, set: 1, dur: cfg.work };
    beginPhase(first);
    rafRef.current = requestAnimationFrame(tick);
  }, [cfg]);

  function handlePause() {
    // Pause is silent by spec.
    cancelAnimationFrame(rafRef.current);
    cancelScheduled();
    elapsedRef.current = (performance.now() - startAtRef.current) / 1000;
    setPaused(true);
    if (setLiveTimer) setLiveTimer(prev => prev ? { ...prev, paused: true } : null);
  }

  function handleResume() {
    playClick();
    startAtRef.current = performance.now() - elapsedRef.current * 1000;
    lastBeepRef.current = -1;
    setPaused(false);
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

  // Event listeners for floating timer controls
  useEffect(() => {
    const onReset = () => handleStop();
    const onPauseResume = () => { if (paused) handleResume(); else handlePause(); };
    window.addEventListener('tabata-reset', onReset);
    window.addEventListener('tabata-pause-resume', onPauseResume);
    return () => {
      window.removeEventListener('tabata-reset', onReset);
      window.removeEventListener('tabata-pause-resume', onPauseResume);
    };
  }, [paused]);

  // ─── Compute total workout time from config ───
  function calcTotalFromConfig(c) {
    return (c.prep + (c.work + c.rest) * c.rounds) * c.sets + c.rb * Math.max(0, c.sets - 1) - c.rest * c.sets;
  }
  const totalWorkoutTime = calcTotalFromConfig(cfg);
  const twMin = Math.floor(totalWorkoutTime / 60);
  const twSec = totalWorkoutTime % 60;

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
      <div style={{ background: '#FFF9F0', minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 16px', direction: 'rtl', overflowY: 'auto' }}>
        <div style={{ fontSize: 32, fontWeight: 900, color: '#FF6F20', marginBottom: 6 }}>⏱ טבטה</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#1a1a1a', marginBottom: 20, opacity: 1 }}>הגדר את האימון שלך</div>

        <div style={{ width: '100%', maxWidth: 360 }}>
          {fields.map(f => (
            <div key={f.k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: '#FFFFFF', borderRadius: 12, marginBottom: 8, border: '1px solid rgba(255,111,32,0.12)', boxShadow: '0 2px 8px rgba(255,111,32,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>{f.icon}</span>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a', marginBottom: 6 }}>{f.l}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={() => setCfg(c => ({ ...c, [f.k]: Math.max(f.mn, c[f.k] - 1) }))} style={cBtnMinus}>−</button>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 50 }}>
                  <span
                    onClick={() => setPickingField(f.k)}
                    style={{
                      fontSize: 36,
                      fontWeight: 700,
                      color: '#FF6F20',
                      fontFamily: "'Barlow Condensed', sans-serif",
                      cursor: 'pointer',
                      lineHeight: 1,
                      textAlign: 'center',
                    }}
                  >{cfg[f.k]}</span>
                  {f.u && (
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#888', marginTop: 2 }}>
                      {f.u}
                    </span>
                  )}
                </div>
                <button onClick={() => setCfg(c => ({ ...c, [f.k]: Math.min(f.mx, c[f.k] + 1) }))} style={cBtnPlus}>+</button>
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

        {/* Workout summary */}
        <div style={{ background: '#FFFFFF', borderRadius: 14, padding: '14px 20px', marginTop: 16, width: '100%', maxWidth: 360, border: '1px solid rgba(255,111,32,0.12)', boxShadow: '0 2px 8px rgba(255,111,32,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center', color: '#1a1a1a' }}>
            <div><div style={{ fontSize: 20, fontWeight: 900, color: '#FF6F20' }}>{cfg.rounds * cfg.sets}</div><div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>סבבים</div></div>
            <div style={{ width: 1, background: 'rgba(255,111,32,0.15)' }} />
            <div><div style={{ fontSize: 20, fontWeight: 900, color: '#FF6F20' }}>{twMin}:{String(twSec).padStart(2,'0')}</div><div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>זמן כולל</div></div>
            <div style={{ width: 1, background: 'rgba(255,111,32,0.15)' }} />
            <div><div style={{ fontSize: 20, fontWeight: 900, color: '#FF6F20' }}>{cfg.work * cfg.rounds * cfg.sets}</div><div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>שנ׳ עבודה</div></div>
          </div>
        </div>

        <button onClick={handleStart} style={{ marginTop: 24, width: '100%', maxWidth: 360, padding: '16px', fontSize: 22, fontWeight: 900, background: '#FF6F20', color: '#FFFFFF', border: 'none', borderRadius: 14, cursor: 'pointer', boxShadow: '0 4px 14px rgba(255,111,32,0.3)' }}>
          ▶ התחל אימון
        </button>
      </div>
    );
  }

  // ─── Done Screen ───
  if (screen === 'done') {
    return (
      <div style={{ background: O, minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20, direction: 'rtl', color: W }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>🎉</div>
        <div style={{ fontSize: 28, fontWeight: 900, marginBottom: 8 }}>סיימת!</div>
        <div style={{ fontSize: 16, opacity: 0.8 }}>{cfg.rounds} סבבים × {cfg.sets} סטים</div>
        <button onClick={handleStop} style={{ marginTop: 32, padding: '14px 48px', fontSize: 20, fontWeight: 900, background: W, color: O, border: 'none', borderRadius: 12, cursor: 'pointer' }}>
          אימון חדש
        </button>
      </div>
    );
  }

  // ─── Compute total remaining time ───
  function calcTotalRemaining() {
    const c = cfgRef.current;
    const p = phaseRef.current;
    if (p.type === 'idle' || p.type === 'done') return 0;

    // Current phase remaining
    const elapsed = (performance.now() - startAtRef.current) / 1000;
    let total = Math.max(0, p.dur - elapsed);

    // Remaining phases
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

  // Minimize handler — bulletproof. Always:
  //   1. Save tabata state to liveTimerTabata so the bar can render it
  //   2. Hide the full-screen overlay (showTabata=false)
  //   3. Flip isMinimized so the footer bar appears
  //   4. Navigate away from /clocks if the user is on it
  // Calls the parent's onMinimize as well (legacy navigation path).
  function doMinimize() {
    const snapshot = {
      type: 'tabata',
      display: String(display),
      phase: PHASE_LABEL[phaseRef.current.type] || '',
      info: `סבב ${phase.round}/${cfg.rounds} · סט ${phase.set}/${cfg.sets}`,
      paused,
    };
    // Prefer the targeted tabata setter; fall back to the legacy prop.
    if (setLiveTimerTabata) setLiveTimerTabata(snapshot);
    else if (setLiveTimer) setLiveTimer(snapshot);

    if (setShowTabata) setShowTabata(false);
    if (setIsMinimized) setIsMinimized(true);

    if (typeof onMinimize === 'function') {
      onMinimize();
    } else if (window.location.pathname.toLowerCase().includes('clock')) {
      navigate(-1);
    }
  }

  // Navigation: skip to next/prev phase
  function skipToNext() {
    cancelScheduled();
    const nxt = nextPhase(phaseRef.current, cfgRef.current);
    transitionSound(phaseRef.current.type, nxt.type);
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
  const ringTrack   = cream  ? 'rgba(255,111,32,0.15)' : 'rgba(255,255,255,0.25)';
  const ringFill    = cream  ? '#FF6F20' : '#FFFFFF';
  const chipBg      = cream  ? 'rgba(255,111,32,0.10)' : 'rgba(255,255,255,0.15)';
  const chipDarkBg  = cream  ? 'rgba(0,0,0,0.05)'      : 'rgba(0,0,0,0.2)';
  // Primary action button (pause/resume) — invert per phase
  const primaryBtn = {
    bg: isWork ? '#FFFFFF' : '#FF6F20',
    fg: isWork ? '#FF6F20' : '#FFFFFF',
  };

  return (
    <div style={{ background: bg, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', paddingBottom: 'max(env(safe-area-inset-bottom), 10px)', direction: 'rtl', color: textPrimary, overflow: 'hidden', transition: 'background 0.3s ease, color 0.3s ease' }}>

      {/* ROW 1: Phase name + minimize */}
      <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ fontSize: 'min(10vw, 40px)', fontWeight: 900, color: textPrimary }}>{PHASE_LABEL[phase.type]}</div>
        <button onClick={doMinimize} style={{ background: chipBg, border: 'none', borderRadius: 12, padding: '9px 16px', color: textPrimary, fontSize: 15, fontWeight: 800, cursor: 'pointer', touchAction: 'manipulation' }}>
          מזער ↗
        </button>
      </div>

      {/* ROW 2: Stats — round + set + total time */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexShrink: 0 }}>
        {phase.type !== 'prep' && (
          <div
            onClick={() => setRoundPickerOpen(true)}
            style={{ background: chipBg, borderRadius: 12, padding: '7px 18px', fontSize: 'min(5.5vw, 22px)', fontWeight: 900, cursor: 'pointer', color: textPrimary }}
          >
            סבב {phase.round}/{cfg.rounds}
          </div>
        )}
        {cfg.sets > 1 && phase.type !== 'prep' && (
          <div style={{ background: chipBg, borderRadius: 12, padding: '7px 18px', fontSize: 'min(5.5vw, 22px)', fontWeight: 900, color: textPrimary }}>
            סט {phase.set}/{cfg.sets}
          </div>
        )}
        <div style={{ background: chipDarkBg, borderRadius: 12, padding: '7px 18px', fontSize: 'min(5.5vw, 22px)', fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: textPrimary }}>
          ⏱ {String(totalMin).padStart(2,'0')}:{String(totalSec).padStart(2,'0')}
        </div>
      </div>

      {/* CENTER: Ring + MASSIVE number — fills all available space */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0, width: '100%' }}>
        <div style={{ position: 'relative', width: 'min(80vw, 320px)', height: 'min(80vw, 320px)' }}>
          <svg width="100%" height="100%" viewBox={`0 0 ${SIZE} ${SIZE}`}>
            <circle cx={CX} cy={CY} r={R} stroke={ringTrack} strokeWidth={S} fill="none" />
            <circle cx={CX} cy={CY} r={R} stroke={ringFill} strokeWidth={S} strokeLinecap="round" fill="none"
              strokeDasharray={CIRC} strokeDashoffset={dashOffset} transform={`rotate(-90 ${CX} ${CY})`} style={{ transition: 'stroke 0.3s ease' }} />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 'min(55vw, 200px)', fontWeight: 900, fontVariantNumeric: 'tabular-nums', letterSpacing: -8, lineHeight: 1, color: textPrimary }}>{display}</span>
          </div>
        </div>
      </div>

      {/* BOTTOM: Next + Nav + Controls */}
      <div style={{ width: '100%', maxWidth: 420, flexShrink: 0 }}>
        {nextP && nextP.type !== 'done' && (
          <div style={{ textAlign: 'center', marginBottom: 8, fontSize: 'min(5vw, 20px)', fontWeight: 800, opacity: 0.8, color: textPrimary }}>
            הבא: {PHASE_LABEL[nextP.type]} · {nextP.dur} שנ׳
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button onClick={skipToPrev} style={{ flex: 1, height: 48, background: chipBg, color: textPrimary, border: 'none', borderRadius: 14, fontSize: 18, fontWeight: 800, cursor: 'pointer', touchAction: 'manipulation' }}>◀ חזור</button>
          <button onClick={skipToNext} style={{ flex: 1, height: 48, background: chipBg, color: textPrimary, border: 'none', borderRadius: 14, fontSize: 18, fontWeight: 800, cursor: 'pointer', touchAction: 'manipulation' }}>הבא ▶</button>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {paused
            ? <button onClick={handleResume} style={{ flex: 2, height: 56, fontSize: 22, fontWeight: 800, background: primaryBtn.bg, color: primaryBtn.fg, border: 'none', borderRadius: 12, cursor: 'pointer', touchAction: 'manipulation' }}>המשך ▶</button>
            : <button onClick={handlePause} style={{ flex: 2, height: 56, fontSize: 22, fontWeight: 800, background: primaryBtn.bg, color: primaryBtn.fg, border: 'none', borderRadius: 12, cursor: 'pointer', touchAction: 'manipulation' }}>השהה ‖</button>
          }
          <button onClick={handleStop} style={{ flex: 1, height: 56, fontSize: 18, fontWeight: 800, background: chipBg, color: textPrimary, border: 'none', borderRadius: 12, cursor: 'pointer', touchAction: 'manipulation' }}>עצור</button>
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
