// Canonical seconds → human-readable formatter for exercise time
// fields (work_time, rest_time, static_hold_time, …). Replaces the
// scattered `${value}''` / `${value} שניות` displays that surfaced
// raw integers with stray apostrophes.
//
// Behavior:
//   • < 60s          → "{n} שנ׳"
//   • exact minutes   → "{m} דק׳"
//   • mixed          → "m:ss" (zero-padded seconds)
//   • blank/NaN/null → "" (caller can branch on falsiness)
export const formatTime = (seconds) => {
  if (seconds === null || seconds === undefined || seconds === '') return '';
  const s = typeof seconds === 'number' ? Math.floor(seconds) : parseInt(seconds, 10);
  if (Number.isNaN(s)) return '';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m === 0) return `${sec} שנ׳`;
  if (sec === 0) return `${m} דק׳`;
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

export default formatTime;
