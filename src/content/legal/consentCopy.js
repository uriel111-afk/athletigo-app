// ============================================================
// Consent checkbox microcopy (edit here). The [bracketed] fragments
// become brand-orange underlined links that open the matching legal
// document. Keep the text short — one or two lines.
// ============================================================

export const CONSENT_COPY = {
  // Required — terms + privacy in a single checkbox.
  terms: {
    adult: { pre: 'קראתי ואני מסכים/ה ל', mid: ' ול', post: '' },
    minor: { pre: 'אני, ההורה/אפוטרופוס, קראתי ומאשר/ת את ', mid: ' ו', post: '' },
    termsLink: 'תנאי השימוש',
    privacyLink: 'מדיניות הפרטיות',
  },
  // Optional — photo documentation + marketing in a single checkbox.
  photo: {
    adult: { pre: 'אני מאשר/ת ', post: ' ושימוש בצילומים בערוצי השיווק של AthletiGo' },
    minor: { pre: 'אני, ההורה/אפוטרופוס, מאשר/ת ', post: ' ושימוש בצילומים בערוצי השיווק של AthletiGo' },
    link: 'צילום ותיעוד ההתקדמות',
    note: 'ניתן לבטל בכל עת בהגדרות',
  },
  minorBanner: 'מאחר שהמתאמן/ת קטין/ה, ההסכמות נחתמות על ידי ההורה או האפוטרופוס.',
  signerNameLabel: 'שם ההורה / האפוטרופוס',
  relationLabel: 'קרבה',
  signatureLabel: 'חתימת ההורה / האפוטרופוס',
  RELATION_OPTIONS: ['הורה', 'אפוטרופוס', 'בן/בת זוג', 'אח/ות', 'חבר', 'אחר'],
};
