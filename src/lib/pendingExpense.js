// Detect whether the user was mid-flow on an expense (form open with
// fields typed and/or a photo picked) when the WebView/Activity was
// destroyed in a previous session. If so, the parent page can
// auto-reopen ExpenseForm so the user doesn't have to manually retry.
//
// Two storage layers feed this:
//   • sessionStorage 'expense-form-draft-${userId}' — the form fields.
//     Persisted by ExpenseForm itself on every change. Cleared by
//     ExpenseForm.closeForm on success / cancel / dialog-openchange.
//   • IndexedDB pending-photo-blob — the compressed Blob. Persisted by
//     SmartCamera.handleFileSelect. Cleared by closeForm.
//
// "Meaningful" means the user typed at least one of amount, category,
// description, or subcategory. Anything else (just the default date,
// recurring_frequency='monthly') is treated as an empty/initial draft
// that was persisted automatically on first render — not worth
// auto-reopening for.

import { loadPendingBlob } from './blobStorage';
import { pushDebugLog } from './debugLog';

const DRAFT_KEY = (userId) => `expense-form-draft-${userId || 'anon'}`;

function hasMeaningfulDraft(draft) {
  if (!draft || typeof draft !== 'object') return false;
  const has = (v) => v != null && String(v).trim() !== '';
  return has(draft.amount) || has(draft.category) ||
         has(draft.description) || has(draft.subcategory);
}

export async function detectPendingExpense(userId) {
  if (!userId) {
    pushDebugLog('pendingExpense', 'detect-skip-no-userid');
    return { shouldReopen: false, hasBlob: false };
  }
  try {
    const persisted = await loadPendingBlob();
    let draft = null;
    let rawDraft = null;
    try {
      rawDraft = sessionStorage.getItem(DRAFT_KEY(userId));
      draft = rawDraft ? JSON.parse(rawDraft) : null;
    } catch {}
    const draftOk = hasMeaningfulDraft(draft);
    const hasBlob = !!persisted?.blob;
    pushDebugLog('pendingExpense', 'detect-state', {
      hasRawDraft: !!rawDraft,
      amount: draft?.amount || null,
      category: draft?.category || null,
      hasDescription: !!(draft?.description && String(draft.description).trim()),
      hasSubcategory: !!(draft?.subcategory && String(draft.subcategory).trim()),
      draftOk,
      hasBlob,
      blobSize: persisted?.blob?.size,
      blobAgeMs: persisted?.savedAt ? Date.now() - persisted.savedAt : null,
    });

    // CHANGED 2026-06-02 (Oriel): previously, when there was a blob but
    // no meaningful draft, we would clearPendingBlob() to avoid restoring
    // a photo into a fresh empty form. That logic killed the gallery
    // flow on Android Chrome: the file-picker intent destroys the
    // WebView mid-pick, the page reloads BEFORE the user has typed an
    // amount/category, detectPendingExpense runs, finds an orphan blob,
    // and deletes it. The photo is then permanently lost — even though
    // the user clearly picked one. New behavior: reopen the form when
    // EITHER the draft is meaningful OR a recent blob exists, so
    // SmartCamera's mount-restore effect can rehydrate the preview from
    // IDB and let the user finish the entry. Stale blobs are still
    // bounded by the 30-minute TTL in blobStorage.js.
    return { shouldReopen: draftOk || hasBlob, hasBlob };
  } catch (err) {
    pushDebugLog('pendingExpense', 'detect-error', { error: err?.message || String(err) });
    return { shouldReopen: false, hasBlob: false };
  }
}
