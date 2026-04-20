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
      { k: 'prep',   l: 'הכנה',            icon: '⏳', u: 'שנ׳', mn: 0,  mx: 60  },
      { k: 'work',   l: 'עבודה',           icon: '🔥', u: 'שנ׳', mn: 1,  mx: 600 },
      { k: 'rest',   l: 'מנוחה',           icon: '💚', u: 'שנ׳', mn: 0,  mx: 600 },
      { k: 'rounds', l: 'סבבים',            icon: '🔄', u: '',    mn: 1,  mx: 20  },
      { k: 'sets',   l: 'סטים',              icon: '📦', u: '',    mn: 1,  mx: 10  },
      { k: 'rb',     l: 'מנוחה בין סטים',   icon: '⏸', u: 'שנ׳', mn: 0,  mx: 900 },
    ];
    return (
      <div style={{ background: O, minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 16px', direction: 'rtl', overflowY: 'auto' }}>
        <div style={{ fontSize: 32, fontWeight: 900, color: W, marginBottom: 6 }}>⏱ טבטה</div>
        <div style={{ fontSize: 13, color: WD, marginBottom: 20 }}>הגדר את פרמטרי האימון</div>

        <div style={{ width: '100%', maxWidth: 360 }}>
          {fields.map(f => (
            <div key={f.k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: 'rgba(255,255,255,0.1)', borderRadius: 12, marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>{f.icon}</span>
                <div>
                  <div style={{ fontSize: 15, color: W, fontWeight: 700 }}>{f.l}</div>
                  {f.u && <div style={{ fontSize: 11, color: WD }}>{f.u}</div>}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button onClick={() => setCfg(c => ({ ...c, [f.k]: Math.max(f.mn, c[f.k] - 1) }))} style={sBtn}>−</button>
                <span style={{ fontSize: 22, fontWeight: 900, color: W, minWidth: 40, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{cfg[f.k]}</span>
                <button onClick={() => setCfg(c => ({ ...c, [f.k]: Math.min(f.mx, c[f.k] + 1) }))} style={sBtn}>+</button>
              </div>
            </div>
          ))}
        </div>

        {/* Workout summary */}
        <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 14, padding: '14px 20px', marginTop: 16, width: '100%', maxWidth: 360 }}>
          <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
            <div><div style={{ fontSize: 20, fontWeight: 900 }}>{cfg.rounds * cfg.sets}</div><div style={{ fontSize: 10, opacity: 0.7 }}>סבבים</div></div>
            <div style={{ width: 1, background: 'rgba(255,255,255,0.2)' }} />
            <div><div style={{ fontSize: 20, fontWeight: 900 }}>{twMin}:{String(twSec).padStart(2,'0')}</div><div style={{ fontSize: 10, opacity: 0.7 }}>זמן כולל</div></div>
            <div style={{ width: 1, background: 'rgba(255,255,255,0.2)' }} />
            <div><div style={{ fontSize: 20, fontWeight: 900 }}>{cfg.work * cfg.rounds * cfg.sets}</div><div style={{ fontSize: 10, opacity: 0.7 }}>שנ׳ עבודה</div></div>
          </div>
        </div>

        <button onClick={handleStart} style={{ marginTop: 24, width: '100%', maxWidth: 360, padding: '16px', fontSize: 22, fontWeight: 900, background: W, color: O, border: 'none', borderRadius: 14, cursor: 'pointer' }}>
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

  // Minimize handler
  function doMinimize() {
    if (onMinimize && setLiveTimer) {
      setLiveTimer({
        type: 'tabata',
        display: String(display),
        phase: PHASE_LABEL[phaseRef.current.type] || '',
        info: `סבב ${phase.round}/${cfg.rounds} · סט ${phase.set}/${cfg.sets}`,
        paused,
      });
      onMinimize();
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
    // Restart current phase from beginning
    beginPhase({ ...phaseRef.current });
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

  // Phase colors for timeline dots
  const phaseColor = { prep: '#888', work: '#fff', rest: '#16a34a', set_rest: '#3b82f6' };

  // ─── Active Timer ───
  const dashOffset = progress * CIRC;
  return (
    <div style={{ background: O, minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 16px 20px', direction: 'rtl', color: W, overflowY: 'auto' }}>

      {/* Top bar */}
      <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ fontSize: 26, fontWeight: 900 }}>{PHASE_LABEL[phase.type]}</div>
        <button onClick={doMinimize} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 10, padding: '7px 12px', color: W, fontSize: 12, fontWeight: 700, cursor: 'pointer', touchAction: 'manipulation' }}>
          מזער ↗
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {phase.type !== 'prep' && (
          <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 8, padding: '5px 12px', fontSize: 13, fontWeight: 700 }}>
            🔄 סבב {phase.round}/{cfg.rounds}
          </div>
        )}
        {cfg.sets > 1 && phase.type !== 'prep' && (
          <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 8, padding: '5px 12px', fontSize: 13, fontWeight: 700 }}>
            📦 סט {phase.set}/{cfg.sets}
          </div>
        )}
        <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 8, padding: '5px 12px', fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
          ⏱ {String(totalMin).padStart(2,'0')}:{String(totalSec).padStart(2,'0')}
        </div>
      </div>

      {/* Ring + giant number */}
      <div style={{ position: 'relative', width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE}>
          <circle cx={CX} cy={CY} r={R} stroke={WD} strokeWidth={S} fill="none" />
          <circle cx={CX} cy={CY} r={R} stroke={W} strokeWidth={S} strokeLinecap="round" fill="none"
            strokeDasharray={CIRC} strokeDashoffset={dashOffset} transform={`rotate(-90 ${CX} ${CY})`} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 'min(42vw, 140px)', fontWeight: 900, fontVariantNumeric: 'tabular-nums', letterSpacing: -4, lineHeight: 1 }}>{display}</span>
        </div>
      </div>

      {/* Phase navigation: prev | next */}
      <div style={{ display: 'flex', gap: 10, marginTop: 8, width: '100%', maxWidth: 340 }}>
        <button onClick={skipToPrev} style={{ flex: 1, height: 38, background: 'rgba(255,255,255,0.15)', color: W, border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', touchAction: 'manipulation' }}>◀ חזור</button>
        <button onClick={skipToNext} style={{ flex: 1, height: 38, background: 'rgba(255,255,255,0.15)', color: W, border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', touchAction: 'manipulation' }}>הבא ▶</button>
      </div>

      {/* Next phase preview */}
      {nextP && nextP.type !== 'done' && (
        <div style={{ marginTop: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 16px', fontSize: 13, fontWeight: 600 }}>
          הבא: {PHASE_LABEL[nextP.type]} · {nextP.dur} שנ׳
        </div>
      )}

      {/* Scrollable phase timeline */}
      <div style={{ width: '100%', maxWidth: 360, marginTop: 12, overflowX: 'auto', WebkitOverflowScrolling: 'touch', direction: 'ltr' }}>
        <div style={{ display: 'flex', gap: 4, minWidth: 'max-content', padding: '4px 0' }}>
          {timeline.map((t, i) => {
            const isCurrent = i === currentIdx;
            const isPast = i < currentIdx;
            return (
              <div key={i} style={{
                minWidth: 44, padding: '6px 4px', borderRadius: 8, textAlign: 'center',
                background: isCurrent ? 'rgba(255,255,255,0.3)' : isPast ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.08)',
                border: isCurrent ? '2px solid white' : '2px solid transparent',
                opacity: isPast ? 0.5 : 1,
              }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: phaseColor[t.type] || '#fff', margin: '0 auto 3px', border: '1px solid rgba(255,255,255,0.3)' }} />
                <div style={{ fontSize: 9, fontWeight: 700, color: W, lineHeight: 1.2 }}>
                  {PHASE_LABEL[t.type]?.slice(0, 4)}
                </div>
                <div style={{ fontSize: 10, fontWeight: 800, color: W }}>{t.dur}״</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Controls */}
      <div style={{ marginTop: 14, display: 'flex', gap: 10, width: '100%', maxWidth: 340 }}>
        {paused
          ? <button onClick={handleResume} style={{ ...cBtn, flex: 2 }}>המשך ▶</button>
          : <button onClick={handlePause} style={{ ...cBtn, flex: 2 }}>השהה ‖</button>
        }
        <button onClick={handleStop} style={{ ...cBtn, flex: 1, background: 'rgba(255,255,255,0.2)', color: W }}>עצור</button>
      </div>
    </div>
  );
}

const sBtn = { width: 36, height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.4)', fontSize: 20, fontWeight: 700, cursor: 'pointer', touchAction: 'manipulation' };
const cBtn = { padding: '12px 28px', fontSize: 18, fontWeight: 800, background: '#fff', color: '#FF6F20', border: 'none', borderRadius: 12, cursor: 'pointer', touchAction: 'manipulation' };
