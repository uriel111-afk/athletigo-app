// Detect whether the user was mid-flow on an expense (form open with
// fields typed) when the WebView/Activity was destroyed in a previous
// session. If so, the parent page can auto-reopen ExpenseForm so the
// user doesn't have to manually retry.
//
// Single signal: the sessionStorage form draft. The earlier
// "smartcamera-pending-upload" handoff key is gone — SmartCamera now
// shows a blocking full-screen overlay during compress+upload so the
// WebView is kept alive through that window. Any in-flight upload
// completes before the user's attention shifts, and the URL lands in
// the form-draft via the normal setForm path.
//
// "Meaningful" means the user typed at least one of amount, category,
// description, or subcategory, OR the form already holds a receipt
// URL (a photo-only state is still worth reopening for).

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
