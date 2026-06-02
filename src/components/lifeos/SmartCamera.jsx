import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { compressImage } from '@/lib/imageCompression';
import { LIFEOS_COLORS } from '@/lib/lifeos/lifeos-constants';

// Simple receipt picker: camera button + gallery button → compress →
// upload to Supabase Storage → fire `onUploaded({ url, path, bucket })`.
// No recovery layers (no IndexedDB, no sessionStorage handoff, no
// custom-event broadcast, no full-screen overlay). If Android Chrome
// tears down the Activity mid-upload, the user re-picks. The simple
// path that always worked on desktop and most-of-the-time on mobile.

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
    throw new Error(
      'שתי הבקטות נכשלו: ' +
      (primary.error.message || 'unknown') + ' / ' +
      (fallback.error.message || 'unknown'),
    );
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
  } catch {}
}

const SmartCamera = forwardRef(function SmartCamera(
  {
    onUploaded,
    onCleared,
    onBusyChange,
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
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');

  // Notify the parent when compress+upload starts/ends so it can lock
  // the form's save button against the user-too-fast race condition
  // (clicking "שמור הוצאה" before form.receipt_url has been populated
  // by the in-flight upload).
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  useImperativeHandle(ref, () => ({
    getUploadedUrl: () => uploadedUrl,
    hasUploadedPhoto: () => !!uploadedUrl,
    clear: async () => {
      if (uploadedPath && uploadedBucket) {
        await deleteFromStorage(uploadedBucket, uploadedPath);
      }
      setPreviewUrl(null);
      setUploadedUrl(null);
      setUploadedPath(null);
      setUploadedBucket(null);
    },
  }), [uploadedUrl, uploadedPath, uploadedBucket]);

  const openCamera = () => cameraInputRef.current?.click();
  const openGallery = () => galleryInputRef.current?.click();

  const handleFileSelect = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || busy) return;

    // Replace any previous upload — delete it from Storage first so
    // we don't accumulate unused files.
    if (uploadedPath && uploadedBucket) {
      deleteFromStorage(uploadedBucket, uploadedPath);
      setUploadedUrl(null);
      setUploadedPath(null);
      setUploadedBucket(null);
    }

    setBusy(true);
    setBusyLabel('דוחס תמונה...');

    let compressedBlob;
    try {
      compressedBlob = await compressImage(file);
    } catch (err) {
      setBusy(false);
      const msg = err?.message || 'שגיאה לא ידועה';
      const isHeic = String(msg).startsWith('HEIC_NOT_SUPPORTED');
      alert(isHeic
        ? msg.replace('HEIC_NOT_SUPPORTED:', '').trim()
        : 'דחיסת תמונה נכשלה: ' + msg);
      return;
    }

    let blobPreviewUrl = null;
    try {
      blobPreviewUrl = URL.createObjectURL(compressedBlob);
      setPreviewUrl(blobPreviewUrl);
    } catch {}

    setBusyLabel('מעלה תמונה...');

    let result;
    try {
      result = await uploadToStorage(compressedBlob);
    } catch (err) {
      setBusy(false);
      if (blobPreviewUrl) {
        try { URL.revokeObjectURL(blobPreviewUrl); } catch {}
      }
      setPreviewUrl(null);
      alert('העלאת התמונה נכשלה: ' + (err?.message || 'שגיאה לא ידועה'));
      return;
    }

    setUploadedUrl(result.url);
    setUploadedPath(result.path);
    setUploadedBucket(result.bucket);
    if (blobPreviewUrl) {
      try { URL.revokeObjectURL(blobPreviewUrl); } catch {}
    }
    setPreviewUrl(result.url);
    setBusy(false);

    onUploaded?.({
      url: result.url, path: result.path, bucket: result.bucket,
      size: compressedBlob.size,
    });
  };

  const handleCancel = () => {
    if (busy) return;
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
    onCleared?.();
  };

  const hiddenInputs = (
    <>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />
    </>
  );

  // Compressing / uploading — small inline indicator.
  if (busy) {
    return (
      <>
        {hiddenInputs}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          width: '100%', padding: 12,
          borderRadius: 10,
          border: `1px dashed ${LIFEOS_COLORS.primary}`,
          backgroundColor: '#FFF8F3', color: LIFEOS_COLORS.primary,
          fontSize: 12, fontWeight: 700, direction: 'rtl',
        }}>
          <Loader2 size={14} className="animate-spin" />
          <span>{busyLabel || 'מעבד...'}</span>
        </div>
      </>
    );
  }

  // Empty state — show two picker buttons.
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

  // Has preview — show image + X to clear.
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
            aria-label="הסר תמונה"
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
