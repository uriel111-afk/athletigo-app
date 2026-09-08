/**
 * duration — the ONE formatter for every displayed duration.
 *
 * The rule: mm:ss, and hh:mm:ss once a duration passes an hour.
 * Minutes on the LEFT, always, even inside an RTL page — a clock is
 * read left to right in every language, so every call site that
 * renders one must also isolate it (`direction:'ltr'` +
 * `unicodeBidi:'isolate'`) or the bidi algorithm will reorder the
 * colon-separated parts inside Hebrew text.
 *
 * STORAGE STAYS SECONDS. Nothing here changes what is written to
 * exercises.work_time / rest_time / static_hold_time or to
 * exercise_set_logs.time_completed. This is display only.
 *
 * Before this module every screen carried its own copy:
 *   Clocks.jsx          fmt() dropped the minutes below 60s ("45")
 *   ClockContext.jsx    formatRemaining() padded to "00:45"
 *   PlanSheet.jsx       mmss() rendered "0:45"
 *   MiniTimerBar.jsx    its own padded copy
 *   FloatingClockBar    another unpadded copy
 * so the same 45 seconds read four different ways depending on which
 * surface you were looking at.
 */

/** Seconds → "m:ss", or "h:mm:ss" from an hour up. */
export function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`;
  return `${m}:${ss}`;
}

/**
 * The same, zero-padded on the minutes — "00:45", "05:00", "1:05:00".
 * This is the shape the running clock faces use, where the digits are
 * large and must not jump width as the minutes tick over.
 */
export function formatDurationPadded(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  if (h > 0) return `${h}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

/**
 * Milliseconds → a display string.
 *
 * `ceil` is the running-clock rule and the default for a countdown:
 * "1" stays on screen for the whole final second (ms 1..1000) and the
 * face is replaced before it would ever read 00:00. Flooring drops to
 * 00:00 the moment ms crosses below 1000 and lingers there for a
 * second. Pass ceil:false for a stopwatch, which counts up.
 */
export function formatDurationMs(ms, { ceil = true, padded = true } = {}) {
  const raw = Math.max(0, Number(ms) || 0);
  const seconds = ceil ? Math.ceil(raw / 1000) : Math.floor(raw / 1000);
  return padded ? formatDurationPadded(seconds) : formatDuration(seconds);
}

/** A stopwatch face: mm:ss.cs, counting up. */
export function formatStopwatchMs(ms) {
  const raw = Math.max(0, Number(ms) || 0);
  const cs = Math.floor((raw % 1000) / 10);
  return `${formatDurationPadded(Math.floor(raw / 1000))}.${String(cs).padStart(2, '0')}`;
}

/**
 * The inline style every rendered duration needs so the minutes stay
 * on the left inside an RTL line. Spread it onto the element that
 * holds the formatted string.
 */
export const LTR_TIME = { direction: 'ltr', unicodeBidi: 'isolate' };

export default formatDuration;
