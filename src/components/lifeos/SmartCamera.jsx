import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { compressImage } from '@/lib/imageCompression';
import { pushDebugLog } from '@/lib/debugLog';
import { LIFEOS_COLORS } from '@/lib/lifeos/lifeos-constants';

// Upload-immediately design with a full-screen "keep me alive" overlay.
//
// After the user picks a file we compress and upload in one shot, then
// hand the parent a plain { url, path, bucket } string set. During the
// compress + upload window we render a fixed-position overlay portaled
// into document.body. The overlay does two jobs:
//   1. Visibly blocks the user from interacting with anything else,
//      so Android Chrome keeps the WebView in the foreground and
//      doesn't tear down the React tree mid-upload.
//   2. Gives the user a clear "wait, don't close" signal — much
//      better than a small inline spinner inside the dialog.
//
// Earlier iterations relied on IndexedDB blob persistence + a
// sessionStorage handoff to recover when the WebView WAS destroyed
// mid-upload. With the overlay in place that destruction shouldn't
// happen often enough to be worth the recovery complexity, so those
// layers are gone. The form-draft sessionStorage (typed fields)
// is preserved separately by ExpenseForm and still rescues the
// user's text input if a real crash happens.

const UPLOAD_TIMEOUT_MS = 60000;
const LOCK_RETRY_MAX = 3;
const LOCK_RETRY_BACKOFF_MS = 500;

// Module-level upload guard. The camera intent on Android Chrome can
// race two pickers (e.g. an in-flight upload from a torn-down tree and
// a fresh pick from the remounted tree). With this flag the second
// pick is dropped instead of fighting the first one for an auth lock /
// storing-the-newer-then-older URL. `uploadStartedAt` is a watchdog: if
// the flag has been stuck true for > 90s we assume the old closure was
// orphaned and let the next pick proceed anyway.
let uploadInProgress = false;
let uploadStartedAt = 0;
const UPLOAD_GUARD_TIMEOUT_MS = 90_000;

const withTimeout = (promise, ms, label) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(
    () => reject(new Error(`${label} timed out after ${ms / 1000}s`)),
    ms,
  )),
]);

// True when the error came from Supabase's auth-js navigator.locks
// path stealing a held lock — defensive across versions/casings since
// the underlying API is third-party.
function isLockBrokenError(err) {
  const m = String(err?.message || '').toLowerCase();
  return m.includes('lock broken') || m.includes("'steal'") || m.includes('steal option');
}

async function uploadToStorageWithRetry(blob) {
  let lastErr = null;
  for (let attempt = 1; attempt <= LOCK_RETRY_MAX; attempt++) {
    try {
      return await uploadToStorage(blob);
    } catch (err) {
      lastErr = err;
      if (!isLockBrokenError(err) || attempt === LOCK_RETRY_MAX) throw err;
      const wait = LOCK_RETRY_BACKOFF_MS * attempt;
      pushDebugLog('SmartCamera', 'upload-lock-retry', {
        attempt, waitMs: wait, error: err?.message || String(err),
      });
      await new Promise(r => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

async function uploadToStorage(blob) {
  const PRIMARY_BUCKET = 'lifeos-files';
  const FALLBACK_BUCKET = 'media';

  const { data: { user } = {}, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) throw new Error('Not authenticated');

  const path = `lifeos/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;

  let primary;
  try {
    primary = await withTimeout(
      supabase.storage.from(PRIMARY_BUCKET).upload(path, blob, {
        upsert: true, contentType: 'image/jpeg',
      }),
      UPLOAD_TIMEOUT_MS,
      `${PRIMARY_BUCKET} upload`,
    );
  } catch (timeoutErr) {
    primary = { error: timeoutErr };
  }

  if (!primary.error) {
    const { data: urlData } = supabase.storage.from(PRIMARY_BUCKET).getPublicUrl(path);
    const publicUrl = urlData?.publicUrl;
    if (!publicUrl) throw new Error('getPublicUrl returned no URL (primary)');
    return { url: publicUrl, path, bucket: PRIMARY_BUCKET };
  }

  let fallback;
  try {
    fallback = await withTimeout(
      supabase.storage.from(FALLBACK_BUCKET).upload(path, blob, {
        upsert: true, contentType: 'image/jpeg',
      }),
      UPLOAD_TIMEOUT_MS,
      `${FALLBACK_BUCKET} upload`,
    );
  } catch (timeoutErr) {
    fallback = { error: timeoutErr };
  }

  if (fallback.error) {
    const err = new Error(
      'שתי הבקטות נכשלו: ' +
      (primary.error.message || 'unknown') + ' / ' +
      (fallback.error.message || 'unknown'),
    );
    err.primaryError = primary.error.message;
    err.fallbackError = fallback.error.message;
    throw err;
  }

  const { data: urlData } = supabase.storage.from(FALLBACK_BUCKET).getPublicUrl(path);
  const publicUrl = urlData?.publicUrl;
  if (!publicUrl) throw new Error('getPublicUrl returned no URL (fallback)');
  return { url: publicUrl, path, bucket: FALLBACK_BUCKET };
}

async function deleteFromStorage(bucket, path) {
  if (!bucket || !path) return;
  try {
    await supabase.storage.from(bucket).remove([path]);
    pushDebugLog('SmartCamera', 'storage-delete-ok', { bucket, path });
  } catch (err) {
    pushDebugLog('SmartCamera', 'storage-delete-fail', {
      bucket, path, error: err?.message || String(err),
    });
  }
}

// ── Direct-DOM overlay ──────────────────────────────────────────────
// React's render cycle is too slow for this job: between an onChange
// handler returning and React committing the next render, Android can
// already have decided to tear the Activity down (the file-picker
// intent's return path is one of the worst windows for this). By
// appending a plain DOM element to document.body *synchronously*
// before any async work runs and yielding one animation frame, we
// give the OS a visible UI signal that the WebView is in active use
// — and we also outlive React unmounts since the overlay isn't part
// of the React tree.
//
// All helpers below are module-scoped so they can be called from
// anywhere in the file (inside or outside the component) without
// taking a closure on stale state.

const OVERLAY_ID = 'smartcamera-overlay';
const OVERLAY_STATUS_ID = 'smartcamera-overlay-status';
const OVERLAY_STYLE_ID = 'smartcamera-overlay-style';

function ensureOverlayStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(OVERLAY_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = OVERLAY_STYLE_ID;
  style.textContent = `
    @keyframes smartcamera-overlay-spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}

function injectOverlay(initialStatus) {
  if (typeof document === 'undefined') return null;
  ensureOverlayStyles();
  let overlay = document.getElementById(OVERLAY_ID);
  if (overlay) {
    // Idempotent — just update the status if the overlay is already
    // up (e.g. a second pick mid-flight).
    const statusEl = overlay.querySelector('#' + OVERLAY_STATUS_ID);
    if (statusEl) statusEl.textContent = initialStatus;
    return overlay;
  }
  overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.style.cssText = [
    'position: fixed',
    'top: 0', 'left: 0', 'right: 0', 'bottom: 0',
    'background-color: rgba(0, 0, 0, 0.92)',
    'z-index: 999999',
    'display: flex',
    'flex-direction: column',
    'align-items: center',
    'justify-content: center',
    'gap: 24px',
    'padding: 20px',
    'direction: rtl',
    'font-family: inherit',
    'touch-action: none',
    'user-select: none',
  ].join('; ');
  // innerHTML is safe here — all strings are static Hebrew constants
  // with no HTML metacharacters. The dynamic status text updates via
  // textContent below.
  overlay.innerHTML = `
    <div style="
      width: 70px; height: 70px;
      border: 6px solid rgba(255, 111, 32, 0.2);
      border-top: 6px solid #FF6F20;
      border-radius: 50%;
      animation: smartcamera-overlay-spin 0.8s linear infinite;
    "></div>
    <div id="${OVERLAY_STATUS_ID}" style="
      color: #FFFFFF; font-size: 20px; font-weight: 700;
      text-align: center;
    "></div>
    <div style="
      color: #FFFFFF; font-size: 15px; opacity: 0.85;
      text-align: center; max-width: 280px;
    ">אל תסגור את האפליקציה</div>
  `;
  const statusEl = overlay.querySelector('#' + OVERLAY_STATUS_ID);
  if (statusEl) statusEl.textContent = initialStatus;
  document.body.appendChild(overlay);
  return overlay;
}

function updateOverlayStatus(status) {
  if (typeof document === 'undefined') return;
  const el = document.getElementById(OVERLAY_STATUS_ID);
  if (el) el.textContent = status;
}

function removeOverlay() {
  if (typeof document === 'undefined') return;
  const el = document.getElementById(OVERLAY_ID);
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

function showOverlayError(message, autoCloseMs = 3000) {
  if (typeof document === 'undefined') return;
  const overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) return;
  // Replace the spinner block with an error state. Static markup
  // again — the dynamic message is written via textContent.
  overlay.innerHTML = `
    <div style="font-size: 56px;">⚠️</div>
    <div id="${OVERLAY_STATUS_ID}" style="
      color: #FFFFFF; font-size: 18px; font-weight: 700;
      text-align: center; max-width: 320px; padding: 0 20px;
    "></div>
  `;
  const el = document.getElementById(OVERLAY_STATUS_ID);
  if (el) el.textContent = message;
  setTimeout(() => removeOverlay(), autoCloseMs);
}

const SmartCamera = forwardRef(function SmartCamera(
  {
    label: _label = 'צלם קבלה',
    onUploaded,
    onCleared,
    compact = false,
    initialUrl = null,
    initialPath = null,
    initialBucket = null,
  },
  ref,
) {
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const [previewUrl, setPreviewUrl] = useState(initialUrl || null);
  const [uploadedUrl, setUploadedUrl] = useState(initialUrl || null);
  const [uploadedPath, setUploadedPath] = useState(initialPath || null);
  const [uploadedBucket, setUploadedBucket] = useState(initialBucket || null);
  // 'idle' | 'compressing' | 'uploading' — drives the full-screen
  // overlay below. Reset back to 'idle' on success or error so the
  // overlay disappears and the inline preview takes over.
  const [uploadStatus, setUploadStatus] = useState('idle');
  const [sizeBefore, setSizeBefore] = useState(null);
  const [sizeAfter, setSizeAfter] = useState(null);

  // Derived flags so existing render-site checks read naturally.
  const compressing = uploadStatus === 'compressing';
  const uploading = uploadStatus === 'uploading';

  // Mount/unmount marker for log diagnosis. Initial hydration from
  // the initialUrl prop is intentionally silent — the parent already
  // has the value; the preview shows because previewUrl/uploadedUrl
  // were seeded directly from props.
  useEffect(() => {
    pushDebugLog('SmartCamera', 'mount', {
      hasInitialUrl: !!initialUrl,
      initialPath: initialPath || null,
    });
    return () => { pushDebugLog('SmartCamera', 'unmount'); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useImperativeHandle(ref, () => ({
    getUploadedUrl: () => uploadedUrl,
    getUploadedPath: () => uploadedPath,
    getUploadedBucket: () => uploadedBucket,
    hasUploadedPhoto: () => !!uploadedUrl,
    isUploading: () => uploading,
    clear: async () => {
      if (uploadedPath && uploadedBucket) {
        await deleteFromStorage(uploadedBucket, uploadedPath);
      }
      setPreviewUrl(null);
      setUploadedUrl(null);
      setUploadedPath(null);
      setUploadedBucket(null);
      setSizeBefore(null);
      setSizeAfter(null);
    },
  }), [uploadedUrl, uploadedPath, uploadedBucket, uploading]);

  const openCamera = () => cameraInputRef.current?.click();
  const openGallery = () => galleryInputRef.current?.click();

  const handleFileSelect = async (event, source) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;

    // CRITICAL — inject the overlay SYNCHRONOUSLY before pushDebugLog
    // or any other work that could yield to the browser. The React
    // <Portal> overlay isn't fast enough: between this handler
    // returning and React's next commit, Android can already begin
    // tearing the Activity down (file-picker intent return is one of
    // the worst windows for this). A DOM element appended directly
    // to document.body and a single requestAnimationFrame guarantee
    // a painted "we have visible UI" signal before we yield control.
    injectOverlay('דוחס תמונה');
    await new Promise(r => requestAnimationFrame(r));
    pushDebugLog('SmartCamera', 'overlay-injected-to-DOM');

    pushDebugLog('SmartCamera', 'file-input-onChange', {
      fileExists: !!file, source,
      fileSize: file?.size, fileName: file?.name, fileType: file?.type,
    });

    // Module-level guard against parallel uploads. Watchdog releases
    // the flag if it's been stuck longer than the timeout (orphaned
    // closure from a destroyed Activity).
    const elapsedSinceStart = Date.now() - uploadStartedAt;
    if (uploadInProgress && elapsedSinceStart < UPLOAD_GUARD_TIMEOUT_MS) {
      pushDebugLog('SmartCamera', 'upload-skipped-in-progress', {
        source, elapsedMs: elapsedSinceStart,
      });
      showOverlayError('יש העלאה בתהליך — נסה שוב בעוד רגע');
      return;
    }
    if (uploadInProgress) {
      pushDebugLog('SmartCamera', 'upload-guard-watchdog-released', {
        elapsedMs: elapsedSinceStart,
      });
    }
    uploadInProgress = true;
    uploadStartedAt = Date.now();

    try {
      await handleFileSelectInner(file, source);
    } finally {
      uploadInProgress = false;
    }
  };

  const handleFileSelectInner = async (file, source) => {
    // Replacing a previous upload — delete the old object so we don't
    // leak orphan files in Storage. Fire-and-forget; the new upload
    // proceeds regardless.
    if (uploadedPath && uploadedBucket) {
      pushDebugLog('SmartCamera', 'replacing-previous-upload', {
        previousPath: uploadedPath, previousBucket: uploadedBucket,
      });
      deleteFromStorage(uploadedBucket, uploadedPath);
      setUploadedUrl(null);
      setUploadedPath(null);
      setUploadedBucket(null);
    }

    setUploadStatus('compressing');
    setSizeBefore(file.size);
    setSizeAfter(null);
    setPreviewUrl(null);

    pushDebugLog('SmartCamera', 'before-compressImage', {
      source, fileSize: file.size, fileType: file.type, fileName: file.name,
    });
    let compressedBlob;
    try {
      compressedBlob = await compressImage(file);
    } catch (err) {
      setUploadStatus('idle');
      setSizeBefore(null);
      pushDebugLog('SmartCamera', 'compressImage-throw', {
        source, errorMessage: err?.message || String(err),
      });
      const msg = err?.message || 'שגיאה לא ידועה';
      const isHeic = String(msg).startsWith('HEIC_NOT_SUPPORTED');
      const display = isHeic
        ? msg.replace('HEIC_NOT_SUPPORTED:', '').trim()
        : 'דחיסת תמונה נכשלה: ' + msg;
      showOverlayError(display);
      return;
    }
    pushDebugLog('SmartCamera', 'compressImage-result', {
      source, originalSize: file.size, compressedSize: compressedBlob.size,
      compressedType: compressedBlob.type, twoPass: !!compressedBlob.twoPass,
    });
    setSizeAfter(compressedBlob.size);

    // Instant blob preview while the upload runs. Swapped to the public
    // URL once the upload completes (visually identical, lets us revoke
    // the blob URL to free memory).
    let blobPreviewUrl = null;
    try {
      blobPreviewUrl = URL.createObjectURL(compressedBlob);
      setPreviewUrl(blobPreviewUrl);
    } catch (urlErr) {
      pushDebugLog('SmartCamera', 'createObjectURL-throw', {
        source, errorMessage: urlErr?.message || String(urlErr),
      });
    }
    setUploadStatus('uploading');
    updateOverlayStatus('מעלה תמונה');

    pushDebugLog('SmartCamera', 'before-uploadToStorage', {
      source, blobSize: compressedBlob.size,
    });
    let result;
    try {
      result = await uploadToStorageWithRetry(compressedBlob);
    } catch (err) {
      setUploadStatus('idle');
      pushDebugLog('SmartCamera', 'uploadToStorage-throw', {
        source, errorMessage: err?.message || String(err),
        primaryError: err?.primaryError, fallbackError: err?.fallbackError,
      });
      if (blobPreviewUrl) {
        try { URL.revokeObjectURL(blobPreviewUrl); } catch {}
      }
      setPreviewUrl(null);
      setSizeBefore(null);
      setSizeAfter(null);
      showOverlayError('העלאה נכשלה: ' + (err?.message || 'שגיאה לא ידועה'));
      return;
    }
    pushDebugLog('SmartCamera', 'uploadToStorage-success', {
      source, url: String(result.url).slice(0, 80),
      path: result.path, bucket: result.bucket,
    });

    setUploadedUrl(result.url);
    setUploadedPath(result.path);
    setUploadedBucket(result.bucket);
    if (blobPreviewUrl) {
      try { URL.revokeObjectURL(blobPreviewUrl); } catch {}
    }
    setPreviewUrl(result.url);
    setUploadStatus('idle');
    removeOverlay();
    pushDebugLog('SmartCamera', 'overlay-removed');

    onUploaded?.({
      url: result.url, path: result.path, bucket: result.bucket,
      size: compressedBlob.size,
    });
    pushDebugLog('SmartCamera', 'onUploaded-fired', {
      url: String(result.url).slice(0, 80),
    });
  };

  const handleCameraChange = (event) => handleFileSelect(event, 'camera');
  const handleGalleryChange = (event) => handleFileSelect(event, 'gallery');

  const handleCancel = () => {
    pushDebugLog('SmartCamera', 'cancel-tapped', {
      hadUploaded: !!uploadedUrl,
      uploadedPath, uploadedBucket,
    });
    // Delete the orphan from Storage so we don't accumulate trash. The
    // delete is fire-and-forget; even if it fails the UI clears so the
    // user can pick again.
    if (uploadedPath && uploadedBucket) {
      deleteFromStorage(uploadedBucket, uploadedPath);
    }
    if (previewUrl && previewUrl.startsWith('blob:')) {
      try { URL.revokeObjectURL(previewUrl); } catch {}
    }
    setPreviewUrl(null);
    setUploadedUrl(null);
    setUploadedPath(null);
    setUploadedBucket(null);
    setSizeBefore(null);
    setSizeAfter(null);
    onCleared?.();
  };

  // ── Render ──────────────────────────────────────────────────────
  // The "keep me alive" overlay is owned by the DOM helpers at the top
  // of this file (injectOverlay / updateOverlayStatus / removeOverlay /
  // showOverlayError). It is injected synchronously from inside
  // handleFileSelect — too early for any React render to catch — and
  // outlives React unmounts because it isn't part of the React tree.

  const hiddenInputs = (
    <>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCameraChange}
        style={{ display: 'none' }}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        onChange={handleGalleryChange}
        style={{ display: 'none' }}
      />
    </>
  );

  if (!previewUrl) {
    return (
      <>
        {hiddenInputs}
        <div style={{ display: 'flex', gap: 8, width: '100%' }} dir="rtl">
          <button
            type="button"
            onClick={openCamera}
            style={pickerButtonStyle(compact)}
            aria-label="צלם קבלה"
          >
            <span style={{ fontSize: compact ? 14 : 18, lineHeight: 1 }}>📷</span>
            <span>צלם</span>
          </button>
          <button
            type="button"
            onClick={openGallery}
            style={pickerButtonStyle(compact)}
            aria-label="בחר מהגלריה"
          >
            <span style={{ fontSize: compact ? 14 : 18, lineHeight: 1 }}>🖼️</span>
            <span>גלריה</span>
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {hiddenInputs}
      <div style={{
        border: `1px solid ${LIFEOS_COLORS.border}`, borderRadius: 12, padding: 8,
      }}>
        <div style={{ position: 'relative' }}>
          <img
            src={previewUrl}
            alt="receipt preview"
            style={{
              width: '100%', maxHeight: 220, objectFit: 'contain', borderRadius: 8,
              display: 'block',
            }}
          />
          <button
            type="button"
            onClick={handleCancel}
            aria-label="ביטול"
            style={{
              position: 'absolute', top: 6, left: 6,
              width: 28, height: 28, borderRadius: 999, border: 'none',
              backgroundColor: 'rgba(0,0,0,0.6)', color: '#FFFFFF',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <X size={14} />
          </button>
        </div>
        {uploadedUrl && (
          <div style={{
            marginTop: 8, fontSize: 12, color: '#16A34A', fontWeight: 700,
            textAlign: 'center', direction: 'rtl',
          }}>
            ✓ התמונה הועלתה
            {sizeAfter ? ` (${Math.round(sizeAfter / 1024)} KB)` : ''}
          </div>
        )}
        {(sizeBefore && sizeAfter) && (
          <div style={{
            fontSize: 11, color: '#6b7280', textAlign: 'center',
            padding: 6, background: '#FAFAFA',
            borderRadius: 6, marginTop: 8,
          }}>
            {sizeBefore !== sizeAfter ? (
              <>
                {(sizeBefore / 1024).toFixed(0)} KB ← {(sizeAfter / 1024).toFixed(0)} KB
                {' · '}
                <span style={{ color: '#16A34A', fontWeight: 700 }}>
                  נחסך {(((sizeBefore - sizeAfter) / sizeBefore) * 100).toFixed(0)}%
                </span>
              </>
            ) : (
              <span>{(sizeAfter / 1024).toFixed(0)} KB</span>
            )}
          </div>
        )}
      </div>
    </>
  );
});

function pickerButtonStyle(compact) {
  return {
    flex: 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: compact ? '8px 10px' : '12px 14px',
    borderRadius: 10,
    border: `1px dashed ${LIFEOS_COLORS.primary}`,
    backgroundColor: '#FFF8F3', color: LIFEOS_COLORS.primary,
    fontSize: compact ? 12 : 14, fontWeight: 700, cursor: 'pointer',
    fontFamily: 'inherit',
  };
}

export default SmartCamera;
