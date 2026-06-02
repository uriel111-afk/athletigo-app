import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { compressImage } from '@/lib/imageCompression';
import { pushDebugLog } from '@/lib/debugLog';
import {
  UPLOAD_COMPLETE_EVENT,
  writePendingUploadToSession,
  readPendingUploadFromSession,
  clearPendingUploadFromSession,
} from '@/lib/pendingUpload';
import { LIFEOS_COLORS } from '@/lib/lifeos/lifeos-constants';

// Upload-immediately design (replaces the old deferred-upload / IDB-blob
// pattern). After the user picks a file we compress and upload in one
// shot, then hand the parent a plain { url, path, bucket } string set.
//
// Why: the old design held the compressed Blob in React state and
// relied on IndexedDB to survive Android Chrome's WebView reset during
// the file-picker intent. That created a long tail of edge cases
// (orphan-blob cleanup, mount-restore races, sessionStorage draft
// mismatch) and a single missed branch deleted the photo entirely. A
// string URL persisted in form-draft sessionStorage has none of those
// failure modes — even if the Activity dies mid-flow, the URL is
// already a public Storage object the next session can read directly.

const UPLOAD_TIMEOUT_MS = 60000;

const withTimeout = (promise, ms, label) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(
    () => reject(new Error(`${label} timed out after ${ms / 1000}s`)),
    ms,
  )),
]);

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

// Detached-upload recovery helpers live in `src/lib/pendingUpload.js`.
// They expose the sessionStorage key + custom event name so the upload
// success path can persist the URL the moment Storage returns one, and
// any later-mounted SmartCamera can pick it up via mount-effect or
// event listener — even if the original component closure already
// unmounted (Android Chrome camera-intent tear-down).

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
  const [compressing, setCompressing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sizeBefore, setSizeBefore] = useState(null);
  const [sizeAfter, setSizeAfter] = useState(null);

  // Refs to keep the restore effect closure stable across re-renders
  // without taking onUploaded as a dependency (which would tear down
  // and re-register the listener on every parent render).
  const onUploadedRef = useRef(onUploaded);
  useEffect(() => { onUploadedRef.current = onUploaded; }, [onUploaded]);
  const uploadedUrlRef = useRef(uploadedUrl);
  useEffect(() => { uploadedUrlRef.current = uploadedUrl; }, [uploadedUrl]);

  // Mount/unmount marker for log diagnosis. Initial hydration from the
  // initialUrl prop is intentionally silent (no onUploaded re-fire):
  // the parent already has the value, this is just so the user sees
  // the preview after a sessionStorage-driven restore.
  useEffect(() => {
    pushDebugLog('SmartCamera', 'mount', {
      hasInitialUrl: !!initialUrl,
      initialPath: initialPath || null,
    });
    return () => { pushDebugLog('SmartCamera', 'unmount'); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Detached-upload recovery. Two trigger points:
  //   (a) immediate read at mount — handles "old upload finished
  //       BEFORE the new component mounted"
  //   (b) window event listener — handles "old upload finishes AFTER
  //       the new component is already mounted"
  // Idempotent: if we already hold the same uploadedUrl, skip. Clears
  // the sessionStorage key after applying so a later remount doesn't
  // double-fire onUploaded.
  useEffect(() => {
    let active = true;

    const tryRestore = () => {
      if (!active) return;
      const data = readPendingUploadFromSession();
      if (!data) return;
      if (uploadedUrlRef.current === data.url) {
        // Same URL we already hold — clear the key so we don't
        // accidentally restore again on the next mount.
        clearPendingUploadFromSession();
        return;
      }
      pushDebugLog('SmartCamera', 'upload-restored-from-session', {
        url: String(data.url).slice(0, 80),
        path: data.path,
        bucket: data.bucket,
        ageMs: Date.now() - data.uploadedAt,
      });
      setUploadedUrl(data.url);
      setUploadedPath(data.path);
      setUploadedBucket(data.bucket);
      setPreviewUrl(data.url);
      setCompressing(false);
      setUploading(false);
      clearPendingUploadFromSession();
      try {
        onUploadedRef.current?.({
          url: data.url, path: data.path, bucket: data.bucket,
        });
      } catch (err) {
        pushDebugLog('SmartCamera', 'restore-onUploaded-throw', {
          error: err?.message || String(err),
        });
      }
    };

    window.addEventListener(UPLOAD_COMPLETE_EVENT, tryRestore);
    tryRestore();

    return () => {
      active = false;
      window.removeEventListener(UPLOAD_COMPLETE_EVENT, tryRestore);
    };
  }, []); // mount-only — eslint-disable-line react-hooks/exhaustive-deps

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
    pushDebugLog('SmartCamera', 'file-input-onChange', {
      fileExists: !!file, source,
      fileSize: file?.size, fileName: file?.name, fileType: file?.type,
    });
    if (!file) return;

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
    // Drop any prior recovery entry so a remount during the new pick
    // doesn't restore a URL that points to the object we just deleted.
    clearPendingUploadFromSession();

    setCompressing(true);
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
      setCompressing(false);
      setSizeBefore(null);
      pushDebugLog('SmartCamera', 'compressImage-throw', {
        source, errorMessage: err?.message || String(err),
      });
      const msg = err?.message || 'שגיאה לא ידועה';
      const isHeic = String(msg).startsWith('HEIC_NOT_SUPPORTED');
      alert(isHeic
        ? msg.replace('HEIC_NOT_SUPPORTED:', '').trim()
        : 'דחיסת תמונה נכשלה: ' + msg + '\n\nנסה תמונה אחרת או JPEG.');
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
    setCompressing(false);
    setUploading(true);

    pushDebugLog('SmartCamera', 'before-uploadToStorage', {
      source, blobSize: compressedBlob.size,
    });
    let result;
    try {
      result = await uploadToStorage(compressedBlob);
    } catch (err) {
      setUploading(false);
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
      alert(
        'העלאת התמונה נכשלה.\n\n' +
        'הודעה: ' + (err?.message || 'שגיאה לא ידועה') + '\n' +
        (err?.primaryError ? 'פירוט: ' + err.primaryError : ''),
      );
      return;
    }
    pushDebugLog('SmartCamera', 'uploadToStorage-success', {
      source, url: String(result.url).slice(0, 80),
      path: result.path, bucket: result.bucket,
    });

    // CRITICAL: persist + broadcast BEFORE touching React state or
    // firing the callback. If this code path is running inside a
    // closure whose component already unmounted (Android Chrome
    // camera intent → React tree torn down mid-await), the setState
    // calls and onUploaded? below are silent no-ops on a stale tree.
    // The sessionStorage write and the window event are the only
    // signals the live tree will see.
    writePendingUploadToSession({
      url: result.url, path: result.path, bucket: result.bucket,
    });
    pushDebugLog('SmartCamera', 'upload-persisted-to-session', {
      path: result.path, bucket: result.bucket,
    });
    try {
      window.dispatchEvent(new CustomEvent(UPLOAD_COMPLETE_EVENT, {
        detail: { url: result.url, path: result.path, bucket: result.bucket },
      }));
    } catch (dispatchErr) {
      pushDebugLog('SmartCamera', 'upload-dispatch-throw', {
        error: dispatchErr?.message || String(dispatchErr),
      });
    }

    setUploadedUrl(result.url);
    setUploadedPath(result.path);
    setUploadedBucket(result.bucket);
    if (blobPreviewUrl) {
      try { URL.revokeObjectURL(blobPreviewUrl); } catch {}
    }
    setPreviewUrl(result.url);
    setUploading(false);

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
    // Clear the recovery key so a stale entry from this same upload
    // doesn't restore the photo we just removed on the next mount.
    clearPendingUploadFromSession();
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
  if (compressing) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        width: '100%', padding: 12,
        borderRadius: 10,
        border: `1px dashed ${LIFEOS_COLORS.primary}`,
        backgroundColor: '#FFF8F3', color: LIFEOS_COLORS.primary,
        fontSize: 12, fontWeight: 700,
      }}>
        <Loader2 size={14} className="animate-spin" />
        <span>דוחס תמונה...</span>
      </div>
    );
  }

  if (!previewUrl) {
    return (
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
            opacity: uploading ? 0.55 : 1,
          }}
        />
        <button
          type="button"
          onClick={handleCancel}
          aria-label="ביטול"
          disabled={uploading}
          style={{
            position: 'absolute', top: 6, left: 6,
            width: 28, height: 28, borderRadius: 999, border: 'none',
            backgroundColor: 'rgba(0,0,0,0.6)', color: '#FFFFFF',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: uploading ? 'not-allowed' : 'pointer',
            opacity: uploading ? 0.5 : 1,
          }}
        >
          <X size={14} />
        </button>
        {uploading && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255,255,255,0.5)',
            borderRadius: 8,
          }}>
            <div style={{
              background: '#FFFFFF', padding: '8px 12px', borderRadius: 8,
              border: `2px solid ${LIFEOS_COLORS.primary}`,
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 12, fontWeight: 800, color: LIFEOS_COLORS.primary,
              direction: 'rtl',
            }}>
              <Loader2 size={14} className="animate-spin" />
              <span>מעלה תמונה...</span>
            </div>
          </div>
        )}
      </div>
      {uploadedUrl && !uploading && (
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
