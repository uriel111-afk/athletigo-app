// The single sanitizer for every numeric field in the profitability feature.
// Pure string→string, no React, no DOM — so it can be unit-tested directly.
//
// Rules:
//   - keep digits and at most one decimal point, drop everything else
//     (a second decimal point truncates: "12.5.5" → "12.5")
//   - strip leading zeros unless the string is exactly "0" or starts "0."
//   - the empty string is a legal value and stays empty

export function sanitizeNumericInput(raw) {
  let s = String(raw == null ? '' : raw).replace(/[^\d.]/g, '');

  // at most one decimal point — everything from the second one on is dropped
  const parts = s.split('.');
  if (parts.length > 2) s = `${parts[0]}.${parts[1]}`;

  // strip leading zeros unless exactly "0" or "0."
  if (s.length > 1 && s[0] === '0' && s[1] !== '.') {
    s = s.replace(/^0+/, '');
    if (s === '') s = '0';
    else if (s[0] === '.') s = `0${s}`;
  }

  return s;
}

export function numericToNumber(s) {
  if (s === '' || s === '.') return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
