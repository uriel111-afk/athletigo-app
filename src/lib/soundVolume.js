// Shared sound-volume preference for the Clocks hub (breathing +
// metronome). One value, persisted across sessions. Range 0..3 (0-300%),
// default 1.0 (100%). Each engine multiplies its own master GainNode by
// this, then a DynamicsCompressor after the gain prevents distortion at
// high boost. Web Audio on the Android WebView routes to the media
// stream (STREAM_MUSIC) by default — no native channel change needed.
export const SOUND_VOL_KEY = 'ag_sound_volume';
export const SOUND_VOL_MIN = 0;
export const SOUND_VOL_MAX = 3;

export const clampVol = (v) => Math.max(SOUND_VOL_MIN, Math.min(SOUND_VOL_MAX, v));

export function loadSoundVolume() {
  try {
    const v = parseFloat(localStorage.getItem(SOUND_VOL_KEY));
    return Number.isFinite(v) ? clampVol(v) : 1;
  } catch { return 1; }
}

export function saveSoundVolume(v) {
  try { localStorage.setItem(SOUND_VOL_KEY, String(clampVol(v))); } catch {}
}
