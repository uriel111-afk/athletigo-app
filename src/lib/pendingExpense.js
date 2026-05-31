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

import { loadPendingBlob, clearPendingBlob } from './blobStorage';

const DRAFT_KEY = (userId) => `expense-form-draft-${userId || 'anon'}`;

function hasMeaningfulDraft(draft) {
  if (!draft || typeof draft !== 'object') return false;
  const has = (v) => v != null && String(v).trim() !== '';
  return has(draft.amount) || has(draft.category) ||
         has(draft.description) || has(draft.subcategory);
}

export async function detectPendingExpense(userId) {
  if (!userId) return { shouldReopen: false, hasBlob: false };
  try {
    const persisted = await loadPendingBlob();
    let draft = null;
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY(userId));
      draft = raw ? JSON.parse(raw) : null;
    } catch {}
    const draftOk = hasMeaningfulDraft(draft);
    const hasBlob = !!persisted?.blob;

    // Orphan blob (no meaningful text fields, but a photo lingers) —
    // clean it up so the next detection cycle doesn't try to restore
    // a photo into a fresh empty form.
    if (!draftOk && hasBlob) {
      try { await clearPendingBlob(); } catch {}
    }

    return { shouldReopen: draftOk, hasBlob };
  } catch (err) {
    console.warn('[pendingExpense] detect failed:', err);
    return { shouldReopen: false, hasBlob: false };
  }
}
