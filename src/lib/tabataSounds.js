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

// Public API — immediate play
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
