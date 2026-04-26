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

// Workout-end signal — four ascending triangle tones (C5 → C6).
// Same arpeggio as the original (waveform, frequencies, timing all
// preserved). Volume boost is achieved by layering and compression,
// NOT by changing the musical content:
//   - triangle osc at gain 1.0 (the bright "bite" — original tone)
//   - sine osc at the same freq + gain 0.5 (adds body / fundamental)
//   - both feed a per-call DynamicsCompressor (threshold -10 dB,
//     ratio 4:1) which evens the peak and lets a higher RMS through
//     without clipping
//   - compressor → masterGain, isolated to this call so other
//     per-round cues stay at their original loudness
function victory(when) {
  const c = getCtx();

  // One compressor per victory() invocation — disposed implicitly
  // when the scheduled nodes finish playing. Compresses the layered
  // signal so the perceived loudness goes up without distortion.
  const comp = c.createDynamicsCompressor();
  comp.threshold.setValueAtTime(-10, c.currentTime);
  comp.knee.setValueAtTime(20, c.currentTime);
  comp.ratio.setValueAtTime(4, c.currentTime);
  comp.attack.setValueAtTime(0.003, c.currentTime);
  comp.release.setValueAtTime(0.25, c.currentTime);
  comp.connect(masterGain);

  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
    const start = when + i * 0.18;

    // Layer 1 — triangle (the original tone, unchanged).
    const tri = c.createOscillator();
    const triG = c.createGain();
    tri.type = "triangle";
    tri.frequency.value = f;
    triG.gain.setValueAtTime(0, start);
    triG.gain.linearRampToValueAtTime(1.0, start + 0.02);
    triG.gain.exponentialRampToValueAtTime(0.001, start + 0.6);
    tri.connect(triG);
    triG.connect(comp);
    tri.start(start);
    tri.stop(start + 0.62);
    scheduledNodes.push(tri);

    // Layer 2 — sine at the same pitch for fundamental body. Same
    // envelope shape, lower peak so it doesn't dominate the timbre.
    const sin = c.createOscillator();
    const sinG = c.createGain();
    sin.type = "sine";
    sin.frequency.value = f;
    sinG.gain.setValueAtTime(0, start);
    sinG.gain.linearRampToValueAtTime(0.5, start + 0.02);
    sinG.gain.exponentialRampToValueAtTime(0.001, start + 0.6);
    sin.connect(sinG);
    sinG.connect(comp);
    sin.start(start);
    sin.stop(start + 0.62);
    scheduledNodes.push(sin);
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

// Pause — descending tone 440 → 220Hz over 0.3s. Mirror image of
// softBreath's rising tap so pause and resume are audibly distinct.
function pauseSound(when) {
  const c = getCtx();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(440, when);
  osc.frequency.exponentialRampToValueAtTime(220, when + 0.3);
  g.gain.setValueAtTime(0.35, when);
  g.gain.exponentialRampToValueAtTime(0.01, when + 0.3);
  osc.connect(g);
  g.connect(masterGain);
  osc.start(when);
  osc.stop(when + 0.32);
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
    // Main tone — square wave at 600Hz for sharper attack that
    // cuts through ambient gym noise (was: sine 500Hz @ 0.85)
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'square';
    osc.frequency.value = 600;
    g.gain.setValueAtTime(0.95, t);
    g.gain.exponentialRampToValueAtTime(0.01, t + 0.25);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.25);
    scheduledNodes.push(osc);

    // Bass layer — punchier 100Hz at near-max gain
    const bass = c.createOscillator();
    const bg = c.createGain();
    bass.type = 'sine';
    bass.frequency.value = 100;
    bg.gain.setValueAtTime(0.95, t);
    bg.gain.exponentialRampToValueAtTime(0.01, t + 0.35);
    bass.connect(bg);
    bg.connect(masterGain);
    bass.start(t);
    bass.stop(t + 0.35);
    scheduledNodes.push(bass);

    // High clarity ping — 1200Hz lifts the cue above clothing
    // rustle, breathing, music
    const ping = c.createOscillator();
    const pg = c.createGain();
    ping.type = 'sine';
    ping.frequency.value = 1200;
    pg.gain.setValueAtTime(0.5, t);
    pg.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
    ping.connect(pg);
    pg.connect(masterGain);
    ping.start(t);
    ping.stop(t + 0.15);
    scheduledNodes.push(ping);

    t += 0.5;
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
export function playPauseSound() { pauseSound(getCtx().currentTime); }
export function playActionMelody() { actionMelody(getCtx().currentTime); }
export function playSlowPulse() { slowPulse(getCtx().currentTime); }

// Cancel all scheduled oscillators
export function cancelScheduled() {
  scheduledNodes.forEach(n => { try { n.stop(0); } catch (e) {} });
  scheduledNodes.length = 0;
}

// ─────────────────────────────────────────────────────────────────────
// Haptic feedback — `navigator.vibrate` guarded for browsers/iOS-Safari
// that don't implement the Vibration API. Tapping vibrate on those
// platforms is a safe no-op; the try/catch is belt-and-suspenders.
// ─────────────────────────────────────────────────────────────────────
export const VIBRATION = {
  workStart: [200, 100, 200],            // two short pulses = GO!
  restStart: [300],                      // one long pulse = rest
  tick:      [50],                       // 3-2-1 countdown micro-tick
  finish:    [200, 100, 200, 100, 400],  // celebration
  pause:     [50],                       // subtle tap
  resume:    [100],                      // slightly longer tap
};

export function vibrate(pattern) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  } catch (e) {}
}

// ─────────────────────────────────────────────────────────────────────
// Timer notifications — a single persistent notification (tag
// 'athletigo-timer') that mirrors the currently-running timer so the
// user sees timer state in the phone's notification shade even when
// the tab is backgrounded. We use the Notification API directly for
// foreground updates and fall back to the active Service Worker for
// platforms (Chrome on Android) that only allow `requireInteraction`
// via SW registrations.
// ─────────────────────────────────────────────────────────────────────
const TIMER_NOTIF_TAG = 'athletigo-timer';
let lastTimerNotif = null;

export async function requestNotifPermission() {
  try {
    if (typeof window === 'undefined' || !('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const result = await Notification.requestPermission();
    return result === 'granted';
  } catch (e) {
    return false;
  }
}

export function showTimerNotification(title, body) {
  try {
    if (typeof window === 'undefined' || !('Notification' in window)) return null;
    if (Notification.permission !== 'granted') return null;

    const opts = {
      body: body || '',
      icon: '/icon-192.png',       // dropdown icon (white bg + black triangle)
      badge: '/badge-icon.png',    // status-bar badge (white silhouette)
      tag: TIMER_NOTIF_TAG,
      renotify: true,
      requireInteraction: true,
      silent: true,
    };

    // Prefer the Service Worker — supports `requireInteraction` on
    // Android, can survive a tab background better, and the tag
    // ensures the previous timer notification is replaced rather
    // than stacking a new one per phase.
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready
        .then((reg) => reg.showNotification(title, opts))
        .catch(() => {});
      return null;
    }

    // Foreground fallback: plain Notification. Close any previous
    // instance we kept a handle to so we don't stack notifications.
    try { lastTimerNotif?.close?.(); } catch {}
    const n = new Notification(title, opts);
    n.onclick = () => {
      try { window.focus(); } catch {}
      try { n.close(); } catch {}
    };
    lastTimerNotif = n;
    return n;
  } catch (e) {
    return null;
  }
}

export function closeTimerNotification() {
  try { lastTimerNotif?.close?.(); } catch {}
  lastTimerNotif = null;
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((reg) => reg.getNotifications({ tag: TIMER_NOTIF_TAG }))
      .then((notifs) => (notifs || []).forEach((n) => { try { n.close(); } catch {} }))
      .catch(() => {});
  }
}

// ─────────────────────────────────────────────────────────────────────
// Screen Wake Lock — prevents the phone from dimming/locking while a
// timer runs. Reference-counted so overlapping timers (Tabata + Clock)
// share one lock; the last timer to stop releases it. Automatically
// re-acquires on `visibilitychange` in case the OS revoked the lock
// while the page was hidden.
// ─────────────────────────────────────────────────────────────────────
let wakeLockSentinel = null;
let wakeLockRefCount = 0;
let wakeLockVisibilityAttached = false;

async function acquireWakeLockInternal() {
  try {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    if (wakeLockSentinel) return;
    wakeLockSentinel = await navigator.wakeLock.request('screen');
    wakeLockSentinel.addEventListener('release', () => { wakeLockSentinel = null; });
  } catch (e) {}
}

function attachWakeLockVisibility() {
  if (wakeLockVisibilityAttached || typeof document === 'undefined') return;
  wakeLockVisibilityAttached = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && wakeLockRefCount > 0 && !wakeLockSentinel) {
      acquireWakeLockInternal();
    }
  });
}

export function acquireTimerWakeLock() {
  wakeLockRefCount += 1;
  attachWakeLockVisibility();
  acquireWakeLockInternal();
}

export function releaseTimerWakeLock() {
  wakeLockRefCount = Math.max(0, wakeLockRefCount - 1);
  if (wakeLockRefCount === 0 && wakeLockSentinel) {
    try { wakeLockSentinel.release(); } catch {}
    wakeLockSentinel = null;
  }
}

export function hasActiveTimerWakeLock() { return wakeLockRefCount > 0; }
