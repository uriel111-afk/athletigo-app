import React, { useEffect, useRef, useState } from 'react';
import { loadSoundVolume, saveSoundVolume, SOUND_VOL_MAX } from '@/lib/soundVolume';

// ── Breathing trainer ("נשימות") ───────────────────────────────────
// A calm 4-phase cycle (inhale / hold / exhale / hold-empty). The
// CIRCLE animation is pure CSS (transform scale + transition-duration =
// phase duration) driven by phase-change state, NOT per-frame JS. Audio
// uses its own AudioContext (never touches the metronome/timer engines):
// soft sine glides up on inhale, down on exhale, silence on holds, a
// gentle chime on each transition, three descending chimes at the end.
// Integrates with the parallel-clocks system (floating bar + wake-lock).
// ────────────────────────────────────────────────────────────────────

const ORANGE = '#FF6F20';
const SMALL = 0.42; // contracted circle scale
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

const PHASE_DEFS = [
  { key: 'inhale',    name: 'שאיפה', tone: 'up' },
  { key: 'hold',      name: 'החזק',  tone: 'hold' },
  { key: 'exhale',    name: 'נשיפה', tone: 'down' },
  { key: 'holdEmpty', name: 'החזק',  tone: 'hold' },
];
const STEPPERS = [
  { key: 'inhale',    label: 'שאיפה' },
  { key: 'hold',      label: 'החזקה' },
  { key: 'exhale',    label: 'נשיפה' },
  { key: 'holdEmpty', label: 'החזקה ריקה' },
];

function createBreathAudio(initialGain = 1) {
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
    setGain: (v) => { vol = Math.max(0, Math.min(SOUND_VOL_MAX, v)); if (master) { try { master.gain.setTargetAtTime(vol, ensure().currentTime, 0.02); } catch { master.gain.value = vol; } } },
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

// Rounded-square border path (viewBox 0 0 100 100), starting at the
// TOP-MIDDLE and running clockwise, pathLength=100 so stroke-dashoffset
// is a simple 0..100 percentage. Used for the depleting time meter.
const METER_PATH = 'M50 3 H81 A16 16 0 0 1 97 19 V81 A16 16 0 0 1 81 97 H19 A16 16 0 0 1 3 81 V19 A16 16 0 0 1 19 3 H50';
const SQUARE_BG = '#F3E7D3'; // slightly darker than the #FFF9F0 page

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

export default function BreathingMode({ active, onRunningChange, stopSignal = 0 }) { // eslint-disable-line no-unused-vars
  const [cfg, setCfg] = useState({ inhale: 4, hold: 4, exhale: 4, holdEmpty: 4 });
  const [rounds, setRounds] = useState(loadRounds);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [phaseName, setPhaseName] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [roundCur, setRoundCur] = useState(1);
  const [scale, setScale] = useState(SMALL);
  const [transDur, setTransDur] = useState(0.4);
  const [mode, setMode] = useState('run');    // 'prep' | 'run'
  const [prepLeft, setPrepLeft] = useState(0); // 3,2,1 during prep
  const [meterFrac, setMeterFrac] = useState(1); // 1 = full ring, 0 = empty
  const [volume, setVolume] = useState(loadSoundVolume); // 0..3, shared pref

  const audioRef = useRef(null);
  const intervalRef = useRef(null);
  const prepIntervalRef = useRef(null);
  const exerciseStartRef = useRef(0);
  const totalMsRef = useRef(0);
  const seqRef = useRef([]);
  const idxRef = useRef(0);
  const roundRef = useRef(1);
  const phaseStartRef = useRef(0);
  const curRef = useRef(null);
  const runningRef = useRef(false);
  const cfgRef = useRef(cfg);
  const roundsRef = useRef(rounds);
  // Push the shared volume into the live audio engine whenever it changes.
  useEffect(() => { saveSoundVolume(volume); if (audioRef.current) audioRef.current.setGain(volume); }, [volume]);
  useEffect(() => { cfgRef.current = cfg; }, [cfg]);
  useEffect(() => { roundsRef.current = rounds; }, [rounds]);
  // Persist the chosen rounds (value encodes chip/custom/infinity mode).
  useEffect(() => { try { localStorage.setItem(ROUNDS_KEY, String(rounds)); } catch {} }, [rounds]);

  const activePreset = (() => {
    for (const k of Object.keys(PRESETS)) {
      const v = PRESETS[k].v;
      if (v.inhale === cfg.inhale && v.hold === cfg.hold && v.exhale === cfg.exhale && v.holdEmpty === cfg.holdEmpty) return k;
    }
    return 'custom';
  })();

  const roundsLeft = () => (roundsRef.current === 'inf' ? '∞' : Math.max(0, roundsRef.current - roundRef.current + 1));
  const report = (r) => onRunningChange && onRunningChange(r, { phase: curRef.current?.name || '', roundsLeft: roundsLeft() });

  const buildSeq = () => {
    const c = cfgRef.current;
    return PHASE_DEFS.map((p) => ({ ...p, dur: Number(c[p.key]) || 0 })).filter((p) => p.dur > 0);
  };

  const enterPhase = (p) => {
    curRef.current = p;
    phaseStartRef.current = performance.now();
    setPhaseName(p.name); setSecondsLeft(p.dur);
    if (p.tone === 'up') { setTransDur(p.dur); setScale(1); }
    else if (p.tone === 'down') { setTransDur(p.dur); setScale(SMALL); }
    // holds keep the current scale (no transform change → no motion)
    const a = audioRef.current;
    a.chime(p.tone === 'up' ? 560 : p.tone === 'down' ? 430 : 500);
    if (p.tone === 'up') a.glide(220, 330, p.dur);
    else if (p.tone === 'down') a.glide(330, 220, p.dur);
    report(true);
  };

  const finish = () => {
    clearInterval(intervalRef.current); intervalRef.current = null;
    runningRef.current = false; setRunning(false); setDone(true);
    setMeterFrac(0);
    audioRef.current && audioRef.current.endChimes();
    onRunningChange && onRunningChange(false);
  };

  const cycleMs = (seq) => seq.reduce((s, p) => s + p.dur, 0) * 1000;

  const nextPhase = () => {
    const seq = seqRef.current;
    let idx = idxRef.current + 1;
    if (idx >= seq.length) {
      idx = 0;
      const nr = roundRef.current + 1;
      if (roundsRef.current !== 'inf' && nr > roundsRef.current) { finish(); return; }
      roundRef.current = nr; setRoundCur(nr);
    }
    idxRef.current = idx;
    enterPhase(seq[idx]);
  };

  const loop = () => {
    const p = curRef.current; if (!p) return;
    const elapsed = (performance.now() - phaseStartRef.current) / 1000;
    setSecondsLeft(Math.max(0, Math.ceil(p.dur - elapsed)));
    // Time meter — deplete over the WHOLE exercise (all rounds). For
    // 'inf' (totalMs = 0) the ring stays full. CSS transition on the
    // dashoffset smooths the 100ms steps into a continuous drain.
    if (totalMsRef.current > 0) {
      const te = performance.now() - exerciseStartRef.current;
      setMeterFrac(clamp(1 - te / totalMsRef.current, 0, 1));
    }
    if (elapsed >= p.dur) nextPhase();
  };

  // Gentle one-beat pulse of the circle during the prep countdown.
  const prepPulse = () => {
    setTransDur(0.32); setScale(0.6);
    setTimeout(() => { if (runningRef.current) { setTransDur(0.32); setScale(0.5); } }, 340);
  };

  // The actual breathing begins (after prep): distinct cue, start the
  // meter + phase loop.
  const beginExercise = (a) => {
    setMode('run');
    a.startCue();
    exerciseStartRef.current = performance.now();
    totalMsRef.current = roundsRef.current === 'inf' ? 0 : cycleMs(seqRef.current) * roundsRef.current;
    setMeterFrac(1);
    enterPhase(seqRef.current[0]);
    intervalRef.current = setInterval(loop, 100);
  };

  const start = async () => {
    const seq = buildSeq();
    if (!seq.length) return;
    const a = audioRef.current || (audioRef.current = createBreathAudio(volume));
    a.setGain(volume);
    await a.resume();
    seqRef.current = seq; idxRef.current = 0; roundRef.current = 1;
    setRoundCur(1); setDone(false);
    runningRef.current = true; setRunning(true);
    // ── Prep: 3-2-1 before the first inhale ──
    setMode('prep'); setPrepLeft(3); setMeterFrac(1);
    curRef.current = null; setPhaseName('תתכוננו');
    setTransDur(0.32); setScale(0.5);
    a.tick(); prepPulse();
    onRunningChange && onRunningChange(true, { phase: 'הכנה', roundsLeft: roundsLeft() });
    let n = 3;
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
    runningRef.current = false; setRunning(false);
    setMode('run'); setScale(SMALL);
    audioRef.current && audioRef.current.suspend();
    onRunningChange && onRunningChange(false);
  };

  // Keeps running across focus switches; external stop from a bar; full
  // cleanup on unmount (leaving /clocks).
  useEffect(() => { if (stopSignal > 0 && runningRef.current) stop(); /* eslint-disable-next-line */ }, [stopSignal]);
  useEffect(() => () => { clearInterval(intervalRef.current); clearInterval(prepIntervalRef.current); audioRef.current && audioRef.current.close(); /* eslint-disable-next-line */ }, []);

  const setPhase = (key, d) => setCfg((c) => ({ ...c, [key]: clamp((Number(c[key]) || 0) + d, 0, 20) }));
  const applyPreset = (k) => setCfg({ ...PRESETS[k].v });

  const stepBtn = (onClick, label) => (
    <button type="button" onClick={onClick} style={{
      width: 46, height: 46, borderRadius: 12, border: 'none', cursor: 'pointer',
      background: '#FFE3D1', color: '#C24A0A', fontSize: 22, fontWeight: 800, flexShrink: 0,
    }}>{label}</button>
  );

  // ── Running / done full-screen ──
  if (running || done) {
    return (
      <div dir="rtl" style={{
        height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center',
        background: '#FFF9F0', padding: '16px 16px calc(16px + env(safe-area-inset-bottom,0px))',
        fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
      }}>
        {/* Round line — only during the exercise (hidden in prep). */}
        <div style={{ fontSize: 'clamp(20px,3.4vh,28px)', fontWeight: 800, color: '#8A6A52', minHeight: 30 }}>
          {(!done && mode === 'run') ? `סבב ${roundCur} ${rounds === 'inf' ? '' : `מתוך ${rounds}`}` : ''}
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'clamp(14px,3vh,26px)', width: '100%' }}>
          {done ? (
            <>
              <div style={{ fontSize: 'clamp(48px,14vh,96px)' }}>🌬️</div>
              <div style={{ fontSize: 26, fontWeight: 900, color: '#1a1a1a' }}>כל הכבוד 🌬️</div>
              <button type="button" onClick={start} style={{
                minHeight: 54, padding: '0 34px', borderRadius: 16, border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg,#FF6F20,#FF8A42)', color: '#fff', fontSize: 18, fontWeight: 900,
                boxShadow: '0 8px 22px rgba(255,111,32,0.45)',
              }}>▶ שוב</button>
            </>
          ) : (() => {
            const bigNum = mode === 'prep' ? prepLeft : secondsLeft;
            const twoDigit = String(bigNum).length >= 2;
            const numFont = twoDigit ? 'clamp(78px,20vh,132px)' : 'clamp(110px,29vh,186px)';
            const title = mode === 'prep' ? 'תתכוננו' : phaseName;
            return (
              <>
                <div style={{ fontSize: 'clamp(32px,6.5vh,48px)', fontWeight: 900, color: ORANGE, lineHeight: 1 }}>{title}</div>
                {/* Square = time-meter base. Rounded, slightly-darker cream. */}
                <div style={{
                  position: 'relative', width: 'clamp(220px,46vh,340px)', aspectRatio: '1 / 1',
                  background: SQUARE_BG, borderRadius: '16%',
                }}>
                  {/* Depleting time meter on the square border (fixed size). */}
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                    <path d={METER_PATH} pathLength="100" fill="none" stroke="#FFC9A6" strokeWidth="2.5"
                      vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round"
                      strokeDasharray="100" strokeDashoffset={(1 - meterFrac) * 100}
                      style={{ transition: 'stroke-dashoffset 0.15s linear' }} />
                  </svg>
                  {/* Breathing circle — inflates/deflates INSIDE the square.
                      Animation untouched (transform scale + transition). */}
                  <div style={{
                    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <div style={{
                      width: '82%', height: '82%', borderRadius: '50%',
                      background: 'radial-gradient(circle at 50% 40%, #FFC79E, #FF8A42 70%, #FF6F20)',
                      boxShadow: '0 0 60px 12px rgba(255,138,66,0.35)',
                      transform: `scale(${scale})`,
                      transition: `transform ${transDur}s ease-in-out`,
                    }} />
                  </div>
                  {/* Big number — fixed & centered over the whole square, so
                      it stays huge and stable regardless of the circle scale. */}
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                    <span style={{ fontSize: numFont, fontWeight: 900, color: '#5A2A08', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{bigNum}</span>
                  </div>
                </div>
              </>
            );
          })()}
        </div>

        <button type="button" onClick={done ? () => setDone(false) : stop} style={{
          width: '100%', minHeight: 50, borderRadius: 14, cursor: 'pointer',
          border: '1px solid #E0C9A8', background: '#fff', color: '#5C4A3A', fontSize: 16, fontWeight: 800,
        }}>{done ? 'סגור' : '⏹ עצור'}</button>
      </div>
    );
  }

  // ── Config full-screen ──
  const seqValid = (Number(cfg.inhale) || 0) > 0 && (Number(cfg.exhale) || 0) > 0;
  const roundsNum = typeof rounds === 'number' ? rounds : 10;           // number shown in the stepper
  const roundsIsCustom = typeof rounds === 'number' && !CHIP_VALUES.includes(rounds);
  const card = { background: '#fff', border: '1px solid #F0E4D0', borderRadius: 16, padding: 12 };
  return (
    <div dir="rtl" style={{
      height: '100%', overflowY: 'auto', WebkitOverflowScrolling: 'touch', background: '#FFF9F0',
      padding: '14px 14px calc(16px + env(safe-area-inset-bottom,0px))',
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 14,
      fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
    }}>
      {/* Steppers */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {STEPPERS.map((s) => (
          <div key={s.key} style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#5C4A3A' }}>{s.label}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {stepBtn(() => setPhase(s.key, -1), '−')}
              <div style={{ minWidth: 40, textAlign: 'center', fontSize: 30, fontWeight: 900, color: '#1a1a1a' }}>{cfg[s.key]}</div>
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
              border: on ? 'none' : '1px solid #F0E4D0', background: on ? ORANGE : '#fff', color: on ? '#fff' : '#5C4A3A',
            }}>{PRESETS[k].label}</button>
          );
        })}
        <div style={{
          flex: 1, minHeight: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 800,
          border: activePreset === 'custom' ? 'none' : '1px solid #F0E4D0',
          background: activePreset === 'custom' ? ORANGE : '#fff', color: activePreset === 'custom' ? '#fff' : '#8A6A52',
        }}>מותאם אישית</div>
      </div>

      {/* Rounds — quick chips + a free 1-99 custom stepper */}
      <div style={{ ...card }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#8A6A52', marginBottom: 8, textAlign: 'center' }}>מספר סבבים</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {ROUND_OPTS.map((r) => {
            const on = rounds === r;
            return (
              <button key={String(r)} type="button" onClick={() => setRounds(r)} style={{
                flex: 1, minHeight: 44, borderRadius: 10, cursor: 'pointer', fontSize: 15, fontWeight: 800,
                border: on ? 'none' : '1px solid #F0E4D0', background: on ? ORANGE : '#FFF9F0', color: on ? '#fff' : '#5C4A3A',
              }}>{r === 'inf' ? 'אינסוף' : r}</button>
            );
          })}
        </div>
        {/* Custom stepper — tapping +/- switches selection to this number
            (chips deselect); tapping a chip above snaps back to its value. */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 12,
          paddingTop: 12, borderTop: '1px solid #F5ECE0',
        }}>
          {stepBtn(() => setRounds((r) => clamp((typeof r === 'number' ? r : 10) - 1, 1, 99)), '−')}
          <div style={{ minWidth: 64, textAlign: 'center' }}>
            <div style={{ fontSize: 30, fontWeight: 900, color: roundsIsCustom ? ORANGE : '#1a1a1a', lineHeight: 1 }}>{roundsNum}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: roundsIsCustom ? ORANGE : '#8A6A52', marginTop: 2 }}>מותאם אישית</div>
          </div>
          {stepBtn(() => setRounds((r) => clamp((typeof r === 'number' ? r : 10) + 1, 1, 99)), '+')}
        </div>
      </div>

      {/* Sound volume — shared with the metronome, saved between sessions */}
      <div style={{ ...card }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: '#8A6A52' }}>🔊 עוצמת סאונד</span>
          <span style={{ fontSize: 12, fontWeight: 800, color: ORANGE }}>{Math.round(volume * 100)}%</span>
        </div>
        <input type="range" min={0} max={SOUND_VOL_MAX} step={0.05} value={volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          aria-label="עוצמת סאונד" style={{ width: '100%', accentColor: ORANGE, height: 28 }} />
      </div>

      {/* Start */}
      <button type="button" onClick={start} disabled={!seqValid} style={{
        width: '100%', minHeight: 56, borderRadius: 16, border: 'none', cursor: seqValid ? 'pointer' : 'default',
        background: seqValid ? 'linear-gradient(135deg,#FF6F20,#FF8A42)' : '#E7D9C7', color: '#fff', fontSize: 20, fontWeight: 900,
        boxShadow: seqValid ? '0 8px 22px rgba(255,111,32,0.45)' : 'none',
      }}>▶ התחל</button>
    </div>
  );
}
