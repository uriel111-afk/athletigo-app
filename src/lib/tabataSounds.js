let ctx = null;
let masterGain = null;
let unlocked = false;

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
  unlocked = true;
}

export function isUnlocked() { return unlocked; }

export function now() { return getCtx().currentTime; }

function beep(when, freq = 880, durMs = 100) {
  const c = getCtx();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = "square";
  osc.frequency.value = freq;
  osc.connect(g);
  g.connect(masterGain);
  const d = durMs / 1000;
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(0.8, when + 0.005);
  g.gain.linearRampToValueAtTime(0, when + d);
  osc.start(when);
  osc.stop(when + d + 0.02);
}

function whistle(when) {
  const c = getCtx();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(500, when);
  osc.frequency.linearRampToValueAtTime(1200, when + 0.4);
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(0.9, when + 0.05);
  g.gain.linearRampToValueAtTime(0.7, when + 0.35);
  g.gain.linearRampToValueAtTime(0, when + 0.42);
  osc.connect(g);
  g.connect(masterGain);
  osc.start(when);
  osc.stop(when + 0.45);
}

function bell(when) {
  const c = getCtx();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = "sine";
  osc.frequency.value = 660;
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(1.0, when + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, when + 0.8);
  osc.connect(g);
  g.connect(masterGain);
  osc.start(when);
  osc.stop(when + 0.82);
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
  });
}

function doubleBell(when) {
  bell(when);
  bell(when + 0.25);
}

function longBeep(when) {
  const c = getCtx();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = "square";
  osc.frequency.value = 600;
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(0.8, when + 0.01);
  g.gain.linearRampToValueAtTime(0.8, when + 0.45);
  g.gain.linearRampToValueAtTime(0, when + 0.5);
  osc.connect(g);
  g.connect(masterGain);
  osc.start(when);
  osc.stop(when + 0.52);
}

export function playBeep() { beep(getCtx().currentTime); }
export function playWhistle() { whistle(getCtx().currentTime); }
export function playBell() { bell(getCtx().currentTime); }
export function playDoubleBell() { doubleBell(getCtx().currentTime); }
export function playLongBeep() { longBeep(getCtx().currentTime); }
export function playVictory() { victory(getCtx().currentTime); }

export function schedulePhase(phaseType, durationSec, startDelay = 0) {
  const c = getCtx();
  const t0 = c.currentTime + startDelay;

  if (durationSec >= 3) beep(t0 + durationSec - 3);
  if (durationSec >= 2) beep(t0 + durationSec - 2);
  if (durationSec >= 1) beep(t0 + durationSec - 1);

  const endTime = t0 + durationSec;
  if (phaseType === "prep" || phaseType === "rest") {
    whistle(endTime);
  } else if (phaseType === "work") {
    bell(endTime);
  }
}

export function cancelScheduled() {
  if (!ctx) return;
  ctx.suspend().then(() => ctx.resume());
}
