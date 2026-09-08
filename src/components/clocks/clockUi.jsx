import React, { useCallback, useRef } from 'react';
import { formatDurationMs, formatStopwatchMs } from '@/lib/duration';
import {
  unlock as unlockAudio, playBeep, playClick, playVictory, playSoftBreath,
} from '@/lib/tabataSounds';

/**
 * clockUi — the clocks tab's shared furniture.
 *
 * Lifted VERBATIM out of src/pages/Clocks.jsx so TimerView could move
 * into its own file and be mounted from two places (the clocks tab and
 * the global overlay the plan screen raises) without either copy
 * drifting. Every value, comment and behaviour below is the original;
 * nothing here was redesigned.
 *
 * Clocks.jsx and components/clocks/TimerView.jsx both import from here,
 * so the tab and the overlay are the same clock down to the palette.
 */

export const BRAND = '#FF6F20';
// FN — display font for the clocks tab only (digits + scoreboard
// labels + tab toggles). Reverted to Barlow Condensed; the rest of
// the app keeps Bebas Neue for numerical accents.
export const FN = "'Barlow Condensed', sans-serif";
export const FL = "'Rubik', system-ui, sans-serif";
export const C1 = '#1A1A1A';
export const C2 = '#6B7280';
export const C3 = '#9CA3AF';
export const BRD = '#E5E7EB';
export const BG2 = '#F5F5F5';

// The one shared formatter. This used to print a bare "45" below a
// minute, so the same duration read differently here and on the sheet.
export const fmt = (ms) => formatDurationMs(ms, { ceil: false, padded: false });
// ceil is the running-clock rule, owned by the shared formatter:
// "1" holds the screen for the whole final second, then the phase ends
// and the setup/done screen replaces the view — "00:00" is never
// rendered. Floor would drop to "00:00" the moment ms crosses below
// 1000 and linger there for ~1 s.
export const fmtMMSS = (ms) => formatDurationMs(ms);
export const fmtStopwatch = (ms) => formatStopwatchMs(ms);

export function HoldButton({ onClick, children, className, style }) {
  const intRef = useRef(null), toRef = useRef(null);
  const start = useCallback(() => { onClick(); toRef.current = setTimeout(() => { intRef.current = setInterval(onClick, 80); }, 400); }, [onClick]);
  const stop = useCallback(() => { if (toRef.current) { clearTimeout(toRef.current); toRef.current = null; } if (intRef.current) { clearInterval(intRef.current); intRef.current = null; } }, []);
  return <button onMouseDown={start} onMouseUp={stop} onMouseLeave={stop} onTouchStart={(e) => { e.preventDefault(); start(); }} onTouchEnd={stop} onTouchCancel={stop} className={className} style={style}>{children}</button>;
}

// Preset options for TimerView columns
export const MIN_COL_OPTIONS = [0, 1, 2, 3, 5, 10, 15, 20, 30, 45, 60, 75, 90, 99];
export const SEC_COL_OPTIONS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 59];

// ═══ SOUNDS (Timer & Stopwatch) — unified with the Tabata sound set ═══
// Start/Resume taps → playSoftBreath (Tabata's tap cue).
// Pause is owned by ClockContext (fires playPauseSound) — buttons don't
// double-trigger it. 3-2-1 ticks reuse playBeep (Tabata countdown).
// Finish reuses playVictory (Tabata workout-end signal).
// SOUND_ALERT (the 10-second warning) is intentionally kept on playBeep×2.
export const SOUND_START = playSoftBreath;
export const SOUND_RESET = playClick;
export const SOUND_TICK = playBeep;
export const SOUND_ALERT = () => { playBeep(); setTimeout(playBeep, 150); };
export const SOUND_TRIPLE_BELL = playVictory;
export { unlockAudio, playSoftBreath };

/**
 * The preparation a plan-launched clock counts in with, in ONE place.
 *
 * It is not a plan-side screen — it is the clock's own `prepare` phase,
 * the same one the clocks tab's הכנה control feeds and the same one the
 * tabata face runs. The plan just supplies the number.
 */
export const PLAN_PREP_SECONDS = 10;
