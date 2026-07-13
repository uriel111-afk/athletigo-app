// ============================================================
// Health Declaration & Liability Waiver — AthletiGo (read-only view)
//
// The ACTIVE health declaration is the signed PAR-Q form
// (HealthDeclarationForm → health_declarations). This file is only a
// READABLE copy of the declaration + waiver text so it can be opened
// from the legal documents list. It does NOT change the signing flow.
//
// ⚠️ PLACEHOLDER body — align with the real declaration wording when
// provided. Bump `version` on every material change.
// ============================================================

export const healthDeclaration = {
  id: 'health',
  title: 'הצהרת בריאות ופטור מאחריות',
  version: '0.1-draft',
  lastUpdated: '2026-07-13',
  isPlaceholder: true,
  intro: '⚠️ טקסט זמני — לקריאה בלבד. ההצהרה החתומה נשמרת בנפרד וחתומה במעמד ההרשמה.',
  sections: [
    {
      heading: '1. שאלון בריאות (PAR-Q)',
      body: '[[טקסט זמני]] שאלון קצר לאיתור מגבלות בריאותיות (לב, לחץ דם, מפרקים, נשימה, תרופות, ניתוחים ומגבלות רפואיות). מולא ונחתם במעמד ההרשמה.',
    },
    {
      heading: '2. הצהרת כשירות',
      body: '[[טקסט זמני]] המתאמן/ת מצהיר/ה כי מצבו/ה הבריאותי מאפשר השתתפות בפעילות גופנית.',
    },
    {
      heading: '3. פטור מאחריות',
      body: '[[טקסט זמני]] הבהרה כי פעילות גופנית כרוכה בסיכון מסוים, וכי האחריות לדיווח על מצב בריאותי ולפעולה לפי ההנחיות חלה על המתאמן/ת.',
    },
    {
      heading: '4. קטינים',
      body: '[[טקסט זמני]] עבור קטין/ה, ההצהרה נחתמת על ידי ההורה או האפוטרופוס.',
    },
  ],
};
