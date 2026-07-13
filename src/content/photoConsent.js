// ============================================================
// AthletiGo — Photo consent copy (edit the text here)
//
// Single source of truth for every string in the photo-consent
// onboarding step, the returning-trainee dialog, the gallery gate
// and the settings card. Change wording here; no component edits.
// ============================================================

export const PHOTO_CONSENT_CONTENT = {
  title: 'תיעוד ההתקדמות שלך',

  explainer:
    'במהלך האימונים אנחנו מצלמים תרגילים כדי לעקוב אחרי ההתקדמות שלך — ' +
    'לראות איך התנועה משתפרת לאורך זמן. הצילומים נשמרים באזור האישי שלך ' +
    'ונגישים רק לך ולמאמן.',

  // 1) Documentation consent — mandatory choice to continue. Refusing
  //    is allowed and switches the gallery off for this trainee.
  documentation: {
    heading: 'הסכמה לתיעוד אימונים',
    required: true,
    allowLabel: 'מאשר/ת שהמאמן יצלם אותי לצורך מעקב מקצועי',
    denyLabel: 'לא מאשר/ת',
    denyHint: 'ללא הסכמה זו לא ניתן יהיה להעלות תמונות או וידאו לגלריה שלך.',
  },

  // 2) Marketing consent — fully optional, default not-approved.
  marketing: {
    heading: 'הסכמה לשימוש שיווקי',
    allowLabel:
      'מאשר/ת שימוש בצילומים שלי בעמודי המדיה החברתית ובאתר של AthletiGo ' +
      '(ניתן לביטול בכל עת)',
    denyLabel: 'לא מאשר/ת',
    note: 'גם אם תאשר/י, כל צילום ספציפי דורש את אישורך לפני פרסום.',
  },

  // Minor path — both consents signed by the guardian, not the child.
  minor: {
    banner: 'מאחר שהמתאמן/ת קטין/ה, ההסכמות נחתמות על ידי ההורה או האפוטרופוס.',
    signerNameLabel: 'שם ההורה / האפוטרופוס',
    relationLabel: 'קרבה',
    signatureLabel: 'חתימת ההורה / האפוטרופוס',
    skipLabel: 'ההורה יאשר מאוחר יותר (הגלריה תישאר מושבתת)',
  },

  // Gallery gate messaging.
  gallery: {
    noConsent: 'אין הסכמת צילום — לא ניתן להעלות מדיה',
    marketingLockedHint: 'ניתן לסמן לשיתוף שיווקי רק לאחר אישור הסכמת שיווק',
    shareOn: 'מסומן לשיתוף שיווקי',
    shareOff: 'סמן לשיתוף שיווקי',
  },

  settings: {
    title: 'הסכמות צילום',
    manageBtn: 'עדכון / ביטול הסכמות צילום',
    statusDoc: 'תיעוד אימונים',
    statusMkt: 'שימוש שיווקי',
    allowed: 'מאושר',
    denied: 'לא מאושר',
    none: 'טרם נקבע',
  },

  saveLabel: 'שמירה',
  continueLabel: 'המשך',

  RELATION_OPTIONS: ['הורה', 'אפוטרופוס', 'בן/בת זוג', 'אח/ות', 'חבר', 'אחר'],
};
