import React, { useEffect, useRef, useState } from 'react';

// Fixed output gain — no user slider. The DynamicsCompressor after the
// gain keeps it distortion-free; the phone's media (STREAM_MUSIC) volume
// keys are the only user control.
const FIXED_GAIN = 2.2;

// ── Metronome mode ─────────────────────────────────────────────────
// Web Audio lookahead scheduler (Chris Wilson "two clocks" pattern):
// a setInterval only DECIDES which clicks to schedule; the clicks
// themselves are placed on the AudioContext timeline so timing never
// drifts (holds at 500 BPM ≈ 8.3 clicks/sec). Visuals are driven off a
// rAF loop reading the same schedule, so dropped frames never affect
// audio. Above 300 effective BPM the LEDs fall back to a steady glow.
// ────────────────────────────────────────────────────────────────────

const MIN_BPM = 40;
const MAX_BPM = 500;
const MAX_LEDS = 4;
const LOOKAHEAD_MS = 25;      // scheduler tick
const SCHEDULE_AHEAD = 0.12;  // seconds scheduled ahead of currentTime
const STEADY_ABOVE = 300;     // eff BPM above which visuals go steady

const ORANGE = '#FF6F20';
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

function paceLabel(bpm) {
  if (bpm < 80) return 'איטי';
  if (bpm < 140) return 'בינוני';
  if (bpm < 220) return 'מהיר';
  if (bpm < 340) return 'מהיר מאוד';
  return 'טורבו';
}

// Self-contained Web Audio click engine (own AudioContext so we never
// touch the existing timers' sound module).
function createEngine(initialGain = FIXED_GAIN) {
  let ctx = null;
  let master = null;  // user-volume GainNode (0..3)
  let comp = null;    // limiter after the gain — no distortion at high boost
  let vol = initialGain;
  const ensure = () => {
    if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; ctx = new AC(); }
    return ctx;
  };
  // Signal path: click → master(gain=vol) → compressor → destination.
  // Only the audio graph — the lookahead scheduler is untouched, so
  // timing stays jitter-free.
  const bus = () => {
    const c = ensure();
    if (!master) {
      master = c.createGain(); master.gain.value = vol;
      comp = c.createDynamicsCompressor();
      comp.threshold.setValueAtTime(-6, c.currentTime);
      comp.knee.setValueAtTime(10, c.currentTime);
      comp.ratio.setValueAtTime(10, c.currentTime);
      comp.attack.setValueAtTime(0.001, c.currentTime);
      comp.release.setValueAtTime(0.12, c.currentTime);
      master.connect(comp); comp.connect(c.destination);
    }
    return master;
  };
  return {
    now: () => ensure().currentTime,
    setGain: (v) => { vol = Math.max(0, Math.min(3, v)); if (master) { try { master.gain.setTargetAtTime(vol, ensure().currentTime, 0.02); } catch { master.gain.value = vol; } } },
    resume: async () => {
      const c = ensure();
      if (c.state !== 'running') { try { await c.resume(); } catch {} }
      bus(); // build the master/compressor inside the gesture
      // iOS unlock — play a 1-sample silent buffer inside the gesture.
      try {
        const b = c.createBuffer(1, 1, 22050);
        const s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0);
      } catch {}
    },
    click: (time, accent) => {
      const c = ensure();
      const osc = c.createOscillator();
      const gain = c.createGain();
      // Sharper, higher click carries further across a room. Accent even
      // higher. Short exponential decay stays crisp; the master limiter
      // absorbs peaks so higher volume never distorts.
      osc.type = 'square';
      osc.frequency.value = accent ? 2000 : 1400;
      const dur = 0.03;
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.linearRampToValueAtTime(accent ? 0.95 : 0.8, time + 0.001);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
      osc.connect(gain); gain.connect(bus());
      osc.start(time); osc.stop(time + dur + 0.02);
    },
    suspend: () => { try { ctx && ctx.state === 'running' && ctx.suspend(); } catch {} },
    close: () => { try { ctx && ctx.close(); } catch {}; ctx = null; },
  };
}

export default function MetronomeMode({ active, onRunningChange, stopSignal = 0 }) { // eslint-disable-line no-unused-vars
  const [bpm, setBpm] = useState(120);
  const [running, setRunning] = useState(false);
  const [beatsPerBar, setBeatsPerBar] = useState(4);
  const [percent, setPercent] = useState(100);
  const [currentBeat, setCurrentBeat] = useState(-1);

  const effectiveBpm = Math.max(1, Math.round(bpm * percent / 100));
  const steady = running && effectiveBpm > STEADY_ABOVE;

  // Live refs so the scheduler reads current values without re-arming.
  const bpmRef = useRef(bpm);
  const percentRef = useRef(percent);
  const bpbRef = useRef(beatsPerBar);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { percentRef.current = percent; }, [percent]);
  useEffect(() => { bpbRef.current = beatsPerBar; }, [beatsPerBar]);

  const engineRef = useRef(null);
  const schedIdRef = useRef(null);
  const rafRef = useRef(null);
  const nextNoteRef = useRef(0);
  const beatInBarRef = useRef(0);
  const queueRef = useRef([]);
  const tapsRef = useRef([]);
  const runningRef = useRef(false);

  const stop = () => {
    runningRef.current = false;
    if (schedIdRef.current) { clearInterval(schedIdRef.current); schedIdRef.current = null; }
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    queueRef.current = [];
    setRunning(false);
    setCurrentBeat(-1);
    engineRef.current && engineRef.current.suspend();
    onRunningChange && onRunningChange(false);
  };

  const scheduler = () => {
    const eng = engineRef.current;
    if (!eng) return;
    while (nextNoteRef.current < eng.now() + SCHEDULE_AHEAD) {
      const beat = beatInBarRef.current;
      const accent = beat === 0;
      eng.click(nextNoteRef.current, accent);
      queueRef.current.push({ beat, time: nextNoteRef.current });
      const eff = Math.max(1, Math.round(bpmRef.current * percentRef.current / 100));
      nextNoteRef.current += 60 / eff;
      beatInBarRef.current = (beat + 1) % Math.max(1, bpbRef.current);
    }
  };

  const drawLoop = () => {
    const eng = engineRef.current;
    if (!eng) return;
    const t = eng.now();
    const q = queueRef.current;
    let show = null;
    while (q.length && q[0].time <= t) { show = q[0].beat; q.shift(); }
    // Above the steady threshold, only pulse the accent (beat 0) to
    // spare React churn; audio keeps ticking at full rate.
    if (show != null) {
      const eff = Math.max(1, Math.round(bpmRef.current * percentRef.current / 100));
      if (eff <= STEADY_ABOVE || show === 0) setCurrentBeat(show);
    }
    rafRef.current = requestAnimationFrame(drawLoop);
  };

  const start = async () => {
    const eng = engineRef.current || (engineRef.current = createEngine());
    await eng.resume();
    setPercent(100); percentRef.current = 100; // fresh start resets to 100%
    nextNoteRef.current = eng.now() + 0.1;
    beatInBarRef.current = 0;
    queueRef.current = [];
    setCurrentBeat(-1);
    runningRef.current = true;
    setRunning(true);
    onRunningChange && onRunningChange(true, effectiveBpm);
    schedIdRef.current = setInterval(scheduler, LOOKAHEAD_MS);
    rafRef.current = requestAnimationFrame(drawLoop);
  };

  const toggle = () => { runningRef.current ? stop() : start(); };

  // Keeps running across focus switches (parallel-clocks). Reports live
  // BPM so the floating bar stays current; full cleanup on unmount
  // (leaving /clocks stops it).
  useEffect(() => { if (runningRef.current) onRunningChange && onRunningChange(true, effectiveBpm); /* eslint-disable-next-line */ }, [effectiveBpm]);
  // External stop request (from a floating bar).
  useEffect(() => { if (stopSignal > 0 && runningRef.current) stop(); /* eslint-disable-next-line */ }, [stopSignal]);
  useEffect(() => () => { if (runningRef.current) stop(); engineRef.current && engineRef.current.close(); /* eslint-disable-next-line */ }, []);

  const step = (d) => setBpm((v) => clamp(v + d, MIN_BPM, MAX_BPM));

  // ── Drag-to-set BPM ──────────────────────────────────────────────
  // Swipe UP on the wheel to increase, DOWN to decrease (~8px = 1 BPM,
  // live). On release, a short decelerating glide adds up to ~40 BPM of
  // momentum. Pointer events cover mouse + touch; touch-action:none on
  // the wheel keeps the page from scrolling under the gesture. bpmRef is
  // read at grab/release so the scheduler retimes smoothly mid-run.
  const PX_PER_BPM = 8;
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ active: false, startY: 0, startBpm: 120, lastY: 0, lastT: 0, v: 0 });
  const momentumRef = useRef(null);
  const stopMomentum = () => { if (momentumRef.current) { cancelAnimationFrame(momentumRef.current); momentumRef.current = null; } };

  const onWheelDown = (e) => {
    stopMomentum();
    const d = dragRef.current;
    d.active = true; d.startY = e.clientY; d.startBpm = bpmRef.current;
    d.lastY = e.clientY; d.lastT = performance.now(); d.v = 0;
    setDragging(true);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
  };
  const onWheelMove = (e) => {
    const d = dragRef.current; if (!d.active) return;
    const dy = d.startY - e.clientY;                 // up = positive
    setBpm(clamp(d.startBpm + Math.round(dy / PX_PER_BPM), MIN_BPM, MAX_BPM));
    const now = performance.now(), dt = now - d.lastT;
    if (dt > 0) { d.v = (d.lastY - e.clientY) / dt; d.lastY = e.clientY; d.lastT = now; } // px/ms, up = +
  };
  const onWheelUp = () => {
    const d = dragRef.current; if (!d.active) return;
    d.active = false; setDragging(false);
    let vb = d.v / PX_PER_BPM;                        // BPM per ms
    if (Math.abs(vb) < 0.003) return;                // too slow → no glide
    const base = bpmRef.current;
    let acc = 0, travelled = 0, last = performance.now();
    const MAX_EXTRA = 40;
    const glide = () => {
      const now = performance.now(), dt = Math.min(48, now - last); last = now;
      let inc = vb * dt;
      if (travelled + Math.abs(inc) >= MAX_EXTRA) inc = Math.sign(inc) * (MAX_EXTRA - travelled);
      acc += inc; travelled += Math.abs(inc);
      setBpm(clamp(Math.round(base + acc), MIN_BPM, MAX_BPM));
      vb *= Math.pow(0.94, dt / 16);                 // ease-out decay
      if (travelled >= MAX_EXTRA || Math.abs(vb) < 0.0015) { momentumRef.current = null; return; }
      momentumRef.current = requestAnimationFrame(glide);
    };
    momentumRef.current = requestAnimationFrame(glide);
  };
  useEffect(() => () => stopMomentum(), []);

  const tap = () => {
    const t = performance.now();
    tapsRef.current = tapsRef.current.filter((x) => t - x < 3000);
    tapsRef.current.push(t);
    const arr = tapsRef.current;
    if (arr.length >= 2) {
      let sum = 0;
      for (let i = 1; i < arr.length; i++) sum += arr[i] - arr[i - 1];
      const avg = sum / (arr.length - 1);
      if (avg > 0) setBpm(clamp(Math.round(60000 / avg), MIN_BPM, MAX_BPM));
    }
  };

  // ── LED styling ──
  const ledStyle = (i) => {
    const beyond = i >= beatsPerBar;
    const base = {
      width: 'clamp(28px, 4.6vh, 40px)', height: 'clamp(28px, 4.6vh, 40px)', borderRadius: '50%', flexShrink: 0,
      transition: 'transform .08s ease, background .06s, box-shadow .06s',
      border: '2px solid #F0D9C6', background: '#FFF4ED', transform: 'scale(1)',
    };
    if (beyond) return { ...base, opacity: 0.28, border: '2px solid #EFE6DC' };
    const lit = steady ? (i === 0 ? 'accent' : 'on') : (i === currentBeat ? (i === 0 ? 'accent' : 'on') : 'off');
    if (lit === 'accent') return { ...base, background: ORANGE, border: `2px solid ${ORANGE}`, boxShadow: '0 0 14px 3px rgba(255,111,32,0.55)', transform: steady ? 'scale(1.06)' : 'scale(1.18)' };
    if (lit === 'on') return { ...base, background: '#FFB380', border: '2px solid #FFB380', boxShadow: '0 0 10px 2px rgba(255,179,128,0.5)', transform: steady ? 'scale(1.04)' : 'scale(1.12)' };
    return base;
  };

  const orderStep = { // step-button visuals
    warm: { background: '#FFE3D1', color: '#C24A0A' },
    quiet: { background: '#FFF4ED', color: '#8A6A52', border: '1px solid #F0D9C6' },
  };
  const stepBtn = (label, onClick, kind) => (
    <button type="button" onClick={onClick} style={{
      width: 56, height: 44, borderRadius: 12, cursor: 'pointer', border: 'none',
      fontSize: 17, fontWeight: 800, ...(kind === 'warm' ? orderStep.warm : orderStep.quiet),
    }}>{label}</button>
  );

  const card = { background: '#FFFFFF', border: '1px solid #F0E4D0', borderRadius: 16, padding: 12 };

  return (
    <div dir="rtl" style={{
      height: '100%', overflowY: 'auto', WebkitOverflowScrolling: 'touch',
      background: '#FFF9F0', padding: '14px 14px calc(18px + env(safe-area-inset-bottom,0px))',
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 12,
      fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
    }}>
      {/* 1. BEAT LEDS */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 14 }}>
        {Array.from({ length: MAX_LEDS }).map((_, i) => <div key={i} style={ledStyle(i)} />)}
      </div>

      {/* 2. BPM WHEEL — symmetric step columns both sides */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {stepBtn('+1', () => step(1), 'warm')}
          {stepBtn('+5', () => step(5), 'warm')}
        </div>
        <div
          onPointerDown={onWheelDown}
          onPointerMove={onWheelMove}
          onPointerUp={onWheelUp}
          onPointerCancel={onWheelUp}
          style={{
            minWidth: 130, textAlign: 'center', lineHeight: 1,
            touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none',
            cursor: dragging ? 'grabbing' : 'ns-resize',
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700, color: '#D9C7B4' }}>{bpm < MAX_BPM ? bpm + 1 : ''}</div>
          <div style={{ fontSize: 'clamp(55px, 11vh, 78px)', fontWeight: 900, color: '#1A1A1A', letterSpacing: -1, transform: dragging ? 'scale(1.12)' : 'scale(1)', transition: 'transform 0.12s ease' }}>{bpm}</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: ORANGE, marginTop: -2 }}>BPM</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#D9C7B4' }}>{bpm > MIN_BPM ? bpm - 1 : ''}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {stepBtn('−1', () => step(-1), 'quiet')}
          {stepBtn('−5', () => step(-5), 'quiet')}
        </div>
      </div>

      {/* 3. SLIDER + pace pill (pill on the left) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input
          type="range" min={MIN_BPM} max={MAX_BPM} value={bpm}
          onChange={(e) => setBpm(clamp(parseInt(e.target.value, 10), MIN_BPM, MAX_BPM))}
          style={{ flex: 1, accentColor: ORANGE, height: 28 }}
          aria-label="BPM"
        />
        <div style={{
          flexShrink: 0, padding: '7px 14px', borderRadius: 999,
          background: 'linear-gradient(90deg, #FF6F20, #FF8F4D)', color: '#fff',
          fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap',
        }}>{paceLabel(bpm)}</div>
      </div>

      {/* 4. PRACTICE PERCENT — run-only, slide/fade in */}
      <div style={{
        maxHeight: running ? 140 : 0, opacity: running ? 1 : 0,
        transform: running ? 'translateY(0)' : 'translateY(-8px)',
        overflow: 'hidden', transition: 'max-height .28s ease, opacity .28s ease, transform .28s ease',
      }}>
        <div style={{ background: 'linear-gradient(135deg, #FFF0E5, #FFE3D1)', border: '1px solid #F5D3BC', borderRadius: 16, padding: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#8A4A1E', marginBottom: 8 }}>🔥 אחוז תרגול מהקצב</div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between' }}>
            {[50, 75, 85, 95, 100].map((p) => {
              const on = percent === p;
              return (
                <button key={p} type="button" onClick={() => setPercent(p)} style={{
                  flex: 1, height: 40, borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 800,
                  border: on ? 'none' : '1px solid #F0C9AC',
                  background: on ? ORANGE : '#FFF7F0', color: on ? '#fff' : '#8A4A1E',
                  boxShadow: on ? '0 0 12px 2px rgba(255,111,32,0.5)' : 'none',
                }}>{p}%</button>
              );
            })}
          </div>
          {percent !== 100 && (
            <div style={{ fontSize: 12, fontWeight: 700, color: '#8A4A1E', textAlign: 'center', marginTop: 8 }}>
              מתרגל ב-{effectiveBpm} מתוך {bpm}
            </div>
          )}
        </div>
      </div>

      {/* 5. CONTROLS — two equal cards */}
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ ...card, flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#8A6A52', marginBottom: 8, textAlign: 'center' }}>פעימות בסבב</div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
            {[2, 3, 4].map((n) => {
              const on = beatsPerBar === n;
              return (
                <button key={n} type="button" onClick={() => setBeatsPerBar(n)} style={{
                  width: 44, height: 44, borderRadius: 10, cursor: 'pointer', fontSize: 16, fontWeight: 800,
                  border: on ? 'none' : '1px solid #F0E4D0',
                  background: on ? ORANGE : '#FFF9F0', color: on ? '#fff' : '#5C4A3A',
                }}>{n}</button>
              );
            })}
          </div>
        </div>
        <div style={{ ...card, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#8A6A52', marginBottom: 8 }}>קצב בהקשה</div>
          <button type="button" onClick={tap} style={{
            width: 48, height: 48, borderRadius: '50%', cursor: 'pointer', border: '1px solid #F0E4D0',
            background: '#FFF4ED', fontSize: 24, lineHeight: 1,
          }}>🥁</button>
        </div>
      </div>

      {/* 6. START / STOP */}
      <button type="button" onClick={toggle} style={{
        width: '100%', minHeight: 56, borderRadius: 16, border: 'none', cursor: 'pointer',
        fontSize: 20, fontWeight: 900, color: '#fff',
        background: running ? 'linear-gradient(135deg,#2B2B2B,#454545)' : 'linear-gradient(135deg,#FF6F20,#FF8A42)',
        boxShadow: running ? '0 6px 18px rgba(0,0,0,0.25)' : '0 8px 22px rgba(255,111,32,0.45)',
      }}>{running ? '⏸ עצור' : '▶ התחל'}</button>
    </div>
  );
}
