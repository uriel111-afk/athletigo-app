let ctx = null;
let masterGain = null;
const scheduledNodes = [];

function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.9;
    masterGain.connect(ctx.destination);
  }
  return ctx;
}

export async function unlock() {
  const c = getCtx();
  if (c.state === "suspended") await c.resume();
  const buf = c.createBuffer(1, 1, 22050);
  const src = c.createBufferSource();
  src.buffer = buf;
  src.connect(c.destination);
  src.start(0);
}

export function now() { return getCtx().currentTime; }

function tone(type, freq, when, durMs, envelope) {
  const c = getCtx();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(g);
  g.connect(masterGain);
  const d = durMs / 1000;
  g.gain.setValueAtTime(0, when);
  if (envelope === "decay") {
    g.gain.linearRampToValueAtTime(0.9, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, when + d);
  } else {
    g.gain.linearRampToValueAtTime(0.8, when + 0.005);
    g.gain.linearRampToValueAtTime(0, when + d);
  }
  osc.start(when);
  osc.stop(when + d + 0.02);
  scheduledNodes.push(osc);
}

function beep(when) { tone("square", 880, when, 100); }
function bell(when) { tone("sine", 660, when, 800, "decay"); }
function longBeep(when) { tone("square", 600, when, 500); }

function whistle(when) {
  const c = getCtx();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(500, when);
  osc.frequency.linearRampToValueAtTime(1200, when + 0.4);
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(0.9, when + 0.05);
  g.gain.linearRampToValueAtTime(0, when + 0.42);
  osc.connect(g);
  g.connect(masterGain);
  osc.start(when);
  osc.stop(when + 0.45);
  scheduledNodes.push(osc);
}

function doubleBell(when) {
  bell(when);
  bell(when + 0.25);
}

function victory(when) {
  const c = getCtx();
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
    const start = when + i * 0.18;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = "triangle";
    osc.frequency.value = f;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(0.7, start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, start + 0.6);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(start);
    osc.stop(start + 0.62);
    scheduledNodes.push(osc);
  });
}

function click(when) {
  const c = getCtx();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(1500, when);
  osc.frequency.exponentialRampToValueAtTime(400, when + 0.03);
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(0.6, when + 0.002);
  g.gain.exponentialRampToValueAtTime(0.001, when + 0.04);
  osc.connect(g);
  g.connect(masterGain);
  osc.start(when);
  osc.stop(when + 0.05);
  scheduledNodes.push(osc);
}

// Public API — immediate play
export function playClick() { click(getCtx().currentTime); }
export function playBeep() { beep(getCtx().currentTime); }
export function playWhistle() { whistle(getCtx().currentTime); }
export function playBell() { bell(getCtx().currentTime); }
export function playDoubleBell() { doubleBell(getCtx().currentTime); }
export function playLongBeep() { longBeep(getCtx().currentTime); }
export function playVictory() { victory(getCtx().currentTime); }

// Cancel all scheduled oscillators
export function cancelScheduled() {
  scheduledNodes.forEach(n => { try { n.stop(0); } catch (e) {} });
  scheduledNodes.length = 0;
}

// ─── Phase-specific composed sounds ────────────────────────────────
// One unified API for all timer engines (Tabata, Countdown, EMOM, AMRAP).
// Each phase has a clearly distinct sonic signature so the user can
// recognize what's happening without looking at the screen.
//
// All sounds reuse the shared AudioContext (no per-call ctx.close()
// which leaks/hits browser ctx limits).

// WORK START — 3 quick high beeps + 1 long higher beep. Race-start horn.
function workStartPattern(when) {
  const c = getCtx();
  const beats = [
    { f: 880, dur: 0.10, gap: 0.15 },
    { f: 880, dur: 0.10, gap: 0.15 },
    { f: 880, dur: 0.10, gap: 0.15 },
    { f: 1100, dur: 0.40, gap: 0 },
  ];
  let t = when;
  for (const b of beats) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'square';
    osc.frequency.value = b.f;
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + b.dur);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(t);
    osc.stop(t + b.dur + 0.02);
    scheduledNodes.push(osc);
    t += b.dur + b.gap;
  }
}

// REST START — 1 soft low sine. Calm.
function restStartPattern(when) {
  const c = getCtx();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = 'sine';
  osc.frequency.value = 440;
  g.gain.setValueAtTime(0.2, when);
  g.gain.exponentialRampToValueAtTime(0.001, when + 0.6);
  osc.connect(g);
  g.connect(masterGain);
  osc.start(when);
  osc.stop(when + 0.62);
  scheduledNodes.push(osc);
}

// PREPARE — 3 medium ticks spaced 350ms apart.
function preparePattern(when) {
  const c = getCtx();
  let t = when;
  for (let i = 0; i < 3; i++) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = 660;
    g.gain.setValueAtTime(0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.10);
    scheduledNodes.push(osc);
    t += 0.35;
  }
}

// COUNTDOWN TICK — single short 800Hz beep for last 3 seconds.
function countdownTickPattern(when) {
  const c = getCtx();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = 'sine';
  osc.frequency.value = 800;
  g.gain.setValueAtTime(0.15, when);
  g.gain.exponentialRampToValueAtTime(0.001, when + 0.05);
  osc.connect(g);
  g.connect(masterGain);
  osc.start(when);
  osc.stop(when + 0.07);
  scheduledNodes.push(osc);
}

// One entry point for all engines.
export function playPhaseSound(type) {
  try {
    const t = getCtx().currentTime;
    if (type === 'work')             workStartPattern(t);
    else if (type === 'rest')        restStartPattern(t);
    else if (type === 'prepare')     preparePattern(t);
    else if (type === 'finish')      victory(t);
    else if (type === 'countdown_tick') countdownTickPattern(t);
  } catch (err) {
    // Audio not supported / blocked — silently no-op.
  }
}
