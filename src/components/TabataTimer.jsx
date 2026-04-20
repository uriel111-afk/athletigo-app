import { useState, useEffect, useRef, useCallback } from 'react';
import {
  unlock as unlockAudio, now, playBeep, playWhistle, playBell,
  playLongBeep, playDoubleBell, playVictory, cancelScheduled,
} from '@/lib/tabataSounds';

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
  if (from === 'prep'     && to === 'work')     playWhistle();
  if (from === 'work'     && to === 'rest')     playBell();
  if (from === 'rest'     && to === 'work')     playWhistle();
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

  const phaseRef = useRef(phase);
  const cfgRef = useRef(cfg);
  const rafRef = useRef(null);
  const startAtRef = useRef(0);
  const elapsedRef = useRef(0);
  const lastBeepRef = useRef(-1);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { cfgRef.current = cfg; localStorage.setItem(LS_KEY, JSON.stringify(cfg)); }, [cfg]);

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

    // Update floating timer
    if (setLiveTimer) {
      setLiveTimer(prev => prev ? {
        ...prev, display: String(secs),
        phase: PHASE_LABEL[p.type] || '',
        paused: false,
      } : null);
    }

    rafRef.current = requestAnimationFrame(tick);
  }

  // ─── Handlers ───
  const handleStart = useCallback(async () => {
    await unlockAudio();
    setPaused(false);
    setScreen('running');
    const first = cfg.prep > 0
      ? { type: 'prep', round: 0, set: 0, dur: cfg.prep }
      : { type: 'work', round: 1, set: 1, dur: cfg.work };
    beginPhase(first);
    rafRef.current = requestAnimationFrame(tick);
  }, [cfg]);

  function handlePause() {
    cancelAnimationFrame(rafRef.current);
    cancelScheduled();
    elapsedRef.current = (performance.now() - startAtRef.current) / 1000;
    setPaused(true);
    if (setLiveTimer) setLiveTimer(prev => prev ? { ...prev, paused: true } : null);
  }

  function handleResume() {
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

  // ─── Settings Screen ───
  if (screen === 'settings') {
    const fields = [
      { k: 'prep',   l: 'זמן הכנה',        u: 'שנ׳', mn: 0,  mx: 60  },
      { k: 'work',   l: 'זמן עבודה',       u: 'שנ׳', mn: 1,  mx: 600 },
      { k: 'rest',   l: 'זמן מנוחה',       u: 'שנ׳', mn: 0,  mx: 600 },
      { k: 'rb',     l: 'מנוחה בין סטים',   u: 'שנ׳', mn: 0,  mx: 900 },
      { k: 'rounds', l: 'סבבים',            u: '',    mn: 1,  mx: 20  },
      { k: 'sets',   l: 'סטים',              u: '',    mn: 1,  mx: 10  },
    ];
    return (
      <div style={{ background: O, minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20, direction: 'rtl' }}>
        <div style={{ fontSize: 28, fontWeight: 900, color: W, marginBottom: 24 }}>טבטה</div>
        {fields.map(f => (
          <div key={f.k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', maxWidth: 340, marginBottom: 10 }}>
            <span style={{ fontSize: 15, color: W, fontWeight: 600 }}>{f.l}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => setCfg(c => ({ ...c, [f.k]: Math.max(f.mn, c[f.k] - 1) }))} style={sBtn}>−</button>
              <span style={{ fontSize: 20, fontWeight: 800, color: W, minWidth: 36, textAlign: 'center' }}>{cfg[f.k]}</span>
              <button onClick={() => setCfg(c => ({ ...c, [f.k]: Math.min(f.mx, c[f.k] + 1) }))} style={sBtn}>+</button>
              {f.u && <span style={{ fontSize: 11, color: WD, width: 24 }}>{f.u}</span>}
            </div>
          </div>
        ))}
        <button onClick={handleStart} style={{ marginTop: 28, padding: '14px 48px', fontSize: 22, fontWeight: 900, background: W, color: O, border: 'none', borderRadius: 12, cursor: 'pointer' }}>
          התחל
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

  // ─── Active Timer ───
  const dashOffset = progress * CIRC;
  return (
    <div style={{ background: O, minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16, direction: 'rtl', color: W }}>
      <div style={{ fontSize: 32, fontWeight: 900, marginBottom: 12 }}>{PHASE_LABEL[phase.type]}</div>

      <div style={{ position: 'relative', width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE}>
          <circle cx={CX} cy={CY} r={R} stroke={WD} strokeWidth={S} fill="none" />
          <circle cx={CX} cy={CY} r={R} stroke={W} strokeWidth={S} strokeLinecap="round" fill="none"
            strokeDasharray={CIRC} strokeDashoffset={dashOffset} transform={`rotate(-90 ${CX} ${CY})`} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 80, fontWeight: 900, fontVariantNumeric: 'tabular-nums', letterSpacing: -3 }}>{display}</span>
        </div>
      </div>

      {phase.type !== 'prep' && (
        <div style={{ marginTop: 14, fontSize: 18, fontWeight: 700, textAlign: 'center', lineHeight: 1.6 }}>
          <div>סבב {phase.round} / {cfg.rounds}</div>
          {cfg.sets > 1 && <div>סט {phase.set} / {cfg.sets}</div>}
        </div>
      )}

      <div style={{ marginTop: 28, display: 'flex', gap: 12 }}>
        {paused
          ? <button onClick={handleResume} style={cBtn}>המשך ▶</button>
          : <button onClick={handlePause} style={cBtn}>השהה ‖</button>
        }
        <button onClick={handleStop} style={{ ...cBtn, background: 'rgba(255,255,255,0.2)', color: W }}>עצור</button>
      </div>
    </div>
  );
}

const sBtn = { width: 36, height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.4)', fontSize: 20, fontWeight: 700, cursor: 'pointer', touchAction: 'manipulation' };
const cBtn = { padding: '12px 28px', fontSize: 18, fontWeight: 800, background: '#fff', color: '#FF6F20', border: 'none', borderRadius: 12, cursor: 'pointer', touchAction: 'manipulation' };
