// The roadmap's palette and shared bits — the printed sheet's own,
// copied from PlanSheet so the map reads as the same document.
export const CREAM       = '#FBF3EA';
export const CHARCOAL    = '#2D2A26';
export const ORANGE      = '#FF6F20';
export const WHITE       = '#FFFFFF';
export const CARD_BORDER = '#E0D4C2';
export const DIVIDER     = '#F0E7DA';
export const MUTED       = '#8A8079';
export const BAND_BG     = '#FFF4EA';
export const BAND_LINE   = '#F0C9A8';
export const GREEN       = '#0F6E56';
export const BEIGE       = '#E3D6C4';   // the locked trail and its nodes

export const SANS = "'Rubik', system-ui, -apple-system, sans-serif";

// A station's own state, derived — never read from the row alone,
// because the ladder decides which planned station is the CURRENT
// one and which are still locked behind it.
export const STATION_STATE = { REACHED: 'reached', CURRENT: 'current', LOCKED: 'locked' };

export function stationState(index, currentIndex) {
  if (currentIndex < 0) return STATION_STATE.REACHED;   // whole ladder done
  if (index < currentIndex) return STATION_STATE.REACHED;
  if (index === currentIndex) return STATION_STATE.CURRENT;
  return STATION_STATE.LOCKED;
}

// Numbers on this screen are plain counts, weights or metres. The one
// place a number is a DURATION is a seconds/minutes unit, and the
// sheet writes those mm:ss — never a bare "125 שניות".
export function stationValueLabel(value, unit) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (unit === 'seconds') return mmss(n);
  if (unit === 'minutes') return mmss(n * 60);
  return String(n % 1 === 0 ? n : +n.toFixed(1));
}

export function mmss(totalSeconds) {
  const s = Math.max(0, Math.round(Number(totalSeconds) || 0));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

// Left-to-right inside an RTL page, so 3:05 never renders as 05:3.
export const LTR_NUM = { direction: 'ltr', unicodeBidi: 'isolate' };
