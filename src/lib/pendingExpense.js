// Detect whether the user was mid-flow on an expense (form open with
// fields typed and/or a photo URL captured) when the WebView/Activity
// was destroyed in a previous session. If so, the parent page can
// auto-reopen ExpenseForm so the user doesn't have to manually retry.
//
// Storage layer is sessionStorage only — the form draft now carries
// the receipt URL alongside the regular fields, so a single key
// captures everything we need to restore. The previous IndexedDB
// blob layer is gone (the upload-immediately design in SmartCamera
// turns the receipt into a plain URL string before we have to worry
// about persistence).
//
// "Meaningful" means the user typed at least one of amount, category,
// description, or subcategory, OR they already uploaded a receipt
// (the photo upload alone is worth reopening for — losing it is the
// painful failure mode this whole system was built to prevent).

import { pushDebugLog } from './debugLog';

const DRAFT_KEY = (userId) => `expense-form-draft-${userId || 'anon'}`;

function hasMeaningfulDraft(draft) {
  if (!draft || typeof draft !== 'object') return false;
  const has = (v) => v != null && String(v).trim() !== '';
  return has(draft.amount) || has(draft.category) ||
         has(draft.description) || has(draft.subcategory) ||
         has(draft.receipt_url);
}

export async function detectPendingExpense(userId) {
  if (!userId) {
    pushDebugLog('pendingExpense', 'detect-skip-no-userid');
    return { shouldReopen: false, hasBlob: false };
  }
  try {
    let draft = null;
    let rawDraft = null;
    try {
      rawDraft = sessionStorage.getItem(DRAFT_KEY(userId));
      draft = rawDraft ? JSON.parse(rawDraft) : null;
    } catch {}
    const shouldReopen = hasMeaningfulDraft(draft);
    pushDebugLog('pendingExpense', 'detect-state', {
      hasRawDraft: !!rawDraft,
      amount: draft?.amount || null,
      category: draft?.category || null,
      hasDescription: !!(draft?.description && String(draft.description).trim()),
      hasSubcategory: !!(draft?.subcategory && String(draft.subcategory).trim()),
      hasReceiptUrl: !!(draft?.receipt_url && String(draft.receipt_url).trim()),
      shouldReopen,
    });
    return { shouldReopen, hasBlob: false };
  } catch (err) {
    pushDebugLog('pendingExpense', 'detect-error', { error: err?.message || String(err) });
    return { shouldReopen: false, hasBlob: false };
  }
}
