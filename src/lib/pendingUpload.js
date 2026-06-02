// sessionStorage handoff for SmartCamera uploads that complete after
// their owning React tree has unmounted. The Android Chrome camera /
// gallery intent can tear down the dialog (and even the ExpenseForm)
// mid-compress, leaving the in-flight upload to land its result on a
// stale closure. We persist { url, path, bucket } to this key the
// instant the upload succeeds so the freshly-mounted SmartCamera (or
// the Expenses auto-reopen check) can pick it up and surface the
// preview to the user.

import { pushDebugLog } from './debugLog';

export const SS_PENDING_KEY = 'smartcamera-pending-upload';
export const SS_PENDING_TTL_MS = 60_000;
export const UPLOAD_COMPLETE_EVENT = 'smartcamera-upload-complete';

export function writePendingUploadToSession(payload) {
  try {
    sessionStorage.setItem(SS_PENDING_KEY, JSON.stringify({
      ...payload,
      uploadedAt: Date.now(),
    }));
    return true;
  } catch (err) {
    pushDebugLog('pendingUpload', 'write-throw', {
      error: err?.message || String(err),
    });
    return false;
  }
}

export function readPendingUploadFromSession() {
  try {
    const raw = sessionStorage.getItem(SS_PENDING_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.url || !data?.uploadedAt) {
      sessionStorage.removeItem(SS_PENDING_KEY);
      return null;
    }
    if (Date.now() - data.uploadedAt > SS_PENDING_TTL_MS) {
      sessionStorage.removeItem(SS_PENDING_KEY);
      return null;
    }
    return data;
  } catch {
    try { sessionStorage.removeItem(SS_PENDING_KEY); } catch {}
    return null;
  }
}

export function clearPendingUploadFromSession() {
  try { sessionStorage.removeItem(SS_PENDING_KEY); } catch {}
}
