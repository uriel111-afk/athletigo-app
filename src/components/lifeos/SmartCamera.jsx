import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Camera, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import { compressImage, getFileSizeLabel } from '@/lib/imageCompression';
import { pushDebugLog } from '@/lib/debugLog';
import { savePendingBlob, loadPendingBlob } from '@/lib/blobStorage';
import { LIFEOS_COLORS } from '@/lib/lifeos/lifeos-constants';

const UPLOAD_TIMEOUT_MS = 60000; // 60s — Storage upload hard ceiling

const withTimeout = (promise, ms, label) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(
    () => reject(new Error(`${label} timed out after ${ms / 1000}s`)),
    ms,
  )),
]);

// Upload a blob to the lifeos-files bucket (falls back to the media
// bucket if the target bucket doesn't exist yet). Surfaces alerts at
// the upload layer so the user sees the failure cause directly on
// mobile, without depending on the caller's catch.
async function uploadToStorage(blob, filename) {
  console.log('[uploadToStorage] START', { blobSize: blob?.size, fileName: filename });
  const PRIMARY_BUCKET = 'lifeos-files';
  const FALLBACK_BUCKET = 'media';

  console.log('[Upload] START', {
    filename,
    blobSize: blob?.size,
    blobType: blob?.type,
    timestamp: new Date().toISOString(),
  });

  const { data: { user } = {}, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) {
    console.error('[Upload] Auth check FAILED', { userErr, user });
    alert('[Upload Auth FAILED]\n\nאין משתמש מחובר. התחבר שוב ונסה.');
    throw new Error('Not authenticated');
  }
  console.log('[Upload] user authenticated', { userId: user.id });

  // Always .jpg — compressImage always outputs image/jpeg. Using the
  // original file's extension (e.g. .heic, .png) could confuse Storage
  // content-type handling or CDN behavior even when the upload header
  // is set to image/jpeg.
  const path = `lifeos/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
  console.log('[Upload] computed path', { path });

  // ── Try primary bucket ──────────────────────────────────────
  console.log('[Upload] attempting bucket:', PRIMARY_BUCKET);
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
  console.log('[Upload] primary response', { data: primary.data, error: primary.error });

  if (!primary.error) {
    const { data: urlData } = supabase.storage.from(PRIMARY_BUCKET).getPublicUrl(path);
    const publicUrl = urlData?.publicUrl;
    if (!publicUrl) {
      const msg = '[Upload Step 2 FAILED]\n\ngetPublicUrl לא החזיר URL\n\nדלי: ' + PRIMARY_BUCKET + '\nנתיב: ' + path;
      alert(msg);
      throw new Error(msg);
    }
    console.log('[Upload] SUCCESS via', PRIMARY_BUCKET, { publicUrl });
    return publicUrl;
  }

  console.warn('[Upload]', PRIMARY_BUCKET, 'FAILED', primary.error);

  // ── Try fallback bucket ─────────────────────────────────────
  console.log('[Upload] falling back to bucket:', FALLBACK_BUCKET);
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
  console.log('[Upload] fallback response', { data: fallback.data, error: fallback.error });

  if (fallback.error) {
    const msg =
      '[Upload Step 1 FAILED]\n\n' +
      'דלי: ' + PRIMARY_BUCKET + ', ' + FALLBACK_BUCKET + '\n' +
      'נתיב: ' + path + '\n\n' +
      PRIMARY_BUCKET + ' error: ' + (primary.error.message || 'unknown') + '\n' +
      FALLBACK_BUCKET + ' error: ' + (fallback.error.message || 'unknown') + '\n\n' +
      'קוד: ' + (fallback.error.statusCode || fallback.error.code || primary.error.statusCode || primary.error.code || 'אין');
    console.error('[Upload] BOTH BUCKETS FAILED', { primary: primary.error, fallback: fallback.error });
    alert(msg);
    const err = new Error(msg);
    err.bucketAttempted = PRIMARY_BUCKET + ', ' + FALLBACK_BUCKET;
    err.path = path;
    err.primaryError = primary.error.message;
    err.fallbackError = fallback.error.message;
    err.alertShown = true; // signal to caller: don't double-alert
    throw err;
  }

  const { data: urlData } = supabase.storage.from(FALLBACK_BUCKET).getPublicUrl(path);
  const publicUrl = urlData?.publicUrl;
  if (!publicUrl) {
    const msg = '[Upload Step 2 FAILED]\n\ngetPublicUrl לא החזיר URL\n\nדלי: ' + FALLBACK_BUCKET + '\nנתיב: ' + path;
    alert(msg);
    throw new Error(msg);
  }
  console.log('[Upload] SUCCESS via', FALLBACK_BUCKET, '(fallback)', { publicUrl });
  return publicUrl;
}

// UI: shutter button → native camera → preview → upload.
const SmartCamera = forwardRef(function SmartCamera(
  {
    label = 'צלם קבלה',
    onUploaded,
    onPhotoCaptured,
    onCompressionDone,
    compact = false,
    deferredUpload = false,
  },
  ref,
) {
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [blob, setBlob] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [sizeBefore, setSizeBefore] = useState(null);
  const [sizeAfter, setSizeAfter] = useState(null);

  // Mount/unmount marker — separate from the IDB-restore effect so we
  // can detect races where SmartCamera unmounts (e.g. dialog closes
  // briefly) before the async IDB load resolves.
  useEffect(() => {
    pushDebugLog('SmartCamera', 'mount', { deferredUpload: !!deferredUpload });
    return () => { pushDebugLog('SmartCamera', 'unmount'); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Restore a persisted blob (if any) from IndexedDB on mount. This is
  // the recovery side of the savePendingBlob call inside
  // handleFileSelect: if the Activity/WebView was destroyed during
  // the file picker and the React tree re-mounts, the photo state
  // gets rehydrated here so the user doesn't have to re-pick it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const persisted = await loadPendingBlob();
      if (cancelled) {
        // Unmounted while IDB load was in flight. The blob may or may
        // not have existed — what matters is the consumer is gone.
        pushDebugLog('SmartCamera', 'idb-load-cancelled', {
          hadBlob: !!persisted?.blob,
          size: persisted?.blob?.size,
        });
        return;
      }
      if (!persisted?.blob) {
        if (persisted) pushDebugLog('SmartCamera', 'idb-load-stale-or-empty');
        return;
      }
      pushDebugLog('SmartCamera', 'idb-restored', {
        size: persisted.blob.size,
        type: persisted.blob.type,
        savedAt: persisted.savedAt,
      });
      setBlob(persisted.blob);
      setSizeBefore(persisted.blob.size);
      setSizeAfter(persisted.blob.size);
      const restoredPreviewUrl = URL.createObjectURL(persisted.blob);
      setPreview(restoredPreviewUrl);
      pushDebugLog('SmartCamera', 'idb-preview-set', {
        url: restoredPreviewUrl,
        size: persisted.blob.size,
      });
      if (deferredUpload) {
        onPhotoCaptured?.(persisted.blob, persisted.filename || 'photo.jpg');
        pushDebugLog('SmartCamera', 'idb-onPhotoCaptured-fired', { size: persisted.blob.size });
      }
    })();
    return () => { cancelled = true; };
  }, []); // mount only — eslint-disable-line react-hooks/exhaustive-deps

  useImperativeHandle(ref, () => ({
    uploadNow: async () => {
      pushDebugLog('SmartCamera', 'uploadNow-entry', { hasBlob: !!blob, blobSize: blob?.size });
      console.log('[uploadNow] START', { hasBlob: !!blob });
      if (!blob) {
        console.warn('[SmartCamera] uploadNow called with no blob');
        pushDebugLog('SmartCamera', 'uploadNow-no-blob');
        alert('[uploadNow] אין blob — לא נבחרה תמונה.');
        return null;
      }
      console.log('[SmartCamera] uploadNow invoked by parent', { size: blob.size, type: blob.type });
      setUploading(true);
      try {
        console.log('[uploadNow] calling uploadToStorage...');
        const url = await uploadToStorage(blob, 'photo.jpg');
        console.log('[SmartCamera] uploadNow returned URL', { url });
        pushDebugLog('SmartCamera', 'uploadNow-returned-internal', {
          urlLength: url?.length || 0, hasUrl: !!url,
        });
        if (!url) {
          alert('[uploadNow] uploadToStorage החזיר URL ריק');
        }
        return url;
      } catch (err) {
        pushDebugLog('SmartCamera', 'uploadNow-thrown-internal', {
          errorMessage: err?.message || String(err),
          errorName: err?.name || 'Error',
        });
        // Defensive: alert here only if uploadToStorage didn't already
        // surface its own alert (alertShown flag set on thrown error).
        if (!err?.alertShown) {
          alert(
            '[uploadNow CAUGHT]\n\n' +
            'הודעה: ' + (err?.message || 'אין הודעה') + '\n' +
            'סוג: ' + (err?.name || 'Error') + '\n' +
            (err?.stack ? '\n' + String(err.stack).split('\n').slice(0, 3).join('\n') : '')
          );
        }
        throw err;
      } finally {
        setUploading(false);
      }
    },
    hasPendingPhoto: () => !!blob,
    clear: () => {
      setPreview(null);
      setBlob(null);
    },
  }), [blob]);

  const openCamera = () => cameraInputRef.current?.click();
  const openGallery = () => galleryInputRef.current?.click();

  const handleFileSelect = async (event, source) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    pushDebugLog('SmartCamera', 'file-input-onChange', {
      fileExists: !!file,
      source,
      fileSize: file?.size,
      fileName: file?.name,
      fileType: file?.type,
    });
    if (!file) {
      pushDebugLog('SmartCamera', 'handleFileSelect-no-file', { source });
      return;
    }

    console.log('[SmartCamera] original file:', { source, size: file.size, name: file.name, type: file.type });

    if (file.size > 5 * 1024 * 1024) {
      pushDebugLog('SmartCamera', 'oversize-warning', { source, size: file.size });
      alert('התמונה גדולה מ-5 מגה. הקמפרסיה עלולה להיות איטה.');
    }

    setCompressing(true);
    setSizeBefore(file.size);
    setSizeAfter(null);
    pushDebugLog('SmartCamera', 'before-compressImage', {
      source, fileSize: file.size, fileType: file.type, fileName: file.name,
    });
    let compressedBlob;
    try {
      const originalSize = file.size;
      try {
        compressedBlob = await compressImage(file);
      } catch (compErr) {
        pushDebugLog('SmartCamera', 'compressImage-throw', {
          source, errorMessage: compErr?.message || String(compErr),
        });
        throw compErr;
      }
      const compressedSize = compressedBlob.size;
      const ratioPct = ((1 - compressedSize / originalSize) * 100).toFixed(0);
      const twoPass = !!compressedBlob.twoPass;

      console.log('[SmartCamera] compressed:', {
        original: getFileSizeLabel(originalSize),
        compressed: getFileSizeLabel(compressedSize),
        ratio: ratioPct + '%',
        outputType: compressedBlob.type,
        twoPass,
      });
      pushDebugLog('SmartCamera', 'compressImage-result', {
        source, originalSize, compressedSize,
        compressedType: compressedBlob.type, ratioPct, twoPass,
      });

      // Soft ceiling — compressImage already runs a second pass at >1MB,
      // so this should be rare. If it fires, the source was likely a
      // very high-resolution photo that even the strict preset
      // couldn't squeeze under. Surface it so we know.
      if (compressedSize > 1024 * 1024) {
        console.warn('[SmartCamera] compressed blob still > 1MB', { compressedSize });
        pushDebugLog('SmartCamera', 'compression-output-large', { source, compressedSize });
      }

      // Compressed blobs from canvas.toBlob('image/jpeg', q) always
      // have type 'image/jpeg'. Defensive check in case the contract
      // changes.
      if (compressedBlob.type !== 'image/jpeg') {
        pushDebugLog('SmartCamera', 'unexpected-blob-type', { source, type: compressedBlob.type });
      }

      // Persist BEFORE setState. Android Chrome / iOS PWA may destroy
      // the Activity / WebView during the file picker intent — the
      // setState calls below would then run on a defunct fiber and
      // their result would never reach the re-mounted tree. IndexedDB
      // survives the destruction and is replayed by the mount-restore
      // effect (below) on the next render.
      pushDebugLog('SmartCamera', 'before-savePendingBlob', { source, blobSize: compressedSize });
      let persisted = false;
      let persistErrMsg = null;
      try {
        persisted = await savePendingBlob(compressedBlob, 'photo.jpg');
      } catch (persistErr) {
        persistErrMsg = persistErr?.message || String(persistErr);
      }
      pushDebugLog('SmartCamera', 'savePendingBlob-result', {
        source, success: !!persisted, error: persistErrMsg,
      });

      pushDebugLog('SmartCamera', 'before-setBlob', { source, blobSize: compressedSize });
      setBlob(compressedBlob);
      setSizeAfter(compressedSize);
      pushDebugLog('SmartCamera', 'setBlob-done', { source });

      let newPreviewUrl = null;
      try {
        newPreviewUrl = URL.createObjectURL(compressedBlob);
      } catch (urlErr) {
        pushDebugLog('SmartCamera', 'createObjectURL-throw', {
          source, errorMessage: urlErr?.message || String(urlErr),
        });
      }
      pushDebugLog('SmartCamera', 'before-setPreview', {
        source, previewUrlGenerated: !!newPreviewUrl,
      });
      setPreview(newPreviewUrl);
      pushDebugLog('SmartCamera', 'setPreview-done', {
        source, url: newPreviewUrl, size: compressedSize,
      });

      pushDebugLog('SmartCamera', 'before-onPhotoCaptured', {
        source, hasCallback: typeof onPhotoCaptured === 'function', deferred: !!deferredUpload,
      });
      if (deferredUpload) {
        onPhotoCaptured?.(compressedBlob, 'photo.jpg');
        pushDebugLog('SmartCamera', 'onPhotoCaptured-done', { source, size: compressedSize });
      } else {
        pushDebugLog('SmartCamera', 'onPhotoCaptured-skipped-not-deferred', { source });
      }
      onCompressionDone?.({ originalSize, compressedSize, ratio: ratioPct });
    } catch (err) {
      console.error('[SmartCamera] compression error:', err);
      pushDebugLog('SmartCamera', 'compression-error', {
        source, message: err?.message || String(err),
      });
      // Removed silent fallback to original file: re-uploading raw
      // bytes labelled image/jpeg (especially HEIC from iOS gallery)
      // produced unreadable receipts in the Expenses list. Now we
      // surface the error and clear state so the user picks again.
      const message = err?.message || 'שגיאה לא ידועה';
      const isHeic = String(message).startsWith('HEIC_NOT_SUPPORTED');
      alert(isHeic
        ? message.replace('HEIC_NOT_SUPPORTED:', '').trim()
        : 'דחיסת תמונה נכשלה: ' + message + '\n\nנסה תמונה אחרת או JPEG.');
      setBlob(null);
      setSizeBefore(null);
      setSizeAfter(null);
      setPreview(null);
      if (deferredUpload) {
        onPhotoCaptured?.(null, null);
      }
    } finally {
      setCompressing(false);
      pushDebugLog('SmartCamera', 'handleFileSelect-end', { source });
    }
  };

  // Per-source change handlers — let the debug log distinguish which
  // input fired (gallery vs. camera) since they share the same pipeline.
  const handleCameraChange = (event) => handleFileSelect(event, 'camera');
  const handleGalleryChange = (event) => handleFileSelect(event, 'gallery');

  const handleConfirm = async () => {
    if (!blob) {
      console.warn('[SmartCamera] handleConfirm called with no blob');
      return;
    }
    setUploading(true);
    console.log('[SmartCamera] Calling uploadToStorage with blob', { size: blob.size, type: blob.type });
    try {
      const url = await uploadToStorage(blob, 'photo.jpg');
      console.log('[SmartCamera] uploadToStorage returned URL', { url });
      toast.success('הועלה');
      onUploaded?.({ url, size: blob.size });
      console.log('[SmartCamera] onUploaded callback fired', { url });
      setPreview(null);
      setBlob(null);
    } catch (err) {
      console.error('[SmartCamera] Upload pipeline crashed', { err, message: err?.message, statusCode: err?.statusCode });
      toast.error('שגיאה בהעלאה: ' + (err?.message || 'שגיאה לא ידועה'));
      alert(`העלאה נכשלה: ${err?.message || 'שגיאה לא ידועה'}`);
    } finally {
      setUploading(false);
    }
  };

  const handleCancel = () => {
    console.log('[SmartCamera] handleCancel — clearing preview only (parent form remains open)');
    pushDebugLog('SmartCamera', 'handleCancel-tapped', {
      hadBlob: !!blob,
      blobSize: blob?.size,
    });
    setPreview(null);
    setBlob(null);
    setSizeBefore(null);
    setSizeAfter(null);
    if (deferredUpload) {
      onPhotoCaptured?.(null, null);
    }
  };

  return (
    <>
      {/* Two hidden inputs — camera (with capture) and gallery (without).
          Both feed the same handleFileSelect → compression → upload pipeline. */}
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
      {compressing ? (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          width: '100%', padding: '12px',
          borderRadius: 10,
          border: `1px dashed ${LIFEOS_COLORS.primary}`,
          backgroundColor: '#FFF8F3', color: LIFEOS_COLORS.primary,
          fontSize: 12, fontWeight: 700,
        }}>
          <Loader2 size={14} className="animate-spin" />
          <span>דוחס תמונה...</span>
        </div>
      ) : !preview ? (
        <div style={{ display: 'flex', gap: 8, width: '100%' }} dir="rtl">
          <button
            type="button"
            onClick={openCamera}
            style={{
              flex: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: compact ? '8px 10px' : '12px 14px',
              borderRadius: 10,
              border: `1px dashed ${LIFEOS_COLORS.primary}`,
              backgroundColor: '#FFF8F3', color: LIFEOS_COLORS.primary,
              fontSize: compact ? 12 : 14, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'inherit',
            }}
            aria-label="צלם קבלה"
          >
            <span style={{ fontSize: compact ? 14 : 18, lineHeight: 1 }}>📷</span>
            <span>צלם</span>
          </button>
          <button
            type="button"
            onClick={openGallery}
            style={{
              flex: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: compact ? '8px 10px' : '12px 14px',
              borderRadius: 10,
              border: `1px dashed ${LIFEOS_COLORS.primary}`,
              backgroundColor: '#FFF8F3', color: LIFEOS_COLORS.primary,
              fontSize: compact ? 12 : 14, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'inherit',
            }}
            aria-label="בחר מהגלריה"
          >
            <span style={{ fontSize: compact ? 14 : 18, lineHeight: 1 }}>🖼️</span>
            <span>גלריה</span>
          </button>
        </div>
      ) : (
        <div style={{
          border: `1px solid ${LIFEOS_COLORS.border}`, borderRadius: 12, padding: 8,
        }}>
          <div style={{ position: 'relative' }}>
            <img src={preview} alt="preview" style={{
              width: '100%', maxHeight: 220, objectFit: 'contain', borderRadius: 8,
              display: 'block',
            }} />
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
          {blob && (
            <div style={{
              marginTop: 8, fontSize: 12, color: '#888',
              textAlign: 'center', direction: 'rtl',
            }}>
              📎 תמונה מצורפת ({Math.round(blob.size / 1024)} KB)
            </div>
          )}
          {!deferredUpload && (
            <button
              type="button"
              onClick={handleConfirm}
              disabled={uploading}
              style={{
                width: '100%', marginTop: 8, padding: '10px 14px', borderRadius: 10,
                border: 'none', backgroundColor: LIFEOS_COLORS.primary, color: '#FFFFFF',
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}
            >
              {uploading ? <Loader2 size={18} className="animate-spin" style={{ margin: '0 auto' }} /> : 'שמור תמונה'}
            </button>
          )}
          {(sizeBefore && sizeAfter) && (
            <div style={{
              fontSize: '11px', color: '#6b7280', textAlign: 'center',
              padding: '6px', background: '#FAFAFA',
              borderRadius: '6px', marginTop: '8px',
            }}>
              {sizeBefore !== sizeAfter ? (
                <>
                  {(sizeBefore / 1024).toFixed(0)} KB ← {(sizeAfter / 1024).toFixed(0)} KB
                  {' · '}
                  <span style={{ color: '#16A34A', fontWeight: 700 }}>
                    נחסך {(((sizeBefore - sizeAfter) / sizeBefore) * 100).toFixed(0)}%
                  </span>
                  {deferredUpload ? ' · תועלה בשמירה' : ''}
                </>
              ) : (
                <span>{(sizeAfter / 1024).toFixed(0)} KB{deferredUpload ? ' · תועלה בשמירה' : ''}</span>
              )}
            </div>
          )}
          {uploading && (
            <div style={{
              background: '#FFF5EE', border: '2px solid #FFD0AC',
              borderRadius: '10px', padding: '12px',
              textAlign: 'center', margin: '10px 0',
            }}>
              <div style={{ fontSize: '13px', color: '#993C1D', fontWeight: 800, marginBottom: '4px' }}>
                מעלה תמונה...
              </div>
              <div style={{ fontSize: '10px', color: '#6b7280' }}>
                {sizeAfter ? `${(sizeAfter / 1024).toFixed(0)} KB — אנא המתן` : 'אנא המתן'}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
});

export default SmartCamera;
