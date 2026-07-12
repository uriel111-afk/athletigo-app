// ── Pricing engine (editable content) ───────────────────────────────
// ALL prices & rules live here — there are NO numbers in the component
// code. Edit freely; the UI recomputes from these. Prices round to 10₪.

const round10 = (n) => Math.round(n / 10) * 10;

// Fixed private price list (for reference / single source of truth).
export const PRIVATE_PRICES = {
  group_sub_1x: 249,   // מנוי קבוצתי — פעם בשבוע
  group_sub_2x: 399,   // מנוי קבוצתי — פעמיים בשבוע
  personal: 350,       // אימון אישי — למפגש
  program_90: 1200,    // ליווי 90 יום — לחודש
  digital: 49,         // מוצר פריצה דיגיטלי
};

// Group / organisation formula.
const GROUP = {
  base: 400,           // בסיס למפגש — עד 12 משתתפים
  includedUpTo: 12,
  perExtra: 10,        // תוספת לכל משתתף מעל 12
  floor: 350,          // רצפה קשיחה — ההצעה לעולם לא יורדת מתחתיה
  rangeTopPct: 0.20,   // טווח עליון = בסיס + 20%
  weeksPerMonth: 4,
  frameDiscount: [     // הנחת מסגרת חודשית (לפי מפגשים בחודש)
    { minSessions: 8, pct: 0.10 },
    { minSessions: 4, pct: 0.05 },
  ],
};

// Per-session pricing for a group of `size`.
export function groupPricing(size) {
  const n = Math.max(0, parseInt(size, 10) || 0);
  const raw = GROUP.base + Math.max(0, n - GROUP.includedUpTo) * GROUP.perExtra;
  const anchor = round10(Math.max(raw, GROUP.floor));
  return {
    size: n,
    anchor,                                  // עוגן מומלץ למפגש
    floor: GROUP.floor,
    rangeLow: GROUP.floor,                   // טווח מוצג: מהרצפה...
    rangeHigh: round10(anchor * (1 + GROUP.rangeTopPct)), // ...עד בסיס+20%
  };
}

// Monthly frame at `anchor` for `freqPerWeek` sessions a week.
export function monthlyFrame(anchor, freqPerWeek) {
  const perWeek = Math.max(0, parseFloat(freqPerWeek) || 0);
  const sessions = Math.round(perWeek * GROUP.weeksPerMonth);
  const rule = GROUP.frameDiscount.find((r) => sessions >= r.minSessions);
  const discountPct = rule ? rule.pct : 0;
  const total = round10(anchor * sessions * (1 - discountPct));
  return { sessions, discountPct, total };
}

// Phone-ready offer sentence with the numbers embedded.
export function offerSentence({ sessions, total }) {
  return `בוא נתחיל בחודש ראשון של ${sessions} מפגשים ב-${total.toLocaleString('he-IL')}₪ — הקבוצה מרגישה את השיטה, ואז קובעים מסגרת קבועה`;
}

// Compare the client's proposed per-session price to our anchor / floor.
export function compareOffer(proposed, { anchor, floor }) {
  const p = parseInt(String(proposed == null ? '' : proposed).replace(/[^\d]/g, ''), 10);
  if (!Number.isFinite(p) || p <= 0) return null;
  if (p >= anchor) return { level: 'above', color: '#16a34a', label: 'מעל העוגן', proposed: p };
  if (p >= floor) return { level: 'in', color: '#C24A0A', label: 'בטווח', proposed: p };
  return { level: 'below', color: '#dc2626', label: 'מתחת למינימום', note: 'מתחת לרצפה הקשיחה', proposed: p };
}

export const nis = (n) => `${Number(n).toLocaleString('he-IL')}₪`;
