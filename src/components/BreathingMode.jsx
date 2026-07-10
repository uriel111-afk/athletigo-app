import React, { useEffect, useRef, useState } from 'react';

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

function createBreathAudio() {
  let ctx = null;
  let master = null;
  const ensure = () => {
    if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; ctx = new AC(); }
    return ctx;
  };
  const bus = () => { const c = ensure(); if (!master) { master = c.createGain(); master.gain.value = 0.9; master.connect(c.destination); } return master; };
  return {
    resume: async () => {
      const c = ensure();
      if (c.state !== 'running') { try { await c.resume(); } catch {} }
      try { const b = c.createBuffer(1, 1, 22050); const s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0); } catch {}
    },
    // Soft sine that glides from→to over `dur` seconds, low gain with a
    // gentle fade-in/out — the breathing "voice".
    glide: (from, to, dur) => {
      const c = ensure(); const t = c.currentTime;
      const osc = c.createOscillator(); const g = c.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(from, t);
      osc.frequency.linearRampToValueAtTime(to, t + dur);
      const peak = 0.06, fade = Math.min(0.9, dur * 0.35);
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
      g.gain.linearRampToValueAtTime(0.045, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      osc.connect(g); g.connect(bus()); osc.start(t); osc.stop(t + 0.6);
    },
    endChimes: () => {
      const c = ensure(); const t0 = c.currentTime;
      [523, 415, 330].forEach((f, i) => {
        const t = t0 + i * 0.55;
        const osc = c.createOscillator(); const g = c.createGain();
        osc.type = 'sine'; osc.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.07, t + 0.04);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
        osc.connect(g); g.connect(bus()); osc.start(t); osc.stop(t + 0.95);
      });
    },
    suspend: () => { try { ctx && ctx.state === 'running' && ctx.suspend(); } catch {} },
    close: () => { try { ctx && ctx.close(); } catch {}; ctx = null; },
  };
}

const PRESETS = {
  box:  { label: 'קופסה 4-4-4-4', v: { inhale: 4, hold: 4, exhale: 4, holdEmpty: 4 } },
  calm: { label: 'הרגעה 4-7-8',   v: { inhale: 4, hold: 7, exhale: 8, holdEmpty: 0 } },
};
const ROUND_OPTS = [5, 10, 15, 'inf'];

export default function BreathingMode({ active, onRunningChange, stopSignal = 0 }) { // eslint-disable-line no-unused-vars
  const [cfg, setCfg] = useState({ inhale: 4, hold: 4, exhale: 4, holdEmpty: 4 });
  const [rounds, setRounds] = useState(10);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [phaseName, setPhaseName] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [roundCur, setRoundCur] = useState(1);
  const [scale, setScale] = useState(SMALL);
  const [transDur, setTransDur] = useState(0.4);

  const audioRef = useRef(null);
  const intervalRef = useRef(null);
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
    audioRef.current && audioRef.current.endChimes();
    onRunningChange && onRunningChange(false);
  };

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
    if (elapsed >= p.dur) nextPhase();
  };

  const start = async () => {
    const seq = buildSeq();
    if (!seq.length) return;
    const a = audioRef.current || (audioRef.current = createBreathAudio());
    await a.resume();
    seqRef.current = seq; idxRef.current = 0; roundRef.current = 1;
    setRoundCur(1); setDone(false);
    runningRef.current = true; setRunning(true);
    enterPhase(seq[0]);
    intervalRef.current = setInterval(loop, 150);
  };

  const stop = () => {
    clearInterval(intervalRef.current); intervalRef.current = null;
    runningRef.current = false; setRunning(false);
    setScale(SMALL);
    audioRef.current && audioRef.current.suspend();
    onRunningChange && onRunningChange(false);
  };

  // Keeps running across focus switches; external stop from a bar; full
  // cleanup on unmount (leaving /clocks).
  useEffect(() => { if (stopSignal > 0 && runningRef.current) stop(); /* eslint-disable-next-line */ }, [stopSignal]);
  useEffect(() => () => { if (runningRef.current) { clearInterval(intervalRef.current); } audioRef.current && audioRef.current.close(); /* eslint-disable-next-line */ }, []);

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
        <div style={{ fontSize: 15, fontWeight: 800, color: '#8A6A52', minHeight: 22 }}>
          {done ? '' : `סבב ${roundCur} ${rounds === 'inf' ? '' : `מתוך ${rounds}`}`}
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, width: '100%' }}>
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
          ) : (
            <>
              <div style={{ fontSize: 24, fontWeight: 900, color: ORANGE }}>{phaseName}</div>
              <div style={{
                width: 'clamp(200px,44vh,320px)', height: 'clamp(200px,44vh,320px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{
                  width: '100%', height: '100%', borderRadius: '50%',
                  background: 'radial-gradient(circle at 50% 40%, #FFC79E, #FF8A42 70%, #FF6F20)',
                  boxShadow: '0 0 60px 12px rgba(255,138,66,0.35)',
                  transform: `scale(${scale})`,
                  transition: `transform ${transDur}s ease-in-out`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontSize: 'clamp(40px,10vh,64px)', fontWeight: 900, color: '#fff' }}>{secondsLeft}</span>
                </div>
              </div>
            </>
          )}
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

      {/* Rounds */}
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
