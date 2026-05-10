// Canonical Hebrew payment-method list for the unified add-package
// wizard. Stored as Hebrew text in client_services.payment_method.
// Order is intentional and renders as-is in the dropdown — do NOT
// reorder without updating the spec.
export const PAYMENT_METHODS = [
  'אשראי',
  'תשלומים',
  'ביט',
  'פייבוקס',
  'העברה בנקאית',
  'מזומן',
  "צ'ק",
];

// Legacy English values that lived in client_services.payment_method
// before the May 2026 Hebrew migration. Used to pre-select the
// dropdown when editing an old package row so the coach doesn't see
// an empty <select> and accidentally overwrite it on save.
const LEGACY_TO_HEBREW = {
  credit:         'אשראי',
  installments:   'תשלומים',
  bit:            'ביט',
  paybox:         'פייבוקס',
  transfer:       'העברה בנקאית',
  bank:           'העברה בנקאית',
  bank_transfer:  'העברה בנקאית',
  cash:           'מזומן',
  check:          "צ'ק",
  cheque:         "צ'ק",
  // Less-common legacy buckets — fall back to "אשראי" so the dropdown
  // still has a selected value. Coach can re-pick on save.
  standing_order: 'אשראי',
  apple_pay:      'אשראי',
  google_pay:     'אשראי',
  paypal:         'אשראי',
  other:          'אשראי',
};

// Resolve any value (Hebrew canonical, legacy English, or unknown) to
// a Hebrew option that exists in PAYMENT_METHODS, or '' when the row
// genuinely has no payment method recorded.
export const toHebrewPaymentMethod = (raw) => {
  if (!raw) return '';
  if (PAYMENT_METHODS.includes(raw)) return raw;
  return LEGACY_TO_HEBREW[raw] || '';
};
