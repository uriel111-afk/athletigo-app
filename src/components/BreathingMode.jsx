import React, { useEffect, useRef, useState } from 'react';
import { ensureBreathPermission, showBreathNotification, clearBreathNotification } from '@/lib/breathNotification';

// Fixed output gain — no user slider. The DynamicsCompressor after the
// gain keeps it distortion-free; the phone's media (STREAM_MUSIC) volume
// keys are the only user control.
const FIXED_GAIN = 2.2;

// ── Breathing trainer ("נשימות") ───────────────────────────────────
// A calm 4-phase cycle (inhale / hold / exhale / hold-empty). The
// CIRCLE animation is pure CSS (transform scale + transition-duration =
// phase duration) driven by phase-change state, NOT per-frame JS. Audio
// uses its own AudioContext (never touches the metronome/timer engines):
// soft sine glides up on inhale, down on exhale, silence on holds, a
// gentle chime on each transition, three descending chimes at the end.
// Integrates with the parallel-clocks system (floating bar + wake-lock).
// ────────────────────────────────────────────────────────────────────

// All colours resolve to Lumen tokens (see index.css) — no hard-coded hex
// anywhere in this component.
const ORANGE = 'var(--brand-orange)';
// Min contraction — kept at 66% (≥65%) so the FIXED white number stays
// fully inside the circle even at its most contracted (end of exhale).
const SMALL = 0.66;
const PREP_PULSE = SMALL + 0.08; // gentle one-beat pulse during prep
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

// Phase names — one consistent set everywhere (settings + exercise + next
// preview): שאיפה / החזקה מלאה / נשיפה / החזקה ריקה.
const PHASE_DEFS = [
  { key: 'inhale',    name: 'שאיפה',      tone: 'up' },
  { key: 'hold',      name: 'החזקה מלאה', tone: 'hold' },
  { key: 'exhale',    name: 'נשיפה',      tone: 'down' },
  { key: 'holdEmpty', name: 'החזקה ריקה', tone: 'hold' },
];
const STEPPERS = [
  { key: 'inhale',    label: 'שאיפה' },
  { key: 'hold',      label: 'החזקה מלאה' },
  { key: 'exhale',    label: 'נשיפה' },
  { key: 'holdEmpty', label: 'החזקה ריקה' },
];

// Per-phase palette (earth & sea) — keyed by phase KEY (hold and holdEmpty
// are now DIFFERENT colours, so a tone-based lookup no longer suffices).
const PHASE_COLOR = {
  inhale:    'var(--phase-inhale)',
  hold:      'var(--phase-hold-full)',
  exhale:    'var(--phase-exhale)',
  holdEmpty: 'var(--phase-hold-empty)',
};
const PHASE_TINT = {
  inhale:    'var(--phase-inhale-tint)',
  hold:      'var(--phase-hold-full-tint)',
  exhale:    'var(--phase-exhale-tint)',
  holdEmpty: 'var(--phase-hold-empty-tint)',
};

function createBreathAudio(initialGain = FIXED_GAIN) {
  let ctx = null;
  let master = null;   // user-volume GainNode (0..3)
  let comp = null;     // limiter after the gain — no distortion at high boost
  let vol = initialGain;
  const ensure = () => {
    if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; ctx = new AC(); }
    return ctx;
  };
  // Signal path: source → master(gain=vol) → compressor → destination.
  const bus = () => {
    const c = ensure();
    if (!master) {
      master = c.createGain(); master.gain.value = vol;
      comp = c.createDynamicsCompressor();
      comp.threshold.setValueAtTime(-8, c.currentTime);
      comp.knee.setValueAtTime(14, c.currentTime);
      comp.ratio.setValueAtTime(8, c.currentTime);
      comp.attack.setValueAtTime(0.003, c.currentTime);
      comp.release.setValueAtTime(0.2, c.currentTime);
      master.connect(comp); comp.connect(c.destination);
    }
    return master;
  };
  return {
    setGain: (v) => { vol = Math.max(0, Math.min(3, v)); if (master) { try { master.gain.setTargetAtTime(vol, ensure().currentTime, 0.02); } catch { master.gain.value = vol; } } },
    resume: async () => {
      const c = ensure();
      if (c.state !== 'running') { try { await c.resume(); } catch {} }
      try { const b = c.createBuffer(1, 1, 22050); const s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0); } catch {}
    },
    // Soft sine that glides from→to over `dur` seconds — the breathing
    // "voice". Louder base level; the smooth attack/release keeps it calm.
    glide: (from, to, dur) => {
      const c = ensure(); const t = c.currentTime;
      const osc = c.createOscillator(); const g = c.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(from, t);
      osc.frequency.linearRampToValueAtTime(to, t + dur);
      const peak = 0.32, fade = Math.min(0.9, dur * 0.35);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + fade);
      g.gain.setValueAtTime(peak, t + Math.max(fade, dur - 0.6));
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      osc.connect(g); g.connect(bus()); osc.start(t); osc.stop(t + dur + 0.05);
    },
    chime: (freq = 500) => {
      const c = ensure(); const t = c.currentTime;
      const osc = c.createOscillator(); const g = c.createGain();
      osc.type = 'sine'; osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.26, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      osc.connect(g); g.connect(bus()); osc.start(t); osc.stop(t + 0.6);
    },
    // Prep second tick — short, gentle.
    tick: () => {
      const c = ensure(); const t = c.currentTime;
      const osc = c.createOscillator(); const g = c.createGain();
      osc.type = 'sine'; osc.frequency.value = 660;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.3, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      osc.connect(g); g.connect(bus()); osc.start(t); osc.stop(t + 0.14);
    },
    // Distinct "exercise begins" cue — two quick rising notes.
    startCue: () => {
      const c = ensure(); const t0 = c.currentTime;
      [523, 784].forEach((f, i) => {
        const t = t0 + i * 0.12;
        const osc = c.createOscillator(); const g = c.createGain();
        osc.type = 'sine'; osc.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.4, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
        osc.connect(g); g.connect(bus()); osc.start(t); osc.stop(t + 0.4);
      });
    },
    endChimes: () => {
      const c = ensure(); const t0 = c.currentTime;
      [523, 415, 330].forEach((f, i) => {
        const t = t0 + i * 0.55;
        const osc = c.createOscillator(); const g = c.createGain();
        osc.type = 'sine'; osc.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.34, t + 0.04);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
        osc.connect(g); g.connect(bus()); osc.start(t); osc.stop(t + 0.95);
      });
    },
    suspend: () => { try { ctx && ctx.state === 'running' && ctx.suspend(); } catch {} },
    close: () => { try { ctx && ctx.close(); } catch {}; ctx = null; },
  };
}

const SQUARE_BG = 'var(--breath-square)';

// ── Time frame ────────────────────────────────────────────────────────
// The border fill is a conic-gradient masked to the square's edge, NOT an
// SVG stroke. SVG stroke-dash on this path rendered as static corner
// segments in WebKit (the vectorEffect="non-scaling-stroke" + pathLength
// combination). The conic gradient starts at 0deg (top-middle) and sweeps
// clockwise; masking to a border ring gives a frame that builds from the
// top and closes at the end. Verified empty→quarter→half→full in Chromium.
const FRAME_COLOR = 'var(--breath-frame)';
const FRAME_STROKE = 5; // px — full brand-orange ring
const MASK_FILL = 'var(--breath-mask)'; // opaque fill for the border-ring mask

const CIRCLE_UP   = 'var(--breath-circle-up)';   // inhale/hold — full warm
const CIRCLE_DOWN = 'var(--breath-circle-down)'; // exhale/empty — softer/deeper

// ── Durable session (fix 1) ─────────────────────────────────────────────
// Anchored on the wall-clock timestamp of the exercise start (Date.now),
// NOT on in-memory ticks, so leaving and returning to the app resumes the
// exact round/phase/elapsed. Persisted the moment the exercise begins and
// cleared on stop / finish. `seq` is the flat phase list; round/phase are
// re-derived from elapsed via locate().
const SESSION_KEY = 'ag_breathing_session';
const saveSession = (s) => { try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch {} };
const loadSession = () => { try { const r = localStorage.getItem(SESSION_KEY); return r ? JSON.parse(r) : null; } catch { return null; } };
const clearSession = () => { try { localStorage.removeItem(SESSION_KEY); } catch {} };
export const hasLiveBreathingSession = () => {
  const s = loadSession();
  return !!(s && Array.isArray(s.seq) && s.seq.length && typeof s.startedAt === 'number');
};

// Given the flat sequence and elapsed ms, return the current phase index,
// how far into that phase we are, and (for infinity) how many full cycles
// have completed. `ended` = elapsed ran past a finite sequence.
function locate(seq, elapsedMs, inf) {
  if (!seq || !seq.length) return null;
  const cyc = seq.reduce((s, p) => s + (Number(p.dur) || 0), 0) * 1000;
  let e = Math.max(0, elapsedMs), roundsCompleted = 0;
  if (inf && cyc > 0) { roundsCompleted = Math.floor(e / cyc); e -= roundsCompleted * cyc; }
  let acc = 0;
  for (let i = 0; i < seq.length; i++) {
    const d = (Number(seq[i].dur) || 0) * 1000;
    if (e < acc + d) return { index: i, phaseElapsedMs: e - acc, roundsCompleted, ended: false };
    acc += d;
  }
  const last = seq.length - 1;
  return { index: last, phaseElapsedMs: (Number(seq[last].dur) || 0) * 1000, roundsCompleted, ended: true };
}

const PRESETS = {
  box:  { label: 'קופסה 4-4-4-4', v: { inhale: 4, hold: 4, exhale: 4, holdEmpty: 4 } },
  calm: { label: 'הרגעה 4-7-8',   v: { inhale: 4, hold: 7, exhale: 8, holdEmpty: 0 } },
};
const ROUND_OPTS = [5, 10, 15, 'inf'];
const CHIP_VALUES = [5, 10, 15];

// Remember the last chosen rounds across sessions. The stored value
// (a number or 'inf') fully encodes the mode: 5/10/15 → chip, 'inf' →
// infinity, any other number → custom.
const ROUNDS_KEY = 'ag_breathing_rounds';
const loadRounds = () => {
  try {
    const raw = localStorage.getItem(ROUNDS_KEY);
    if (raw == null) return 10;
    if (raw === 'inf') return 'inf';
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? clamp(n, 1, 99) : 10;
  } catch { return 10; }
};

// Prep countdown length before the exercise (seconds). Persisted.
const PREP_OPTS = [0, 3, 5, 10];
const PREP_KEY = 'ag_breathing_prep';
const loadPrep = () => {
  try { const n = parseInt(localStorage.getItem(PREP_KEY), 10); return PREP_OPTS.includes(n) ? n : 3; }
  catch { return 3; }
};

export default function BreathingMode({ active, onRunningChange, stopSignal = 0 }) { // eslint-disable-line no-unused-vars
  // ── Boot: was an exercise mid-flight when this component (re)mounted? ──
  // Computed ONCE, synchronously, from the durable session so the first
  // render already shows the running (or done) screen — no flash of the
  // config screen, and the round/phase/elapsed are derived from the start
  // timestamp, not from lost in-memory ticks.
  const bootRef = useRef(undefined);
  if (bootRef.current === undefined) {
    let b = null;
    const s = loadSession();
    if (s && Array.isArray(s.seq) && s.seq.length && typeof s.startedAt === 'number') {
      const elapsed = Date.now() - s.startedAt;
      if (!s.inf && elapsed >= s.totalMs) b = { kind: 'done', session: s };
      else b = { kind: 'resume', session: s, elapsed, loc: locate(s.seq, elapsed, !!s.inf) };
    }
    bootRef.current = b;
  }
  const boot = bootRef.current;
  const bootPhase = boot?.kind === 'resume' ? (boot.session.seq[boot.loc.index] || {}) : null;

  const [cfg, setCfg] = useState({ inhale: 4, hold: 4, exhale: 4, holdEmpty: 4 });
  const [rounds, setRounds] = useState(loadRounds);
  const [running, setRunning] = useState(() => boot?.kind === 'resume');
  const [done, setDone] = useState(() => boot?.kind === 'done');
  const [phaseName, setPhaseName] = useState(() => bootPhase?.name || '');
  // Current phase key drives the per-phase title colour + circle shade.
  const [phaseKey, setPhaseKey] = useState(() => bootPhase?.key || '');
  const [secondsLeft, setSecondsLeft] = useState(() => bootPhase ? Math.max(0, Math.ceil((bootPhase.dur || 0) - boot.loc.phaseElapsedMs / 1000)) : 0);
  const [roundCur, setRoundCur] = useState(() => {
    if (boot?.kind === 'resume') return boot.session.inf ? (boot.loc.roundsCompleted + 1) : (bootPhase.round || 1);
    return 1;
  });
  const [scale, setScale] = useState(() => bootPhase ? ((bootPhase.key === 'exhale' || bootPhase.key === 'holdEmpty') ? SMALL : 1) : SMALL);
  const [transDur, setTransDur] = useState(0.4);
  const [mode, setMode] = useState('run');    // 'prep' | 'run'
  const [prepLeft, setPrepLeft] = useState(0); // countdown number during prep
  const [prepSec, setPrepSec] = useState(loadPrep); // 0/3/5/10, persisted
  // Time-frame FILL fraction: 0 = empty ring, 1 = full closed ring. Driven
  // by requestAnimationFrame from the exercise-start timestamp (below), so
  // it is smooth AND correct after a resume.
  const [fillFrac, setFillFrac] = useState(() => (boot?.kind === 'done' ? 1 : (boot?.kind === 'resume' && !boot.session.inf ? clamp(boot.elapsed / boot.session.totalMs, 0, 1) : 0)));
  // Preview of the coming phase — { name, dur, tone } | { finishing:true } | null.
  const [nextInfo, setNextInfo] = useState(null);

  const audioRef = useRef(null);
  const intervalRef = useRef(null);
  const prepIntervalRef = useRef(null);
  const exerciseStartRef = useRef(0);
  const exerciseEpochRef = useRef(0); // Date.now() anchor for the frame fill
  const rafRef = useRef(0);           // requestAnimationFrame handle
  const totalMsRef = useRef(0);
  const isInfRef = useRef(false);
  const seqRef = useRef([]);
  const idxRef = useRef(0);
  const roundRef = useRef(1);
  const phaseStartRef = useRef(0);
  const curRef = useRef(null);
  const runningRef = useRef(false);
  const cfgRef = useRef(cfg);
  const roundsRef = useRef(rounds);
  useEffect(() => { cfgRef.current = cfg; }, [cfg]);
  useEffect(() => { roundsRef.current = rounds; }, [rounds]);
  // Persist the chosen rounds (value encodes chip/custom/infinity mode).
  useEffect(() => { try { localStorage.setItem(ROUNDS_KEY, String(rounds)); } catch {} }, [rounds]);
  useEffect(() => { try { localStorage.setItem(PREP_KEY, String(prepSec)); } catch {} }, [prepSec]);

  const activePreset = (() => {
    for (const k of Object.keys(PRESETS)) {
      const v = PRESETS[k].v;
      if (v.inhale === cfg.inhale && v.hold === cfg.hold && v.exhale === cfg.exhale && v.holdEmpty === cfg.holdEmpty) return k;
    }
    return 'custom';
  })();

  const roundsLeft = () => (roundsRef.current === 'inf' ? '∞' : Math.max(0, roundsRef.current - roundRef.current + 1));
  const report = (r) => onRunningChange && onRunningChange(r, { phase: curRef.current?.name || '', roundsLeft: roundsLeft() });

  // ── Ongoing Android notification (task 2) ─────────────────────────────
  // Live "phase · round X of Y" text. Shown while the app is BACKGROUNDED
  // during an active exercise; refreshed on every phase change; cleared on
  // return / stop / finish.
  const notifBody = () => {
    const phase = curRef.current?.name || 'הכנה';
    const r = roundsRef.current === 'inf'
      ? `סבב ${roundRef.current}`
      : `סבב ${roundRef.current} מתוך ${roundsRef.current}`;
    return `${phase} · ${r}`;
  };
  const refreshNotif = () => {
    if (typeof document !== 'undefined' && document.hidden && runningRef.current) {
      showBreathNotification('אימון נשימות פעיל', notifBody());
    }
  };

  // One breathing cycle: enabled phases in order (starts on inhale).
  const buildCycle = () => {
    const c = cfgRef.current;
    return PHASE_DEFS.map((p) => ({ ...p, dur: Number(c[p.key]) || 0 })).filter((p) => p.dur > 0);
  };

  // Finite exercise → one flat, linear sequence tagged by round, then
  // TRIM trailing non-exhale phases so it always ENDS on a full exhale
  // (never mid-inhale/hold). Each entry: { ...phase, round }.
  const buildFlat = (cycle, n) => {
    const flat = [];
    for (let r = 1; r <= n; r++) for (const p of cycle) flat.push({ ...p, round: r });
    while (flat.length && flat[flat.length - 1].key !== 'exhale') flat.pop();
    return flat;
  };

  // The phase that comes AFTER the current index — following the real
  // sequence (0-length phases already dropped). Finite: the last (final
  // exhale) has no next → { finishing:true }; a round's last phase rolls to
  // the next round's first phase automatically (flat seq). Infinite: wraps.
  // `prep` → the very first phase (nothing is running yet).
  const computeNextInfo = ({ prep = false } = {}) => {
    const seq = seqRef.current;
    if (!seq || !seq.length) return null;
    const info = (p) => ({ name: p.name, dur: p.dur, key: p.key });
    if (prep) return info(seq[0]);
    const i = idxRef.current;
    if (isInfRef.current) return info(seq[(i + 1) % seq.length]);
    if (i + 1 >= seq.length) return { finishing: true };
    return info(seq[i + 1]);
  };

  const enterPhase = (p) => {
    curRef.current = p;
    phaseStartRef.current = performance.now();
    setPhaseName(p.name); setPhaseKey(p.key); setSecondsLeft(p.dur);
    setNextInfo(computeNextInfo());
    if (p.tone === 'up') { setTransDur(p.dur); setScale(1); }
    else if (p.tone === 'down') { setTransDur(p.dur); setScale(SMALL); }
    // holds keep the current scale (no transform change → no motion)
    const a = audioRef.current;
    a.chime(p.tone === 'up' ? 560 : p.tone === 'down' ? 430 : 500);
    if (p.tone === 'up') a.glide(220, 330, p.dur);
    else if (p.tone === 'down') a.glide(330, 220, p.dur);
    report(true);
    refreshNotif(); // update the ongoing notification on each phase change
  };

  const finish = () => {
    clearInterval(intervalRef.current); intervalRef.current = null;
    stopPaint(); clearSession(); clearBreathNotification();
    runningRef.current = false; setRunning(false); setDone(true);
    setFillFrac(1); // last exhale finished → frame complete and closed
    audioRef.current && audioRef.current.endChimes();
    onRunningChange && onRunningChange(false);
  };

  const cycleMs = (seq) => seq.reduce((s, p) => s + p.dur, 0) * 1000;

  // Frame fill on requestAnimationFrame — smooth, and anchored on the
  // exercise-start timestamp so it self-corrects after a background/resume
  // (no drift, no catch-up). Idle for infinity (no defined end).
  const paint = () => {
    rafRef.current = 0;
    if (!runningRef.current || isInfRef.current || totalMsRef.current <= 0) return;
    const frac = clamp((Date.now() - exerciseEpochRef.current) / totalMsRef.current, 0, 1);
    setFillFrac(frac);
    if (frac < 1) rafRef.current = requestAnimationFrame(paint);
  };
  const startPaint = () => { if (!rafRef.current && !isInfRef.current) rafRef.current = requestAnimationFrame(paint); };
  const stopPaint = () => { if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; } };

  const nextPhase = () => {
    const seq = seqRef.current;
    if (isInfRef.current) {
      // Infinity: loop the cycle forever, counting rounds.
      let idx = idxRef.current + 1;
      if (idx >= seq.length) { idx = 0; roundRef.current += 1; setRoundCur(roundRef.current); }
      idxRef.current = idx;
      enterPhase(seq[idx]);
    } else {
      // Finite flat sequence: end after the last (exhale) phase.
      const idx = idxRef.current + 1;
      if (idx >= seq.length) { finish(); return; }
      idxRef.current = idx;
      if (seq[idx].round !== roundRef.current) { roundRef.current = seq[idx].round; setRoundCur(roundRef.current); }
      enterPhase(seq[idx]);
    }
  };

  // Phase clock only — the number + phase transitions + sounds. The frame
  // fill is handled separately by paint() (rAF, timestamp-anchored).
  const loop = () => {
    const p = curRef.current; if (!p) return;
    const elapsed = (performance.now() - phaseStartRef.current) / 1000;
    setSecondsLeft(Math.max(0, Math.ceil(p.dur - elapsed)));
    if (elapsed >= p.dur) nextPhase();
  };

  // Gentle one-beat pulse of the circle during the prep countdown —
  // around the SMALL baseline so the fixed number always fits.
  const prepPulse = () => {
    setTransDur(0.32); setScale(PREP_PULSE);
    setTimeout(() => { if (runningRef.current) { setTransDur(0.32); setScale(SMALL); } }, 340);
  };

  // The actual breathing begins (after prep): distinct cue, start the
  // meter (depletes over the WHOLE exercise) + phase loop.
  const beginExercise = (a) => {
    setMode('run');
    a.startCue();
    const startedAt = Date.now();
    exerciseEpochRef.current = startedAt;
    exerciseStartRef.current = performance.now();
    setRoundCur(seqRef.current[0]?.round || 1);
    setFillFrac(0); // exercise starts with an empty frame; it builds from here
    // Persist the timestamp-anchored session so leave/return restores it.
    saveSession({ startedAt, totalMs: totalMsRef.current, inf: isInfRef.current, seq: seqRef.current });
    enterPhase(seqRef.current[0]);
    intervalRef.current = setInterval(loop, 100);
    startPaint();
  };

  const start = async () => {
    const cycle = buildCycle();
    if (!cycle.length) return;
    ensureBreathPermission(); // ask for notification permission (Android 13+)
    const a = audioRef.current || (audioRef.current = createBreathAudio());
    await a.resume();
    // Build the run sequence: finite → flat & exhale-terminated; inf → cycle loop.
    const inf = roundsRef.current === 'inf';
    isInfRef.current = inf;
    const seq = inf ? cycle : buildFlat(cycle, roundsRef.current);
    if (!seq.length) return;
    seqRef.current = seq; idxRef.current = 0; roundRef.current = 1;
    // Meter total = actual exercise duration (trimmed sequence for finite).
    totalMsRef.current = inf ? 0 : cycleMs(seq);
    setRoundCur(1); setDone(false);
    runningRef.current = true; setRunning(true);

    const prep = clamp(Number(prepSec) || 0, 0, 60);
    if (prep <= 0) { beginExercise(a); return; } // 0 → straight into the exercise

    // ── Prep countdown from the chosen length → then the exercise ──
    setMode('prep'); setPrepLeft(prep); setFillFrac(0); // no frame during prep
    curRef.current = null; setPhaseName('תתכוננו');
    setNextInfo(computeNextInfo({ prep: true })); // preview the first phase
    setTransDur(0.32); setScale(SMALL);
    a.tick(); prepPulse();
    onRunningChange && onRunningChange(true, { phase: 'הכנה', roundsLeft: roundsLeft() });
    let n = prep;
    prepIntervalRef.current = setInterval(() => {
      n -= 1;
      if (n <= 0) {
        clearInterval(prepIntervalRef.current); prepIntervalRef.current = null;
        beginExercise(a);
      } else {
        setPrepLeft(n); a.tick(); prepPulse();
      }
    }, 1000);
  };

  const stop = () => {
    clearInterval(intervalRef.current); intervalRef.current = null;
    clearInterval(prepIntervalRef.current); prepIntervalRef.current = null;
    stopPaint(); clearSession(); clearBreathNotification();
    runningRef.current = false; setRunning(false);
    setMode('run'); setScale(SMALL);
    audioRef.current && audioRef.current.suspend();
    onRunningChange && onRunningChange(false);
  };

  // ── Resume an in-flight exercise (fix 1) ──────────────────────────────
  // Runs once on mount. If the durable session says an exercise was live,
  // rebuild the refs from the start timestamp and pick the phase clock up
  // exactly where it should be; if the whole exercise elapsed while away,
  // show the done screen instead. Also re-syncs on every foreground so a
  // background-throttled timer snaps to the correct phase (no slow catch-up,
  // no replayed sounds) and ends if it overran.
  useEffect(() => {
    if (boot?.kind === 'done') { clearSession(); onRunningChange && onRunningChange(false); return; }
    if (boot?.kind === 'resume') {
      const s = boot.session, loc = boot.loc, seq = s.seq, p = seq[loc.index];
      seqRef.current = seq; isInfRef.current = !!s.inf; totalMsRef.current = s.inf ? 0 : s.totalMs;
      exerciseEpochRef.current = s.startedAt; exerciseStartRef.current = performance.now() - boot.elapsed;
      idxRef.current = loc.index; roundRef.current = s.inf ? (loc.roundsCompleted + 1) : (p.round || 1);
      curRef.current = p; phaseStartRef.current = performance.now() - loc.phaseElapsedMs;
      runningRef.current = true;
      setNextInfo(computeNextInfo());
      const a = audioRef.current || (audioRef.current = createBreathAudio());
      a.resume().catch(() => {});
      report(true);
      intervalRef.current = setInterval(loop, 100);
      startPaint();
    }
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    const onVis = () => {
      // Leaving the app mid-exercise → post the ongoing notification.
      if (document.visibilityState === 'hidden') { if (runningRef.current) refreshNotif(); return; }
      // Back in the app → the notification's job is done.
      clearBreathNotification();
      if (!runningRef.current) return;
      const s = loadSession(); if (!s || !Array.isArray(s.seq) || !s.seq.length) return;
      const elapsed = Date.now() - s.startedAt;
      if (!s.inf && elapsed >= s.totalMs) { finish(); return; } // overran while away
      const loc = locate(s.seq, elapsed, !!s.inf), p = s.seq[loc.index];
      idxRef.current = loc.index; curRef.current = p;
      roundRef.current = s.inf ? (loc.roundsCompleted + 1) : (p.round || 1);
      exerciseEpochRef.current = s.startedAt;
      phaseStartRef.current = performance.now() - loc.phaseElapsedMs;
      exerciseStartRef.current = performance.now() - elapsed;
      setRoundCur(roundRef.current); setPhaseName(p.name); setPhaseKey(p.key);
      setNextInfo(computeNextInfo());
      setSecondsLeft(Math.max(0, Math.ceil(p.dur - loc.phaseElapsedMs / 1000)));
      const contracted = p.key === 'exhale' || p.key === 'holdEmpty';
      const remaining = Math.max(0.2, p.dur - loc.phaseElapsedMs / 1000);
      if (p.tone === 'up') { setTransDur(remaining); setScale(1); }
      else if (p.tone === 'down') { setTransDur(remaining); setScale(SMALL); }
      else { setTransDur(0.2); setScale(contracted ? SMALL : 1); }
      if (!s.inf) setFillFrac(clamp(elapsed / s.totalMs, 0, 1));
      startPaint();
      report(true);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
    // eslint-disable-next-line
  }, []);

  // Keeps running across focus switches; external stop from a bar; full
  // cleanup on unmount (leaving /clocks).
  useEffect(() => { if (stopSignal > 0 && runningRef.current) stop(); /* eslint-disable-next-line */ }, [stopSignal]);
  useEffect(() => () => { clearInterval(intervalRef.current); clearInterval(prepIntervalRef.current); stopPaint(); clearBreathNotification(); audioRef.current && audioRef.current.close(); /* eslint-disable-next-line */ }, []);

  const setPhase = (key, d) => setCfg((c) => ({ ...c, [key]: clamp((Number(c[key]) || 0) + d, 0, 20) }));
  const applyPreset = (k) => setCfg({ ...PRESETS[k].v });

  const stepBtn = (onClick, label) => (
    <button type="button" onClick={onClick} style={{
      width: 46, height: 46, borderRadius: 12, border: 'none', cursor: 'pointer',
      background: 'var(--breath-step-bg)', color: 'var(--breath-step-ink)', fontSize: 22, fontWeight: 800, flexShrink: 0,
    }}>{label}</button>
  );

  // ── Running / done full-screen ──
  if (running || done) {
    return (
      <div dir="rtl" style={{
        height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center',
        background: 'var(--breath-bg)', padding: '16px 16px calc(16px + env(safe-area-inset-bottom,0px))',
        fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
      }}>
        {/* Round line — only during the exercise (hidden in prep). Deep brand
            orange, independent of the (now green) exhale phase colour. */}
        <div style={{ fontSize: 'clamp(28px,5vh,40px)', fontWeight: 800, color: 'var(--brand-orange-deep)', minHeight: 44, lineHeight: 1.1 }}>
          {(!done && mode === 'run') ? `סבב ${roundCur} ${rounds === 'inf' ? '' : `מתוך ${rounds}`}` : ''}
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'clamp(14px,3vh,26px)', width: '100%' }}>
          {done ? (
            <>
              <div style={{ fontSize: 'clamp(48px,14vh,96px)' }}>🌬️</div>
              <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--breath-ink)' }}>כל הכבוד 🌬️</div>
              <button type="button" onClick={start} style={{
                minHeight: 54, padding: '0 34px', borderRadius: 16, border: 'none', cursor: 'pointer',
                background: 'var(--breath-cta)', color: 'var(--breath-card)', fontSize: 18, fontWeight: 900,
                boxShadow: 'var(--breath-cta-shadow)',
              }}>▶ שוב</button>
            </>
          ) : (() => {
            const bigNum = mode === 'prep' ? prepLeft : secondsLeft;
            const twoDigit = String(bigNum).length >= 2;
            // Sized to sit inside the MOST-contracted circle (scale SMALL);
            // 2-digit steps down so it never clips. Fixed — doesn't breathe.
            const numFont = twoDigit ? 'clamp(66px,14vh,104px)' : 'clamp(100px,21vh,158px)';
            const title = mode === 'prep' ? 'תתכוננו' : phaseName;
            // Per-phase title colour (earth & sea tokens, keyed by phase).
            // Prep keeps the inhale colour.
            const titleColor = mode === 'prep' ? 'var(--phase-inhale)' : (PHASE_COLOR[phaseKey] || 'var(--phase-inhale)');
            const contracted = phaseKey === 'exhale' || phaseKey === 'holdEmpty';
            const circleBg = (mode !== 'prep' && contracted) ? CIRCLE_DOWN : CIRCLE_UP;
            return (
              <>
                <div style={{ fontSize: 'clamp(40px,8vh,56px)', fontWeight: 900, color: titleColor, lineHeight: 1, transition: 'color 0.3s ease' }}>{title}</div>
                {/* Square = time-meter base. Rounded, slightly-darker cream. */}
                <div style={{
                  position: 'relative', width: 'clamp(220px,46vh,340px)', aspectRatio: '1 / 1',
                  background: SQUARE_BG, borderRadius: '16%',
                }}>
                  {/* Time frame — a conic-gradient border, masked to the square's
                      edge. Fills clockwise from the top-middle (conic 0deg) as
                      the exercise progresses; empty at the start, closed at the
                      end. Replaces the SVG stroke-dash meter, which WebKit drew
                      as static corner segments. Driven by fillFrac (rAF). */}
                  <div style={{
                    position: 'absolute', inset: 0, borderRadius: '16%', padding: FRAME_STROKE, pointerEvents: 'none',
                    background: `conic-gradient(from 0deg, ${FRAME_COLOR} 0turn ${fillFrac}turn, transparent ${fillFrac}turn 1turn)`,
                    WebkitMask: `linear-gradient(${MASK_FILL} 0 0) content-box, linear-gradient(${MASK_FILL} 0 0)`,
                    WebkitMaskComposite: 'xor',
                    mask: `linear-gradient(${MASK_FILL} 0 0) content-box, linear-gradient(${MASK_FILL} 0 0)`,
                    maskComposite: 'exclude',
                  }} />
                  {/* Breathing circle — inflates/deflates INSIDE the square.
                      Animation untouched (transform scale + transition). */}
                  <div style={{
                    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <div style={{
                      width: '82%', height: '82%', borderRadius: '50%',
                      background: circleBg,
                      boxShadow: '0 0 60px 12px var(--breath-circle-glow)',
                      transform: `scale(${scale})`,
                      transition: `transform ${transDur}s ease-in-out, background 0.4s ease`,
                    }} />
                  </div>
                  {/* Big number — fixed & centered over the whole square, so
                      it stays huge and stable regardless of the circle scale. */}
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                    <span style={{ fontSize: numFont, fontWeight: 900, color: 'var(--breath-number)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{bigNum}</span>
                  </div>
                </div>
              </>
            );
          })()}
        </div>

        {/* Next-phase preview — small, secondary, below the circle. Fixed
            height so the text updating on each phase change never shifts the
            layout. Hidden on the done screen. */}
        {!done && (
          <div style={{
            minHeight: 30, marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 'clamp(18px,2.8vh,22px)', fontWeight: 700, color: 'var(--brand-amber-soft)',
            lineHeight: 1, transition: 'color 0.3s ease', textAlign: 'center',
          }}>
            {nextInfo && (nextInfo.finishing
              ? <span>סיום מתקרב</span>
              : <span>
                  {'הבא: '}
                  <span style={{ color: PHASE_COLOR[nextInfo.key] || 'var(--brand-amber-soft)', fontWeight: 800 }}>{nextInfo.name}</span>
                  {` · ${nextInfo.dur} ${nextInfo.dur === 1 ? 'שנייה' : 'שניות'}`}
                </span>)}
          </div>
        )}

        <button type="button" onClick={done ? () => setDone(false) : stop} style={{
          width: '100%', minHeight: 50, borderRadius: 14, cursor: 'pointer',
          border: '1px solid var(--breath-stop-border)', background: 'var(--breath-card)', color: 'var(--breath-ink-soft)', fontSize: 16, fontWeight: 800,
        }}>{done ? 'סגור' : '⏹ עצור'}</button>
      </div>
    );
  }

  // ── Config full-screen ──
  const seqValid = (Number(cfg.inhale) || 0) > 0 && (Number(cfg.exhale) || 0) > 0;
  const roundsNum = typeof rounds === 'number' ? rounds : 10;           // number shown in the stepper
  const roundsIsCustom = typeof rounds === 'number' && !CHIP_VALUES.includes(rounds);
  const card = { background: 'var(--breath-card)', border: '1px solid var(--breath-border)', borderRadius: 16, padding: 12 };
  return (
    <div dir="rtl" style={{
      height: '100%', overflowY: 'auto', WebkitOverflowScrolling: 'touch', background: 'var(--breath-bg)',
      padding: '14px 14px calc(16px + env(safe-area-inset-bottom,0px))',
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 14,
      fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
    }}>
      {/* Steppers */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {STEPPERS.map((s) => (
          // Each time card wears its phase's tint background + full-colour
          // title; the +/- buttons and number keep the existing style.
          <div key={s.key} style={{ ...card, background: PHASE_TINT[s.key], display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: PHASE_COLOR[s.key] }}>{s.label}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {stepBtn(() => setPhase(s.key, -1), '−')}
              <div style={{ minWidth: 40, textAlign: 'center', fontSize: 30, fontWeight: 900, color: 'var(--breath-ink)' }}>{cfg[s.key]}</div>
              {stepBtn(() => setPhase(s.key, 1), '+')}
            </div>
          </div>
        ))}
      </div>

      {/* Presets */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {['box', 'calm'].map((k) => {
          const on = activePreset === k;
          return (
            <button key={k} type="button" onClick={() => applyPreset(k)} style={{
              flex: 1, minHeight: 40, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 800,
              border: on ? 'none' : '1px solid var(--breath-border)', background: on ? ORANGE : 'var(--breath-card)', color: on ? 'var(--breath-card)' : 'var(--breath-ink-soft)',
            }}>{PRESETS[k].label}</button>
          );
        })}
        <div style={{
          flex: 1, minHeight: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 800,
          border: activePreset === 'custom' ? 'none' : '1px solid var(--breath-border)',
          background: activePreset === 'custom' ? ORANGE : 'var(--breath-card)', color: activePreset === 'custom' ? 'var(--breath-card)' : 'var(--breath-label)',
        }}>מותאם אישית</div>
      </div>

      {/* Rounds — quick chips + a free 1-99 custom stepper */}
      <div style={{ ...card }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--breath-label)', marginBottom: 8, textAlign: 'center' }}>מספר סבבים</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {ROUND_OPTS.map((r) => {
            const on = rounds === r;
            return (
              <button key={String(r)} type="button" onClick={() => setRounds(r)} style={{
                flex: 1, minHeight: 44, borderRadius: 10, cursor: 'pointer', fontSize: 15, fontWeight: 800,
                border: on ? 'none' : '1px solid var(--breath-border)', background: on ? ORANGE : 'var(--breath-bg)', color: on ? 'var(--breath-card)' : 'var(--breath-ink-soft)',
              }}>{r === 'inf' ? 'אינסוף' : r}</button>
            );
          })}
        </div>
        {/* Custom stepper — tapping +/- switches selection to this number
            (chips deselect); tapping a chip above snaps back to its value. */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 12,
          paddingTop: 12, borderTop: '1px solid var(--breath-divider)',
        }}>
          {stepBtn(() => setRounds((r) => clamp((typeof r === 'number' ? r : 10) - 1, 1, 99)), '−')}
          <div style={{ minWidth: 64, textAlign: 'center' }}>
            <div style={{ fontSize: 30, fontWeight: 900, color: roundsIsCustom ? ORANGE : 'var(--breath-ink)', lineHeight: 1 }}>{roundsNum}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: roundsIsCustom ? ORANGE : 'var(--breath-label)', marginTop: 2 }}>מותאם אישית</div>
          </div>
          {stepBtn(() => setRounds((r) => clamp((typeof r === 'number' ? r : 10) + 1, 1, 99)), '+')}
        </div>
      </div>

      {/* Prep time — 0 / 3 / 5 / 10 seconds, saved between sessions */}
      <div style={{ ...card }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--breath-label)', marginBottom: 8, textAlign: 'center' }}>זמן הכנה (שניות)</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {PREP_OPTS.map((p) => {
            const on = prepSec === p;
            return (
              <button key={p} type="button" onClick={() => setPrepSec(p)} style={{
                flex: 1, minHeight: 44, borderRadius: 10, cursor: 'pointer', fontSize: 15, fontWeight: 800,
                border: on ? 'none' : '1px solid var(--breath-border)', background: on ? ORANGE : 'var(--breath-bg)', color: on ? 'var(--breath-card)' : 'var(--breath-ink-soft)',
              }}>{p === 0 ? 'ללא' : p}</button>
            );
          })}
        </div>
      </div>

      {/* Start */}
      <button type="button" onClick={start} disabled={!seqValid} style={{
        width: '100%', minHeight: 56, borderRadius: 16, border: 'none', cursor: seqValid ? 'pointer' : 'default',
        background: seqValid ? 'var(--breath-cta)' : 'var(--breath-disabled)', color: 'var(--breath-card)', fontSize: 20, fontWeight: 900,
        boxShadow: seqValid ? 'var(--breath-cta-shadow)' : 'none',
      }}>▶ התחל</button>
    </div>
  );
}
