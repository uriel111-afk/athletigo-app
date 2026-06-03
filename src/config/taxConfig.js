// ═══════════════════════════════════════════════════════════════════
// taxConfig — מספרי מס לעוסק פטור, 2026
// ═══════════════════════════════════════════════════════════════════
// אומדנים בלבד. לעדכון כל שנה מול רואה חשבון.
// המשתמש הוא עוסק פטור: אין מע"מ בחישובים — לא בהכנסות ולא בהוצאות.
// ═══════════════════════════════════════════════════════════════════

export const creditPoints = 2.25;
export const creditPointValueMonthly = 242;

export const incomeTaxBracketsAnnual = [
  { upTo: 84120,    rate: 0.10 },
  { upTo: 120720,   rate: 0.14 },
  { upTo: 193800,   rate: 0.20 },
  { upTo: 269280,   rate: 0.31 },
  { upTo: 560280,   rate: 0.35 },
  { upTo: Infinity, rate: 0.47 },
];

export const bituachLeumiReducedRate = 0.0597;
export const bituachLeumiFullRate = 0.1783;
export const bituachLeumiReducedThresholdMonthly = 7703;
export const bituachLeumiMinMonthly = 250;

// ─── פונקציות עזר ───────────────────────────────────────────────

// מס הכנסה שנתי מדורג, פחות זיכוי נקודות זיכוי.
// פחות מאפס יחזיר אפס.
export function estimateIncomeTaxAnnual(profitAnnual) {
  const profit = Math.max(0, Number(profitAnnual) || 0);
  let tax = 0;
  let prev = 0;
  for (const b of incomeTaxBracketsAnnual) {
    if (profit <= prev) break;
    const slice = Math.min(profit, b.upTo) - prev;
    if (slice > 0) tax += slice * b.rate;
    prev = b.upTo;
  }
  const creditAnnual = creditPoints * creditPointValueMonthly * 12;
  return Math.max(0, tax - creditAnnual);
}

// ביטוח לאומי חודשי. שיעור מופחת עד הסף החודשי, שיעור מלא מעל הסף.
// לעולם לא פחות מהמינימום החודשי.
export function estimateBituachLeumiMonthly(incomeMonthly) {
  const inc = Math.max(0, Number(incomeMonthly) || 0);
  let amount;
  if (inc <= bituachLeumiReducedThresholdMonthly) {
    amount = inc * bituachLeumiReducedRate;
  } else {
    amount = bituachLeumiReducedThresholdMonthly * bituachLeumiReducedRate
           + (inc - bituachLeumiReducedThresholdMonthly) * bituachLeumiFullRate;
  }
  return Math.max(amount, bituachLeumiMinMonthly);
}
