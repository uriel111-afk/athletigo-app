// ── Section colour themes ────────────────────────────────────────────
// Every section gets one base hex; everything else on the section — the
// recessed tray, its inset shadow, the icon tile, the title and subtitle
// inks, the exercise-card drop shadow, the position badge — is DERIVED
// from that single hex by mixing. There are no eight hand-written sets
// to drift out of sync.
//
// Brand orange #FF6F20 is deliberately NOT in this palette. It is
// reserved exclusively for the ACTIVE exercise — the card that is next
// up — so that "orange" always means "this is where you are", in every
// section, whatever colour that section happens to be. Adding orange
// here would make the active card indistinguishable inside an orange
// section.

export const SECTION_PALETTE = [
  { key: 'purple', label: 'סגול',   base: '#7F47B5' },
  { key: 'blue',   label: 'כחול',   base: '#3B82F6' },
  { key: 'teal',   label: 'טורקיז', base: '#1D9E75' },
  { key: 'green',  label: 'ירוק',   base: '#639922' },
  { key: 'amber',  label: 'ענבר',   base: '#EF9F27' },
  { key: 'red',    label: 'אדום',   base: '#DC2626' },
  { key: 'pink',   label: 'ורוד',   base: '#D4537E' },
  { key: 'brown',  label: 'חום',    base: '#8A6A45' },
];

export const ACTIVE_ORANGE = '#FF6F20';
const CREAM = '#FBF3EA';

const clamp255 = (n) => Math.max(0, Math.min(255, Math.round(n)));

function toRgb(hex) {
  if (typeof hex !== 'string') return { r: 0, g: 0, b: 0 };
  const h = hex.replace('#', '').slice(0, 6);
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return {
    r: parseInt(full.slice(0, 2), 16) || 0,
    g: parseInt(full.slice(2, 4), 16) || 0,
    b: parseInt(full.slice(4, 6), 16) || 0,
  };
}

const toHex = ({ r, g, b }) =>
  '#' + [r, g, b].map((c) => clamp255(c).toString(16).padStart(2, '0')).join('').toUpperCase();

// Mix `hex` toward `target` by `amount` (0 = unchanged, 1 = fully target).
function mix(hex, target, amount) {
  const a = toRgb(hex);
  const b = toRgb(target);
  return toHex({
    r: a.r + (b.r - a.r) * amount,
    g: a.g + (b.g - a.g) * amount,
    b: a.b + (b.b - a.b) * amount,
  });
}

const darken = (hex, amount) => mix(hex, '#000000', amount);

function rgba(hex, alpha) {
  const { r, g, b } = toRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

// WCAG relative luminance + contrast ratio, used to guarantee the
// section title stays legible on its own tray.
function luminance(hex) {
  const { r, g, b } = toRgb(hex);
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

// Darken until the title clears 4.5:1 against its tray. Starts at the
// intended ~45% and deepens in small steps only if a hue needs it, so
// the eight titles stay as close to the spec as legibility allows.
function accessibleTitle(base, tray, start = 0.45) {
  let amount = start;
  let ink = darken(base, amount);
  while (contrastRatio(ink, tray) < 4.5 && amount < 0.95) {
    amount += 0.02;
    ink = darken(base, amount);
  }
  return ink;
}

function resolveBase(colorKeyOrHex, sectionIndex) {
  if (typeof colorKeyOrHex === 'string' && colorKeyOrHex.trim() !== '') {
    const v = colorKeyOrHex.trim();
    const byKey = SECTION_PALETTE.find((p) => p.key === v);
    if (byKey) return byKey.base;
    if (/^#?[0-9A-Fa-f]{6}$/.test(v)) return v.startsWith('#') ? v : `#${v}`;
    if (/^#?[0-9A-Fa-f]{3}$/.test(v)) return toHex(toRgb(v));
  }
  // No stored colour: fall back by position so eight sections in one
  // plan are eight different colours without anyone choosing them.
  const idx = Number.isFinite(sectionIndex) ? Math.abs(sectionIndex) : 0;
  return SECTION_PALETTE[idx % SECTION_PALETTE.length].base;
}

export function getSectionTheme(colorKeyOrHex, sectionIndex = 0) {
  const base = resolveBase(colorKeyOrHex, sectionIndex);
  const tray = mix(base, CREAM, 0.88);
  return {
    base,
    tray,
    trayShadow: rgba(base, 0.26),
    cardShadow: rgba(base, 0.18),
    iconBg: mix(base, '#FFFFFF', 0.78),
    titleText: accessibleTitle(base, tray),
    subText: darken(base, 0.20),
    badge: base,
  };
}

export default getSectionTheme;
