/**
 * clockTypography — the ONE place clock text sizes live.
 *
 * Every focused clock (tabata, dynamic intervals, metronome, breathing,
 * timer, stopwatch) spreads these objects instead of typing its own
 * fontSize, so the same kind of element reads the same size in every
 * mode and cannot drift one file at a time again.
 *
 * Every token sets fontSize explicitly, on the element that holds the
 * text. index.css carries a wildcard `* { font-size: clamp(13px, 2.2vw,
 * 17px) }`, and a wildcard rule beats inheritance: a bare wrapper span
 * inside a 72px parent renders at ~15px. That is exactly how the tabata
 * total-time value shrank (4bc205b wrapped it in <span style={LTR_TIME}>).
 * Wrap digits with DIGITS_WRAP, never with LTR_TIME alone.
 *
 * clamp() maxima equal the original fixed pixel sizes, and the vw slope
 * reaches that maximum at a 360px-wide phone, so a normal phone renders
 * exactly the agreed design and only narrower screens scale down.
 */

const BARLOW = "'Barlow Condensed', sans-serif";

// LTR isolation for mm:ss inside RTL text, re-inheriting the parent's
// size and weight so the wildcard font-size rule can't reach it.
export const DIGITS_WRAP = {
  direction: 'ltr', unicodeBidi: 'isolate',
  fontSize: 'inherit', fontWeight: 'inherit',
};

// ── Phase title (עבודה / מנוחה / הכנה / ספירה לאחור) ──
export const PHASE_TITLE = {
  fontSize: 'clamp(48px, 18vw, 64px)', fontWeight: 800,
  lineHeight: 0.9, letterSpacing: '-2px', whiteSpace: 'nowrap',
};
// Long labels (מנוחה בין סטים, ספירה לאחור) share the header row with
// the minimize chip and the back button, so they step down.
export const PHASE_TITLE_LONG = {
  ...PHASE_TITLE,
  fontSize: 'clamp(24px, 8.5vw, 42px)',
};
export const phaseTitle = (label) =>
  (String(label || '').length > 6 ? PHASE_TITLE_LONG : PHASE_TITLE);

// ── Main digits inside the tabata / intervals phase ring ──
export const RING_DIGITS = {
  fontSize: 'clamp(96px, 55vw, 180px)', fontWeight: 800,
  fontVariantNumeric: 'tabular-nums', letterSpacing: -2, lineHeight: 1,
};

// ── Timer / stopwatch main digits (styled like the tabata digits) ──
export const CLOCK_DIGITS = {
  fontSize: 'clamp(64px, 18vw, 120px)', fontWeight: 800,
  fontVariantNumeric: 'tabular-nums', fontFamily: BARLOW,
  letterSpacing: -2, lineHeight: 1,
};
// The plan-screen overlay raises the same face with bigDigits.
export const CLOCK_DIGITS_BIG = {
  ...CLOCK_DIGITS,
  fontSize: 'clamp(88px, 22vw, 132px)',
};

// ── Breathing number, sized to sit inside the contracted circle ──
export const BREATH_DIGITS = {
  fontWeight: 900, lineHeight: 1, fontVariantNumeric: 'tabular-nums',
};
export const BREATH_DIGITS_ONE = 'clamp(100px,21vh,158px)';
export const BREATH_DIGITS_TWO = 'clamp(66px,14vh,104px)';

// ── Metronome BPM readout (height-driven so the wheel fits) ──
export const BPM_DIGITS = {
  fontSize: 'clamp(55px, 11vh, 78px)', fontWeight: 900, letterSpacing: -1,
};

// ── Round / set counters (סבב 3/8 · סט 1/2 · סבב 3 מתוך 10) ──
export const COUNTER_LABEL = {
  fontSize: 'clamp(18px, 6.7vw, 24px)', fontWeight: 600,
};
export const COUNTER_VALUE = {
  fontSize: 'clamp(34px, 11.7vw, 42px)', fontWeight: 800,
  fontVariantNumeric: 'tabular-nums', lineHeight: 1.15,
};

// ── Secondary time (the total-time card) ──
export const TOTAL_LABEL = {
  fontSize: 'clamp(18px, 6.2vw, 22px)', fontWeight: 600,
  whiteSpace: 'nowrap',
};
export const TOTAL_VALUE = {
  fontSize: 'clamp(52px, 20vw, 72px)', fontWeight: 700,
  fontVariantNumeric: 'tabular-nums', fontFamily: BARLOW,
  letterSpacing: '0.5px', lineHeight: 1.15, whiteSpace: 'nowrap',
};

// ── Next-phase line (הבא: מנוחה · 10 שנ׳) ──
export const NEXT_LINE = {
  fontSize: 'clamp(18px, 6.2vw, 22px)', fontWeight: 700,
};
export const NEXT_LINE_LABEL = { fontSize: 16, fontWeight: 600 };

// ── Buttons ──
// Primary = the one big action (השהה / המשך / התחל), anchored bottom.
export const BTN_PRIMARY = {
  fontSize: 'clamp(18px, 6.2vw, 22px)', fontWeight: 800, height: 56,
};
// Secondary = every other bottom-bar action (עצור / אפס / הקפה / הבא).
export const BTN_SECONDARY = {
  fontSize: 'clamp(16px, 5vw, 18px)', fontWeight: 800, height: 56,
};
// The הבא / חזור nav row sits above the controls and is shorter.
export const BTN_NAV = { ...BTN_SECONDARY, height: 48 };

// ── Chips and small card captions ──
export const CHIP = { fontSize: 14, fontWeight: 800 };
export const CARD_LABEL = { fontSize: 13, fontWeight: 800 };

// ── Focused-view header row: back button + minimize chip + title ──
export const HEADER_ROW = {
  display: 'flex', alignItems: 'center', gap: 8,
  width: '100%', minHeight: 64, direction: 'rtl',
};
export const HEADER_TITLE_BOX = {
  flex: 1, minWidth: 0, textAlign: 'right', overflow: 'hidden',
};
export const BACK_BTN = {
  width: 44, height: 44, minHeight: 44, flexShrink: 0, borderRadius: 12,
  background: '#FFFFFF', border: '1px solid #F0E4D0',
  boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', padding: 0,
};
