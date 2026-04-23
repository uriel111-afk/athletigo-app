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

// Soft breath — play/resume tap. Single sine 440Hz with gentle decay.
function softBreath(when) {
  const c = getCtx();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = 'sine';
  osc.frequency.value = 440;
  g.gain.setValueAtTime(0.4, when);
  g.gain.exponentialRampToValueAtTime(0.001, when + 0.6);
  osc.connect(g);
  g.connect(masterGain);
  osc.start(when);
  osc.stop(when + 0.62);
  scheduledNodes.push(osc);
}

// Action melody — work phase starts. 4 ascending square notes,
// loud (0.7) and longer (150ms) so they are clearly audible over
// breathing/gym noise.
function actionMelody(when) {
  const c = getCtx();
  const notes = [440, 554, 659, 880];
  let t = when;
  for (const freq of notes) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.7, t);
    g.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.15);
    scheduledNodes.push(osc);
    t += 0.18;
  }
}

// Slow pulse — rest phase starts. 3 pulses, each layered with a 120Hz
// bass so the cue punches through background noise.
//  - main tone: sine 500Hz, gain 0.85 → 0.01 over 0.22s
//  - bass layer: sine 120Hz, gain 0.9  → 0.01 over 0.30s
//  - spacing: 0.55s between pulses
function slowPulse(when) {
  const c = getCtx();
  let t = when;
  for (let i = 0; i < 3; i++) {
    // Main tone
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = 500;
    g.gain.setValueAtTime(0.85, t);
    g.gain.exponentialRampToValueAtTime(0.01, t + 0.22);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.22);
    scheduledNodes.push(osc);

    // Bass layer
    const bass = c.createOscillator();
    const bg = c.createGain();
    bass.type = 'sine';
    bass.frequency.value = 120;
    bg.gain.setValueAtTime(0.9, t);
    bg.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
    bass.connect(bg);
    bg.connect(masterGain);
    bass.start(t);
    bass.stop(t + 0.3);
    scheduledNodes.push(bass);

    t += 0.55;
  }
}

// Deep gong — used for the work→rest transition. Three layered sines:
// low fundamental + overtone + metallic shimmer.
function gong(when) {
  const c = getCtx();
  const layers = [
    { freq: 200, gain: 0.3,  decay: 1.5 },
    { freq: 340, gain: 0.15, decay: 1.0 },
    { freq: 520, gain: 0.08, decay: 0.6 },
  ];
  for (const layer of layers) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = layer.freq;
    g.gain.setValueAtTime(layer.gain, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + layer.decay);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(when);
    osc.stop(when + layer.decay + 0.05);
    scheduledNodes.push(osc);
  }
}

// Public API — immediate play
export function playClick() { click(getCtx().currentTime); }
export function playBeep() { beep(getCtx().currentTime); }
export function playWhistle() { whistle(getCtx().currentTime); }
export function playBell() { bell(getCtx().currentTime); }
export function playDoubleBell() { doubleBell(getCtx().currentTime); }
export function playLongBeep() { longBeep(getCtx().currentTime); }
export function playVictory() { victory(getCtx().currentTime); }
export function playGong() { gong(getCtx().currentTime); }
export function playSoftBreath() { softBreath(getCtx().currentTime); }
export function playActionMelody() { actionMelody(getCtx().currentTime); }
export function playSlowPulse() { slowPulse(getCtx().currentTime); }

// Cancel all scheduled oscillators
export function cancelScheduled() {
  scheduledNodes.forEach(n => { try { n.stop(0); } catch (e) {} });
  scheduledNodes.length = 0;
}
